# 平台与公开发行清单

## 已有本地证据

- macOS26.5.2/M1 Max，原生arm64 Electron编辑与打包应用运行。
- 打包格式APP/ZIP/DMG，DMG通过hdiutil verify。
- 磁盘读写、模式、恢复、冲突、主题、附件、HTML/PDF的真实Electron自动化。
- 系统拼音实测（隔离辅助副本），原生打开/保存控件。
- Windows x64构建脚本与CI配置；构建不视为运行验收。

## 尚需环境或发行身份

- Windows10 x64与Windows11 x64真实安装、卸载、文件关联、Ctrl菜单、中文路径/UNC/长路径、图片粘贴/拖放、系统IME、恢复/冲突、OSS回归。
- 真实S3/MinIO与Aliyun测试桶：最小权限连接、上传、取消、权限不足、断网、永久CDN链接重开。当前只有本机真实SDK签名协议服务器测试，不代表云厂商验收。
- Developer ID签名、公证和Gatekeeper验证；Windows代码签名/SmartScreen。所有秘密通过环境变量/CI Secret，不提交仓库。
- 统一窗口尺寸、系统缩放、fixture、明暗主题的人工视觉批准。
- 项目LICENSE、发布仓库、版本升级与回滚的拥有者决策。

首版手动更新，不自行下载或安装更新。
