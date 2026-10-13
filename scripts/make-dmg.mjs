import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
if (process.platform !== "darwin") process.exit(0);
const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(
  await fs.readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-dmg-"));
const output = path.join(
  root,
  "apps/desktop/out/make/dmg",
  `Chomy-${metadata.version}-arm64-internal.dmg`,
);
await fs.mkdir(path.dirname(output), { recursive: true });
try {
  await fs.cp(
    path.join(root, "apps/desktop/out/Chomy-darwin-arm64/Chomy.app"),
    path.join(staging, "Chomy.app"),
    { recursive: true },
  );
  await fs.symlink("/Applications", path.join(staging, "Applications"));
  await run(
    "hdiutil",
    [
      "create",
      "-volname",
      "Chomy Internal Test",
      "-srcfolder",
      staging,
      "-ov",
      "-format",
      "ULFO",
      output,
    ],
    { timeout: 180000 },
  );
  await run("hdiutil", ["verify", output], { timeout: 60000 });
  console.log(`Verified internal DMG: ${output}`);
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
