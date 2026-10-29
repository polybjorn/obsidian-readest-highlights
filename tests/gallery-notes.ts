// The sample book and settings variations behind docs/gallery: one note per
// settings area, each a complete note as a sync would write it, so the
// rendered look can be compared in Obsidian where the unit tests only check
// text. Regenerate with `npm run gallery`; gallery.test.ts fails when the
// committed notes drift from this file.
import {
  optionsFromSettings,
  renderBookNote,
  renderFrontmatter,
  renderHighlightsBody,
} from "../src/renderer";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { ReadestSettings } from "../src/settings";
import type { ReadestAnnotation, ReadestLibraryBook } from "../src/types";

export const book: ReadestLibraryBook = {
  hash: "gallery0book0hash",
  format: "EPUB",
  title: "The Book of Tea",
  author: "Kakuzo Okakura",
  createdAt: 0,
  metadata: {
    published: "1906",
    publisher: "Fox, Duffield & Company",
    language: "en",
    subject: ["Tea", "Japan -- Social life and customs"],
  },
};

const CH1 = "I. The Cup of Humanity";
const CH2 = "II. The Schools of Tea";

let seq = 0;
const anno = (
  page: number,
  chapter: string,
  text: string,
  extra: Partial<ReadestAnnotation> = {},
): ReadestAnnotation => {
  seq += 1;
  return {
    bookHash: book.hash,
    id: `g${seq}`,
    type: "annotation",
    cfi: `epubcfi(/6/${seq * 2}!/4/2)`,
    page,
    chapter,
    text,
    style: "highlight",
    color: "green",
    note: "",
    createdAt: seq * 1000,
    updatedAt: seq * 1000,
    deletedAt: null,
    ...extra,
  };
};

// Covers every predefined color plus a custom hex, an underline, a squiggly
// underline, a multi-line highlight, single and multi-line notes, two
// highlights on one page, and two chapters.
const annotations: ReadestAnnotation[] = [
  anno(3, CH1, "Tea began as a medicine and grew into a beverage."),
  anno(
    3,
    CH1,
    "Teaism is a cult founded on the adoration of the beautiful among the sordid facts of everyday existence.",
  ),
  anno(4, CH1, "the queen of the Camelias", {
    color: "yellow",
    note: "A short note on a yellow highlight.",
  }),
  anno(
    5,
    CH1,
    "Perhaps we reveal ourselves too much in small things because we have so little of the great to hide.",
    { color: "red", style: "underline" },
  ),
  anno(6, CH1, "the ethereal aroma", { color: "#8e44ad" }),
  anno(
    10,
    CH2,
    "The tea-plant, a native of southern China, was known from very early times to Chinese botany and medicine.",
    { color: "green", style: "squiggly" },
  ),
  anno(
    12,
    CH2,
    "Tea is a work of art and needs a master hand to bring out its noblest qualities.\nWe have good and bad tea, as we have good and bad paintings.",
    { color: "blue" },
  ),
  // Created first, so date order differs visibly from page order.
  anno(13, CH2, "the gentle arts of peace", {
    color: "violet",
    note: "A note over two lines.\nThe second line.",
    createdAt: 0,
  }),
];

// Plugin defaults, except that the notes are tagged for the gallery instead of
// joining book queries, keep genres out of tags, and carry no Readest hash, so
// a sync can never mistake one for a real book's note.
const base: ReadestSettings = {
  ...DEFAULT_SETTINGS,
  frontmatterTags: "readest-gallery",
  genreDestination: "genre",
  includeReadestHash: false,
};

type Variant = [title: string, settings: Partial<ReadestSettings>];

// One note, one frontmatter, then one section per variant, each changing the
// defaults by the settings it names.
function variantsNote(intro: string, variants: Variant[]): string {
  const frontmatter = renderFrontmatter(
    book,
    optionsFromSettings(base).frontmatter,
  );
  const sections = variants.map(([title, settings]) => {
    const body = renderHighlightsBody(
      annotations,
      optionsFromSettings({ ...base, ...settings }),
    );
    return `## ${title}\n\n${body}`;
  });
  return `${frontmatter}\n\n${intro}\n\n${sections.join("\n\n")}\n`;
}

const fullNote = (settings: Partial<ReadestSettings>) =>
  renderBookNote(
    { book, annotations },
    optionsFromSettings({ ...base, ...settings }),
  );

export function galleryNotes(): Record<string, string> {
  return {
    "1 Defaults.md": fullNote({ showHighlightCount: true }),
    "2 Styles.md": variantsNote("Rendering > Highlights > Style.", [
      ["Bullet (default)", {}],
      ["Blockquote", { highlightStyle: "blockquote" }],
      ["Callout", { highlightStyle: "callout" }],
      ["Plain text", { highlightStyle: "plain" }],
    ]),
    "3 Callout colors.md": variantsNote(
      "Style Callout with Callout per color, which takes the colors from the plugin's stylesheet. The gray callout is a custom hex color, which keeps the plain quote type.",
      [
        ["Callout per color on", { highlightStyle: "callout", colorCallouts: true }],
        ["Callout per color off", { highlightStyle: "callout" }],
      ],
    ),
    "4 Separators.md": variantsNote(
      "Rendering > Highlights > Separator. None drops the gap where the style can share a block, so it is shown per style; plain text has none to share and renders as with Blank line.",
      [
        ["Blank line (default)", {}],
        ["Horizontal rule", { highlightSeparator: "rule" }],
        ["None, bullet", { highlightSeparator: "none" }],
        ["None, blockquote", { highlightSeparator: "none", highlightStyle: "blockquote" }],
        ["None, plain text", { highlightSeparator: "none", highlightStyle: "plain" }],
        [
          "None, callout per color",
          { highlightSeparator: "none", highlightStyle: "callout", colorCallouts: true },
        ],
      ],
    ),
    "5 Metadata.md": variantsNote("Page number, color, underlines and line breaks.", [
      ["Page below (default)", {}],
      ["Page inline", { metadataPlacement: "inline" }],
      ["Page and color", { showColor: true }],
      ["No page", { showPage: false }],
      ["Underlines not rendered", { renderUnderlines: false }],
      ["Line breaks collapsed", { collapseHighlightLineBreaks: true }],
    ]),
    "6 Notes.md": variantsNote("How a note attached to a highlight renders.", [
      ["Attached (default)", {}],
      ["Separated", { noteStyle: "separated" }],
      ["Callout", { noteStyle: "callout" }],
      ["Notes off", { showNotes: false }],
    ]),
    "7 Grouping and sort.md": variantsNote("Group by and Sort order.", [
      ["Page headings", { highlightGrouping: "page" }],
      ["Chapter headings", { highlightGrouping: "chapter" }],
      ["Sorted by date", { highlightSortOrder: "date" }],
    ]),
    "8 Links and block IDs.md": variantsNote(
      "Block IDs make each highlight linkable as `[[note#^id]]`; the Readest link opens the highlight in Readest.",
      [
        ["Block IDs", { highlightBlockIds: true }],
        ["Readest link, web", { readestLink: "web" }],
        ["Readest link, app", { readestLink: "app" }],
      ],
    ),
    "9 Frontmatter plain.md": fullNote({
      authorFormat: "plain",
      publisherFormat: "plain",
      includeLanguage: true,
    }),
    "10 Frontmatter wikilinks.md": fullNote({
      authorFormat: "wikilink",
      publisherFormat: "wikilink",
      genreFormat: "wikilink",
      includeLanguage: true,
    }),
  };
}
