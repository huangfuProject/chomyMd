import { useState, useRef, useCallback } from "react";
import type { Bootstrap, DocumentSnapshot } from "@chomy/contracts";
import { SessionHistory } from "@chomy/editor-core";
export function useDocument(report: (message: string) => void) {
  const [resetVersion, setResetVersion] = useState(0);
  const [document, setDocument] = useState<DocumentSnapshot | null>(null);
  const current = useRef<DocumentSnapshot | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const history = useRef(new SessionHistory());
  const adopt = useCallback((value: DocumentSnapshot | null) => {
    if (!value) return;
    if (current.current && value.id !== current.current.id)
      setResetVersion((value) => value + 1);
    if (value.id !== current.current?.id)
      history.current = new SessionHistory();
    current.current = value;
    setDocument(value);
  }, []);
  const enqueue = (value: DocumentSnapshot) => {
    chain.current = chain.current
      .catch(() => undefined)
      .then(() =>
        window.chomy.update({
          id: value.id,
          markdown: value.markdown,
          revision: value.revision,
        }),
      )
      .then((result) => {
        if (
          current.current?.id === result.id &&
          current.current.revision === result.revision
        )
          adopt(result);
      })
      .catch((error) => {
        report(error instanceof Error ? error.message : "恢复快照更新失败。");
        throw error;
      });
    void chain.current.catch(() => undefined);
  };
  const change = (markdown: string, record = true) => {
    if (!record) setResetVersion((value) => value + 1);
    const previous = current.current;
    if (!previous || previous.markdown === markdown) return;
    if (record) history.current.record(previous.markdown, markdown);
    const next = {
      ...previous,
      markdown,
      revision: previous.revision + 1,
      dirty: true,
    };
    adopt(next);
    enqueue(next);
  };
  const undo = () => {
    const value = current.current;
    if (!value) return;
    const previous = history.current.undo(value.markdown);
    if (previous !== null) change(previous, false);
  };
  const redo = () => {
    const value = current.current;
    if (!value) return;
    const next = history.current.redo(value.markdown);
    if (next !== null) change(next, false);
  };
  const checkpoint = () => history.current.checkpoint();
  const flush = async () => {
    await chain.current;
    checkpoint();
  };
  const initialize = (value: Bootstrap) => adopt(value.document);
  return {
    document,
    resetVersion,
    checkpoint,
    current,
    adopt,
    change,
    undo,
    redo,
    flush,
    initialize,
  };
}
