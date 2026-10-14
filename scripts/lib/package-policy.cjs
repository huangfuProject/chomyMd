const fs = require("node:fs/promises");
const path = require("node:path");

// Ship only runtime inputs. Icons for signing/packaging are read from the source tree.
function ignoreRuntimeFile(filename) {
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, "/").replace(/^\//, "");
  return !(
    normalized === "package.json" ||
    normalized === "dist" ||
    normalized.startsWith("dist/") ||
    normalized === "assets" ||
    ["assets/icon.png", "assets/THIRD_PARTY_NOTICES.txt"].includes(normalized)
  );
}
function keepLocale(name, platform) {
  return platform === "darwin"
    ? /^(?:en(?:_GB)?|zh_CN|zh_TW)(?:_(?:FEMININE|MASCULINE|NEUTER))?\.lproj$/.test(
        name,
      )
    : /^(?:en-US|en-GB|zh-CN|zh-TW)\.pak$/.test(name);
}
async function trimLocales({ buildPath, platform }) {
  const directory =
    platform === "darwin"
      ? path.join(
          buildPath,
          "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources",
        )
      : platform === "win32"
        ? path.join(buildPath, "locales")
        : null;
  if (!directory) return;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const removable = entries.filter((entry) =>
    platform === "darwin"
      ? entry.isDirectory() && entry.name.endsWith(".lproj")
      : entry.isFile() && entry.name.endsWith(".pak"),
  );
  const required =
    platform === "darwin"
      ? ["en.lproj", "zh_CN.lproj", "zh_TW.lproj"]
      : ["en-US.pak", "zh-CN.pak", "zh-TW.pak"];
  for (const name of required)
    if (!entries.some((entry) => entry.name === name))
      throw Error(`Missing required Electron locale: ${name}`);
  for (const entry of removable)
    if (!keepLocale(entry.name, platform))
      await fs.rm(path.join(directory, entry.name), { recursive: true });
}
module.exports = { ignoreRuntimeFile, keepLocale, trimLocales };
