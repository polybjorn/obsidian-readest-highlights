import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTemplate,
  bookFilename,
  renderBookNote,
  renderFrontmatter,
  renderHighlightsBody,
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
  showHighlightCount: false,
  collapseHighlightLineBreaks: false,
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
    genreFormat: "plain",
    cleanGenres: true,
    uninvertGenres: false,
    maxGenres: 0,
    includeReadestHash: false,
    extra: "",
  },
};

const makeAnnotation = (
  id: string,
  overrides: Partial<ReadestAnnotation> = {},
): ReadestAnnotation => ({
  bookHash: "abc123",
  id,
  type: "annotation",
  page: 1,
  text: `text ${id}`,
  style: "highlight",
  color: "yellow",
  note: "",
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  ...overrides,
});

// --- template and filename helpers ---

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

void test("bookFilename falls back to hash when the title is all forbidden chars", () => {
  const allForbidden = { ...book, title: "<:>" };
  assert.equal(bookFilename(allForbidden, "{title}"), `${book.hash}.md`);
});

void test("bookFilename caps the name to a safe byte length", () => {
  const longTitle = { ...book, title: "あ".repeat(300) };
  const name = bookFilename(longTitle, "{title}");
  const bytes = new TextEncoder().encode(name).length;
  assert.ok(bytes <= 255, `filename is ${bytes} bytes, expected <= 255`);
  assert.match(name, /\.md$/);
});

// --- appended section helpers ---

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

// --- replace highlights section ---

void test("replaceHighlightsSection preserves content above heading", () => {
  const existing =
    "# Top\n\nmanual intro text\n\n## Highlights\n\n- old\n\n## Notes\n\nkept\n";
  const annotations = [
    makeAnnotation("1", { page: 10, text: "new quote" }),
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
  const annotations = [makeAnnotation("1", { text: "new", color: null })];
  const out = replaceHighlightsSection(existing, book, annotations, opts);
  assert.match(out, /## Highlights of the chapter/);
  assert.match(out, /my own words/);
});

// --- highlight count line ---

void test("showHighlightCount renders the count line under the heading", () => {
  const annos = [makeAnnotation("1"), makeAnnotation("2"), makeAnnotation("3")];
  const out = renderBookNote(
    { book, annotations: annos },
    { ...opts, showHighlightCount: true },
  );
  assert.match(out, /## Highlights\n\nTotal highlights: 3\n\n>/);
});

void test("showHighlightCount is omitted when there are no annotations", () => {
  const out = renderBookNote(
    { book, annotations: [] },
    { ...opts, showHighlightCount: true },
  );
  assert.doesNotMatch(out, /Total highlights:/);
});

void test("showHighlightCount disabled does not insert a count line", () => {
  const out = renderBookNote(
    { book, annotations: [makeAnnotation("1"), makeAnnotation("2")] },
    { ...opts, showHighlightCount: false },
  );
  assert.doesNotMatch(out, /Total highlights:/);
});

void test("replaceHighlightsSection includes the count line when enabled", () => {
  const existing = "## Highlights\n\n- old\n";
  const annos = [makeAnnotation("1"), makeAnnotation("2")];
  const out = replaceHighlightsSection(existing, book, annos, {
    ...opts,
    showHighlightCount: true,
  });
  assert.match(out, /## Highlights\n\nTotal highlights: 2\n\n>/);
});

// --- frontmatter ---

void test("renderFrontmatter returns empty string when disabled", () => {
  assert.equal(renderFrontmatter(book, opts.frontmatter), "");
});

void test("renderFrontmatter writes tags, author, year, isbn, series", () => {
  const out = renderFrontmatter(book, {
    ...opts.frontmatter,
    enabled: true,
    tags: ["Book", "Fantasy"],
    authorFormat: "plain",
    includeYear: true,
    includeIsbn: true,
    includeSeries: true,
  });
  assert.match(out, /^---$/m);
  assert.match(out, /tags:\n {2}- "Book"\n {2}- "Fantasy"/);
  assert.match(out, /author: "Patrick Rothfuss"/);
  assert.match(out, /year: 2007/);
  assert.match(out, /isbn: "9780756404741"/);
  assert.match(out, /series: "Kingkiller Chronicle"/);
});

void test("renderFrontmatter wraps author in wikilink format", () => {
  const out = renderFrontmatter(book, {
    ...opts.frontmatter,
    enabled: true,
    authorFormat: "wikilink",
  });
  assert.match(out, /author: "\[\[Patrick Rothfuss\]\]"/);
});

// --- renderBookNote composition ---

void test("renderBookNote composes frontmatter + heading + body with trailing newline", () => {
  const out = renderBookNote(
    { book, annotations: [makeAnnotation("1", { text: "quote" })] },
    {
      ...opts,
      frontmatter: { ...opts.frontmatter, enabled: true, authorFormat: "plain" },
    },
  );
  assert.match(out, /^---\n/);
  assert.match(out, /author: "Patrick Rothfuss"/);
  assert.match(out, /---\n\n## Highlights\n\n> quote/);
  assert.ok(out.endsWith("\n"), "output should end with a newline");
});

// --- renderHighlightsBody separators ---

void test("renderHighlightsBody pageHeading separator groups annotations under page headings", () => {
  const annos = [
    makeAnnotation("a", { page: 1, text: "first on page 1" }),
    makeAnnotation("b", { page: 1, text: "second on page 1" }),
    makeAnnotation("c", { page: 5, text: "on page 5" }),
  ];
  const out = renderHighlightsBody(annos, {
    ...opts,
    separator: "pageHeading",
    showPage: false,
  });
  assert.match(out, /### Page 1/);
  assert.match(out, /### Page 5/);
  assert.ok(
    out.indexOf("### Page 1") < out.indexOf("### Page 5"),
    "page 1 should appear before page 5",
  );
});

void test("renderHighlightsBody rule separator inserts --- between annotations", () => {
  const out = renderHighlightsBody(
    [
      makeAnnotation("a", { text: "first" }),
      makeAnnotation("b", { text: "second" }),
    ],
    { ...opts, separator: "rule", showPage: false },
  );
  assert.match(out, /first\n\n---\n\n> second/);
});

// --- highlight style variants ---

void test("highlightStyle bullet uses '- ' prefix", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote text" })],
    { ...opts, style: "bullet", showPage: false },
  );
  assert.match(out, /^- quote text/m);
});

void test("highlightStyle callout wraps text in > [!quote] block", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote text" })],
    { ...opts, style: "callout", showPage: false },
  );
  assert.match(out, /> \[!quote\]/);
  assert.match(out, /> quote text/);
});

// --- note placement and metadata ---

void test("noteStyle callout renders notes in a separate > [!note] block", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", note: "my thought" })],
    { ...opts, noteStyle: "callout", showPage: false },
  );
  assert.match(out, /> \[!note\]/);
  assert.match(out, /> my thought/);
});

void test("noteStyle separated places notes after the highlight as **Note:**", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", note: "my thought" })],
    { ...opts, noteStyle: "separated", showPage: false },
  );
  assert.match(out, /> quote\n\n\*\*Note:\*\* my thought/);
});

void test("metadataPlacement inline appends metadata to the last text line", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", page: 42 })],
    { ...opts, metadataPlacement: "inline", showPage: true },
  );
  assert.match(out, /> quote \*\(page 42\)\*/);
});

// --- grouping resilience ---

void test("two distinct highlights sharing a cfi both survive", () => {
  const out = renderHighlightsBody(
    [
      makeAnnotation("a", { text: "first selection", cfi: "epubcfi(/6/4!/4)" }),
      makeAnnotation("b", { text: "second selection", cfi: "epubcfi(/6/4!/4)" }),
    ],
    { ...opts, separator: "blank", showPage: false },
  );
  assert.match(out, /first selection/);
  assert.match(out, /second selection/);
});

void test("a note record with no text merges into its highlight at the same cfi", () => {
  const out = renderHighlightsBody(
    [
      makeAnnotation("hl", { text: "the passage", cfi: "epubcfi(/6/4!/8)", note: "" }),
      makeAnnotation("nt", { text: "", cfi: "epubcfi(/6/4!/8)", note: "my thought" }),
    ],
    { ...opts, noteStyle: "separated", showPage: false },
  );
  assert.match(out, /> the passage/);
  assert.match(out, /\*\*Note:\*\* my thought/);
  // One merged entry, not a stray empty highlight for the note record.
  assert.equal((out.match(/the passage/g) ?? []).length, 1);
});

void test("an underline at a shared cfi does not underline a distinct highlight", () => {
  const out = renderHighlightsBody(
    [
      makeAnnotation("h", { text: "plain highlight", cfi: "epubcfi(/6/4!/12)" }),
      makeAnnotation("u", {
        text: "underlined bit",
        cfi: "epubcfi(/6/4!/12)",
        style: "underline",
      }),
    ],
    { ...opts, renderUnderlines: true, showPage: false },
  );
  assert.match(out, /> plain highlight/);
  assert.doesNotMatch(out, /<u>plain highlight<\/u>/);
  assert.match(out, /<u>underlined bit<\/u>/);
});

void test("a textless, noteless bookmark renders nothing", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("bm", { type: "bookmark", text: "", note: "", style: null })],
    { ...opts },
  );
  assert.equal(out, "");
});

void test("renderFrontmatter escapes newlines in metadata values", () => {
  const messy = {
    ...book,
    metadata: { ...book.metadata, series: 'Foo"\ninjected: bar' },
  };
  const out = renderFrontmatter(messy, {
    ...opts.frontmatter,
    enabled: true,
    includeSeries: true,
  });
  assert.match(out, /series: "Foo\\"\\ninjected: bar"/);
  // The injected break must not become its own physical line / key.
  assert.doesNotMatch(out, /^injected: bar/m);
});

// --- multi-line notes stay inside wrapped styles ---

void test("a multi-line attached note stays inside a blockquote highlight", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", note: "line one\nline two" })],
    { ...opts, style: "blockquote", noteStyle: "attached", showPage: false },
  );
  for (const line of out.split("\n")) {
    assert.ok(line.startsWith(">"), `line escaped the blockquote: "${line}"`);
  }
  assert.match(out, /> \*\*Note:\*\* line one\n> line two/);
});

void test("a multi-line attached note stays inside a callout highlight", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", note: "line one\nline two" })],
    { ...opts, style: "callout", noteStyle: "attached", showPage: false },
  );
  for (const line of out.split("\n")) {
    assert.ok(line.startsWith(">"), `line escaped the callout: "${line}"`);
  }
});

void test("note whitespace is normalized per line, breaks kept", () => {
  const out = renderHighlightsBody(
    [makeAnnotation("a", { text: "quote", note: "one\t two\n\n  three  " })],
    { ...opts, noteStyle: "separated", showPage: false },
  );
  assert.match(out, /\*\*Note:\*\* one two\nthree/);
});

// --- fenced code blocks are not section boundaries ---

void test("replaceHighlightsSection ignores a heading inside a code fence", () => {
  const existing =
    "```\n## Highlights\nfenced\n```\n\n## Highlights\n\n- old\n\n## Notes\n\nkept\n";
  const out = replaceHighlightsSection(
    existing,
    book,
    [makeAnnotation("1", { text: "new quote" })],
    opts,
  );
  assert.match(out, /```\n## Highlights\nfenced\n```/);
  assert.match(out, /new quote/);
  assert.match(out, /kept/);
  assert.doesNotMatch(out, /- old/);
});

void test("replaceHighlightsSection does not end the section at a fenced heading", () => {
  const existing =
    "## Highlights\n\n- old\n\n```\n# not a heading\n```\n\n- old too\n\n## Notes\n\nkept\n";
  const out = replaceHighlightsSection(
    existing,
    book,
    [makeAnnotation("1", { text: "new quote" })],
    opts,
  );
  assert.doesNotMatch(out, /- old too/);
  assert.match(out, /## Notes/);
  assert.match(out, /kept/);
});

void test("upsertAppendedSection ignores a heading inside a code fence", () => {
  const existing = "```\n## Book\n```\n\nprose\n";
  const out = upsertAppendedSection(existing, "Book", "- quote", 2);
  assert.match(out, /```\n## Book\n```/);
  assert.match(out, /prose/);
  assert.match(out, /## Book\n\n- quote/);
});
