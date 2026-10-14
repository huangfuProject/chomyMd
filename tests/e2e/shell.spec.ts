import { test, expect } from "@playwright/test";
import { launch, dialogs, stop, showTools, clickAction } from "./helpers";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("native editor and secure bridge initialize", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-e2e-"));
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.locator(".ProseMirror")).toBeVisible();
    expect(
      await page.evaluate(() => typeof Reflect.get(window, "require")),
    ).toBe("undefined");
    const metrics = await app.evaluate(({ app }) =>
      app.getAppMetrics().filter((value) => value.type === "Tab"),
    );
    expect(metrics.every((value) => value.sandboxed)).toBe(true);
    expect(
      await page.evaluate(async () => {
        try {
          await fetch("https://example.com");
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    if (process.env.CHOMY_EXECUTABLE)
      expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    await page.locator(".ProseMirror").fill("中文与 emoji 👩🏽‍💻");
    await expect(page.locator(".ProseMirror")).toContainText("中文与 emoji");
    await page.screenshot({ path: "test-results/chomy-editor.png" });
    expect(errors).toEqual([]);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("open, edit, mode switch, undo, save, external conflict and recover", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-workflow-"));
  const filename = path.join(directory, "中文 空格.md");
  await fs.writeFile(filename, "# Original\n\nOriginal paragraph.\n");
  let app = await launch(directory);
  try {
    await dialogs(app, filename);
    let page = await app.firstWindow();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await clickAction(page, "打开");
    await expect(page.locator(".ProseMirror h1")).toHaveText("Original");
    await clickAction(page, "源码");
    await expect(page.locator(".cm-content")).toBeVisible();
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "End",
    );
    await page.keyboard.type("\n中文 new content");
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(filename, "utf8"))
      .toContain("中文 new content");
    await clickAction(page, "源码");
    await expect(page.locator(".ProseMirror")).toContainText(
      "中文 new content",
    );
    await clickAction(page, "源码");
    await expect(page.locator(".cm-content")).toBeVisible();
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "End",
    );
    await page.keyboard.type(" recovery draft");
    await expect
      .poll(async () => {
        try {
          return (await fs.readdir(path.join(directory, "data/recovery")))
            .length;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(0);
    await fs.writeFile(filename, "EXTERNAL content");
    await clickAction(page, "保存");
    await expect(page.getByRole("alert")).toContainText("外部修改");
    expect(await fs.readFile(filename, "utf8")).toBe("EXTERNAL content");
    await stop(app);
    app = await launch(directory);
    page = await app.firstWindow();
    await expect(page.getByText("发现未保存的恢复内容")).toBeVisible();
    await page.getByRole("button", { name: "恢复", exact: true }).click();
    await expect(page.locator(".ProseMirror")).toContainText("recovery draft");
    expect(await fs.readFile(filename, "utf8")).toBe("EXTERNAL content");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("unknown Markdown survives source/reading/save with no script execution", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-unknown-"));
  const filename = path.join(directory, "unknown.md");
  const original =
    "---\ntitle: custom\n---\n\n<script>window.COMPROMISED=true</script>\n\n:::custom\nopaque payload\n:::\n";
  await fs.writeFile(filename, original);
  const app = await launch(directory);
  try {
    await dialogs(app, filename);
    const page = await app.firstWindow();
    await clickAction(page, "打开");
    await expect(page.locator(".cm-content")).toContainText("opaque payload");
    await clickAction(page, "阅读");
    await expect(page.locator(".reading-preview")).toContainText(
      "opaque payload",
    );
    expect(
      await page.evaluate(() => Reflect.get(window, "COMPROMISED")),
    ).toBeUndefined();
    await clickAction(page, "保存");
    expect(await fs.readFile(filename, "utf8")).toBe(original);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("table edits, undo across modes, image archive, theme persistence and portable exports", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-advanced-"));
  const filename = path.join(directory, "advanced.md");
  await fs.writeFile(filename, "# Advanced\n\nBase paragraph.\n");
  let app = await launch(directory);
  try {
    await dialogs(app, filename);
    let page = await app.firstWindow();
    await clickAction(page, "打开");
    await expect(page.locator(".ProseMirror h1")).toHaveText("Advanced");
    await clickAction(page, "偏好设置");
    await page.getByLabel("插入方式").selectOption("local");
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await page.locator(".ProseMirror p").click();
    await showTools(page);
    await page.getByRole("button", { name: "表格", exact: true }).click();
    await expect(page.locator(".ProseMirror table")).toBeVisible();
    const rows = await page.locator(".ProseMirror tr").count();
    await page.locator(".ProseMirror td").first().click();
    await page.getByRole("button", { name: "＋行", exact: true }).click();
    expect(await page.locator(".ProseMirror tr").count()).toBeGreaterThan(rows);
    await clickAction(page, "保存");
    await expect.poll(async () => fs.readFile(filename, "utf8")).toContain("|");
    const before = await page.evaluate(() => window.chomy.status());
    await clickAction(page, "源码");
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "End",
    );
    await page.keyboard.insertText("\nUNDO_TARGET");
    await expect(page.locator(".cm-content")).toContainText("UNDO_TARGET");
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "z",
    );
    await expect
      .poll(
        async () => (await page.evaluate(() => window.chomy.status())).markdown,
      )
      .toBe(before.markdown);
    const image = path.join(directory, "picture.png");
    await fs.writeFile(
      image,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    await dialogs(app, image);
    await showTools(page);
    await page.getByRole("button", { name: "附件", exact: true }).click();
    await expect(page.locator(".cm-content")).toContainText("./assets/");
    expect(await fs.readFile(image)).toBeTruthy();
    expect((await fs.readdir(path.join(directory, "assets"))).length).toBe(1);
    await dialogs(app, filename);
    await clickAction(page, "保存");
    await clickAction(page, "偏好设置");
    await page.getByLabel("主题", { exact: true }).selectOption("chomy-dark");
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await expect(page.locator(".dark-shell")).toBeVisible();
    await stop(app);
    app = await launch(directory);
    page = await app.firstWindow();
    await expect(page.locator(".dark-shell")).toBeVisible();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const html = path.join(directory, "export.html");
    await dialogs(app, html);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "chomy:v1:command",
        "export-html",
      ),
    );
    await expect
      .poll(async () => {
        try {
          return await fs.readFile(html, "utf8");
        } catch {
          return "";
        }
      })
      .toContain("data:image/png;base64,");
    const pdf = path.join(directory, "export.pdf");
    await dialogs(app, pdf);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "chomy:v1:command",
        "export-pdf",
      ),
    );
    await expect
      .poll(async () => {
        try {
          return (await fs.readFile(pdf)).subarray(0, 5).toString();
        } catch {
          return "";
        }
      })
      .toBe("%PDF-");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("code language, math/Mermaid preview and 1 MB source editing", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-render-"));
  const filename = path.join(directory, "render.md");
  await fs.writeFile(
    filename,
    "# Rendering\n\n```typescript\nconst answer = 42;\n```\n",
  );
  const app = await launch(directory);
  try {
    await dialogs(app, filename);
    const page = await app.firstWindow();
    await clickAction(page, "打开");
    await expect(page.getByLabel("代码语言")).toHaveValue("typescript");
    await expect(page.locator(".hljs-keyword")).toBeVisible();
    await page.getByLabel("代码语言").selectOption("python");
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(filename, "utf8"))
      .toContain("```python");
    const advanced = path.join(directory, "math.md");
    await fs.writeFile(
      advanced,
      "$$E=mc^2$$\n\nInline $x^2$ and `$literal$`.\n\n````text\n$CODE_LITERAL$\n```nested\n$NESTED_LITERAL$\n```\n````\n\n```mermaid\ngraph LR\n A --> B\n```\n",
    );
    await dialogs(app, advanced);
    await clickAction(page, "打开");
    await clickAction(page, "阅读");
    await expect(page.locator(".katex")).toHaveCount(2);
    await expect(
      page.locator(".reading-preview code").filter({ hasText: "$literal$" }),
    ).toHaveText("$literal$");
    await expect(
      page
        .locator(".reading-preview pre code")
        .filter({ hasText: "$CODE_LITERAL$" }),
    ).toContainText("$NESTED_LITERAL$");
    await expect(page.locator(".diagram svg")).toBeVisible();
    const large = path.join(directory, "large.md");
    await fs.copyFile(
      "packages/test-fixtures/markdown/10-large-document.md",
      large,
    );
    await dialogs(app, large);
    const start = Date.now();
    await clickAction(page, "打开");
    await expect(page.locator(".cm-content")).toBeVisible();
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "End",
    );
    await page.keyboard.insertText("LARGE_EDIT");
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(large, "utf8"))
      .toContain("LARGE_EDIT");
    await fs.writeFile(
      "test-results/performance.json",
      JSON.stringify(
        {
          largeDocumentOpenEditSaveMs: Date.now() - start,
          bytes: (await fs.stat(large)).size,
          platform: process.platform,
          architecture: process.arch,
        },
        null,
        2,
      ),
    );
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Java and language aliases highlight, persist, and preserve unknown labels", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-languages-"),
  );
  const filename = path.join(directory, "languages.md");
  await fs.writeFile(
    filename,
    [
      "# Languages",
      "",
      "```Java",
      'public class Hello { String greeting = "你好"; }',
      "```",
      "",
      "```js",
      "const answer = 42;",
      "```",
      "",
      "```custom-language",
      "<script>const answer = 42;</script>",
      "```",
      "",
    ].join("\n"),
  );
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const selectors = page.getByLabel("代码语言");
    await expect(selectors).toHaveCount(3);
    await expect(selectors.nth(0)).toHaveValue("Java");
    await expect(selectors.nth(1)).toHaveValue("js");
    await expect(selectors.nth(2)).toHaveValue("custom-language");
    await expect(
      page.locator(".code-block").nth(0).locator(".hljs-keyword").first(),
    ).toHaveText("public");
    await expect(
      page.locator(".code-block").nth(1).locator(".hljs-keyword").first(),
    ).toHaveText("const");
    await expect(page.locator(".code-block").nth(2).locator("code")).toHaveText(
      "<script>const answer = 42;</script>",
    );
    await selectors.nth(0).selectOption("java");
    await clickAction(page, "保存");
    await expect.poll(() => fs.readFile(filename, "utf8")).toContain("```java");
    const saved = await fs.readFile(filename, "utf8");
    expect(saved).toContain("```js");
    expect(saved).toContain("```custom-language");
    await clickAction(page, "阅读");
    const blocks = page.locator(".reading-preview pre code");
    await expect(blocks.nth(0).locator(".hljs-keyword").first()).toHaveText(
      "public",
    );
    await expect(blocks.nth(1).locator(".hljs-keyword").first()).toHaveText(
      "const",
    );
    await expect(blocks.nth(2)).toHaveText(
      "<script>const answer = 42;</script>",
    );
    await expect(blocks.nth(2).locator("script")).toHaveCount(0);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
