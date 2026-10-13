import { useMemo, useState } from "react";
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const render = (node: TreeNode, depth: number): React.ReactNode =>
    Array.from(node.children.values())
      .sort(
        (a, b) =>
          Number(Boolean(a.entry)) - Number(Boolean(b.entry)) ||
          a.name.localeCompare(b.name),
      )
      .map((child) =>
        child.entry ? (
          <button
            key={child.key}
            aria-current={selected === child.key ? "page" : undefined}
            title={child.key}
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
              aria-expanded={!collapsed.has(child.key)}
              onClick={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  if (next.has(child.key)) next.delete(child.key);
                  else next.add(child.key);
                  return next;
                })
              }
            >
              {collapsed.has(child.key) ? "▸" : "▾"} {child.name}
            </button>
            {!collapsed.has(child.key) && render(child, depth + 1)}
          </div>
        ),
      );
  return <div className="file-list">{render(tree, 0)}</div>;
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
}: {
  mode: "outline" | "files" | "recent";
  onMode: (value: "outline" | "files" | "recent") => void;
  outline: { depth: number; text: string }[];
  files: FileEntry[];
  recent: FileEntry[];
  onHeading: (index: number) => void;
  onOpen: (entry: FileEntry) => void;
  onFolder: () => void;
}) {
  const [selected, setSelected] = useState(-1);
  return (
    <aside className="sidebar">
      {outline.length >= 1000 && mode === "outline" && (
        <p className="hint">大型文档仅显示前 1000 个标题。</p>
      )}
      <nav>
        {(["outline", "files", "recent"] as const).map((tab) => (
          <button
            key={tab}
            aria-pressed={mode === tab}
            onClick={() => onMode(tab)}
          >
            {{ outline: "大纲", files: "文件", recent: "最近" }[tab]}
          </button>
        ))}
      </nav>
      {mode === "outline" ? (
        <div className="outline">
          {outline.length ? (
            outline.map((heading, index) => (
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
            ))
          ) : (
            <p className="hint">标题将显示在这里</p>
          )}
        </div>
      ) : mode === "files" ? (
        <>
          <button onClick={onFolder}>打开文件夹…</button>
          <FileTree entries={files} onOpen={onOpen} />
        </>
      ) : (
        <div className="file-list">
          {recent.map((entry) => (
            <button key={entry.id} onClick={() => onOpen(entry)}>
              {entry.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
