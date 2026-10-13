import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Documents } from "../../apps/desktop/src/main/documents";
import {
  atomicWrite,
  decodeDocument,
  encodeDocument,
} from "../../packages/document-core/src/files";
const directories: string[] = [];
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-test-"));
  directories.push(directory);
  const service = new Documents(path.join(directory, "data"));
  await service.initialize();
  return { directory, service };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
describe("document persistence and recovery", () => {
  it("does not rewrite untouched BOM/CRLF bytes; preserves encoding on edits", async () => {
    const { directory, service } = await fixture();
    const filename = path.join(directory, "中文 空格.md");
    const original = Buffer.from("\ufeff# 标题\r\n\r\nText  \r\n");
    await fs.writeFile(filename, original);
    const doc = await service.open(filename);
    await service.save();
    expect(await fs.readFile(filename)).toEqual(original);
    await service.update(doc.id, doc.markdown + "新行\n", 1);
    await service.save();
    const bytes = await fs.readFile(filename);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
    expect(bytes.toString()).toContain("新行\r\n");
    expect(service.snapshot.dirty).toBe(false);
  });
  it("rejects external overwrite and failed save while keeping dirty recovery data", async () => {
    const { directory, service } = await fixture();
    const filename = path.join(directory, "test.md");
    await fs.writeFile(filename, "original");
    const doc = await service.open(filename);
    await service.update(doc.id, "my edit", 1);
    await service.persistRecovery();
    await fs.writeFile(filename, "external");
    await expect(service.save()).rejects.toMatchObject({
      code: "EXTERNAL_CHANGE",
    });
    expect(await fs.readFile(filename, "utf8")).toBe("external");
    expect(service.snapshot.dirty).toBe(true);
    const fresh = new Documents(path.join(directory, "data"));
    await fresh.initialize();
    const recovered = await fresh.restore(doc.id);
    expect(recovered.markdown).toBe("my edit");
    expect(recovered.externalChange).toBe(true);
    await expect(
      service.save(path.join(directory, "missing", "no.md")),
    ).rejects.toMatchObject({ code: "SAVE_FAILED" });
    expect(service.snapshot.dirty).toBe(true);
  });
  it("serializes saves and ignores stale revisions/session callbacks", async () => {
    const { directory, service } = await fixture();
    const id = service.snapshot.id;
    await service.run(() => service.update(id, "latest", 2));
    await service.run(() => service.update(id, "stale", 1));
    expect(service.snapshot.markdown).toBe("latest");
    await Promise.all([
      service.run(() => service.save(path.join(directory, "test.md"))),
      service.run(() => service.update(id, "newer", 3)),
      service.run(() => service.save()),
    ]);
    expect(await fs.readFile(path.join(directory, "test.md"), "utf8")).toBe(
      "newer",
    );
    await service.newDocument();
    await expect(service.update(id, "old session", 4)).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
  });
  it("leaves the original intact and removes temporary files on rename failure", async () => {
    const { directory } = await fixture();
    const filename = path.join(directory, "original.md");
    await fs.writeFile(filename, "old");
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      Object.assign(new Error("disk"), { code: "ENOSPC" }),
    );
    await expect(atomicWrite(filename, "new")).rejects.toThrow();
    expect(await fs.readFile(filename, "utf8")).toBe("old");
    expect(
      (await fs.readdir(directory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });
  it("persists only explicitly selected external asset grants and denies ungranted paths", async () => {
    const { directory, service } = await fixture();
    const sub = path.join(directory, "notes");
    await fs.mkdir(sub);
    const filename = path.join(sub, "doc.md");
    const image = path.join(directory, "中文 图.png");
    await fs.writeFile(filename, "");
    await fs.writeFile(image, "image bytes");
    await service.open(filename);
    const source = "../" + encodeURIComponent(path.basename(image));
    const url = () =>
      `chomy-asset://${service.snapshot.id}/reference?ref=${encodeURIComponent(source)}`;
    expect(await service.resolveAsset(url())).toBeNull();
    expect(await service.referenceAsset(image)).toBe(source);
    expect(await service.resolveAsset(url())).toBe(await fs.realpath(image));
    expect(await fs.readdir(sub)).toEqual(["doc.md"]);
    const fresh = new Documents(path.join(directory, "data"));
    await fresh.initialize();
    await fresh.open(filename);
    expect(
      await fresh.resolveAsset(
        `chomy-asset://${fresh.snapshot.id}/reference?ref=${encodeURIComponent(source)}`,
      ),
    ).toBe(await fs.realpath(image));
    expect(await fresh.grantedAsset("../unselected.png")).toBeNull();
    await fs.rename(image, image + ".old");
    await fs.symlink(image + ".old", image);
    expect(await fresh.grantedAsset(source)).toBeNull();
  });
  it("keeps a read-only file unchanged and retains dirty recovery data", async () => {
    const { directory, service } = await fixture();
    const filename = path.join(directory, "readonly.md");
    await fs.writeFile(filename, "original");
    const doc = await service.open(filename);
    await fs.chmod(filename, 0o444);
    try {
      await service.save();
      await service.update(doc.id, "edited", 1);
      await expect(service.save()).rejects.toMatchObject({ code: "READ_ONLY" });
      expect(await fs.readFile(filename, "utf8")).toBe("original");
      expect(service.snapshot.dirty).toBe(true);
      expect(await service.recoveries()).toHaveLength(1);
    } finally {
      await fs.chmod(filename, 0o600);
    }
  });
  it("detects an external edit made while the temporary file is being synced", async () => {
    const { directory, service } = await fixture();
    const filename = path.join(directory, "doc.md");
    await fs.writeFile(filename, "original");
    const doc = await service.open(filename);
    await service.update(doc.id, "edited", 1);
    const originalOpen = fs.open;
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (
        String(args[0]).includes(".doc.md.") &&
        String(args[0]).endsWith(".tmp")
      ) {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, "sync").mockImplementation(async () => {
          await fs.writeFile(filename, "external while saving");
          await sync();
        });
      }
      return handle;
    });
    await expect(service.save()).rejects.toMatchObject({
      code: "EXTERNAL_CHANGE",
    });
    expect(await fs.readFile(filename, "utf8")).toBe("external while saving");
    expect(service.snapshot.dirty).toBe(true);
    expect(
      (await fs.readdir(directory)).some((name) => name.endsWith(".tmp")),
    ).toBe(false);
  });
  it("cannot delete settings or restore paths outside the recovery directory", async () => {
    const { directory, service } = await fixture();
    const settings = path.join(directory, "data/settings.json");
    await fs.writeFile(settings, "keep");
    await expect(service.removeRecovery("../settings")).rejects.toMatchObject({
      code: "RECOVERY_ID",
    });
    await expect(service.restore("../settings")).rejects.toMatchObject({
      code: "RECOVERY_ID",
    });
    expect(await fs.readFile(settings, "utf8")).toBe("keep");
  });
  it("restricts attachment paths and rejects invalid UTF-8", async () => {
    const { directory, service } = await fixture();
    await fs.writeFile(path.join(directory, "doc.md"), "");
    await service.open(path.join(directory, "doc.md"));
    expect(
      await service.resolveAsset(
        `chomy-asset://${service.snapshot.id}/%2e%2e%2fsecret.png`,
      ),
    ).toBeNull();
    expect(() => decodeDocument(Buffer.from([0xff, 0xfe]))).toThrow();
    expect(
      encodeDocument("a\nb", { bom: false, newline: "\r\n" }).toString(),
    ).toBe("a\r\nb");
  });
});
