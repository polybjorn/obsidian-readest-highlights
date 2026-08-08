import { readFile } from "fs/promises";
import { join } from "path";

// Readest caches a book's table of contents to Books/<hash>/nav.json the first
// time the book is opened in a version that has the nav cache. Only books
// opened at least once have one, so every reader must tolerate its absence.
// Same policy as config.json: we key off the shape we need (a `toc` array of
// { label, cfi, subitems }) and ignore the file's own version number.

export interface ChapterEntry {
  label: string;
  steps: number[];
}

// Parses an epub CFI into a flat numeric step list for ordering comparisons,
// e.g. "epubcfi(/6/10!/4/46/2[pt-4],/1:0,/1:9)" -> [6,10,4,46,2,1,0].
// Range CFIs (parent,start,end) collapse to their start point. Bracket
// assertions are dropped; a character offset (":n") lands as a trailing step,
// which is exact enough for chapter mapping (TOC entries are element-level).
export function parseCfiSteps(cfi: string): number[] | null {
  const m = cfi.trim().match(/^epubcfi\((.*)\)$/);
  const body = m?.[1] ?? cfi.trim();
  const path = rangeStart(body).replace(/\[[^\]]*\]/g, "");
  const steps: number[] = [];
  for (const token of path.split(/[/!]/)) {
    if (!token) continue;
    const tm = token.match(/^(\d+)(?::(\d+))?/);
    if (!tm) continue;
    steps.push(Number(tm[1]));
    if (tm[2] !== undefined) steps.push(Number(tm[2]));
  }
  return steps.length ? steps : null;
}

// Splits a range CFI body on top-level commas (assertions in [] may contain
// commas too) and joins parent + start into one absolute path.
function rangeStart(body: string): string {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.length >= 2 ? (parts[0] ?? "") + (parts[1] ?? "") : (parts[0] ?? "");
}

function compareSteps(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  // A prefix sorts first: /6/4 is the start of the container /6/4/2 sits in.
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

interface NavTocItem {
  label?: unknown;
  cfi?: unknown;
  subitems?: unknown;
}

function flattenToc(items: unknown[], out: ChapterEntry[]): void {
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const { label, cfi, subitems } = item as NavTocItem;
    if (typeof label === "string" && typeof cfi === "string") {
      const cleaned = label.replace(/\s+/g, " ").trim();
      const steps = parseCfiSteps(cfi);
      if (cleaned && steps) out.push({ label: cleaned, steps });
    }
    if (Array.isArray(subitems)) flattenToc(subitems, out);
  }
}

// Loads the chapter list for a book, sorted by position. Returns null when the
// cache is missing or unusable - chapter grouping then silently degrades, and
// opening the book once in Readest regenerates the cache.
export async function readNavChapters(
  booksDir: string,
  hash: string,
): Promise<ChapterEntry[] | null> {
  const navPath = join(booksDir, hash, "nav.json");
  let raw: string;
  try {
    raw = await readFile(navPath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const toc = (parsed as { toc?: unknown } | null)?.toc;
  if (!Array.isArray(toc)) return null;
  const out: ChapterEntry[] = [];
  flattenToc(toc, out);
  // Sort by position so lookup can take "last entry at or before the
  // annotation". The sort is stable, so a parent and child at the same CFI
  // keep DFS order and the deeper (more specific) label wins.
  out.sort((a, b) => compareSteps(a.steps, b.steps));
  return out.length ? out : null;
}

// The chapter an annotation falls in: the last TOC entry positioned at or
// before the annotation's CFI. Null when the CFI is unparsable or sits before
// the first entry (e.g. a highlight on the cover page).
export function chapterForCfi(
  entries: ChapterEntry[],
  cfi: string,
): string | null {
  const steps = parseCfiSteps(cfi);
  if (!steps) return null;
  let best: string | null = null;
  for (const entry of entries) {
    if (compareSteps(entry.steps, steps) <= 0) best = entry.label;
    else break;
  }
  return best;
}
