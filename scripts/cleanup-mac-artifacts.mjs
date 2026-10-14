import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { assertPortableMacBundle } from "./lib/mac-bundle.ts";
if (process.platform !== "darwin") process.exit(0);
const run = promisify(execFile);
const directory = path.resolve(
  import.meta.dirname,
  "../apps/desktop/out/installed-backups",
);
async function fingerprint(root) {
  const records = [];
  let bytes = 0;
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      const relative = path.relative(root, filename);
      if (entry.isSymbolicLink())
        records.push([relative, "link", await fs.readlink(filename)]);
      else if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        const digest = createHash("sha256");
        for await (const chunk of createReadStream(filename))
          digest.update(chunk);
        const stat = await fs.stat(filename);
        bytes += stat.size;
        records.push([relative, stat.mode & 0o777, digest.digest("hex")]);
      } else throw Error("Unsupported backup entry");
    }
  }
  await visit(root);
  return {
    bytes,
    records: JSON.stringify(records.sort((a, b) => a[0].localeCompare(b[0]))),
  };
}
let removed = 0;
let removedBytes = 0;
await fs.mkdir(directory, { recursive: true });
const running = await run("ps", ["-axo", "comm"]);
for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
  if (!/^Chomy-before-\d+\.\d+\.\d+-\d+\.app(?:\.zip)?$/.test(entry.name))
    continue;
  // Never follow symlinks or remove unexpected entries, release packages or user data.
  const isBundle = entry.isDirectory() && entry.name.endsWith(".app");
  const isArchive = entry.isFile() && entry.name.endsWith(".app.zip");
  if (!isBundle && !isArchive) continue;
  const source = path.join(directory, entry.name);
  if (
    isBundle &&
    running.stdout
      .split("\n")
      .some((command) => command.startsWith(source + path.sep))
  )
    throw Error("Backup application is running; retained");
  const bytes = isBundle
    ? (await fingerprint(source)).bytes
    : (await fs.stat(source)).size;
  await fs.rm(source, { recursive: isBundle });
  removedBytes += bytes;
  removed++;
  console.log(`Removed old backup ${entry.name}`);
}
console.log(JSON.stringify({ removed, removedBytes }));

if (process.argv.includes("--build")) {
  const root = path.resolve(import.meta.dirname, "..");
  const metadata = JSON.parse(
    await fs.readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
  );
  const source = path.join(
    root,
    "apps/desktop/out/Chomy-darwin-arm64/Chomy.app",
  );
  const archive = path.join(
    root,
    `apps/desktop/out/make/zip/darwin/arm64/Chomy-darwin-arm64-${metadata.version}.zip`,
  );
  const running = await run("ps", ["-axo", "comm"]);
  if (
    running.stdout
      .split("\n")
      .some((command) => command.startsWith(source + path.sep))
  )
    throw Error("Build application is running; original retained");
  await assertPortableMacBundle(source);
  const before = await fingerprint(source);
  const restored = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-build-verify-"),
  );
  try {
    await run("ditto", ["-x", "-k", archive, restored], { timeout: 180000 });
    const recovered = path.join(restored, "Chomy.app");
    await assertPortableMacBundle(recovered);
    if ((await fingerprint(recovered)).records !== before.records)
      throw Error("Release ZIP differs from build; original retained");
    await fs.rm(source, { recursive: true });
    console.log(
      JSON.stringify({
        removedBuild: true,
        removedBuildBytes: before.bytes,
        retainedReleaseZip: path.relative(root, archive),
      }),
    );
  } finally {
    await fs.rm(restored, { recursive: true, force: true });
  }
}
