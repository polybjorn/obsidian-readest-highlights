import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import { access } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type ReadestHighlightsPlugin from "./main";
import type { AnnotationFilter } from "./filters";

export type HighlightStyle = "blockquote" | "plain" | "callout" | "bullet";
export type HighlightSeparator = "rule" | "blank" | "pageHeading" | "none";
export type HeadingLevel = 0 | 1 | 2 | 3 | 4;
export type AuthorFormat = "off" | "plain" | "wikilink";
export type LinkFormat = "plain" | "wikilink";
export type GenreFormat = LinkFormat;
export type NoteStyle = "attached" | "separated" | "callout";
export type HighlightSortOrder = "page" | "date";
export type MetadataPlacement = "below" | "inline";
export type { AnnotationFilter };

export interface ReadestSettings {
  booksDirs: string[];
  outputFolder: string;
  autoSyncOnStartup: boolean;
  autoSyncIntervalMinutes: number;
  filenameTemplate: string;
  syncHeadingTemplate: string;
  syncHeadingLevel: HeadingLevel;
  appendHeadingTemplate: string;
  preserveManualEdits: boolean;
  highlightStyle: HighlightStyle;
  highlightSeparator: HighlightSeparator;
  highlightSortOrder: HighlightSortOrder;
  showPage: boolean;
  showColor: boolean;
  showHighlightCount: boolean;
  collapseHighlightLineBreaks: boolean;
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
  seriesFormat: AuthorFormat;
  publisherFormat: AuthorFormat;
  includeLanguage: boolean;
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
  autoSyncOnStartup: false,
  autoSyncIntervalMinutes: 0,
  filenameTemplate: "{title} ({year})",
  syncHeadingTemplate: "Highlights",
  syncHeadingLevel: 2,
  appendHeadingTemplate: "{title} by {author}",
  preserveManualEdits: true,
  highlightStyle: "bullet",
  highlightSeparator: "blank",
  highlightSortOrder: "page",
  showPage: true,
  showColor: false,
  showHighlightCount: false,
  collapseHighlightLineBreaks: false,
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
  seriesFormat: "plain",
  // New fields default off so notes created after an upgrade keep the same
  // frontmatter shape unless the user opts in.
  publisherFormat: "off",
  includeLanguage: false,
  includeGenre: true,
  genreFormat: "plain",
  cleanGenres: true,
  uninvertGenres: false,
  maxGenres: 0,
  includeReadestHash: true,
  extraFrontmatter: "",
};

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

  constructor(app: App, plugin: ReadestHighlightsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    // Dropdown controls bind strings; the setting stores a number.
    if (key === "syncHeadingLevel") return String(s.syncHeadingLevel);
    return s[key as keyof ReadestSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    switch (key) {
      case "outputFolder": {
        const raw = String(value);
        const safe = sanitizeOutputFolder(raw);
        if (safe !== raw.trim() && raw.trim() !== "") {
          new Notice(
            "Readest: output folder adjusted to a safe vault-relative path.",
          );
        }
        s.outputFolder = safe;
        break;
      }
      case "filenameTemplate":
      case "syncHeadingTemplate":
      case "appendHeadingTemplate": {
        s[key] = String(value).trim() || DEFAULT_SETTINGS[key];
        break;
      }
      case "syncHeadingLevel": {
        s.syncHeadingLevel = Number(value) as HeadingLevel;
        break;
      }
      case "autoSyncIntervalMinutes":
      case "maxGenres": {
        // An unparsable value must not silently reset the number; keep the
        // prior value instead of persisting garbage.
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return;
        s[key] = Math.max(0, Math.floor(parsed));
        break;
      }
      default: {
        (s as unknown as Record<string, unknown>)[key] = value;
      }
    }
    await this.plugin.saveSettings();
    if (key === "autoSyncIntervalMinutes") {
      this.plugin.applyAutoSyncInterval();
    }
    if (
      key === "syncHeadingLevel" ||
      key === "includeFrontmatter" ||
      key === "includeGenre"
    ) {
      this.refreshDomState();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "page",
        name: "Setup",
        desc: "Source folders, output location, auto-sync.",
        items: this.setupItems(),
      },
      {
        type: "page",
        name: "Heading",
        desc: "Headings for synced and appended sections.",
        items: this.headingItems(),
      },
      {
        type: "page",
        name: "Frontmatter",
        desc: "YAML properties written to book notes.",
        items: this.frontmatterItems(),
      },
      {
        type: "page",
        name: "Rendering",
        desc: "How highlights, metadata, and notes are formatted.",
        items: this.renderingItems(),
      },
    ];
  }

  private booksDirRow(index: number): SettingGroupItem {
    return {
      name: "",
      searchable: false,
      render: (setting: Setting) => {
        setting.settingEl.addClass("readest-books-dir-row");
        setting.addText((text) =>
          text
            .setPlaceholder("Path to Readest's books folder")
            .setValue(this.plugin.settings.booksDirs[index] ?? "")
            .onChange(async (v) => {
              this.plugin.settings.booksDirs[index] = v.trim();
              await this.plugin.saveSettings();
            }),
        );
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
              this.plugin.settings.booksDirs[index] = result.path;
              await this.plugin.saveSettings();
              this.update();
            }),
        );
      },
    };
  }

  private setupItems(): SettingDefinitionItem[] {
    return [
      {
        type: "list",
        heading: "Source",
        emptyState: "Using the platform default location.",
        items: this.plugin.settings.booksDirs.map((_, index) =>
          this.booksDirRow(index),
        ),
        addItem: {
          name: "Add path",
          action: () => {
            void (async () => {
              this.plugin.settings.booksDirs.push("");
              await this.plugin.saveSettings();
              this.update();
            })();
          },
        },
        onDelete: (index) => {
          void (async () => {
            this.plugin.settings.booksDirs.splice(index, 1);
            await this.plugin.saveSettings();
            this.update();
          })();
        },
      },
      {
        name: "",
        searchable: false,
        render: (setting: Setting) => {
          setting.setDesc(
            "Where Readest stores books. Leave empty to use the platform default; add alternatives for vaults synced across devices, first valid path is used.",
          );
          setting.settingEl.addClass("readest-info-row");
        },
      },
      {
        type: "group",
        heading: "Output",
        items: [
          {
            name: "Folder",
            desc: "Vault folder for book notes.",
            control: {
              type: "text",
              key: "outputFolder",
              placeholder: DEFAULT_SETTINGS.outputFolder,
            },
          },
          {
            name: "Filename template",
            desc: "Name for generated book notes. Tokens: {title}, {author}, {year}, {series}, {seriesIndex}, {isbn}, {hash}.",
            control: {
              type: "text",
              key: "filenameTemplate",
              placeholder: DEFAULT_SETTINGS.filenameTemplate,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Auto-sync",
        items: [
          {
            name: "Sync on startup",
            desc: "Run a sync of all books at startup, notifying only when something changed.",
            control: { type: "toggle", key: "autoSyncOnStartup" },
          },
          {
            name: "Sync interval",
            desc: "Re-sync all books this often (minutes) while the app is open, zero disables it.",
            control: {
              type: "number",
              key: "autoSyncIntervalMinutes",
              placeholder: "0",
              min: 0,
              step: 1,
            },
          },
        ],
      },
    ];
  }

  private headingItems(): SettingDefinitionItem[] {
    const noHeading = () => this.plugin.settings.syncHeadingLevel === 0;
    return [
      {
        name: "Heading level",
        desc: "Heading level for sync and append. None omits headings and disables preserve.",
        control: {
          type: "dropdown",
          key: "syncHeadingLevel",
          options: {
            "0": "None",
            "1": "H1 (#)",
            "2": "H2 (##)",
            "3": "H3 (###)",
            "4": "H4 (####)",
          },
        },
      },
      {
        name: "Sync heading",
        desc: "Heading above the highlights section. Tokens: {title}, {author}, {year}, {series}, {seriesIndex}, {isbn}, {hash}.",
        control: {
          type: "text",
          key: "syncHeadingTemplate",
          placeholder: DEFAULT_SETTINGS.syncHeadingTemplate,
          disabled: noHeading,
        },
      },
      {
        name: "Append heading",
        desc: "Heading inserted by the append command. Accepts the same tokens.",
        control: {
          type: "text",
          key: "appendHeadingTemplate",
          placeholder: DEFAULT_SETTINGS.appendHeadingTemplate,
          disabled: noHeading,
        },
      },
      {
        name: "Preserve manual edits",
        desc: "On re-sync, only rewrite the section under the sync heading. Other content is kept.",
        control: {
          type: "toggle",
          key: "preserveManualEdits",
          disabled: noHeading,
        },
      },
    ];
  }

  private frontmatterItems(): SettingDefinitionItem[] {
    const fmOn = () => this.plugin.settings.includeFrontmatter;
    const genreOn = () => fmOn() && this.plugin.settings.includeGenre;
    const linkableOptions = {
      off: "Off",
      plain: "Plain text",
      wikilink: "Wiki-link",
    };
    return [
      {
        name: "Include frontmatter",
        desc: "YAML block at the top of book notes.",
        control: { type: "toggle", key: "includeFrontmatter" },
      },
      {
        name: "Tags",
        desc: "Comma-separated. Blank omits the property.",
        visible: fmOn,
        control: {
          type: "text",
          key: "frontmatterTags",
          placeholder: DEFAULT_SETTINGS.frontmatterTags,
        },
      },
      {
        name: "Author",
        desc: "Off, plain text, or wiki-link for backlinks.",
        visible: fmOn,
        control: {
          type: "dropdown",
          key: "authorFormat",
          options: linkableOptions,
        },
      },
      {
        name: "Series",
        desc: "Off, plain text, or wiki-link for backlinks.",
        visible: fmOn,
        control: {
          type: "dropdown",
          key: "seriesFormat",
          options: linkableOptions,
        },
      },
      {
        name: "Publisher",
        desc: "Off, plain text, or wiki-link for backlinks.",
        visible: fmOn,
        control: {
          type: "dropdown",
          key: "publisherFormat",
          options: linkableOptions,
        },
      },
      {
        name: "Year",
        visible: fmOn,
        control: { type: "toggle", key: "includeYear" },
      },
      {
        name: "ISBN",
        visible: fmOn,
        control: { type: "toggle", key: "includeIsbn" },
      },
      {
        name: "Language",
        visible: fmOn,
        control: { type: "toggle", key: "includeLanguage" },
      },
      {
        name: "Genre",
        visible: fmOn,
        control: { type: "toggle", key: "includeGenre" },
      },
      {
        type: "group",
        cls: "readest-indent",
        visible: genreOn,
        items: [
          {
            name: "Format",
            desc: "Plain text, or wiki-link for backlinks.",
            control: {
              type: "dropdown",
              key: "genreFormat",
              options: { plain: "Plain text", wikilink: "Wiki-link" },
            },
          },
          {
            name: "Max genres",
            desc: "Keep at most this many genres in source order. Zero means unlimited.",
            control: {
              type: "number",
              key: "maxGenres",
              placeholder: "0",
              min: 0,
              step: 1,
            },
          },
          {
            name: "Natural order",
            desc: 'Swap inverted headings like "state, the" to "the state".',
            control: { type: "toggle", key: "uninvertGenres" },
          },
          {
            name: "Clean names",
            desc: 'Strip cataloging suffixes from genres, e.g. "ethics -- early works to 1800" becomes "ethics".',
            control: { type: "toggle", key: "cleanGenres" },
          },
        ],
      },
      {
        name: "Readest hash",
        desc: "Write the book's Readest hash to frontmatter. This is also the identity used to re-find a note when the book is renamed; with it off, a renamed book creates a new note instead of updating the old one.",
        visible: fmOn,
        control: { type: "toggle", key: "includeReadestHash" },
      },
      {
        name: "Extra fields",
        desc: "Free-form YAML appended inside frontmatter. Lines containing only '---' are stripped to keep the block valid.",
        visible: fmOn,
        control: {
          type: "textarea",
          key: "extraFrontmatter",
          placeholder: "Rating: 5\nreview: thoughts",
          rows: 4,
        },
      },
    ];
  }

  private renderingItems(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Highlights",
        items: [
          {
            name: "Filter",
            desc: "Which annotations to include.",
            control: {
              type: "dropdown",
              key: "annotationFilter",
              options: {
                all: "All annotations",
                highlights: "Only highlights",
                underlines: "Only underlines",
                withNotes: "Only with notes",
              },
            },
          },
          {
            name: "Style",
            control: {
              type: "dropdown",
              key: "highlightStyle",
              options: {
                blockquote: "Blockquote (> text)",
                plain: "Plain text",
                callout: "Callout (> [!quote])",
                bullet: "Bullet (- text)",
              },
            },
          },
          {
            name: "Collapse line breaks",
            desc: "Replace line breaks inside highlight text with spaces.",
            control: { type: "toggle", key: "collapseHighlightLineBreaks" },
          },
          {
            name: "Sort order",
            desc: "Order of highlights in the note: by position in the book, or by when you made them.",
            control: {
              type: "dropdown",
              key: "highlightSortOrder",
              options: { page: "Book position", date: "Highlight date" },
            },
          },
          {
            name: "Separator",
            control: {
              type: "dropdown",
              key: "highlightSeparator",
              options: {
                rule: "Horizontal rule (---)",
                blank: "Blank line",
                pageHeading: "Group under page headings",
                none: "None",
              },
            },
          },
          {
            name: "Show count",
            desc: "Add a line under the highlights heading with the number of highlights included.",
            control: { type: "toggle", key: "showHighlightCount" },
          },
        ],
      },
      {
        type: "group",
        heading: "Metadata",
        items: [
          {
            name: "",
            searchable: false,
            render: (setting: Setting) => {
              setting.setDesc("Extra details shown with each highlight.");
              setting.settingEl.addClass("readest-info-row");
            },
          },
          {
            name: "Page number",
            control: { type: "toggle", key: "showPage" },
          },
          {
            name: "Color",
            control: { type: "toggle", key: "showColor" },
          },
          {
            name: "Render underlines",
            desc: "Wrap underlined annotations in <u>…</u> so they render underlined.",
            control: { type: "toggle", key: "renderUnderlines" },
          },
          {
            name: "Placement",
            desc: "Inline with highlight or on its own line below.",
            control: {
              type: "dropdown",
              key: "metadataPlacement",
              options: {
                below: "Below highlight",
                inline: "Inline with highlight",
              },
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Notes",
        items: [
          {
            name: "Show notes",
            control: { type: "toggle", key: "showNotes" },
          },
          {
            name: "Placement",
            control: {
              type: "dropdown",
              key: "noteStyle",
              options: {
                attached: "Attached (inside the highlight)",
                separated: "Separated (below, plain)",
                callout: "Callout (below, as [!note])",
              },
            },
          },
        ],
      },
    ];
  }
}
