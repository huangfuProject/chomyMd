import type { Node as ProseNode } from "@milkdown/kit/prose/model";
export function textRanges(document: ProseNode, query: string) {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  document.descendants((block, blockPosition) => {
    if (!block.isTextblock) return;
    let text = "";
    const positions: number[] = [];
    block.descendants((node, offset) => {
      if (node.isText && node.text) {
        for (let index = 0; index < node.text.length; index++) {
          text += node.text[index];
          positions.push(blockPosition + 1 + offset + index);
        }
      } else if (node.isInline && node.isLeaf) {
        text += "\ufffc";
        positions.push(blockPosition + 1 + offset);
      }
    });
    let index = text.indexOf(query);
    while (index >= 0) {
      const from = positions[index];
      const end = positions[index + query.length - 1];
      if (from !== undefined && end !== undefined)
        matches.push({ from, to: end + 1 });
      index = text.indexOf(query, index + query.length);
    }
  });
  return matches;
}
