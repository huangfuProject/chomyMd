import { createHmac } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import OSS from "ali-oss";
import type { CloudConfig } from "@chomy/contracts";
import { objectUrl, type StorageProvider } from "@chomy/storage-core";
export class S3Provider implements StorageProvider {
  constructor(
    private config: CloudConfig,
    private client: S3Client,
  ) {}
  async test() {
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.config.bucket }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
  }
  async upload(
    key: string,
    bytes: Buffer,
    contentType: string,
    signal: AbortSignal,
  ) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
      { abortSignal: signal },
    );
    return objectUrl(this.config, key);
  }
}
export class AliyunProvider implements StorageProvider {
  constructor(
    private config: CloudConfig,
    private client: OSS,
  ) {}
  async test() {
    await this.client.listV2({ "max-keys": 1 }, {});
  }
  async upload(
    key: string,
    bytes: Buffer,
    contentType: string,
    signal: AbortSignal,
  ) {
    const cancel = () => this.client.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) throw new Error("UPLOAD_CANCELLED");
      await this.client.put(key, bytes, {
        headers: { "Content-Type": contentType },
      });
      return objectUrl(this.config, key);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
}

// Qiniu uses URL-safe base64 with padding (distinct from Node's base64url).
function qiniuBase64(bytes: Buffer) {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}
export class QiniuProvider implements StorageProvider {
  constructor(
    private config: CloudConfig,
    private credentials: { accessKey: string; secret: string },
  ) {}
  private sign(value: string) {
    return qiniuBase64(
      createHmac("sha1", this.credentials.secret).update(value).digest(),
    );
  }
  async test() {
    const url = new URL(
      `/list?bucket=${encodeURIComponent(this.config.bucket)}&limit=1`,
      `https://rsf-${this.config.region}.qiniuapi.com`,
    );
    // An explicit local endpoint enables protocol fixtures without contacting Qiniu.
    if (
      this.config.endpoint &&
      new URL(this.config.endpoint).protocol === "http:"
    ) {
      url.host = new URL(this.config.endpoint).host;
      url.protocol = "http:";
    }
    const response = await fetch(url, {
      headers: {
        Authorization: `QBox ${this.credentials.accessKey}:${this.sign(url.pathname + url.search + "\n")}`,
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("QINIU_CONNECTION_FAILED");
  }
  async upload(
    key: string,
    bytes: Buffer,
    contentType: string,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const policy = qiniuBase64(
      Buffer.from(
        JSON.stringify({
          scope: `${this.config.bucket}:${key}`,
          deadline: Math.floor(Date.now() / 1000) + 3600,
          insertOnly: 1,
        }),
      ),
    );
    const token = `${this.credentials.accessKey}:${this.sign(policy)}:${policy}`;
    const body = new FormData();
    body.set("key", key);
    body.set("token", token);
    body.set(
      "file",
      new Blob([new Uint8Array(bytes)], { type: contentType }),
      key.split("/").at(-1) ?? "attachment",
    );
    const response = await fetch(
      this.config.endpoint || `https://up-${this.config.region}.qiniup.com`,
      { method: "POST", body, signal, redirect: "error" },
    );
    // The standard response contains key/hash; no server-controlled URL is trusted.
    await response.body?.cancel();
    if (!response.ok) throw new Error("QINIU_UPLOAD_FAILED");
    return objectUrl(this.config, key);
  }
}
