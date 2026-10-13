# Chomy 1.0.2 版本验证记录

日期：2026-10-13。验证主机：macOS 26.5.2、Apple M1 Max、arm64。产物为未签名内部测试包。

## 本轮改动

- 对照本机 Typora 1.4.8 的公开界面调整表格与数学排版，未复制参考代码、CSS 或字体。
- 表格细边框、灰色加粗表头、隔行背景、6px 13px 内边距；移除单元格段落额外外边距，垂直居中。列宽按内容分配，手动列宽继续使用固定布局。阅读与编辑均保留左、中、右对齐。
- 正文字号默认16px、行高1.6，一级标题36px、二级28px。块公式居中、适当留白，右侧按文档编号；显式 LaTeX 标签不会与自动编号叠加。主题可以隐藏自动编号。
- 增补主题变量、Paper 表格配色、明暗截图与复现脚本。
- 延续1.0.1安装启动修复：DMG复制保留14条包内相对符号链接，安装后不依赖构建路径。
- 查明上一轮Windows CI的Squirrel压缩缺少7z.exe/7z.dll；Forge preMake显式从依赖的对应架构文件准备这两个文件。最终效果需新Windows CI确认。

## 验证

| 项目                | 结果                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| pnpm check          | lint、严格类型、28项单元测试、格式检查通过                                  |
| pnpm make           | Mac APP、ZIP、DMG成功，hdiutil verify通过                                   |
| pnpm test:installed | 从只读DMG复制、移走原构建后，全部16项E2E通过，38.8秒                        |
| 表格视觉            | 单行38.59 CSS px；960px表格列宽约217/526/217px；浅色/深色及可视编辑截图检查 |
| Windows跨平台打包   | 便携ZIP生成；不等同Windows安装器或Windows10/11实机验收                      |
| 完整性              | artifact-manifest.json记录7个关键文件的SHA-256                              |

16项E2E包含12类Markdown的字节保真、BOM和混合换行、组合输入保护、表格编辑与撤销、代码、数学/Mermaid、导出、主题安装重启、附件授权、文件冲突与恢复、大文件。原生输入法此前记录见[native-acceptance.md](../testing/native-acceptance.md)，本轮不宣称重新进行了系统IME验收。

上一版1.0.1的GitHub[运行记录](https://github.com/huangfuProject/chomyMd/actions/runs/38331688318)中，Mac质量检查、开发及打包/安装E2E全部通过；Windows质量检查、E2E和ZIP生成通过，Squirrel打包失败。1.0.2的CI以Actions页面新运行结果为准。

## 性能样本

打包应用10次UI自动化墙钟样本，包含IPC、渲染和断言；不能视为纯引擎延迟或跨硬件保证。

| 操作 | P50 / ms | P95 / ms |
| ---- | -------: | -------: |
| 打开 |    109.9 |    255.9 |
| 编辑 |     37.0 |     40.2 |
| 保存 |    230.5 |    249.5 |
| 搜索 |     94.5 |    102.6 |

完整样本：[performance-results.json](../testing/performance-results.json)。

## 资料与边界

[技术及主题手册](../developer-handbook.md)、[参考观察](../../research/typora-1.4/observations/R05.md)、[阅读浅色](../testing/screenshots/tables-math-light.png)、[阅读深色](../testing/screenshots/tables-math-dark.png)、[可视表格](../testing/screenshots/tables-rich-light.png)。截图1728×1084 CSS像素，2倍设备缩放。表格可视样本是去除公式及HTML的派生文件。

公式仍通过源码编辑、阅读渲染；KaTeX与Typora的公式字形和度量有差异，不宣称逐像素一致。当前参考配置未渲染行内美元符号公式，Chomy默认渲染。Windows10/11人工安装、文件关联、原生输入法，真实S3/MinIO/OSS桶以及应用签名/公证仍需发行环境完成。详见[平台清单](platform-checklist.md)。
