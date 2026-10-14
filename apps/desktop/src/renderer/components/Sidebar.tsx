import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { FileEntry } from "@chomy/contracts";
interface TreeNode {
  name: string;
  key: string;
  entry?: FileEntry;
  children: Map<string, TreeNode>;
}
function buildTree(entries: FileEntry[]) {
  const root: TreeNode = { name: "", key: "", children: new Map() };
  for (const entry of entries) {
    if (entry.relative === ".") continue;
    let node = root;
    let key = "";
    const segments = entry.relative.replaceAll("\\", "/").split("/");
    for (const [index, name] of segments.entries()) {
      key += (key ? "/" : "") + name;
      let child = node.children.get(name);
      if (!child) {
        child = { name, key, children: new Map() };
        node.children.set(name, child);
      }
      if (index === segments.length - 1) child.entry = entry;
      node = child;
    }
  }
  return root;
}
function FileTree({
  entries,
  onOpen,
}: {
  entries: FileEntry[];
  onOpen: (entry: FileEntry) => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const render = (node: TreeNode, depth: number): React.ReactNode =>
    Array.from(node.children.values())
      .sort(
        (a, b) =>
          Number(Boolean(a.entry && a.entry.kind !== "directory")) -
            Number(Boolean(b.entry && b.entry.kind !== "directory")) ||
          a.name.localeCompare(b.name),
      )
      .map((child) =>
        child.entry && child.entry.kind !== "directory" ? (
          <button
            key={child.key}
            aria-current={selected === child.key ? "page" : undefined}
            disabled={child.entry.editable === false}
            title={
              child.entry.editable === false
                ? `${child.key}（非文本编辑文件）`
                : child.key
            }
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => {
              setSelected(child.key);
              onOpen(child.entry!);
            }}
          >
            {child.name}
          </button>
        ) : (
          <div key={child.key}>
            <button
              style={{ paddingLeft: 12 + depth * 14 }}
              aria-expanded={expanded.has(child.key)}
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(child.key)) next.delete(child.key);
                  else next.add(child.key);
                  return next;
                })
              }
            >
              {expanded.has(child.key) ? "▾" : "▸"} {child.name}
            </button>
            {expanded.has(child.key) && render(child, depth + 1)}
          </div>
        ),
      );
  return (
    <div className="file-list">
      <div className="folder-root">
        {entries.find((entry) => entry.relative === ".")?.name}
      </div>
      {render(tree, 0)}
    </div>
  );
}
export function Sidebar({
  mode,
  onMode,
  outline,
  files,
  recent,
  onHeading,
  onOpen,
  onFolder,
  onFileTree,
}: {
  mode: "outline" | "files" | "recent";
  onMode: (value: "outline" | "files" | "recent") => void;
  outline: { depth: number; text: string }[];
  files: FileEntry[];
  recent: FileEntry[];
  onHeading: (index: number) => void;
  onOpen: (entry: FileEntry) => void;
  onFolder: () => void;
  onFileTree: () => void;
}) {
  const [selected, setSelected] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  return (
    <aside className="sidebar">
      <div className="window-controls-space" />
      <header className="sidebar-header">
        <button
          aria-label="显示当前文件夹文件树"
          title="文件树"
          onClick={() => {
            setQuery("");
            onFileTree();
          }}
        >
          <Icon name="tree" />
        </button>
        <details
          className="sidebar-menu"
          onClick={(event) => {
            if ((event.target as Element).closest("button"))
              event.currentTarget.open = false;
          }}
        >
          <summary aria-label="切换侧栏视图" title="切换侧栏视图">
            {{ outline: "大纲", files: "文件", recent: "最近" }[mode]}
          </summary>
          <nav className="chrome-popover" aria-label="侧栏视图">
            {(["outline", "files", "recent"] as const).map((tab) => (
              <button
                key={tab}
                aria-pressed={mode === tab}
                onClick={() => {
                  onMode(tab);
                  setQuery("");
                }}
              >
                {{ outline: "大纲", files: "文件", recent: "最近" }[tab]}
              </button>
            ))}
          </nav>
        </details>
        <button
          aria-label="搜索侧栏"
          title="搜索"
          aria-pressed={searching}
          onClick={() => {
            setSearching(!searching);
            setQuery("");
          }}
        >
          <Icon name="search" />
        </button>
      </header>
      {searching && (
        <div className="sidebar-search">
          <input
            autoFocus
            aria-label="搜索侧栏内容"
            placeholder="搜索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearching(false);
                setQuery("");
              }
            }}
          />
        </div>
      )}
      {outline.length >= 1000 && mode === "outline" && (
        <p className="hint">大型文档仅显示前 1000 个标题。</p>
      )}
      <div className="sidebar-content">
        {mode === "outline" ? (
          <div className="outline">
            {outline.some((heading) => matches(heading.text)) ? (
              outline.map(
                (heading, index) =>
                  matches(heading.text) && (
                    <button
                      key={index}
                      aria-current={selected === index ? "location" : undefined}
                      style={{ paddingLeft: 12 + heading.depth * 10 }}
                      onClick={() => {
                        setSelected(index);
                        onHeading(index);
                      }}
                    >
                      {heading.text}
                    </button>
                  ),
              )
            ) : (
              <p className="sidebar-empty">
                {query ? "未找到匹配内容" : "大纲内容为空"}
              </p>
            )}
          </div>
        ) : mode === "files" ? (
          <>
            <button className="folder-location-action" onClick={onFolder}>
              切换目录…
            </button>
            <FileTree
              key={files.find((entry) => entry.relative === ".")?.id}
              entries={files.filter(
                (entry) => entry.relative === "." || matches(entry.relative),
              )}
              onOpen={onOpen}
            />
          </>
        ) : (
          <div className="file-list">
            {recent
              .filter((entry) => matches(entry.name))
              .map((entry) => (
                <button key={entry.id} onClick={() => onOpen(entry)}>
                  {entry.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}
