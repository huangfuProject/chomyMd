import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

export function exitCodeBlockDown(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
): boolean {
  const { selection } = state;
  const { $from } = selection;
  if (
    !selection.empty ||
    $from.parent.type.name !== "code_block" ||
    $from.parent.textContent.slice($from.parentOffset).includes("\n")
  )
    return false;
  const after = $from.after();
  const next = state.doc.nodeAt(after);
  const transaction = state.tr;
  if (next?.type.name !== "paragraph") {
    const paragraph = state.schema.nodes.paragraph;
    const $after = state.doc.resolve(after);
    if (
      !paragraph ||
      !$after.parent.canReplaceWith($after.index(), $after.index(), paragraph)
    )
      return false;
    transaction.insert(after, paragraph.create());
  }
  dispatch(
    transaction
      .setSelection(TextSelection.create(transaction.doc, after + 1))
      .scrollIntoView(),
  );
  return true;
}
