import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-ui-"));
const output = path.join(root, "docs/testing/screenshots");
await fs.mkdir(output, { recursive: true });
const filename = path.join(directory, "Writing.md");
await fs.writeFile(
  filename,
  '# 写作，从这里开始\n\n## 简洁的 Markdown 工作空间\n\n用 **清晰的文字** 记录想法，在排版后的文档中直接编辑。\n\n> 让注意力留在内容，让工具在需要时出现。\n\n- [x] 本地文件与相对图片\n- [ ] 把今天的想法写下来\n\n| 功能 | 体验 |\n| --- | --- |\n| 可视编辑 | 自然书写 |\n| 主题 | 自由表达 |\n\n```typescript\nconst greeting = "你好，Chomy";\n```\n',
);
const app = await electron.launch({
  args: [path.join(root, "apps/desktop")],
  env: { ...process.env, CHOMY_TEST_DATA: path.join(directory, "data") },
});
try {
  await app.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filename],
    });
  }, filename);
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await expect(page.locator(".ProseMirror h1")).toHaveText("写作，从这里开始");
  await expect(
    page.getByRole("button", { name: "写作，从这里开始", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "chomy-light.png"),
    scale: "css",
  });
  await page.locator(".ProseMirror td").first().click();
  await expect(
    page.getByRole("button", { name: "＋行", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "chomy-table.png"),
    scale: "css",
  });
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("chomy-dark");
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/dark-shell/);
  await page.locator(".ProseMirror h1").click();
  await page.screenshot({
    path: path.join(output, "chomy-dark.png"),
    scale: "css",
  });
  await app.evaluate(
    ({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    },
    path.join(root, "packages/theme-engine/examples/paper"),
  );
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page
    .getByRole("button", { name: "安装主题文件夹", exact: true })
    .click();
  await page.getByLabel("主题", { exact: true }).selectOption("example.paper");
  await expect(page.locator(".theme-preview")).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".theme-preview").evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: path.join(output, "chomy-preferences.png"),
    scale: "css",
  });
  console.log(
    "Captured light, dark, table and theme preferences at CSS pixel scale.",
  );
} finally {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app }) => app.exit(0));
  await closed;
  await fs.rm(directory, { recursive: true, force: true });
}
