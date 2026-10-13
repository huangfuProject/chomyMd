import * as css from "css-tree";
import { ChomyError } from "@chomy/contracts";
export function scopeTheme(source: string): string {
  if (source.length > 128 * 1024)
    throw new ChomyError("THEME_SIZE", "主题 CSS 不能超过 128 KB。");
  let ast: css.CssNode;
  try {
    ast = css.parse(source);
  } catch {
    throw new ChomyError("THEME_CSS", "主题 CSS 格式无效。");
  }
  css.walk(ast, (node) => {
    if (node.type === "Atrule" && !["media", "supports"].includes(node.name))
      throw new ChomyError(
        "THEME_EXTERNAL",
        "主题不能包含导入、字体下载或其他 at-rule。",
      );
    if (
      node.type === "Url" ||
      (node.type === "Function" &&
        [
          "url",
          "expression",
          "image",
          "image-set",
          "-webkit-image-set",
          "paint",
        ].includes(css.ident.decode(node.name).toLowerCase()))
    )
      throw new ChomyError("THEME_EXTERNAL", "主题不能加载外部资源。");
    if (node.type === "Declaration") {
      const property = css.ident.decode(node.property).toLowerCase();
      const value =
        node.value.type === "Value" &&
        node.value.children.first?.type === "Identifier"
          ? css.ident.decode(node.value.children.first.name).toLowerCase()
          : "";
      if (
        property === "z-index" ||
        (property === "position" &&
          ![
            "static",
            "relative",
            "absolute",
            "sticky",
            "initial",
            "unset",
            "revert",
          ].includes(value))
      )
        throw new ChomyError("THEME_OVERLAY", "主题不能覆盖应用安全提示。");
    }
    if (node.type === "Rule" && node.prelude?.type === "SelectorList")
      node.prelude.children.forEach((selector) => {
        if (selector.type !== "Selector") return;
        const value = css
          .generate(selector)
          .replace(/^:root\b/, ".chomy-document");
        const anchored = /^\.chomy-document(?=[\s.:#[>+~]|$)/.test(value);
        let firstCombinator = "";
        selector.children.forEach((child) => {
          if (!firstCombinator && child.type === "Combinator")
            firstCombinator = child.name;
        });
        if (anchored && ["+", "~"].includes(firstCombinator))
          throw new ChomyError(
            "THEME_SCOPE",
            "主题不能通过根元素兄弟选择器影响文档之外的界面。",
          );
        const scoped = anchored ? value : `.chomy-document ${value}`;
        const parsed = css.parse(scoped, { context: "selector" });
        if (parsed.type === "Selector") selector.children = parsed.children;
      });
  });
  return css.generate(ast);
}

/** Convert a small documented subset; private Typora DOM selectors are not supported. */
export function importTyporaCss(source: string) {
  const ast = css.parse(source);
  let omitted = 0;
  css.walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      if (node.prelude?.type !== "SelectorList") return;
      const converted: string[] = [];
      node.prelude.children.forEach((selector) => {
        const value = css
          .generate(selector)
          .replace(/#write\b/g, ".chomy-document")
          .replace(/\.md-fences\b/g, "pre")
          .replace(/\.md-inline-code\b/g, "code")
          .replace(/\.md-task-list-item\b/g, "li")
          .replace(/^(?:html|body)(?=\s|$)/, ".chomy-document");
        if (/(?:#[\w-]+|\.(?!chomy-document\b)[\w-]+)/.test(value)) {
          omitted++;
          return;
        }
        converted.push(value);
      });
      if (!converted.length && item && list) {
        list.remove(item);
        return;
      }
      const prelude = css.parse(converted.join(","), {
        context: "selectorList",
      });
      if (prelude.type === "SelectorList") node.prelude = prelude;
    },
  });
  const stylesheet = css.generate(ast);
  scopeTheme(stylesheet);
  return { stylesheet, omitted };
}
