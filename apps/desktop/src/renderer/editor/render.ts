import { Marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import { highlighted } from "./highlight";
import { imageUrl } from "@chomy/markdown-core";
function formula(text: string, displayMode: boolean) {
  return katex.renderToString(text, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: "warn",
    output: "html",
  });
}
const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: "chomyBlockMath",
      level: "block",
      start: (source) => source.indexOf("$$"),
      tokenizer(source) {
        const match = /^\$\$([\s\S]+?)\$\$(?:[ \t]*(?:\n|$))/.exec(source);
        if (match)
          return { type: "chomyBlockMath", raw: match[0], text: match[1] };
      },
      renderer: (token) =>
        `<div class="math-block">${formula(String(token.text), true)}</div>`,
    },
    {
      name: "chomyInlineMath",
      level: "inline",
      start: (source) => source.indexOf("$"),
      tokenizer(source) {
        const match = /^\$(?!\$)([^$\n]+?)\$(?!\$)/.exec(source);
        if (match)
          return { type: "chomyInlineMath", raw: match[0], text: match[1] };
      },
      renderer: (token) => formula(String(token.text), false),
    },
  ],
});
export async function renderMarkdown(
  markdown: string,
  id: string,
  remote: boolean,
) {
  const html = await marked.parse(markdown);
  const element = document.createElement("div");
  element.innerHTML = DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "semantics", "annotation"],
    FORBID_TAGS: [
      "style",
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
    ],
    FORBID_ATTR: ["srcset"],
  });
  for (const img of element.querySelectorAll("img")) {
    const source = img.getAttribute("src") ?? "";
    const resolved = imageUrl(source, id, remote);
    if (resolved) img.src = resolved;
    else {
      img.removeAttribute("src");
      img.alt = img.alt + "（图片未加载）";
    }
    img.loading = "lazy";
  }
  for (const code of element.querySelectorAll("pre code")) {
    const language =
      Array.from(code.classList)
        .find((value) => value.startsWith("language-"))
        ?.slice(9) ?? "";
    if (language !== "mermaid")
      code.innerHTML = highlighted(code.textContent ?? "", language);
  }
  for (const anchor of element.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!/^(?:https?:|mailto:|#|\.?\.?\/)/i.test(href))
      anchor.removeAttribute("href");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  return element.innerHTML;
}
export async function renderDiagrams(root: HTMLElement) {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("pre code.language-mermaid"),
  );
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    maxTextSize: 50000,
    maxEdges: 500,
    fontFamily: "system-ui",
    flowchart: { htmlLabels: false },
  });
  for (const block of blocks) {
    try {
      const text = block.textContent ?? "";
      if (/%%\{/.test(text)) throw new Error("DOCUMENT_CONFIG_NOT_ALLOWED");
      const result = await mermaid.render(
        "chomy-diagram-" + crypto.randomUUID().replaceAll("-", ""),
        text,
      );
      const wrapper = document.createElement("div");
      wrapper.className = "diagram";
      wrapper.innerHTML = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      block.parentElement?.replaceWith(wrapper);
    } catch {
      const error = document.createElement("p");
      error.textContent = "图表无法渲染，原始代码已保留。";
      block.parentElement?.append(error);
    }
  }
}
