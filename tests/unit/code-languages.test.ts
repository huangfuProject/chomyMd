import { describe, expect, it } from "vitest";
import {
  codeLanguageOptions,
  highlighted,
} from "../../apps/desktop/src/renderer/editor/code-languages";

describe("code fence languages", () => {
  it("offers common grammars and aliases, retaining original fence labels", () => {
    const choices = codeLanguageOptions();
    for (const name of [
      "java",
      "kotlin",
      "c",
      "cpp",
      "csharp",
      "go",
      "rust",
      "swift",
      "sql",
      "html",
      "xml",
      "css",
      "yaml",
      "markdown",
      "mermaid",
      "js",
      "py",
    ])
      expect(choices).toContain(name);
    expect(codeLanguageOptions("Java")).toContain("Java");
    expect(codeLanguageOptions("custom-language")).toContain("custom-language");
    expect(new Set(choices).size).toBe(choices.length);
  });

  it("highlights Java case-insensitively and resolves language aliases", () => {
    const java =
      'public class Hello { public static void main(String[] args) { System.out.println("你好"); } }';
    expect(highlighted(java, "java")).toContain('class="hljs-keyword"');
    expect(highlighted(java, "Java")).toBe(highlighted(java, "java"));
    expect(highlighted("const x = 1;", "js")).toBe(
      highlighted("const x = 1;", "javascript"),
    );
  });

  it("keeps explicit plain text and unsupported languages inert", () => {
    const code = "<script>const x = 42;</script>";
    for (const name of ["text", "plaintext", "custom-language", "mermaid"])
      expect(highlighted(code, name)).toBe(
        "&lt;script&gt;const x = 42;&lt;/script&gt;",
      );
  });
});
