import { build as bundle } from "esbuild";
import { build as vite } from "vite";
import { rm } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const desktop = path.join(root, "apps/desktop");
await rm(path.join(desktop, "dist"), { recursive: true, force: true });
await bundle({
  entryPoints: [path.join(desktop, "src/main/index.ts")],
  outfile: path.join(desktop, "dist/main.cjs"),
  bundle: true,
  minify: true,
  keepNames: true,
  legalComments: "eof",
  platform: "node",
  alias: { "css-tree": path.join(root, "node_modules/css-tree/cjs/index.cjs") },
  format: "cjs",
  target: "node22",
  external: ["electron"],
});
await bundle({
  entryPoints: [path.join(desktop, "src/preload/index.ts")],
  outfile: path.join(desktop, "dist/preload.cjs"),
  bundle: true,
  minify: true,
  keepNames: true,
  legalComments: "eof",
  platform: "node",
  format: "cjs",
  target: "chrome140",
  external: ["electron"],
});
await vite({
  logLevel: "warn",
  root: path.join(desktop, "src/renderer"),
  base: "./",
  build: { outDir: path.join(desktop, "dist/renderer"), emptyOutDir: true },
});
