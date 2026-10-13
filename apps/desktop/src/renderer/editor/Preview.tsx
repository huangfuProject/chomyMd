import { useEffect, useRef, useState } from "react";
import { renderMarkdown, renderDiagrams } from "./render";
import "katex/dist/katex.min.css";
export function Preview({
  markdown,
  id,
  remote,
  onError,
}: {
  markdown: string;
  id: string;
  remote: boolean;
  onError: (message: string) => void;
}) {
  const [html, setHtml] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void renderMarkdown(markdown, id, remote).then((value) => {
      if (active) setHtml(value);
    });
    return () => {
      active = false;
    };
  }, [markdown, id, remote]);
  useEffect(() => {
    if (root.current) void renderDiagrams(root.current);
  }, [html]);
  return (
    <div
      className="reading-preview"
      ref={root}
      onClick={(event) => {
        const anchor = (event.target as Element).closest("a");
        if (anchor) {
          event.preventDefault();
          const href = anchor.getAttribute("href");
          if (href)
            void window.chomy
              .openLink(href)
              .catch((error) =>
                onError(
                  error instanceof Error ? error.message : "链接打开失败",
                ),
              );
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
