import { z } from "zod";
export const IPC = {
  applicationInfo: "chomy:v1:application-info",
  request: "chomy:v1:request",
  command: "chomy:v1:command",
} as const;
export const applicationInfoRequestSchema = z
  .object({ apiVersion: z.literal(1) })
  .strict();
export const applicationInfoSchema = z
  .object({
    apiVersion: z.literal(1),
    name: z.literal("Chomy"),
    version: z.string().min(1),
    platform: z.enum(["darwin", "win32", "linux"]),
    architecture: z.enum(["arm64", "x64"]),
  })
  .strict();
export type ApplicationInfo = z.infer<typeof applicationInfoSchema>;
const id = z.string().min(1).max(128);
export const textSchema = z.string().max(12 * 1024 * 1024);
export const documentSchema = z
  .object({
    id,
    name: z.string(),
    markdown: textSchema,
    revision: z.number().int().nonnegative(),
    dirty: z.boolean(),
    saved: z.boolean(),
    externalChange: z.boolean(),
  })
  .strict();
export type DocumentSnapshot = z.infer<typeof documentSchema>;
export const fileEntrySchema = z
  .object({
    id,
    name: z.string(),
    relative: z.string(),
    kind: z.enum(["file", "directory"]).optional(),
    editable: z.boolean().optional(),
  })
  .strict();
export type FileEntry = z.infer<typeof fileEntrySchema>;
export const themeSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
      .refine(
        (value) =>
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value),
      ),
    name: z.string().max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    engine: z.literal(">=1.0.0"),
    author: z.string().max(120),
    description: z.string().max(1000).optional(),
    preview: z.literal("preview.png").optional(),
    modes: z
      .array(z.enum(["light", "dark"]))
      .min(1)
      .max(2)
      .refine((value) => new Set(value).size === value.length),
    styles: z.literal("theme.css"),
  })
  .strict();
export type ThemeManifest = z.infer<typeof themeSchema>;
export const preferencesSchema = z
  .object({
    theme: z.string().max(80),
    autosave: z.boolean(),
    fontSize: z.number().int().min(12).max(28),
    contentWidth: z.number().int().min(540).max(1000),
    assetMode: z.enum(["local", "reference", "cloud"]),
    remoteImages: z.boolean(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const uploadStatusSchema = z
  .object({
    state: z.enum(["queued", "uploading", "succeeded", "failed", "canceled"]),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .nullable();
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
export const cloudSchema = z
  .object({
    provider: z.enum(["s3", "aliyun", "qiniu"]),
    bucket: z.string().min(1).max(100),
    region: z.string().min(1).max(100),
    endpoint: z.string().max(500),
    publicUrl: z.string().max(500),
    prefix: z.string().max(100),
    pathStyle: z.boolean(),
  })
  .strict();
export type CloudConfig = z.infer<typeof cloudSchema>;
export const bootstrapSchema = z
  .object({
    document: documentSchema,
    preferences: preferencesSchema,
    themes: z.array(themeSchema),
    recent: z.array(fileEntrySchema),
    recoveries: z.array(z.object({ id, name: z.string(), date: z.string() })),
    cloud: cloudSchema.nullable(),
  })
  .strict();
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export const commandSchema = z.enum([
  "new",
  "open",
  "save",
  "saveAs",
  "folder",
  "source",
  "sidebar",
  "reading",
  "tools",
  "theme-light",
  "theme-dark",
  "theme-system",
  "theme-contrast",
  "find",
  "preferences",
  "close-request",
  "bold",
  "italic",
  "link",
  "image",
  "code",
  "table",
  "undo",
  "redo",
  "focus",
  "typewriter",
  "export-html",
  "export-pdf",
  "open-pending",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "paragraph",
  "bullet",
  "ordered",
  "quote",
  "task",
  "rule",
  "code-block",
]);
export type AppCommand = z.infer<typeof commandSchema>;
const session = {
  id,
  markdown: textSchema,
  revision: z.number().int().nonnegative(),
};
export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }).strict(),
  z.object({ action: z.literal("copyText"), text: textSchema }).strict(),
  z
    .object({ action: z.literal("openLink"), url: z.string().max(4096) })
    .strict(),
  z.object({ action: z.literal("update"), ...session }).strict(),
  z
    .object({
      action: z.enum([
        "new",
        "open",
        "save",
        "saveAs",
        "reload",
        "status",
        "confirmClose",
        "asset",
        "retryAsset",
        "folder",
        "currentFolder",
        "recent",
        "themes",
        "cloudTest",
        "cloudCancel",
        "uploadStatus",
        "openPending",
      ]),
    })
    .strict(),
  z.object({ action: z.literal("openEntry"), id }).strict(),
  z
    .object({
      action: z.enum(["openDrop", "assetDrop"]),
      path: z.string().min(1).max(4096),
    })
    .strict(),
  z.object({ action: z.literal("restore"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("discardRecovery"), id: z.uuid() }).strict(),
  z
    .object({ action: z.literal("preferences"), value: preferencesSchema })
    .strict(),
  z.object({ action: z.literal("installTheme"), zip: z.boolean() }).strict(),
  z.object({ action: z.literal("importThemeCss") }).strict(),
  z.object({ action: z.literal("removeTheme"), id }).strict(),
  z.object({ action: z.literal("themeCss"), id }).strict(),
  z
    .object({
      action: z.literal("pasteImage"),
      ...session,
      bytes: z.array(z.number().int().min(0).max(255)).max(20 * 1024 * 1024),
      mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("cloudSave"),
      config: cloudSchema,
      accessKey: z.string().min(1).max(256),
      secret: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      action: z.literal("export"),
      format: z.enum(["html", "pdf"]),
      html: z.string().max(20 * 1024 * 1024),
    })
    .strict(),
]);
export type AppRequest = z.infer<typeof requestSchema>;
export const replySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export class ChomyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface ChomyApi {
  copyText(text: string): Promise<void>;
  openLink(url: string): Promise<void>;
  getApplicationInfo(): Promise<ApplicationInfo>;
  bootstrap(): Promise<Bootstrap>;
  update(
    document: Pick<DocumentSnapshot, "id" | "markdown" | "revision">,
  ): Promise<DocumentSnapshot>;
  newDocument(): Promise<DocumentSnapshot | null>;
  openPendingDocument(): Promise<DocumentSnapshot | null>;
  openDocument(): Promise<DocumentSnapshot | null>;
  openEntry(id: string): Promise<DocumentSnapshot | null>;
  openDroppedFile(file: File): Promise<DocumentSnapshot | null>;
  save(as?: boolean): Promise<DocumentSnapshot | null>;
  reload(): Promise<DocumentSnapshot | null>;
  status(): Promise<DocumentSnapshot>;
  confirmClose(): Promise<void>;
  openFolder(): Promise<FileEntry[]>;
  currentFolder(): Promise<FileEntry[]>;
  recent(): Promise<FileEntry[]>;
  restore(id: string): Promise<DocumentSnapshot | null>;
  discardRecovery(id: string): Promise<void>;
  setPreferences(value: Preferences): Promise<Preferences>;
  installTheme(zip?: boolean): Promise<ThemeManifest[]>;
  importThemeCss(): Promise<{ themes: ThemeManifest[]; omitted: number }>;
  removeTheme(id: string): Promise<ThemeManifest[]>;
  themeCss(id: string): Promise<string>;
  hasSourceFile(file: File): boolean;
  insertDroppedAsset(file: File): Promise<{ id: string; markdown: string }>;
  retryAsset(): Promise<{ id: string; markdown: string }>;
  insertAsset(): Promise<{ id: string; markdown: string } | null>;
  pasteImage(
    document: Pick<DocumentSnapshot, "id" | "markdown" | "revision">,
    bytes: number[],
    mime: "image/png" | "image/jpeg" | "image/webp",
  ): Promise<{ id: string; markdown: string }>;
  saveCloud(
    config: CloudConfig,
    accessKey: string,
    secret: string,
  ): Promise<void>;
  uploadStatus(): Promise<UploadStatus>;
  testCloud(): Promise<string>;
  cancelUpload(): Promise<void>;
  exportDocument(format: "html" | "pdf", html: string): Promise<string | null>;
  onCommand(listener: (command: AppCommand) => void): () => void;
}
