export interface ReadestLibraryBook {
  hash: string;
  format: string;
  title: string;
  sourceTitle?: string;
  primaryLanguage?: string;
  author?: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number | null;
  downloadedAt?: number | null;
  progress?: [number, number] | null;
  metadata?: {
    identifier?: string;
    title?: string;
    language?: string | string[];
    description?: string;
    publisher?: string;
    published?: string;
    subject?:
      | string
      | string[]
      | { name?: LocalizedString; code?: string; scheme?: string }[];
    isbn?: string;
    series?: string;
    seriesIndex?: number | string;
    author?:
      | string
      | { name?: LocalizedString; sortAs?: string; role?: string };
  };
}

export type LocalizedString = string | { [lang: string]: string };

export interface ReadestAnnotation {
  bookHash: string;
  id: string;
  type: string;
  cfi?: string;
  page?: number;
  // Typed optional because partially-written Readest data can omit these; all
  // reads guard with `?? ""`. Don't tighten to required - it lies about the data.
  text?: string;
  // Known Readest styles, kept for autocomplete/intent; the `(string & {})`
  // arm keeps the union open so a future Readest style is not a type error.
  // Behavior keys off the value we can read (see isUnrenderable), not this set.
  style: "highlight" | "underline" | "squiggly" | (string & {}) | null;
  color: string | null;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface ReadestBookConfig {
  schemaVersion?: number;
  bookHash: string;
  booknotes?: ReadestAnnotation[];
  progress?: [number, number];
  updatedAt?: number;
}

export interface ParsedBook {
  book: ReadestLibraryBook;
  annotations: ReadestAnnotation[];
}
