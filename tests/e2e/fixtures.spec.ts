import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { launch, dialogs, stop } from "./helpers";
import { unsupportedReason } from "../../packages/markdown-core/src/policy";
test("all 12 fixtures survive repeated modes and untouched save byte-for-byte", async () => {
  test.setTimeout(60000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-fixtures-"));
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    const names = (await fs.readdir("packages/test-fixtures/markdown"))
      .filter((name) => name.endsWith(".md"))
      .sort();
    expect(names).toHaveLength(12);
    for (const name of names) {
      const original = await fs.readFile(
        path.join("packages/test-fixtures/markdown", name),
      );
      const filename = path.join(directory, name);
      await fs.writeFile(filename, original);
      await dialogs(app, filename);
      await page.getByRole("button", { name: "打开", exact: true }).click();
      await expect
        .poll(
          async () => (await page.evaluate(() => window.chomy.status())).name,
        )
        .toBe(name);
      const source = original.toString("utf8").replace(/^\ufeff/, "");
      if (!unsupportedReason(source)) {
        await expect(page.locator(".ProseMirror")).toBeVisible();
        const fingerprint = () =>
          page.locator(".ProseMirror").evaluate((root) => ({
            headings: Array.from(
              root.querySelectorAll("h1,h2,h3,h4,h5,h6"),
              (node) => node.textContent,
            ),
            cells: Array.from(
              root.querySelectorAll("td,th"),
              (node) => node.textContent,
            ),
            code: Array.from(
              root.querySelectorAll("pre code"),
              (node) => node.textContent,
            ),
            links: Array.from(root.querySelectorAll("a"), (node) =>
              node.getAttribute("href"),
            ),
            images: Array.from(root.querySelectorAll("img"), (node) =>
              node.getAttribute("alt"),
            ),
          }));
        const before = await fingerprint();
        for (let cycle = 0; cycle < 3; cycle++) {
          await page.getByRole("button", { name: "源码", exact: true }).click();
          await expect(page.locator(".cm-content")).toBeVisible();
          await page.getByRole("button", { name: "源码", exact: true }).click();
          await expect(page.locator(".ProseMirror")).toBeVisible();
          expect(await fingerprint()).toEqual(before);
        }
      } else await expect(page.locator(".cm-content")).toBeVisible();
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "保存", exact: true }),
      ).toBeEnabled();
      expect(await fs.readFile(filename)).toEqual(original);
    }
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("composition events preserve committed CJK text and reject switching mid-composition", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-composition-"),
  );
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.dispatchEvent("compositionstart", { data: "" });
    await page.getByRole("button", { name: "源码", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("输入法组合");
    await editor.dispatchEvent("compositionend", { data: "你好" });
    await editor.click();
    await page.keyboard.insertText("你好，世界 👩🏽‍💻");
    await expect(editor).toContainText("你好，世界");
    await page.getByRole("button", { name: "源码", exact: true }).click();
    await expect(page.locator(".cm-content")).toContainText("你好，世界");
    expect(
      (await page.evaluate(() => window.chomy.status())).markdown.match(
        /你好，世界/g,
      ),
    ).toHaveLength(1);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("BOM and mixed line endings survive untouched source views and saves", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-newlines-"));
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    for (const frontmatter of [false, true]) {
      const name = frontmatter ? "mixed-frontmatter.md" : "mixed.md";
      const filename = path.join(directory, name);
      const original = Buffer.from(
        "\ufeff" +
          (frontmatter ? "---\r\ntitle: 保真\n---\r\n" : "") +
          "# Mixed\r\n\n中文 alpha\r\n\n## Second\n\r\n尾行\r\n",
      );
      await fs.writeFile(filename, original);
      await dialogs(app, filename);
      await page.getByRole("button", { name: "打开", exact: true }).click();
      await expect
        .poll(
          async () => (await page.evaluate(() => window.chomy.status())).name,
        )
        .toBe(name);
      await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
      if (!frontmatter)
        await page.getByRole("button", { name: "源码", exact: true }).click();
      await expect(page.locator(".cm-content")).toBeVisible();
      await page
        .evaluate(() => window.chomy.status())
        .then((snapshot) => {
          expect(snapshot.dirty).toBe(false);
          expect(snapshot.markdown).toBe(original.toString("utf8").slice(1));
        });
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "保存", exact: true }),
      ).toBeEnabled();
      expect(await fs.readFile(filename)).toEqual(original);
      if (!frontmatter) {
        await page.getByRole("button", { name: "源码", exact: true }).click();
        await expect(page.locator(".ProseMirror")).toBeVisible();
        await page.getByRole("button", { name: "保存", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "保存", exact: true }),
        ).toBeEnabled();
        expect(await fs.readFile(filename)).toEqual(original);
      }
    }
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
