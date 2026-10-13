# ADR 0001：桌面骨架与阶段边界

- 日期：2026-10-12
- 状态：Phase 1 已实施；编辑器内核尚未决策

## 背景与决策

仓库原先只有开发指南。遵循第 13 节，先研究再创建骨架，不跨越 Phase 2 内核验收。基线采用 pnpm Workspace、Electron、React、严格 TypeScript、平台独立 contracts。

Forge 8 的 pnpm 打包检查要求 hoisted 布局；仅在本项目 `.npmrc` 设置 `node-linker=hoisted`，不改全局 pnpm 配置。所有运行时代码均打入 dist，因此源码依赖放在 devDependencies，发布包不携带 workspace TypeScript 源码。Forge 的依赖遍历无法解析 workspace 上级的 hoisted 开发依赖；因为所有运行时代码已完整 bundle，packager 显式禁用 prune 并排除 node_modules，而不是将开发依赖一起发布。打包产物的真实启动测试覆盖这一决策。

使用 esbuild 分别打包 main/preload，Vite 打包 renderer，Electron Forge 负责内部打包。与 Forge Vite 热更新模板相比，显式生产构建避免 Phase 1 引入开发服务器来源、WebSocket 和宽松 CSP；后续可单独评估热更新。沙箱 preload 仅 externalize Electron，其余纯 JS 依赖打成单个 CommonJS 文件。

只暴露 `chomy:v1:application-info`。主进程验证 webContents 身份、主 frame 和完整文档 URL，并校验严格请求 schema；preload 校验响应。无任意路径、通用 IPC 或云端凭据接口。

静态文件通过 `chomy://app/` 协议加载，限定 renderer 根目录、后缀和 GET 方法。CSP 禁止远程连接、脚本、frame；拒绝导航、弹窗、webview 和权限请求。文档/主题扩展须重新审查资源边界。

## 版本核查

2026-10-12 从 npm registry 核查并锁定：Electron 44.7.0、Forge 8.0.1、React/React DOM 19.3.0、Vite 8.3.4、TypeScript 5.9.3、Zod 4.6.6、Vitest 5.0.4、Playwright 1.64.0、esbuild 0.28.2。TypeScript 使用 5.9 稳定系列以降低新主版本迁移风险；不是宣称最新版。

参考：https://www.electronjs.org/docs/latest/tutorial/security/ 。遵循 isolation、sandbox、CSP 和 sender validation 原则。具体兼容性以本仓库 typecheck/build/E2E 的实际结果为准。

## 后果与下一步

当前模块只包含实际工作代码，不为空的业务层制造实现。文件保存、原子写入、恢复、主题、云存储均未接入，因此不接收用户 Markdown。Phase 2 将引入 EditorAdapter 与 Milkdown/CodeMirror spike；IME、语义往返和撤销否决条件通过后才能做 Phase 3。默认样式独立编写，数值均为 TODO(reference-check)，不声称已经高保真。

未经用户验收不开始 Phase 2；重大内核/架构变更另行记录 ADR。
