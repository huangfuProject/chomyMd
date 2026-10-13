import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  APP_URL,
  isTrustedSender,
  resolveAppResource,
} from "../../apps/desktop/src/main/security";
import {
  applicationInfoRequestSchema,
  applicationInfoSchema,
} from "../../packages/contracts/src";

describe("IPC trust boundary", () => {
  it("accepts only the registered main frame of the Chomy window", () => {
    expect(isTrustedSender(1, 1, APP_URL, true)).toBe(true);
    expect(isTrustedSender(2, 1, APP_URL, true)).toBe(false);
    expect(isTrustedSender(1, 1, APP_URL, false)).toBe(false);
    expect(isTrustedSender(1, 1, "https://example.com", true)).toBe(false);
  });
  it("rejects extra fields, invalid versions and unsupported platforms", () => {
    expect(
      applicationInfoRequestSchema.safeParse({ apiVersion: 1 }).success,
    ).toBe(true);
    for (const input of [
      null,
      {},
      { apiVersion: 2 },
      { apiVersion: 1, path: "/etc/passwd" },
    ])
      expect(applicationInfoRequestSchema.safeParse(input).success).toBe(false);
    expect(
      applicationInfoSchema.safeParse({
        apiVersion: 1,
        name: "Chomy",
        version: "1.0.0",
        platform: "win32",
        architecture: "x64",
      }).success,
    ).toBe(true);
    expect(
      applicationInfoSchema.safeParse({
        apiVersion: 1,
        name: "Chomy",
        version: "1.0.0",
        platform: "win32",
        architecture: "ia32",
      }).success,
    ).toBe(false);
  });
});
describe("local resource protocol", () => {
  const root = path.resolve("renderer");
  it("loads only permitted static files inside the renderer root", () => {
    expect(resolveAppResource(APP_URL, root)).toBe(
      path.join(root, "index.html"),
    );
    expect(resolveAppResource("chomy://app/assets/app.js", root)).toBe(
      path.join(root, "assets/app.js"),
    );
    for (const url of [
      "https://app/index.html",
      "chomy://other/index.html",
      "chomy://app/%2e%2e%2fsecret.js",
      "chomy://app/..%5csecret.js",
      "chomy://app/%00.js",
      "chomy://app/secret.json",
      "chomy://app/%ZZ",
      "chomy://user@app/index.html",
      "chomy://app/index.html?secret=1",
    ])
      expect(resolveAppResource(url, root)).toBeNull();
  });
});
