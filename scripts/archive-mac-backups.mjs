import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
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
let totalOriginalBytes = 0;
let totalArchiveBytes = 0;
let archived = 0;
await fs.mkdir(directory, { recursive: true });
for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
  if (
    !entry.isDirectory() ||
    !/^Chomy-before-\d+\.\d+\.\d+-\d+\.app$/.test(entry.name)
  )
    continue;
  const source = path.join(directory, entry.name);
  const output = source + ".zip";
  try {
    await fs.lstat(output);
    throw Error("Backup archive already exists; refusing to overwrite");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const running = await run("ps", ["-axo", "comm"]);
  if (
    running.stdout
      .split("\n")
      .some((command) => command.startsWith(source + path.sep))
  )
    throw Error("Backup application is running; original retained");
  await assertPortableMacBundle(source);
  const before = await fingerprint(source);
  const temporary = output + ".tmp-" + randomUUID();
  const restored = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-backup-verify-"),
  );
  try {
    await run(
      "ditto",
      ["-c", "-k", "--sequesterRsrc", "--keepParent", source, temporary],
      { timeout: 180000 },
    );
    await run("ditto", ["-x", "-k", temporary, restored], { timeout: 180000 });
    const recovered = path.join(restored, entry.name);
    await assertPortableMacBundle(recovered);
    if ((await fingerprint(recovered)).records !== before.records)
      throw Error("Archive restore differs from backup; original retained");
    await fs.rename(temporary, output);
    totalArchiveBytes += (await fs.stat(output)).size;
    totalOriginalBytes += before.bytes;
    // Only our generated backup is removed, after complete byte/mode/link verification.
    await fs.rm(source, { recursive: true });
    archived++;
    console.log(`Archived and verified ${entry.name}`);
  } finally {
    await fs.rm(temporary, { force: true });
    await fs.rm(restored, { recursive: true, force: true });
  }
}
console.log(
  JSON.stringify({ archived, totalOriginalBytes, totalArchiveBytes }),
);

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
        archivedBuild: true,
        removedBuildBytes: before.bytes,
        retainedReleaseZip: path.relative(root, archive),
      }),
    );
  } finally {
    await fs.rm(restored, { recursive: true, force: true });
  }
}
