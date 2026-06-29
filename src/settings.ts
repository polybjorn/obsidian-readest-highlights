import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { access } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type ReadestHighlightsPlugin from "./main";
import type { AnnotationFilter } from "./filters";

export type HighlightStyle = "blockquote" | "plain" | "callout" | "bullet";
export type HighlightSeparator = "rule" | "blank" | "pageHeading" | "none";
export type HeadingLevel = 0 | 1 | 2 | 3 | 4;
export type AuthorFormat = "off" | "plain" | "wikilink";
export type GenreFormat = "plain" | "wikilink";
export type NoteStyle = "attached" | "separated" | "callout";
export type MetadataPlacement = "below" | "inline";
export type { AnnotationFilter };

export interface ReadestSettings {
  booksDirs: string[];
  outputFolder: string;
  filenameTemplate: string;
  syncHeadingTemplate: string;
  syncHeadingLevel: HeadingLevel;
  appendHeadingTemplate: string;
  preserveManualEdits: boolean;
  highlightStyle: HighlightStyle;
  highlightSeparator: HighlightSeparator;
  showPage: boolean;
  showColor: boolean;
  showHighlightCount: boolean;
  renderUnderlines: boolean;
  metadataPlacement: MetadataPlacement;
  showNotes: boolean;
  noteStyle: NoteStyle;
  annotationFilter: AnnotationFilter;
  includeFrontmatter: boolean;
  frontmatterTags: string;
  authorFormat: AuthorFormat;
  includeYear: boolean;
  includeIsbn: boolean;
  includeSeries: boolean;
  includeGenre: boolean;
  genreFormat: GenreFormat;
  cleanGenres: boolean;
  uninvertGenres: boolean;
  maxGenres: number;
  includeReadestHash: boolean;
  extraFrontmatter: string;
}

const READEST_SUBPATH = join("com.bilingify.readest", "Readest", "Books");

function defaultMacPath(): string {
  return join(homedir(), "Library", "Application Support", READEST_SUBPATH);
}

function defaultWindowsPath(): string {
  const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(appData, READEST_SUBPATH);
}

function defaultLinuxPath(): string {
  const xdg = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdg, READEST_SUBPATH);
}

export function defaultActivePath(): string {
  switch (process.platform) {
    case "darwin":
      return defaultMacPath();
    case "win32":
      return defaultWindowsPath();
    default:
      return defaultLinuxPath();
  }
}

async function pathHasLibrary(p: string): Promise<boolean> {
  try {
    await access(join(p, "library.json"));
    return true;
  } catch {
    return false;
  }
}

export async function resolveBooksDir(s: ReadestSettings): Promise<string> {
  const userPaths = s.booksDirs.filter((p) => p.length > 0);
  const fallback = defaultActivePath();
  const candidates = userPaths.includes(fallback)
    ? userPaths
    : [...userPaths, fallback];

  for (const candidate of candidates) {
    if (await pathHasLibrary(candidate)) return candidate;
  }
  throw new Error(
    `No Readest library.json found. Checked: ${candidates.join(", ")}`,
  );
}

// Keeps the output folder a safe vault-relative path: strips leading slashes
// (which would mean the vault root) and any "." / ".." segments (which could
// escape the vault). Empty result falls back to the default folder.
export function sanitizeOutputFolder(raw: string): string {
  const segments = raw
    .trim()
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "." && s !== "..");
  return segments.join("/") || DEFAULT_SETTINGS.outputFolder;
}

export const DEFAULT_SETTINGS: ReadestSettings = {
  booksDirs: [],
  outputFolder: "Readest",
  filenameTemplate: "{title} ({year})",
  syncHeadingTemplate: "Highlights",
  syncHeadingLevel: 2,
  appendHeadingTemplate: "{title} by {author}",
  preserveManualEdits: true,
  highlightStyle: "bullet",
  highlightSeparator: "blank",
  showPage: true,
  showColor: false,
  showHighlightCount: false,
  renderUnderlines: true,
  metadataPlacement: "below",
  showNotes: true,
  noteStyle: "attached",
  annotationFilter: "all",
  includeFrontmatter: true,
  frontmatterTags: "Book",
  authorFormat: "wikilink",
  includeYear: true,
  includeIsbn: true,
  includeSeries: true,
  includeGenre: true,
  genreFormat: "plain",
  cleanGenres: true,
  uninvertGenres: false,
  maxGenres: 0,
  includeReadestHash: true,
  extraFrontmatter: "",
};

type FieldToggleKey =
  | "includeYear"
  | "includeIsbn"
  | "includeSeries"
  | "includeGenre"
  | "includeReadestHash";

type TabId = "setup" | "heading" | "frontmatter" | "rendering";

interface ElectronRemote {
  dialog?: {
    showOpenDialog(options: {
      properties: string[];
      defaultPath?: string;
    }): Promise<{ canceled: boolean; filePaths: string[] }>;
  };
}

type PickResult =
  | { available: true; path: string | null }
  | { available: false };

async function pickDirectory(defaultPath?: string): Promise<PickResult> {
  const req = (window as { require?: (m: string) => unknown }).require;
  if (!req) return { available: false };
  const electron = req("electron") as { remote?: ElectronRemote };
  const dialog = electron.remote?.dialog;
  if (!dialog) return { available: false };
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    defaultPath,
  });
  if (result.canceled) return { available: true, path: null };
  return { available: true, path: result.filePaths[0] ?? null };
}

export class ReadestSettingTab extends PluginSettingTab {
  plugin: ReadestHighlightsPlugin;
  private activeTab: TabId = "setup";

  constructor(app: App, plugin: ReadestHighlightsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private renderBooksDirs(container: HTMLElement) {
    container.empty();
    const dirs = this.plugin.settings.booksDirs;
    const rows = dirs.length > 0 ? dirs : [""];

    rows.forEach((value, index) => {
      const setting = new Setting(container).addText((text) =>
        text
          .setPlaceholder("Path to Readest's books folder")
          .setValue(value)
          .onChange(async (v) => {
            const list = [...this.plugin.settings.booksDirs];
            while (list.length <= index) list.push("");
            list[index] = v.trim();
            this.plugin.settings.booksDirs = list;
            await this.plugin.saveSettings();
          }),
      );
      setting.settingEl.addClass("readest-books-dir-row");

      setting.addExtraButton((b) =>
        b
          .setIcon("folder")
          .setTooltip("Browse")
          .onClick(async () => {
            const result = await pickDirectory(
              this.plugin.settings.booksDirs[index] || defaultActivePath(),
            );
            if (!result.available) {
              new Notice(
                "Readest: file picker unavailable; enter path manually.",
              );
              return;
            }
            if (!result.path) return;
            const list = [...this.plugin.settings.booksDirs];
            while (list.length <= index) list.push("");
            list[index] = result.path;
            this.plugin.settings.booksDirs = list;
            await this.plugin.saveSettings();
            this.renderBooksDirs(container);
          }),
      );

      setting.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            const list = [...this.plugin.settings.booksDirs];
            list.splice(index, 1);
            this.plugin.settings.booksDirs = list;
            await this.plugin.saveSettings();
            this.renderBooksDirs(container);
          }),
      );

      const isLast = index === rows.length - 1;
      setting.addExtraButton((b) => {
        b.setIcon("plus")
          .setTooltip("Add path")
          .onClick(async () => {
            const list = [...this.plugin.settings.booksDirs];
            if (list.length === 0) list.push("");
            list.push("");
            this.plugin.settings.booksDirs = list;
            await this.plugin.saveSettings();
            this.renderBooksDirs(container);
          });
        if (!isLast) b.extraSettingsEl.addClass("readest-hidden-button");
      });
    });
  }

  private createSection(container: HTMLElement, title: string): HTMLElement {
    const section = container.createDiv({ cls: "readest-section" });
    new Setting(section).setName(title).setHeading();
    return section;
  }

  private addFieldToggle(
    containerEl: HTMLElement,
    name: string,
    key: FieldToggleKey,
  ): Setting {
    return new Setting(containerEl).setName(name).addToggle((t) =>
      t.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      }),
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const tabs: { id: TabId; label: string }[] = [
      { id: "setup", label: "Setup" },
      { id: "heading", label: "Heading" },
      { id: "frontmatter", label: "Frontmatter" },
      { id: "rendering", label: "Rendering" },
    ];

    const nav = containerEl.createDiv({ cls: "readest-tabs" });
    const panes: Record<TabId, HTMLElement> = {
      setup: containerEl.createDiv({ cls: "readest-pane" }),
      heading: containerEl.createDiv({ cls: "readest-pane" }),
      frontmatter: containerEl.createDiv({ cls: "readest-pane" }),
      rendering: containerEl.createDiv({ cls: "readest-pane" }),
    };

    const buttons: Record<TabId, HTMLButtonElement> = {} as Record<
      TabId,
      HTMLButtonElement
    >;

    const setActive = (id: TabId) => {
      this.activeTab = id;
      for (const t of tabs) {
        buttons[t.id].toggleClass("is-active", t.id === id);
        panes[t.id].toggleClass("is-active", t.id === id);
      }
    };

    for (const t of tabs) {
      const btn = nav.createEl("button", {
        text: t.label,
        cls: "readest-tab",
      });
      buttons[t.id] = btn;
      btn.addEventListener("click", () => setActive(t.id));
    }

    const setup = panes.setup;
    const headingPane = panes.heading;
    const fmPane = panes.frontmatter;
    const renderPane = panes.rendering;

    const source = this.createSection(setup, "Source");
    source.createEl("p", {
      text: "Where Readest stores books. Leave empty to use the platform default; add alternatives for vaults synced across devices, first valid path is used.",
      cls: "setting-item-description",
    });

    const dirsContainer = source.createDiv();
    this.renderBooksDirs(dirsContainer);

    const sync = this.createSection(setup, "Output");
    sync.createEl("p", {
      text: `Templates accept tokens: {title}, {author}, {year}, {series}, {seriesIndex}, {isbn}, {hash}.`,
      cls: "setting-item-description",
    });

    new Setting(sync)
      .setName("Folder")
      .setDesc("Vault folder for book notes.")
      .addText((text) =>
        text
          .setPlaceholder("Readest")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            const safe = sanitizeOutputFolder(value);
            if (safe !== value.trim() && value.trim() !== "") {
              new Notice(
                "Readest: output folder adjusted to a safe vault-relative path.",
              );
            }
            this.plugin.settings.outputFolder = safe;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(sync)
      .setName("Filename template")
      .setDesc("Name for generated book notes.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.filenameTemplate)
          .setValue(this.plugin.settings.filenameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.filenameTemplate =
              value.trim() || DEFAULT_SETTINGS.filenameTemplate;
            await this.plugin.saveSettings();
          }),
      );

    const headingDependent: Setting[] = [];
    const applyHeadingDisabled = (level: number) => {
      for (const s of headingDependent) {
        s.settingEl.toggleClass("readest-disabled", level === 0);
      }
    };

    new Setting(headingPane)
      .setName("Heading level")
      .setDesc(
        "Heading level for sync and append. None omits headings and disables preserve.",
      )
      .addDropdown((d) =>
        d
          .addOption("0", "None")
          .addOption("1", "H1 (#)")
          .addOption("2", "H2 (##)")
          .addOption("3", "H3 (###)")
          .addOption("4", "H4 (####)")
          .setValue(String(this.plugin.settings.syncHeadingLevel))
          .onChange(async (value) => {
            const level = Number(value) as HeadingLevel;
            this.plugin.settings.syncHeadingLevel = level;
            await this.plugin.saveSettings();
            applyHeadingDisabled(level);
          }),
      );

    headingDependent.push(
      new Setting(headingPane)
        .setName("Sync heading")
        .setDesc("Heading above the highlights section.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.syncHeadingTemplate)
            .setValue(this.plugin.settings.syncHeadingTemplate)
            .onChange(async (value) => {
              this.plugin.settings.syncHeadingTemplate =
                value.trim() || DEFAULT_SETTINGS.syncHeadingTemplate;
              await this.plugin.saveSettings();
            }),
        ),
    );

    headingDependent.push(
      new Setting(headingPane)
        .setName("Append heading")
        .setDesc("Heading inserted by the append command.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.appendHeadingTemplate)
            .setValue(this.plugin.settings.appendHeadingTemplate)
            .onChange(async (value) => {
              this.plugin.settings.appendHeadingTemplate =
                value.trim() || DEFAULT_SETTINGS.appendHeadingTemplate;
              await this.plugin.saveSettings();
            }),
        ),
    );

    headingDependent.push(
      new Setting(headingPane)
        .setName("Preserve manual edits")
        .setDesc(
          "On re-sync, only rewrite the section under the sync heading. Other content is kept.",
        )
        .addToggle((t) =>
          t
            .setValue(this.plugin.settings.preserveManualEdits)
            .onChange(async (value) => {
              this.plugin.settings.preserveManualEdits = value;
              await this.plugin.saveSettings();
            }),
        ),
    );
    applyHeadingDisabled(this.plugin.settings.syncHeadingLevel);

    const fm = fmPane;

    const fmDependent: Setting[] = [];
    const genreDependent: Setting[] = [];
    const applyVisibility = () => {
      const fmOn = this.plugin.settings.includeFrontmatter;
      const genreOn = this.plugin.settings.includeGenre;
      for (const s of fmDependent) {
        const isGenreSub = genreDependent.includes(s);
        const visible = fmOn && (!isGenreSub || genreOn);
        s.settingEl.style.display = visible ? "" : "none";
      }
    };

    new Setting(fm)
      .setName("Include frontmatter")
      .setDesc("YAML block at the top of book notes.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.includeFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.includeFrontmatter = value;
            await this.plugin.saveSettings();
            applyVisibility();
          }),
      );

    fmDependent.push(
      new Setting(fm)
        .setName("Tags")
        .setDesc("Comma-separated. Blank omits the property.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.frontmatterTags)
            .setValue(this.plugin.settings.frontmatterTags)
            .onChange(async (value) => {
              this.plugin.settings.frontmatterTags = value;
              await this.plugin.saveSettings();
            }),
        ),
    );

    fmDependent.push(
      new Setting(fm)
        .setName("Author")
        .setDesc("Off, plain text, or wiki-link for backlinks.")
        .addDropdown((d) =>
          d
            .addOption("off", "Off")
            .addOption("plain", "Plain text")
            .addOption("wikilink", "Wiki-link")
            .setValue(this.plugin.settings.authorFormat)
            .onChange(async (value) => {
              this.plugin.settings.authorFormat = value as AuthorFormat;
              await this.plugin.saveSettings();
            }),
        ),
    );

    fmDependent.push(this.addFieldToggle(fm, "Year", "includeYear"));
    fmDependent.push(this.addFieldToggle(fm, "ISBN", "includeIsbn"));
    fmDependent.push(this.addFieldToggle(fm, "Series", "includeSeries"));

    fmDependent.push(
      new Setting(fm)
        .setName("Genre")
        .addToggle((t) =>
          t
            .setValue(this.plugin.settings.includeGenre)
            .onChange(async (value) => {
              this.plugin.settings.includeGenre = value;
              await this.plugin.saveSettings();
              applyVisibility();
            }),
        ),
    );

    const pushGenreSub = (s: Setting) => {
      s.settingEl.addClass("readest-indent");
      fmDependent.push(s);
      genreDependent.push(s);
    };

    pushGenreSub(
      new Setting(fm)
        .setName("Format")
        .setDesc("Plain text, or wiki-link for backlinks.")
        .addDropdown((d) =>
          d
            .addOption("plain", "Plain text")
            .addOption("wikilink", "Wiki-link")
            .setValue(this.plugin.settings.genreFormat)
            .onChange(async (value) => {
              this.plugin.settings.genreFormat = value as GenreFormat;
              await this.plugin.saveSettings();
            }),
        ),
    );

    pushGenreSub(
      new Setting(fm)
        .setName("Max genres")
        .setDesc("Keep at most this many genres in source order. Zero means unlimited.")
        .addText((text) =>
          text
            .setPlaceholder("0")
            .setValue(String(this.plugin.settings.maxGenres))
            .onChange(async (value) => {
              const trimmed = value.trim();
              // An empty field means "unlimited" (0). A non-numeric typo must
              // not silently reset the cap to unlimited - keep the prior value.
              if (trimmed === "") {
                this.plugin.settings.maxGenres = 0;
              } else {
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed)) return;
                this.plugin.settings.maxGenres = Math.max(
                  0,
                  Math.floor(parsed),
                );
              }
              await this.plugin.saveSettings();
            }),
        ),
    );

    pushGenreSub(
      new Setting(fm)
        .setName("Natural order")
        .setDesc(
          "Swap inverted headings like \"state, the\" to \"the state\".",
        )
        .addToggle((t) =>
          t
            .setValue(this.plugin.settings.uninvertGenres)
            .onChange(async (value) => {
              this.plugin.settings.uninvertGenres = value;
              await this.plugin.saveSettings();
            }),
        ),
    );

    pushGenreSub(
      new Setting(fm)
        .setName("Clean names")
        .setDesc(
          "Strip cataloging suffixes from genres, e.g. \"ethics -- early works to 1800\" becomes \"ethics\".",
        )
        .addToggle((t) =>
          t
            .setValue(this.plugin.settings.cleanGenres)
            .onChange(async (value) => {
              this.plugin.settings.cleanGenres = value;
              await this.plugin.saveSettings();
            }),
        ),
    );

    applyVisibility();

    fmDependent.push(
      new Setting(fm)
        .setName("Readest hash")
        .setDesc(
          "Write the book's Readest hash to frontmatter. This is also the identity used to re-find a note when the book is renamed; with it off, a renamed book creates a new note instead of updating the old one.",
        )
        .addToggle((t) =>
          t
            .setValue(this.plugin.settings.includeReadestHash)
            .onChange(async (value) => {
              this.plugin.settings.includeReadestHash = value;
              await this.plugin.saveSettings();
            }),
        ),
    );

    fmDependent.push(
      new Setting(fm)
        .setName("Extra fields")
        .setDesc(
          "Free-form YAML appended inside frontmatter. Lines containing only '---' are stripped to keep the block valid.",
        )
        .addTextArea((t) => {
          t.setPlaceholder("Rating: 5\nreview: thoughts")
            .setValue(this.plugin.settings.extraFrontmatter)
            .onChange(async (value) => {
              this.plugin.settings.extraFrontmatter = value;
              await this.plugin.saveSettings();
            });
          t.inputEl.rows = 4;
          t.inputEl.addClass("readest-extra-frontmatter");
        }),
    );


    const hl = this.createSection(renderPane, "Highlights");

    new Setting(hl)
      .setName("Filter")
      .setDesc("Which annotations to include.")
      .addDropdown((d) =>
        d
          .addOption("all", "All annotations")
          .addOption("highlights", "Only highlights")
          .addOption("underlines", "Only underlines")
          .addOption("withNotes", "Only with notes")
          .setValue(this.plugin.settings.annotationFilter)
          .onChange(async (value) => {
            this.plugin.settings.annotationFilter = value as AnnotationFilter;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(hl)
      .setName("Style")
      .addDropdown((d) =>
        d
          .addOption("blockquote", "Blockquote (> text)")
          .addOption("plain", "Plain text")
          .addOption("callout", "Callout (> [!quote])")
          .addOption("bullet", "Bullet (- text)")
          .setValue(this.plugin.settings.highlightStyle)
          .onChange(async (value) => {
            this.plugin.settings.highlightStyle = value as HighlightStyle;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(hl)
      .setName("Separator")
      .addDropdown((d) =>
        d
          .addOption("rule", "Horizontal rule (---)")
          .addOption("blank", "Blank line")
          .addOption("pageHeading", "Group under page headings")
          .addOption("none", "None")
          .setValue(this.plugin.settings.highlightSeparator)
          .onChange(async (value) => {
            this.plugin.settings.highlightSeparator =
              value as HighlightSeparator;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(hl)
      .setName("Show count")
      .setDesc(
        "Add a line under the highlights heading with the number of highlights included.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showHighlightCount)
          .onChange(async (value) => {
            this.plugin.settings.showHighlightCount = value;
            await this.plugin.saveSettings();
          }),
      );

    const meta = this.createSection(renderPane, "Metadata");
    meta.createEl("p", {
      text: "Extra details shown with each highlight.",
      cls: "setting-item-description",
    });

    new Setting(meta)
      .setName("Page number")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showPage)
          .onChange(async (value) => {
            this.plugin.settings.showPage = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(meta)
      .setName("Color")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showColor)
          .onChange(async (value) => {
            this.plugin.settings.showColor = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(meta)
      .setName("Render underlines")
      .setDesc("Wrap underlined annotations in <u>…</u> so they render underlined.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.renderUnderlines)
          .onChange(async (value) => {
            this.plugin.settings.renderUnderlines = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(meta)
      .setName("Placement")
      .setDesc("Inline with highlight or on its own line below.")
      .addDropdown((d) =>
        d
          .addOption("below", "Below highlight")
          .addOption("inline", "Inline with highlight")
          .setValue(this.plugin.settings.metadataPlacement)
          .onChange(async (value) => {
            this.plugin.settings.metadataPlacement =
              value as MetadataPlacement;
            await this.plugin.saveSettings();
          }),
      );

    const notes = this.createSection(renderPane, "Notes");

    new Setting(notes)
      .setName("Show notes")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showNotes)
          .onChange(async (value) => {
            this.plugin.settings.showNotes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(notes)
      .setName("Placement")
      .addDropdown((d) =>
        d
          .addOption("attached", "Attached (inside the highlight)")
          .addOption("separated", "Separated (below, plain)")
          .addOption("callout", "Callout (below, as [!note])")
          .setValue(this.plugin.settings.noteStyle)
          .onChange(async (value) => {
            this.plugin.settings.noteStyle = value as NoteStyle;
            await this.plugin.saveSettings();
          }),
      );

    setActive(this.activeTab);
  }
}
