import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

// Readest only writes nav.json for reflowable EPUBs, so a PDF never has one.
// Its chapters live in the PDF's own outline (bookmarks), which Readest shows
// as the TOC. We read that outline from the book file Readest keeps beside
// config.json (Books/<hash>/<title>.pdf) using the pdf.js build Obsidian
// ships, and place highlights by page, which every PDF booknote carries.

export interface PageChapterEntry {
  label: string;
  // 1-based, matching the `page` Readest stores on PDF booknotes.
  page: number;
}

// The slice of pdf.js we touch. Typed loosely at the boundary because
// Obsidian's loadPdfJs() is declared as Promise<any>.
interface PdfOutlineItem {
  title?: unknown;
  dest?: unknown;
  items?: unknown;
}

interface PdfDocument {
  getOutline(): Promise<PdfOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}

export interface PdfJs {
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocument> };
}

// Parsing a large PDF on every sync is the expensive part, so the outline is
// cached per file and reused until the file's size or mtime changes.
const cache = new Map<string, { key: string; entries: PageChapterEntry[] | null }>();

async function findPdf(dir: string): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  // Readest names the file after the book's title (makeSafeFilename), so
  // match on extension rather than rebuild that name.
  const pdf = names.find((n) => n.toLowerCase().endsWith(".pdf"));
  return pdf ? join(dir, pdf) : null;
}

async function pageOf(doc: PdfDocument, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const target: unknown = explicit[0];
    // A destination names its page by reference, or (in some producers) by
    // a bare 0-based index.
    const index = typeof target === "number" ? target : await doc.getPageIndex(target);
    return Number.isInteger(index) && index >= 0 ? index + 1 : null;
  } catch {
    return null;
  }
}

async function flattenOutline(
  doc: PdfDocument,
  items: unknown[],
  out: PageChapterEntry[],
): Promise<void> {
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const { title, dest, items: children } = item as PdfOutlineItem;
    if (typeof title === "string") {
      const label = title.replace(/\s+/g, " ").trim();
      const page = await pageOf(doc, dest);
      if (label && page !== null) out.push({ label, page });
    }
    if (Array.isArray(children)) await flattenOutline(doc, children, out);
  }
}

// Loads a PDF book's chapter list, sorted by page. Returns null when the file
// is missing, has no outline, or pdf.js cannot read it; chapter grouping then
// degrades to no headings, as it does for an EPUB without nav.json.
export async function readPdfChapters(
  booksDir: string,
  hash: string,
  loadPdf: () => Promise<PdfJs>,
): Promise<PageChapterEntry[] | null> {
  const path = await findPdf(join(booksDir, hash));
  if (!path) return null;
  let key: string;
  try {
    const s = await stat(path);
    key = `${s.size}:${s.mtimeMs}`;
  } catch {
    return null;
  }
  const hit = cache.get(path);
  if (hit && hit.key === key) return hit.entries;

  let entries: PageChapterEntry[] | null = null;
  let doc: PdfDocument | null = null;
  try {
    const data = new Uint8Array(await readFile(path));
    const pdfjs = await loadPdf();
    doc = await pdfjs.getDocument({ data }).promise;
    const outline = await doc.getOutline();
    if (Array.isArray(outline)) {
      const out: PageChapterEntry[] = [];
      await flattenOutline(doc, outline, out);
      // Stable sort: entries on the same page keep outline order, so the
      // deeper (more specific) one wins, as with nav.json.
      out.sort((a, b) => a.page - b.page);
      if (out.length) entries = out;
    }
  } catch (e) {
    console.debug(`[readest-highlights] Could not read the PDF outline of ${path}`, e);
  } finally {
    await doc?.destroy().catch(() => {});
  }
  cache.set(path, { key, entries });
  return entries;
}

// The chapter a PDF highlight falls in: the last outline entry starting on or
// before its page. Null before the first entry (e.g. front matter).
export function chapterForPage(
  entries: PageChapterEntry[],
  page: number,
): string | null {
  let best: string | null = null;
  for (const entry of entries) {
    if (entry.page <= page) best = entry.label;
    else break;
  }
  return best;
}
