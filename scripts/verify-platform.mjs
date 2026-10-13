const expected =
  process.platform === "darwin"
    ? "arm64"
    : process.platform === "win32"
      ? "x64"
      : null;
console.log(
  JSON.stringify({
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
  }),
);
if (!expected || process.arch !== expected)
  throw new Error("Required target is macOS arm64 or Windows x64.");
