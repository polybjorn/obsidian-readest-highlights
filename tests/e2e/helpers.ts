import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env, platform } from "node:process";

export const FIXTURE_BOOK = "e2e0000000000000000000000000001";
export const SECOND_BOOK = "e2e0000000000000000000000000002";
export const FIXTURE_NOTE = "Readest/Fixture Book (2001).md";
export const SECOND_NOTE = "Readest/Second Book (2002).md";

interface ReadestPlugin {
  manifest: { dir: string };
  settings: Record<string, unknown>;
  settingTab: { update(): void } | null;
  saveData(data: unknown): Promise<void>;
  loadSettings(): Promise<void>;
  onExternalSettingsChange?(): Promise<void>;
}

// Obsidian's internal settings window, which has no public API.
interface SettingWindow {
  openTabById(id: string): void;
  close(): void;
}

let mainWindow: string | undefined;

// A writable copy of the fixture library, where a spec plays Readest's side.
export function freshLibrary(dir = mkdtempSync(join(tmpdir(), "readest-e2e-"))): string {
  cpSync(resolve("tests/e2e/fixtures/readest"), dir, { recursive: true });
  return dir;
}

// Where Readest keeps its library by default, under the sandboxed home that
// wdio.conf.mts gives each run. Mirrors defaultActivePath in src/settings.ts.
export function readestDefaultDir(): string {
  const sub = join("com.bilingify.readest", "Readest", "Books");
  const home = env.HOME ?? "";
  if (platform === "darwin") return join(home, "Library", "Application Support", sub);
  if (platform === "win32") return join(env.APPDATA ?? "", sub);
  return join(env.XDG_DATA_HOME ?? "", sub);
}

type Booknote = Record<string, unknown> & { id: string };

// Rewrites one book's annotations the way Readest saves them. Returns a
// function that puts the book back as it was.
export function editBooknotes(
  library: string,
  hash: string,
  edit: (notes: Booknote[]) => Booknote[],
): () => void {
  const path = join(library, hash, "config.json");
  const before = readFileSync(path, "utf8");
  const config = JSON.parse(before) as { booknotes: Booknote[] };
  config.booknotes = edit(config.booknotes);
  writeFileSync(path, JSON.stringify(config));
  return () => writeFileSync(path, before);
}

// Resets the vault files and the plugin's settings for a test, starting from
// the defaults plus the given Source paths, which are the test's own library
// unless it says otherwise; null saves none, as on a fresh install. Settings
// go through the plugin's own load, so its migrations and defaults apply as on
// startup.
export async function startTest(
  library: string | string[] | null,
  settings: Record<string, unknown> = {},
): Promise<void> {
  rmSync(readestDefaultDir(), { recursive: true, force: true });
  mainWindow ??= await browser.getWindowHandle();
  await browser.switchToWindow(mainWindow);
  await obsidianPage.resetVault();
  await browser.executeObsidian(
    async ({ app, plugins }, saved) => {
      const plugin = plugins.readestHighlights as unknown as ReadestPlugin;
      await plugin.saveData(saved);
      await plugin.loadSettings();
      // The tab keeps the definitions it built at load until update().
      plugin.settingTab?.update();
      (app as unknown as { setting: SettingWindow }).setting.close();
      app.workspace.iterateAllLeaves((leaf) => leaf.detach());
      document.querySelectorAll(".notice").forEach((n) => n.remove());
      document.querySelectorAll(".modal-container").forEach((m) => m.remove());
    },
    library === null
      ? settings
      : { ...settings, booksDirs: typeof library === "string" ? [library] : library },
  );
}

export async function pluginSettings(): Promise<Record<string, unknown>> {
  return browser.executeObsidian(
    ({ plugins }) => (plugins.readestHighlights as unknown as ReadestPlugin).settings,
  );
}

// Replaces the plugin's data.json the way Obsidian Sync does when another
// device changed a setting, and waits until Obsidian has told the plugin.
// Calling the hook here as well would reload twice, and the late reload
// redraws the settings tab under a test that is already typing in it.
export async function settingsArrive(data: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(
    async ({ app, plugins }, d) => {
      const plugin = plugins.readestHighlights as unknown as ReadestPlugin;
      const own = plugin.onExternalSettingsChange?.bind(plugin);
      const told = new Promise<void>((resolve, reject) => {
        window.setTimeout(() => reject(new Error("Obsidian never reported the change")), 10_000);
        plugin.onExternalSettingsChange = async () => {
          // Back to the class's own method, or none, as before the fix.
          delete plugin.onExternalSettingsChange;
          if (own) await own();
          resolve();
        };
      });
      await app.vault.adapter.write(`${plugin.manifest.dir}/data.json`, JSON.stringify(d));
      await told;
    },
    data,
  );
}

// What the plugin last wrote to its data.json, as opposed to what it holds.
export async function savedSettings(): Promise<Record<string, unknown>> {
  return browser.executeObsidian(async ({ app, plugins }) => {
    const plugin = plugins.readestHighlights as unknown as ReadestPlugin;
    const raw = await app.vault.adapter.read(`${plugin.manifest.dir}/data.json`);
    return JSON.parse(raw) as Record<string, unknown>;
  });
}

export async function readNote(path: string): Promise<string> {
  return browser.executeObsidian(({ app }, p) => app.vault.adapter.read(p), path);
}

export async function writeNote(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, p, c) => {
      const file = app.vault.getFileByPath(p);
      if (!file) throw new Error(`${p} not in the vault`);
      await app.vault.modify(file, c);
    },
    path,
    content,
  );
}

export async function notesIn(folder: string): Promise<string[]> {
  return browser.executeObsidian(
    ({ app }, f) =>
      app.vault
        .getMarkdownFiles()
        .filter((file) => file.path.startsWith(`${f}/`))
        .map((file) => file.path)
        .sort(),
    folder,
  );
}

// Waits for the notice a command ends with, which is what the user goes by,
// and removes it so a later wait for the same text cannot match it again.
// Other notices stay: one command can show two at once.
export async function waitForNotice(text: string): Promise<void> {
  const notice = await browser.$(`.notice*=${text}`);
  await notice.waitForExist();
  await browser.execute((el) => el.remove(), notice);
}

export async function runCommand(id: string): Promise<void> {
  await browser.executeObsidianCommand(`readest-highlights:${id}`);
}

export async function openNote(path: string, mode: "source" | "preview" = "source"): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, p, m) => {
      const file = app.vault.getFileByPath(p);
      if (!file) throw new Error(`${p} not in the vault`);
      await app.workspace.getLeaf().openFile(file, { state: { mode: m } });
    },
    path,
    mode,
  );
}

// Opens the plugin's settings tab, optionally on one of its pages, and
// switches to the window it is in: Obsidian 1.13 and later show settings in a
// window of their own.
export async function openSettings(page?: string): Promise<void> {
  await browser.executeObsidianCommand("app:open-settings");
  await browser.executeObsidian(({ app }) => {
    (app as unknown as { setting: SettingWindow }).setting.openTabById("readest-highlights");
  });
  await browser.waitUntil(async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if (await browser.execute(() => document.querySelector(".mod-settings") !== null)) {
        return true;
      }
    }
    return false;
  });
  if (page) await browser.$(`.mod-navigable*=${page}`).click();
}

// Picks a book in the plugin's picker by typing part of its title.
export async function pickBook(query: string, item: string): Promise<void> {
  const input = browser.$(".prompt .prompt-input");
  await input.waitForDisplayed();
  await input.setValue(query);
  // wdio's text match takes one class and no descendant selector, and only
  // one prompt is open at a time.
  const choice = browser.$(`.suggestion-item*=${item}`);
  await choice.waitForDisplayed();
  await choice.click();
}
