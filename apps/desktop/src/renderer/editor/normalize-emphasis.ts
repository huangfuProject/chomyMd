import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

// DOM/IME commits can bypass character-at-a-time Markdown input rules.
export function normalizeTypedEmphasis(
  state: EditorState,
  parse: (markdown: string) => ProseNode | null,
  position = state.selection.from,
): Transaction | null {
  if (position < 0 || position > state.doc.content.size) return null;
  const $from = state.doc.resolve(position);
  const { empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code)
    return null;
  const base = Math.max(0, $from.parentOffset - 1000);
  const prefix = $from.parent.textBetween(
    base,
    $from.parentOffset,
    undefined,
    "\uFFFC",
  );
  const closing = /\*{1,3}$/.exec(prefix);
  if (!closing || prefix[prefix.length - closing[0].length - 1] === "*")
    return null;
  const delimiter = closing[0];
  let closingSlashes = 0;
  for (
    let i = prefix.length - delimiter.length - 1;
    i >= 0 && prefix[i] === "\\";
    i--
  )
    closingSlashes++;
  if (closingSlashes % 2) return null;
  const end = $from.pos;
  for (
    let offset = prefix.length - delimiter.length - 1;
    offset >= 0;
    offset--
  ) {
    if (
      (base > 0 && offset === 0) ||
      prefix[offset] !== "*" ||
      prefix[offset - 1] === "*"
    )
      continue;
    const run = /^\*+/.exec(prefix.slice(offset))?.[0];
    if (run !== delimiter) continue;
    let slashes = 0;
    for (let i = offset - 1; i >= 0 && prefix[i] === "\\"; i--) slashes++;
    if (slashes % 2) continue;
    const start = $from.start() + base + offset;
    let literal = true;
    state.doc.nodesBetween(start, end, (node) => {
      if (node.isInline && (!node.isText || node.marks.length)) literal = false;
    });
    if (!literal) continue;
    let parsed: ProseNode | null;
    try {
      parsed = parse(prefix.slice(offset));
    } catch {
      return null;
    }
    if (
      !parsed ||
      parsed.childCount !== 1 ||
      parsed.firstChild?.type.name !== "paragraph"
    )
      continue;
    const content = parsed.firstChild.content;
    let emphasis = content.size > 0;
    content.forEach((node) => {
      if (
        !node.isText ||
        !node.marks.some((mark) =>
          ["emphasis", "strong"].includes(mark.type.name),
        )
      )
        emphasis = false;
    });
    if (!emphasis) continue;
    return state.tr.replaceWith(start, end, content).setStoredMarks([]);
  }
  return null;
}
