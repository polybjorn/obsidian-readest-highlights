import { App, PluginSettingTab, Setting } from "obsidian";
import { access } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type ReadestHighlightsPlugin from "./main";

export type HighlightStyle = "blockquote" | "plain" | "callout" | "bullet";
export type HighlightSeparator = "rule" | "blank" | "pageHeading" | "none";
export type HeadingLevel = 0 | 1 | 2 | 3 | 4;
export type AuthorFormat = "off" | "plain" | "wikilink";
export type NoteStyle = "attached" | "separated" | "callout";
export type MetadataPlacement = "below" | "inline";
export type AnnotationFilter =
  | "all"
  | "highlights"
  | "underlines"
  | "withNotes"
  | "marked";

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
  const candidates = s.booksDirs.filter((p) => p.length > 0);
  if (candidates.length === 0) candidates.push(defaultActivePath());

  for (const candidate of candidates) {
    if (await pathHasLibrary(candidate)) return candidate;
  }
  throw new Error(
    `No Readest library.json found. Checked: ${candidates.join(", ")}`,
  );
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

async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const req = (window as { require?: (m: string) => unknown }).require;
  if (!req) return null;
  const electron = req("electron") as { remote?: ElectronRemote };
  const dialog = electron.remote?.dialog;
  if (!dialog) return null;
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    defaultPath,
  });
  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
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
          .setPlaceholder("Path to Readest Books folder")
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
            const picked = await pickDirectory(
              this.plugin.settings.booksDirs[index] || defaultActivePath(),
            );
            if (!picked) return;
            const list = [...this.plugin.settings.booksDirs];
            while (list.length <= index) list.push("");
            list[index] = picked;
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
      text: "Path to Readest's book folder. Add alternatives for vaults synced across devices; first valid path is used.",
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
            this.plugin.settings.outputFolder = value.trim();
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
                value || DEFAULT_SETTINGS.appendHeadingTemplate;
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
    const applyFmDisabled = (enabled: boolean) => {
      for (const s of fmDependent) {
        s.settingEl.toggleClass("readest-disabled", !enabled);
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
            applyFmDisabled(value);
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
    fmDependent.push(this.addFieldToggle(fm, "Genre", "includeGenre"));
    fmDependent.push(
      this.addFieldToggle(fm, "Readest hash", "includeReadestHash"),
    );

    fmDependent.push(
      new Setting(fm)
        .setName("Extra fields")
        .setDesc("Free-form YAML appended inside frontmatter.")
        .addTextArea((t) => {
          t.setPlaceholder("Rating: \nReview: ")
            .setValue(this.plugin.settings.extraFrontmatter)
            .onChange(async (value) => {
              this.plugin.settings.extraFrontmatter = value;
              await this.plugin.saveSettings();
            });
          t.inputEl.rows = 4;
          t.inputEl.addClass("readest-extra-frontmatter");
        }),
    );

    applyFmDisabled(this.plugin.settings.includeFrontmatter);

    const hl = this.createSection(renderPane, "Highlights");

    new Setting(hl)
      .setName("Filter")
      .setDesc("Which Readest annotations to include.")
      .addDropdown((d) =>
        d
          .addOption("all", "All annotations")
          .addOption("highlights", "Only highlights")
          .addOption("underlines", "Only underlines")
          .addOption("withNotes", "Only with notes")
          .addOption("marked", "Only highlights and underlines")
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
