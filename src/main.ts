import {
  App,
  FuzzySuggestModal,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from "obsidian";
import { loadBooksWithAnnotations } from "./readest";
import {
  applyTemplate,
  bookFilename,
  optionsFromSettings,
  renderBookNote,
  renderHighlightsBody,
  replaceHighlightsSection,
  upsertAppendedSection,
} from "./renderer";
import {
  DEFAULT_SETTINGS,
  ReadestSettings,
  ReadestSettingTab,
  resolveBooksDir,
} from "./settings";
import type { ParsedBook } from "./types";

type SyncResult = { action: "created" | "updated" | "unchanged"; path: string };

export default class ReadestHighlightsPlugin extends Plugin {
  settings!: ReadestSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "sync-all-books",
      name: "Sync all books to folder",
      callback: () => this.syncAll(),
    });

    this.addCommand({
      id: "sync-one-book",
      name: "Sync one book to folder...",
      callback: () => this.syncSingle(),
    });

    this.addCommand({
      id: "append-one-book",
      name: "Append one book to current note...",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) void this.openAppendPicker(view.file);
        return true;
      },
    });

    this.addRibbonIcon("book-open", "Sync all books to folder", () => {
      void this.syncAll();
    });

    this.addSettingTab(new ReadestSettingTab(this.app, this));
  }

  async loadSettings() {
    const saved = ((await this.loadData()) ?? {}) as Partial<ReadestSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async syncAll() {
    const notice = new Notice("Readest: syncing...", 0);
    try {
      const books = await this.loadBooks();
      await this.ensureFolder(this.settings.outputFolder);
      const hashIndex = this.buildHashIndex();

      let created = 0;
      let updated = 0;

      for (const parsed of books) {
        const result = await this.writeBookNote(parsed, hashIndex);
        if (result.action === "created") created++;
        else if (result.action === "updated") updated++;
      }

      notice.hide();
      new Notice(
        `Readest: ${created} created, ${updated} updated (${books.length} books)`,
      );
    } catch (e) {
      notice.hide();
      console.error("Readest sync failed", e);
      new Notice(`Readest sync failed: ${(e as Error).message}`);
    }
  }

  async syncSingle() {
    try {
      const books = await this.loadBooks();
      if (books.length === 0) {
        new Notice("Readest: no books with highlights found.");
        return;
      }
      new BookPickerModal(
        this.app,
        books,
        "Pick a book to sync...",
        (picked) => {
          void (async () => {
            try {
              await this.ensureFolder(this.settings.outputFolder);
              const result = await this.writeBookNote(
                picked,
                this.buildHashIndex(),
              );
              new Notice(
                `Readest: ${result.action} "${picked.book.title}" (${picked.annotations.length} highlights)`,
              );
            } catch (e) {
              console.error("Readest single sync failed", e);
              new Notice(`Readest: ${(e as Error).message}`);
            }
          })();
        },
      ).open();
    } catch (e) {
      console.error("Readest picker failed", e);
      new Notice(`Readest: ${(e as Error).message}`);
    }
  }

  async openAppendPicker(targetFile: TFile) {
    try {
      const books = await this.loadBooks();
      if (books.length === 0) {
        new Notice("Readest: no books with highlights found.");
        return;
      }
      new BookPickerModal(
        this.app,
        books,
        "Pick a book to append highlights from...",
        (picked) => {
          void this.appendHighlights(targetFile, picked);
        },
      ).open();
    } catch (e) {
      console.error("Readest picker failed", e);
      new Notice(`Readest: ${(e as Error).message}`);
    }
  }

  async appendHighlights(file: TFile, parsed: ParsedBook) {
    const opts = optionsFromSettings(this.settings);
    const body = renderHighlightsBody(parsed.annotations, opts);
    const level = this.settings.syncHeadingLevel;
    await this.app.vault.process(file, (current) => {
      if (level === 0) {
        return current.trimEnd() + `\n\n${body}\n`;
      }
      const heading =
        applyTemplate(this.settings.appendHeadingTemplate, parsed.book) ||
        "Highlights";
      return upsertAppendedSection(current, heading, body, level);
    });
    new Notice(
      `Readest: appended ${parsed.annotations.length} highlights from "${parsed.book.title}"`,
    );
  }

  private async loadBooks(): Promise<ParsedBook[]> {
    const mode = this.settings.annotationFilter;
    const filter =
      mode === "withNotes"
        ? (a: { note: string }) => !!a.note && a.note.trim().length > 0
        : mode === "highlights"
          ? (a: { style: string | null }) => a.style === "highlight"
          : mode === "underlines"
            ? (a: { style: string | null }) => a.style === "underline"
            : mode === "marked"
              ? (a: { style: string | null }) => a.style !== null
              : undefined;
    const dir = await resolveBooksDir(this.settings);
    return loadBooksWithAnnotations(dir, { filter });
  }

  private buildHashIndex(): Map<string, TFile> {
    const folder = normalizePath(this.settings.outputFolder);
    const prefix = folder === "/" ? "" : `${folder}/`;
    const index = new Map<string, TFile>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const hash: unknown = fm?.["readest-hash"];
      if (typeof hash === "string") index.set(hash, file);
    }
    return index;
  }

  private async writeBookNote(
    parsed: ParsedBook,
    hashIndex: Map<string, TFile>,
  ): Promise<SyncResult> {
    const opts = optionsFromSettings(this.settings);
    const filename = bookFilename(parsed.book, this.settings.filenameTemplate);
    const templatedPath = normalizePath(
      `${this.settings.outputFolder}/${filename}`,
    );

    let matched: TFile | null = hashIndex.get(parsed.book.hash) ?? null;
    if (!matched) {
      const atPath = this.app.vault.getAbstractFileByPath(templatedPath);
      if (atPath instanceof TFile) matched = atPath;
    }

    if (matched) {
      let changed = false;
      await this.app.vault.process(matched, (current) => {
        const next = this.settings.preserveManualEdits
          ? replaceHighlightsSection(
              current,
              parsed.book,
              parsed.annotations,
              opts,
            )
          : renderBookNote(parsed, opts);
        changed = next !== current;
        return next;
      });
      return {
        action: changed ? "updated" : "unchanged",
        path: matched.path,
      };
    }

    await this.app.vault.create(templatedPath, renderBookNote(parsed, opts));
    return { action: "created", path: templatedPath };
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
  }
}

class BookPickerModal extends FuzzySuggestModal<ParsedBook> {
  private books: ParsedBook[];
  private onPick: (book: ParsedBook) => void;

  constructor(
    app: App,
    books: ParsedBook[],
    placeholder: string,
    onPick: (book: ParsedBook) => void,
  ) {
    super(app);
    this.books = books;
    this.onPick = onPick;
    this.setPlaceholder(placeholder);
  }

  getItems(): ParsedBook[] {
    return this.books;
  }

  getItemText(item: ParsedBook): string {
    const author = item.book.author ?? "";
    const count = item.annotations.length;
    return `${item.book.title}${author ? ` - ${author}` : ""} (${count})`;
  }

  onChooseItem(item: ParsedBook): void {
    this.onPick(item);
  }
}
