import type { ParsedBook, ReadestAnnotation, ReadestLibraryBook } from "./types";
import type {
  GenreFormat,
  HeadingLevel,
  HighlightSeparator,
  HighlightSortOrder,
  HighlightStyle,
  LinkFormat,
  MetadataPlacement,
  NoteStyle,
  ReadestSettings,
} from "./settings";

export interface FrontmatterOptions {
  enabled: boolean;
  tags: string[];
  authorFormat: "off" | "plain" | "wikilink";
  includeYear: boolean;
  includeIsbn: boolean;
  seriesFormat: "off" | LinkFormat;
  publisherFormat: "off" | LinkFormat;
  includeLanguage: boolean;
  includeGenre: boolean;
  genreFormat: GenreFormat;
  cleanGenres: boolean;
  uninvertGenres: boolean;
  maxGenres: number;
  includeReadestHash: boolean;
  extra: string;
}

export interface RenderOptions {
  style: HighlightStyle;
  separator: HighlightSeparator;
  sortOrder: HighlightSortOrder;
  showPage: boolean;
  showColor: boolean;
  showHighlightCount: boolean;
  collapseHighlightLineBreaks: boolean;
  renderUnderlines: boolean;
  metadataPlacement: MetadataPlacement;
  showNotes: boolean;
  noteStyle: NoteStyle;
  filenameTemplate: string;
  syncHeadingTemplate: string;
  syncHeadingLevel: HeadingLevel;
  frontmatter: FrontmatterOptions;
}

function splitCSV(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function optionsFromSettings(s: ReadestSettings): RenderOptions {
  return {
    style: s.highlightStyle,
    separator: s.highlightSeparator,
    sortOrder: s.highlightSortOrder,
    showPage: s.showPage,
    showColor: s.showColor,
    showHighlightCount: s.showHighlightCount,
    collapseHighlightLineBreaks: s.collapseHighlightLineBreaks,
    renderUnderlines: s.renderUnderlines,
    metadataPlacement: s.metadataPlacement,
    showNotes: s.showNotes,
    noteStyle: s.noteStyle,
    filenameTemplate: s.filenameTemplate,
    syncHeadingTemplate: s.syncHeadingTemplate,
    syncHeadingLevel: s.syncHeadingLevel,
    frontmatter: {
      enabled: s.includeFrontmatter,
      tags: splitCSV(s.frontmatterTags),
      authorFormat: s.authorFormat,
      includeYear: s.includeYear,
      includeIsbn: s.includeIsbn,
      seriesFormat: s.seriesFormat,
      publisherFormat: s.publisherFormat,
      includeLanguage: s.includeLanguage,
      includeGenre: s.includeGenre,
      genreFormat: s.genreFormat,
      cleanGenres: s.cleanGenres,
      uninvertGenres: s.uninvertGenres,
      maxGenres: s.maxGenres,
      includeReadestHash: s.includeReadestHash,
      extra: s.extraFrontmatter,
    },
  };
}

function pickLocalized(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const m = v as Record<string, unknown>;
    const preferred = m["en-US"] ?? m["en"];
    if (typeof preferred === "string") return preferred;
    for (const [k, val] of Object.entries(m)) {
      if (k !== "null" && typeof val === "string") return val;
    }
    for (const val of Object.values(m)) {
      if (typeof val === "string") return val;
    }
  }
  return "";
}

function authorName(book: ReadestLibraryBook): string {
  const meta = book.metadata?.author;
  if (typeof meta === "string") return meta;
  if (meta && typeof meta === "object") {
    const name = pickLocalized(meta.name);
    if (name) return name;
  }
  return book.author ?? "";
}

function cleanLcshHeading(s: string): string {
  let out = s.split(/\s+--\s+/)[0] ?? s;
  out = out.replace(/\s*\([^)]*\)\s*$/, "");
  return out.trim();
}

function uninvertHeading(s: string): string {
  const split = s.match(/^(.+?)(\s+--\s+.*)$/);
  const main = split?.[1] ?? s;
  const decorator = split?.[2] ?? "";
  const m = main.match(/^([^,]+),\s+(.+)$/);
  if (!m) return s;
  const head = m[1];
  const tail = m[2];
  if (!head || !tail) return s;
  return `${tail} ${head}${decorator}`;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    if (!x) continue;
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function subjectList(book: ReadestLibraryBook): string[] {
  const s = book.metadata?.subject;
  if (!s) return [];
  const arr = Array.isArray(s) ? s : [s];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      if (item.trim()) out.push(item.trim());
    } else if (item && typeof item === "object") {
      const name = pickLocalized(item.name);
      if (name) out.push(name);
    }
  }
  return out;
}

// Epub metadata allows multiple languages; Readest passes that through as an
// array. Render one value, comma-joined when there are several.
function languageValue(book: ReadestLibraryBook): string {
  const l = book.metadata?.language;
  const list = Array.isArray(l) ? l : [l];
  return list
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .join(", ");
}

function publishedYear(book: ReadestLibraryBook): string {
  const p = book.metadata?.published;
  if (!p) return "";
  const m = p.match(/^(\d{4})/);
  return m && m[1] ? m[1] : "";
}

function sanitizeFilenamePart(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

// Trims a name so its UTF-8 byte length stays under the budget. Most filesystems
// cap a name at 255 bytes, not characters, so a char-based slice overflows on
// multibyte (Norwegian, CJK, emoji) titles.
function capFilenameBytes(name: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(name).length <= maxBytes) return name;
  let out = name;
  while (out.length > 0 && encoder.encode(out).length > maxBytes) {
    out = out.slice(0, -1);
  }
  return out.trim();
}

function tokenMap(book: ReadestLibraryBook): Record<string, string> {
  return {
    title: book.title ?? "",
    author: authorName(book),
    year: publishedYear(book),
    series: book.metadata?.series ?? "",
    seriesIndex:
      book.metadata?.seriesIndex !== undefined
        ? String(book.metadata.seriesIndex)
        : "",
    isbn: book.metadata?.isbn ?? "",
    hash: book.hash,
  };
}

export function applyTemplate(
  template: string,
  book: ReadestLibraryBook,
): string {
  const tokens = tokenMap(book);
  let out = template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => tokens[key] ?? "",
  );
  out = out.replace(/\s+/g, " ");
  out = out.replace(/\s*[-_]\s*$/g, "").replace(/^\s*[-_]\s*/, "");
  out = out.replace(/\(\s*\)|\[\s*\]/g, "").trim();
  out = out.replace(/\bby\s*$/i, "").trim();
  return out;
}

export function bookFilename(
  book: ReadestLibraryBook,
  template: string,
): string {
  const rendered = applyTemplate(template, book) || book.title || book.hash;
  // Fall back *after* sanitizing: a title of only forbidden chars (e.g. "<:>")
  // sanitizes to empty, which would otherwise yield a bare ".md".
  const sanitized =
    sanitizeFilenamePart(rendered) ||
    sanitizeFilenamePart(book.title ?? "") ||
    book.hash;
  // Cap under the common 255-byte filename limit, leaving room for ".md" and a
  // possible " (xxxxxxxx)" collision suffix.
  const capped = capFilenameBytes(sanitized, 240);
  return `${capped}.md`;
}

function cleanText(text: string, collapseLineBreaks: boolean): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join(collapseLineBreaks ? " " : "\n");
}

interface GroupedAnnotation {
  key: string;
  text: string;
  page?: number;
  colors: Set<string>;
  styles: Set<string>;
  notes: string[];
  earliestCreatedAt: number;
}

function groupAnnotations(
  annotations: ReadestAnnotation[],
  opts: Pick<RenderOptions, "collapseHighlightLineBreaks" | "sortOrder">,
): GroupedAnnotation[] {
  // Records are grouped by location (cfi, falling back to page) so a highlight
  // and a separate note/color/style record at the same spot render as one
  // entry. But two *distinct* highlights can share a cfi; merging blindly by
  // location would let the first text win and silently drop the second. So we
  // only merge into a group when the text matches or one side has no text (a
  // note/style attachment). Different non-empty text at the same location stays
  // a separate entry.
  const byLocation = new Map<string, GroupedAnnotation[]>();
  const order: GroupedAnnotation[] = [];

  for (const a of annotations) {
    const cleaned = cleanText(a.text ?? "", opts.collapseHighlightLineBreaks);
    const location = a.cfi ?? `p${a.page ?? 0}`;
    const groups = byLocation.get(location) ?? [];
    const target = groups.find(
      (g) => g.text === cleaned || cleaned === "" || g.text === "",
    );
    // Notes keep their line breaks (collapse only applies to highlight text)
    // but get the same per-line whitespace normalization.
    const note = cleanText(a.note ?? "", false);
    if (target) {
      if (!target.text && cleaned) target.text = cleaned;
      if (target.page === undefined && a.page !== undefined) target.page = a.page;
      if (a.color) target.colors.add(a.color);
      if (a.style) target.styles.add(a.style);
      if (note) target.notes.push(note);
      target.earliestCreatedAt = Math.min(
        target.earliestCreatedAt,
        a.createdAt,
      );
    } else {
      const group: GroupedAnnotation = {
        key: location,
        text: cleaned,
        page: a.page,
        colors: new Set(a.color ? [a.color] : []),
        styles: new Set(a.style ? [a.style] : []),
        notes: note ? [note] : [],
        earliestCreatedAt: a.createdAt,
      };
      groups.push(group);
      byLocation.set(location, groups);
      order.push(group);
    }
  }

  return order
    // Drop records with nothing to show (e.g. textless bookmarks); a note-only
    // record keeps its note, so only empty-and-noteless groups are removed.
    .filter((g) => g.text.length > 0 || g.notes.length > 0)
    .sort((x, y) => {
      if (opts.sortOrder === "date") {
        if (x.earliestCreatedAt !== y.earliestCreatedAt) {
          return x.earliestCreatedAt - y.earliestCreatedAt;
        }
        return (x.page ?? 0) - (y.page ?? 0);
      }
      const pa = x.page ?? 0;
      const pb = y.page ?? 0;
      if (pa !== pb) return pa - pb;
      return x.earliestCreatedAt - y.earliestCreatedAt;
    });
}

function metadataParts(
  g: GroupedAnnotation,
  opts: RenderOptions,
): string[] {
  const meta: string[] = [];
  if (opts.showPage && g.page !== undefined && opts.separator !== "pageHeading") {
    meta.push(`page ${g.page}`);
  }
  if (opts.showColor) {
    for (const c of g.colors) meta.push(c);
  }
  return meta;
}

function wrapStyle(
  textLines: string[],
  extras: string[],
  style: HighlightStyle,
): string {
  // An extra (e.g. an attached multi-line note) can span lines; every line
  // needs the style prefix or it escapes the blockquote/callout/bullet.
  const extraLines = extras.flatMap((e) => e.split("\n"));
  switch (style) {
    case "blockquote": {
      const out = textLines.map((l) => `> ${l}`);
      if (extraLines.length) {
        out.push(">");
        for (const e of extraLines) out.push(`> ${e}`);
      }
      return out.join("\n");
    }
    case "callout": {
      const out = ["> [!quote]"];
      for (const l of textLines) out.push(`> ${l}`);
      if (extraLines.length) {
        out.push(">");
        for (const e of extraLines) out.push(`> ${e}`);
      }
      return out.join("\n");
    }
    case "bullet": {
      const out = [`- ${textLines[0] ?? ""}`];
      for (let i = 1; i < textLines.length; i++) out.push(`  ${textLines[i]}`);
      for (const e of extraLines) out.push(`  ${e}`);
      return out.join("\n");
    }
    case "plain": {
      const out = [textLines.join("\n")];
      if (extras.length) out.push(extras.join("\n"));
      return out.join("\n\n");
    }
  }
}

function renderGroup(g: GroupedAnnotation, opts: RenderOptions): string {
  const text =
    opts.renderUnderlines && g.styles.has("underline")
      ? `<u>${g.text}</u>`
      : g.text;
  const textLines = text.split("\n");
  const parts = metadataParts(g, opts);
  const metaBelow = parts.length ? `*${parts.join(" · ")}*` : null;
  const metaInline = parts.length ? ` *(${parts.join(" · ")})*` : "";

  const notesText =
    opts.showNotes && g.notes.length ? g.notes.join(" / ") : null;

  if (opts.metadataPlacement === "inline" && metaInline && textLines.length) {
    textLines[textLines.length - 1] = textLines[textLines.length - 1] + metaInline;
  }

  const innerExtras: string[] = [];
  if (opts.metadataPlacement === "below" && metaBelow) {
    innerExtras.push(metaBelow);
  }
  if (notesText && opts.noteStyle === "attached") {
    innerExtras.push(`**Note:** ${notesText}`);
  }

  const highlight = wrapStyle(textLines, innerExtras, opts.style);

  if (!notesText || opts.noteStyle === "attached") return highlight;

  if (opts.noteStyle === "callout") {
    const noteLines = notesText.split("\n").map((l) => `> ${l}`);
    return `${highlight}\n\n> [!note]\n${noteLines.join("\n")}`;
  }

  return `${highlight}\n\n**Note:** ${notesText}`;
}

function joinWithSeparator(
  parts: string[],
  separator: HighlightSeparator,
): string {
  switch (separator) {
    case "rule":
      return parts.join("\n\n---\n\n");
    case "blank":
      return parts.join("\n\n");
    case "none":
      return parts.join("\n");
    case "pageHeading":
      return parts.join("\n\n");
  }
}

export function renderHighlightsBody(
  annotations: ReadestAnnotation[],
  opts: RenderOptions,
): string {
  const groups = groupAnnotations(annotations, opts);
  if (groups.length === 0) return "";

  if (opts.separator === "pageHeading") {
    const byPage = new Map<number, GroupedAnnotation[]>();
    for (const g of groups) {
      const p = g.page ?? 0;
      const arr = byPage.get(p) ?? [];
      arr.push(g);
      byPage.set(p, arr);
    }
    const sections: string[] = [];
    for (const [page, groupsOnPage] of [...byPage.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const heading = `### Page ${page}`;
      const body = groupsOnPage
        .map((g) => renderGroup(g, opts))
        .join("\n\n");
      sections.push(`${heading}\n\n${body}`);
    }
    return sections.join("\n\n");
  }

  return joinWithSeparator(
    groups.map((g) => renderGroup(g, opts)),
    opts.separator,
  );
}

export function renderFrontmatter(
  book: ReadestLibraryBook,
  fm: FrontmatterOptions,
): string {
  if (!fm.enabled) return "";
  const author = authorName(book);
  const year = publishedYear(book);
  const isbn = book.metadata?.isbn ?? "";
  const series = book.metadata?.series ?? "";
  const publisher = pickLocalized(book.metadata?.publisher);
  const language = languageValue(book);
  const subjects = subjectList(book);

  const lines: string[] = ["---"];

  if (fm.tags.length) {
    lines.push("tags:");
    for (const t of fm.tags) lines.push(`  - "${yamlQuote(t)}"`);
  }

  if (fm.authorFormat !== "off" && author) {
    lines.push(`author: ${linkValue(author, fm.authorFormat)}`);
  }
  if (fm.includeYear && year) lines.push(`year: ${year}`);
  if (fm.includeIsbn && isbn) lines.push(`isbn: "${yamlQuote(isbn)}"`);
  if (fm.seriesFormat !== "off" && series)
    lines.push(`series: ${linkValue(series, fm.seriesFormat)}`);
  if (fm.publisherFormat !== "off" && publisher)
    lines.push(`publisher: ${linkValue(publisher, fm.publisherFormat)}`);
  if (fm.includeLanguage && language)
    lines.push(`language: "${yamlQuote(language)}"`);
  if (fm.includeGenre && subjects.length) {
    let items = subjects;
    if (fm.cleanGenres) items = items.map(cleanLcshHeading);
    if (fm.uninvertGenres) items = items.map(uninvertHeading);
    if (fm.cleanGenres || fm.uninvertGenres) items = dedupePreserveOrder(items);
    if (fm.maxGenres > 0) items = items.slice(0, fm.maxGenres);
    if (items.length) {
      lines.push("genre:");
      for (const s of items) {
        lines.push(`  - ${linkValue(s, fm.genreFormat)}`);
      }
    }
  }
  if (fm.includeReadestHash) lines.push(`readest-hash: ${book.hash}`);

  const extra = fm.extra
    .split("\n")
    .filter((l) => l.trim() !== "---")
    .join("\n")
    .trim();
  if (extra) lines.push(extra);

  lines.push("---");
  return lines.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Marks lines that must not be treated as headings: fenced code block
// delimiters and everything between them. Without this, a "## Highlights"
// line inside a user's code sample would be mistaken for the section heading
// (or its end boundary) and re-sync would cut the note at the wrong place.
function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array<boolean>(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const isFence = /^\s{0,3}(`{3,}|~{3,})/.test(lines[i] ?? "");
    if (isFence) {
      mask[i] = true;
      open = !open;
    } else {
      mask[i] = open;
    }
  }
  return mask;
}

function yamlQuote(s: string): string {
  // Escapes for a double-quoted YAML scalar. Newlines/tabs must be escaped too,
  // otherwise a metadata value containing one breaks out of the scalar and
  // corrupts the frontmatter block.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

// Quoted YAML scalar, optionally wrapped as a wiki-link.
function linkValue(value: string, format: LinkFormat): string {
  return format === "wikilink"
    ? `"[[${yamlQuote(value)}]]"`
    : `"${yamlQuote(value)}"`;
}

export function renderSyncHeading(
  book: ReadestLibraryBook,
  template: string,
): string {
  return applyTemplate(template, book) || "Highlights";
}

function renderHeadingLine(
  book: ReadestLibraryBook,
  opts: RenderOptions,
): string {
  if (opts.syncHeadingLevel === 0) return "";
  const text = renderSyncHeading(book, opts.syncHeadingTemplate);
  return `${"#".repeat(opts.syncHeadingLevel)} ${text}`;
}

function renderHighlightCountLine(count: number): string {
  return `Total highlights: ${count}`;
}

function prependHighlightCount(
  body: string,
  annotations: ReadestAnnotation[],
  opts: RenderOptions,
): string {
  if (!opts.showHighlightCount || annotations.length === 0) return body;
  const line = renderHighlightCountLine(annotations.length);
  return body ? `${line}\n\n${body}` : line;
}

export function renderBookNote(
  parsed: ParsedBook,
  opts: RenderOptions,
): string {
  const { book, annotations } = parsed;
  const frontmatter = renderFrontmatter(book, opts.frontmatter);
  const heading = renderHeadingLine(book, opts);
  const body = prependHighlightCount(
    renderHighlightsBody(annotations, opts),
    annotations,
    opts,
  );
  const highlights = heading
    ? `${heading}\n\n${body}`.trimEnd()
    : body.trimEnd();
  return frontmatter
    ? `${frontmatter}\n\n${highlights}\n`
    : `${highlights}\n`;
}

export function replaceHighlightsSection(
  existing: string,
  book: ReadestLibraryBook,
  annotations: ReadestAnnotation[],
  opts: RenderOptions,
): string {
  if (opts.syncHeadingLevel === 0) {
    return renderBookNote({ book, annotations }, opts);
  }

  const heading = renderHeadingLine(book, opts);
  const headingText = renderSyncHeading(book, opts.syncHeadingTemplate);
  const hashes = "#".repeat(opts.syncHeadingLevel);
  const body = prependHighlightCount(
    renderHighlightsBody(annotations, opts),
    annotations,
    opts,
  );
  const section = `${heading}\n\n${body}`.trimEnd();

  const headingRe = new RegExp(`^${hashes} ${escapeRegex(headingText)}\\s*$`);
  const lines = existing.split("\n");
  const masked = fenceMask(lines);
  const startLineIdx = lines.findIndex(
    (l, i) => !masked[i] && headingRe.test(l),
  );
  if (startLineIdx === -1) {
    return existing.trimEnd() + "\n\n" + section + "\n";
  }

  const boundaryRe = new RegExp(`^#{1,${opts.syncHeadingLevel}}\\s+`);
  let endLineIdx = lines.length;
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    if (!masked[i] && boundaryRe.test(lines[i] ?? "")) {
      endLineIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startLineIdx).join("\n").trimEnd();
  const after = lines.slice(endLineIdx).join("\n").trimStart();
  return `${before}\n\n${section}\n\n${after}`.trimEnd() + "\n";
}

export function upsertAppendedSection(
  existing: string,
  heading: string,
  body: string,
  level: 1 | 2 | 3 | 4,
): string {
  const hashes = "#".repeat(level);
  const headingLine = `${hashes} ${heading}`;
  const section = `${headingLine}\n\n${body}`.trimEnd();
  const lines = existing.split("\n");
  const masked = fenceMask(lines);
  const startLineIdx = lines.findIndex(
    (l, i) => !masked[i] && l.trim() === headingLine,
  );

  if (startLineIdx === -1) {
    return existing.trimEnd() + `\n\n${section}\n`;
  }

  const boundaryRe = new RegExp(`^#{1,${level}}\\s+`);
  let endLineIdx = lines.length;
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    if (!masked[i] && boundaryRe.test(lines[i] ?? "")) {
      endLineIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startLineIdx).join("\n").trimEnd();
  const after = lines.slice(endLineIdx).join("\n").trimStart();
  const head = before ? `${before}\n\n` : "";
  const tail = after ? `\n\n${after}` : "";
  return `${head}${section}${tail}`.trimEnd() + "\n";
}
