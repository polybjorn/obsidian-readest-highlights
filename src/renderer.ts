import type { ParsedBook, ReadestAnnotation, ReadestLibraryBook } from "./types";
import type {
  HeadingLevel,
  HighlightSeparator,
  HighlightStyle,
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
  includeSeries: boolean;
  includeGenre: boolean;
  includeReadestHash: boolean;
  extra: string;
}

export interface RenderOptions {
  style: HighlightStyle;
  separator: HighlightSeparator;
  showPage: boolean;
  showColor: boolean;
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
    showPage: s.showPage,
    showColor: s.showColor,
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
      includeSeries: s.includeSeries,
      includeGenre: s.includeGenre,
      includeReadestHash: s.includeReadestHash,
      extra: s.extraFrontmatter,
    },
  };
}

function authorName(book: ReadestLibraryBook): string {
  const meta = book.metadata?.author;
  if (typeof meta === "string") return meta;
  if (meta && typeof meta === "object" && meta.name) return meta.name;
  return book.author ?? "";
}

function subjectList(book: ReadestLibraryBook): string[] {
  const s = book.metadata?.subject;
  if (!s) return [];
  return Array.isArray(s) ? s : [s];
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
  return `${sanitizeFilenamePart(rendered)}.md`;
}

function cleanText(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
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
): GroupedAnnotation[] {
  const map = new Map<string, GroupedAnnotation>();

  for (const a of annotations) {
    const key = a.cfi ?? `${a.page ?? 0}::${a.text}`;
    const existing = map.get(key);
    if (existing) {
      if (a.color) existing.colors.add(a.color);
      if (a.style) existing.styles.add(a.style);
      if (a.note && a.note.trim()) existing.notes.push(a.note.trim());
      existing.earliestCreatedAt = Math.min(
        existing.earliestCreatedAt,
        a.createdAt,
      );
    } else {
      map.set(key, {
        key,
        text: cleanText(a.text),
        page: a.page,
        colors: new Set(a.color ? [a.color] : []),
        styles: new Set(a.style ? [a.style] : []),
        notes: a.note && a.note.trim() ? [a.note.trim()] : [],
        earliestCreatedAt: a.createdAt,
      });
    }
  }

  return [...map.values()].sort((x, y) => {
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
  switch (style) {
    case "blockquote": {
      const out = textLines.map((l) => `> ${l}`);
      if (extras.length) {
        out.push(">");
        for (const e of extras) out.push(`> ${e}`);
      }
      return out.join("\n");
    }
    case "callout": {
      const out = ["> [!quote]"];
      for (const l of textLines) out.push(`> ${l}`);
      if (extras.length) {
        out.push(">");
        for (const e of extras) out.push(`> ${e}`);
      }
      return out.join("\n");
    }
    case "bullet": {
      const out = [`- ${textLines[0] ?? ""}`];
      for (let i = 1; i < textLines.length; i++) out.push(`  ${textLines[i]}`);
      for (const e of extras) out.push(`  ${e}`);
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
  const groups = groupAnnotations(annotations);
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
  const subjects = subjectList(book);

  const lines: string[] = ["---"];

  if (fm.tags.length) {
    lines.push("tags:");
    for (const t of fm.tags) lines.push(`  - ${t}`);
  }

  if (fm.authorFormat !== "off" && author) {
    const value =
      fm.authorFormat === "wikilink" ? `"[[${author}]]"` : `"${author}"`;
    lines.push(`author: ${value}`);
  }
  if (fm.includeYear && year) lines.push(`year: ${year}`);
  if (fm.includeIsbn && isbn) lines.push(`isbn: "${isbn}"`);
  if (fm.includeSeries && series) lines.push(`series: "${series}"`);
  if (fm.includeGenre && subjects.length) {
    lines.push("genre:");
    for (const s of subjects) lines.push(`  - ${s}`);
  }
  if (fm.includeReadestHash) lines.push(`readest-hash: ${book.hash}`);

  const extra = fm.extra.trim();
  if (extra) lines.push(extra);

  lines.push("---");
  return lines.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export function renderBookNote(
  parsed: ParsedBook,
  opts: RenderOptions,
): string {
  const { book, annotations } = parsed;
  const frontmatter = renderFrontmatter(book, opts.frontmatter);
  const heading = renderHeadingLine(book, opts);
  const body = renderHighlightsBody(annotations, opts);
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
  const body = renderHighlightsBody(annotations, opts);
  const section = `${heading}\n\n${body}`.trimEnd();

  const headingRe = new RegExp(
    `^${hashes} ${escapeRegex(headingText)}\\s*$`,
    "m",
  );
  const startMatch = existing.match(headingRe);
  if (!startMatch || startMatch.index === undefined) {
    return existing.trimEnd() + "\n\n" + section + "\n";
  }
  const startIdx = startMatch.index;

  const afterHeading = startIdx + heading.length;
  const rest = existing.slice(afterHeading);
  const boundaryRe = new RegExp(`^#{1,${opts.syncHeadingLevel}}\\s+`, "m");
  const nextHeadingMatch = rest.match(boundaryRe);
  const endIdx = nextHeadingMatch
    ? afterHeading + (nextHeadingMatch.index ?? 0)
    : existing.length;

  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx);
  return `${before}\n\n${section}\n\n${after.trimStart()}`.trimEnd() + "\n";
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
  const startLineIdx = lines.findIndex((l) => l.trim() === headingLine);

  if (startLineIdx === -1) {
    return existing.trimEnd() + `\n\n${section}\n`;
  }

  const boundaryRe = new RegExp(`^#{1,${level}}\\s+`);
  let endLineIdx = lines.length;
  for (let i = startLineIdx + 1; i < lines.length; i++) {
    if (boundaryRe.test(lines[i] ?? "")) {
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
