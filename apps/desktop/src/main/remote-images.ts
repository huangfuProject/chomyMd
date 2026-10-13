import { ChomyError } from "@chomy/contracts";
import { isIP } from "node:net";
export class RemoteImages {
  private active = 0;
  constructor(
    private fetchImage: (
      input: string,
      init?: RequestInit,
    ) => Promise<Response>,
  ) {}
  async load(source: string) {
    const url = new URL(source);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (
      source.length > 4096 ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      isIP(host) ||
      host === "localhost" ||
      host.endsWith(".local")
    )
      throw new ChomyError("IMAGE_URL", "远程图片仅支持公共 HTTPS 地址。");
    if (this.active >= 4)
      throw new ChomyError("IMAGE_BUSY", "图片并发请求过多，请重新打开预览。");
    this.active++;
    try {
      const response = await this.fetchImage(url.href, {
        signal: AbortSignal.timeout(15000),
        credentials: "omit",
        redirect: "error",
      });
      const mime = (response.headers.get("content-type") ?? "")
        .split(";")[0]
        ?.trim();
      if (
        !response.ok ||
        !mime ||
        ![
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
          "image/svg+xml",
        ].includes(mime)
      ) {
        await response.body?.cancel();
        throw new ChomyError("IMAGE_TYPE", "远程图片返回无效内容。");
      }
      const max = 20 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > max) {
        await response.body?.cancel();
        throw new ChomyError("IMAGE_SIZE", "远程图片不能超过 20 MB。");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ChomyError("IMAGE_EMPTY", "远程图片为空。");
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > max) {
            await reader.cancel();
            throw new ChomyError("IMAGE_SIZE", "远程图片不能超过 20 MB。");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      return { mime, bytes: Buffer.concat(chunks, total) };
    } finally {
      this.active--;
    }
  }
}
