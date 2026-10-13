# Markdown core

Source preservation policy, outline tokens and restricted image URL mapping.

```ts
import { unsupportedReason, headings } from "@chomy/markdown-core";
const reason = unsupportedReason(markdown);
// Non-null: preserve source and offer sanitized reading preview.
const outline = headings(markdown);
```

Front Matter, directives, footnotes, formulas, untrusted HTML and large documents use source mode. Built-in empty-paragraph br placeholders remain supported. This package does not claim lossless arbitrary Markdown serialization. Actual untouched saves use original bytes; renderer rendering is separately sanitized.
