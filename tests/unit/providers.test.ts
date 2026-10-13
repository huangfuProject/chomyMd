import { describe, it, expect } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import OSS from "ali-oss";
import {
  S3Provider,
  AliyunProvider,
} from "../../apps/desktop/src/main/providers";
import { Assets } from "../../apps/desktop/src/main/assets";
import { Documents } from "../../apps/desktop/src/main/documents";
import { PreferencesService } from "../../apps/desktop/src/main/preferences";
import type { CloudConfig } from "../../packages/contracts/src";
describe("storage adapters using a local protocol test server", () => {
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
