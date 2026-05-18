import { readFile } from "fs/promises";
import { join } from "path";
import type {
  ParsedBook,
  ReadestAnnotation,
  ReadestBookConfig,
  ReadestLibraryBook,
} from "./types";

export const SUPPORTED_SCHEMA_VERSION = 1;

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
    onUnsupportedSchema,
  }: {
    includeDeleted?: boolean;
    onlyWithAnnotations?: boolean;
    filter?: (a: ReadestAnnotation) => boolean;
    onUnsupportedSchema?: (found: number, supported: number) => void;
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
  let highestUnsupported = 0;

  for (const { book, config } of pairs) {
    const version = config?.schemaVersion;
    if (typeof version === "number" && version > SUPPORTED_SCHEMA_VERSION) {
      if (version > highestUnsupported) highestUnsupported = version;
    }
    let annotations = (config?.booknotes ?? []).filter(
      (a): a is ReadestAnnotation => !a.deletedAt,
    );
    if (filter) annotations = annotations.filter(filter);
    if (onlyWithAnnotations && annotations.length === 0) continue;
    annotations.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    results.push({ book, annotations });
  }

  if (highestUnsupported > 0) {
    console.warn(
      `[readest-highlights] Encountered config schemaVersion ${highestUnsupported}, supported is ${SUPPORTED_SCHEMA_VERSION}. Update the plugin.`,
    );
    onUnsupportedSchema?.(highestUnsupported, SUPPORTED_SCHEMA_VERSION);
  }

  return results;
}
