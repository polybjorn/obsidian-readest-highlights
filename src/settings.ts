import {
  App,
  ConfirmationModal,
  debounce,
  Notice,
  parseYaml,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import { access, readFile } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join, normalize, relative } from "path";
import type ReadestHighlightsPlugin from "./main";
import type { AnnotationFilter } from "./filters";

export type HighlightStyle = "blockquote" | "plain" | "callout" | "bullet";
export type HighlightSeparator = "rule" | "blank" | "none";
export type HighlightGrouping = "none" | "page" | "chapter";
export type HeadingLevel = 0 | 1 | 2 | 3 | 4;
export type AuthorFormat = "off" | "plain" | "wikilink";
export type LinkFormat = "plain" | "wikilink";
export type GenreFormat = LinkFormat;
export type GenreDestination = "genre" | "tags" | "nested-tags";
export type NoteStyle = "attached" | "separated" | "callout";
export type HighlightSortOrder = "page" | "date";
export type MetadataPlacement = "below" | "inline";
export type ReadestLinkType = "off" | "web" | "app";
export type ReadestLinkPlacement = "line" | "page";
export type { AnnotationFilter };

export interface ReadestSettings {
  booksDirs: string[];
  outputFolder: string;
  coverFolder: string;
  autoSyncOnStartup: boolean;
  autoSyncIntervalMinutes: number;
  filenameTemplate: string;
  syncHeadingTemplate: string;
  syncHeadingLevel: HeadingLevel;
  appendHeadingTemplate: string;
  preserveManualEdits: boolean;
  highlightStyle: HighlightStyle;
  colorCallouts: boolean;
  highlightSeparator: HighlightSeparator;
  highlightGrouping: HighlightGrouping;
  highlightSortOrder: HighlightSortOrder;
  showPage: boolean;
  showColor: boolean;
  showHighlightCount: boolean;
  collapseHighlightLineBreaks: boolean;
  renderUnderlines: boolean;
  metadataPlacement: MetadataPlacement;
  showNotes: boolean;
  noteStyle: NoteStyle;
  highlightBlockIds: boolean;
  readestLink: ReadestLinkType;
  readestLinkPlacement: ReadestLinkPlacement;
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
  genreDestination: GenreDestination;
  includeReadestHash: boolean;
  extraFrontmatter: string;
}

const READEST_APP_ID = "com.bilingify.readest";
const READEST_SUBPATH = join(READEST_APP_ID, "Readest", "Books");

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

// Tauri's app config directory for Readest, where it keeps settings.json.
function readestConfigDir(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", READEST_APP_ID);
    case "win32":
      return join(
        process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
        READEST_APP_ID,
      );
    default:
      return join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        READEST_APP_ID,
      );
  }
}

// Readest's settings.json stays in its config directory when the data location
// is moved, and records where the books folder went. Any failure returns null
// so a missing or changed settings file falls through to the default path.
export async function readestRecordedBooksDir(
  configDir: string = readestConfigDir(),
): Promise<string | null> {
  try {
    const raw = await readFile(join(configDir, "settings.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const dir = (parsed as { localBooksDir?: unknown }).localBooksDir;
    return typeof dir === "string" && dir.length > 0 ? normalize(dir) : null;
  } catch {
    return null;
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

// Readest's data folder holds its library in Readest/Books, and a folder picked
// by hand may stop one level short of it, so a listed path need not be exact.
const LIBRARY_SUBFOLDERS = ["", "Books", join("Readest", "Books")];

async function findLibraryUnder(p: string): Promise<string | null> {
  for (const sub of LIBRARY_SUBFOLDERS) {
    const dir = sub ? join(p, sub) : p;
    if (await pathHasLibrary(dir)) return dir;
  }
  return null;
}

// True when `dir` is one of the listed paths or a folder inside one.
export function pathIsListed(dir: string, listed: string[]): boolean {
  return listed.some((p) => {
    const rel = relative(p, dir);
    return !rel.startsWith("..") && !isAbsolute(rel);
  });
}

export async function resolveBooksDir(
  s: ReadestSettings,
  recorded: Promise<string | null> = readestRecordedBooksDir(),
): Promise<string> {
  const userPaths = s.booksDirs.filter((p) => p.length > 0);
  const fallbacks = [await recorded, defaultActivePath()].filter(
    (p): p is string => p !== null,
  );
  const candidates = [...new Set([...userPaths, ...fallbacks])];

  for (const path of userPaths) {
    const found = await findLibraryUnder(path);
    if (found) return found;
  }
  for (const candidate of fallbacks) {
    if (await pathHasLibrary(candidate)) return candidate;
  }
  throw new Error(
    `No Readest library.json found. Checked: ${candidates.join(", ")}. Add the folder that contains library.json under Source in the plugin settings.`,
  );
}

// Keeps a folder setting a safe vault-relative path: strips leading slashes
// (which would mean the vault root) and any "." / ".." segments (which could
// escape the vault). May return empty.
export function sanitizeVaultFolder(raw: string): string {
  return raw
    .trim()
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "." && s !== "..")
    .join("/");
}

// The output folder can't be empty: that falls back to the default folder.
export function sanitizeOutputFolder(raw: string): string {
  return sanitizeVaultFolder(raw) || DEFAULT_SETTINGS.outputFolder;
}

export const DEFAULT_SETTINGS: ReadestSettings = {
  booksDirs: [],
  outputFolder: "Readest",
  // Empty turns cover copying off, so an upgrade writes no new files.
  coverFolder: "",
  autoSyncOnStartup: false,
  autoSyncIntervalMinutes: 0,
  filenameTemplate: "{title} ({year})",
  syncHeadingTemplate: "Highlights",
  syncHeadingLevel: 2,
  appendHeadingTemplate: "{title} by {author}",
  preserveManualEdits: true,
  highlightStyle: "bullet",
  colorCallouts: false,
  highlightSeparator: "blank",
  highlightGrouping: "none",
  highlightSortOrder: "page",
  showPage: true,
  showColor: false,
  showHighlightCount: false,
  collapseHighlightLineBreaks: false,
  renderUnderlines: true,
  metadataPlacement: "below",
  showNotes: true,
  noteStyle: "attached",
  highlightBlockIds: false,
  readestLink: "off",
  readestLinkPlacement: "line",
  annotationFilter: "all",
  includeFrontmatter: true,
  frontmatterTags: "book",
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
  genreDestination: "genre",
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

export function confirmReset(app: App, onConfirm: () => Promise<void>): void {
  new ConfirmationModal(app)
    .setTitle("Reset settings to defaults?")
    .setContent(
      "This can't be undone. Your book notes stay as they are until the next sync, which rewrites them with the default formatting.",
    )
    .addButton((b) =>
      b
        .setButtonText("Reset")
        .setDestructive()
        .onClick(async () => {
          await onConfirm();
        }),
    )
    .addCancelButton()
    .open();
}

export class ReadestSettingTab extends PluginSettingTab {
  plugin: ReadestHighlightsPlugin;

  // Text controls commit on every keystroke, so typing "../x" walks through
  // intermediate values ("." then "..") that each get sanitized. Collapse the
  // warning into one notice per editing burst instead of one per character.
  private readonly notifyFolderSanitized = debounce(
    () => {
      new Notice(
        "Readest: folder adjusted to a safe vault-relative path.",
      );
    },
    800,
    true,
  );

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
        const raw = String(value).trim();
        const safe = sanitizeOutputFolder(raw);
        if (safe !== raw && raw !== "") {
          this.notifyFolderSanitized();
        } else {
          // A pending warning from an intermediate value ("My/" on the way to
          // "My/Folder") must not fire once the value is clean again.
          this.notifyFolderSanitized.cancel();
        }
        s.outputFolder = safe;
        break;
      }
      case "coverFolder": {
        const raw = String(value).trim();
        const safe = sanitizeVaultFolder(raw);
        if (safe !== raw) this.notifyFolderSanitized();
        else this.notifyFolderSanitized.cancel();
        s.coverFolder = safe;
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
  }

  // Keeps the source paths and the output folder: a reset that moved the
  // output folder would make the next sync miss existing notes and write
  // duplicates. Mutates in place so nothing holding the settings object goes
  // stale.
  async resetToDefaults(): Promise<void> {
    const { booksDirs, outputFolder } = this.plugin.settings;
    Object.assign(this.plugin.settings, DEFAULT_SETTINGS, {
      booksDirs,
      outputFolder,
    });
    await this.plugin.saveSettings();
    this.plugin.applyAutoSyncInterval();
    this.update();
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
      // A group of its own, spaced off the pages, so the reset does not read
      // as one of them and is harder to hit by accident.
      {
        type: "group",
        cls: "readest-reset-group",
        items: [
          {
            name: "Reset to defaults",
            desc: "Restore every setting to its default. Source paths and the output folder are kept.",
            aliases: ["restore", "default"],
            render: (setting: Setting) => {
              setting.setName("Reset to defaults");
              setting.setDesc(
                "Restore every setting to its default. Source paths and the output folder are kept.",
              );
              setting.addButton((b) => {
                b.setButtonText("Reset")
                  .setDestructive()
                  .onClick(() => {
                    confirmReset(this.app, () => this.resetToDefaults());
                  });
              });
            },
          },
        ],
      },
    ];
  }

  private booksDirRow(index: number): SettingGroupItem {
    return {
      name: "",
      searchable: false,
      render: (setting: Setting) => {
        setting.settingEl.addClass("readest-books-dir-row");
        // The list is shared by every device the vault syncs to, so a path
        // with no library here may be right elsewhere: mark it, never drop it.
        const missingEl = setting.settingEl.createDiv({
          cls: "readest-inline-error",
        });
        let latest = "";
        const markMissing = async (path: string) => {
          latest = path;
          missingEl.setText("");
          if (!path) return;
          const found = await findLibraryUnder(path);
          // A slow check for an earlier keystroke must not overwrite a newer one.
          if (latest !== path || found) return;
          missingEl.setText(
            "No Readest library here on this device, so sync skips this path.",
          );
        };
        setting.addText((text) =>
          text
            .setPlaceholder("Path to Readest's books folder")
            .setValue(this.plugin.settings.booksDirs[index] ?? "")
            .onChange(async (v) => {
              this.plugin.settings.booksDirs[index] = v.trim();
              await this.plugin.saveSettings();
              await markMissing(v.trim());
            }),
        );
        void markMissing(this.plugin.settings.booksDirs[index] ?? "");
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
        emptyState: "No paths: the plugin finds Readest's library itself.",
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
        onReorder: (oldIndex, newIndex) => {
          void (async () => {
            const dirs = this.plugin.settings.booksDirs;
            const [moved] = dirs.splice(oldIndex, 1);
            if (moved === undefined) return;
            dirs.splice(newIndex, 0, moved);
            await this.plugin.saveSettings();
            this.update();
          })();
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
              type: "folder",
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
          {
            name: "Cover folder",
            desc: "Vault folder to copy book covers into, for the {cover} token in Extra fields. Leave empty to copy none.",
            control: {
              type: "folder",
              key: "coverFolder",
              placeholder: "Off",
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

  // Mirrors the renderer's extra-frontmatter handling ({token} substitution,
  // lone '---' stripping) so the check sees what actually reaches the YAML
  // block. Rejects hard parse errors and non-mapping results (e.g. a missing
  // colon); does not mutate the stored value.
  private validateExtraFrontmatter(value: string): string | void {
    const probe = value
      .replace(/\{(\w+)\}/g, "x")
      .split("\n")
      .filter((l) => l.trim() !== "---")
      .join("\n")
      .trim();
    if (!probe) return;
    let parsed: unknown;
    try {
      parsed = parseYaml(probe);
    } catch (e) {
      const raw =
        (e instanceof Error ? e.message.split("\n")[0] : "") || "parse error";
      const msg = raw.replace(/\s*at line \d+, column \d+:?\s*$/, "");
      return `Invalid YAML: ${msg}`;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Extra fields must be YAML key: value pairs.";
    }
  }

  private frontmatterItems(): SettingDefinitionItem[] {
    const fmOn = () => this.plugin.settings.includeFrontmatter;
    const genreOn = () => fmOn() && this.plugin.settings.includeGenre;
    const genrePropertyOn = () =>
      genreOn() && this.plugin.settings.genreDestination === "genre";
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
            name: "Destination",
            desc: "Where genres are written.",
            control: {
              type: "dropdown",
              key: "genreDestination",
              options: {
                genre: "Genre property",
                tags: "Tags: #science-fiction",
                "nested-tags": "Nested tags: #genre/science-fiction",
              },
            },
          },
          {
            name: "Format",
            desc: "Plain text, or wiki-link for backlinks.",
            visible: genrePropertyOn,
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
        desc: "Write the book's Readest hash to frontmatter. Also the identity for re-finding a note after a rename; off means a renamed book creates a new note.",
        visible: fmOn,
        control: { type: "toggle", key: "includeReadestHash" },
      },
      {
        name: "Extra fields",
        desc: "Free-form YAML appended to frontmatter. Tokens like {title}, {hash} are substituted; lone '---' lines are stripped.",
        visible: fmOn,
        render: (setting: Setting) => {
          setting.setName("Extra fields");
          setting.setDesc(
            "Free-form YAML appended to frontmatter. Tokens like {title}, {hash} are substituted; lone '---' lines are stripped.",
          );
          const errorEl = setting.descEl.createDiv({
            cls: "readest-inline-error",
          });
          const refreshError = (v: string) => {
            errorEl.setText(this.validateExtraFrontmatter(v) ?? "");
          };
          setting.addTextArea((ta) => {
            ta.setPlaceholder("Rating: 5\nreview: thoughts")
              .setValue(this.plugin.settings.extraFrontmatter)
              .onChange(async (v) => {
                this.plugin.settings.extraFrontmatter = v;
                await this.plugin.saveSettings();
                refreshError(v);
              });
            ta.inputEl.rows = 4;
          });
          refreshError(this.plugin.settings.extraFrontmatter);
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
            aliases: ["annotations"],
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
            name: "Callout per color",
            desc: "Use a callout type per Readest highlight color, such as [!quote-yellow]. Needs this plugin's styles to show the color.",
            aliases: ["colour"],
            visible: () => this.plugin.settings.highlightStyle === "callout",
            control: { type: "toggle", key: "colorCallouts" },
          },
          {
            name: "Collapse line breaks",
            desc: "Replace line breaks inside highlight text with spaces.",
            aliases: ["newline", "wrap"],
            control: { type: "toggle", key: "collapseHighlightLineBreaks" },
          },
          {
            name: "Sort order",
            desc: "By position in the book, or by when you made them.",
            control: {
              type: "dropdown",
              key: "highlightSortOrder",
              options: { page: "Book position", date: "Highlight date" },
            },
          },
          {
            name: "Group by",
            desc: "Group highlights under page or chapter headings. Chapter titles need the book opened once in Readest.",
            aliases: ["chapters", "pages"],
            control: {
              type: "dropdown",
              key: "highlightGrouping",
              options: {
                none: "No grouping",
                page: "Page headings",
                chapter: "Chapter headings",
              },
            },
          },
          {
            name: "Separator",
            desc: "Between highlights, also within groups.",
            aliases: ["divider"],
            control: {
              type: "dropdown",
              key: "highlightSeparator",
              options: {
                rule: "Horizontal rule (---)",
                blank: "Blank line",
                none: "None",
              },
            },
          },
          {
            name: "Show count",
            desc: "Show the highlight count under the heading.",
            control: { type: "toggle", key: "showHighlightCount" },
          },
          {
            name: "Block IDs",
            desc: "Add a stable ^id under each highlight to link to it from other notes. Shown in source view, hidden in reading view.",
            aliases: ["anchor", "reference"],
            control: { type: "toggle", key: "highlightBlockIds" },
          },
          {
            name: "Readest link",
            desc: "Add an 'Open in Readest' link under each highlight that jumps to it in the app.",
            aliases: ["deep link", "open in app"],
            control: {
              type: "dropdown",
              key: "readestLink",
              options: {
                off: "Off",
                web: "Web link (web.readest.com)",
                app: "App link (readest://)",
              },
            },
          },
          {
            name: "Readest link placement",
            desc: "Put the link on its own line, or on the page label. A highlight with no page label keeps the link on its own line.",
            visible: () => this.plugin.settings.readestLink !== "off",
            control: {
              type: "dropdown",
              key: "readestLinkPlacement",
              options: {
                line: "Own line",
                page: "Page label",
              },
            },
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
