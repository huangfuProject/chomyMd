import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { copyMacBundle, assertPortableMacBundle } from "./lib/mac-bundle.ts";
if (process.platform !== "darwin") process.exit(0);
const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(
  await fs.readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-installed-"));
const mount = path.join(directory, "mount");
const installed = path.join(directory, "Installed Apps/Chomy.app");
const original = path.join(
  root,
  "apps/desktop/out/Chomy-darwin-arm64/Chomy.app",
);
const hidden = original + ".relocation-test-" + process.pid;
let mounted = false;
let moved = false;
try {
  await fs.mkdir(mount);
  await run(
    "hdiutil",
    [
      "attach",
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mount,
      path.join(
        root,
        `apps/desktop/out/make/dmg/Chomy-${metadata.version}-arm64-internal.dmg`,
      ),
    ],
    { timeout: 60000 },
  );
  mounted = true;
  await copyMacBundle(path.join(mount, "Chomy.app"), installed);
  const links = await assertPortableMacBundle(installed);
  await fs.rename(original, hidden);
  moved = true;
  console.log(
    `Testing DMG installation with ${links} relative links and the original build unavailable.`,
  );
  const child = spawn(
    process.execPath,
    [require.resolve("@playwright/test/cli"), "test"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        CHOMY_EXECUTABLE: path.join(installed, "Contents/MacOS/Chomy"),
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0)
    throw new Error(`Installed application verification failed: ${code}`);
  console.log(
    "DMG-installed application passes with no dependency on the build location.",
  );
} finally {
  if (moved) await fs.rename(hidden, original);
  if (mounted) await run("hdiutil", ["detach", mount], { timeout: 60000 });
  await fs.rm(directory, { recursive: true, force: true });
}
