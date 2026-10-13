# Phase 1 验证

## 自动化

- `pnpm check`：lint / strict TypeScript / Vitest / Prettier。
- 单元测试：不同窗口、子 frame、外部来源拒绝；请求版本与额外参数拒绝；静态资源路径、恶意编码、越界后缀拒绝。
- `pnpm test:e2e`：真实 Electron 启动、React 壳、main/preload IPC、Node 不暴露、sandbox 进程指标、CSP 禁止网络、弹窗拒绝、截图。
- `pnpm package`：Forge 当前平台打包。`pnpm test:packaged` 直接启动 .app / .exe，并断言 app.isPackaged；与开发产物共用完整壳测试。

## 平台证据

本机 macOS 26.5.2，Apple M1 Max，arm64。Windows CI 已配置但尚未在远端运行，也没有 Windows 10/11 本机验收。CI 成功仍不能替代 IME、安装/卸载和操作系统交互手测。

## 手测关口

骨架应能关闭窗口并通过 macOS Dock/菜单重新激活；Windows 关闭最后窗口应退出。下阶段重点是中文输入组合态、光标、列表/表格撤销与未知 Markdown 透传，不由当前壳测试覆盖。
