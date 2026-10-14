import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Assets } from "../../apps/desktop/src/main/assets";
import { Documents } from "../../apps/desktop/src/main/documents";
import { PreferencesService } from "../../apps/desktop/src/main/preferences";

describe("persistent clipboard images", () => {
  it("uses unique absolute paths before and after save, keeps bytes and restores grants", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "chomy-screenshots-"),
    );
    const data = path.join(directory, "data");
    const docs = new Documents(data);
    const prefs = new PreferencesService(data);
    try {
      await docs.initialize();
      await prefs.initialize();
      const assets = new Assets(docs, prefs, {
        upload: async () => {
          throw Error("Unexpected cloud upload");
        },
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-14T01:00:00Z"));
      const bytes = Buffer.from([0, 1, 255, 127]);
      const [first, second] = await Promise.all([
        assets.storeClipboard(bytes, "image/png"),
        assets.storeClipboard(bytes, "image/png"),
      ]);
      const source = /\]\((.+)\)$/.exec(first.markdown)![1]!;
      expect(source).toMatch(/^file:\/\//);
      expect(first.markdown).not.toBe(second.markdown);
      const filename = fileURLToPath(source);
      expect(path.dirname(filename)).toBe(
        await fs.realpath(path.join(data, "user-images")),
      );
      expect(path.basename(filename)).toMatch(
        /^image-\d{17}-[a-f0-9]{8}\.png$/,
      );
      expect(await fs.readFile(filename)).toEqual(bytes);
      expect(docs.filePath).toBeNull();
      const resolve = (document: Documents) =>
        document.resolveAsset(
          `chomy-asset://${document.snapshot.id}/reference?ref=${encodeURIComponent(source)}`,
        );
      await docs.update(
        docs.snapshot.id,
        first.markdown + "\n" + second.markdown,
        1,
      );
      await docs.persistRecovery();
      const restored = new Documents(data);
      await restored.initialize();
      expect(await resolve(restored)).toBeNull();
      await restored.restore(docs.snapshot.id);
      expect(await resolve(restored)).toBe(filename);
      const note = path.join(directory, "note.md");
      await restored.save(note);
      prefs.preferences.assetMode = "local";
      const afterSave = new Assets(restored, prefs, {
        upload: async () => "unused",
      });
      expect(
        (await afterSave.storeClipboard(bytes, "image/jpeg")).markdown,
      ).toContain("file:///");
      const reopened = new Documents(data);
      await reopened.initialize();
      await reopened.open(note);
      expect(await resolve(reopened)).toBe(filename);
      expect(await fs.readFile(note, "utf8")).toContain(source);
      expect(await fs.readdir(directory)).not.toContain("assets");
      await expect(
        afterSave.storeClipboard(Buffer.alloc(0), "image/png"),
      ).rejects.toThrow();
      await expect(
        afterSave.storeClipboard(bytes, "image/png", "stale-id"),
      ).rejects.toThrow("文档已切换");
    } finally {
      vi.useRealTimers();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("retains an unsaved screenshot on cloud failure and retries from the persistent copy", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "chomy-clipboard-cloud-"),
    );
    try {
      const docs = new Documents(directory);
      const prefs = new PreferencesService(directory);
      await docs.initialize();
      await prefs.initialize();
      prefs.preferences.assetMode = "cloud";
      prefs.cloud = {
        provider: "qiniu",
        bucket: "fixture",
        region: "z0",
        endpoint: "",
        publicUrl: "https://cdn.example.test",
        prefix: "chomy",
        pathStyle: false,
      };
      let offline = true;
      const bytes = Buffer.from("retained image bytes");
      const assets = new Assets(docs, prefs, {
        upload: async (_, key, uploaded) => {
          expect(uploaded).toEqual(bytes);
          expect(key).toMatch(/^chomy\/\d{4}-\d{2}-\d{2}\/image-/);
          if (offline) throw Error("offline");
          return "https://cdn.example.test/screenshot.png";
        },
      });
      await expect(assets.storeClipboard(bytes, "image/png")).rejects.toThrow(
        "offline",
      );
      expect(docs.filePath).toBeNull();
      const files = await fs.readdir(path.join(directory, "user-images"));
      expect(files).toHaveLength(1);
      expect(
        await fs.readFile(path.join(directory, "user-images", files[0]!)),
      ).toEqual(bytes);
      offline = false;
      expect((await assets.retry()).markdown).toContain(
        "https://cdn.example.test/screenshot.png",
      );
      expect(await fs.readdir(path.join(directory, "user-images"))).toEqual(
        files,
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
