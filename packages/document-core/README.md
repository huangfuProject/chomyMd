# Document core

Node-only byte encoding, digest and atomic persistence utilities. Electron belongs to application services, never this package.

```ts
import {
  atomicWrite,
  decodeDocument,
  encodeDocument,
} from "@chomy/document-core";
const { text, encoding } = decodeDocument(bytes);
await atomicWrite(approvedPath, encodeDocument(text, encoding));
```

The caller owns path grants, external-change checks and session serialization. Atomic writing preserves destination permissions, syncs a same-directory exclusive temporary file, replaces by rename and cleans up failed writes. Recovery snapshots are separate application-owned files. Opening alone never calls a serializer or writes user documents.
