import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-chrome-"));
const app = await electron.launch({
  args: [path.join(root, "apps/desktop")],
  env: { ...process.env, CHOMY_TEST_DATA: path.join(directory, "data") },
});
try {
  const page = await app.firstWindow();
  await expect(page.locator(".ProseMirror")).toBeVisible();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(860, 540),
  );
  await page.locator(".ProseMirror").fill("typora");
  await page.locator(".titlebar").click({ position: { x: 300, y: 15 } });
  await page.screenshot({
    path: path.join(
      root,
      "docs/testing/screenshots/chomy-chrome-reference.png",
    ),
    scale: "device",
  });
  const metrics = await page.evaluate(() =>
    Object.fromEntries(
      [".sidebar", ".titlebar", ".ProseMirror", ".sidebar-empty"].map(
        (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [
            selector,
            { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ];
        },
      ),
    ),
  );
  await fs.writeFile(
    path.join(root, "docs/testing/chrome-layout.json"),
    JSON.stringify({ window: { width: 860, height: 540 }, metrics }, null, 2) +
      "\n",
  );
} finally {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app }) => app.exit(0));
  await closed;
  await fs.rm(directory, { recursive: true, force: true });
}
