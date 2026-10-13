import { Menu, app } from "electron";
import type { AppCommand } from "@chomy/contracts";
export function installMenu(send: (command: AppCommand) => void) {
  const command = (
    label: string,
    key: string | undefined,
    action: AppCommand,
  ): Electron.MenuItemConstructorOptions => ({
    label,
    ...(key ? { accelerator: key } : {}),
    click: () => send(action),
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Chomy",
              submenu: [
                { role: "about" as const },
                command("偏好设置…", "CmdOrCtrl+,", "preferences"),
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                {
                  label: "退出 Chomy",
                  accelerator: "CmdOrCtrl+Q",
                  click: () => app.quit(),
                },
              ],
            },
          ]
        : []),
      {
        label: "文件",
        submenu: [
          command("新建", "CmdOrCtrl+N", "new"),
          command("打开…", "CmdOrCtrl+O", "open"),
          command("打开文件夹…", "CmdOrCtrl+Shift+O", "folder"),
          { type: "separator" },
          command("保存", "CmdOrCtrl+S", "save"),
          command("另存为…", "CmdOrCtrl+Shift+S", "saveAs"),
          {
            label: "导出",
            submenu: [
              command("HTML…", undefined, "export-html"),
              command("PDF…", undefined, "export-pdf"),
            ],
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      {
        label: "编辑",
        submenu: [
          command("撤销", "CmdOrCtrl+Z", "undo"),
          command("重做", "CmdOrCtrl+Shift+Z", "redo"),
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
          { type: "separator" },
          command("查找与替换", "CmdOrCtrl+F", "find"),
        ],
      },
      {
        label: "段落",
        submenu: [
          ...([1, 2, 3, 4, 5, 6] as const).map((level) =>
            command(
              `${level} 级标题`,
              `CmdOrCtrl+${level}`,
              `heading-${level}`,
            ),
          ),
          command("正文", "CmdOrCtrl+0", "paragraph"),
          command("引用", undefined, "quote"),
          command("无序列表", undefined, "bullet"),
          command("有序列表", undefined, "ordered"),
          command("任务列表", undefined, "task"),
          command("分割线", undefined, "rule"),
          command("表格", undefined, "table"),
          command("代码块", undefined, "code-block"),
        ],
      },
      {
        label: "格式",
        submenu: [
          command("加粗", "CmdOrCtrl+B", "bold"),
          command("斜体", "CmdOrCtrl+I", "italic"),
          command("行内代码", undefined, "code"),
          command("超链接", "CmdOrCtrl+K", "link"),
          command("图片与附件…", "CmdOrCtrl+Shift+I", "image"),
        ],
      },
      {
        label: "显示",
        submenu: [
          command("显示或隐藏侧栏", "CmdOrCtrl+Shift+L", "sidebar"),
          command("阅读模式", undefined, "reading"),
          command("编辑工具", undefined, "tools"),
          command("源码模式", "CmdOrCtrl+/", "source"),
          command("专注模式", "CmdOrCtrl+Shift+F", "focus"),
          command("打字机模式", undefined, "typewriter"),
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
      ...(process.platform === "win32"
        ? [
            {
              label: "设置",
              submenu: [command("偏好设置", undefined, "preferences")],
            },
          ]
        : []),
      {
        label: "主题",
        submenu: [
          command("明亮", undefined, "theme-light"),
          command("暗色", undefined, "theme-dark"),
          command("跟随系统", undefined, "theme-system"),
          command("高对比度", undefined, "theme-contrast"),
          { type: "separator" },
          command("选择与管理主题…", undefined, "preferences"),
        ],
      },
      { label: "窗口", role: "windowMenu" },
      { label: "帮助", submenu: [{ label: "关于 Chomy", role: "about" }] },
    ]),
  );
}
