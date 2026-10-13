# Markdown fixture corpus

12 类文档按指南建立。fixtures.spec.ts 在真实 Electron 中执行反复模式切换，比较已支持内容的可视结构，保存未编辑文档并逐字节对照。未知语法使用源码保护，不声称这些语法已支持富文本往返。

09 为 UTF-8 BOM + CRLF，按字节验证，格式化工具排除此目录。10 约 1.25 MB；性能场景另生成 3 MiB/10 MiB 输入与 P50/P95 记录。04 附有原创 SVG，故意缺失的上级图片验证失败回退。05 远程 URL 默认不加载。11 恶意内容只经受控渲染读取，不执行脚本。

系统中文输入法人工记录见 docs/testing/native-acceptance.md；模拟 composition 事件不能替代该记录。
