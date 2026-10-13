import fs from "node:fs/promises";
import path from "node:path";
import MakerZIP from "@electron-forge/maker-zip";
const root = path.resolve(import.meta.dirname, "..");
const metadata = JSON.parse(
  await fs.readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const directory = path.join(root, "apps/desktop/out/Chomy-win32-x64");
await fs.access(path.join(directory, "Chomy.exe"));
const maker = new MakerZIP({});
await maker.prepareConfig("x64");
const [archive] = await maker.make({
  dir: directory,
  makeDir: path.join(root, "apps/desktop/out/make"),
  appName: "Chomy",
  packageJSON: metadata,
  targetArch: "x64",
  targetPlatform: "win32",
});
const output = path.join(
  path.dirname(archive),
  `Chomy-win32-x64-${metadata.version}-portable.zip`,
);
await fs.rename(archive, output);
console.log(`Created Windows portable ZIP: ${output}`);
