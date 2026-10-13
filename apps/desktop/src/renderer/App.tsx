import { useEffect, useRef, useState, useMemo } from "react";
import type {
  AppCommand,
  Bootstrap,
  FileEntry,
  Preferences as Prefs,
  ThemeManifest,
  UploadStatus,
} from "@chomy/contracts";
import type { EditorAdapter } from "@chomy/editor-core";
import { headings, unsupportedReason } from "@chomy/markdown-core";
import { useDocument } from "./app/useDocument";
import { EditorPane } from "./editor/EditorPane";
import { Preview } from "./editor/Preview";
import { renderMarkdown, renderDiagrams } from "./editor/render";
import { Icon } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { Preferences } from "./components/Preferences";
export function App() {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [themes, setThemes] = useState<ThemeManifest[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [sidebar, setSidebar] = useState<"outline" | "files" | "recent">(
    "outline",
  );
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTools, setShowTools] = useState(false);
  const [tableActive, setTableActive] = useState(false);
  const [platform, setPlatform] = useState("unknown");
  useEffect(() => {
    void window.chomy
      .getApplicationInfo()
      .then((info) => setPlatform(info.platform))
      .catch(() => setError("无法读取平台信息。"));
  }, []);
  const [settings, setSettings] = useState(false);
  const [source, setSource] = useState(false);
  const [preview, setPreview] = useState(false);
  const [find, setFind] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [focus, setFocus] = useState(false);
  const [typewriter, setTypewriter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null);
  useEffect(() => {
    let active = true;
    const update = () =>
      void window.chomy
        .uploadStatus()
        .then((value) => {
          if (active) setUploadStatus(value);
        })
        .catch(() => {
          if (active) setError("无法读取上传状态；文档仍保留。");
        });
    update();
    const timer = busy ? setInterval(update, 250) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [busy]);
  const [editorLocked, setEditorLocked] = useState(false);
  const [themeCss, setThemeCss] = useState("");
  const [link, setLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkLabel, setLinkLabel] = useState("链接");
  const state = useDocument(setError);
  const editor = useRef<EditorAdapter | null>(null);
  const editorSessionId = useRef<string | null>(null);
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const actionRef = useRef<(action: AppCommand | string) => void>(
    () => undefined,
  );
  const document = state.document;
  const wordCount = useMemo(
    () =>
      document?.markdown.match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu,
      )?.length ?? 0,
    [document?.markdown],
  );
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      for (const menu of window.document.querySelectorAll<HTMLDetailsElement>(
        ".titlebar details[open], .sidebar-header details[open]",
      )) {
        if (
          event instanceof KeyboardEvent ||
          (event.target instanceof Node && !menu.contains(event.target))
        ) {
          menu.open = false;
          if (event instanceof KeyboardEvent)
            menu.querySelector<HTMLElement>("summary")?.focus();
        }
      }
    };
    window.document.addEventListener("click", close);
    window.document.addEventListener("keydown", close);
    return () => {
      window.document.removeEventListener("click", close);
      window.document.removeEventListener("keydown", close);
    };
  }, []);
  useEffect(() => {
    window.document.title = document
      ? `${document.name}${document.dirty ? " •" : ""} — Chomy`
      : "Chomy";
  }, [document?.name, document?.dirty]);
  const [outlineSource, setOutlineSource] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setOutlineSource(document?.markdown ?? ""),
      300,
    );
    return () => clearTimeout(timer);
  }, [document?.markdown]);
  const outline = useMemo(() => headings(outlineSource), [outlineSource]);
  const reason = document ? unsupportedReason(document.markdown) : null;
  const effectiveSource = source || Boolean(reason);
  const run = (operation: () => Promise<unknown>, allowEditing = false) => {
    const pending = operations.current
      .catch(() => undefined)
      .then(async () => {
        setError("");
        setBusy(true);
        setEditorLocked(!allowEditing);
        try {
          await operation();
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "操作失败，文档仍保留。",
          );
        } finally {
          setBusy(false);
          setEditorLocked(false);
        }
      });
    operations.current = pending;
    return pending;
  };
  const refreshRecent = async () => {
    const recent = await window.chomy.recent();
    setData((previous) => (previous ? { ...previous, recent } : previous));
  };
  const asset = async () => {
    const live =
      editorSessionId.current === state.current.current?.id
        ? editor.current?.getMarkdown()
        : undefined;
    if (live !== undefined) state.change(live);
    await state.flush();
    const value = await window.chomy.insertAsset();
    if (value) {
      if (value.id === state.current.current?.id)
        editor.current?.insertMarkdown(value.markdown);
      else setError("附件所属文档已切换，未插入到其他文档。");
    }
  };
  const action = (command: AppCommand | string) => {
    if (
      editorLocked &&
      ![
        "close-request",
        "open",
        "new",
        "save",
        "saveAs",
        "folder",
        "open-pending",
        "export-html",
        "export-pdf",
      ].includes(command) &&
      !command.startsWith("error:")
    )
      return;
    if (
      ["close-request", "save", "saveAs", "source", "open", "new"].includes(
        command,
      ) &&
      editor.current?.isComposing()
    ) {
      setError("请先完成当前输入法组合，再保存或切换文档。");
      return;
    }
    if (command.startsWith("error:")) {
      setError(command.slice(6));
      return;
    }
    if (command === "undo") {
      state.undo();
      return;
    }
    if (command === "redo") {
      state.redo();
      return;
    }
    if (command === "source") {
      state.checkpoint();
      const live =
        editorSessionId.current === state.current.current?.id
          ? editor.current?.getMarkdown()
          : undefined;
      if (live !== undefined) state.change(live);
      if (reason) setNotice(reason);
      else {
        setSource(!source);
        setPreview(false);
      }
      return;
    }
    if (command === "sidebar") {
      setShowSidebar(!showSidebar);
      return;
    }
    if (command === "reading") {
      setPreview(!preview);
      return;
    }
    if (command === "tools") {
      setShowTools(!showTools);
      return;
    }
    if (command === "find") {
      setFind(!find);
      return;
    }
    if (
      ["theme-light", "theme-dark", "theme-system", "theme-contrast"].includes(
        command,
      )
    ) {
      void run(async () => {
        if (prefs)
          setPrefs(
            await window.chomy.setPreferences({
              ...prefs,
              theme: command.replace("theme-", "chomy-"),
            }),
          );
      }, true);
      return;
    }
    if (command === "preferences") {
      setSettings(true);
      return;
    }
    if (command === "focus") {
      setFocus(!focus);
      return;
    }
    if (command === "typewriter") {
      setTypewriter(!typewriter);
      return;
    }
    if (command === "link") {
      setLink(true);
      return;
    }
    if (
      [
        "heading-1",
        "heading-2",
        "heading-3",
        "heading-4",
        "heading-5",
        "heading-6",
        "paragraph",
        "bullet",
        "ordered",
        "quote",
        "task",
        "rule",
        "code-block",
        "bold",
        "italic",
        "code",
        "table",
        "row",
        "column",
        "delete-row",
        "delete-column",
        "align-left",
        "align-center",
        "align-right",
      ].includes(command)
    ) {
      state.checkpoint();
      editor.current?.format(command);
      setTableActive(editor.current?.isInTable() ?? false);
      return;
    }
    void run(async () => {
      const live =
        editorSessionId.current === state.current.current?.id
          ? editor.current?.getMarkdown()
          : undefined;
      if (live !== undefined) state.change(live);
      await state.flush();
      if (command === "new") {
        state.adopt(await window.chomy.newDocument());
        setPreview(false);
      } else if (command === "open-pending") {
        state.adopt(await window.chomy.openPendingDocument());
        setPreview(false);
        await refreshRecent();
      } else if (command === "open") {
        state.adopt(await window.chomy.openDocument());
        setPreview(false);
        await refreshRecent();
      } else if (command === "save" || command === "saveAs") {
        state.adopt(await window.chomy.save(command === "saveAs"));
        await refreshRecent();
      } else if (command === "folder") {
        setFiles(await window.chomy.openFolder());
        setSidebar("files");
        setShowSidebar(true);
      } else if (command === "image") await asset();
      else if (command === "close-request") await window.chomy.confirmClose();
      else if (command === "export-html" || command === "export-pdf") {
        if (!state.current.current) return;
        const root = window.document.createElement("div");
        root.innerHTML = await renderMarkdown(
          state.current.current.markdown,
          state.current.current.id,
          prefs?.remoteImages ?? false,
        );
        await renderDiagrams(root);
        const css = Array.from(window.document.styleSheets)
          .flatMap((sheet) => {
            try {
              return Array.from(sheet.cssRules).map((rule) =>
                rule.cssText.replace(
                  /url\((["']?)([^"')]+)\1\)/g,
                  (match, _quote: string, url: string) =>
                    url.startsWith("data:")
                      ? match
                      : `url("${new URL(url, sheet.href ?? location.href).toString()}")`,
                ),
              );
            } catch {
              return [];
            }
          })
          .join("\n");
        const html = `<style>${css}</style><article class="chomy-document reading-preview">${root.innerHTML}</article>`;
        const result = await window.chomy.exportDocument(
          command === "export-html" ? "html" : "pdf",
          html,
        );
        if (result) setNotice("已导出 " + result);
      }
    }, command === "image");
  };
  actionRef.current = action;
  useEffect(() => {
    void window.chomy
      .bootstrap()
      .then((value) => {
        setData(value);
        setPrefs(value.preferences);
        setThemes(value.themes);
        state.initialize(value);
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : "启动失败"),
      );
    const unsubscribe = window.chomy.onCommand((command) =>
      actionRef.current(command),
    );
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!prefs) return;
    let active = true;
    void window.chomy
      .themeCss(prefs.theme)
      .then((css) => {
        if (active) setThemeCss(css);
      })
      .catch(() => {
        setThemeCss("");
        setError("主题加载失败，已使用默认样式。");
      });
    return () => {
      active = false;
    };
  }, [prefs?.theme, themes]);
  useEffect(() => {
    const timer = setInterval(() => {
      void window.chomy
        .status()
        .then((value) => {
          if (
            value.id === state.current.current?.id &&
            value.revision === state.current.current.revision
          )
            state.adopt(value);
        })
        .catch((error) =>
          setError(error instanceof Error ? error.message : "状态检查失败"),
        );
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  const openEntry = (entry: FileEntry) =>
    void run(async () => {
      const live =
        editorSessionId.current === state.current.current?.id
          ? editor.current?.getMarkdown()
          : undefined;
      if (live !== undefined) state.change(live);
      await state.flush();
      state.adopt(await window.chomy.openEntry(entry.id));
      setPreview(false);
      await refreshRecent();
    });
  const paste = async (event: React.ClipboardEvent) => {
    const item = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
      return;
    event.preventDefault();
    void run(async () => {
      const live =
        editorSessionId.current === state.current.current?.id
          ? editor.current?.getMarkdown()
          : undefined;
      if (live !== undefined) state.change(live);
      await state.flush();
      const current = state.current.current;
      if (!current) return;
      const value = await window.chomy.pasteImage(
        {
          id: current.id,
          markdown: current.markdown,
          revision: current.revision,
        },
        Array.from(new Uint8Array(await file.arrayBuffer())),
        file.type as "image/png" | "image/jpeg" | "image/webp",
      );
      if (value.id === state.current.current?.id)
        editor.current?.insertMarkdown(value.markdown);
    }, true);
  };
  const drop = (event: React.DragEvent) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    void run(
      async () => {
        const live =
          editorSessionId.current === state.current.current?.id
            ? editor.current?.getMarkdown()
            : undefined;
        if (live !== undefined) state.change(live);
        await state.flush();
        if (/\.(md|markdown|txt)$/i.test(file.name)) {
          state.adopt(await window.chomy.openDroppedFile(file));
          await refreshRecent();
        } else {
          const value = await window.chomy.insertDroppedAsset(file);
          if (value.id === state.current.current?.id)
            editor.current?.insertMarkdown(value.markdown);
        }
      },
      !/\.(md|markdown|txt)$/i.test(file.name),
    );
  };
  if (!document || !prefs)
    return (
      <main className="loading">
        <h1>Chomy</h1>
        <p role="status">{error || "正在打开工作空间…"}</p>
      </main>
    );
  return (
    <div
      className={`app-shell ${showSidebar ? "with-sidebar" : "without-sidebar"} platform-${platform} ${focus ? "focus-mode" : ""} ${typewriter ? "typewriter-mode" : ""} ${(themes.find((theme) => theme.id === prefs.theme)?.modes.length === 1 && themes.find((theme) => theme.id === prefs.theme)?.modes[0] === "dark") || (themes.find((theme) => theme.id === prefs.theme)?.modes.length === 2 && systemDark) ? "dark-shell" : ""}`}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={drop}
    >
      <style>{themeCss}</style>
      {showSidebar && (
        <Sidebar
          mode={sidebar}
          onMode={setSidebar}
          outline={outline}
          files={files}
          recent={data?.recent ?? []}
          onHeading={(index) => editor.current?.jumpToHeading(index)}
          onOpen={openEntry}
          onFolder={() => action("folder")}
        />
      )}
      <div className="editor-column">
        <header className="titlebar">
          <details
            className="document-menu"
            onClick={(event) => {
              if ((event.target as Element).closest("button"))
                event.currentTarget.open = false;
            }}
          >
            <summary aria-label="文档菜单" title="文档菜单">
              <span className="document-title">{document.name}</span>
              {document.dirty && (
                <span className="document-state"> — 已编辑</span>
              )}
            </summary>
            <div className="chrome-popover document-actions">
              <button
                aria-label="新建"
                disabled={busy}
                onClick={() => action("new")}
              >
                新建
              </button>
              <button
                aria-label="打开"
                disabled={busy}
                onClick={() => action("open")}
              >
                打开
              </button>
              <button
                aria-label="保存"
                disabled={busy}
                onClick={() => action("save")}
              >
                保存
              </button>
              <button disabled={busy} onClick={() => action("saveAs")}>
                另存为…
              </button>
              <hr />
              <button
                aria-label="编辑工具"
                aria-pressed={showTools}
                disabled={editorLocked}
                onClick={() => setShowTools(!showTools)}
              >
                编辑工具
              </button>
              <button
                disabled={editorLocked}
                aria-pressed={effectiveSource}
                onClick={() => action("source")}
              >
                源码
              </button>
              <button
                disabled={editorLocked}
                aria-pressed={preview}
                onClick={() => setPreview(!preview)}
              >
                阅读
              </button>
              <button disabled={editorLocked} onClick={() => action("find")}>
                查找
              </button>
              <hr />
              <button aria-label="偏好设置" onClick={() => setSettings(true)}>
                偏好设置
              </button>
            </div>
          </details>
          <div className="header-controls">
            <details className="statistics">
              <summary aria-label="文档统计" title="文档统计">
                {wordCount} 词 <Icon name="chevrons" />
              </summary>
              <div className="chrome-popover" role="status">
                <p>
                  {document.dirty
                    ? "未保存"
                    : document.saved
                      ? "已保存"
                      : "新文档"}{" "}
                  · {effectiveSource ? "源码" : "可视编辑"}
                </p>
                <p>
                  {document.markdown.length.toLocaleString()} 字符 ·{" "}
                  {document.markdown.split(/\r?\n/).length.toLocaleString()} 行
                </p>
              </div>
            </details>
            <button
              className="icon-button"
              aria-label="显示大纲"
              title="大纲"
              onClick={() => {
                setSidebar("outline");
                setShowSidebar(true);
              }}
            >
              <Icon name="outline" />
            </button>
            <button
              className="icon-button"
              aria-label="显示或隐藏侧栏"
              title="侧栏"
              aria-pressed={showSidebar}
              onClick={() => setShowSidebar(!showSidebar)}
            >
              <Icon name="sidebar" />
            </button>
          </div>
        </header>
        <div
          className="toolbar"
          hidden={!showTools && !tableActive}
          inert={editorLocked}
          role="toolbar"
          aria-label="编辑工具"
        >
          <div className="primary-tools" hidden={!showTools}>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("bold")}
              title="加粗"
            >
              B
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("italic")}
              title="斜体"
            >
              <i>I</i>
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("code")}
            >
              代码
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("link")}
            >
              链接
            </button>
            <button onClick={() => action("image")} disabled={busy}>
              附件
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("table")}
            >
              表格
            </button>
          </div>
          <div className="table-tools" hidden={!tableActive}>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("row")}
            >
              ＋行
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("column")}
            >
              ＋列
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("delete-row")}
            >
              －行
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("delete-column")}
            >
              －列
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("align-left")}
            >
              左
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("align-center")}
            >
              中
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => action("align-right")}
            >
              右
            </button>
          </div>
        </div>
        {find && (
          <div className="findbar" inert={editorLocked}>
            <input
              aria-label="查找文本"
              placeholder="查找"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  editor.current?.find(query, event.shiftKey);
              }}
            />
            <input
              aria-label="替换文本"
              placeholder="替换为"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            />
            <button
              onClick={() =>
                setNotice(editor.current?.find(query) ? "" : "未找到匹配")
              }
            >
              下一个
            </button>
            <button onClick={() => editor.current?.find(query, true)}>
              上一个
            </button>
            <button
              onClick={() =>
                setNotice(
                  `已替换 ${editor.current?.replace(query, replacement, false) ?? 0} 项`,
                )
              }
            >
              替换
            </button>
            <button
              onClick={() =>
                setNotice(
                  `已替换 ${editor.current?.replace(query, replacement, true) ?? 0} 项`,
                )
              }
            >
              全部替换
            </button>
            <button onClick={() => setFind(false)} aria-label="关闭查找">
              ×
            </button>
          </div>
        )}
        {document.externalChange && (
          <div className="banner warning">
            文件已被外部修改。保存不会覆盖外部内容。
            <button
              onClick={() =>
                void run(async () => {
                  const live =
                    editorSessionId.current === state.current.current?.id
                      ? editor.current?.getMarkdown()
                      : undefined;
                  if (live !== undefined) state.change(live);
                  await state.flush();
                  state.adopt(await window.chomy.reload());
                })
              }
            >
              重新加载
            </button>
            <button onClick={() => action("saveAs")}>另存副本</button>
          </div>
        )}
        {error && (
          <div className="banner error" role="alert">
            {error}
            {error.includes("上传") && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await window.chomy.retryAsset();
                    if (value.id !== state.current.current?.id)
                      throw new Error("附件所属文档已切换，未插入到其他文档。");
                    editor.current?.insertMarkdown(value.markdown);
                  })
                }
              >
                重试附件上传
              </button>
            )}
            <button onClick={() => setError("")} aria-label="关闭错误">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="banner" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="关闭提示">
              ×
            </button>
          </div>
        )}
        {busy && (
          <div className="banner" role="status">
            {uploadStatus?.state === "uploading" ||
            uploadStatus?.state === "queued" ? (
              <>
                正在上传附件（{Math.ceil(uploadStatus.total / 1024)} KB）…{" "}
                <progress aria-label="附件上传进度" />
              </>
            ) : (
              "正在处理…"
            )}
            {(uploadStatus?.state === "uploading" ||
              uploadStatus?.state === "queued") && (
              <button
                onClick={() =>
                  void window.chomy
                    .cancelUpload()
                    .catch((error) => setError(String(error)))
                }
              >
                取消上传
              </button>
            )}
          </div>
        )}
        {data && data.recoveries.length > 0 && (
          <div className="recovery-panel">
            <strong>发现未保存的恢复内容</strong>
            {data.recoveries.map((recovery) => (
              <div key={recovery.id}>
                <span>
                  {recovery.name} · {new Date(recovery.date).toLocaleString()}
                </span>
                <button
                  onClick={() =>
                    void run(async () => {
                      const live =
                        editorSessionId.current === state.current.current?.id
                          ? editor.current?.getMarkdown()
                          : undefined;
                      if (live !== undefined) state.change(live);
                      await state.flush();
                      state.adopt(await window.chomy.restore(recovery.id));
                      setData({
                        ...data,
                        recoveries: data.recoveries.filter(
                          (value) => value.id !== recovery.id,
                        ),
                      });
                    })
                  }
                >
                  恢复
                </button>
                <button
                  onClick={() =>
                    void run(async () => {
                      await window.chomy.discardRecovery(recovery.id);
                      setData({
                        ...data,
                        recoveries: data.recoveries.filter(
                          (value) => value.id !== recovery.id,
                        ),
                      });
                    })
                  }
                >
                  丢弃恢复副本
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="workspace">
          <main
            className="document-scroll"
            inert={editorLocked}
            aria-busy={editorLocked}
            onMouseUp={(event) => {
              const target = event.target;
              const inside =
                target instanceof Element && target.closest("table") !== null;
              requestAnimationFrame(() =>
                setTableActive(
                  inside || (editor.current?.isInTable() ?? false),
                ),
              );
            }}
            onKeyUp={() => setTableActive(editor.current?.isInTable() ?? false)}
            onPasteCapture={(event) => void paste(event)}
          >
            <article
              className="chomy-document"
              style={
                {
                  "--chomy-body-size": prefs.fontSize + "px",
                  "--chomy-content-max-width": prefs.contentWidth + "px",
                } as React.CSSProperties
              }
            >
              {reason && <p className="source-reason">{reason}</p>}
              <div hidden={preview}>
                <EditorPane
                  resetVersion={state.resetVersion}
                  document={document}
                  source={effectiveSource}
                  remote={prefs.remoteImages}
                  onChange={(value, id) => {
                    if (id === state.current.current?.id) state.change(value);
                  }}
                  onCommand={(command) => actionRef.current(command)}
                  onReady={(value, id) => {
                    if (value) {
                      editor.current = value;
                      setTableActive(value.isInTable());
                      editorSessionId.current = id;
                    } else if (editorSessionId.current === id) {
                      editor.current = null;
                      setTableActive(false);
                      editorSessionId.current = null;
                    }
                  }}
                  onError={(message) => {
                    setError(message);
                    setSource(true);
                  }}
                />
              </div>
              {preview && (
                <Preview
                  markdown={document.markdown}
                  id={document.id}
                  remote={prefs.remoteImages}
                  onError={setError}
                />
              )}
            </article>
          </main>
        </div>
      </div>
      {settings && (
        <Preferences
          value={prefs}
          themes={themes}
          cloud={data?.cloud ?? null}
          report={setError}
          onThemes={setThemes}
          onClose={() => setSettings(false)}
          onSave={async (value) => {
            setPrefs(await window.chomy.setPreferences(value));
          }}
        />
      )}
      {link && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="插入链接"
            className="link-panel"
          >
            <h2>插入链接</h2>
            <label>
              显示文字
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
              />
            </label>
            <label>
              URL
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button onClick={() => setLink(false)}>取消</button>
              <button
                onClick={() => {
                  if (
                    !/^https?:\/\/|^mailto:/i.test(linkUrl) ||
                    /[\s<>]/.test(linkUrl)
                  ) {
                    setError(
                      "链接仅允许 HTTP、HTTPS 或 mailto，不能包含空格。",
                    );
                    return;
                  }
                  editor.current?.insertMarkdown(
                    `[${linkLabel.replace(/[[\]]/g, "")}](${linkUrl.replace(/[()]/g, encodeURIComponent)})`,
                  );
                  setLink(false);
                }}
              >
                插入
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
