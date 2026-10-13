# Chomy 1.0.5 版本验证记录

日期：2026-10-13。验证主机：macOS 26.5.2、Apple M1 Max、arm64。产物为未签名内部测试包。

## 本轮改动

- 修复中文斜体显示：Markdown原本已生成em，但全局font-synthesis:none禁止缺失字形的合成，导致默认中文字体显示为正体。正文覆盖为weight style后，中文可见倾斜，Latin继续使用原生斜体。
- 新增中文闭合星号输入、源码切换与保存、阅读及HTML导出回归；代码与转义星号仍是普通文本。
- [修复前](../testing/screenshots/emphasis-before.png)与[修复后](../testing/screenshots/emphasis-after.png)截图确认中文字形变化。

以下为延续的1.0.4改动：

- 应用图标改为单个黑色衬线C、白色圆角方形底板与透明四角，去除旧chomy横向字标。
- 同步PNG、ICNS（16–1024px）及ICO（16/32/48/64/128/256px）；主文件1254px、运行PNG1024px、32px预览的四角alpha均实测为0。32px字母可辨。
- 包内ICNS与源码资源逐字节一致；Mac DMG安装副本全部18项回归通过，40.5秒。

以下为延续的1.0.3功能：

- 代码块高亮接入现有highlight.js全部193种语法，选择框提供语言及别名，包含Java；编辑、阅读与导出共用注册。
- Java大小写与js等别名正常高亮，原始标签保留；未知语言及显式text/plaintext安全作为纯文本处理。
- 可视代码块最后一行按↓进入下方正文，必要时创建空段落；首行或中间行、非空选区、组合输入及带修饰键的移动保持正常处理。回归验证在末行中间按↓也能跳出，并保留完整代码与保存后的围栏。

以下为延续的1.0.2改动：

- 对照本机 Typora 1.4.8 的公开界面调整表格与数学排版，未复制参考代码、CSS 或字体。
- 表格细边框、灰色加粗表头、隔行背景、6px 13px 内边距；移除单元格段落额外外边距，垂直居中。列宽按内容分配，手动列宽继续使用固定布局。阅读与编辑均保留左、中、右对齐。
- 正文字号默认16px、行高1.6，一级标题36px、二级28px。块公式居中、适当留白，右侧按文档编号；显式 LaTeX 标签不会与自动编号叠加。主题可以隐藏自动编号。
- 增补主题变量、Paper 表格配色、明暗截图与复现脚本。
- 延续1.0.1安装启动修复：DMG复制保留14条包内相对符号链接，安装后不依赖构建路径。
- 查明上一轮Windows CI的Squirrel压缩缺少7z.exe/7z.dll；Forge preMake显式从依赖的对应架构文件准备这两个文件。1.0.2的Windows CI已通过Squirrel打包及打包应用测试，仍不替代Windows10/11人工安装验收。

## 验证

| 项目                | 结果                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| pnpm check          | lint、严格类型、35项单元测试、格式检查通过                                  |
| pnpm make           | Mac APP、ZIP、DMG成功，hdiutil verify通过                                   |
| pnpm test:installed | 从只读DMG复制、移走原构建后，全部19项E2E通过，44.7秒                        |
| 表格视觉            | 单行38.59 CSS px；960px表格列宽约217/526/217px；浅色/深色及可视编辑截图检查 |
| Windows跨平台打包   | 便携ZIP生成；不等同Windows安装器或Windows10/11实机验收                      |
| 完整性              | artifact-manifest.json记录7个关键文件的SHA-256                              |

19项E2E包含12类Markdown的字节保真、BOM和混合换行、组合输入保护、表格编辑与撤销、代码、数学/Mermaid、导出、主题安装重启、附件授权、文件冲突与恢复、大文件。原生输入法此前记录见[native-acceptance.md](../testing/native-acceptance.md)，本轮不宣称重新进行了系统IME验收。

上一版1.0.4的GitHub[运行记录](https://github.com/huangfuProject/chomyMd/actions/runs/38403651769)中，Mac和Windows全部检查及打包测试通过，Mac安装后回归通过。1.0.5的CI以Actions页面新运行结果为准。

1.0.3开发目录首次全量运行有一个HTML导出失败，当时并行打包重建了正在使用的dist目录。停止并行重建后，以稳定的DMG安装副本完整重跑18项全部通过；后续验证与构建按依赖顺序执行，避免影响运行资源。

1.0.5首次开发目录运行与截图捕获窗口并行，↓键回归未通过；之后不并行启动其他窗口，DMG安装副本19项全部通过。键盘回归与视觉捕获须串行执行，以免窗口焦点影响输入。

## 性能样本

打包应用10次UI自动化墙钟样本，包含IPC、渲染和断言；不能视为纯引擎延迟或跨硬件保证。

| 操作       | P50 / ms | P95 / ms |
| ---------- | -------: | -------: |
| 打开       |    107.3 |    298.4 |
| 编辑       |     34.9 |     50.0 |
| 保存       |    237.3 |    270.5 |
| 搜索       |     94.1 |    101.6 |
| conversion |     75.8 |    113.8 |

完整样本：[performance-results.json](../testing/performance-results.json)。

## 资料与边界

[技术及主题手册](../developer-handbook.md)、[参考观察](../../research/typora-1.4/observations/R05.md)、[阅读浅色](../testing/screenshots/tables-math-light.png)、[阅读深色](../testing/screenshots/tables-math-dark.png)、[可视表格](../testing/screenshots/tables-rich-light.png)。截图1728×1084 CSS像素，2倍设备缩放。表格可视样本是去除公式及HTML的派生文件。

公式仍通过源码编辑、阅读渲染；KaTeX与Typora的公式字形和度量有差异，不宣称逐像素一致。当前参考配置未渲染行内美元符号公式，Chomy默认渲染。Windows10/11人工安装、文件关联、原生输入法，真实S3/MinIO/OSS桶以及应用签名/公证仍需发行环境完成。详见[平台清单](platform-checklist.md)。
