# ADR 0002 — 编辑内核与文档会话

状态：已采用；真实平台验收单独记录。

Milkdown / ProseMirror 用于可视编辑，CodeMirror 6 用于源码编辑。两者通过 EditorAdapter 共享唯一 DocumentSession、修订号与 SessionHistory。磁盘 Markdown 是数据来源；模式切换先提交活动缓冲，再销毁旧适配器，并保存粗粒度语义位置。未编辑时直接保留原文本，避免打开或切换模式触发格式化。

含 Front Matter、任意 HTML、未知 directive、脚注、公式或超过 500,000 字符的文件使用源码模式，并说明原因。阅读模式经过净化，支持 KaTeX 和安全 Mermaid。此策略保留未知内容，代价是这些文件暂不支持全篇富文本编辑。可视编辑后的标准 Markdown 会由内核规范化，保证语义目标，不承诺字节级格式不变。

Milkdown 默认变更监听有延迟，早期验证发现立即保存可能读取旧内容；现改为同步 dispatchTransaction 提交。React 只在外部重置时重新设置内核内容，防止本地输入回显重置破坏光标。系统中文组合期间阻止切换、打开、关闭与保存，提交后再同步。人工拼音实测与模拟 composition 测试分别记录。

主进程 Documents 序列化保存、检查外部 SHA256、保留 UTF-8 BOM 和原换行。原子写入使用同目录独占临时文件、fsync、rename，并在临时文件同步后再次校验原文件摘要；只读文件拒绝覆盖，保留原权限；保存前保留恢复快照，失败维持 dirty。更新携带会话 ID 和递增修订号，旧编辑器回调不能修改新文档。恢复不覆盖外部修改，用户可重新加载或另存副本。

验证见 tests/unit/documents.test.ts、tests/e2e/fixtures.spec.ts、interactions.spec.ts 与 shell.spec.ts。Windows 文件锁、系统 IME 和安装验收仍须真实 Windows 环境。
