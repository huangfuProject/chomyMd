# Chomy

独立实现、本地优先的 Markdown 桌面编辑器，目标为 macOS Apple Silicon 与 Windows 10/11 x64。当前为 **1.0.13**，已具备实际编辑、保存与恢复能力；不代表全部平台或公开发行验收完成。

可视与源码编辑、常见 Markdown/GFM、跨模式撤销、大纲、文件树、最近文件、查找替换、表格编辑、代码语言与高亮、公式/图表阅读、HTML/PDF 导出、专注/打字机模式已经接入。含未知语法或大型文档自动使用源码模式，保存保留未知内容。文件冲突阻止覆盖，异常恢复保留未保存缓冲。

窗口采用独立全高侧栏与简洁正文标题栏，文件操作位于标题菜单，字数弹窗显示统计；原生菜单提供主题切换，侧栏支持大纲、文件树、最近文件与搜索。

主题支持目录/ZIP 安装、说明和静态预览、持久切换、受限 CSS 迁移、明亮/暗色/系统跟随/高对比度。附件支持原路径引用、本地复制、S3-Compatible 与 Aliyun OSS 上传；默认离线，云密钥由系统加密存储。

## 运行

要求 Node 24.14.x、pnpm 10.12.4：

```sh
pnpm install --frozen-lockfile
pnpm start
```

使用生产构建，无远程开发脚本；修改后重新启动。Electron 下载超时时可选择可信镜像，仍校验摘要，不修改全局设置：

```sh
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm postinstall
```

Windows PowerShell 使用 `$env:ELECTRON_MIRROR` 设置环境变量。

## 验证与打包

```sh
pnpm check
pnpm test:e2e
pnpm make
pnpm test:packaged
pnpm test:installed
pnpm package:win
```

`check` 包含 lint、严格类型、单元测试与格式。E2E 启动真实 Electron；原生对话框由测试桩控制，系统输入法另行人工实测。`make` 在 Mac 生成内部 APP/ZIP/DMG，在 Windows 生成 ZIP/Squirrel EXE；`package:win` 生成 x64 应用目录与便携 ZIP，不能代替 Windows 运行验收。公开发行签名条件见 Forge 配置与发行清单。

## 结构与证据

- `apps/desktop`：Electron main、窄 preload、React UI 与编辑适配器。
- `packages`：contracts、document-core、editor-core、markdown-core、theme-engine、storage-core，均有公开入口与 README。
- `packages/test-fixtures`：12 类语法、编码、安全及性能输入。
- `research/typora-1.4`：Typora 1.4.8（6558）实测、截图与明确差异。
- `docs/adr`：内核、数据保存、安全与打包决策。
- [开发者手册](docs/developer-handbook.md)：架构、实现、扩展和完整主题制作流程。
- [内部版验证记录](docs/release/validation-report.md)：测试、性能、产物及尚需验收的环境。

未决定项目开源许可证，不擅自添加 LICENSE。参考主题、字体和图标没有复制或分发。
