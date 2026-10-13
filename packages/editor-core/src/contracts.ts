export interface EditorSelection {
  fraction: number;
  text: string;
}
export interface EditorAdapter {
  isComposing(): boolean;
  isInTable(): boolean;
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  focus(): void;
  getSelection(): EditorSelection;
  setSelection(selection: EditorSelection): void;
  insertMarkdown(markdown: string): void;
  format(command: string): void;
  find(query: string, backwards?: boolean): boolean;
  replace(query: string, replacement: string, all: boolean): number;
  jumpToHeading(index: number): void;
  destroy(): void;
}
export class SessionHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private last = 0;
  checkpoint() {
    this.last = 0;
  }
  record(before: string, after: string) {
    if (before === after) return;
    const now = Date.now();
    if (now - this.last > 500 || this.undoStack.length === 0)
      this.undoStack.push(before);
    this.last = now;
    this.redoStack = [];
    if (this.undoStack.length > 50) this.undoStack.shift();
  }
  undo(current: string) {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(current);
    this.last = 0;
    return previous;
  }
  redo(current: string) {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    this.last = 0;
    return next;
  }
}
