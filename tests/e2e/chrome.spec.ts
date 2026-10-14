import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launch, stop, clickAction, dialogs } from "./helpers";

test("minimal chrome keeps sidebar, menus and document controls usable", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chomy-chrome-"));
  const folder = path.join(directory, "docs");
  await fs.mkdir(path.join(folder, "nested"), { recursive: true });
  const filename = path.join(folder, "current.md");
  await fs.writeFile(filename, "");
  await fs.writeFile(path.join(folder, "sibling.md"), "# Sibling\n");
  await fs.writeFile(path.join(folder, "nested", "child.md"), "# Child\n");
  const app = await launch(directory);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setSize(860, 540),
    );
    await expect(page.locator(".sidebar-empty")).toHaveText("大纲内容为空");
    await expect(page.locator(".document-actions")).toBeHidden();
    await expect(page.locator("footer")).toHaveCount(0);
    const layout = await page.evaluate(() => {
      const sidebar = document
        .querySelector(".sidebar")!
        .getBoundingClientRect();
      const header = document
        .querySelector(".titlebar")!
        .getBoundingClientRect();
      return {
        sideWidth: sidebar.width,
        sideTop: sidebar.top,
        sideHeight: sidebar.height,
        headerLeft: header.left,
        headerHeight: header.height,
        height: innerHeight,
      };
    });
    if (process.platform === "darwin") {
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.getWindowButtonPosition(),
        ),
      ).toEqual({ x: 12, y: 10 });
    }
    expect(layout.sideWidth).toBe(320);
    expect(layout.sideTop).toBe(0);
    expect(layout.sideHeight).toBe(layout.height);
    expect(layout.headerLeft).toBe(320);
    expect(layout.headerHeight).toBe(32);
    for (const icon of await page.locator(".ui-icon").all()) {
      const bounds = await icon.boundingBox();
      expect(bounds!.width).toBeGreaterThan(0);
      expect(bounds!.width).toBeLessThanOrEqual(17);
      expect(bounds!.height).toBe(17);
    }
    const menus = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!.items.map((item) => item.label),
    );
    expect(menus).toEqual(
      expect.arrayContaining([
        "文件",
        "编辑",
        "段落",
        "格式",
        "显示",
        "主题",
        "窗口",
        "帮助",
      ]),
    );
    const nativeLabels = await app.evaluate(({ Menu }) => {
      const labels: Record<string, string> = {};
      const visit = (menu: Electron.Menu) => {
        for (const item of menu.items) {
          if (item.role) labels[item.role] = item.label;
          if (item.submenu) visit(item.submenu);
        }
      };
      visit(Menu.getApplicationMenu()!);
      return labels;
    });
    expect(nativeLabels).toMatchObject({
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      selectall: "全选",
      close: "关闭窗口",
      resetzoom: "实际大小",
      zoomin: "放大",
      zoomout: "缩小",
      togglefullscreen: "切换全屏",
    });
    await dialogs(app, filename);
    await clickAction(page, "打开");
    await expect(page.locator(".document-title")).toHaveText("current.md");
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => {
        throw new Error("Saved document tree must not open a folder chooser.");
      };
    });
    await page
      .getByRole("button", { name: "显示当前文件夹文件树", exact: true })
      .click();
    await expect(page.locator(".file-list")).toContainText("sibling.md");
    await expect(page.locator(".file-list")).toContainText("child.md");
    await expect(page.locator(".sidebar-menu summary")).toHaveText("文件");
    await page.getByRole("button", { name: "显示大纲", exact: true }).click();
    await expect(page.locator(".sidebar-empty")).toHaveText("大纲内容为空");
    expect(
      await page
        .locator(".header-controls")
        .evaluate((element) =>
          Array.from(
            element.children,
            (child) => child.getAttribute("aria-label") ?? child.className,
          ),
        ),
    ).toEqual(["statistics", "切换源码模式", "显示大纲", "显示或隐藏侧栏"]);
    await page
      .getByRole("button", { name: "切换源码模式", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "切换源码模式", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator(".cm-content").click();
    await page.keyboard.insertText("# 第一节\n\n## 第二节");
    await page
      .getByRole("button", { name: "切换源码模式", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "切换源码模式", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".document-state")).toHaveText("— 已编辑");
    await expect(page.locator(".outline button")).toHaveCount(2);
    await page.getByRole("button", { name: "搜索侧栏", exact: true }).click();
    await page.getByLabel("搜索侧栏内容").fill("第二");
    await expect(page.locator(".outline button")).toHaveCount(1);
    await page.getByLabel("搜索侧栏内容").press("Escape");
    await expect(page.locator(".outline button")).toHaveCount(2);
    await page.locator(".sidebar-menu summary").click();
    await page.getByRole("button", { name: "最近", exact: true }).click();
    await expect(page.locator(".sidebar-menu")).not.toHaveAttribute("open", "");
    await page.getByRole("button", { name: "显示大纲", exact: true }).click();
    await expect(page.locator(".outline button")).toHaveCount(2);
    await page.locator(".document-menu summary").click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".document-actions")).toBeHidden();
    await page.locator(".statistics summary").click();
    await expect(page.locator(".statistics [role=status]")).toContainText(
      "字符",
    );
    await page.locator(".ProseMirror").click();
    await expect(page.locator(".statistics .chrome-popover")).toBeHidden();
    await clickAction(page, "源码");
    await expect(page.locator(".cm-editor")).toBeVisible();
    await page
      .getByRole("button", { name: "显示或隐藏侧栏", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await page.getByRole("button", { name: "显示大纲", exact: true }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()!
        .items.find((item) => item.label === "主题")!
        .submenu!.items.find((item) => item.label === "暗色")!
        .click(),
    );
    await expect(page.locator(".app-shell")).toHaveClass(/dark-shell/);
    await expect(page.locator(".editor-column")).toHaveCSS(
      "background-color",
      "rgb(32, 34, 38)",
    );
  } finally {
    await stop(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
