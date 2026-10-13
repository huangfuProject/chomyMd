# Chomy 1.0.1 版本验证记录

日期：2026-10-13。平台：macOS 26.5.2，Apple M1 Max，arm64。本文对应当前仓库与重新生成的内部产物，不等同于公开发行批准。

## 验证结果

| 项目                  | 结果                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `pnpm check`          | ESLint、严格类型、28 个单元测试、格式检查通过                           |
| `pnpm test:e2e`       | 开发目录既有16个场景通过；本轮由1.0.1打包版完整重跑                     |
| `pnpm test:installed` | 从只读DMG复制且原构建不可用的Mac APP，16个场景通过，39.6 s              |
| 表格回归              | 空单元格选区、插行、撤销、导出场景连续 5 轮通过                         |
| macOS 构建            | APP、ZIP、DMG 成功；DMG 经 hdiutil verify                               |
| Windows 构建          | 便携目录及 ZIP 成功，Chomy.exe 为 PE32+ x86-64；未执行 Windows 运行验收 |
| 产物一致性            | 160 个 dist 运行文件逐字节匹配 Mac 与 Windows ASAR 内容                 |
| 完整性                | 7 个关键文件的大小和 SHA-256 已归档 artifact-manifest.json              |

测试包括 12 类 Markdown fixture 的重复模式切换与未编辑字节保存、BOM 与混合 LF/CRLF 保真、输入法组合保护、标题与列表、任务复选框勾选和跨模式撤销、文件切换、引用图片授权重启、图片粘贴、远程图片开关、主题安装/预览/重启/删除、只读与外部冲突、恢复、表格、代码高亮、数学与 Mermaid、HTML/PDF、大文件。

系统原生拼音的早期实测及测试副本身份说明见 [native-acceptance.md](../testing/native-acceptance.md)。本轮桌面锁定，未把自动化窗口截图视为新一轮原生 IME 或系统视觉验收。

本轮将全部工作区版本统一为1.0.1，并对重新构建的正式标识Mac应用重跑完整16项E2E。两个平台ASAR中的package.json均为1.0.1；160个运行文件与当前构建逐字节一致。Mac/Windows包内图标资源与源文件匹配。

## 本轮修复

- 源码编辑器缓存原始 Markdown，避免仅查看源码规范化混合换行；选区与搜索坐标继续使用 CodeMirror 内部文本。
- 表格选区同步并延后上下文条布局更新，解决空单元格点击后的插行竞态。
- 为 GFM 任务项增加可交互复选框，勾选写入 checked 属性并进入公共撤销历史。
- 数学采用 Marked 块级/行内扩展，围栏代码及行内代码中的美元符号保持字面内容。
- 简洁原生标题栏、按需编辑工具、表格上下文工具、自适应侧栏、960 px 正文默认宽度及明暗偏好界面。
- 主题支持说明与静态 PNG 预览；安装和读取校验尺寸、CRC、文件边界及路径。损坏预览或重复 ZIP 目标不会替换已验证主题。
- 增补完整开发者手册、Paper 示例、界面截图和产物校验和脚本。
- 改用黑白配色的小写chomy纯文字字标；黑字白底PNG主文件与透明横向字标、16–1024 px的ICNS、16–256 px的ICO。Dock与窗口接入新图标，Mac bundle图标与源ICNS逐字节一致。Windows跨平台便携EXE的资源图标限制见开发者手册6.1。

## 性能样本

来自打包应用的 10 次 UI 自动化墙钟采样，包含 IPC、渲染和断言。约 1.25 MB 的输入用于打开/编辑/保存/搜索，约 17 KB 文档用于模式转换。不能视为纯引擎延迟或跨硬件保证。

| 操作          | P50 / ms | P95 / ms |
| ------------- | -------: | -------: |
| 打开          |    112.4 |    291.2 |
| 编辑          |     37.4 |    128.9 |
| 保存          |    235.6 |    280.4 |
| 搜索          |     94.8 |    124.7 |
| 源码/可视往返 |     75.6 |    127.1 |

3 MiB 和 10 MiB 源码的打开、编辑、保存合计约 490 ms 和 1106 ms。完整样本见 [performance-results.json](../testing/performance-results.json)。打包时的并行压缩可能影响单机样本，结果用于回归参考。

## 可交付资料

- [开发者与主题手册](../developer-handbook.md)：架构、实现、扩展、自定义主题完整流程。
- [Paper 主题示例](../../packages/theme-engine/examples/paper)：可直接安装的 JSON、CSS、PNG。
- [产物完整性清单](artifact-manifest.json)：APP 关键文件、Mac ZIP/DMG、Windows 关键文件及便携 ZIP。
- [明亮界面](../testing/screenshots/chomy-light.png)、[暗色界面](../testing/screenshots/chomy-dark.png)、[表格工具](../testing/screenshots/chomy-table.png)、[主题偏好](../testing/screenshots/chomy-preferences.png)。截图为 1120×800 CSS 像素，页面截图不包含完整系统窗口装饰。

## 尚未满足的验收条件

Windows 10/11 实机安装、卸载、文件关联、系统输入法与路径边界尚未完成；真实 S3/MinIO/OSS 测试桶尚未验收；Mac Developer ID、公证、Windows 签名未配置，产物为未签名内部测试包。统一窗口/系统缩放的 Typora 对照与人工视觉批准也尚未完成。

当前云单元测试使用真实 SDK 向本机协议服务器发送请求，只证明协议适配和失败处理，不证明云厂商权限及公共 CDN 可用性。CI由main推送触发，运行状态以仓库Actions页面为准。项目 LICENSE 与完整第三方许可核查仍由发行流程完成。

详细条件见 [platform-checklist.md](platform-checklist.md)。

## 1.0.1 Mac安装启动修复

1.0.0 DMG临时复制使用默认fs.cp，framework相对符号链接被改为指向构建目录的绝对路径。真实安装后的Helper加载了包外的Electron Framework并退出；构建目录E2E不能覆盖此问题。1.0.1保留原始链接，复制前后检查14条链接均为相对路径且最终位于应用包内。

新增2项单元回归，并增加从只读DMG复制、移走原构建后执行全部16项场景的验证。实际复制到/Applications/Chomy.app后，通过正常桌面启动打开未命名文档窗口，进程保持运行，无新增Helper崩溃。证据为[实际安装截图](../testing/screenshots/installed-mac-1.0.1.png)。用户数据和系统安全设置未清除或修改。

上一轮GitHub macOS CI曾在fixture初始化尚未完成时读取空白排版指纹；本轮改为等待fixture实际内容并轮询渲染结果，排除ProseMirror用于编辑的占位图片。Windows CI当时通过check及E2E，打包被矩阵失败取消，仍不记为Windows发行通过。CI最新状态以仓库Actions页面为准。
