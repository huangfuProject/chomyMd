import hljs from "highlight.js";

// The selector and both renderers share the same registered grammars.
const languages = new Set<string>(["mermaid"]);
for (const name of hljs.listLanguages()) {
  languages.add(name);
  for (const alias of hljs.getLanguage(name)?.aliases ?? [])
    languages.add(alias);
}
const supportedLanguages = [...languages].sort();

export function codeLanguageOptions(current = ""): string[] {
  // Preserve the exact fence label, including aliases and unrecognised labels.
  return [
    "",
    ...supportedLanguages,
    ...(current && !languages.has(current) ? [current] : []),
  ];
}

export function highlighted(code: string, language: string): string {
  const name = language.trim().toLowerCase();
  if (name)
    return hljs.highlight(code, {
      language: hljs.getLanguage(name) ? name : "plaintext",
      ignoreIllegals: true,
    }).value;
  // Keep unlabelled detection bounded; do not scan all 193 grammars per edit.
  return hljs.highlightAuto(code, [
    "javascript",
    "typescript",
    "python",
    "json",
    "bash",
    "java",
    "cpp",
    "csharp",
    "go",
    "rust",
    "sql",
  ]).value;
}
