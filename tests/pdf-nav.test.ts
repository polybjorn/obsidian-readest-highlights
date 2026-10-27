import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chapterForPage, readPdfChapters, type PdfJs } from "../src/pdf-nav";
import { loadBooksWithAnnotations } from "../src/readest";

// pdf.js is Obsidian's bundled build (loadPdfJs), unavailable under the test
// runner, so it is faked at the getDocument boundary. Page refs are objects
// resolved by getPageIndex (0-based); named dests go through getDestination.
const REFS = [{ num: 10 }, { num: 20 }, { num: 30 }, { num: 40 }];

function fakePdfJs(outline: unknown[] | null, calls = { opened: 0 }): PdfJs {
  return {
    getDocument: () => {
      calls.opened++;
      return {
        promise: Promise.resolve({
          getOutline: () => Promise.resolve(outline as never),
          getDestination: (id: string) =>
            Promise.resolve(id === "named-ch2" ? [REFS[2], { name: "XYZ" }] : null),
          getPageIndex: (ref: unknown) => {
            const i = REFS.indexOf(ref as { num: number });
            return i >= 0 ? Promise.resolve(i) : Promise.reject(new Error("bad ref"));
          },
          destroy: () => Promise.resolve(),
        }),
      };
    },
  };
}

const outline = [
  { title: "Front", dest: [REFS[0], { name: "Fit" }], items: [] },
  {
    title: "Chapter  One",
    dest: [REFS[1], { name: "Fit" }],
    items: [{ title: "Section 1.1", dest: [REFS[1]], items: [] }],
  },
  { title: "Chapter Two", dest: "named-ch2", items: [] },
  { title: "Broken", dest: [{ num: 99 }], items: [] },
  { title: "Chapter Three", dest: [3], items: [] },
];

async function booksDirWithPdf(t: TestContext, hash = "h1"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "readest-pdf-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, hash));
  await writeFile(join(dir, hash, "Some Title.pdf"), "%PDF-1.7 fake");
  return dir;
}

void test("readPdfChapters flattens the outline into 1-based pages, sorted", async (t) => {
  const dir = await booksDirWithPdf(t);
  const entries = await readPdfChapters(dir, "h1", () => Promise.resolve(fakePdfJs(outline)));
  assert.deepEqual(entries, [
    { label: "Front", page: 1 },
    { label: "Chapter One", page: 2 },
    { label: "Section 1.1", page: 2 },
    { label: "Chapter Two", page: 3 },
    { label: "Chapter Three", page: 4 },
  ]);
});

void test("readPdfChapters returns null without a PDF or an outline", async (t) => {
  const dir = await booksDirWithPdf(t);
  const pdfjs = () => Promise.resolve(fakePdfJs(null));
  assert.equal(await readPdfChapters(dir, "h1", pdfjs), null);
  assert.equal(await readPdfChapters(dir, "missing", pdfjs), null);
});

void test("readPdfChapters returns null when pdf.js throws", async (t) => {
  const dir = await booksDirWithPdf(t);
  const entries = await readPdfChapters(dir, "h1", () => Promise.reject(new Error("no pdf.js")));
  assert.equal(entries, null);
});

void test("readPdfChapters reuses the outline until the file changes", async (t) => {
  const dir = await booksDirWithPdf(t);
  const calls = { opened: 0 };
  const pdfjs = () => Promise.resolve(fakePdfJs(outline, calls));
  await readPdfChapters(dir, "h1", pdfjs);
  await readPdfChapters(dir, "h1", pdfjs);
  assert.equal(calls.opened, 1);
  await writeFile(join(dir, "h1", "Some Title.pdf"), "%PDF-1.7 changed, longer");
  await readPdfChapters(dir, "h1", pdfjs);
  assert.equal(calls.opened, 2);
});

void test("chapterForPage picks the last entry starting on or before the page", () => {
  const entries = [
    { label: "One", page: 2 },
    { label: "One.1", page: 2 },
    { label: "Two", page: 5 },
  ];
  assert.equal(chapterForPage(entries, 1), null);
  assert.equal(chapterForPage(entries, 2), "One.1");
  assert.equal(chapterForPage(entries, 4), "One.1");
  assert.equal(chapterForPage(entries, 9), "Two");
});

const annotation = (id: string, page: number) => ({
  bookHash: "h1",
  id,
  type: "annotation",
  text: `text ${id}`,
  style: "highlight",
  color: "yellow",
  page,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
});

async function pdfLibrary(t: TestContext, format: string): Promise<string> {
  const dir = await booksDirWithPdf(t);
  await writeFile(
    join(dir, "library.json"),
    JSON.stringify([{ hash: "h1", format, title: "Some Title", createdAt: 0 }]),
  );
  await writeFile(
    join(dir, "h1", "config.json"),
    JSON.stringify({ bookHash: "h1", booknotes: [annotation("a", 1), annotation("b", 3)] }),
  );
  return dir;
}

void test("PDF highlights get chapters from the outline when a loader is given", async (t) => {
  const dir = await pdfLibrary(t, "PDF");
  const [parsed] = await loadBooksWithAnnotations(dir, {
    loadPdf: () => Promise.resolve(fakePdfJs(outline)),
  });
  assert.deepEqual(
    parsed?.annotations.map((a) => a.chapter),
    ["Front", "Chapter Two"],
  );
});

void test("PDF highlights stay without chapters when no loader is given", async (t) => {
  const dir = await pdfLibrary(t, "PDF");
  const [parsed] = await loadBooksWithAnnotations(dir);
  assert.deepEqual(parsed?.annotations.map((a) => a.chapter), [undefined, undefined]);
});

void test("the PDF outline is not read for other formats", async (t) => {
  const dir = await pdfLibrary(t, "EPUB");
  const calls = { opened: 0 };
  await loadBooksWithAnnotations(dir, {
    loadPdf: () => Promise.resolve(fakePdfJs(outline, calls)),
  });
  assert.equal(calls.opened, 0);
});
