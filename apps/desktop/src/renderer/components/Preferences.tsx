import { useState } from "react";
import type {
  CloudConfig,
  Preferences as Prefs,
  ThemeManifest,
} from "@chomy/contracts";
const initialCloud: CloudConfig = {
  provider: "s3",
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  publicUrl: "",
  prefix: "chomy",
  pathStyle: true,
};
export function Preferences({
  value,
  themes,
  cloud,
  onSave,
  onClose,
  onThemes,
  report,
}: {
  value: Prefs;
  themes: ThemeManifest[];
  cloud: CloudConfig | null;
  onSave: (value: Prefs) => Promise<void>;
  onClose: () => void;
  onThemes: (themes: ThemeManifest[]) => void;
  report: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [config, setConfig] = useState(cloud ?? initialCloud);
  const [accessKey, setAccessKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      setStatus(message);
      report(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="preferences-panel"
        role="dialog"
        aria-modal="true"
        aria-label="偏好设置"
      >
        <div className="dialog-title">
          <h2>偏好设置</h2>
          <button onClick={onClose} aria-label="关闭偏好设置">
            ×
          </button>
        </div>
        <div className="settings-scroll">
          <h3>外观与写作</h3>
          <label>
            主题
            <select
              aria-label="主题"
              value={draft.theme}
              onChange={(event) =>
                setDraft({ ...draft, theme: event.target.value })
              }
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          {themes.find((theme) => theme.id === draft.theme)?.description && (
            <p className="hint">
              {themes.find((theme) => theme.id === draft.theme)?.description}
            </p>
          )}
          {themes.find((theme) => theme.id === draft.theme)?.preview && (
            <img
              className="theme-preview"
              src={`chomy-theme://${draft.theme}/preview.png`}
              alt={`${themes.find((theme) => theme.id === draft.theme)?.name} 主题预览`}
            />
          )}
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  onThemes(await window.chomy.installTheme()),
                )
              }
            >
              安装主题文件夹
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  onThemes(await window.chomy.installTheme(true)),
                )
              }
            >
              安装 ZIP
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.chomy.importThemeCss();
                  onThemes(result.themes);
                  setStatus(
                    `CSS 迁移完成：忽略 ${result.omitted} 个不兼容选择器；请选择导入主题查看效果。`,
                  );
                })
              }
            >
              迁移 CSS
            </button>
            <button
              disabled={busy || draft.theme.startsWith("chomy-")}
              onClick={() =>
                void run(async () => {
                  onThemes(await window.chomy.removeTheme(draft.theme));
                  setDraft({ ...draft, theme: "chomy-light" });
                })
              }
            >
              移除所选主题
            </button>
          </div>
          <label>
            正文大小
            <input
              type="range"
              min="12"
              max="28"
              value={draft.fontSize}
              onChange={(event) =>
                setDraft({ ...draft, fontSize: Number(event.target.value) })
              }
            />
            <span>{draft.fontSize} px</span>
          </label>
          <label>
            正文宽度
            <input
              type="range"
              min="540"
              max="1000"
              step="20"
              value={draft.contentWidth}
              onChange={(event) =>
                setDraft({ ...draft, contentWidth: Number(event.target.value) })
              }
            />
            <span>{draft.contentWidth} px</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.autosave}
              onChange={(event) =>
                setDraft({ ...draft, autosave: event.target.checked })
              }
            />
            自动保存已有文件（检测冲突；新文档仍需选择保存位置）
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.remoteImages}
              onChange={(event) =>
                setDraft({ ...draft, remoteImages: event.target.checked })
              }
            />
            加载 HTTPS 远程图片（会向图片服务器发送请求）
          </label>
          <h3>图片与附件</h3>
          <label>
            插入方式
            <select
              value={draft.assetMode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  assetMode: event.target.value as Prefs["assetMode"],
                })
              }
            >
              <option value="local">复制到文档旁 assets 目录</option>
              <option value="reference">源文件路径（移动原文件会断链）</option>
              <option value="cloud">保留本地副本并上传云端</option>
            </select>
          </label>
          <p className="hint">
            源文件路径无需先保存文档。粘贴截图保存到 Chomy
            的持久图片目录，无需先保存文档，保存后保留绝对路径。原文件复制到
            assets 或上传云端需先保存文档；上传失败或取消会保留本地副本。
          </p>
          <h3>云存储</h3>
          <label>
            存储类型
            <select
              value={config.provider}
              onChange={(event) =>
                setConfig({
                  ...config,
                  provider: event.target.value as CloudConfig["provider"],
                  region:
                    event.target.value === "qiniu"
                      ? "z0"
                      : event.target.value === "aliyun"
                        ? "oss-cn-hangzhou"
                        : "us-east-1",
                  endpoint: "",
                })
              }
            >
              <option value="s3">S3-Compatible / MinIO</option>
              <option value="aliyun">阿里云 OSS</option>
              <option value="qiniu">七牛云 Kodo</option>
            </select>
          </label>
          {(
            ["bucket", "region", "endpoint", "publicUrl", "prefix"] as const
          ).map((key) => (
            <label key={key}>
              {
                {
                  bucket: "Bucket",
                  region: "Region",
                  endpoint: "Endpoint（可选）",
                  publicUrl: "公共 URL / CDN 根地址",
                  prefix: "对象前缀",
                }[key]
              }
              {key === "region" && config.provider === "qiniu" ? (
                <select
                  value={config.region}
                  onChange={(event) =>
                    setConfig({ ...config, region: event.target.value })
                  }
                >
                  <option value="z0">华东·浙江</option>
                  <option value="cn-east-2">华东·浙江 2</option>
                  <option value="z1">华北·河北</option>
                  <option value="z2">华南·广东</option>
                  <option value="na0">北美·洛杉矶</option>
                  <option value="as0">亚太·新加坡</option>
                  <option value="ap-southeast-2">亚太·河内</option>
                  <option value="ap-southeast-3">亚太·胡志明</option>
                </select>
              ) : (
                <input
                  value={config[key]}
                  onChange={(event) =>
                    setConfig({ ...config, [key]: event.target.value })
                  }
                  spellCheck={false}
                />
              )}
            </label>
          ))}
          {config.provider === "qiniu" && (
            <p className="hint">
              填写空间名称、所属区域及 HTTPS 访问域名。Endpoint
              可留空，自动使用该区域的上传域名；连接测试只读取文件列表。
            </p>
          )}
          {config.provider === "s3" && (
            <label className="check">
              <input
                type="checkbox"
                checked={config.pathStyle}
                onChange={(event) =>
                  setConfig({ ...config, pathStyle: event.target.checked })
                }
              />
              S3 path-style
            </label>
          )}
          <label>
            Access Key
            <input
              type="password"
              autoComplete="off"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
            />
          </label>
          <label>
            Secret
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </label>
          <p className="hint">
            凭据由系统安全存储加密，不会回传。必须使用公共桶或 CDN
            的长期地址；临时签名链接会过期。
          </p>
          <div className="button-row">
            <button
              disabled={busy || !accessKey || !secret}
              onClick={() =>
                void run(async () => {
                  await window.chomy.saveCloud(config, accessKey, secret);
                  setAccessKey("");
                  setSecret("");
                  setStatus("配置已加密保存");
                })
              }
            >
              保存云配置
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setStatus(await window.chomy.testCloud()))
              }
            >
              测试连接
            </button>
          </div>
          <p role="status">{status}</p>
        </div>
        <div className="dialog-footer">
          <button onClick={onClose}>取消</button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await onSave(draft);
                onClose();
              })
            }
          >
            保存偏好
          </button>
        </div>
      </section>
    </div>
  );
}
