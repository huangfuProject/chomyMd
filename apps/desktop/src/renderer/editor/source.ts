import { headings } from "@chomy/markdown-core";
import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  search,
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
} from "@codemirror/search";
import type { EditorAdapter, EditorSelection } from "@chomy/editor-core";
export class SourceAdapter implements EditorAdapter {
  private view: EditorView;
  private suppressed = false;
  private value: string;
  constructor(
    root: HTMLElement,
    content: string,
    change: (value: string) => void,
    private command: (value: string) => void,
  ) {
    this.value = content;
    this.view = new EditorView({
      parent: root,
      state: EditorState.create({
        doc: content,
        extensions: [
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          search({ top: true }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Markdown 源码" }),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-z",
                run: () => {
                  command("undo");
                  return true;
                },
              },
              {
                key: "Mod-Shift-z",
                run: () => {
                  command("redo");
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.suppressed) {
              this.value = update.state.doc.toString();
              change(this.value);
            }
            if (update.selectionSet && root.closest(".typewriter-mode")) {
              const coordinates = update.view.coordsAtPos(
                update.state.selection.main.head,
              );
              const container = root.closest<HTMLElement>(".document-scroll");
              if (coordinates && container)
                container.scrollTop +=
                  coordinates.top -
                  container.getBoundingClientRect().top -
                  container.clientHeight * 0.35;
            }
          }),
        ],
      }),
    });
  }
  isInTable() {
    return false;
  }
  isComposing() {
    return this.view.composing;
  }
  getMarkdown() {
    return this.value;
  }
  setMarkdown(markdown: string) {
    if (markdown === this.getMarkdown()) return;
    this.value = markdown;
    this.suppressed = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: markdown },
    });
    this.suppressed = false;
  }
  focus() {
    this.view.focus();
  }
  getSelection(): EditorSelection {
    const selection = this.view.state.selection.main;
    return {
      fraction: selection.head / Math.max(1, this.view.state.doc.length),
      text: this.view.state.doc
        .lineAt(selection.head)
        .text.replace(/^#+\s*/, ""),
    };
  }
  setSelection(selection: EditorSelection) {
    const doc = this.view.state.doc.toString();
    const match = selection.text ? doc.indexOf(selection.text) : -1;
    const position =
      match >= 0 ? match : Math.round(selection.fraction * doc.length);
    this.view.dispatch({
      selection: { anchor: Math.min(doc.length, position) },
      scrollIntoView: true,
    });
  }
  insertMarkdown(markdown: string) {
    const selection = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: markdown },
      selection: { anchor: selection.from + markdown.length },
      scrollIntoView: true,
    });
    this.focus();
  }
  format(command: string) {
    if (
      [
        "row",
        "column",
        "delete-row",
        "delete-column",
        "align-left",
        "align-center",
        "align-right",
      ].includes(command)
    ) {
      this.command("error:表格行列操作请切换到可视编辑模式。");
      return;
    }
    const selection = this.view.state.selection.main;
    const selected = this.view.state.sliceDoc(selection.from, selection.to);
    const delimiters: Record<string, string> = {
      bold: "**",
      italic: "*",
      code: "`",
    };
    if (command.startsWith("heading-") || command === "paragraph") {
      const start = this.view.state.doc.lineAt(selection.from);
      const end = this.view.state.doc.lineAt(selection.to);
      const prefix =
        command === "paragraph"
          ? ""
          : "#".repeat(Number(command.slice(8))) + " ";
      const insert = this.view.state
        .sliceDoc(start.from, end.to)
        .split("\n")
        .map((line) => prefix + line.replace(/^#{1,6}\s+/, ""))
        .join("\n");
      this.view.dispatch({
        changes: { from: start.from, to: end.to, insert },
        scrollIntoView: true,
      });
      this.focus();
      return;
    }
    const blocks: Record<string, string> = {
      "code-block": "\n```text\n代码\n```\n",
      quote: "> " + (selected || "引用"),
      bullet: "- " + (selected || "列表项"),
      ordered: "1. " + (selected || "列表项"),
      task: "- [ ] " + (selected || "待办事项"),
      rule: "\n---\n",
    };
    if (blocks[command]) {
      this.insertMarkdown(blocks[command]);
      return;
    }
    if (delimiters[command]) {
      const marker = delimiters[command];
      this.insertMarkdown(marker + (selected || "文字") + marker);
    } else if (command === "table")
      this.insertMarkdown(
        "\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n",
      );
  }
  find(query: string, backwards = false) {
    this.view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: query, literal: true, caseSensitive: true }),
      ),
    });
    return (backwards ? findPrevious : findNext)(this.view);
  }
  replace(query: string, replacement: string, all: boolean) {
    if (!query) return 0;
    const content = this.view.state.doc.toString();
    if (all) {
      const count = content.split(query).length - 1;
      this.suppressed = false;
      this.view.dispatch({
        changes: {
          from: 0,
          to: content.length,
          insert: content.split(query).join(replacement),
        },
      });
      return count;
    }
    const selection = this.view.state.selection.main;
    if (
      content.slice(selection.from, selection.to) !== query &&
      !this.find(query)
    )
      return 0;
    this.insertMarkdown(replacement);
    return 1;
  }
  jumpToHeading(index: number) {
    const heading = headings(this.view.state.doc.toString())[index];
    if (!heading) return;
    this.view.dispatch({
      selection: { anchor: heading.offset },
      scrollIntoView: true,
    });
    this.focus();
  }
  destroy() {
    this.view.destroy();
  }
}
