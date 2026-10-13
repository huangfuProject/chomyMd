# macOS 原生交互实测

日期：2026-10-12，macOS 26.5.2，Apple M1 Max arm64。用户解锁后使用 CUA 原生按键/AX 实测。未用 Unicode 粘贴冒充输入法验收。

## Typora 1.4.8（6558）

只打开 research/typora-1.4/fixtures 中专用文档。Cmd+O 打开原生文件面板；逐键输入 `# ` 转标题，输入无序列表后 Enter 延续，空项再 Enter 退出。Cmd+S 保存结果为标准 Markdown：`# Heading test`、两条列表。

reference.md 展示两级标题、强调、引用、嵌套列表、任务、对齐表格与代码围栏。表格“中文”单元格按 Tab 到右侧链接格，显示链接源码选择与表格调整/对齐/删除浮层。点击代码块显示 typescript 语言输入入口。源码模式菜单能切换到带行号/高亮编辑，底部 Source Mode 控件退出。

证据：R02-reference、R03-input-rules、R05-table-edit、R06-code-edit、R09-source 截图与 observed-table/code/source 文本。仅观察当前默认画面；未更改主题、设置、安装内容或原有用户文档。

## Chomy 系统拼音

内部 arm64 应用使用 CHOMY_TEST_DATA=/tmp/chomy-native-acceptance 隔离。原生 UI 工具把 Chomy 名称缓存为 com.electron.chomy，不能连接正式 io.chomy.editor；为此对临时副本只修改 CFBundleIdentifier，使原生工具可连接。代码、asar、Electron 和编辑器与当时内部包一致。该辅助副本不是最终发行包；最终正式标识产物另跑 packaged E2E。

1. 可视文档点击正文，Ctrl+Space 切换系统拼音。
2. 使用单个物理字母键输入 nihao；AX 显示未提交 `ni hao`，状态栏仍为 0 字符。
3. Space 提交后正文为“你好”。输入 zhongwen 并提交后为“你好中文”，无重复、无丢字。
4. 组合期间 Cmd+S 被系统输入法作为候选输入处理，未打开保存面板。此现象不证明所有命令保护；命令保护由模拟 composition E2E 补充覆盖。
5. 点击源码按钮后正文仍为“你好中文”。逐键输入 ceshi，观察未提交 `ce shi`，Space 提交“测试”。
6. Ctrl+Space 恢复先前输入源；原生保存面板成功保存，磁盘 UTF-8 内容为“你好中文\n测试”。测试文件已归档 research/typora-1.4/fixtures/chomy-ime.md。

截图：screenshots/native-ime-rich.png、native-ime-source.png。测试仅验证当前系统拼音与这组输入序列；长时 IME、撤销组合、多输入法和 Windows IME 未据此推定通过。
