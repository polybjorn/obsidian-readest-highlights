import {
  App,
  FuzzySuggestModal,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
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

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default class ReadestHighlightsPlugin extends Plugin {
  settings!: ReadestSettings;
  private syncing = false;

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
    if (this.syncing) {
      new Notice("Readest: sync already running.");
      return;
    }
    this.syncing = true;
    const notice = new Notice("Readest: syncing...", 0);
    try {
      const books = await this.loadBooks();
      await this.ensureFolder(this.settings.outputFolder);
      const hashIndex = this.buildHashIndex();
      const usedPaths = new Set<string>();

      let created = 0;
      let updated = 0;

      for (const parsed of books) {
        const result = await this.writeBookNote(parsed, hashIndex, usedPaths);
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
      new Notice(`Readest sync failed: ${errorMessage(e)}`);
    } finally {
      this.syncing = false;
    }
  }

  async syncSingle() {
    if (this.syncing) {
      new Notice("Readest: sync already running.");
      return;
    }
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
            if (this.syncing) {
              new Notice("Readest: sync already running.");
              return;
            }
            this.syncing = true;
            try {
              await this.ensureFolder(this.settings.outputFolder);
              const result = await this.writeBookNote(
                picked,
                this.buildHashIndex(),
                new Set<string>(),
              );
              new Notice(
                `Readest: ${result.action} "${picked.book.title}" (${picked.annotations.length} highlights)`,
              );
            } catch (e) {
              console.error("Readest single sync failed", e);
              new Notice(`Readest: ${errorMessage(e)}`);
            } finally {
              this.syncing = false;
            }
          })();
        },
      ).open();
    } catch (e) {
      console.error("Readest picker failed", e);
      new Notice(`Readest: ${errorMessage(e)}`);
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
      new Notice(`Readest: ${errorMessage(e)}`);
    }
  }

  async appendHighlights(file: TFile, parsed: ParsedBook) {
    try {
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
    } catch (e) {
      console.error("Readest append failed", e);
      new Notice(`Readest append failed: ${errorMessage(e)}`);
    }
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
    const folderPath = normalizePath(this.settings.outputFolder);
    const index = new Map<string, TFile>();
    const root =
      folderPath === "/"
        ? this.app.vault.getRoot()
        : this.app.vault.getFolderByPath(folderPath);
    if (!root) return index;
    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
        else if (child instanceof TFile && child.extension === "md") {
          const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
          const hash: unknown = fm?.["readest-hash"];
          if (typeof hash === "string") index.set(hash, child);
        }
      }
    };
    walk(root);
    return index;
  }

  private async writeBookNote(
    parsed: ParsedBook,
    hashIndex: Map<string, TFile>,
    usedPaths: Set<string> = new Set(),
  ): Promise<SyncResult> {
    const opts = optionsFromSettings(this.settings);
    const filename = bookFilename(parsed.book, this.settings.filenameTemplate);
    let templatedPath = normalizePath(
      `${this.settings.outputFolder}/${filename}`,
    );

    let matched: TFile | null = hashIndex.get(parsed.book.hash) ?? null;
    if (!matched) {
      const atPath = this.app.vault.getAbstractFileByPath(templatedPath);
      if (atPath instanceof TFile) {
        const otherHash: unknown = this.app.metadataCache.getFileCache(atPath)
          ?.frontmatter?.["readest-hash"];
        const isCollision =
          usedPaths.has(templatedPath) ||
          (typeof otherHash === "string" && otherHash !== parsed.book.hash);
        if (isCollision) {
          const suffix = parsed.book.hash.slice(0, 8);
          templatedPath = normalizePath(
            `${this.settings.outputFolder}/${filename.replace(/\.md$/, "")} (${suffix}).md`,
          );
        } else {
          matched = atPath;
        }
      }
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
      usedPaths.add(matched.path);
      return {
        action: changed ? "updated" : "unchanged",
        path: matched.path,
      };
    }

    const created = await this.app.vault.create(
      templatedPath,
      renderBookNote(parsed, opts),
    );
    hashIndex.set(parsed.book.hash, created);
    usedPaths.add(created.path);
    return { action: "created", path: created.path };
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
