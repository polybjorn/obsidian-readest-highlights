import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chapterForCfi, parseCfiSteps, readNavChapters } from "../src/nav";
import type { ChapterEntry } from "../src/nav";

async function tempDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "readest-nav-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeNav(t: TestContext, hash: string, nav: unknown): Promise<string> {
  const dir = await tempDir(t);
  await mkdir(join(dir, hash));
  await writeFile(join(dir, hash, "nav.json"), typeof nav === "string" ? nav : JSON.stringify(nav));
  return dir;
}

// --- CFI parsing ---

void test("parseCfiSteps parses a simple spine CFI", () => {
  assert.deepEqual(parseCfiSteps("epubcfi(/6/4)"), [6, 4]);
});

void test("parseCfiSteps collapses a range CFI to its start and drops assertions", () => {
  assert.deepEqual(
    parseCfiSteps("epubcfi(/6/10!/4/46/2[pt-4],/1:0,/1:9)"),
    [6, 10, 4, 46, 2, 1, 0],
  );
});

void test("parseCfiSteps ignores commas inside assertions", () => {
  assert.deepEqual(
    parseCfiSteps("epubcfi(/6/10!/4/2[a,b],/1:3,/1:9)"),
    [6, 10, 4, 2, 1, 3],
  );
});

void test("parseCfiSteps returns null for garbage", () => {
  assert.equal(parseCfiSteps("not a cfi"), null);
  assert.equal(parseCfiSteps(""), null);
});

// --- chapter lookup ---

const entries: ChapterEntry[] = [
  { label: "Title Page", steps: [6, 4] },
  { label: "Chapter One", steps: [6, 8] },
  { label: "Chapter Two", steps: [6, 12] },
];

void test("chapterForCfi picks the last entry at or before the annotation", () => {
  assert.equal(
    chapterForCfi(entries, "epubcfi(/6/8!/4/2,/1:0,/1:5)"),
    "Chapter One",
  );
  assert.equal(
    chapterForCfi(entries, "epubcfi(/6/10!/4/2,/1:0,/1:5)"),
    "Chapter One",
  );
  assert.equal(
    chapterForCfi(entries, "epubcfi(/6/12!/2,/1:0,/1:5)"),
    "Chapter Two",
  );
});

void test("chapterForCfi returns null before the first entry or on bad CFIs", () => {
  assert.equal(chapterForCfi(entries, "epubcfi(/6/2!/4/2,/1:0,/1:1)"), null);
  assert.equal(chapterForCfi(entries, "nonsense"), null);
});

// --- nav.json reading ---

void test("readNavChapters flattens nested subitems in position order", async (t) => {
  const dir = await writeNav(t, "h1", {
    version: 3,
    toc: [
      { label: "Intro", href: "i.xhtml", cfi: "epubcfi(/6/4)" },
      {
        label: "Part One",
        href: "p1.xhtml",
        cfi: "epubcfi(/6/6)",
        subitems: [
          { label: "  Chapter\n1 ", href: "c1.xhtml", cfi: "epubcfi(/6/8)" },
          { label: "Chapter 2", href: "c2.xhtml", cfi: "epubcfi(/6/10)" },
        ],
      },
    ],
  });
  const chapters = await readNavChapters(dir, "h1");
  assert.ok(chapters);
  assert.deepEqual(
    chapters.map((c) => c.label),
    ["Intro", "Part One", "Chapter 1", "Chapter 2"],
  );
  // Whitespace in labels is normalized so headings stay on one line.
  assert.equal(chapters[2]?.label, "Chapter 1");
});

void test("readNavChapters keeps a parent without a cfi and still descends", async (t) => {
  const dir = await writeNav(t, "h1", {
    toc: [
      {
        label: "Part One",
        subitems: [{ label: "Chapter 1", cfi: "epubcfi(/6/8)" }],
      },
    ],
  });
  const chapters = await readNavChapters(dir, "h1");
  assert.ok(chapters);
  assert.deepEqual(chapters.map((c) => c.label), ["Chapter 1"]);
});

void test("readNavChapters returns null when the cache is missing or unusable", async (t) => {
  const dir = await tempDir(t);
  await mkdir(join(dir, "nofile"));
  assert.equal(await readNavChapters(dir, "nofile"), null);
  assert.equal(await readNavChapters(dir, "nodir"), null);

  const broken = await writeNav(t, "h1", "not json{");
  assert.equal(await readNavChapters(broken, "h1"), null);

  const noToc = await writeNav(t, "h2", { version: 4, sections: {} });
  assert.equal(await readNavChapters(noToc, "h2"), null);

  const emptyToc = await writeNav(t, "h3", { toc: [] });
  assert.equal(await readNavChapters(emptyToc, "h3"), null);
});
