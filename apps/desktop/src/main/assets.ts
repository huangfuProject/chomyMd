import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ChomyError } from "@chomy/contracts";
import type { Documents } from "./documents";
import type { PreferencesService } from "./preferences";
import type { CloudService } from "./cloud";
const imageExtensions = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);
export function safeFilename(name: string) {
  return (
    Array.from(name)
      .map((char) => (char.charCodeAt(0) < 32 ? "_" : char))
      .join("")
      .replace(/[\\/<>:"|?*]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 120) || "attachment"
  );
}
export class Assets {
  private pending: {
    id: string;
    path: string;
    name: string;
    key: string;
    mime: string;
  } | null = null;
  constructor(
    private documents: Documents,
    private preferences: PreferencesService,
    private cloud: Pick<CloudService, "upload">,
  ) {}
  async insert(filename: string) {
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
      throw new ChomyError("ASSET_SIZE", "附件必须小于 20 MB。");
    if (this.preferences.preferences.assetMode === "reference") {
      const url = await this.documents.referenceAsset(filename);
      return this.result(
        path.basename(filename),
        url,
        this.documents.snapshot.id,
      );
    }
    return this.store(await fs.readFile(filename), path.basename(filename));
  }
  async store(bytes: Buffer, name: string) {
    const id = this.documents.snapshot.id;
    const directory = await this.documents.assetRoot();
    const safe = `${randomUUID()}-${safeFilename(name)}`;
    await fs.writeFile(path.join(directory, safe), bytes, { flag: "wx" });
    const mime =
      imageExtensions.get(path.extname(name).toLowerCase()) ??
      "application/octet-stream";
    let url = "./assets/" + encodeURIComponent(safe);
    if (this.preferences.preferences.assetMode === "cloud") {
      const config = this.preferences.cloud;
      if (!config)
        throw new ChomyError(
          "CLOUD_CONFIG",
          "请先配置云存储；附件已保留在本地 assets 目录。",
        );
      const key = [
        config.prefix.replace(/^\/+|\/+$/g, ""),
        new Date().toISOString().slice(0, 10),
        safe,
      ]
        .filter(Boolean)
        .join("/");
      this.pending = { id, path: path.join(directory, safe), name, key, mime };
      url = await this.cloud.upload(config, key, bytes, mime);
      this.pending = null;
    }
    return this.result(name, url, id);
  }
  async retry() {
    const pending = this.pending;
    if (!pending)
      throw new ChomyError(
        "UPLOAD_RETRY_EMPTY",
        "没有待重试的附件；可重新插入原文件。",
      );
    if (pending.id !== this.documents.snapshot.id)
      throw new ChomyError(
        "SESSION_CHANGED",
        "附件属于先前文档，请回到原文档重新插入；本地副本仍保留。",
      );
    const config = this.preferences.cloud;
    if (!config) throw new ChomyError("CLOUD_CONFIG", "请先配置云存储。");
    const url = await this.cloud.upload(
      config,
      pending.key,
      await fs.readFile(pending.path),
      pending.mime,
    );
    this.pending = null;
    return this.result(pending.name, url, pending.id);
  }
  private result(name: string, url: string, id: string) {
    const mime =
      imageExtensions.get(path.extname(name).toLowerCase()) ??
      "application/octet-stream";
    const label = Array.from(name)
      .map((char) => (char.charCodeAt(0) < 32 ? "_" : char))
      .join("")
      .replace(/[[\]\r\n]/g, "_");
    return {
      id,
      markdown: `${mime.startsWith("image/") ? "!" : ""}[${label}](${url})`,
    };
  }
}
