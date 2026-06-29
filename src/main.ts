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
import { buildAnnotationFilter } from "./filters";
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
  declare settings: ReadestSettings;
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
    // The "marked" filter (any styled annotation, i.e. everything but bookmarks)
    // was removed; "all" is the closest surviving behavior.
    if ((this.settings.annotationFilter as string) === "marked") {
      this.settings.annotationFilter = "all";
    }
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
      await this.layoutReady();
      const { index: hashIndex, duplicateHashes } = this.buildHashIndex();
      this.warnIfDuplicateHashes(duplicateHashes);
      const usedPaths = new Set<string>();

      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const parsed of books) {
        try {
          const result = await this.writeBookNote(parsed, hashIndex, usedPaths);
          if (result.action === "created") created++;
          else if (result.action === "updated") updated++;
        } catch (e) {
          // One bad book must not drop the rest of the batch.
          failed++;
          console.error(
            `Readest: failed to write "${parsed.book.title}"`,
            e,
          );
        }
      }

      notice.hide();
      new Notice(
        `Readest: ${created} created, ${updated} updated` +
          (failed > 0 ? `, ${failed} failed` : "") +
          ` (${books.length} books)`,
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
              await this.layoutReady();
              const { index, duplicateHashes } = this.buildHashIndex();
              this.warnIfDuplicateHashes(duplicateHashes);
              const result = await this.writeBookNote(
                picked,
                index,
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
    const filter = buildAnnotationFilter(this.settings.annotationFilter);
    const dir = await resolveBooksDir(this.settings);
    await this.rememberBooksDir(dir);
    return loadBooksWithAnnotations(dir, {
      filter,
      onUnreadableHighlights: (count) => {
        new Notice(
          `Readest: ${count} highlight(s) could not be read. Readest's note format may have changed - update the Readest Highlights plugin if highlights are missing.`,
          10000,
        );
      },
      onNewerSchemaVersion: (versions) => {
        new Notice(
          `Readest: config version ${versions.join(", ")} is newer than this plugin supports and no highlights could be read from it. Update the Readest Highlights plugin if you expected highlights.`,
          10000,
        );
      },
    });
  }

  private async rememberBooksDir(dir: string) {
    const userPaths = this.settings.booksDirs.filter((p) => p.length > 0);
    if (userPaths.length === 0) return;
    if (userPaths.includes(dir)) return;
    this.settings.booksDirs = [...userPaths, dir];
    await this.saveSettings();
  }

  private buildHashIndex(): {
    index: Map<string, TFile>;
    duplicateHashes: string[];
  } {
    const folderPath = normalizePath(this.settings.outputFolder);
    const index = new Map<string, TFile>();
    const duplicateHashes: string[] = [];
    const root =
      folderPath === "/"
        ? this.app.vault.getRoot()
        : this.app.vault.getFolderByPath(folderPath);
    if (!root) return { index, duplicateHashes };
    const walk = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
        else if (child instanceof TFile && child.extension === "md") {
          const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
          const hash: unknown = fm?.["readest-hash"];
          if (typeof hash === "string") {
            if (index.has(hash)) {
              duplicateHashes.push(hash);
            } else {
              index.set(hash, child);
            }
          }
        }
      }
    };
    walk(root);
    return { index, duplicateHashes };
  }

  private warnIfDuplicateHashes(duplicateHashes: string[]) {
    if (duplicateHashes.length === 0) return;
    console.warn(
      "Readest: duplicate readest-hash values in output folder:",
      duplicateHashes,
    );
    new Notice(
      `Readest: ${duplicateHashes.length} note(s) share a book hash; sync may behave unpredictably. Check the developer console for details.`,
      8000,
    );
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
          templatedPath = this.findFreePath(
            `${this.settings.outputFolder}/${filename.replace(/\.md$/, "")}`,
            parsed.book.hash.slice(0, 8),
            usedPaths,
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

    const content = renderBookNote(parsed, opts);
    let created: TFile;
    try {
      created = await this.app.vault.create(templatedPath, content);
    } catch {
      // Backstop: if the path was taken between the existence check and now
      // (collision suffix still occupied, or a concurrent write), retry once at
      // the next free path rather than aborting this book.
      const retryPath = this.findFreePath(
        normalizePath(templatedPath).replace(/\.md$/, ""),
        "",
        usedPaths,
      );
      created = await this.app.vault.create(retryPath, content);
    }
    hashIndex.set(parsed.book.hash, created);
    usedPaths.add(created.path);
    return { action: "created", path: created.path };
  }

  // Finds a vault path not already used in this run and not present on disk.
  // `base` is a full path stem (folder included, no extension). Tries
  // "base (suffix).md" first, then numbers it ("base (suffix) 2.md", ...).
  // A blank suffix yields "base.md", "base 2.md", ...
  private findFreePath(
    base: string,
    suffix: string,
    usedPaths: Set<string>,
  ): string {
    const tag = suffix ? ` (${suffix})` : "";
    for (let n = 1; n <= 10000; n++) {
      const counter = n === 1 ? "" : ` ${n}`;
      const candidate = normalizePath(`${base}${tag}${counter}.md`);
      if (
        !usedPaths.has(candidate) &&
        this.app.vault.getAbstractFileByPath(candidate) === null
      ) {
        return candidate;
      }
    }
    // Effectively unreachable; bound guards against an unexpected pathological
    // state rather than spinning forever. The per-book catch keeps the batch alive.
    throw new Error(`Could not find a free path for "${base}".`);
  }

  private layoutReady(): Promise<void> {
    return new Promise((resolve) => {
      this.app.workspace.onLayoutReady(() => resolve());
    });
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (!existing) {
      await this.app.vault.createFolder(normalized);
    } else if (!(existing instanceof TFolder)) {
      throw new Error(
        `Output folder path "${normalized}" is a file, not a folder.`,
      );
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
