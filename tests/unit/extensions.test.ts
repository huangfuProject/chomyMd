import { describe, it, expect } from "vitest";
import { scopeTheme } from "../../packages/theme-engine/src/validate";
import {
  imageUrl,
  unsupportedReason,
} from "../../packages/markdown-core/src/policy";
import { SessionHistory } from "../../packages/editor-core/src/contracts";
import {
  validateCloud,
  objectUrl,
} from "../../packages/storage-core/src/config";
const cloud = {
  provider: "s3" as const,
  bucket: "test",
  region: "us-east-1",
  endpoint: "http://127.0.0.1:9000",
  publicUrl: "https://cdn.example.com",
  prefix: "chomy",
  pathStyle: true,
};
describe("untrusted extensions", () => {
  it("scopes theme selectors and rejects exfiltration/overlays", () => {
    expect(scopeTheme(":root{color:red}h1,p{font-size:20px}")).toContain(
      ".chomy-document h1",
    );
    for (const value of [
      '@import "https://bad.test";',
      "p{background:url(https://bad.test)}",
      "p{position:fixed}",
      "p{z-index:99999}",
      "@font-face{font-family:x;src:url(x)}",
    ])
      expect(() => scopeTheme(value)).toThrow();
  });
  it("keeps unknown syntax in source mode and maps only approved image paths", () => {
    expect(unsupportedReason("# Supported\n\n**text**")).toBeNull();
    for (const source of [
      "---\ntitle: hello\n---",
      "<script>x</script>",
      ":::unknown\nx\n:::",
      "Text[^note]",
      "$$x^2$$",
    ])
      expect(unsupportedReason(source)).not.toBeNull();
    expect(imageUrl("./assets/中文%20图.png", "session", false)).toBe(
      "chomy-asset://session/assets/中文%20图.png",
    );
    expect(imageUrl("javascript:alert(1)", "session", true)).toBe("");
    expect(imageUrl("https://example.com/img", "session", false)).toBe("");
    expect(imageUrl("https://example.com/img", "session", true)).toBe(
      "chomy-asset://session/remote?url=https%3A%2F%2Fexample.com%2Fimg",
    );
    expect(imageUrl("../secret.png", "session", true)).toBe(
      "chomy-asset://session/reference?ref=..%2Fsecret.png",
    );
  });
  it("validates endpoints and public URL/object keys", () => {
    expect(() => validateCloud(cloud)).not.toThrow();
    expect(() =>
      validateCloud({ ...cloud, endpoint: "http://remote.example.com" }),
    ).toThrow();
    expect(() => validateCloud({ ...cloud, prefix: "../other" })).toThrow();
    expect(() =>
      validateCloud({
        ...cloud,
        publicUrl: "https://cdn.example.com?signature=secret",
      }),
    ).toThrow();
    expect(objectUrl(cloud, "中文 空格/image.png")).toBe(
      "https://cdn.example.com/%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC/image.png",
    );
  });
  it("retains session undo across mode changes", () => {
    const history = new SessionHistory();
    history.record("original", "rich edit");
    expect(history.undo("rich edit")).toBe("original");
    expect(history.redo("original")).toBe("rich edit");
  });
});
