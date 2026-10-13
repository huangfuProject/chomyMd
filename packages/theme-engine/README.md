# Theme engine

Declarative CSS validation and scope transformation. No JavaScript or Node execution exists in themes.

```ts
import { scopeTheme } from "@chomy/theme-engine";
const css = scopeTheme("h1 { color: navy; }");
// .chomy-document h1{color:navy}
```

128 KB limit; external URLs, imports, fonts downloaded by CSS, image-set, expression, fixed overlays and z-index are rejected. Selectors are confined to the document. Native manifests use schemaVersion 1 and engine >=1.0.0 (the theme protocol version, separate from the application version). ZIP imports enforce compressed/uncompressed/file bounds, path/symlink checks, supported methods and CRC. Third-party image/font assets are not yet supported.

`importTyporaCss(source)` now provides a limited migration of #write and common public code/task selectors, returning `{stylesheet, omitted}`. Unknown private selectors are removed and counted. External resources remain blocked. It does not guarantee arbitrary Typora theme compatibility.

Native themes may include a description and a bounded static preview.png (512 KiB; 1600×1200; 2 million pixels). Preview images are served separately and cannot be referenced by CSS. See [the complete Paper example](examples/paper) and [the developer handbook](../../docs/developer-handbook.md) for authoring, installation and extension.
