// Round-trip properties of re-sync, checked across every combination of the
// settings that change how a section is laid out. Each combination runs the
// same story: sync, the user types a comment under a highlight, re-sync, the
// highlight is deleted in Readest, re-sync twice, it comes back. Any setting
// that shifts a line the comment parser keys on breaks one of the checks
// below for that combination, and the failure names it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  optionsFromSettings,
  replaceHighlightsSection,
  upsertAppendedSection,
} from "../src/renderer";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { ReadestSettings } from "../src/settings";
import type { ReadestAnnotation, ReadestLibraryBook } from "../src/types";

const book = {
  hash: "abc123",
  format: "EPUB",
  title: "Book",
  author: "A",
  createdAt: 0,
  updatedAt: 0,
} as unknown as ReadestLibraryBook;

function ann(
  n: number,
  extra: Partial<ReadestAnnotation> = {},
): ReadestAnnotation {
  return {
    id: `id${n}`,
    bookHash: "abc123",
    type: "annotation",
    cfi: `epubcfi(/6/4!/4/${n * 2},/1:0,/1:10)`,
    text: `Highlight ${n}`,
    style: "highlight",
    color: "yellow",
    page: n * 10,
    // Reversed against page order, so sorting by date and by page differ.
    createdAt: 100 - n,
    updatedAt: 100 - n,
    deletedAt: null,
    ...extra,
  };
}

const all = [
  ann(1, { note: "Note one" }),
  ann(2, { note: "Note two", color: "blue" }),
  ann(3),
];
const withoutSecond = [all[0], all[2]] as ReadestAnnotation[];

// A title line, a lazy continuation line and a second paragraph: the three
// shapes a comment parser has to carry through.
const comment = "> [!comment] Title\n> MARK\nLAZY\n\n> SECOND";
const before = "Intro paragraph\n";
const after = "## Later\n\nMy notes\n";

type Layout = Pick<
  ReadestSettings,
  | "highlightStyle"
  | "colorCallouts"
  | "highlightSeparator"
  | "highlightGrouping"
  | "highlightSortOrder"
  | "metadataPlacement"
  | "noteStyle"
  | "showHighlightCount"
  | "readestLink"
  | "readestLinkPlacement"
>;

// Settings that only matter under another one ride along with it, so no
// combination repeats another's output.
function* layouts(): Generator<Layout> {
  const styles = [
    { highlightStyle: "blockquote", colorCallouts: false },
    { highlightStyle: "callout", colorCallouts: false },
    { highlightStyle: "callout", colorCallouts: true },
    { highlightStyle: "plain", colorCallouts: false },
    { highlightStyle: "bullet", colorCallouts: false },
  ] as const;
  const links = [
    { readestLink: "off", readestLinkPlacement: "line" },
    { readestLink: "app", readestLinkPlacement: "line" },
    { readestLink: "app", readestLinkPlacement: "page" },
  ] as const;
  for (const style of styles)
    for (const highlightSeparator of ["rule", "blank", "none"] as const)
      for (const highlightGrouping of ["none", "chapter", "page"] as const)
        for (const highlightSortOrder of ["page", "date"] as const)
          for (const metadataPlacement of ["below", "inline"] as const)
            for (const noteStyle of ["attached", "callout", "separated"] as const)
              for (const showHighlightCount of [false, true])
                for (const link of links)
                  yield {
                    ...style,
                    highlightSeparator,
                    highlightGrouping,
                    highlightSortOrder,
                    metadataPlacement,
                    noteStyle,
                    showHighlightCount,
                    ...link,
                  };
}

function label(layout: Layout, level: number): string {
  return [...Object.values(layout), `h${level}`].join(" ");
}

const count = (s: string, t: string) => s.split(t).length - 1;

type Sync = (existing: string, annotations: ReadestAnnotation[]) => string;

// Returns what went wrong for one combination, empty when it holds.
function story(sync: Sync, start: string, bounded: boolean): string[] {
  const fails: string[] = [];
  const fresh = sync(start, all);
  if (sync(start, all) !== fresh) fails.push("first sync not deterministic");

  const idMatch = /\^(rdst-[a-z0-9-]+)/.exec(
    fresh.slice(fresh.indexOf("Highlight 2")),
  );
  if (!idMatch) return ["no block ID after Highlight 2"];
  const idLine = `^${idMatch[1]}\n`;
  const outside = bounded ? `${fresh.trimEnd()}\n\n${after}` : fresh;
  const edited = outside.replace(idLine, `${idLine}\n${comment}\n`);

  const keep = sync(edited, all);
  const gone = sync(keep, withoutSecond);
  const goneAgain = sync(gone, withoutSecond);
  const back = sync(goneAgain, all);

  if (sync(keep, all) !== keep) fails.push("re-sync changed a synced note");
  if (goneAgain !== gone) fails.push("re-sync after removal changed the note");
  if (back !== keep) fails.push("restored highlight did not restore the note");
  for (const [name, note] of [["keep", keep], ["gone", gone], ["back", back]]) {
    for (const part of ["MARK", "LAZY", "SECOND"]) {
      const n = count(note as string, part);
      if (n !== 1) fails.push(`${name}: ${part} appears ${n} times`);
    }
    if (bounded && !(note as string).startsWith(before)) {
      fails.push(`${name}: text above the section changed`);
    }
    if (bounded && !(note as string).endsWith(after)) {
      fails.push(`${name}: text below the section changed`);
    }
  }
  if (count(keep, "Highlight 3") !== 1) fails.push("Highlight 3 duplicated");

  const removed = gone.slice(gone.indexOf("Removed from Readest"));
  if (!gone.includes("Removed from Readest")) {
    fails.push("removed highlight has no Removed from Readest heading");
  } else {
    if (!removed.includes("Highlight 2")) {
      fails.push("removed comment lost its highlight text");
    }
    for (const leak of ["Highlight 1", "Highlight 3", "Note one", "Total"]) {
      if (bounded && removed.slice(0, removed.indexOf(after)).includes(leak)) {
        fails.push(`removed section holds ${leak}`);
      } else if (!bounded && removed.includes(leak)) {
        fails.push(`removed section holds ${leak}`);
      }
    }
  }
  return fails;
}

function runMatrix(
  levels: number[],
  make: (layout: Layout, level: number) => { sync: Sync; start: string },
): void {
  const failures: string[] = [];
  let combinations = 0;
  for (const layout of layouts()) {
    for (const level of levels) {
      combinations++;
      const { sync, start } = make(layout, level);
      for (const fail of story(sync, start, level > 0)) {
        failures.push(`${label(layout, level)}: ${fail}`);
      }
    }
  }
  assert.ok(combinations > 1000, `matrix shrank to ${combinations}`);
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failures`);
}

function options(layout: Layout, level: number) {
  return optionsFromSettings({
    ...DEFAULT_SETTINGS,
    ...layout,
    highlightBlockIds: true,
    preserveManualEdits: true,
    syncHeadingLevel: level as ReadestSettings["syncHeadingLevel"],
  });
}

void test("sync keeps a comment through re-sync, removal and return", () => {
  runMatrix([0, 2], (layout, level) => {
    const opts = options(layout, level);
    return {
      sync: (x, a) => replaceHighlightsSection(x, book, a, opts),
      start: level > 0 ? before : "",
    };
  });
});

void test("append keeps a comment through re-append, removal and return", () => {
  runMatrix([2, 3], (layout, level) => {
    const opts = options(layout, level);
    return {
      sync: (x, a) => upsertAppendedSection(x, "Highlights - Book", a, opts),
      start: before,
    };
  });
});
