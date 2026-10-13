import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const directory = path.resolve(
  `apps/desktop/out/Chomy-${process.platform}-${process.arch}`,
);
const executable = path.join(
  directory,
  process.platform === "darwin"
    ? "Chomy.app/Contents/MacOS/Chomy"
    : process.platform === "win32"
      ? "Chomy.exe"
      : "Chomy",
);
await access(executable);
const child = spawn(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test"],
  { stdio: "inherit", env: { ...process.env, CHOMY_EXECUTABLE: executable } },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
