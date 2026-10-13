import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const require = createRequire(import.meta.url);
try {
  await promisify(execFile)(
    process.execPath,
    [require.resolve("electron/install.js")],
    {
      timeout: 180000,
      env: process.env,
    },
  );
} catch (error) {
  console.error(
    "Electron runtime installation failed or timed out. Check network/proxy settings and retry pnpm postinstall. ELECTRON_MIRROR may point to a trusted mirror; checksum verification remains enabled.",
  );
  console.error(
    error instanceof Error ? error.message : "Unknown installer error",
  );
  process.exitCode = 1;
}
