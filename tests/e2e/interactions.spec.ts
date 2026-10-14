import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launch, dialogs, stop, showTools, clickAction } from "./helpers";
const modifier = process.platform === "darwin" ? "Meta" : "Control";
test("heading and list input rules, table content preservation and source heading commands", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-input-"));
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("# Heading");
    await expect(editor.locator("h1")).toHaveText("Heading");
    await page.keyboard.press("Enter");
    await page.keyboard.type("- First");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second");
    await expect(editor.locator("li")).toHaveCount(2);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Outside");
    await expect(editor.locator("li")).toHaveCount(2);
    await expect(editor.locator("p").last()).toHaveText("Outside");
    await showTools(page);
    await page.getByRole("button", { name: "表格", exact: true }).click();
    const cell = editor.locator("td").first();
    await cell.click();
    await page.keyboard.type("KEEP_CELL");
    await page.getByRole("button", { name: "＋列", exact: true }).click();
    await expect(editor.locator("table")).toContainText("KEEP_CELL");
    await editor.locator("tr").nth(1).locator("td").nth(1).click();
    await page.getByRole("button", { name: "－列", exact: true }).click();
    await expect(editor.locator("table")).toContainText("KEEP_CELL");
    await clickAction(page, "源码");
    await page.locator(".cm-content").click();
    await page.keyboard.press(`${modifier}+Home`);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "chomy:v1:command",
        "heading-2",
      ),
    );
    await expect(page.locator(".cm-content")).toContainText("## Heading");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "chomy:v1:command",
        "paragraph",
      ),
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.chomy.status())).markdown.split(
            "\n",
          )[0],
      )
      .toBe("Heading");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("default original paths insert in an untitled document without a save dialog and survive save/restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-original-"));
  const image = path.join(directory, "中文 (图).png");
  const attachment = path.join(directory, "附件.txt");
  const filename = path.join(directory, "document.md");
  await fs.writeFile(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await fs.writeFile(attachment, "original attachment");
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await dialogs(app, image);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => {
        throw Error("Original references must not ask to save");
      };
    });
    await page.locator(".ProseMirror").click();
    await showTools(page);
    await page.getByRole("button", { name: "附件", exact: true }).click();
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "中文 (图).png" })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    expect((await page.evaluate(() => window.chomy.status())).saved).toBe(
      false,
    );
    await dialogs(app, attachment);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => {
        throw Error("Original attachments must not ask to save");
      };
    });
    await page.locator(".ProseMirror").click();
    await page.getByRole("button", { name: "附件", exact: true }).click();
    await expect(page.locator(".ProseMirror")).toContainText("附件.txt");
    await app.evaluate(
      ({ shell }, expected) => {
        shell.openPath = async (actual) => {
          if (actual !== expected) throw Error("Unexpected attachment path");
          return "";
        };
      },
      await fs.realpath(attachment),
    );
    const href = await page
      .getByRole("link", { name: "附件.txt" })
      .getAttribute("href");
    expect(href).toMatch(/^file:/);
    await page.evaluate((url) => window.chomy.openLink(url!), href);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await clickAction(page, "阅读");
    await expect
      .poll(async () =>
        page
          .locator(".reading-preview img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    await dialogs(app, filename);
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(filename, "utf8").catch(() => ""))
      .toContain("file:///");
    expect(await fs.readdir(directory)).not.toContain("assets");
    await stop(app);
    app = await launch(directory);
    page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "中文 (图).png" })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    await clickAction(page, "偏好设置");
    await expect(page.getByLabel("插入方式")).toHaveValue("reference");
    await page.getByLabel("存储类型").selectOption("qiniu");
    await expect(page.getByLabel("Region")).toHaveValue("z0");
    await expect(page.getByLabel("S3 path-style")).toHaveCount(0);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("reference attachment displays only after explicit selection and survives restart", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-reference-"),
  );
  const notes = path.join(directory, "notes");
  await fs.mkdir(notes);
  const filename = path.join(notes, "doc.md");
  const image = path.join(directory, "中文 图.png");
  await fs.writeFile(filename, "# Reference\n\nParagraph\n");
  await fs.writeFile(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    await expect(page.locator(".ProseMirror h1")).toHaveText("Reference");
    await clickAction(page, "偏好设置");
    await page.getByLabel("插入方式").selectOption("reference");
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await page.locator(".ProseMirror p").click();
    await dialogs(app, image);
    await showTools(page);
    await page.getByRole("button", { name: "附件", exact: true }).click();
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "中文 图.png" })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    await dialogs(app, filename);
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(filename, "utf8"))
      .toContain("../");
    expect(await fs.readdir(notes)).toEqual(["doc.md"]);
    await stop(app);
    app = await launch(directory);
    page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "中文 图.png" })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("remote images are offline by default and use the bounded main protocol when enabled", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-remote-"));
  const filename = path.join(directory, "remote.md");
  await fs.writeFile(
    filename,
    "![pixel](https://images.example.test/pixel.png)\n",
  );
  const app = await launch(directory);
  try {
    await app.evaluate(({ net }) => {
      const original = net.fetch;
      Reflect.set(globalThis, "remoteImageRequests", 0);
      net.fetch = async (input, init) => {
        if (String(input) === "https://images.example.test/pixel.png") {
          Reflect.set(
            globalThis,
            "remoteImageRequests",
            Number(Reflect.get(globalThis, "remoteImageRequests")) + 1,
          );
          return new Response(
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
              "base64",
            ),
            { headers: { "content-type": "image/png" } },
          );
        }
        return original(input, init);
      };
    });
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    await expect(page.getByRole("img")).toBeVisible();
    expect(
      await app.evaluate(() => Reflect.get(globalThis, "remoteImageRequests")),
    ).toBe(0);
    await clickAction(page, "偏好设置");
    await page.getByLabel("加载 HTTPS 远程图片", { exact: false }).check();
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "pixel", exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    expect(
      await app.evaluate(() => Reflect.get(globalThis, "remoteImageRequests")),
    ).toBeGreaterThan(0);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("file switching blocks late input until the new document session is ready", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-switch-"));
  const filename = path.join(directory, "new.md");
  await fs.writeFile(filename, "# New session\n");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await page.locator(".ProseMirror").fill("Old buffer");
    await app.evaluate(({ dialog }, filename) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      dialog.showOpenDialog = () =>
        new Promise((resolve) =>
          Reflect.set(globalThis, "completeFileDialog", () =>
            resolve({ canceled: false, filePaths: [filename] }),
          ),
        );
    }, filename);
    await clickAction(page, "打开");
    await expect(page.locator(".document-scroll")).toHaveAttribute("inert", "");
    await page.keyboard.insertText("LATE_INPUT");
    await expect(page.locator(".ProseMirror")).not.toContainText("LATE_INPUT");
    await expect
      .poll(async () =>
        app.evaluate(
          () => typeof Reflect.get(globalThis, "completeFileDialog"),
        ),
      )
      .toBe("function");
    await app.evaluate(() => {
      const complete = Reflect.get(globalThis, "completeFileDialog");
      if (typeof complete === "function") complete();
    });
    await expect(page.locator(".ProseMirror h1")).toHaveText("New session");
    await expect(page.locator(".document-scroll")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(await fs.readFile(filename, "utf8")).toBe("# New session\n");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("pasting an image into a new document first chooses a Markdown location and copies the image", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-paste-"));
  const filename = path.join(directory, "new.md");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await page.locator(".ProseMirror").fill("New document");
    await page.locator(".ProseMirror").evaluate((root) => {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8sAAAAASUVORK5CYII=",
        ),
        (char) => char.charCodeAt(0),
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
      root.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "粘贴图片.png", exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    expect(await fs.readFile(filename, "utf8")).toContain("New document");
    expect(await fs.readdir(path.join(directory, "assets"))).toHaveLength(1);
    await clickAction(page, "保存");
    await expect
      .poll(async () => fs.readFile(filename, "utf8"))
      .toContain("./assets/");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("installs an independent theme, keeps it after restart and falls back when removed", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-theme-"));
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await dialogs(app, path.resolve("packages/theme-engine/examples/paper"));
    await clickAction(page, "偏好设置");
    await page
      .getByRole("button", { name: "安装主题文件夹", exact: true })
      .click();
    await page
      .getByLabel("主题", { exact: true })
      .selectOption("example.paper");
    await expect
      .poll(async () =>
        page
          .getByRole("img", { name: "Paper Example 主题预览" })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await expect(page.locator(".chomy-document")).toHaveCSS(
      "background-color",
      "rgb(255, 248, 237)",
    );
    await stop(app);
    app = await launch(directory);
    page = await app.firstWindow();
    await expect(page.locator(".chomy-document")).toHaveCSS(
      "background-color",
      "rgb(255, 248, 237)",
    );
    await clickAction(page, "偏好设置");
    await page
      .getByRole("button", { name: "移除所选主题", exact: true })
      .click();
    await page.getByRole("button", { name: "保存偏好", exact: true }).click();
    await expect(page.locator(".chomy-document")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    expect(
      (await fs.readdir(path.join(directory, "data/themes"))).includes(
        "example.paper",
      ),
    ).toBe(false);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("task checkboxes toggle, undo across modes and persist as Markdown", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-tasks-"));
  const filename = path.join(directory, "tasks.md");
  await fs.writeFile(
    filename,
    "# Tasks\n\n- [ ] 第一项\n- [x] 第二项\n  - [ ] 子项\n",
  );
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const task = page.getByRole("checkbox", {
      name: "切换待办：第一项",
      exact: true,
    });
    await expect(task).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "切换待办：第二项子项", exact: true }),
    ).toBeChecked();
    await task.check();
    await clickAction(page, "保存");
    await expect
      .poll(() => fs.readFile(filename, "utf8"))
      .toContain("[x] 第一项");
    await clickAction(page, "源码");
    await page.locator(".cm-content").click();
    await page.keyboard.press(
      (process.platform === "darwin" ? "Meta+" : "Control+") + "z",
    );
    await expect(page.locator(".cm-content")).toContainText("[ ] 第一项");
    await clickAction(page, "源码");
    await expect(task).not.toBeChecked();
    await expect(page.getByRole("checkbox")).toHaveCount(3);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Down exits the last code line into a paragraph and preserves the code", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-code-exit-"),
  );
  const filename = path.join(directory, "code.md");
  await fs.writeFile(filename, "```java\nfirst();\nlast();\n```\n");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const editor = page.locator(".ProseMirror");
    const code = editor.locator(".code-block code");
    await expect(code).toHaveText("first();\nlast();");
    await code.click();
    await page.keyboard.press(`${modifier}+Home`);
    await page.keyboard.press("ArrowDown");
    // Moving from the first line remains inside the fence.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            window.getSelection()?.anchorNode?.parentElement?.closest("code"),
          ),
        ),
      )
      .toBe(true);
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("Outside code");
    await expect(editor.locator("p").last()).toHaveText("Outside code");
    await expect(code).toHaveText("first();\nlast();");
    await clickAction(page, "保存");
    await expect
      .poll(() => fs.readFile(filename, "utf8"))
      .toContain("```java\nfirst();\nlast();\n```\n\nOutside code");
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CJK emphasis renders, accepts typed markers and survives source/save/reading", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-emphasis-"));
  const filename = path.join(directory, "emphasis.md");
  await fs.writeFile(
    filename,
    "*你好* 与 *Hello*。\n\n`*你好*`\n\n\\*你好\\*\n\n输入：\n",
  );
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const editor = page.locator(".ProseMirror");
    await expect(editor.locator("em")).toHaveText(["你好", "Hello"]);
    const emphasis = editor.locator("em").first();
    await expect(emphasis).toHaveCSS("font-style", "italic");
    await expect
      .poll(() =>
        emphasis.evaluate((el) => getComputedStyle(el).fontSynthesisStyle),
      )
      .toBe("auto");
    await expect(editor.locator("code")).toHaveText("*你好*");
    await expect(editor.locator("p").nth(2)).toHaveText("*你好*");
    await editor.locator("p").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type("*");
    await page.keyboard.insertText("中文");
    await page.keyboard.type("*");
    await expect(editor.locator("em").last()).toHaveText("中文");
    await page.keyboard.type(" plain");
    await expect(editor.locator("em").last()).toHaveText("中文");
    await clickAction(page, "源码");
    await expect(page.locator(".cm-content")).toContainText("*中文*");
    await clickAction(page, "保存");
    await expect.poll(() => fs.readFile(filename, "utf8")).toContain("*中文*");
    await clickAction(page, "阅读");
    await expect(page.locator(".reading-preview em")).toHaveText([
      "你好",
      "Hello",
      "中文",
    ]);
    await expect
      .poll(() =>
        page
          .locator(".reading-preview em")
          .first()
          .evaluate((el) => getComputedStyle(el).fontSynthesisStyle),
      )
      .toBe("auto");
    await expect(page.locator(".reading-preview code")).toHaveText("*你好*");
    const html = path.join(directory, "emphasis.html");
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
      .toContain("<em>你好</em>");
    expect(await fs.readFile(html, "utf8")).toContain(
      "font-synthesis: weight style",
    );
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("bulk and IME emphasis commits do not serialize as escaped asterisks", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-ime-emphasis-"),
  );
  const filename = path.join(directory, "input.md");
  await fs.writeFile(filename, "Start\n");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const editor = page.locator(".ProseMirror");
    await expect(editor.locator("p")).toHaveText("Start");
    await editor.click();
    await page.keyboard.press(`${modifier}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("*你好*");
    await expect(editor.locator("em")).toHaveText("你好");
    await page.keyboard.press("Enter");
    await editor.dispatchEvent("compositionstart", { data: "" });
    await page.keyboard.insertText("*输入法*");
    await editor.dispatchEvent("compositionend", { data: "*输入法*" });
    await expect(editor.locator("em")).toHaveText(["你好", "输入法"]);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("\\*字面星号\\*");
    await expect(editor.locator("em")).toHaveCount(2);
    await clickAction(page, "保存");
    await expect
      .poll(() => fs.readFile(filename, "utf8"))
      .toContain("*输入法*");
    const saved = await fs.readFile(filename, "utf8");
    expect(saved).toContain("*你好*");
    expect(saved).toContain("*输入法*");
    expect(saved).not.toContain("\\*你好\\*");
    expect(saved).not.toContain("\\*输入法\\*");
    await clickAction(page, "源码");
    await expect(page.locator(".cm-content")).toContainText("*你好*");
    await clickAction(page, "阅读");
    await expect(page.locator(".reading-preview em")).toHaveText([
      "你好",
      "输入法",
    ]);
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("character input and IME confirmation by Space/Enter keep unescaped emphasis", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-confirm-emphasis-"),
  );
  const filename = path.join(directory, "confirm.md");
  await fs.writeFile(filename, "");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const editor = page.locator(".ProseMirror");
    for (const mode of [
      "characters",
      "shift-eight",
      "ime-space",
      "ime-enter",
    ]) {
      await editor.click();
      await page.keyboard.press(`${modifier}+a`);
      await page.keyboard.press("Backspace");
      if (mode === "characters")
        await page.keyboard.type("*asdasdasdas*", { delay: 30 });
      if (mode === "shift-eight") {
        await page.keyboard.press("Shift+Digit8");
        await page.keyboard.type("asdasdasdas", { delay: 30 });
        await page.keyboard.press("Shift+Digit8");
      }
      if (mode.startsWith("ime-")) {
        await editor.dispatchEvent("compositionstart", { data: "" });
        await page.keyboard.insertText("*asdasdasdas*");
        await page.keyboard.press(mode === "ime-space" ? "Space" : "Enter");
        await editor.dispatchEvent("compositionend", { data: "*asdasdasdas*" });
      }
      await expect(editor.locator("em")).toHaveText("asdasdasdas");
      await page.keyboard.type(" AFTER");
      await expect(editor.locator("em")).toHaveText("asdasdasdas");
      await clickAction(page, "保存");
      await expect.poll(() => fs.readFile(filename, "utf8")).toContain("AFTER");
      const saved = await fs.readFile(filename, "utf8");
      expect(saved).toContain("*asdasdasdas*");
      expect(saved).not.toContain("\\*asdasdasdas\\*");
    }
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("typing inside an existing emphasis pair preserves formatting and saved Markdown", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chomy-pair-emphasis-"),
  );
  const filename = path.join(directory, "pairs.md");
  await fs.writeFile(filename, "");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await dialogs(app, filename);
    await clickAction(page, "打开");
    const editor = page.locator(".ProseMirror");
    for (const [pair, text, selector, ime] of [
      ["**", "ddd", "em", false],
      ["****", "bold", "strong", false],
      ["**", "你好", "em", true],
    ] as const) {
      await editor.click();
      await page.keyboard.press(`${modifier}+a`);
      await page.keyboard.press("Backspace");
      await page.keyboard.type(pair, { delay: 25 });
      for (let i = 0; i < pair.length / 2; i++)
        await page.keyboard.press("ArrowLeft");
      if (ime) {
        await editor.dispatchEvent("compositionstart", { data: "" });
        await page.keyboard.insertText(text);
        await editor.dispatchEvent("compositionend", { data: text });
      } else await page.keyboard.type(text, { delay: 25 });
      await expect(editor.locator(selector)).toHaveText(text);
      await clickAction(page, "保存");
      const marker = pair.slice(0, pair.length / 2);
      await expect
        .poll(() => fs.readFile(filename, "utf8"))
        .toContain(`${marker}${text}${marker}`);
      expect(await fs.readFile(filename, "utf8")).not.toContain("\\*");
      await clickAction(page, "源码");
      await expect(page.locator(".cm-content")).toContainText(
        `${marker}${text}${marker}`,
      );
      await clickAction(page, "源码");
    }
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
