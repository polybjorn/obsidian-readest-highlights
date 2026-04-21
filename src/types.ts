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
    language?: string;
    description?: string;
    publisher?: string;
    published?: string;
    subject?: string[] | string;
    isbn?: string;
    series?: string;
    seriesIndex?: number | string;
    author?: { name?: string } | string;
  };
}

export interface ReadestAnnotation {
  bookHash: string;
  id: string;
  type: string;
  cfi?: string;
  page?: number;
  text: string;
  style: "highlight" | "underline" | null;
  color: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface ReadestBookConfig {
  bookHash: string;
  booknotes?: ReadestAnnotation[];
  progress?: [number, number];
  updatedAt?: number;
}

export interface ParsedBook {
  book: ReadestLibraryBook;
  annotations: ReadestAnnotation[];
}
