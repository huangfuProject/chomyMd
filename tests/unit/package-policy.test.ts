import { it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const require = createRequire(import.meta.url);
const { ignoreRuntimeFile, trimLocales } =
  require("../../scripts/lib/package-policy.cjs") as {
    ignoreRuntimeFile: (filename: string) => boolean;
    trimLocales: (options: {
      buildPath: string;
      platform: string;
    }) => Promise<void>;
  };

it("packages runtime code, icon and licenses while excluding development files", () => {
  for (const name of [
    "",
    "/package.json",
    "/dist",
    "/dist/main.cjs",
    "/dist/renderer/assets/font.woff2",
    "/assets",
    "/assets/icon.png",
    "/assets/THIRD_PARTY_NOTICES.txt",
  ])
    expect(ignoreRuntimeFile(name)).toBe(false);
  for (const name of [
    "/node_modules/sdk",
    "/out/Chomy.app",
    "/src/main/index.ts",
    "/assets/logo-master.png",
    "/assets/icon.ico",
    "/forge.config.cjs",
    "/.env",
    "/dist-backup/main.cjs",
  ])
    expect(ignoreRuntimeFile(name)).toBe(true);
});
it("retains Chinese and English runtime locales and refuses incompatible runtime layouts", async () => {
  const buildPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-package-policy-"),
  );
  try {
    const mac = path.join(
      buildPath,
      "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources",
    );
    await fs.mkdir(mac, { recursive: true });
    for (const name of [
      "en.lproj",
      "en_GB.lproj",
      "zh_CN.lproj",
      "zh_TW.lproj",
      "zh_CN_FEMININE.lproj",
      "fr.lproj",
      "af_NEUTER.lproj",
    ])
      await fs.mkdir(path.join(mac, name));
    await fs.writeFile(path.join(mac, "icudtl.dat"), "required runtime data");
    await trimLocales({ buildPath, platform: "darwin" });
    expect((await fs.readdir(mac)).sort()).toEqual(
      [
        "en.lproj",
        "en_GB.lproj",
        "icudtl.dat",
        "zh_CN.lproj",
        "zh_CN_FEMININE.lproj",
        "zh_TW.lproj",
      ].sort(),
    );
    const windows = path.join(buildPath, "locales");
    await fs.mkdir(windows);
    for (const name of [
      "en-US.pak",
      "en-GB.pak",
      "zh-CN.pak",
      "zh-TW.pak",
      "fr.pak",
    ])
      await fs.writeFile(path.join(windows, name), "locale");
    await trimLocales({ buildPath, platform: "win32" });
    expect((await fs.readdir(windows)).sort()).toEqual(
      ["en-US.pak", "en-GB.pak", "zh-CN.pak", "zh-TW.pak"].sort(),
    );
    await fs.rm(path.join(windows, "zh-CN.pak"));
    await expect(trimLocales({ buildPath, platform: "win32" })).rejects.toThrow(
      "Missing required",
    );
  } finally {
    await fs.rm(buildPath, { recursive: true, force: true });
  }
});
