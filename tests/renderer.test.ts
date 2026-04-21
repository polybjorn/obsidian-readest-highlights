import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTemplate,
  bookFilename,
  replaceHighlightsSection,
  upsertAppendedSection,
} from "../src/renderer";
import type { ReadestAnnotation, ReadestLibraryBook } from "../src/types";
import type { RenderOptions } from "../src/renderer";

const book: ReadestLibraryBook = {
  hash: "abc123",
  format: "epub",
  title: "The Name of the Wind",
  author: "Patrick Rothfuss",
  createdAt: 0,
  metadata: {
    published: "2007-03-27",
    isbn: "9780756404741",
    series: "Kingkiller Chronicle",
    seriesIndex: 1,
  },
};

const opts: RenderOptions = {
  style: "blockquote",
  separator: "rule",
  showPage: true,
  showColor: false,
  renderUnderlines: true,
  metadataPlacement: "below",
  showNotes: true,
  noteStyle: "attached",
  filenameTemplate: "{title} - {author}",
  syncHeadingTemplate: "Highlights",
  syncHeadingLevel: 2,
  frontmatter: {
    enabled: false,
    tags: [],
    authorFormat: "off",
    includeYear: false,
    includeIsbn: false,
    includeSeries: false,
    includeGenre: false,
    includeReadestHash: false,
    extra: "",
  },
};

void test("applyTemplate replaces tokens", () => {
  assert.equal(
    applyTemplate("{title} by {author}", book),
    "The Name of the Wind by Patrick Rothfuss",
  );
});

void test("applyTemplate drops trailing 'by' when author missing", () => {
  const noAuthor = { ...book, author: undefined, metadata: {} };
  assert.equal(applyTemplate("{title} by {author}", noAuthor), "The Name of the Wind");
});

void test("bookFilename sanitizes forbidden chars", () => {
  const dirty = { ...book, title: "A/B:C*D?E" };
  assert.equal(bookFilename(dirty, "{title}"), "ABCDE.md");
});

void test("upsertAppendedSection is idempotent", () => {
  const existing = "Intro\n";
  const body = "- quote one";
  const once = upsertAppendedSection(existing, "Highlights - Book", body, 2);
  const twice = upsertAppendedSection(once, "Highlights - Book", body, 2);
  assert.equal(once, twice);
});

void test("upsertAppendedSection respects heading level", () => {
  const out = upsertAppendedSection("Intro\n", "Sub", "body", 3);
  assert.match(out, /^### Sub$/m);
});

void test("replaceHighlightsSection preserves content above heading", () => {
  const existing =
    "# Top\n\nmanual intro text\n\n## Highlights\n\n- old\n\n## Notes\n\nkept\n";
  const annotations: ReadestAnnotation[] = [
    {
      bookHash: "abc123",
      id: "1",
      type: "annotation",
      page: 10,
      text: "new quote",
      style: "highlight",
      color: "yellow",
      note: "",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
  ];
  const out = replaceHighlightsSection(existing, book, annotations, opts);
  assert.match(out, /# Top/);
  assert.match(out, /manual intro text/);
  assert.match(out, /new quote/);
  assert.match(out, /## Notes/);
  assert.match(out, /kept/);
  assert.doesNotMatch(out, /- old/);
});

void test("replaceHighlightsSection anchors on exact heading line", () => {
  const existing =
    "## Highlights of the chapter\n\nmy own words\n\n## Highlights\n\n- old\n";
  const annotations: ReadestAnnotation[] = [
    {
      bookHash: "abc123",
      id: "1",
      type: "annotation",
      page: 1,
      text: "new",
      style: "highlight",
      color: null,
      note: "",
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    },
  ];
  const out = replaceHighlightsSection(existing, book, annotations, opts);
  assert.match(out, /## Highlights of the chapter/);
  assert.match(out, /my own words/);
});
