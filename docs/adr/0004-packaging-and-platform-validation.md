# ADR 0004 — 打包与平台验证

状态：内部测试打包；公开发行尚未通过。

主进程与 preload 由 esbuild 完整打包，renderer 由 Vite 构建。Forge 包含 app.asar，不复制 workspace 源码或 node_modules，避免 pnpm 工作区依赖遍历。Node 24、pnpm 10 和精确锁文件固定构建输入。应用图标为黑白配色的小写chomy衬线字标，PNG主文件通过scripts/build-icons.mjs转换为PNG、ICNS、ICO；格式转换使用AppKit，应用运行不依赖该工具。

macOS arm64 生成 .app、ZIP 和通过系统 hdiutil 创建/校验的 DMG，原生 arm64 测试应用可运行。没有 Developer ID 或公证凭据，产物仅用于内部测试。公开发行标志会在凭据缺失时拒绝构建。

Windows 目标始终为 x64。Forge 配置 ZIP 与 Squirrel 安装包，处理安装事件与文件关联。macOS 上的交叉打包只证明产物生成，不能证明 Windows 10/11 安装、卸载、IME、文件锁或 SmartScreen 已通过。CI 在 macos-14 arm64 和 Windows x64 分别运行质量门禁、E2E、make 与打包应用 E2E；当前没有远端仓库，尚未执行远端 CI。

更新策略：首版手动安装新版本；不启用自动下载或安装。公开发行前补齐签名、公证、版本升级/回滚和真实平台验收。
