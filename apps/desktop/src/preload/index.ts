import { contextBridge, ipcRenderer, webUtils } from "electron";
import { z } from "zod";
import {
  applicationInfoSchema,
  bootstrapSchema,
  ChomyError,
  commandSchema,
  documentSchema,
  fileEntrySchema,
  IPC,
  preferencesSchema,
  replySchema,
  requestSchema,
  themeSchema,
  uploadStatusSchema,
  type AppRequest,
  type ChomyApi,
} from "@chomy/contracts";
async function invoke<T>(
  request: AppRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  const reply = replySchema.parse(
    await ipcRenderer.invoke(IPC.request, requestSchema.parse(request)),
  );
  if (!reply.ok) throw new ChomyError(reply.code, reply.message);
  return schema.parse(reply.value);
}
const doc = documentSchema.nullable();
const entries = z.array(fileEntrySchema);
const themes = z.array(themeSchema);
const asset = z.object({ id: z.string(), markdown: z.string() });
const api: ChomyApi = Object.freeze<ChomyApi>({
  copyText: (text) => invoke({ action: "copyText", text }, z.undefined()),
  openLink: (url) => invoke({ action: "openLink", url }, z.undefined()),
  async getApplicationInfo() {
    return applicationInfoSchema.parse(
      await ipcRenderer.invoke(IPC.applicationInfo, { apiVersion: 1 }),
    );
  },
  bootstrap: () => invoke({ action: "bootstrap" }, bootstrapSchema),
  update: (value) => invoke({ action: "update", ...value }, documentSchema),
  openPendingDocument: () => invoke({ action: "openPending" }, doc),
  newDocument: () => invoke({ action: "new" }, doc),
  openDocument: () => invoke({ action: "open" }, doc),
  openEntry: (id) => invoke({ action: "openEntry", id }, doc),
  openDroppedFile: (file) =>
    invoke({ action: "openDrop", path: webUtils.getPathForFile(file) }, doc),
  save: (as = false) => invoke({ action: as ? "saveAs" : "save" }, doc),
  reload: () => invoke({ action: "reload" }, doc),
  status: () => invoke({ action: "status" }, documentSchema),
  confirmClose: () => invoke({ action: "confirmClose" }, z.undefined()),
  openFolder: () => invoke({ action: "folder" }, entries),
  currentFolder: () => invoke({ action: "currentFolder" }, entries),
  recent: () => invoke({ action: "recent" }, entries),
  restore: (id) => invoke({ action: "restore", id }, doc),
  discardRecovery: (id) =>
    invoke({ action: "discardRecovery", id }, z.undefined()),
  setPreferences: (value) =>
    invoke({ action: "preferences", value }, preferencesSchema),
  installTheme: (zip = false) =>
    invoke({ action: "installTheme", zip }, themes),
  importThemeCss: () =>
    invoke(
      { action: "importThemeCss" },
      z.object({ themes, omitted: z.number().int().nonnegative() }).strict(),
    ),
  removeTheme: (id) => invoke({ action: "removeTheme", id }, themes),
  themeCss: (id) => invoke({ action: "themeCss", id }, z.string()),
  insertDroppedAsset: (file) =>
    invoke({ action: "assetDrop", path: webUtils.getPathForFile(file) }, asset),
  retryAsset: () => invoke({ action: "retryAsset" }, asset),
  insertAsset: () => invoke({ action: "asset" }, asset.nullable()),
  pasteImage: (value, bytes, mime) =>
    invoke({ action: "pasteImage", ...value, bytes, mime }, asset),
  saveCloud: (config, accessKey, secret) =>
    invoke({ action: "cloudSave", config, accessKey, secret }, z.undefined()),
  uploadStatus: () => invoke({ action: "uploadStatus" }, uploadStatusSchema),
  testCloud: () => invoke({ action: "cloudTest" }, z.string()),
  cancelUpload: () => invoke({ action: "cloudCancel" }, z.undefined()),
  exportDocument: (format, html) =>
    invoke({ action: "export", format, html }, z.string().nullable()),
  onCommand: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const command = commandSchema.safeParse(value);
      if (command.success) listener(command.data);
    };
    ipcRenderer.on(IPC.command, handler);
    return () => ipcRenderer.removeListener(IPC.command, handler);
  },
});
contextBridge.exposeInMainWorld("chomy", api);
