import { describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { normalizeTypedEmphasis } from "../../apps/desktop/src/renderer/editor/normalize-emphasis";
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    code_block: { content: "text*", group: "block", code: true },
    text: {},
  },
  marks: { emphasis: {}, code: { code: true } },
});
function state(
  text: string,
  type = "paragraph",
  code = false,
  offset = text.length,
) {
  const doc = schema.node("doc", null, [
    schema.node(
      type,
      null,
      schema.text(text, code ? [schema.mark("code")] : []),
    ),
  ]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, offset + 1),
  });
}
describe("committed emphasis normalization", () => {
  it("replaces only the candidate, preserving surrounding text and caret", () => {
    const before = state(
      "prefix *你好* suffix",
      "paragraph",
      false,
      "prefix *你好*".length,
    );
    const parse = vi.fn(() =>
      schema.node("doc", null, [
        schema.node(
          "paragraph",
          null,
          schema.text("你好", [schema.mark("emphasis")]),
        ),
      ]),
    );
    const tr = normalizeTypedEmphasis(before, parse);
    expect(parse).toHaveBeenCalledWith("*你好*");
    expect(tr).not.toBeNull();
    const after = before.apply(tr!);
    expect(after.doc.textContent).toBe("prefix 你好 suffix");
    expect(after.selection.$from.parentOffset).toBe("prefix 你好".length);
  });
  it("does not interpret code, escaped delimiters, or partial bold delimiters", () => {
    const parse = vi.fn(() => null);
    for (const before of [
      state("*你好*", "code_block"),
      state("*你好*", "paragraph", true),
      state("\\*你好\\*"),
      state("**你好*"),
    ])
      expect(normalizeTypedEmphasis(before, parse)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });
  it("rejects a nonempty selection and plain parser output", () => {
    let before = state("*你好*");
    before = before.apply(
      before.tr.setSelection(TextSelection.create(before.doc, 1, 3)),
    );
    const parse = vi.fn(() =>
      schema.node(
        "doc",
        null,
        schema.node("paragraph", null, schema.text("*你好*")),
      ),
    );
    expect(normalizeTypedEmphasis(before, parse)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    expect(normalizeTypedEmphasis(state("*你好*"), parse)).toBeNull();
  });
  it("preserves the original document if parsing fails", () => {
    const before = state("*你好*");
    expect(
      normalizeTypedEmphasis(before, () => {
        throw Error("Unsupported syntax");
      }),
    ).toBeNull();
    expect(before.doc.textContent).toBe("*你好*");
  });
});
