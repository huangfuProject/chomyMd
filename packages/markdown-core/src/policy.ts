import { Marked } from "marked";
const parser = new Marked({ gfm: true });
export function unsupportedReason(markdown: string): string | null {
  if (markdown.length > 500000)
    return "大型文档使用源码模式以保持输入与滚动流畅。";
  const withoutCode = parser
    .lexer(markdown)
    .filter((token) => token.type !== "code")
    .map((token) => token.raw)
    .join("")
    .replace(/<br\s*\/?\s*>/gi, "");
  if (/^---\r?\n/.test(markdown))
    return "文档含 Front Matter，使用源码模式保留原始字段。";
  if (
    /<\/?[a-z!][^>]*>/i.test(withoutCode) ||
    /^:::/m.test(withoutCode) ||
    /\[\^[^\]]+\]/.test(withoutCode) ||
    /\$\$|\$[^$\n]+\$/.test(withoutCode)
  )
    return "文档含 HTML、公式或扩展语法，使用源码模式安全保留；可切换阅读预览。";
  if (/\[[^\]]+\]\((?:javascript|data|file|vbscript):/i.test(withoutCode))
    return "文档含不安全链接协议，使用源码模式；阅读预览会移除危险链接。";
  return null;
}
export function imageUrl(
  source: string,
  documentId: string,
  remote: boolean,
): string {
  if (/^https:\/\//i.test(source))
    return remote
      ? `chomy-asset://${documentId}/remote?url=${encodeURIComponent(source)}`
      : "";
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(source)) return "";
  const clean = source.replace(/^\.\//, "");
  if (clean.split("/").includes(".."))
    return `chomy-asset://${documentId}/reference?ref=${encodeURIComponent(source)}`;
  return `chomy-asset://${documentId}/${clean}`;
}
export function headings(markdown: string) {
  const result: { depth: number; text: string; offset: number }[] = [];
  let fence = "";
  let previous = { text: "", offset: 0 };
  for (const line of markdown.matchAll(/^.*$/gm)) {
    const value = line[0];
    const boundary = /^ {0,3}(`{3,}|~{3,})/.exec(value)?.[1];
    if (boundary) {
      if (!fence) fence = boundary;
      else if (
        boundary[0] === fence[0] &&
        boundary.length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(value)
      )
        fence = "";
      previous = { text: "", offset: 0 };
      continue;
    }
    if (fence) continue;
    const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(value);
    if (heading)
      result.push({
        depth: heading[1]?.length ?? 1,
        text: heading[2] ?? "",
        offset: line.index,
      });
    else if (previous.text.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(value))
      result.push({
        depth: value.trim()[0] === "=" ? 1 : 2,
        text: previous.text.trim(),
        offset: previous.offset,
      });
    previous = { text: value, offset: line.index };
    // Bound sidebar work independently of the editor's virtualized source document.
    if (result.length >= 1000) break;
  }
  return result;
}
