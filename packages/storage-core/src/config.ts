import { ChomyError, type CloudConfig } from "@chomy/contracts";
export interface StorageProvider {
  test(): Promise<void>;
  upload(
    key: string,
    bytes: Buffer,
    contentType: string,
    signal: AbortSignal,
  ): Promise<string>;
}
export function validateCloud(config: CloudConfig) {
  if (
    config.prefix.includes("..") ||
    Array.from(config.prefix).some((char) => char.charCodeAt(0) < 32) ||
    /[\\]/.test(config.prefix)
  )
    throw new ChomyError(
      "CLOUD_PREFIX",
      "对象前缀不能包含上级目录或控制字符。",
    );
  const publicUrl = new URL(config.publicUrl);
  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new ChomyError(
      "CLOUD_PUBLIC_URL",
      "请配置 HTTPS 公共桶 / CDN 地址。私有临时签名 URL 不适合写入长期文档。",
    );
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    if (
      endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
      )
    )
      throw new ChomyError(
        "CLOUD_ENDPOINT",
        "云端 Endpoint 必须为 HTTPS；HTTP 仅允许本机 MinIO 测试。",
      );
    if (endpoint.username || endpoint.password)
      throw new ChomyError("CLOUD_ENDPOINT", "Endpoint 不能包含凭据。");
  }
}
export function objectUrl(config: CloudConfig, key: string) {
  return (
    config.publicUrl.replace(/\/$/, "") +
    "/" +
    key.split("/").map(encodeURIComponent).join("/")
  );
}
