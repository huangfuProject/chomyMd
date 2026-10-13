import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { exitCodeBlockDown } from "../../apps/desktop/src/renderer/editor/exit-code-block";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    heading: { content: "text*", group: "block" },
    code_block: { content: "text*", group: "block", code: true },
    text: {},
  },
});
function stateAt(code: string, offset: number, next?: string) {
  const blocks = [
    schema.node("code_block", null, code ? schema.text(code) : undefined),
  ];
  if (next) blocks.push(schema.node(next, null, schema.text("following")));
  const doc = schema.node("doc", null, blocks);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1 + offset),
  });
}

describe("down arrow from a code fence", () => {
  it("creates a paragraph from any column on the last code line", () => {
    const before = stateAt("first\nlast", 7);
    let after = before;
    expect(
      exitCodeBlockDown(before, (tr) => {
        after = before.apply(tr);
      }),
    ).toBe(true);
    expect(after.doc.child(0).textContent).toBe("first\nlast");
    expect(after.doc.childCount).toBe(2);
    expect(after.selection.$from.parent.type.name).toBe("paragraph");
    expect(after.selection.$from.parentOffset).toBe(0);
  });
  it("reuses an existing following paragraph without changing its content", () => {
    const before = stateAt("code", 2, "paragraph");
    let after = before;
    exitCodeBlockDown(before, (tr) => {
      after = before.apply(tr);
    });
    expect(after.doc.eq(before.doc)).toBe(true);
    expect(after.selection.$from.parent.textContent).toBe("following");
    expect(after.selection.$from.parentOffset).toBe(0);
  });
  it("inserts before a following heading and leaves an empty code block", () => {
    const before = stateAt("", 0, "heading");
    let after = before;
    exitCodeBlockDown(before, (tr) => {
      after = before.apply(tr);
    });
    expect(after.doc.childCount).toBe(3);
    expect(after.doc.child(0).type.name).toBe("code_block");
    expect(after.doc.child(1).type.name).toBe("paragraph");
    expect(after.doc.child(2).textContent).toBe("following");
  });
  it("does not exit from an earlier line or a text selection", () => {
    let before = stateAt("first\nlast", 3);
    let dispatched = false;
    const dispatch = () => {
      dispatched = true;
    };
    expect(exitCodeBlockDown(before, dispatch)).toBe(false);
    before = before.apply(
      before.tr.setSelection(TextSelection.create(before.doc, 7, 9)),
    );
    expect(exitCodeBlockDown(before, dispatch)).toBe(false);
    expect(dispatched).toBe(false);
  });
});
