import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = path.resolve(import.meta.dirname, "..");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-styles-"));
const output = path.join(root, "docs/testing/screenshots");
const sample = await fs.readFile(
  path.join(root, "research/typora-1.4/fixtures/layout-reference.md"),
  "utf8",
);
const richFile = path.join(directory, "Tables.md");
await fs.writeFile(
  richFile,
  sample
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace("$E=mc^2$", "E = mc²")
    .replace("两行内容<br>第二行", "两行内容 第二行"),
);
const app = await electron.launch({
  args: [path.join(root, "apps/desktop")],
  env: { ...process.env, CHOMY_TEST_DATA: path.join(directory, "data") },
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1728, height: 1084 }),
  );
  const open = async (filename) => {
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [filename],
      });
    }, filename);
    await page.locator(".document-menu > summary").click();
    await page.getByRole("button", { name: "打开", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.chomy.status()).then((x) => x.name),
      )
      .toBe(path.basename(filename));
  };
  await open(richFile);
  await expect(page.locator(".ProseMirror th").first()).toHaveText("项目");
  await page.screenshot({
    path: path.join(output, "tables-rich-light.png"),
    scale: "device",
  });
  const metrics = await page
    .locator(".ProseMirror table")
    .evaluate((table) => ({
      rowHeights: Array.from(
        table.rows,
        (row) => row.getBoundingClientRect().height,
      ),
      firstRowWidths: Array.from(
        table.rows[0].cells,
        (cell) => cell.getBoundingClientRect().width,
      ),
      alignments: Array.from(
        table.rows[0].cells,
        (cell) => getComputedStyle(cell).textAlign,
      ),
      cellParagraphMargins: Array.from(
        table.querySelectorAll("td p"),
        (p) => getComputedStyle(p).margin,
      ),
    }));
  await open(
    path.join(root, "research/typora-1.4/fixtures/layout-reference.md"),
  );
  await page.locator(".document-menu > summary").click();
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  await expect(page.locator(".reading-preview .math-block")).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(output, "tables-math-light.png"),
    scale: "device",
  });
  await page.locator(".document-menu > summary").click();
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("chomy-dark");
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/dark-shell/);
  await expect
    .poll(() =>
      page
        .locator(".chomy-document")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(32, 34, 38)");
  await page.screenshot({
    path: path.join(output, "tables-math-dark.png"),
    scale: "device",
  });
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app }) => app.exit(0));
  await closed;
  await fs.rm(directory, { recursive: true, force: true });
}
