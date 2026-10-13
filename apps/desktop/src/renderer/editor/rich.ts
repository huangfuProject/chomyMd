import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
  parserCtx,
} from "@milkdown/kit/core";
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  gfm,
  insertTableCommand,
  addRowAfterCommand,
  addColAfterCommand,
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { callCommand, insert, replaceAll } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
} from "@milkdown/kit/prose/tables";
import DOMPurify from "dompurify";
import { textRanges } from "./textRanges";
import { selectionToolsPlugin } from "./selectionTools";
import { presentationPlugin } from "./highlight";
import type { EditorAdapter, EditorSelection } from "@chomy/editor-core";
import { imageUrl } from "@chomy/markdown-core";
export class RichAdapter implements EditorAdapter {
  private editor: Editor;
  private value: string;
  private suppressed = false;
  private destroyed = false;
  private constructor(editor: Editor, value: string) {
    this.editor = editor;
    this.value = value;
  }
  static async create(
    root: HTMLElement,
    content: string,
    id: string,
    remote: boolean,
    change: (value: string) => void,
    command: (value: string) => void,
  ) {
    const holder: { adapter?: RichAdapter } = {};
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.update(editorViewOptionsCtx, (options) => ({
          ...options,
          attributes: { "aria-label": "Markdown 编辑器", spellcheck: "true" },
          dispatchTransaction: (tr) => {
            const view = ctx.get(editorViewCtx);
            if (holder.adapter?.destroyed || !view.state) return;
            view.updateState(view.state.applyTransaction(tr).state);
            if (
              holder.adapter &&
              !holder.adapter.suppressed &&
              tr.docChanged &&
              !view.composing
            ) {
              holder.adapter.value = ctx.get(serializerCtx)(view.state.doc);
              change(holder.adapter.value);
            }
          },
          transformPastedHTML: (html) =>
            DOMPurify.sanitize(html, { FORBID_ATTR: ["style", "srcset"] }),
          handleKeyDown: (_view, event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === "z"
            ) {
              event.preventDefault();
              command(event.shiftKey ? "redo" : "undo");
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            click: (view, event) => {
              const cell = (event.target as Element).closest("td, th");
              if (cell && view.dom.contains(cell)) {
                const start = view.posAtDOM(cell, 0);
                const end =
                  start + (view.state.doc.nodeAt(start - 1)?.content.size ?? 0);
                if (
                  view.state.selection.from < start ||
                  view.state.selection.from > end
                ) {
                  view.dispatch(
                    view.state.tr.setSelection(
                      TextSelection.near(view.state.doc.resolve(start)),
                    ),
                  );
                }
              }
              const link = (event.target as Element).closest("a");
              if (link) {
                event.preventDefault();
                if (
                  (event as MouseEvent).metaKey ||
                  (event as MouseEvent).ctrlKey
                ) {
                  const href = link.getAttribute("href") ?? "";
                  void window.chomy
                    .openLink(href)
                    .catch((error) =>
                      command(
                        "error:" +
                          (error instanceof Error
                            ? error.message
                            : "链接打开失败"),
                      ),
                    );
                }
                return true;
              }
              return false;
            },
            compositionend: () => {
              setTimeout(() => {
                if (holder.adapter) holder.adapter.emit(change);
              }, 0);
              return false;
            },
          },
          nodeViews: {
            code_block: (node, view, getPos) => {
              const wrapper = document.createElement("div");
              wrapper.className = "code-block";
              const tools = document.createElement("div");
              tools.className = "code-tools";
              tools.contentEditable = "false";
              const select = document.createElement("select");
              select.setAttribute("aria-label", "代码语言");
              for (const language of [
                "",
                "javascript",
                "typescript",
                "python",
                "json",
                "bash",
                "markdown",
                "mermaid",
              ]) {
                const option = document.createElement("option");
                option.value = language;
                option.textContent = language || "纯文本";
                select.append(option);
              }
              select.value = String(node.attrs.language ?? "");
              select.onchange = () => {
                const position = getPos();
                if (position !== undefined)
                  view.dispatch(
                    view.state.tr.setNodeMarkup(position, undefined, {
                      ...node.attrs,
                      language: select.value,
                    }),
                  );
              };
              const copy = document.createElement("button");
              copy.textContent = "复制代码";
              copy.onclick = () => {
                const position = getPos();
                const text =
                  position !== undefined
                    ? view.state.doc.nodeAt(position)?.textContent
                    : undefined;
                if (text === undefined) {
                  copy.textContent = "复制失败";
                  return;
                }
                void window.chomy.copyText(text).catch(() => {
                  copy.textContent = "复制失败";
                });
              };
              tools.append(select, copy);
              const pre = document.createElement("pre");
              const code = document.createElement("code");
              pre.append(code);
              wrapper.append(tools, pre);
              return { dom: wrapper, contentDOM: code };
            },
            image: (node) => {
              const img = document.createElement("img");
              img.alt = String(node.attrs.alt ?? "");
              img.src = imageUrl(String(node.attrs.src ?? ""), id, remote);
              img.loading = "lazy";
              return { dom: img };
            },
          },
        }));
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(presentationPlugin)
      .use(selectionToolsPlugin(command));
    holder.adapter = new RichAdapter(editor, content);
    await editor.create();
    return holder.adapter;
  }
  private emit(change: (value: string) => void) {
    const value = this.editor.action((ctx) =>
      ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc),
    );
    if (value !== this.value) {
      this.value = value;
      change(value);
    }
  }
  isInTable() {
    if (this.destroyed) return false;
    const position = this.editor.ctx.get(editorViewCtx).state.selection.$from;
    for (let depth = position.depth; depth > 0; depth--)
      if (position.node(depth).type.name === "table") return true;
    return false;
  }
  isComposing() {
    return this.editor.action((ctx) => ctx.get(editorViewCtx).composing);
  }
  getMarkdown() {
    return this.value;
  }
  setMarkdown(markdown: string) {
    if (markdown === this.value) return;
    this.suppressed = true;
    this.value = markdown;
    this.editor.action(replaceAll(markdown));
    this.suppressed = false;
  }
  focus() {
    this.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  }
  getSelection(): EditorSelection {
    return this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return {
        fraction:
          view.state.selection.from / Math.max(1, view.state.doc.content.size),
        text: view.state.selection.$from.parent.textContent,
      };
    });
  }
  setSelection(selection: EditorSelection) {
    this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let match = -1;
      view.state.doc.descendants((node, pos) => {
        if (
          match < 0 &&
          node.isTextblock &&
          node.textContent === selection.text
        )
          match = pos + 1;
      });
      const position = Math.min(
        view.state.doc.content.size,
        Math.max(
          1,
          match >= 0
            ? match
            : Math.round(selection.fraction * view.state.doc.content.size),
        ),
      );
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.near(view.state.doc.resolve(position)))
          .scrollIntoView(),
      );
    });
  }
  insertMarkdown(markdown: string) {
    this.editor.action(insert(markdown));
    this.focus();
  }
  format(command: string) {
    if (command.startsWith("heading-")) {
      this.editor.action(
        callCommand(wrapInHeadingCommand.key, Number(command.slice(8))),
      );
      this.focus();
      return;
    }
    const blocks = {
      paragraph: turnIntoTextCommand,
      bullet: wrapInBulletListCommand,
      ordered: wrapInOrderedListCommand,
      quote: wrapInBlockquoteCommand,
    };
    if (command in blocks) {
      this.editor.action(
        callCommand(blocks[command as keyof typeof blocks].key),
      );
      this.focus();
      return;
    }
    if (command === "code-block" || command === "task" || command === "rule") {
      this.insertMarkdown(
        command === "code-block"
          ? "\n```text\n代码\n```\n"
          : command === "task"
            ? "\n- [ ] 待办事项\n"
            : "\n---\n",
      );
      return;
    }
    if (command === "bold")
      this.editor.action(callCommand(toggleStrongCommand.key));
    else if (command === "italic")
      this.editor.action(callCommand(toggleEmphasisCommand.key));
    else if (command === "code")
      this.editor.action(callCommand(toggleInlineCodeCommand.key));
    else if (command === "table")
      this.editor.action(
        callCommand(insertTableCommand.key, { row: 3, col: 2 }),
      );
    else if (["align-left", "align-center", "align-right"].includes(command))
      this.editor.action(
        callCommand(
          setAlignCommand.key,
          command.slice(6) as "left" | "center" | "right",
        ),
      );
    else if (command === "row")
      this.editor.action(callCommand(addRowAfterCommand.key));
    else if (command === "column")
      this.editor.action(callCommand(addColAfterCommand.key));
    else if (command === "delete-row" || command === "delete-column")
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        (command === "delete-row" ? deleteRow : deleteColumn)(
          view.state,
          view.dispatch,
        );
      });
    else if (command === "add-row" || command === "add-column")
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        (command === "add-row" ? addRowAfter : addColumnAfter)(
          view.state,
          view.dispatch,
        );
      });
    this.focus();
  }
  find(query: string, backwards = false) {
    if (!query) return false;
    return this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const matches = textRanges(view.state.doc, query);
      const selection = view.state.selection;
      const match = backwards
        ? (matches.filter((value) => value.to <= selection.from).at(-1) ??
          matches.at(-1))
        : (matches.find((value) => value.from >= selection.to) ?? matches[0]);
      if (!match) return false;
      view.dispatch(
        view.state.tr
          .setSelection(
            TextSelection.create(view.state.doc, match.from, match.to),
          )
          .scrollIntoView(),
      );
      this.focus();
      return true;
    });
  }
  replace(query: string, replacement: string, all: boolean) {
    if (!query) return 0;
    return this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!all) {
        if (
          view.state.doc.textBetween(
            view.state.selection.from,
            view.state.selection.to,
          ) !== query &&
          !this.find(query)
        )
          return 0;
        view.dispatch(
          view.state.tr.insertText(
            replacement,
            view.state.selection.from,
            view.state.selection.to,
          ),
        );
        return 1;
      }
      const changes = textRanges(view.state.doc, query);
      let tr = view.state.tr;
      for (const value of changes.reverse())
        tr = tr.insertText(replacement, value.from, value.to);
      view.dispatch(tr);
      return changes.length;
    });
  }
  jumpToHeading(index: number) {
    this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let count = 0;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && count++ === index)
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)))
              .scrollIntoView(),
          );
      });
    });
    this.focus();
  }
  semanticRoundtrip(markdown: string) {
    return this.editor.action((ctx) => {
      const parser = ctx.get(parserCtx);
      const serializer = ctx.get(serializerCtx);
      const parsed = parser(markdown);
      return parsed ? (parser(serializer(parsed))?.eq(parsed) ?? false) : false;
    });
  }
  destroy() {
    this.destroyed = true;
    void this.editor.destroy();
  }
}
