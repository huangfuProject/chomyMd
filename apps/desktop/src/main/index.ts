import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  net,
  protocol,
  session,
  powerMonitor,
  clipboard,
  shell,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import squirrelStartup from "electron-squirrel-startup";
import { pathToFileURL } from "node:url";
import {
  applicationInfoRequestSchema,
  applicationInfoSchema,
  requestSchema,
  ChomyError,
  IPC,
  type AppRequest,
  type AppCommand,
} from "@chomy/contracts";
import { APP_URL, isTrustedSender, resolveAppResource } from "./security";
import { Documents } from "./documents";
import { PreferencesService } from "./preferences";
import { CloudService } from "./cloud";
import { Assets } from "./assets";
import { RemoteImages } from "./remote-images";
const remoteImages = new RemoteImages((input, init) => net.fetch(input, init));
import { installMenu } from "./menu";
import { atomicWrite } from "@chomy/document-core";
protocol.registerSchemesAsPrivileged(
  ["chomy", "chomy-asset", "chomy-theme"].map((scheme) => ({
    scheme,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  })),
);
app.setName("Chomy");
// Tests may isolate userData through a dedicated environment variable; production uses Electron's normal path.
if (process.env.CHOMY_TEST_DATA)
  app.setPath("userData", process.env.CHOMY_TEST_DATA);
let pendingFile: string | null =
  process.argv.find((argument) => /\.(md|markdown|txt)$/i.test(argument)) ??
  null;
app.on("open-file", (event, filename) => {
  event.preventDefault();
  pendingFile = filename;
  if (mainWindow) send("open-pending");
});
const ownsInstance = app.requestSingleInstanceLock();
app.on("second-instance", (_event, argv) => {
  pendingFile =
    argv.find((argument) => /\.(md|markdown|txt)$/i.test(argument)) ?? null;
  mainWindow?.show();
  mainWindow?.focus();
  if (pendingFile) send("open-pending");
});
let mainWindow: BrowserWindow | null = null;
let browsedDirectory: string | null = null;
let canClose = false;
let quitting = false;
let documents: Documents;
let preferences: PreferencesService;
let cloud: CloudService;
let assets: Assets;
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' chomy-asset: chomy-theme: data:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
function send(command: AppCommand) {
  mainWindow?.webContents.send(IPC.command, command);
}
async function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 700,
    minHeight: 480,
    title: "Chomy",
    icon: path.join(__dirname, "../assets/icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 12, y: 10 } }
      : {}),
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow = window;
  canClose = false;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.on("close", (event) => {
    if (!canClose) {
      event.preventDefault();
      send("close-request");
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  await window.loadURL(APP_URL);
  window.show();
}
function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    !isTrustedSender(
      event.sender.id,
      mainWindow.webContents.id,
      event.senderFrame?.url ?? "",
      event.senderFrame === event.sender.mainFrame,
    )
  )
    throw new ChomyError("IPC_UNTRUSTED_SENDER", "请求来源无效。");
}
async function chooseSave(as = false) {
  const current = documents.snapshot;
  if (!as && documents.filePath) return documents.save();
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "保存 Markdown",
    defaultPath: documents.filePath ?? current.name + ".md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const saved = await documents.save(result.filePath);
  await preferences.remember(result.filePath);
  return saved;
}
async function mayReplace() {
  if (!documents.snapshot.dirty) return true;
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    message: "是否保存当前文档的修改？",
    detail: "取消可以继续编辑；不保存会保留恢复副本，原文件不变。",
    buttons: ["保存", "不保存", "取消"],
    defaultId: 0,
    cancelId: 2,
  });
  if (result.response === 2) return false;
  if (result.response === 0) return Boolean(await chooseSave());
  await documents.persistRecovery();
  return true;
}
async function opened(filename: string) {
  const result = await documents.open(filename);
  await preferences.remember(filename);
  return result;
}
async function portableHtml(html: string) {
  for (const match of Array.from(
    html.matchAll(/src=(["'])(chomy-asset:[^"']+)\1/g),
  )) {
    const assetUrl = new URL((match[2] ?? "").replaceAll("&amp;", "&"));
    if (assetUrl.pathname === "/remote") {
      if (
        !preferences.preferences.remoteImages ||
        assetUrl.hostname !== documents.snapshot.id
      )
        continue;
      try {
        const image = await remoteImages.load(
          assetUrl.searchParams.get("url") ?? "",
        );
        html = html.replace(
          match[0],
          `src="data:${image.mime};base64,${image.bytes.toString("base64")}"`,
        );
      } catch {
        html = html.replace(match[0], 'data-image-unavailable="true"');
      }
      continue;
    }
    const resource = await documents.resolveAsset(assetUrl.toString());
    if (!resource) continue;
    const extension = path.extname(resource).slice(1);
    const mime =
      extension === "svg"
        ? "image/svg+xml"
        : extension === "jpg"
          ? "image/jpeg"
          : "image/" + extension;
    html = html.replace(
      match[0],
      `src="data:${mime};base64,${(await fs.readFile(resource)).toString("base64")}"`,
    );
  }
  for (const match of Array.from(
    html.matchAll(/url\((?:["']?)(chomy:\/\/app\/assets\/[^)"']+)(?:["']?)\)/g),
  )) {
    const resource = resolveAppResource(
      match[1] ?? "",
      path.join(__dirname, "renderer"),
    );
    if (!resource) continue;
    const ext = path.extname(resource).slice(1);
    if (!["woff2", "woff", "ttf"].includes(ext)) continue;
    html = html.replace(
      match[0],
      `url(data:font/${ext};base64,${(await fs.readFile(resource)).toString("base64")})`,
    );
  }
  return html;
}
async function exportDocument(format: "html" | "pdf", html: string) {
  html = await portableHtml(html);
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: "导出 " + format.toUpperCase(),
    defaultPath:
      documents.snapshot.name.replace(/\.(md|markdown|txt)$/i, "") +
      "." +
      format,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return null;
  // Renderer output is untrusted: exported HTML remains inert even if renderer is compromised.
  const prefix = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'"><title>Chomy export</title></head><body>`;
  const complete = prefix + html + "</body></html>";
  if (format === "html") await atomicWrite(result.filePath, complete);
  else {
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-redirect", (event) => event.preventDefault());
    try {
      await window.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(complete),
      );
      await window.webContents.executeJavaScript(
        "Promise.allSettled([document.fonts.ready, ...Array.from(document.images, image => image.decode())])",
      );
      await atomicWrite(
        result.filePath,
        await window.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
          margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
        }),
      );
    } finally {
      window.destroy();
    }
  }
  return path.basename(result.filePath);
}
async function execute(request: AppRequest): Promise<unknown> {
  switch (request.action) {
    case "copyText":
      clipboard.writeText(request.text);
      return undefined;
    case "openLink": {
      if (
        /^file:/i.test(request.url) ||
        !/^[a-z][a-z0-9+.-]*:/i.test(request.url)
      ) {
        const filename = documents.filePath;
        const granted = await documents.grantedAsset(request.url);
        const absolute = /^file:/i.test(request.url);
        if ((absolute || !filename) && !granted)
          throw new ChomyError(
            "ATTACHMENT_PATH",
            "此附件尚未授权，请通过插入附件选择原文件。",
          );
        const base = filename ? path.dirname(filename) : "";
        const real =
          granted ??
          (await fs.realpath(
            path.resolve(base, decodeURIComponent(request.url)),
          ));
        if (
          ((absolute || !real.startsWith(base + path.sep)) &&
            (await documents.grantedAsset(request.url)) !== real) ||
          ![
            ".pdf",
            ".txt",
            ".md",
            ".markdown",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".webp",
            ".docx",
            ".xlsx",
            ".pptx",
            ".zip",
          ].includes(path.extname(real).toLowerCase())
        )
          throw new ChomyError(
            "ATTACHMENT_PATH",
            "仅允许打开文档目录内或明确插入授权的常见附件。",
          );
        const result = await shell.openPath(real);
        if (result)
          throw new ChomyError(
            "ATTACHMENT_OPEN",
            "无法打开附件，请检查系统关联。",
          );
        return undefined;
      }
      const url = new URL(request.url);
      if (!["https:", "http:", "mailto:"].includes(url.protocol))
        throw new ChomyError("LINK_PROTOCOL", "不支持此链接协议。");
      await shell.openExternal(url.toString());
      return undefined;
    }
    case "bootstrap":
      return {
        document: documents.snapshot,
        preferences: preferences.preferences,
        themes: await preferences.themes(),
        recent: await preferences.recent((file) => documents.register(file)),
        recoveries: await documents.recoveries(),
        cloud: preferences.cloud,
      };
    case "update":
      return documents.update(request.id, request.markdown, request.revision);
    case "status":
      await documents.externalChange();
      if (documents.recoveryError)
        throw new ChomyError(
          "RECOVERY_FAILED",
          "恢复快照写入失败。请立即保存文档并检查磁盘。",
        );
      return documents.snapshot;
    case "new":
      return (await mayReplace()) ? documents.newDocument() : null;
    case "openPending": {
      const filename = pendingFile;
      pendingFile = null;
      return filename && (await mayReplace())
        ? opened(path.resolve(filename))
        : null;
    }
    case "open": {
      if (!(await mayReplace())) return null;
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openFile"],
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      });
      return result.canceled || !result.filePaths[0]
        ? null
        : opened(result.filePaths[0]);
    }
    case "openEntry": {
      const filename = documents.entries.get(request.id);
      if (!filename)
        throw new ChomyError("FILE_HANDLE", "文件列表已失效，请重新选择。");
      return (await mayReplace()) ? opened(filename) : null;
    }
    case "retryAsset":
      return assets.retry();
    case "assetDrop":
      if (
        preferences.preferences.assetMode !== "reference" &&
        !documents.filePath &&
        !(await documents.run(() => chooseSave()))
      )
        throw new ChomyError(
          "SAVE_CANCELLED",
          "未选择文档位置，附件原文件仍保留。",
        );
      return assets.insert(request.path);
    case "openDrop":
      return (await mayReplace()) ? opened(request.path) : null;
    case "save":
      return chooseSave();
    case "saveAs":
      return chooseSave(true);
    case "reload": {
      if (!documents.filePath) return null;
      if (!(await mayReplace())) return null;
      return opened(documents.filePath);
    }
    case "confirmClose":
      if (await mayReplace()) {
        await documents.persistRecovery();
        canClose = true;
        if (quitting) app.quit();
        else mainWindow?.close();
      } else quitting = false;
      return undefined;
    case "currentFolder":
    case "folder": {
      let directory =
        request.action === "currentFolder"
          ? documents.filePath
            ? path.dirname(documents.filePath)
            : (browsedDirectory ??
              preferences.lastDirectory ??
              (preferences.recentPaths[0]
                ? path.dirname(preferences.recentPaths[0])
                : app.getPath("documents")))
          : null;
      if (!directory) {
        const result = await dialog.showOpenDialog(mainWindow!, {
          properties: ["openDirectory"],
        });
        if (result.canceled || !result.filePaths[0]) return [];
        directory = result.filePaths[0];
      }
      if (request.action === "currentFolder") {
        try {
          await fs.access(directory);
        } catch {
          directory = app.getPath("documents");
        }
      }
      const entries = await documents.folder(directory);
      browsedDirectory = directory;
      preferences.lastDirectory = directory;
      await preferences.persist();
      return entries;
    }
    case "recent":
      return preferences.recent((file) => documents.register(file));
    case "restore":
      return (await mayReplace()) ? documents.restore(request.id) : null;
    case "discardRecovery":
      await documents.removeRecovery(request.id);
      return undefined;
    case "preferences":
      preferences.preferences = request.value;
      await preferences.persist();
      return request.value;
    case "themes":
      return preferences.themes();
    case "themeCss":
      return preferences.css(request.id);
    case "installTheme": {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "选择含 theme.json 与 theme.css 的主题文件夹",
        properties: request.zip ? ["openFile"] : ["openDirectory"],
        ...(request.zip
          ? { filters: [{ name: "ZIP", extensions: ["zip"] }] }
          : {}),
      });
      return result.canceled || !result.filePaths[0]
        ? preferences.themes()
        : request.zip
          ? preferences.installZip(result.filePaths[0])
          : preferences.install(result.filePaths[0]);
    }
    case "importThemeCss": {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "选择有权使用的 CSS（仅迁移常见选择器）",
        properties: ["openFile"],
        filters: [{ name: "CSS", extensions: ["css"] }],
      });
      return result.canceled || !result.filePaths[0]
        ? { themes: await preferences.themes(), omitted: 0 }
        : preferences.importCss(result.filePaths[0]);
    }
    case "removeTheme":
      return preferences.remove(request.id);
    case "cloudSave":
      await cloud.save(request.config, request.accessKey, request.secret);
      preferences.cloud = request.config;
      await preferences.persist();
      return undefined;
    case "cloudTest":
      if (!preferences.cloud)
        throw new ChomyError("CLOUD_CONFIG", "请先保存云存储配置。");
      return cloud.test(preferences.cloud);
    case "uploadStatus":
      return cloud.status;
    case "cloudCancel":
      cloud.cancel();
      return undefined;
    case "asset": {
      if (
        preferences.preferences.assetMode !== "reference" &&
        !documents.filePath &&
        !(await documents.run(() => chooseSave()))
      )
        return null;
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "插入图片或附件",
        properties: ["openFile"],
      });
      return result.canceled || !result.filePaths[0]
        ? null
        : assets.insert(result.filePaths[0]);
    }
    case "pasteImage": {
      await documents.run(() =>
        documents.update(request.id, request.markdown, request.revision),
      );
      return assets.storeClipboard(
        Buffer.from(request.bytes),
        request.mime,
        request.id,
      );
    }
    case "export":
      return exportDocument(request.format, request.html);
  }
}
async function start() {
  await app.whenReady();
  if (process.platform === "darwin")
    app.dock?.setIcon(path.join(__dirname, "../assets/icon.png"));
  const directory = app.getPath("userData");
  documents = new Documents(directory);
  preferences = new PreferencesService(directory);
  cloud = new CloudService(directory);
  assets = new Assets(documents, preferences, cloud);
  await documents.initialize();
  await preferences.initialize();
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle("chomy", async (request) => {
    const resource = resolveAppResource(
      request.url,
      path.join(__dirname, "renderer"),
    );
    if (!resource || request.method !== "GET")
      return new Response("Forbidden", { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(resource).toString());
      const headers = new Headers(response.headers);
      headers.set("Content-Security-Policy", CSP);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response("Resource unavailable", { status: 404 });
    }
  });
  protocol.handle("chomy-theme", async (request) => {
    try {
      const url = new URL(request.url);
      if (
        url.pathname !== "/preview.png" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        return new Response("Forbidden", { status: 403 });
      const bytes = await preferences.preview(url.hostname);
      if (!bytes) return new Response("Not found", { status: 404 });
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; script-src 'none'",
        },
      });
    } catch {
      return new Response("Preview unavailable", { status: 404 });
    }
  });
  protocol.handle("chomy-asset", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/remote") {
        if (
          !preferences.preferences.remoteImages ||
          url.hostname !== documents.snapshot.id
        )
          return new Response("Forbidden", { status: 403 });
        const image = await remoteImages.load(
          url.searchParams.get("url") ?? "",
        );
        return new Response(new Uint8Array(image.bytes), {
          headers: {
            "Content-Type": image.mime,
            "Content-Security-Policy": "default-src 'none'; script-src 'none'",
            "Cache-Control": "no-store",
          },
        });
      }
      const resource = await documents.resolveAsset(request.url);
      if (!resource) return new Response("Forbidden", { status: 403 });
      const response = await net.fetch(pathToFileURL(resource).toString());
      const headers = new Headers(response.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'none'",
      );
      return new Response(response.body, { headers });
    } catch {
      return new Response("Attachment unavailable", { status: 404 });
    }
  });
  ipcMain.handle(IPC.applicationInfo, (event, request: unknown) => {
    assertSender(event);
    applicationInfoRequestSchema.parse(request);
    return applicationInfoSchema.parse({
      apiVersion: 1,
      name: "Chomy",
      version: app.getVersion(),
      platform: process.platform,
      architecture: process.arch,
    });
  });
  ipcMain.handle(IPC.request, async (event, value: unknown) => {
    try {
      assertSender(event);
      const request = requestSchema.parse(value);
      const concurrent = [
        "asset",
        "assetDrop",
        "retryAsset",
        "pasteImage",
        "cloudTest",
        "cloudCancel",
        "uploadStatus",
        "export",
      ];
      const result = concurrent.includes(request.action)
        ? await execute(request)
        : await documents.run(() => execute(request));
      return { ok: true, value: result };
    } catch (error) {
      return {
        ok: false,
        code: error instanceof ChomyError ? error.code : "OPERATION_FAILED",
        message:
          error instanceof ChomyError
            ? error.message
            : "操作失败；文档内容仍保留。请检查文件权限或输入配置。",
      };
    }
  });
  if (pendingFile) {
    await opened(path.resolve(pendingFile));
    pendingFile = null;
  }
  installMenu(send);
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0)
      void createWindow().catch(fatal);
  });
  powerMonitor.on("suspend", () => {
    void documents
      .run(() => documents.persistRecovery())
      .catch(() => {
        documents.recoveryError = true;
      });
  });
  let autosaving = false;
  setInterval(() => {
    if (
      !preferences.preferences.autosave ||
      !documents.filePath ||
      !documents.snapshot.dirty ||
      autosaving
    )
      return;
    autosaving = true;
    void documents
      .run(async () => {
        await documents.persistRecovery();
        if (!(await documents.externalChange())) await documents.save();
      })
      .catch(() => {
        documents.recoveryError = true;
      })
      .finally(() => {
        autosaving = false;
      });
  }, 3000).unref();
}
app.on("before-quit", (event) => {
  if (mainWindow && !canClose) {
    event.preventDefault();
    quitting = true;
    send("close-request");
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
function fatal(error: unknown) {
  console.error(
    "APPLICATION_START_FAILED",
    error instanceof ChomyError
      ? error.code
      : error instanceof Error
        ? error.name
        : "Unknown",
  );
  app.exit(1);
}
if (squirrelStartup || !ownsInstance) app.quit();
else void start().catch(fatal);
