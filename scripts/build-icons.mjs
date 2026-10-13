import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "apps/desktop/assets");
if (process.platform !== "darwin")
  throw new Error(
    "Icon rasterization uses macOS AppKit; generated assets are portable.",
  );
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-icons-"));
try {
  execFileSync("swift", [
    path.join(root, "scripts/create-icons.swift"),
    path.join(assets, "logo-master.png"),
    directory,
  ]);
  await fs.copyFile(
    path.join(directory, "1024.png"),
    path.join(assets, "icon.png"),
  );
  const chunks = [];
  for (const [type, size] of [
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
  ]) {
    const png = await fs.readFile(path.join(directory, `${size}.png`));
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    chunks.push(header, png);
  }
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(
    chunks.reduce((sum, part) => sum + part.length, 8),
    4,
  );
  await fs.writeFile(
    path.join(assets, "icon.icns"),
    Buffer.concat([header, ...chunks]),
  );
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = await Promise.all(
    sizes.map((size) => fs.readFile(path.join(directory, `${size}.png`))),
  );
  const icoHeader = Buffer.alloc(6 + sizes.length * 16);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(sizes.length, 4);
  let offset = icoHeader.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    icoHeader[entry] = size === 256 ? 0 : size;
    icoHeader[entry + 1] = size === 256 ? 0 : size;
    icoHeader.writeUInt16LE(1, entry + 4);
    icoHeader.writeUInt16LE(32, entry + 6);
    icoHeader.writeUInt32LE(images[index].length, entry + 8);
    icoHeader.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await fs.writeFile(
    path.join(assets, "icon.ico"),
    Buffer.concat([icoHeader, ...images]),
  );
  await fs.copyFile(
    path.join(directory, "32.png"),
    path.join(assets, "logo-32.png"),
  );
  console.log("Created PNG, ICNS and ICO from the Chomy master.");
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
