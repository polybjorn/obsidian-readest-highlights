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

// --- book and annotation filtering ---

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
