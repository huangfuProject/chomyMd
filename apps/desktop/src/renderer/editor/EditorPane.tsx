import { useEffect, useRef } from "react";
import type { EditorAdapter, EditorSelection } from "@chomy/editor-core";
import { RichAdapter } from "./rich";
import { SourceAdapter } from "./source";
import type { DocumentSnapshot } from "@chomy/contracts";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
export function EditorPane({
  document,
  source,
  remote,
  resetVersion,
  onChange,
  onCommand,
  onReady,
  onError,
}: {
  document: DocumentSnapshot;
  source: boolean;
  remote: boolean;
  resetVersion: number;
  onChange: (markdown: string, id: string) => void;
  onCommand: (command: string) => void;
  onReady: (editor: EditorAdapter | null, id: string) => void;
  onError: (message: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const active = useRef<EditorAdapter | null>(null);
  const selection = useRef<EditorSelection>({ fraction: 0, text: "" });
  const callbacks = useRef({ onChange, onCommand, onReady, onError });
  callbacks.current = { onChange, onCommand, onReady, onError };
  const value = useRef(document.markdown);
  value.current = document.markdown;
  useEffect(() => {
    let disposed = false;
    let instance: EditorAdapter | null = null;
    const mount = async () => {
      if (!root.current) return;
      try {
        instance = source
          ? new SourceAdapter(
              root.current,
              value.current,
              (value) => callbacks.current.onChange(value, document.id),
              (command) => callbacks.current.onCommand(command),
            )
          : await RichAdapter.create(
              root.current,
              value.current,
              document.id,
              remote,
              (value) => callbacks.current.onChange(value, document.id),
              (command) => callbacks.current.onCommand(command),
            );
        if (disposed) {
          instance.destroy();
          return;
        }
        active.current = instance;
        instance.setSelection(selection.current);
        callbacks.current.onReady(instance, document.id);
      } catch {
        callbacks.current.onError(
          "可视编辑器初始化失败，请切换源码模式；原文已保留。",
        );
      }
    };
    void mount();
    return () => {
      disposed = true;
      if (instance) {
        selection.current = instance.getSelection();
        instance.destroy();
      }
      active.current = null;
      callbacks.current.onReady(null, document.id);
    };
  }, [document.id, source, remote]);
  useEffect(() => {
    active.current?.setMarkdown(document.markdown);
  }, [resetVersion]);
  return (
    <div ref={root} className={source ? "source-editor" : "rich-editor"} />
  );
}
