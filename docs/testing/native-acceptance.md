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

## 2026-10-13：1.0.9 原生窗口与中文菜单

用户解锁后，观察实际/Applications安装版。1.0.8原生编辑菜单出现英文Cut/Copy/Paste/Select All，文件菜单为Close Window；1.0.9保留系统role并显式指定中文label。

在安装版1.0.9的隔离测试数据目录，原生可访问性实际读取结果：编辑含“剪切、复制、粘贴、全选”；文件含“关闭窗口”；窗口含“最小化、缩放、前置所有窗口”，以及系统自动注入的中文窗口排列项。菜单栏完整顺序为Chomy、文件、编辑、段落、格式、显示、主题、窗口、帮助。此前实际输入typora后标题显示“未命名 — 已编辑”、1词，侧栏显示居中空大纲。

点击原生最小化按钮后，通过测试应用的原生窗口事件记录观察到minimize和restore；可访问性观察会重新激活窗口，不能因之后截图仍显示窗口而判定最小化无效。点击缩放窗口的原生操作后，实际窗口从860×540逻辑尺寸扩大，截图3456×2168物理像素，再执行同一操作恢复。点击原生关闭按钮后旧窗口销毁，后续观察触发应用activate并建立新空白窗口，原可访问性节点被移除并替换。

窗口共享期间的系统紫色标记覆盖交通灯区域；未改变系统共享或录屏设置来去除它。按钮仍为原生控件，其角色、配置位置及操作已验证；不把覆盖情况下截图称作三个彩色按钮的完整像素验收。测试草稿与隔离数据不写入用户Markdown，生产数据中的自建typora测试恢复副本移动到忽略的out/native-qa-recovery，保留回滚能力。
