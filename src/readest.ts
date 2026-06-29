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

// Highest Readest config schemaVersion this plugin has been verified against.
// As of Readest HEAD (2026-06) booknotes live inline in <hash>/config.json's
// `booknotes` field across schemaVersion 1-3, and no annotation field has been
// renamed. A future version could relocate or rename that array, leaving us to
// import 0 highlights with no other signal (the unrenderable-highlight tripwire
// only fires when annotations are present but unreadable). We key the warning
// off the outcome, not the number: a newer version only warns when it yields no
// readable highlights at all, so a benign bump (as v2->v3 was) stays quiet even
// if this constant is left stale.
export const KNOWN_SCHEMA_VERSION = 3;

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
    const parsed = parseJsonFile<unknown>(raw, libraryPath);
    if (!Array.isArray(parsed)) {
      const got = parsed === null ? "null" : typeof parsed;
      throw new Error(
        `library.json at ${libraryPath} is not a JSON array (got ${got}); Readest's library format may have changed. Update the plugin if highlights are missing.`,
      );
    }
    return parsed as ReadestLibraryBook[];
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
    onNewerSchemaVersion,
  }: {
    includeDeleted?: boolean;
    onlyWithAnnotations?: boolean;
    filter?: (a: ReadestAnnotation) => boolean;
    onUnreadableHighlights?: (count: number) => void;
    onNewerSchemaVersion?: (versions: number[]) => void;
  } = {},
): Promise<ParsedBook[]> {
  const library = await readLibrary(booksDir);
  const eligible = library.filter(
    (book) => includeDeleted || book.deletedAt == null,
  );

  // A library entry with no usable hash can't locate its config.json (it would
  // crash path.join) and breaks note matching downstream. Drop and report them
  // rather than fail the whole sync opaquely.
  const usable = eligible.filter(
    (book) => typeof book.hash === "string" && book.hash !== "",
  );
  const skipped = eligible.length - usable.length;
  if (skipped > 0) {
    console.warn(
      `[readest-highlights] ${skipped} Readest library entr(ies) had no usable hash and were skipped.`,
    );
  }

  // Readest hashes are content-derived, so a genuine duplicate (same book
  // imported twice) is possible; both would read the same config and write to
  // the same note. Surface it instead of silently importing twice.
  const seenHashes = new Set<string>();
  const duplicateHashes = new Set<string>();
  for (const book of usable) {
    if (seenHashes.has(book.hash)) duplicateHashes.add(book.hash);
    else seenHashes.add(book.hash);
  }
  if (duplicateHashes.size > 0) {
    console.warn(
      `[readest-highlights] ${duplicateHashes.size} duplicate book hash(es) in library.json; those books may import more than once.`,
    );
  }

  const pairs = await Promise.all(
    usable.map(async (book) => ({
      book,
      config: await readBookConfig(booksDir, book.hash),
    })),
  );

  const results: ParsedBook[] = [];
  const versionsSeen = new Set<number>();
  const newerVersionsSeen = new Set<number>();
  let unreadable = 0;
  // Tracks the silent-zero-import case for configs newer than we've verified:
  // did ANY book at a newer schemaVersion yield a readable annotation? If one
  // did, the read path still works on the new format and we stay quiet (a
  // benign version bump, as v2->v3 was). Only when every newer-version book
  // reads as empty do we warn - that is the format-actually-moved case the
  // shape-based tripwire below cannot see (no annotations left to inspect).
  let newerVersionReadable = 0;

  for (const { book, config } of pairs) {
    const schemaVersion = config?.schemaVersion;
    if (typeof schemaVersion === "number") {
      versionsSeen.add(schemaVersion);
      if (schemaVersion > KNOWN_SCHEMA_VERSION) {
        newerVersionsSeen.add(schemaVersion);
      }
    }
    const live = (config?.booknotes ?? []).filter(
      (a): a is ReadestAnnotation => a.deletedAt == null,
    );
    // Drop highlights we can't render (no text, no note) rather than emit
    // blank entries; their presence is what raises the format-change warning.
    let annotations = live.filter((a) => !isUnrenderable(a));
    unreadable += live.length - annotations.length;
    if (typeof schemaVersion === "number" && schemaVersion > KNOWN_SCHEMA_VERSION) {
      newerVersionReadable += annotations.length;
    }
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

  if (newerVersionsSeen.size > 0 && newerVersionReadable === 0) {
    const newerVersions = [...newerVersionsSeen].sort((a, b) => a - b);
    console.warn(
      `[readest-highlights] Readest config schemaVersion ${newerVersions.join(", ")} is newer than this plugin supports (${KNOWN_SCHEMA_VERSION}) and no highlights could be read from it; the booknote format may have changed. Update the plugin if highlights are missing.`,
    );
    onNewerSchemaVersion?.(newerVersions);
  }

  if (unreadable > 0) {
    console.warn(
      `[readest-highlights] ${unreadable} Readest highlight(s) had no text or note; the booknote format may have changed. Update the plugin if highlights are missing.`,
    );
    onUnreadableHighlights?.(unreadable);
  }

  return results;
}
