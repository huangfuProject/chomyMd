import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ChomyError,
  documentSchema,
  type DocumentSnapshot,
  type FileEntry,
} from "@chomy/contracts";
import {
  atomicWrite,
  decodeDocument,
  encodeDocument,
  hash,
  type Encoding,
} from "@chomy/document-core";
const recoverySchema = z.object({
  document: documentSchema,
  path: z.string().nullable(),
  baseHash: z.string(),
  baseText: z.string(),
  encoding: z.object({ bom: z.boolean(), newline: z.enum(["\n", "\r\n"]) }),
  date: z.string(),
});
export class Documents {
  private current: DocumentSnapshot = {
    id: randomUUID(),
    name: "未命名",
    markdown: "",
    revision: 0,
    dirty: false,
    saved: false,
    externalChange: false,
  };
  private filename: string | null = null;
  private baseHash = "";
  private baseText = "";
  private encoding: Encoding = { bom: false, newline: "\n" };
  private queue: Promise<unknown> = Promise.resolve();
  private snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  private assetGrants: Record<string, Record<string, string>> = {};
  readonly entries = new Map<string, string>();
  constructor(readonly dataDirectory: string) {}
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async initialize() {
    try {
      this.assetGrants = z
        .record(z.string(), z.record(z.string(), z.string()))
        .parse(
          JSON.parse(
            await fs.readFile(
              path.join(this.dataDirectory, "asset-grants.json"),
              "utf8",
            ),
          ),
        );
    } catch {
      /* Absent or corrupt grants fail closed. */
    }
    await fs.mkdir(path.join(this.dataDirectory, "recovery"), {
      recursive: true,
    });
  }
  get snapshot() {
    return { ...this.current };
  }
  get filePath() {
    return this.filename;
  }
  async newDocument() {
    await this.persistRecovery();
    this.current = {
      id: randomUUID(),
      name: "未命名",
      markdown: "",
      revision: 0,
      dirty: false,
      saved: false,
      externalChange: false,
    };
    this.filename = null;
    this.baseHash = "";
    this.baseText = "";
    this.encoding = { bom: false, newline: "\n" };
    return this.snapshot;
  }
  async open(filename: string) {
    if (
      ![".md", ".markdown", ".txt"].includes(
        path.extname(filename).toLowerCase(),
      )
    )
      throw new ChomyError("FILE_TYPE", "请选择 Markdown 或文本文件。");
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > 12 * 1024 * 1024)
      throw new ChomyError("FILE_SIZE", "文件必须小于 12 MB。");
    const bytes = await fs.readFile(filename);
    let decoded: ReturnType<typeof decodeDocument>;
    try {
      decoded = decodeDocument(bytes);
    } catch {
      throw new ChomyError("ENCODING", "仅支持 UTF-8 文本；原文件未修改。");
    }
    await this.persistRecovery();
    this.filename = await fs.realpath(filename);
    this.baseHash = hash(bytes);
    this.baseText = decoded.text;
    this.encoding = decoded.encoding;
    this.current = {
      id: randomUUID(),
      name: path.basename(filename),
      markdown: decoded.text,
      revision: 0,
      dirty: false,
      saved: true,
      externalChange: false,
    };
    return this.snapshot;
  }
  async update(id: string, markdown: string, revision: number) {
    if (id !== this.current.id)
      throw new ChomyError("SESSION_CHANGED", "文档已切换，请重试操作。");
    if (revision <= this.current.revision) return this.snapshot;
    this.current = {
      ...this.current,
      markdown,
      revision,
      dirty: markdown !== this.baseText,
    };
    clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => {
      void this.run(() => this.persistRecovery()).catch(() => {
        this.recoveryError = true;
      });
    }, 600);
    return this.snapshot;
  }
  recoveryError = false;
  async externalChange() {
    if (!this.filename) return false;
    try {
      const bytes = await fs.readFile(this.filename);
      this.current.externalChange = hash(bytes) !== this.baseHash;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        this.current.externalChange = true;
      else throw error;
    }
    return this.current.externalChange;
  }
  async save(destination?: string) {
    await this.persistRecovery();
    const selected = destination ?? this.filename;
    if (!selected) throw new ChomyError("SAVE_PATH", "请先选择保存位置。");
    let target: string;
    try {
      try {
        target = await fs.realpath(selected);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        target = path.join(
          await fs.realpath(path.dirname(path.resolve(selected))),
          path.basename(selected),
        );
      }
    } catch {
      throw new ChomyError(
        "SAVE_FAILED",
        "保存位置不可用，编辑内容和恢复快照仍保留。",
      );
    }
    if (target === this.filename && (await this.externalChange()))
      throw new ChomyError(
        "EXTERNAL_CHANGE",
        "文件已被外部修改。请重新加载，或另存副本。",
      );
    // An unchanged original keeps every byte, including mixed line endings and trailing whitespace.
    if (target === this.filename && !this.current.dirty) return this.snapshot;
    try {
      const stat = await fs.stat(target);
      if (!(stat.mode & 0o222))
        throw new ChomyError(
          "READ_ONLY",
          "文件为只读，原文件未修改；可另存副本。",
        );
      await fs.access(target, fs.constants.W_OK);
    } catch (error) {
      if (error instanceof ChomyError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new ChomyError(
          "READ_ONLY",
          "文件不可写，原文件未修改；可另存副本。",
        );
    }
    const bytes = encodeDocument(this.current.markdown, this.encoding);
    try {
      await atomicWrite(target, bytes, async () => {
        if (target === this.filename && (await this.externalChange()))
          throw new ChomyError(
            "EXTERNAL_CHANGE",
            "写入期间文件被外部修改，未覆盖；请重新加载或另存副本。",
          );
      });
    } catch (error) {
      if (error instanceof ChomyError) throw error;
      throw new ChomyError(
        "SAVE_FAILED",
        "保存失败，编辑内容和恢复快照仍保留。请检查磁盘或文件权限。",
      );
    }
    // Persist authorization before changing the document identity or removing recovery.
    // Absolute original references remain stable on first save and Save As.
    const grants = this.assetGrants[this.grantKey()];
    if (grants && target !== this.filename) {
      this.assetGrants[target] = { ...this.assetGrants[target], ...grants };
      await this.persistAssetGrants();
    }
    this.filename = target;
    this.baseHash = hash(bytes);
    this.baseText = this.current.markdown;
    this.current = {
      ...this.current,
      name: path.basename(target),
      dirty: false,
      saved: true,
      externalChange: false,
    };
    await this.removeRecovery(this.current.id);
    return this.snapshot;
  }
  async persistRecovery() {
    if (!this.current.dirty) {
      await this.removeRecovery(this.current.id);
      return;
    }
    await atomicWrite(
      this.recoveryPath(this.current.id),
      JSON.stringify({
        document: this.current,
        path: this.filename,
        baseHash: this.baseHash,
        baseText: this.baseText,
        encoding: this.encoding,
        date: new Date().toISOString(),
      }),
    );
    this.recoveryError = false;
  }
  private recoveryPath(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new ChomyError("RECOVERY_ID", "恢复记录无效。");
    return path.join(this.dataDirectory, "recovery", id + ".json");
  }
  async removeRecovery(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ChomyError("RECOVERY_ID", "恢复记录标识无效。");
    try {
      await fs.unlink(this.recoveryPath(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async recoveries() {
    const result: { id: string; name: string; date: string }[] = [];
    for (const name of await fs.readdir(
      path.join(this.dataDirectory, "recovery"),
    )) {
      if (!name.endsWith(".json")) continue;
      try {
        const value = recoverySchema.parse(
          JSON.parse(
            await fs.readFile(
              path.join(this.dataDirectory, "recovery", name),
              "utf8",
            ),
          ),
        );
        result.push({
          id: value.document.id,
          name: value.document.name,
          date: value.date,
        });
      } catch {
        /* Invalid snapshots remain on disk for manual recovery; never delete them. */
      }
    }
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }
  async restore(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ChomyError("RECOVERY_ID", "恢复记录标识无效。");
    const value = recoverySchema.parse(
      JSON.parse(await fs.readFile(this.recoveryPath(id), "utf8")),
    );
    await this.persistRecovery();
    this.current = value.document;
    this.filename = value.path;
    this.baseText = value.baseText;
    this.baseHash = value.baseHash;
    this.encoding = value.encoding;
    await this.externalChange();
    return this.snapshot;
  }
  register(filename: string, relative = path.basename(filename)): FileEntry {
    const id = hash(filename).slice(0, 32);
    this.entries.set(id, filename);
    return { id, name: path.basename(filename), relative };
  }
  async folder(directory: string) {
    const result: FileEntry[] = [
      {
        id: hash(directory).slice(0, 32),
        name: path.basename(directory) || directory,
        relative: ".",
        kind: "directory",
        editable: false,
      },
    ];
    const visit = async (dir: string, depth: number) => {
      if (depth > 6 || result.length >= 2000) return;
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (result.length >= 2000) break;
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.isSymbolicLink()
        )
          continue;
        const full = path.join(dir, entry.name);
        const relative = path.relative(directory, full);
        if (entry.isDirectory()) {
          result.push({
            id: hash(full).slice(0, 32),
            name: entry.name,
            relative,
            kind: "directory",
            editable: false,
          });
          await visit(full, depth + 1);
        } else if (entry.isFile()) {
          const editable = /\.(md|markdown|txt)$/i.test(entry.name);
          result.push({
            ...(editable
              ? this.register(full, relative)
              : { id: hash(full).slice(0, 32), name: entry.name, relative }),
            kind: "file",
            editable,
          });
        }
      }
    };
    await visit(directory, 0);
    return result.sort((a, b) => a.relative.localeCompare(b.relative));
  }
  async assetRoot() {
    if (!this.filename)
      throw new ChomyError("SAVE_FIRST", "请先保存文档，再插入附件。");
    const directory = path.join(path.dirname(this.filename), "assets");
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }
  private grantKey() {
    return this.filename ?? `session:${this.current.id}`;
  }
  private async persistAssetGrants() {
    await atomicWrite(
      path.join(this.dataDirectory, "asset-grants.json"),
      JSON.stringify(this.assetGrants),
    );
  }
  async referenceAsset(filename: string) {
    const real = await fs.realpath(filename);
    const relative = this.filename
      ? path.relative(path.dirname(this.filename), real)
      : null;
    const rawSource =
      relative !== null && !path.isAbsolute(relative)
        ? relative.split(path.sep).map(encodeURIComponent).join("/")
        : pathToFileURL(real).href;
    const source = rawSource.replace(/\(/g, "%28").replace(/\)/g, "%29");
    const key = this.grantKey();
    const grants = Object.assign(
      Object.create(null) as Record<string, string>,
      this.assetGrants[key] ?? {},
    );
    grants[source] = real;
    this.assetGrants[key] = grants;
    await this.persistAssetGrants();
    return source;
  }
  async grantedAsset(source: string) {
    const granted = this.assetGrants[this.grantKey()]?.[source];
    if (!granted) return null;
    const candidate = /^file:/i.test(source)
      ? fileURLToPath(source)
      : this.filename
        ? path.resolve(path.dirname(this.filename), decodeURIComponent(source))
        : null;
    if (!candidate) return null;
    return (await fs.realpath(candidate)) === granted ? granted : null;
  }
  async resolveAsset(url: string) {
    const parsed = new URL(url);
    if (parsed.hostname !== this.current.id) return null;
    const relative = decodeURIComponent(parsed.pathname).replace(/^\//, "");
    if (relative.includes("\0") || relative.includes("\\")) return null;
    const source =
      parsed.pathname === "/reference" ? parsed.searchParams.get("ref") : null;
    if (!source && !this.filename) return null;
    const base = this.filename ? path.dirname(this.filename) : "";
    const target = source
      ? await this.grantedAsset(source)
      : path.resolve(base, relative);
    if (!target || (!source && !target.startsWith(base + path.sep)))
      return null;
    const real = await fs.realpath(target);
    if (!source && !real.startsWith(base + path.sep)) return null;
    if (
      ![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(
        path.extname(real).toLowerCase(),
      )
    )
      return null;
    const stat = await fs.stat(real);
    if (stat.size > 20 * 1024 * 1024) return null;
    return real;
  }
}
