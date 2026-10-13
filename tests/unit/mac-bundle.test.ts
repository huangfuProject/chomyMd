import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  assertPortableMacBundle,
  copyMacBundle,
} from "../../scripts/lib/mac-bundle";

it.skipIf(process.platform === "win32")(
  "preserves framework links when the source application is moved away",
  async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-bundle-"));
    try {
      const source = path.join(directory, "source.app");
      const framework = path.join(
        source,
        "Contents/Frameworks/Electron.framework",
      );
      await fs.mkdir(path.join(framework, "Versions/A"), { recursive: true });
      await fs.writeFile(
        path.join(framework, "Versions/A/Electron"),
        "framework bytes",
      );
      await fs.symlink("A", path.join(framework, "Versions/Current"));
      await fs.symlink(
        "Versions/Current/Electron",
        path.join(framework, "Electron"),
      );
      const broken = path.join(directory, "broken.app");
      await fs.cp(source, broken, { recursive: true });
      await expect(assertPortableMacBundle(broken)).rejects.toThrow(
        "absolute bundle link",
      );
      const installed = path.join(directory, "installed.app");
      await copyMacBundle(source, installed);
      await fs.rename(source, path.join(directory, "unavailable.app"));
      expect(await assertPortableMacBundle(installed)).toBe(2);
      expect(
        await fs.readFile(
          path.join(
            installed,
            "Contents/Frameworks/Electron.framework/Electron",
          ),
          "utf8",
        ),
      ).toBe("framework bytes");
      await expect(copyMacBundle(installed, installed)).rejects.toThrow(
        "already exists",
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "rejects relative links outside the application bundle",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "chomy-bundle-escape-"),
    );
    try {
      const source = path.join(directory, "source.app");
      await fs.mkdir(source);
      await fs.writeFile(path.join(directory, "outside"), "outside");
      await fs.symlink("../outside", path.join(source, "external"));
      await expect(assertPortableMacBundle(source)).rejects.toThrow(
        "leaves application",
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
