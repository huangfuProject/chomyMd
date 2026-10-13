# Editor core

Platform-independent EditorAdapter, coarse selection snapshots and SessionHistory. Implementations live in the desktop renderer.

```ts
import type { EditorAdapter } from "@chomy/editor-core";
editor.insertMarkdown("**文字**");
const position = editor.getSelection();
editor.setSelection(position);
```

Adapters hide ProseMirror/CodeMirror. A single DocumentSession owns content and undo across modes. Normal local typing must not be echoed back as a controlled-editor replacement. External resets explicitly increment resetVersion. Composition blocks save/switch/close until the committed text is ready. Selection mapping uses matching block text then a coarse fraction; exact offsets are not promised.
