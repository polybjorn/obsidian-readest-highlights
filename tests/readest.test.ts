import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBooksWithAnnotations } from "../src/readest";

async function tempDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "readest-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function makeBooksDir(
  t: TestContext,
  configs: Record<string, unknown>,
  library: unknown[],
): Promise<string> {
  const dir = await tempDir(t);
  await writeFile(join(dir, "library.json"), JSON.stringify(library));
  for (const [hash, config] of Object.entries(configs)) {
    await mkdir(join(dir, hash));
    await writeFile(join(dir, hash, "config.json"), JSON.stringify(config));
  }
  return dir;
}

const baseAnnotation = {
  type: "annotation",
  text: "highlighted text",
  style: "highlight" as const,
  color: "yellow",
  note: "",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
};

const libraryEntry = (hash: string, extra: object = {}) => ({
  hash,
  format: "epub",
  title: `Book ${hash}`,
  createdAt: 0,
  ...extra,
});

// --- unreadable-highlight detection (format-change tripwire) ---
//
// We warn on the *shape* of the booknotes, not the schemaVersion number:
// a highlight (style set) we cannot render at all - no text and no note -
// means a field this plugin reads was renamed or moved. A bumped
// schemaVersion alone, with healthy booknotes, must never warn.

void test("newer schemaVersion with healthy booknotes does not warn", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      v3: {
        bookHash: "v3",
        schemaVersion: 3,
        booknotes: [{ ...baseAnnotation, bookHash: "v3", id: "a3" }],
      },
      v99: {
        bookHash: "v99",
        schemaVersion: 99,
        booknotes: [{ ...baseAnnotation, bookHash: "v99", id: "a99" }],
      },
    },
    [libraryEntry("v3"), libraryEntry("v99")],
  );
  let count: number | undefined;
  let newer: number[] | undefined;
  const books = await loadBooksWithAnnotations(dir, {
    onUnreadableHighlights: (c) => {
      count = c;
    },
    onNewerSchemaVersion: (v) => {
      newer = v;
    },
  });
  assert.equal(count, undefined);
  // A newer version that still reads highlights fine is a benign bump - quiet.
  assert.equal(newer, undefined);
  assert.equal(books.length, 2);
});

void test("newer schemaVersion that yields no readable highlights warns", async (t) => {
  // booknotes present but every record is unrenderable (no text, no note) AND
  // the config is a version we have not verified: the silent-zero case.
  const dir = await makeBooksDir(
    t,
    {
      v99: {
        bookHash: "v99",
        schemaVersion: 99,
        booknotes: [
          { ...baseAnnotation, bookHash: "v99", id: "a99", text: "", note: "" },
        ],
      },
    },
    [libraryEntry("v99")],
  );
  let newer: number[] | undefined;
  await loadBooksWithAnnotations(dir, {
    onNewerSchemaVersion: (v) => {
      newer = v;
    },
  });
  assert.deepEqual(newer, [99]);
});

void test("a known schemaVersion with no highlights does not warn as newer", async (t) => {
  const dir = await makeBooksDir(
    t,
    { v3: { bookHash: "v3", schemaVersion: 3, booknotes: [] } },
    [libraryEntry("v3")],
  );
  let newer: number[] | undefined;
  await loadBooksWithAnnotations(dir, {
    onNewerSchemaVersion: (v) => {
      newer = v;
    },
  });
  assert.equal(newer, undefined);
});

void test("missing schemaVersion (legacy config) does not warn", async (t) => {
  const dir = await makeBooksDir(
    t,
    { h1: { bookHash: "h1", booknotes: [{ ...baseAnnotation, bookHash: "h1", id: "a1" }] } },
    [libraryEntry("h1")],
  );
  let called = false;
  await loadBooksWithAnnotations(dir, {
    onUnreadableHighlights: () => {
      called = true;
    },
  });
  assert.equal(called, false);
});

void test("highlight with a note but no text does not warn (still renderable)", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        schemaVersion: 3,
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "a1", text: "", note: "a margin note" },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  let called = false;
  const books = await loadBooksWithAnnotations(dir, {
    onUnreadableHighlights: () => {
      called = true;
    },
  });
  assert.equal(called, false);
  assert.equal(books.length, 1);
});

void test("styled highlight with neither text nor note warns (format changed)", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        schemaVersion: 4,
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "a1", text: "", note: "" },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  let count: number | undefined;
  await loadBooksWithAnnotations(dir, {
    onUnreadableHighlights: (c) => {
      count = c;
    },
  });
  assert.equal(count, 1);
});

void test("unreadable count aggregates across books and ignores deleted records", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "ok", text: "good" },
          { ...baseAnnotation, bookHash: "h1", id: "bad1", text: "", note: "" },
          { ...baseAnnotation, bookHash: "h1", id: "del", text: "", note: "", deletedAt: 1 },
        ],
      },
      h2: {
        bookHash: "h2",
        booknotes: [{ ...baseAnnotation, bookHash: "h2", id: "bad2", text: "", note: "" }],
      },
    },
    [libraryEntry("h1"), libraryEntry("h2")],
  );
  let count: number | undefined;
  await loadBooksWithAnnotations(dir, {
    includeDeleted: false,
    onlyWithAnnotations: false,
    onUnreadableHighlights: (c) => {
      count = c;
    },
  });
  assert.equal(count, 2);
});

void test("unreadable highlights are excluded from the returned annotations", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "ok", text: "kept" },
          { ...baseAnnotation, bookHash: "h1", id: "bad", text: "", note: "" },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir);
  assert.equal(books.length, 1);
  assert.deepEqual(
    (books[0]?.annotations ?? []).map((a) => a.id),
    ["ok"],
  );
});

void test("record with no style (e.g. a bookmark) and no text does not warn", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "bm", type: "bookmark", style: null, text: "", note: "" },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  let called = false;
  await loadBooksWithAnnotations(dir, {
    onlyWithAnnotations: false,
    onUnreadableHighlights: () => {
      called = true;
    },
  });
  assert.equal(called, false);
});

// --- parse error reporting ---

void test("malformed library.json throws error mentioning the path", async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, "library.json"), "{ not valid json");
  await assert.rejects(
    () => loadBooksWithAnnotations(dir),
    (e: Error) =>
      e.message.includes("library.json") &&
      e.message.startsWith("Failed to parse"),
  );
});

void test("malformed config.json throws error mentioning the path", async (t) => {
  const dir = await tempDir(t);
  await writeFile(
    join(dir, "library.json"),
    JSON.stringify([libraryEntry("h1")]),
  );
  await mkdir(join(dir, "h1"));
  await writeFile(join(dir, "h1", "config.json"), "{ not valid json");
  await assert.rejects(
    () => loadBooksWithAnnotations(dir),
    (e: Error) =>
      e.message.includes(join("h1", "config.json")) &&
      e.message.startsWith("Failed to parse"),
  );
});

void test("non-array library.json throws a clear format-changed error", async (t) => {
  const dir = await tempDir(t);
  await writeFile(
    join(dir, "library.json"),
    JSON.stringify({ books: [libraryEntry("h1")] }),
  );
  await assert.rejects(
    () => loadBooksWithAnnotations(dir),
    (e: Error) =>
      e.message.includes("library.json") &&
      e.message.includes("not a JSON array"),
  );
});

void test("library entries without a usable hash are skipped, the rest load", async (t) => {
  const dir = await tempDir(t);
  await writeFile(
    join(dir, "library.json"),
    JSON.stringify([
      { format: "epub", title: "no hash", createdAt: 0 },
      { hash: "", format: "epub", title: "empty hash", createdAt: 0 },
      libraryEntry("good"),
    ]),
  );
  await mkdir(join(dir, "good"));
  await writeFile(
    join(dir, "good", "config.json"),
    JSON.stringify({
      bookHash: "good",
      booknotes: [{ ...baseAnnotation, bookHash: "good", id: "a1" }],
    }),
  );
  const books = await loadBooksWithAnnotations(dir);
  assert.equal(books.length, 1);
  assert.equal(books[0]?.book.hash, "good");
});

void test("an annotation deleted at epoch 0 is treated as deleted", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "live", deletedAt: null },
          { ...baseAnnotation, bookHash: "h1", id: "gone", deletedAt: 0 },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir);
  assert.deepEqual(
    books[0]?.annotations.map((a) => a.id),
    ["live"],
  );
});

// --- book and annotation filtering ---

void test("includeDeleted: true keeps soft-deleted books in results", async (t) => {
  const dir = await makeBooksDir(
    t,
    { h1: { bookHash: "h1", booknotes: [{ ...baseAnnotation, bookHash: "h1", id: "a1" }] } },
    [libraryEntry("h1", { deletedAt: 12345 })],
  );
  const withoutDeleted = await loadBooksWithAnnotations(dir);
  assert.equal(withoutDeleted.length, 0);
  const withDeleted = await loadBooksWithAnnotations(dir, {
    includeDeleted: true,
  });
  assert.equal(withDeleted.length, 1);
  assert.equal(withDeleted[0]?.book.hash, "h1");
  assert.equal(withDeleted[0]?.book.deletedAt, 12345);
});

void test("onlyWithAnnotations: false keeps books with no annotations", async (t) => {
  const dir = await makeBooksDir(
    t,
    { h1: { bookHash: "h1", booknotes: [] } },
    [libraryEntry("h1")],
  );
  const filtered = await loadBooksWithAnnotations(dir);
  assert.equal(filtered.length, 0);
  const unfiltered = await loadBooksWithAnnotations(dir, {
    onlyWithAnnotations: false,
  });
  assert.equal(unfiltered.length, 1);
  assert.equal(unfiltered[0]?.annotations.length, 0);
});

void test("missing config.json is treated as a book with no annotations", async (t) => {
  const dir = await tempDir(t);
  await writeFile(
    join(dir, "library.json"),
    JSON.stringify([libraryEntry("h1")]),
  );
  const filtered = await loadBooksWithAnnotations(dir);
  assert.equal(filtered.length, 0);
  const unfiltered = await loadBooksWithAnnotations(dir, {
    onlyWithAnnotations: false,
  });
  assert.equal(unfiltered.length, 1);
  assert.equal(unfiltered[0]?.annotations.length, 0);
});

void test("soft-deleted annotations are dropped from results", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "alive" },
          { ...baseAnnotation, bookHash: "h1", id: "dead", deletedAt: 999 },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir);
  assert.equal(books.length, 1);
  assert.deepEqual(
    books[0]?.annotations.map((a) => a.id),
    ["alive"],
  );
});

void test("filter option excludes non-matching annotations", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "highlight", style: "highlight" },
          { ...baseAnnotation, bookHash: "h1", id: "underline", style: "underline" },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir, {
    filter: (a) => a.style === "highlight",
  });
  assert.equal(books.length, 1);
  assert.deepEqual(
    books[0]?.annotations.map((a) => a.id),
    ["highlight"],
  );
});

void test("filter that drops all annotations also drops the book by default", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [{ ...baseAnnotation, bookHash: "h1", style: "underline" }],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir, {
    filter: (a) => a.style === "highlight",
  });
  assert.equal(books.length, 0);
});

// --- annotation ordering ---

void test("annotations are sorted by page ascending", async (t) => {
  const dir = await makeBooksDir(
    t,
    {
      h1: {
        bookHash: "h1",
        booknotes: [
          { ...baseAnnotation, bookHash: "h1", id: "p5", page: 5 },
          { ...baseAnnotation, bookHash: "h1", id: "p1", page: 1 },
          { ...baseAnnotation, bookHash: "h1", id: "p3", page: 3 },
        ],
      },
    },
    [libraryEntry("h1")],
  );
  const books = await loadBooksWithAnnotations(dir);
  assert.deepEqual(
    books[0]?.annotations.map((a) => a.id),
    ["p1", "p3", "p5"],
  );
});
