import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncCover } from "../src/covers";
import { optionsFromSettings, renderBookNote } from "../src/renderer";
import { DEFAULT_SETTINGS, type ReadestSettings } from "../src/settings";
import type { ParsedBook } from "../src/types";

async function booksDirWithCover(
  t: TestContext,
  hash: string,
  bytes?: number[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "readest-cover-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, hash));
  if (bytes) await writeFile(join(dir, hash, "cover.png"), Buffer.from(bytes));
  return dir;
}

// Just the vault surface syncCover touches, recording every write.
class FakeVault {
  files = new Map<string, ArrayBuffer>();
  writes: string[] = [];
  getFileByPath(path: string) {
    return this.files.has(path) ? { path } : null;
  }
  readBinary(file: { path: string }) {
    return Promise.resolve(this.files.get(file.path) as ArrayBuffer);
  }
  modifyBinary(file: { path: string }, data: ArrayBuffer) {
    this.writes.push(`modify ${file.path}`);
    this.files.set(file.path, data);
    return Promise.resolve();
  }
  createBinary(path: string, data: ArrayBuffer) {
    this.writes.push(`create ${path}`);
    this.files.set(path, data);
    return Promise.resolve({ path });
  }
}

const sync = (vault: FakeVault, dir: string, hash: string, folder: string) =>
  syncCover(
    vault as unknown as Parameters<typeof syncCover>[0],
    dir,
    hash,
    folder,
  );

const bytesOf = (b: ArrayBuffer | undefined) => [...new Uint8Array(b!)];

void test("syncCover copies the cover to <folder>/<hash>.png", async (t) => {
  const dir = await booksDirWithCover(t, "abc", [1, 2, 3]);
  const vault = new FakeVault();
  assert.equal(await sync(vault, dir, "abc", "Covers"), "Covers/abc.png");
  assert.deepEqual(vault.writes, ["create Covers/abc.png"]);
  assert.deepEqual(bytesOf(vault.files.get("Covers/abc.png")), [1, 2, 3]);
});

void test("syncCover leaves an identical cover untouched", async (t) => {
  const dir = await booksDirWithCover(t, "abc", [1, 2, 3]);
  const vault = new FakeVault();
  await sync(vault, dir, "abc", "Covers");
  assert.equal(await sync(vault, dir, "abc", "Covers"), "Covers/abc.png");
  assert.deepEqual(vault.writes, ["create Covers/abc.png"]);
});

void test("syncCover rewrites a cover that differs from the source", async (t) => {
  const dir = await booksDirWithCover(t, "abc", [1, 2, 3]);
  const vault = new FakeVault();
  vault.files.set("Covers/abc.png", new Uint8Array([9]).buffer);
  await sync(vault, dir, "abc", "Covers");
  assert.deepEqual(vault.writes, ["modify Covers/abc.png"]);
  assert.deepEqual(bytesOf(vault.files.get("Covers/abc.png")), [1, 2, 3]);
});

void test("syncCover returns empty and writes nothing without a cover", async (t) => {
  const dir = await booksDirWithCover(t, "abc");
  const vault = new FakeVault();
  assert.equal(await sync(vault, dir, "abc", "Covers"), "");
  assert.deepEqual(vault.writes, []);
});

const parsed: ParsedBook = {
  book: {
    hash: "abc123",
    format: "epub",
    title: "Dune",
    author: "Frank Herbert",
    createdAt: 0,
    metadata: { published: "1965-08-01", isbn: "9780441013593" },
  },
  annotations: [
    {
      bookHash: "abc123",
      id: "a1",
      type: "annotation",
      text: "Fear is the mind-killer.",
      style: "highlight",
      color: "yellow",
      page: 12,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ],
};

void test("1.8.0 settings with no cover keys render byte-identical output", () => {
  // Saved data from 1.8.0 has no coverFolder; loadSettings merges defaults.
  const saved: Partial<ReadestSettings> = {
    ...DEFAULT_SETTINGS,
    frontmatterTags: "Book",
    extraFrontmatter: 'rating: ""\nposter: "{hash}"',
  };
  delete saved.coverFolder;
  const settings = Object.assign({}, DEFAULT_SETTINGS, saved);
  // Captured from 1.8.0's renderer with the same settings and book.
  const expected =
    '---\ntags:\n  - "Book"\nauthor: "[[Frank Herbert]]"\nyear: 1965\nisbn: "9780441013593"\nreadest-hash: abc123\nrating: ""\nposter: "abc123"\n---\n\n## Highlights\n\n- Fear is the mind-killer.\n  *page 12*\n';
  assert.equal(renderBookNote(parsed, optionsFromSettings(settings)), expected);
});

void test("{cover} resolves in extra fields, empty when no cover was copied", () => {
  const opts = optionsFromSettings({
    ...DEFAULT_SETTINGS,
    extraFrontmatter: 'poster: "[[{cover}]]"',
  });
  assert.match(
    renderBookNote({ ...parsed, cover: "Covers/abc123.png" }, opts),
    /^poster: "\[\[Covers\/abc123\.png\]\]"$/m,
  );
  assert.match(renderBookNote(parsed, opts), /^poster: "\[\[\]\]"$/m);
});
