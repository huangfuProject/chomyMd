import fs from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import { S3Client } from "@aws-sdk/client-s3";
import OSS from "ali-oss";
import { S3Provider, AliyunProvider } from "./providers";
import { z } from "zod";
import {
  ChomyError,
  type UploadStatus,
  type CloudConfig,
} from "@chomy/contracts";
import { atomicWrite } from "@chomy/document-core";
import { validateCloud, type StorageProvider } from "@chomy/storage-core";
const credentialsSchema = z.object({
  accessKey: z.string(),
  secret: z.string(),
});
export class CloudService {
  status: UploadStatus = null;
  private controller: AbortController | null = null;
  constructor(private directory: string) {}
  async save(config: CloudConfig, accessKey: string, secret: string) {
    validateCloud(config);
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw new ChomyError(
        "KEYCHAIN",
        "操作系统安全存储不可用，未保存云凭据。",
      );
    await atomicWrite(
      path.join(this.directory, "cloud-credentials.bin"),
      safeStorage.encryptString(JSON.stringify({ accessKey, secret })),
    );
  }
  async provider(config: CloudConfig): Promise<StorageProvider> {
    validateCloud(config);
    if (!safeStorage.isEncryptionAvailable())
      throw new ChomyError("KEYCHAIN", "操作系统安全存储不可用。");
    const credentials = credentialsSchema.parse(
      JSON.parse(
        safeStorage.decryptString(
          await fs.readFile(path.join(this.directory, "cloud-credentials.bin")),
        ),
      ),
    );
    return config.provider === "s3"
      ? new S3Provider(
          config,
          new S3Client({
            region: config.region,
            ...(config.endpoint ? { endpoint: config.endpoint } : {}),
            forcePathStyle: config.pathStyle,
            credentials: {
              accessKeyId: credentials.accessKey,
              secretAccessKey: credentials.secret,
            },
            maxAttempts: 2,
          }),
        )
      : new AliyunProvider(
          config,
          new OSS({
            region: config.region,
            bucket: config.bucket,
            accessKeyId: credentials.accessKey,
            accessKeySecret: credentials.secret,
            ...(config.endpoint ? { endpoint: config.endpoint } : {}),
            secure: true,
            timeout: 30000,
          }),
        );
  }
  async test(config: CloudConfig) {
    try {
      await (await this.provider(config)).test();
      return "连接成功";
    } catch (error) {
      if (error instanceof ChomyError) throw error;
      throw new ChomyError(
        "CLOUD_CONNECTION",
        "云存储连接失败，请检查配置、权限和网络。",
      );
    }
  }
  async upload(config: CloudConfig, key: string, bytes: Buffer, mime: string) {
    if (this.controller)
      throw new ChomyError("UPLOAD_BUSY", "已有附件正在上传，请等待或取消。");
    const controller = new AbortController();
    this.controller = controller;
    this.status = { state: "queued", total: bytes.length };
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const provider = await this.provider(config);
      this.status = { state: "uploading", total: bytes.length };
      const url = await provider.upload(key, bytes, mime, controller.signal);
      if (controller.signal.aborted)
        throw new ChomyError(
          "UPLOAD_CANCELLED",
          "上传已取消；本地副本仍保留。",
        );
      this.status = { state: "succeeded", total: bytes.length };
      return url;
    } catch (error) {
      this.status = {
        state: controller.signal.aborted ? "canceled" : "failed",
        total: bytes.length,
      };
      if (error instanceof ChomyError) throw error;
      throw new ChomyError(
        controller.signal.aborted ? "UPLOAD_CANCELLED" : "UPLOAD_FAILED",
        "上传失败或已取消；原始附件及本地副本仍保留，可重新插入重试。",
      );
    } finally {
      clearTimeout(timer);
      this.controller = null;
    }
  }
  cancel() {
    this.controller?.abort();
  }
}
