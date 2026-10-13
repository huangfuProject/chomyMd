import path from "node:path";

export const APP_URL = "chomy://app/index.html";
export function isTrustedSender(
  actualId: number,
  expectedId: number,
  frameUrl: string,
  isMainFrame: boolean,
): boolean {
  return actualId === expectedId && isMainFrame && frameUrl === APP_URL;
}
export function resolveAppResource(url: string, root: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "chomy:" ||
      parsed.host !== "app" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.includes("\\") || pathname.includes("\0")) return null;
    const relative = pathname.replace(/^\/+/, "");
    if (
      !relative ||
      relative.split("/").some((part) => part === ".." || part === ".")
    )
      return null;
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) return null;
    if (
      ![
        ".html",
        ".js",
        ".css",
        ".svg",
        ".png",
        ".woff2",
        ".woff",
        ".ttf",
      ].includes(path.extname(resolved))
    )
      return null;
    return resolved;
  } catch {
    return null;
  } // Invalid URL is explicitly rejected, never loaded.
}
