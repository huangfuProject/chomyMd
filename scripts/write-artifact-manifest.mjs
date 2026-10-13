import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(
  await fs.readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const version = metadata.version;
const files = [
  "apps/desktop/out/Chomy-darwin-arm64/Chomy.app/Contents/MacOS/Chomy",
  "apps/desktop/out/Chomy-darwin-arm64/Chomy.app/Contents/Resources/app.asar",
  `apps/desktop/out/make/zip/darwin/arm64/Chomy-darwin-arm64-${version}.zip`,
  `apps/desktop/out/make/dmg/Chomy-${version}-arm64-internal.dmg`,
  "apps/desktop/out/Chomy-win32-x64/Chomy.exe",
  "apps/desktop/out/Chomy-win32-x64/resources/app.asar",
  `apps/desktop/out/make/zip/win32/x64/Chomy-win32-x64-${version}-portable.zip`,
];
const artifacts = [];
for (const filename of files) {
  const full = path.join(root, filename);
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(full)) digest.update(chunk);
  artifacts.push({
    path: filename,
    bytes: (await fs.stat(full)).size,
    sha256: digest.digest("hex"),
  });
}
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  buildHost: { platform: process.platform, architecture: process.arch },
  signing: "unsigned internal test artifacts",
  windowsRuntimeVerified: false,
  artifacts,
};
await fs.writeFile(
  path.join(root, "docs/release/artifact-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Recorded SHA-256 for ${artifacts.length} artifacts.`);
