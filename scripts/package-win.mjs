import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("@electron-forge/cli/dist/electron-forge-package.js"),
    "--platform=win32",
    "--arch=x64",
  ],
  {
    cwd: path.resolve(import.meta.dirname, "../apps/desktop"),
    stdio: "inherit",
    env: {
      ...process.env,
      ...(process.platform !== "win32" ? { CHOMY_PORTABLE_CROSS: "1" } : {}),
    },
  },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
