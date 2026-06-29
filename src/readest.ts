import { readFile } from "fs/promises";
import { join } from "path";
import type {
  ParsedBook,
  ReadestAnnotation,
  ReadestBookConfig,
  ReadestLibraryBook,
} from "./types";

// A highlight Readest considers real (it carries a `style`) but that we cannot
// render: it has neither selected `text` nor a `note`. On healthy Readest data
// this never happens. When it does, it means a field this plugin reads was
// renamed or moved, i.e. the booknote format changed under us - which is the
// only situation where "update the plugin" is the right advice. We deliberately
// do NOT gate on `schemaVersion`: Readest bumps it for changes that never touch
// the booknotes we read (v1->v2 unified split records, v2->v3 changed
// searchConfig), so a version check cries wolf on every bump.
function isUnrenderable(a: ReadestAnnotation): boolean {
  return (
    a.style != null &&
    (a.text ?? "").trim() === "" &&
    (a.note ?? "").trim() === ""
  );
}

function isEnoent(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "ENOENT"
  );
}

function parseJsonFile<T>(raw: string, path: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse ${path}: ${reason}`);
  }
}

export async function readLibrary(
  booksDir: string,
): Promise<ReadestLibraryBook[]> {
  const libraryPath = join(booksDir, "library.json");
  try {
    const raw = await readFile(libraryPath, "utf-8");
    return parseJsonFile<ReadestLibraryBook[]>(raw, libraryPath);
  } catch (e) {
    if (isEnoent(e)) {
      throw new Error(`library.json not found at ${libraryPath}`);
    }
    throw e;
  }
}

export async function readBookConfig(
  booksDir: string,
  hash: string,
): Promise<ReadestBookConfig | null> {
  const configPath = join(booksDir, hash, "config.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    return parseJsonFile<ReadestBookConfig>(raw, configPath);
  } catch (e) {
    if (isEnoent(e)) return null;
    throw e;
  }
}

export async function loadBooksWithAnnotations(
  booksDir: string,
  {
    includeDeleted = false,
    onlyWithAnnotations = true,
    filter,
    onUnreadableHighlights,
  }: {
    includeDeleted?: boolean;
    onlyWithAnnotations?: boolean;
    filter?: (a: ReadestAnnotation) => boolean;
    onUnreadableHighlights?: (count: number) => void;
  } = {},
): Promise<ParsedBook[]> {
  const library = await readLibrary(booksDir);
  const eligible = library.filter(
    (book) => includeDeleted || !book.deletedAt,
  );
  const pairs = await Promise.all(
    eligible.map(async (book) => ({
      book,
      config: await readBookConfig(booksDir, book.hash),
    })),
  );

  const results: ParsedBook[] = [];
  const versionsSeen = new Set<number>();
  let unreadable = 0;

  for (const { book, config } of pairs) {
    if (typeof config?.schemaVersion === "number") {
      versionsSeen.add(config.schemaVersion);
    }
    const live = (config?.booknotes ?? []).filter(
      (a): a is ReadestAnnotation => !a.deletedAt,
    );
    // Drop highlights we can't render (no text, no note) rather than emit
    // blank entries; their presence is what raises the format-change warning.
    let annotations = live.filter((a) => !isUnrenderable(a));
    unreadable += live.length - annotations.length;
    if (filter) annotations = annotations.filter(filter);
    if (onlyWithAnnotations && annotations.length === 0) continue;
    annotations.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    results.push({ book, annotations });
  }

  if (versionsSeen.size > 0) {
    console.debug(
      `[readest-highlights] Readest config schemaVersion(s) seen: ${[...versionsSeen].sort((a, b) => a - b).join(", ")}`,
    );
  }

  if (unreadable > 0) {
    console.warn(
      `[readest-highlights] ${unreadable} Readest highlight(s) had no text or note; the booknote format may have changed. Update the plugin if highlights are missing.`,
    );
    onUnreadableHighlights?.(unreadable);
  }

  return results;
}
