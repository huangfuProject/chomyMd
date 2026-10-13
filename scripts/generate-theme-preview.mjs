import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const example = path.join(root, "packages/theme-engine/examples/paper");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-preview-"));
const theme = path.join(directory, "source-theme");
await fs.mkdir(theme);
const manifest = JSON.parse(
  await fs.readFile(path.join(example, "theme.json"), "utf8"),
);
delete manifest.preview;
await fs.writeFile(path.join(theme, "theme.json"), JSON.stringify(manifest));
await fs.copyFile(
  path.join(example, "theme.css"),
  path.join(theme, "theme.css"),
);
const app = await electron.launch({
  args: [path.join(root, "apps/desktop")],
  env: { ...process.env, CHOMY_TEST_DATA: path.join(directory, "data") },
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, theme);
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page
    .getByRole("button", { name: "安装主题文件夹", exact: true })
    .click();
  await page.getByLabel("主题", { exact: true }).selectOption("example.paper");
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText(
    '# Paper Example\n\n独立主题 · 本地 Markdown\n\n## Reading & writing\n\nA warm paper background with **clear typography**.\n\n> 保留你的文档，也保留你的风格。\n\n```typescript\nconst message = "Hello, Chomy";\n```\n',
  );
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page.locator(".ProseMirror h1").waitFor();
  const png = await page
    .locator(".chomy-document")
    .screenshot({ scale: "css" });
  await fs.writeFile(path.join(example, "preview.png.tmp"), png);
  await fs.rename(
    path.join(example, "preview.png.tmp"),
    path.join(example, "preview.png"),
  );
  console.log(
    `Generated Paper preview: ${png.readUInt32BE(16)} x ${png.readUInt32BE(20)} pixels.`,
  );
} finally {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app }) => app.exit(0));
  await closed;
  await fs.rm(directory, { recursive: true, force: true });
}
