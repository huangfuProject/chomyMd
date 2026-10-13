# 进程与依赖边界

```text
React renderer -> window.chomy.getApplicationInfo()
             -> bundled sandbox preload / contextBridge
             -> versioned allowlisted IPC
             -> Electron main / runtime schema + sender validation
```

Contracts 仅依赖 Zod。Main 允许 Node；preload 只使用 Electron IPC/contextBridge；renderer 不允许 Node/Electron/云 SDK imports，由 ESLint 阻断。未来文件路径和权限必须留在 main，不能扩展成 `readFile(path)` 等任意路径桥。

本阶段没有文档模型、编辑状态、持久化或云连接。静态壳无法丢失用户文档，因为尚未打开用户数据；未来阶段必须添加原子保存和恢复故障测试，不能把这个结论扩大到编辑功能。
