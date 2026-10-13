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
