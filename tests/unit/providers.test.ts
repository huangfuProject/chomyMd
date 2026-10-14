import { describe, it, expect } from "vitest";
import http from "node:http";
import { createHmac } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import OSS from "ali-oss";
import {
  QiniuProvider,
  S3Provider,
  AliyunProvider,
} from "../../apps/desktop/src/main/providers";
import { Assets } from "../../apps/desktop/src/main/assets";
import { Documents } from "../../apps/desktop/src/main/documents";
import { PreferencesService } from "../../apps/desktop/src/main/preferences";
import type { CloudConfig } from "../../packages/contracts/src";
describe("storage adapters using a local protocol test server", () => {
  it("signs Qiniu listing and scoped multipart upload, preserves binary bytes and supports failure/cancel", async () => {
    const safe = (value: string) =>
      value.replace(/\+/g, "-").replace(/\//g, "_");
    const signature = (value: string) =>
      safe(createHmac("sha1", "test-secret").update(value).digest("base64"));
    let listed = false;
    let uploaded = false;
    let deny = false;
    let failure: unknown;
    const bytes = Buffer.from([0, 1, 127, 128, 255]);
    const key = "中文/file.png";
    const server = http.createServer(async (request, response) => {
      try {
        if (request.method === "GET") {
          expect(request.url).toBe("/list?bucket=fixture&limit=1");
          expect(request.headers.authorization).toBe(
            `QBox test-access:${signature(request.url + "\n")}`,
          );
          listed = true;
        } else {
          const parts: Buffer[] = [];
          for await (const part of request) parts.push(Buffer.from(part));
          const form = await new Response(Buffer.concat(parts), {
            headers: {
              "Content-Type": String(request.headers["content-type"]),
            },
          }).formData();
          expect(form.get("key")).toBe(key);
          const [access, signed, policy] = String(form.get("token")).split(":");
          expect(access).toBe("test-access");
          expect(signed).toBe(signature(policy!));
          const decoded = JSON.parse(
            Buffer.from(policy!, "base64url").toString(),
          );
          expect(decoded.scope).toBe(`fixture:${key}`);
          expect(decoded.insertOnly).toBe(1);
          expect(decoded.deadline).toBeGreaterThan(Date.now() / 1000);
          const file = form.get("file") as File;
          expect(file.type).toBe("image/png");
          expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
          uploaded = true;
        }
      } catch (error) {
        failure = error;
      }
      response.statusCode = deny ? 403 : 200;
      response.end(
        JSON.stringify(deny ? { error: "denied" } : { key, hash: "fixture" }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const provider = new QiniuProvider(
      {
        provider: "qiniu",
        bucket: "fixture",
        region: "z0",
        endpoint: `http://127.0.0.1:${address.port}`,
        publicUrl: "https://cdn.example.test",
        prefix: "chomy",
        pathStyle: false,
      },
      { accessKey: "test-access", secret: "test-secret" },
    );
    try {
      await provider.test();
      expect(
        await provider.upload(
          key,
          bytes,
          "image/png",
          new AbortController().signal,
        ),
      ).toBe("https://cdn.example.test/%E4%B8%AD%E6%96%87/file.png");
      expect(failure).toBeUndefined();
      expect(listed && uploaded).toBe(true);
      deny = true;
      await expect(
        provider.upload(key, bytes, "image/png", new AbortController().signal),
      ).rejects.toThrow("QINIU_UPLOAD_FAILED");
      await expect(provider.test()).rejects.toThrow("QINIU_CONNECTION_FAILED");
      const controller = new AbortController();
      controller.abort();
      await expect(
        provider.upload(key, bytes, "image/png", controller.signal),
      ).rejects.toThrow();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("sends actual signed S3 requests, retains bytes and reports server failures", async () => {
    let received = Buffer.alloc(0);
    let authorized = false;
    let deny = false;
    const server = http.createServer(async (request, response) => {
      authorized = Boolean(request.headers.authorization);
      for await (const chunk of request)
        received = Buffer.concat([received, Buffer.from(chunk)]);
      response.statusCode = deny ? 403 : 200;
      response.setHeader("ETag", '"test-etag"');
      response.end(
        deny
          ? "<Error><Code>AccessDenied</Code><Message>denied</Message></Error>"
          : "",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const config: CloudConfig = {
      provider: "s3",
      bucket: "fixture",
      region: "us-east-1",
      endpoint: `http://127.0.0.1:${address.port}`,
      publicUrl: "https://cdn.example.test",
      prefix: "chomy",
      pathStyle: true,
    };
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: "test-access",
        secretAccessKey: "test-secret",
      },
      maxAttempts: 1,
    });
    try {
      const provider = new S3Provider(config, client);
      await provider.test();
      const result = await provider.upload(
        "中文/file.txt",
        Buffer.from("fixture bytes"),
        "text/plain",
        new AbortController().signal,
      );
      expect(result).toContain("%E4%B8%AD%E6%96%87/file.txt");
      expect(received.toString()).toBe("fixture bytes");
      expect(authorized).toBe(true);
      deny = true;
      await expect(
        provider.upload(
          "retry.txt",
          Buffer.from("still local"),
          "text/plain",
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    } finally {
      client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("sends actual Aliyun OSS signed listing/upload requests", async () => {
    let body = "";
    const server = http.createServer(async (request, response) => {
      for await (const chunk of request) body += chunk.toString();
      response.setHeader("Content-Type", "application/xml");
      response.setHeader("ETag", '"fixture-etag"');
      response.end(
        request.method === "GET"
          ? "<ListBucketResult><Name>fixture</Name><Prefix></Prefix><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>"
          : "",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const config: CloudConfig = {
      provider: "aliyun",
      bucket: "fixture",
      region: "oss-cn-hangzhou",
      endpoint: `http://127.0.0.1:${address.port}`,
      publicUrl: "https://cdn.example.test",
      prefix: "chomy",
      pathStyle: false,
    };
    const client = new OSS({
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      accessKeyId: "test-access",
      accessKeySecret: "test-secret",
      cname: true,
      secure: false,
      timeout: 3000,
    });
    try {
      const provider = new AliyunProvider(config, client);
      await provider.test();
      expect(
        await provider.upload(
          "test.txt",
          Buffer.from("ali fixture"),
          "text/plain",
          new AbortController().signal,
        ),
      ).toBe("https://cdn.example.test/test.txt");
      expect(body).toBe("ali fixture");
    } finally {
      client.cancel();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("keeps local sources and copied attachments on upload failure", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-assets-"));
    try {
      const docs = new Documents(path.join(directory, "data"));
      await docs.initialize();
      const current = docs.snapshot;
      await docs.update(current.id, "document", 1);
      await docs.save(path.join(directory, "doc.md"));
      const prefs = new PreferencesService(path.join(directory, "data"));
      await prefs.initialize();
      prefs.preferences.assetMode = "cloud";
      prefs.cloud = {
        provider: "s3",
        bucket: "fixture",
        region: "test",
        endpoint: "",
        publicUrl: "https://cdn.example.test",
        prefix: "test",
        pathStyle: true,
      };
      let offline = true;
      const assets = new Assets(docs, prefs, {
        upload: async () => {
          if (offline) throw new Error("offline");
          return "https://cdn.example.test/retried.png";
        },
      });
      const source = path.join(directory, "source.png");
      await fs.writeFile(source, "source bytes");
      await expect(assets.insert(source)).rejects.toThrow("offline");
      expect(await fs.readFile(source, "utf8")).toBe("source bytes");
      const copies = await fs.readdir(path.join(directory, "assets"));
      expect(copies).toHaveLength(1);
      expect(
        await fs.readFile(path.join(directory, "assets", copies[0]!), "utf8"),
      ).toBe("source bytes");
      expect(docs.snapshot.markdown).toBe("document");
      offline = false;
      expect((await assets.retry()).markdown).toContain(
        "https://cdn.example.test/retried.png",
      );
      expect(await fs.readdir(path.join(directory, "assets"))).toHaveLength(1);
      expect(docs.snapshot.markdown).toBe("document");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
