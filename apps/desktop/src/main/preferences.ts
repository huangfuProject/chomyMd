import fs from "node:fs/promises";
import AdmZip from "adm-zip";
import { inflateRawSync, crc32 } from "node:zlib";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  preferencesSchema,
  themeSchema,
  cloudSchema,
  ChomyError,
  type Preferences,
  type FileEntry,
  type ThemeManifest,
  type CloudConfig,
} from "@chomy/contracts";
import { atomicWrite } from "@chomy/document-core";
import { scopeTheme, importTyporaCss } from "@chomy/theme-engine";
const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  preferences: preferencesSchema,
  recent: z.array(z.string()).max(20),
  cloud: cloudSchema.nullable(),
  lastDirectory: z.string().nullable().optional(),
});
export const defaultPreferences: Preferences = {
  theme: "chomy-light",
  autosave: false,
  fontSize: 16,
  contentWidth: 960,
  assetMode: "reference",
  remoteImages: false,
};
const builtins: ThemeManifest[] = [
  ["chomy-light", "Chomy 明亮", ["light"]],
  ["chomy-dark", "Chomy 暗色", ["dark"]],
  ["chomy-system", "跟随系统", ["light", "dark"]],
  ["chomy-contrast", "Chomy 高对比度", ["light"]],
].map(([id, name, modes]) => ({
  schemaVersion: 1,
  id: id as string,
  name: name as string,
  version: "1.0.0",
  engine: ">=1.0.0",
  author: "Chomy",
  modes: modes as ("light" | "dark")[],
  styles: "theme.css",
}));
const darkCss =
  ".chomy-document{--chomy-bg:#202226;--chomy-fg:#dedee2;--chomy-code-bg:#2c3036;--chomy-link-color:#86b9e8;--chomy-border:#484b53;--chomy-quote-color:#adb4be;--chomy-table-alt-bg:#25282f;--chomy-selection-bg:rgba(134,185,232,.25)}";
export class PreferencesService {
  preferences = { ...defaultPreferences };
  recentPaths: string[] = [];
  lastDirectory: string | null = null;
  cloud: CloudConfig | null = null;
  constructor(readonly directory: string) {}
  async initialize() {
    await fs.mkdir(path.join(this.directory, "themes"), { recursive: true });
    try {
      const value = settingsSchema.parse(
        JSON.parse(
          await fs.readFile(path.join(this.directory, "settings.json"), "utf8"),
        ),
      );
      this.preferences = value.preferences;
      this.recentPaths = value.recent;
      this.cloud = value.cloud;
      this.lastDirectory = value.lastDirectory ?? null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new ChomyError(
          "SETTINGS_INVALID",
          "设置文件损坏，原文件已保留。请备份后移除 settings.json 再启动。",
        );
    }
    const themes = await this.themes();
    if (!themes.some((theme) => theme.id === this.preferences.theme)) {
      this.preferences.theme = "chomy-light";
      await this.persist();
    }
  }
  async persist() {
    await atomicWrite(
      path.join(this.directory, "settings.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          preferences: this.preferences,
          recent: this.recentPaths,
          cloud: this.cloud,
          lastDirectory: this.lastDirectory,
        },
        null,
        2,
      ),
    );
  }
  async remember(filename: string) {
    this.recentPaths = [
      filename,
      ...this.recentPaths.filter((value) => value !== filename),
    ].slice(0, 20);
    await this.persist();
  }
  async recent(register: (file: string) => FileEntry) {
    const result: FileEntry[] = [];
    for (const file of this.recentPaths) {
      try {
        await fs.access(file);
        result.push(register(file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return result;
  }
  async themes() {
    const result = [...builtins];
    for (const entry of await fs.readdir(path.join(this.directory, "themes"), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const manifest = themeSchema.parse(
          JSON.parse(await this.readThemeFile(entry.name, "theme.json")),
        );
        if (manifest.id === entry.name) result.push(manifest);
      } catch {
        /* A broken theme is isolated and retained; default theme continues working. */
      }
    }
    return result;
  }
  private async readThemeFile(id: string, name: "theme.json" | "theme.css") {
    const directory = path.join(this.directory, "themes", id);
    const directoryStat = await fs.lstat(directory);
    const filename = path.join(directory, name);
    const stat = await fs.lstat(filename);
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 128 * 1024
    )
      throw new ChomyError(
        "THEME_FILE",
        "主题必须使用普通目录及小于128KB的普通文件。",
      );
    return fs.readFile(filename, "utf8");
  }
  async install(directory: string) {
    for (const name of ["theme.json", "theme.css"]) {
      const stat = await fs.lstat(path.join(directory, name));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024)
        throw new ChomyError(
          "THEME_FILE",
          "主题文件必须是小于 128 KB 的普通文件。",
        );
    }

    const manifest = themeSchema.parse(
      JSON.parse(await fs.readFile(path.join(directory, "theme.json"), "utf8")),
    );
    if (manifest.id.startsWith("chomy-"))
      throw new ChomyError("THEME_RESERVED", "主题 ID 不能使用 chomy- 前缀。");
    const source = await fs.readFile(path.join(directory, "theme.css"), "utf8");
    scopeTheme(source);
    const preview = manifest.preview
      ? await this.readPreview(path.join(directory, "preview.png"))
      : null;
    const target = path.join(this.directory, "themes", manifest.id);
    try {
      const targetStat = await fs.lstat(target);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink())
        throw new ChomyError("THEME_PATH", "主题安装位置必须是普通目录。");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(target, { recursive: true });
    await atomicWrite(path.join(target, "theme.css"), source);
    if (preview) await atomicWrite(path.join(target, "preview.png"), preview);
    await atomicWrite(
      path.join(target, "theme.json"),
      JSON.stringify(manifest),
    );
    return this.themes();
  }
  private async readPreview(filename: string) {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024)
      throw new ChomyError(
        "THEME_PREVIEW",
        "主题预览必须是小于512KB的普通PNG文件。",
      );
    const bytes = await fs.readFile(filename);
    if (
      bytes.length < 33 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(12, 16).toString() !== "IHDR"
    )
      throw new ChomyError("THEME_PREVIEW", "主题预览不是有效PNG。");
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      !width ||
      !height ||
      width > 1600 ||
      height > 1200 ||
      width * height > 2000000
    )
      throw new ChomyError("THEME_PREVIEW", "主题预览尺寸超出限制。");
    let offset = 8,
      ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      if (offset + 12 + length > bytes.length)
        throw new ChomyError("THEME_PREVIEW", "预览PNG数据损坏。");
      const kind = bytes.subarray(offset + 4, offset + 8).toString();
      if (kind === "acTL")
        throw new ChomyError("THEME_PREVIEW", "预览必须为静态PNG。");
      if (
        crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
        bytes.readUInt32BE(offset + 8 + length)
      )
        throw new ChomyError("THEME_PREVIEW", "预览PNG校验失败。");
      if (kind === "IEND") {
        ended = length === 0 && offset + 12 === bytes.length;
        break;
      }
      offset += length + 12;
    }
    if (!ended) throw new ChomyError("THEME_PREVIEW", "预览PNG数据不完整。");
    return bytes;
  }
  async preview(id: string) {
    if (!themeSchema.shape.id.safeParse(id).success) return null;
    const manifest = (await this.themes()).find((theme) => theme.id === id);
    if (!manifest?.preview) return null;
    const directory = path.join(this.directory, "themes", id);
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    return this.readPreview(path.join(directory, "preview.png"));
  }
  async importCss(filename: string) {
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 128 * 1024)
      throw new ChomyError("THEME_SIZE", "CSS 必须小于 128 KB。");
    const { stylesheet, omitted } = importTyporaCss(
      await fs.readFile(filename, "utf8"),
    );
    const id = "imported." + randomUUID();
    const temporary = path.join(
      this.directory,
      "themes",
      ".install-" + randomUUID(),
    );
    await fs.mkdir(temporary);
    try {
      await fs.writeFile(
        path.join(temporary, "theme.json"),
        JSON.stringify({
          schemaVersion: 1,
          id,
          name: path.basename(filename).slice(0, 80),
          version: "1.0.0",
          engine: ">=1.0.0",
          author: "用户导入",
          modes: ["light", "dark"],
          styles: "theme.css",
        }),
      );
      await fs.writeFile(path.join(temporary, "theme.css"), stylesheet);
      return { themes: await this.install(temporary), omitted };
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  async installZip(filename: string) {
    const stat = await fs.stat(filename);
    if (stat.size > 2 * 1024 * 1024)
      throw new ChomyError("THEME_ZIP_SIZE", "主题 ZIP 不能超过 2 MB。");
    const zip = new AdmZip(await fs.readFile(filename));
    const entries = zip.getEntries();
    if (
      entries.length > 100 ||
      entries.reduce((sum, entry) => sum + entry.header.size, 0) >
        10 * 1024 * 1024
    )
      throw new ChomyError("THEME_ZIP_SIZE", "主题 ZIP 解压内容过大。");
    const temporary = path.join(
      this.directory,
      "themes",
      ".install-" + randomUUID(),
    );
    await fs.mkdir(temporary);
    try {
      let count = 0;
      for (const entry of entries) {
        if (
          entry.entryName.includes("..") ||
          entry.entryName.startsWith("/") ||
          entry.entryName.includes("\\") ||
          ((entry.attr >>> 16) & 0o170000) === 0o120000
        )
          throw new ChomyError("THEME_ZIP_PATH", "主题 ZIP 包含不安全路径。");
        if (entry.isDirectory) continue;
        const name = path.posix.basename(entry.entryName);
        if (!["theme.json", "theme.css", "preview.png"].includes(name))
          continue;
        const limit = name === "preview.png" ? 512 * 1024 : 128 * 1024;
        if (entry.header.size > limit)
          throw new ChomyError("THEME_SIZE", "主题文件过大。");
        if (entry.header.flags & 1)
          throw new ChomyError("THEME_ZIP_ENCRYPTED", "不支持加密主题 ZIP。");
        const compressed = entry.getCompressedData();
        const bytes =
          entry.header.method === 0
            ? compressed
            : entry.header.method === 8
              ? inflateRawSync(compressed, { maxOutputLength: limit })
              : null;
        if (
          !bytes ||
          bytes.length !== entry.header.size ||
          crc32(bytes) !== entry.header.crc >>> 0
        )
          throw new ChomyError("THEME_ZIP_CORRUPT", "主题 ZIP 数据校验失败。");
        await fs.writeFile(path.join(temporary, name), bytes, { flag: "wx" });
        count++;
      }
      if (count < 2 || count > 3)
        throw new ChomyError(
          "THEME_PACKAGE",
          "主题需要 theme.json 与 theme.css。",
        );
      return await this.install(temporary);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  async remove(id: string) {
    if (id.startsWith("chomy-") || !themeSchema.shape.id.safeParse(id).success)
      throw new ChomyError("THEME_RESERVED", "内置主题不能移除。");
    await fs.rm(path.join(this.directory, "themes", id), {
      recursive: true,
      force: true,
    });
    if (this.preferences.theme === id) {
      this.preferences.theme = "chomy-light";
      await this.persist();
    }
    return this.themes();
  }
  async css(id: string) {
    if (id === "chomy-light") return "";
    if (id === "chomy-dark") return darkCss;
    if (id === "chomy-system")
      return `@media(prefers-color-scheme:dark){${darkCss}}`;
    if (id === "chomy-contrast")
      return ".chomy-document{--chomy-bg:#fff;--chomy-fg:#000;--chomy-link-color:#000080;--chomy-border:#000;--chomy-code-bg:#eee;--chomy-quote-color:#000;--chomy-table-alt-bg:#fff}";
    if (!themeSchema.shape.id.safeParse(id).success)
      throw new ChomyError("THEME_ID", "主题标识无效。");
    return scopeTheme(await this.readThemeFile(id, "theme.css"));
  }
}
