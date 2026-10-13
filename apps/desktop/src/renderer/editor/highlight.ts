import { highlighted } from "./code-languages";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
function decorations(doc: ProseNode, selection: number) {
  const result: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (
      node.type.name === "list_item" &&
      typeof node.attrs.checked === "boolean"
    ) {
      result.push(
        Decoration.widget(
          pos + 2,
          (view, getPos) => {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "task-checkbox";
            input.checked = Boolean(node.attrs.checked);
            input.setAttribute("aria-label", `切换待办：${node.textContent}`);
            input.contentEditable = "false";
            input.onmousedown = (event) => event.preventDefault();
            input.onchange = () => {
              const position = getPos();
              if (position === undefined) return;
              const itemPosition = position - 2;
              const current = view.state.doc.nodeAt(itemPosition);
              if (current?.type.name === "list_item")
                view.dispatch(
                  view.state.tr.setNodeMarkup(itemPosition, undefined, {
                    ...current.attrs,
                    checked: input.checked,
                  }),
                );
            };
            return input;
          },
          { key: `task-${pos}-${node.attrs.checked}`, stopEvent: () => true },
        ),
      );
    }
    if (node.isBlock && pos <= selection && pos + node.nodeSize >= selection)
      result.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "chomy-current-block",
        }),
      );
    if (node.type.name !== "code_block" || node.textContent.length > 50000)
      return;
    const container = document.createElement("div");
    container.innerHTML = highlighted(
      node.textContent,
      String(node.attrs.language ?? ""),
    );
    let offset = 0;
    const visit = (element: ChildNode, classes: string[]) => {
      if (element.nodeType === Node.TEXT_NODE) {
        const length = element.textContent?.length ?? 0;
        if (classes.length && length)
          result.push(
            Decoration.inline(pos + 1 + offset, pos + 1 + offset + length, {
              class: classes.join(" "),
            }),
          );
        offset += length;
        return;
      }
      const next =
        element instanceof HTMLElement
          ? [...classes, ...element.classList]
          : classes;
      for (const child of Array.from(element.childNodes)) visit(child, next);
    };
    for (const child of Array.from(container.childNodes)) visit(child, []);
  });
  return DecorationSet.create(doc, result);
}
export const presentationPlugin = $prose(
  () =>
    new Plugin({
      state: {
        init: (_config, state) => decorations(state.doc, state.selection.from),
        apply: (tr, previous) =>
          tr.docChanged || tr.selectionSet
            ? decorations(tr.doc, tr.selection.from)
            : previous,
      },
      props: {
        decorations(state) {
          return this.getState(state) as DecorationSet;
        },
      },
      view: (view) => ({
        update: () => {
          const root = view.dom.closest(".typewriter-mode");
          const container = view.dom.closest<HTMLElement>(".document-scroll");
          if (!root || !container) return;
          requestAnimationFrame(() => {
            try {
              const coordinates = view.coordsAtPos(view.state.selection.from);
              container.scrollTop +=
                coordinates.top -
                container.getBoundingClientRect().top -
                container.clientHeight * 0.35;
            } catch {
              /* Selection may disappear while switching editors. */
            }
          });
        },
      }),
    }),
);
