import { readFile } from "fs/promises";
import { join } from "path";
import type { Vault } from "obsidian";

type CoverVault = Pick<
  Vault,
  "getFileByPath" | "readBinary" | "modifyBinary" | "createBinary"
>;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Copies <booksDir>/<hash>/cover.png to <folder>/<hash>.png in the vault and
// returns the vault path, or "" when the book has no cover. `folder` must be
// normalized already. Named by hash so the path survives a title or
// filename-template change. The target is only
// written when missing or different, so background syncs leave it untouched
// (an unconditional rewrite would trip file-sync tools on every run). Covers
// are never deleted, including those of books removed from Readest.
export async function syncCover(
  vault: CoverVault,
  booksDir: string,
  hash: string,
  folder: string,
): Promise<string> {
  let source: Buffer;
  try {
    source = await readFile(join(booksDir, hash, "cover.png"));
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return "";
    throw e;
  }
  const bytes = new Uint8Array(source);
  const data = bytes.slice().buffer;
  const path = `${folder}/${hash}.png`;
  const existing = vault.getFileByPath(path);
  if (existing) {
    const current = new Uint8Array(await vault.readBinary(existing));
    if (!sameBytes(current, bytes)) await vault.modifyBinary(existing, data);
  } else {
    await vault.createBinary(path, data);
  }
  return path;
}
