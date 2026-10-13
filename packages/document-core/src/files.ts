import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
export interface Encoding {
  bom: boolean;
  newline: "\n" | "\r\n";
}
export function decodeDocument(bytes: Buffer): {
  text: string;
  encoding: Encoding;
} {
  const bom = bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    bom ? bytes.subarray(3) : bytes,
  );
  if (text.includes("\0")) throw new Error("UNSUPPORTED_ENCODING");
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return { text, encoding: { bom, newline: crlf > lf ? "\r\n" : "\n" } };
}
export function encodeDocument(text: string, encoding: Encoding): Buffer {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, encoding.newline);
  return Buffer.concat([
    encoding.bom ? Buffer.from([239, 187, 191]) : Buffer.alloc(0),
    Buffer.from(normalized, "utf8"),
  ]);
}
export async function atomicWrite(
  destination: string,
  bytes: Buffer | string,
  beforeCommit?: () => Promise<void>,
): Promise<void> {
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  let mode = 0o600;
  try {
    mode = (await fs.stat(destination)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const handle = await fs.open(temporary, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.unlink(temporary);
    throw error;
  }
  await handle.close();
  try {
    await beforeCommit?.();
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.unlink(temporary);
    throw error;
  }
  // Directory fsync is unavailable on some Windows filesystems; file data was synced before rename.
  if (process.platform !== "win32") {
    const directory = await fs.open(path.dirname(destination), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}
