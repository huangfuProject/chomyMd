import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { themeSchema, requestSchema } from "../../packages/contracts/src";
import { scopeTheme, importTyporaCss } from "../../packages/theme-engine/src";
import { PreferencesService } from "../../apps/desktop/src/main/preferences";
it("installs a validated theme ZIP and rejects traversal, duplicate files and oversized content", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-themes-"));
  try {
    const service = new PreferencesService(directory);
    await service.initialize();
    const manifest = {
      schemaVersion: 1,
      id: "example.valid",
      name: "Valid",
      version: "1.0.0",
      engine: ">=1.0.0",
      author: "Test",
      modes: ["light"],
      styles: "theme.css",
      preview: "preview.png",
      description: "Preview test",
    };
    const make = async (zip: AdmZip, name: string) => {
      const filename = path.join(directory, name);
      await fs.writeFile(filename, zip.toBuffer());
      return filename;
    };
    const valid = new AdmZip();
    valid.addFile("theme/theme.json", Buffer.from(JSON.stringify(manifest)));
    valid.addFile("theme/theme.css", Buffer.from("h1{color:navy}"));
    const preview = await fs.readFile(
      "packages/theme-engine/examples/paper/preview.png",
    );
    valid.addFile("theme/preview.png", preview);
    await service.installZip(await make(valid, "valid.zip"));
    expect(await service.css("example.valid")).toContain(".chomy-document h1");
    expect(await service.preview("example.valid")).toEqual(preview);
    expect(await service.preview("..")).toBeNull();
    service.preferences.theme = "example.valid";
    await service.persist();
    const restarted = new PreferencesService(directory);
    await restarted.initialize();
    expect(restarted.preferences.theme).toBe("example.valid");
    await service.remove("example.valid");
    const missing = new PreferencesService(directory);
    await missing.initialize();
    expect(missing.preferences.theme).toBe("chomy-light");
    const bad = new AdmZip();
    bad.addFile("theme.json", Buffer.from(JSON.stringify(manifest)));
    bad.addFile("theme.css", Buffer.from("h1{}"));
    let archive = bad.toBuffer();
    archive = Buffer.from(
      archive.toString("latin1").replaceAll("theme.json", "../x.json!"),
      "latin1",
    );
    const badPath = path.join(directory, "bad.zip");
    await fs.writeFile(badPath, archive);
    await expect(service.installZip(badPath)).rejects.toThrow();
    const large = new AdmZip();
    large.addFile("theme.json", Buffer.from(JSON.stringify(manifest)));
    large.addFile("theme.css", Buffer.from("a".repeat(130 * 1024)));
    await expect(
      service.installZip(await make(large, "large.zip")),
    ).rejects.toThrow();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it("migrates known public CSS selectors, reports omitted private selectors and blocks external resources", () => {
  const imported = importTyporaCss(
    "#write h1{color:navy}.md-fences{padding:8px}.private-node{color:red}",
  );
  expect(imported.omitted).toBe(1);
  expect(imported.stylesheet).toContain(".chomy-document h1");
  expect(imported.stylesheet).toContain("pre");
  expect(imported.stylesheet).not.toContain("private-node");
  expect(() =>
    importTyporaCss("#write{background:url(https://example.com)}"),
  ).toThrow();
});

it("rejects traversal/device theme IDs, recovery path requests and sibling selectors outside the document", async () => {
  for (const id of [
    ".",
    "..",
    "...",
    "foo..bar",
    "con",
    "con.txt",
    "lpt1",
    "../escape",
  ])
    expect(themeSchema.shape.id.safeParse(id).success).toBe(false);
  expect(themeSchema.shape.id.safeParse("example.paper-dark").success).toBe(
    true,
  );
  expect(
    requestSchema.safeParse({ action: "discardRecovery", id: "../settings" })
      .success,
  ).toBe(false);
  expect(() => scopeTheme(".chomy-document+.toolbar{color:red}")).toThrow();
  for (const source of [
    String.raw`p{p\6fsition:f\69 xed}`,
    String.raw`p{z\2d index:999}`,
    "p{--escape:fixed;position:var(--escape)}",
  ])
    expect(() => scopeTheme(source)).toThrow();
  expect(() => scopeTheme(".chomy-document:hover~footer{color:red}")).toThrow();
  expect(scopeTheme(".chomy-document:hover>p+p{color:red}")).toContain(
    ".chomy-document:hover>p+p",
  );
  expect(scopeTheme("p:not(.plain){color:blue}")).toContain(
    ".chomy-document p:not(.plain)",
  );
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-theme-boundary-"),
  );
  try {
    const service = new PreferencesService(directory);
    await service.initialize();
    await fs.writeFile(path.join(directory, "preserve.txt"), "keep");
    await expect(service.remove("..")).rejects.toThrow();
    expect(
      await fs.readFile(path.join(directory, "preserve.txt"), "utf8"),
    ).toBe("keep");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it("rejects malformed previews and duplicate ZIP targets without replacing an installed theme", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-preview-boundary-"),
  );
  try {
    const service = new PreferencesService(path.join(directory, "data"));
    await service.initialize();
    const source = path.join(directory, "theme");
    await fs.cp("packages/theme-engine/examples/paper", source, {
      recursive: true,
    });
    await service.install(source);
    const originalCss = await service.css("example.paper");
    const png = await fs.readFile(path.join(source, "preview.png"));
    const broken = Buffer.from(png);
    broken[broken.length - 1] = (broken[broken.length - 1] ?? 0) ^ 1;
    await fs.writeFile(path.join(source, "preview.png"), broken);
    await fs.writeFile(path.join(source, "theme.css"), "h1{color:red}");
    await expect(service.install(source)).rejects.toThrow();
    expect(await service.css("example.paper")).toBe(originalCss);
    expect(await service.preview("example.paper")).toEqual(png);
    const duplicate = new AdmZip();
    const manifest = await fs.readFile(path.join(source, "theme.json"));
    duplicate.addFile("one/theme.json", manifest);
    duplicate.addFile("two/theme.json", manifest);
    duplicate.addFile("theme.css", Buffer.from("h1{}"));
    const archive = path.join(directory, "duplicate.zip");
    await fs.writeFile(archive, duplicate.toBuffer());
    await expect(service.installZip(archive)).rejects.toThrow();
    expect(await service.css("example.paper")).toBe(originalCss);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
