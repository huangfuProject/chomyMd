# Chomy 开发与主题制作手册

适用版本：应用 1.0.6；IPC v1；主题协议 1.0.0。本文描述仓库中已实现的行为，面向接手维护、增加功能和制作主题的开发者。应用目前为内部测试版本，平台发行条件见文末。

## 1. 快速开始

开发环境要求 Node.js 24.14 或更高的 24.x、pnpm 10.12.4。锁文件 `pnpm-lock.yaml` 是依赖版本的依据。Electron 运行时由安装脚本准备。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm start
```

常用命令：

| 命令                   | 用途                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `pnpm build`           | 打包 main、preload 和 renderer 到 `apps/desktop/dist`              |
| `pnpm check`           | ESLint、严格类型检查、单元测试、格式检查                           |
| `pnpm test:e2e`        | 构建并启动真实 Electron 执行交互测试                               |
| `pnpm make`            | 当前平台打包；macOS 生成 APP、ZIP 和内部 DMG                       |
| `pnpm package:win`     | 生成 Windows x64 便携目录和 ZIP；跨平台生成不代表 Windows 运行验证 |
| `pnpm test:installed`  | macOS从DMG复制后，在原构建不可用时执行完整E2E                      |
| `pnpm test:packaged`   | 使用已打包应用运行 E2E，而非开发目录                               |
| `pnpm verify:platform` | 检查当前平台验收条件                                               |
| `pnpm notices`         | 更新依赖许可证清单及随包声明                                       |

Electron 官方下载不可达时，可在单条命令设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，不必修改全局设置。发行前仍应确认下载校验和与可信发布信息一致。

## 2. 仓库结构与依赖方向

```text
apps/desktop/src/
  main/                 系统权限、文件、设置、附件、云服务、菜单
  preload/              小范围类型化桥接
  renderer/
    App.tsx             应用交互与模式协调
    app/useDocument.ts  文档快照与异步更新
    editor/             富文本、源码、阅读与编辑动作
    components/         侧栏、偏好设置、图标
    styles.css          应用外壳与默认正文样式
packages/
  contracts/            Zod 数据结构、请求、回复、命令、公共 API
  document-core/        UTF-8 编解码、原子写入
  editor-core/          编辑器适配器接口与跨模式历史
  markdown-core/        能力判断、标题与图片 URL 规则
  theme-engine/         CSS 校验、作用域、有限兼容导入
  storage-core/         存储提供者接口与配置验证
  test-fixtures/        Markdown 回归样本
scripts/                构建、打包、验证、许可证与示例预览
tests/                 单元和 Electron E2E 测试
```

main 和 renderer 都依赖 contracts；纯逻辑包不依赖 Electron。实际云 SDK 由 main 装配，renderer 不取得文件系统、访问密钥或 SDK 客户端。主题引擎不绑定 React 或编辑器实现。

`apps/desktop/src/main/index.ts` 是进程入口。`scripts/build.mjs` 用 esbuild 将 main/preload 依赖打入 CJS，Electron 保持 external；Vite 构建 renderer。应用包使用 ASAR，运行时不依赖仓库的 node_modules。

## 3. 进程、协议与权限边界

主窗口关闭 Node 集成，开启 contextIsolation 和 sandbox。页面加载 `chomy://app/index.html`。预加载脚本只暴露 `window.chomy` 公共接口，不暴露任意 invoke、路径读取或 shell 执行。

每次 IPC 请求经过严格 Zod 结构校验，并验证 webContents ID、主 frame 及完整页面 URL。新增能力必须同时修改 contracts、preload 和 main 的允许列表；只修改 renderer 无法获得新的系统权限。

| 协议                             | 所有者与用途                          |
| -------------------------------- | ------------------------------------- |
| `chomy://app/`                   | main 从 renderer 发行目录提供静态资源 |
| `chomy-asset://`                 | main 通过文档会话和授权读取本地图片   |
| `chomy-remote://`                | main 根据用户开关获取受限远程图片     |
| `chomy-theme://<id>/preview.png` | main 返回已安装主题的静态 PNG 预览    |

协议不是通用文件浏览器。应用资源拒绝目录穿越、反斜杠、非法扩展名、认证信息及 query/hash。图片授权绑定文档和规范路径，不能把授权复用于任意本地文件。链接通过受限 `openLink` 打开，不允许脚本 URL。渲染内容由 DOMPurify 净化；主题不能扩展 CSP 或启用脚本。

## 4. 文档模型与数据保真

Markdown 文件是持久化事实来源。文档会话使用随机 ID、单调 revision、dirty、saved 和 externalChange 状态；renderer 发送 ID、revision 和完整 Markdown 快照。main 拒绝过期会话或过期版本，避免切换文件时迟到的编辑覆盖新文件。

文件操作串行排队。打开、保存、恢复和导出期间相关编辑区域设为 inert，模式按钮暂时禁用；上传允许继续编辑，但插入结果必须仍属于同一文档。编辑器销毁后不会继续写入活动会话。

### 4.1 编码与换行

仅接受有效 UTF-8，保留 BOM 信息，识别主导换行格式。未编辑内容直接保持原始字节；可视与源码适配器分别缓存原始 Markdown，避免仅切换模式产生格式化。CodeMirror 内部坐标使用规范化文本，保存快照使用保留的原文。

实际编辑后按文件主导换行编码，混合换行可以统一为主导格式。这与“未编辑逐字节相同”是不同承诺。可视编辑产生的 Markdown 也可能规范化空行、列表符号或转义形式；不承诺编辑后保留每个语法字符。

打开上限为 12 MiB。超过 500,000 字符的内容进入源码路径，避免富文本大树解析。性能测试覆盖约 1.25 MiB、3 MiB、10 MiB 样本；不能从单机数据推导所有机器的延迟保证。

### 4.2 保存与外部修改

保存不是直接覆盖原文件：

1. 将 renderer 最新快照交给 main。
2. 检查当前磁盘摘要与打开/上次保存摘要。
3. 同目录写入临时文件，保持权限模式并 fsync。
4. 在 rename 前再次检查原文件摘要，覆盖临时写入期间的外部修改窗口。
5. 原子 rename；非 Windows 平台同步目录。
6. 成功后更新文档状态与磁盘基线。

只读模式位和系统访问权限均参与判断。保存失败、冲突或用户取消不会清空 dirty 与恢复数据。外部修改由重新加载或另存为流程处理，不自动覆盖。文件路径规范化解决 macOS `/var` 与 `/private/var` 别名，并识别同一文件的不同路径。

该策略缩小竞争窗口，但不能宣称对所有网络文件系统具备事务锁；没有跨进程排他锁。

### 4.3 恢复、自动保存与关闭

恢复快照约 600 ms 去抖持久化；自动保存默认关闭，启用后约 3 s。自动保存不能绕过冲突检查。睡眠与关闭执行最新快照握手；未保存文档需要处理保存/取消。恢复记录由用户显式恢复或丢弃。文件名和错误消息中不记录云访问密钥。

用户数据位置由 Electron `app.getPath('userData')` 决定；测试使用隔离目录。不要依赖固定用户名路径。目录包含 settings.json、恢复记录、themes、加密凭据和 asset-grants.json。备份时将 Markdown 与相对 assets 一起保存；恢复数据不替代常规备份。

## 5. 编辑器实现与功能边界

可视编辑使用 Milkdown/ProseMirror；源码编辑使用 CodeMirror 6；阅读使用 Marked、DOMPurify、KaTeX 和按需加载的 Mermaid。两个编辑器实现 `packages/editor-core/src/contracts.ts` 中的 EditorAdapter。

| 接口                          | 约定                                              |
| ----------------------------- | ------------------------------------------------- |
| `getMarkdown / setMarkdown`   | 获取/替换完整快照；程序替换不重复产生编辑回调     |
| `getSelection / setSelection` | 文本及比例构成的跨模式近似定位，不是共享 DOM 坐标 |
| `isComposing`                 | 输入法组合阶段禁止模式切换                        |
| `isInTable`                   | 表格上下文决定工具显示                            |
| `insertMarkdown / format`     | 当前选区插入与语义命令                            |
| `find / replace`              | 区分大小写的字面搜索；不启用正则                  |
| `jumpToHeading`               | 根据提取标题的索引定位                            |
| `destroy`                     | 清理编辑器、监听器及回调                          |

`editor/normalize-emphasis.ts` 为字符输入规则补充整段文本/IME提交路径。多字符星号输入先完整插入，再在光标前最多1000字符内匹配闭合星号，使用既有Markdown parser确认段落内强调结构后替换相应范围。只处理新插入的星号；代码块、代码标记、已格式化范围、主动转义、非空选区和无法解析的候选保留。删除、撤销与程序载入不会触发该转换。已经保存在文件中的 `\*你好\*` 是合法的字面星号语法，不能自动判断它是否来自旧版本；需在源码模式去掉反斜杠或重新输入强调，不自动迁移旧文档。组合输入结束时须等待ProseMirror的composing状态清除，之后转换并emit最终快照，不能在compositionend的第一个零延时回调中假定DOM已提交。

SessionHistory 独立于单个编辑器保存跨模式撤销/重做，500 ms 合并窗口，最多 50 个撤销快照。新文档重新建立历史；程序模式切换不应重复计入历史。

GFM 支持标题、粗体、斜体、删除线、引用、列表、任务列表、链接、图片、分隔线、代码和表格。表格结构编辑包括增删行列与对齐；源码模式下结构命令提示切换到可视编辑。代码块有语言、语法高亮与复制操作。

frontmatter、任意 HTML、指令、脚注、数学或不安全协议等不适合可视往返的内容，按 `markdown-core/src/policy.ts` 进入源码加阅读模式，保留原文。增加语法时先确认解析与序列化都支持，否则只能扩大阅读支持，不能贸然解除保护。

可视代码块最后一个逻辑行按无修饰的↓键进入后面的正文段落；后面没有段落时插入一个空段落，操作走普通ProseMirror事务与公共历史。前面的代码行、非空选区、Shift/Control/Option/Command组合及输入法组合期间不触发。实现位于 `editor/exit-code-block.ts`；源码模式沿用文本光标移动。

代码块语言统一由 `apps/desktop/src/renderer/editor/code-languages.ts` 管理。使用随依赖打包的 highlight.js 全量193种语法，选择框展示正式名称与引擎别名，额外提供 Mermaid；可视编辑、阅读和导出使用同一高亮函数。Java、Kotlin、C/C++、C#、Go、Rust、Swift、SQL、HTML/XML、CSS、YAML 等均可直接选择。高亮匹配忽略大小写，原始围栏标签保留；已有未知标签会追加到选择框，未知语言或显式 text/plaintext 转义为纯文本，不误用自动识别。未注明语言的代码只在11种常用语法内自动检测，避免每次输入扫描全部语言。超过50,000字符的可视代码块不创建高亮装饰，以控制编辑开销。扩展语言时使用 highlight.js 的 registerLanguage/注册别名，再由共享列表产生选项，不在 NodeView 中另写硬编码列表。语言色彩由 `.hljs-*` 主题选择器控制，不涉及代码执行。Chomy与Typora使用不同高亮引擎，并不承诺所有罕见语言或扩展方言完全一致。

数学渲染 `trust:false`；Mermaid 使用 strict 安全模式，拒绝文档内 `%%{}` 配置，限制文本与边数。渲染失败保留源码并显示错误。公式作为 Marked 的块级/行内扩展解析，代码围栏和行内代码仍交给 Markdown 原生 tokenizer，避免代码中的美元符号被渲染为公式。当前支持美元符号公式，不涵盖所有 Markdown 方言；增加语法时必须保持代码字面内容。

## 6. 界面与样式组织

布局由标题栏、可收起侧栏、正文、状态栏构成。macOS 使用 hiddenInset 原生交通灯；主窗口初始 1120×800，最小 700×480。标题栏显示文件名和编辑状态，常用文件动作使用原创线性 SVG 图标。

编辑工具默认收起；点击工具按钮展开，表格选区出现结构工具。侧栏宽度自适应，正文默认最大宽度 960 px、字号 16 px、行高 1.6。正文允许 `font-synthesis: weight style`，当所选中文或自定义字体没有斜体/粗体字形时由浏览器合成。不要在主题中无条件设置 `font-synthesis: none`，否则 `*中文*` 即使生成了 em 节点也会显示正体；应用壳仍可独立限制合成。编辑、阅读和导出共享正文样式。用户偏好允许字号 12–28 px、宽度 540–1000 px。宽窗口中正文居中，小窗口保留边距。

应用外壳使用内部 `--shell-*` 变量，正文使用公开 `--chomy-*` 变量。第三方主题仅控制正文；偏好设置、保存冲突与安全提示继续使用应用样式。自定义纯暗色主题匹配暗色外壳；双色主题由系统深浅偏好决定外壳。

视觉参考采用公开交互观察和自制样式；没有使用 Typora 的私有 CSS、字体或代码。像素尺寸观察受系统缩放影响，详见 `research/typora-1.4` 的记录，不能把推测写成测量事实。

### 6.1 应用图标与重建

应用图标使用单个大写 `C`，黑白配色、衬线字体、白色圆角方形底板，圆角外保留透明边距，适合 macOS Dock。主文件位于 `apps/desktop/assets/logo-master.png`，为带透明通道的 PNG；`icon.png` 为 1024 px 运行资源，`icon.icns` 为 macOS 资源，`icon.ico` 包含 Windows 16/32/48/64/128/256 px 图像。`logo-32.png` 用于小尺寸检查。

修改主文件后在 macOS 执行 `node scripts/build-icons.mjs`，脚本调用 AppKit 高质量重采样，保持宽高比、居中放入正方形画布，生成各尺寸并封装 ICNS/ICO。它只转换图标格式，不参与普通应用运行；其他开发平台直接使用已生成的资源。重新 `pnpm make` 才会更新已有安装包。

main 设置窗口图标和 macOS Dock 图标；Forge 设置 macOS bundle 图标及 Windows 安装图标。Mac 跨平台生成的 Windows 便携 EXE 不进行依赖 Wine 的 PE 资源写入，文件管理器仍可能显示 Electron 默认图标；窗口使用 Chomy 资源，实际 Windows 构建会写入应用和安装器图标。平台视觉验收仍需在对应系统进行。

## 7. 从零制作自定义主题

无需修改应用源码。建议先复制仓库的完整示例 `packages/theme-engine/examples/paper`，制作最小主题后再逐步添加细节。

### 7.1 文件结构

```text
my-paper/
  theme.json
  theme.css
  preview.png       可选
```

文件名固定。当前协议不支持字体文件、任意图片、JavaScript、插件脚本或主题资源目录。preview.png 仅在偏好设置展示，不可在 CSS 中引用为背景。

创建 `theme.json`：

```json
{
  "schemaVersion": 1,
  "id": "studio.my-paper",
  "name": "My Paper",
  "version": "1.0.0",
  "engine": ">=1.0.0",
  "author": "Your Name",
  "description": "暖纸色正文与清晰的代码、表格样式。",
  "modes": ["light"],
  "styles": "theme.css"
}
```

`engine` 是主题协议要求，独立于应用版本；当前应用为 1.0.6，主题协议为 1.0.0。目前必须为字面 `>=1.0.0`，不是任意 semver 表达式。manifest 是严格结构，未知字段会拒绝。

| 字段            | 规则                                                                |
| --------------- | ------------------------------------------------------------------- |
| schemaVersion   | 必须为数字 1                                                        |
| id              | 最长 80 字符；小写字母/数字段，以点或连字符连接；如 studio.my-paper |
| name / author   | 最长 80 / 120 字符                                                  |
| version         | 三段数字，如 1.0.0                                                  |
| engine / styles | 固定 `>=1.0.0` / `theme.css`                                        |
| modes           | light、dark 或二者，1–2 项，不重复                                  |
| description     | 可选，最长 1000 字符                                                |
| preview         | 可选，只能为 preview.png                                            |

不能使用 `chomy-` 前缀和 Windows 保留设备名，如 con、nul、com1、con.paper。不要使用路径字符、大写字母或下划线。ID 决定安装目录和更新身份，发布之后保持稳定。

### 7.2 完整的最小 CSS

```css
:root {
  --chomy-bg: #fff8ed;
  --chomy-fg: #352b25;
  --chomy-link-color: #765226;
  --chomy-border: #d3c3aa;
  --chomy-code-bg: #f0e6d7;
  --chomy-heading-color: #31241c;
  --chomy-quote-color: #7c6a59;
  --chomy-table-alt-bg: #fbf0df;
  --chomy-selection-bg: rgba(118, 82, 38, 0.18);
  --chomy-font-body: Georgia, "Songti SC", serif;
  --chomy-font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  --chomy-body-line-height: 1.75;
}
h1,
h2 {
  border-bottom: 1px solid var(--chomy-border);
  padding-bottom: 0.2em;
}
blockquote {
  border-left-width: 4px;
  font-style: italic;
}
pre {
  border: 1px solid var(--chomy-border);
  border-radius: 6px;
}
th,
td {
  padding: 0.55em 0.8em;
}
a {
  text-underline-offset: 0.15em;
}
```

以上文件可直接安装。使用系统已有字体，缺失字体由后续字体族回退。不要加入 `@font-face` 或字体下载 URL。

### 7.3 正文变量与优先级

| 变量                      | 默认值/用途                                    |
| ------------------------- | ---------------------------------------------- |
| --chomy-bg                | #fff，正文背景                                 |
| --chomy-fg                | #333，正文文字                                 |
| --chomy-link-color        | #4078aa，链接                                  |
| --chomy-border            | #ddd，标题、表格、引用等边界                   |
| --chomy-code-bg           | #f5f5f6，行内代码及代码块背景                  |
| --chomy-heading-color     | var(--chomy-fg)，标题文字                      |
| --chomy-quote-color       | #777，引用文字                                 |
| --chomy-table-alt-bg      | #f8f8f8，表格隔行背景                          |
| --chomy-selection-bg      | rgba(64,120,170,.16)，选中文本                 |
| --chomy-font-body         | Apple/Segoe UI/system sans-serif，正文字体     |
| --chomy-font-mono         | ui-monospace/SFMono-Regular/Consolas，代码字体 |
| --chomy-body-line-height  | 1.6，正文行高                                  |
| --chomy-body-size         | 用户偏好控制，默认 16px                        |
| --chomy-content-max-width | 用户偏好控制，默认 960px                       |

表格默认使用内容宽度分配列，只有包含 `data-colwidth` 的手动调整表格使用固定布局。单元格段落默认无额外外边距，内边距 6px 13px，垂直居中；阅读模式的 `align` 属性与编辑模式的行内对齐均保留。编辑器表头位于 tbody，阅读表头位于 thead，因此隔行背景选择器分别处理，首行正文始终使用正文背景。

还可设置 `--chomy-table-border`（默认跟随正文边框）、`--chomy-table-header-bg`（默认跟随隔行背景）、`--chomy-table-cell-padding`（默认 `6px 13px`）、`--chomy-math-size`（默认 `1.1em`）和 `--chomy-math-number-display`（默认 `block`；设为 `none` 隐藏自动编号）。例如：

```css
body {
  --chomy-table-header-bg: #f0e6d7;
  --chomy-table-border: #ded4c6;
  --chomy-table-cell-padding: 6px 13px;
  --chomy-math-size: 1.1em;
  --chomy-math-number-display: none;
}
```

块公式包裹在 `.math-block` 中，编号是文档内 CSS 计数器，不写入 Markdown；显式 `\tag{...}` 使用 KaTeX 原有标签并隐藏自动标签。主题隐藏的是自动标签，显式标签仍保留。长公式在块内水平滚动；导出沿用阅读样式。公式仍使用源码编辑与阅读渲染，排版并不使公式可视编辑成为可用功能。

应用把字号与正文宽度作为根元素行内变量写入，优先于主题的普通声明。推荐尊重此约定，避免用 `!important` 抢占用户控制。主题根背景同步用于正文容器；应用标题栏与侧栏不会跟随任意主题变量。

源码编辑器的语法颜色和第三方高亮 token 未定义为稳定主题协议。可使用 code/pre 的整体颜色与背景，但不要把某一版内部 DOM 类名当作长期 API。

### 7.4 选择器与安全规则

优先使用 h1–h6、p、a、blockquote、pre、code、ul、ol、li、table、thead、tbody、tr、th、td、hr、img，以及 `.chomy-document` 根元素。`:root` 自动转换为 `.chomy-document`；普通选择器加正文前缀。已有正文根前缀不会重复添加。

允许普通 CSS 声明和 `@media`、`@supports`。允许颜色、边框、间距、字体族、伪类和伪元素。禁止外部资源函数 URL、image/image-set、paint、expression；禁止 @import、@font-face、@keyframes 等其他 at-rule；禁止 z-index、fixed 定位和通过 position 函数规避校验；禁止正文根的兄弟选择器逃逸。

正文容器有绘制隔离，但安全过滤不是视觉质量评分。巨大的 margin、过小字号、透明文字等仍会使主题难用，作者应自行检查可读性。

### 7.5 双色主题

将 modes 改为 `["light", "dark"]`，保留明亮默认变量，再加入：

```css
@media (prefers-color-scheme: dark) {
  :root {
    --chomy-bg: #202226;
    --chomy-fg: #dedee2;
    --chomy-heading-color: #eeeeef;
    --chomy-code-bg: #2c3036;
    --chomy-link-color: #86b9e8;
    --chomy-border: #484b53;
    --chomy-quote-color: #adb4be;
    --chomy-table-alt-bg: #25282f;
    --chomy-selection-bg: rgba(134, 185, 232, 0.25);
  }
}
```

modes 只是能力声明，不会自动重写 CSS。纯暗色主题使用 modes `["dark"]` 并将暗色变量放在默认根中。双色主题由系统偏好触发媒体规则；当前没有每个自定义主题单独的强制深浅开关。

### 7.6 预览图片

加入 `"preview": "preview.png"`，并提供静态 PNG：最大 512 KiB、宽度 1600、高度 1200、总像素 2,000,000。校验 PNG 签名、IHDR、各块 CRC 和完整 IEND；不支持 APNG、符号链接和尾随数据。

建议使用约 890×652 的实际正文截图，包含标题、引用、代码与表格。截图应反映真实主题，不要在 CSS 中引用图片。仓库的 `node scripts/generate-theme-preview.mjs` 会用隔离 Electron 数据目录生成 Paper 示例预览；制作其他主题时可按脚本结构修改专用副本的输入路径和文档。

### 7.7 安装、更新、分发与删除

1. 打开偏好设置，选择“安装主题文件夹”，选中包含两个必要文件的目录。
2. 选择新主题，检查正文颜色、中文字体、标题、代码、列表与表格。
3. 关闭并重新启动，确认选择持久化。
4. 修改 CSS 后重新安装同 ID 目录，更新现有主题，再检查结果。
5. 分发 ZIP 时将 theme.json、theme.css、可选 preview.png 放在包内；可带单层主题目录，但不要混入其他主题的同名文件。
6. 在偏好设置删除自定义主题；删除当前主题会回退到明亮内置主题，内置主题不可删除。

ZIP 最大 2 MiB，最多 100 个条目，声明解压总大小最多 10 MiB；JSON/CSS 各最多 128 KiB，预览单独受限。拒绝穿越、符号链接、加密条目、重复目标文件和校验失败。安装只消费固定白名单文件；额外文件不会成为可访问资源。

安装按 CSS、预览、manifest 顺序原子写入单个文件，整个主题目录更新不是跨文件事务。开发时备份已发布主题；遇到磁盘满等中途失败可重新安装。损坏主题被隔离并保留，默认主题继续工作。

### 7.8 Typora CSS 迁移

“导入兼容 CSS”是有限转换：#write → .chomy-document、.md-fences → pre、.md-inline-code → code、.md-task-list-item → li，html/body 根转换为正文根。其余私有 ID/类选择器可能丢弃，界面显示数量。安全校验仍执行，因此带字体下载、图片 URL、其他 at-rule 的文件可能拒绝导入。

它不保证任意 Typora 主题等价运行。推荐从主题的颜色、字号和标准标签样式手工制作上述原生主题，并遵守原主题许可证。

### 7.9 主题验收清单与排错

- 明亮/暗色下中文、英文、emoji、选中态均可读。
- 最小窗口、字号 12/28、宽度 540/1000 下没有异常横向溢出。
- 长代码、宽表格、任务复选框、链接与图片都有合理布局。
- 可视、源码、阅读、HTML 和 PDF 均检查；不同模式并非同一个 DOM。
- 安装后重启、同 ID 更新、删除当前主题均有效。
- 打开冲突或错误弹窗，主题不能遮挡应用提示。

“ID 无效”检查大小写、分隔符、保留名称；“外部资源”移除 url/font-face/import；“CSS 格式无效”检查括号和声明；“预览校验失败”重新导出标准静态 PNG；主题不显示时检查 manifest 的 ID 与安装目录、必要字段和精确文件名。不要通过放宽全局 CSP 或关闭 CSS 校验解决主题问题。

## 8. 附件与云存储

本地模式复制到文档相邻 assets，并插入相对链接；引用模式保留原位置并授权访问，跨卷路径建议改为复制；云模式先落地 assets，再上传并插入长期 HTTPS 地址。未保存文档先选择保存位置。导入上限 20 MiB，文件名使用唯一标识避免冲突。

引用授权持久化在 asset-grants.json，但目标符号链接变化不能扩大权限。撤走外部文件会导致图片失效；共享文档时优先复制模式。

CloudConfig 包含 provider、bucket、region、endpoint、publicUrl、prefix、pathStyle。凭据用 Electron safeStorage 加密；系统不能提供加密时拒绝保存，不回退明文。publicUrl 是永久公共桶/CDN HTTPS 前缀，不能带凭据、query/hash；不将短期签名地址写入文档。远端 endpoint 要求 HTTPS，本机 MinIO 测试允许 localhost HTTP。

对象 key 包含配置前缀、UTC 日期与 UUID。S3Provider 使用 HeadBucket/PutObject，AliyunProvider 使用 listV2/put；测试连接需要与这些调用匹配的权限。上传超时约 60 s，取消传播 AbortSignal，晚到成功不会反转取消状态。失败保留本地副本，支持直接重试。

进度提供 queued/uploading/succeeded/failed/canceled 与总字节数；没有可验证的逐字节回调时使用不定进度条，不显示虚构百分比。

远程图片默认关闭。开启后仍经主进程受限获取：HTTPS、无 URL 凭据、拒绝重定向、15 s 超时、20 MiB 响应上限、最多 4 并发，拒绝 localhost、字面 IP 和 .local。此规则不等于 DNS 层完整网络隔离，企业环境有更严格需求时应增加受控代理和解析策略。

## 9. HTML 与 PDF 导出

renderer 生成净化阅读 HTML，main 将允许的本地图片和字体嵌入为 data 内容，避免离开用户数据目录后丢资源。远程图片按设置与获取策略处理，失败图片移除 src。导出 CSP 禁止脚本，仅允许所需内嵌样式和 data 资源。

PDF 在隔离隐藏 BrowserWindow 中生成。导出不是写回 Markdown，不会改变文件内容。新增导出格式应在独立模块实现，并明确是否保留主题、数学、图片、图表和分页。

## 10. 扩展实现路径

### 10.1 新增编辑命令

1. 在 contracts 的 commandSchema 添加命令。
2. 在主进程菜单及 preload 命令通道绑定动作。
3. 在 App 的 format/command 分派中处理。
4. 在 RichAdapter/SourceAdapter 实现语义；不支持的一侧给出明确提示。
5. 检查选区、输入法组合、跨模式撤销、保存和销毁后回调。
6. 为真实使用场景加入 E2E，不只断言按钮存在。

### 10.2 新增 Markdown 语法

同时检查 Markdown 解析、ProseMirror schema、输入规则、序列化、源码高亮、阅读净化和导出。先加入 fixture，覆盖未编辑逐字节保真和编辑后的语义一致性。无法可靠往返的语法维持 source-only 保护，不以隐藏内容换取可视支持。

### 10.3 新增存储提供者

实现 StorageProvider 的 test 和 upload，在 main 的工厂装配；若增加 provider 枚举，同步 contracts、偏好表单和配置验证。upload 接收 key、Buffer、contentType、AbortSignal，成功返回永久 URL。客户端不得进入 renderer；密钥继续通过 safeStorage。

用本地协议服务器验证 SDK 请求、签名路径、错误映射、取消、超时与失败留存，再用真实测试桶验证权限、断网和 CDN URL。本地模拟成功不能替代厂商验收。

### 10.4 升级主题协议

增加字段先定义 schemaVersion/engine 兼容策略，给旧主题提供明确迁移规则。资源能力若要开放，必须设计受控协议、总大小、类型限制和离线导出，不应直接解除 url() 禁令。新增变量同时更新默认、暗色、高对比度、示例、文档与可视验收。

### 10.5 新增系统接口

遵循 contracts → preload → main 校验 → renderer 调用顺序。不要接受 renderer 任意目录路径或任意网络请求作为便利接口；优先使用会话 ID、主进程注册条目和原生选择器。异步返回必须验证仍属于原文档，失败保持当前内容。

## 11. 测试与定位

单元测试覆盖原子保存、编码、只读与竞争冲突、主题作用域、路径规则、上传状态、SDK协议和远程资源限制。E2E 覆盖真实 Electron 窗口中的文件、编辑、模式、表格、恢复、附件、主题与导出。

fixtures 包括支持与不支持语法。系统 IME 不能用注入 composition 事件完全替代；本机原生拼音记录见 `docs/testing/native-acceptance.md`。合成事件测试用于稳定回归，真实系统输入法用于平台验收，两者分别记录。

性能结果由 E2E 输出，区分打开、编辑、保存、搜索、模式转换和大文件；数字包含 UI 等待开销。发现失败先看 Playwright trace、文档会话与 revision，再检查 main 错误码。不要通过删除冲突判断、关闭 sandbox 或延长所有超时掩盖错误。

`node scripts/capture-ui.mjs` 在隔离数据目录生成明亮、暗色、表格工具与主题偏好截图，输出到 docs/testing/screenshots。主题预览和 UI 截图应来自实际运行界面。目录宽度、字体与缩放改变时重新截图；原生交通灯不一定出现在 Electron 网页截图中，需额外原生窗口观察。

## 12. 打包、发行与交付边界

DMG复制应用时必须保留相对符号链接，禁止将framework链接改成构建机的绝对路径。`scripts/lib/mac-bundle.ts`使用verbatimSymlinks，并检查每个链接最终都在应用包内。`pnpm test:installed`从只读DMG复制应用到带空格的独立目录，暂时移走原构建，再运行完整测试，最后恢复原构建并卸载测试镜像。CI也执行此步骤，不能只测试构建目录。

macOS 产物位于 `apps/desktop/out/Chomy-darwin-arm64/Chomy.app`，ZIP 位于 out/make/zip，DMG 位于 out/make/dmg。Windows 便携目录位于 out/Chomy-win32-x64，便携 ZIP 位于 out/make/zip/win32/x64；实际 Windows 上由 Forge 制作安装包并验证 Squirrel 生命周期、快捷方式、文件关联和卸载。

Git 忽略依赖、构建产物、测试临时文件、秘密和本地工具配置。构建依赖锁文件、脚本及源代码必须提交；不要把忽略本地文件当作删除已经提交历史的手段。没有自动更新服务，首版手动更新。

CI 在 macOS arm64 与 Windows x64 执行检查、E2E、打包和打包版测试。CI 配置存在不等于远程执行通过；应保留实际运行记录和产物校验和。

公开发行前还需要：Windows 10/11 实机安装与输入法/路径验收、真实 S3/MinIO/OSS 桶验证、Developer ID 签名与公证、Windows 签名与 SmartScreen、视觉批准、项目 LICENSE 与发布归属。当前内部包未签名，跨平台 Windows 构建只验证生成了 x64 产物。详细清单见 `docs/release/platform-checklist.md`。

依赖声明见 `docs/release/dependency-licenses.md` 和随包 THIRD_PARTY_NOTICES.txt。项目自身许可证由拥有者确定，不由第三方声明推导。

### Windows 打包依赖准备

Forge 的 preMake 在 Windows 主机上把 electron-winstaller/vendor 内对应主机架构的 7z-x64 或 7z-arm64 二进制复制为 Squirrel 所需的 7z.exe/7z.dll。pnpm 默认禁止该依赖的安装脚本；当前依赖脚本也误把 os.arch 函数本身当作架构值。因此由项目显式准备随依赖发布的文件，不依赖下载外部工具。源码目录不会包含复制出的 vendor 文件。Windows 安装器构建必须以 Windows CI 结果为准。
