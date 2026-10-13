# Contracts

Platform-independent, versioned IPC schemas and public application API.

```ts
const info = await window.chomy.getApplicationInfo();
```

Main validates request and sender; preload validates the response. No generic IPC, paths, credentials or Electron objects cross this boundary. Only application metadata is exposed in Phase 1.
