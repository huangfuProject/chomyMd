import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const licenses = JSON.parse(
  execFileSync(pnpm, ["licenses", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  }),
);
const records = [];
for (const [license, packages] of Object.entries(licenses)) {
  for (const item of packages) {
    const candidates = [
      ...(item.paths ?? []),
      path.join(root, "node_modules", item.name),
    ];
    let text = "";
    for (const directory of candidates) {
      try {
        const files = (await fs.readdir(directory)).filter((file) =>
          /^(?:licen[sc]e|copying|notice)(?:\.|$)/i.test(file),
        );
        if (!files.length) continue;
        text = (
          await Promise.all(
            files.map((file) =>
              fs.readFile(path.join(directory, file), "utf8"),
            ),
          )
        ).join("\n\n");
        break;
      } catch {
        /* A pnpm metadata path may not exist in a hoisted install. */
      }
    }
    records.push({ name: item.name, versions: item.versions, license, text });
  }
}
records.sort((a, b) => a.name.localeCompare(b.name));
const notices = [
  "Chomy third-party dependency notices",
  "Generated from the installed lockfile packages, including build and test tools.",
  "Chomy original code and documentation are licensed under Apache-2.0. See LICENSE.txt in the packaged dist directory. Third-party dependencies retain their respective licenses.",
  ...records.map(
    (record) =>
      `\n${"=".repeat(72)}\n${record.name} ${record.versions.join(", ")} — ${record.license}\n\n${record.text || "License text not present in this installed package. Consult its upstream distribution before public release."}`,
  ),
].join("\n");
await fs.writeFile(
  path.join(root, "apps/desktop/assets/THIRD_PARTY_NOTICES.txt"),
  notices,
);
console.log(
  `Dependency notices: ${records.length} packages; ${records.filter((record) => !record.text).length} require upstream text verification.`,
);
