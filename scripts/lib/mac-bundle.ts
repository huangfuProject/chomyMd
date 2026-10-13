import fs from "node:fs/promises";
import path from "node:path";

export async function assertPortableMacBundle(directory: string) {
  const root = await fs.realpath(directory);
  let links = 0;
  async function visit(current: string) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await fs.readlink(filename);
        if (path.isAbsolute(target))
          throw new Error(
            `Nonportable absolute bundle link: ${path.relative(root, filename)}`,
          );
        const resolved = await fs.realpath(filename);
        if (resolved !== root && !resolved.startsWith(root + path.sep))
          throw new Error(
            `Bundle link leaves application: ${path.relative(root, filename)}`,
          );
        links++;
      } else if (entry.isDirectory()) await visit(filename);
    }
  }
  await visit(root);
  return links;
}

export async function copyMacBundle(source: string, destination: string) {
  await assertPortableMacBundle(source);
  try {
    await fs.lstat(destination);
    throw new Error(
      "Bundle destination already exists; refusing to overwrite it.",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.cp(source, destination, { recursive: true, verbatimSymlinks: true });
  await assertPortableMacBundle(destination);
}
