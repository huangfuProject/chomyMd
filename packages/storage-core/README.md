# Storage core

StorageProvider interface and provider-independent configuration/object URL rules. Credentials and vendor SDKs remain in the Electron main-process adapters.

```ts
import { validateCloud, objectUrl } from "@chomy/storage-core";
validateCloud(config);
const permanentUrl = objectUrl(config, "chomy/中文 image.png");
```

S3 and Aliyun providers implement test/upload; a local-copy pipeline runs before cloud upload. Failures never remove original or copied attachments. HTTP endpoints are permitted only on localhost for protocol tests. Public URLs must be permanent HTTPS bucket/CDN roots; private signed links are not persisted. Credentials use OS safeStorage; plaintext fallback is rejected.
