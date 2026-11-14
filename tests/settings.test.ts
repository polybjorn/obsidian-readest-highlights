// Drives the settings tab the way Obsidian 1.13 does: it reads
// getSettingDefinitions(), binds each control through getControlValue and
// setControlValue, evaluates visible/disabled predicates and calls render
// callbacks. Runs against tests/obsidian-mock.ts via the "obsidian" path alias
// in tsconfig.test.json.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ButtonComponent,
  ConfirmationModal,
  FakeEl,
  Setting,
  TextAreaComponent,
  TextComponent,
  notices,
  openModals,
  resetMock,
  superCalls,
} from "./obsidian-mock";
import { ReadestSettingTab, DEFAULT_SETTINGS } from "../src/settings";
import type { ReadestSettings } from "../src/settings";
import type ReadestHighlightsPlugin from "../src/main";

interface FakePlugin {
  settings: ReadestSettings;
  saveCount: number;
  autoSyncApplied: number;
  saveSettings(): Promise<void>;
  applyAutoSyncInterval(): void;
}

function makePlugin(overrides: Partial<ReadestSettings> = {}): FakePlugin {
  return {
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    saveCount: 0,
    autoSyncApplied: 0,
    async saveSettings() {
      this.saveCount++;
    },
    applyAutoSyncInterval() {
      this.autoSyncApplied++;
    },
  };
}

function makeTab(plugin: FakePlugin): ReadestSettingTab {
  return new ReadestSettingTab(
    {} as never,
    plugin as unknown as ReadestHighlightsPlugin,
  );
}

// The real definition types are a union keyed on optional fields; one loose
// shape keeps the walk below readable.
interface Def {
  type?: string;
  name?: string;
  desc?: string;
  heading?: string;
  searchable?: boolean;
  emptyState?: string;
  items?: Def[];
  visible?: boolean | (() => boolean);
  disabled?: boolean | (() => boolean);
  control?: {
    type: string;
    key: string;
    options?: Record<string, string>;
    disabled?: boolean | (() => boolean);
  };
  render?: (setting: Setting) => void;
  addItem?: { name: string; action: () => void };
  onDelete?: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
}

function defs(tab: ReadestSettingTab): Def[] {
  return tab.getSettingDefinitions() as unknown as Def[];
}

function walk(list: Def[], out: Def[] = []): Def[] {
  for (const d of list) {
    out.push(d);
    if (d.items) walk(d.items, out);
  }
  return out;
}

function named(tab: ReadestSettingTab, name: string): Def {
  const found = walk(defs(tab)).find((d) => d.name === name);
  assert.ok(found, `no definition named ${JSON.stringify(name)}`);
  return found;
}

function isVisible(d: Def): boolean {
  if (d.visible === undefined) return true;
  return typeof d.visible === "function" ? d.visible() : d.visible;
}

function sourceList(tab: ReadestSettingTab): Def {
  const list = walk(defs(tab)).find((d) => d.type === "list");
  assert.ok(list, "the Source list is missing");
  return list;
}

function renderInto(d: Def): Setting {
  assert.ok(d.render, `${d.name ?? "item"} has no render callback`);
  const setting = new Setting(new FakeEl());
  d.render(setting);
  return setting;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

void beforeEach(() => {
  resetMock();
});

void test("four pages, then the reset on its own as the last group", () => {
  const top = defs(makeTab(makePlugin()));
  assert.deepEqual(
    top.filter((d) => d.type === "page").map((d) => d.name),
    ["Setup", "Heading", "Frontmatter", "Rendering"],
  );
  const last = top.at(-1);
  assert.equal(last?.type, "group");
  assert.equal(last?.items?.[0]?.name, "Reset to defaults");
});

void test("every control is bound to a setting that has a default", () => {
  const tab = makeTab(makePlugin());
  const controls = walk(defs(tab)).filter((d) => d.control);
  assert.ok(controls.length > 30, `expected a full tab, got ${controls.length}`);
  for (const d of controls) {
    const key = d.control?.key ?? "";
    assert.ok(key in DEFAULT_SETTINGS, `${d.name}: unknown key ${key}`);
    assert.notEqual(tab.getControlValue(key), undefined, `${d.name}: no value`);
  }
});

void test("each dropdown offers the value it is bound to by default", () => {
  const tab = makeTab(makePlugin());
  for (const d of walk(defs(tab))) {
    if (d.control?.type !== "dropdown") continue;
    const value = String(tab.getControlValue(d.control.key));
    assert.ok(
      Object.keys(d.control.options ?? {}).includes(value),
      `${d.name}: default ${JSON.stringify(value)} is not an option`,
    );
  }
});

// Settings search matches on name, so a row without one would be a blank hit.
void test("every searchable row has a name", () => {
  const unnamed = walk(defs(makeTab(makePlugin()))).filter(
    (d) => !d.type && d.searchable !== false && !d.name,
  );
  assert.deepEqual(unnamed, []);
});

void test("controls commit through setControlValue and persist", async () => {
  const plugin = makePlugin();
  const tab = makeTab(plugin);
  await tab.setControlValue("autoSyncOnStartup", true);
  await tab.setControlValue("highlightStyle", "callout");
  await tab.setControlValue("filenameTemplate", " {title} ");
  assert.equal(plugin.settings.autoSyncOnStartup, true);
  assert.equal(plugin.settings.highlightStyle, "callout");
  assert.equal(plugin.settings.filenameTemplate, "{title}");
  assert.equal(plugin.saveCount, 3);

  await tab.setControlValue("filenameTemplate", "   ");
  assert.equal(
    plugin.settings.filenameTemplate,
    DEFAULT_SETTINGS.filenameTemplate,
    "a blank template falls back to the default",
  );
});

void test("the heading level dropdown binds a string to a stored number", async () => {
  const plugin = makePlugin();
  const tab = makeTab(plugin);
  await tab.setControlValue("syncHeadingLevel", "3");
  assert.equal(plugin.settings.syncHeadingLevel, 3);
  assert.equal(tab.getControlValue("syncHeadingLevel"), "3");
});

void test("number fields coerce, and reject unparsable input without clobbering", async () => {
  const plugin = makePlugin();
  const tab = makeTab(plugin);
  await tab.setControlValue("autoSyncIntervalMinutes", "15");
  assert.equal(plugin.settings.autoSyncIntervalMinutes, 15);
  assert.equal(plugin.autoSyncApplied, 1, "interval change reschedules");

  await tab.setControlValue("autoSyncIntervalMinutes", "abc");
  assert.equal(
    plugin.settings.autoSyncIntervalMinutes,
    15,
    "garbage must not reset the stored value",
  );

  await tab.setControlValue("autoSyncIntervalMinutes", "-4");
  assert.equal(plugin.settings.autoSyncIntervalMinutes, 0, "clamped at zero");
});

void test("visibility predicates follow the settings they depend on", () => {
  const plugin = makePlugin({ includeFrontmatter: true });
  const tab = makeTab(plugin);
  const hash = named(tab, "Readest hash");
  assert.equal(isVisible(hash), true);
  plugin.settings.includeFrontmatter = false;
  assert.equal(isVisible(hash), false, "frontmatter rows hide with the toggle");

  const perColor = named(tab, "Callout per color");
  plugin.settings.highlightStyle = "bullet";
  assert.equal(isVisible(perColor), false);
  plugin.settings.highlightStyle = "callout";
  assert.equal(isVisible(perColor), true, "per-color shows only for callouts");
});

void test("source list wires add, remove and reorder to the backing array", async () => {
  const plugin = makePlugin({ booksDirs: ["/a", "/b", "/c"] });
  const tab = makeTab(plugin);
  const list = sourceList(tab);
  assert.equal(list.items?.length, 3);

  list.onReorder?.(0, 1);
  await wait(0);
  assert.deepEqual(plugin.settings.booksDirs, ["/b", "/a", "/c"]);

  list.onDelete?.(1);
  await wait(0);
  assert.deepEqual(plugin.settings.booksDirs, ["/b", "/c"]);

  list.addItem?.action();
  await wait(0);
  assert.deepEqual(plugin.settings.booksDirs, ["/b", "/c", ""]);

  // Each change alters the list's length or order, which only update() picks up.
  assert.deepEqual(superCalls, ["update", "update", "update"]);
  assert.equal(plugin.saveCount, 3);
});

void test("empty source list shows its empty state", () => {
  const list = sourceList(makeTab(makePlugin({ booksDirs: [] })));
  assert.equal(list.items?.length, 0);
  assert.equal(
    list.emptyState,
    "No paths: the plugin finds Readest's library itself.",
  );
});

void test("a source path with no library on this device is marked, not dropped", async () => {
  const plugin = makePlugin({ booksDirs: ["/nonexistent/readest-test"] });
  const row = sourceList(makeTab(plugin)).items?.[0];
  assert.ok(row);
  const setting = renderInto(row);
  await wait(20);
  const error = setting.settingEl.children.find((c) =>
    c.cls.includes("readest-inline-error"),
  );
  assert.match(error?.text ?? "", /No Readest library here on this device/);
  assert.deepEqual(plugin.settings.booksDirs, ["/nonexistent/readest-test"]);

  const input = setting.components[0];
  assert.ok(input instanceof TextComponent);
  input.emit("");
  await wait(20);
  assert.equal(error?.text, "", "clearing the path clears the mark");
});

void test("extra frontmatter field renders and commits", async () => {
  const plugin = makePlugin({ includeFrontmatter: true });
  const setting = renderInto(named(makeTab(plugin), "Extra fields"));
  const area = setting.components.find(
    (c): c is TextAreaComponent => c instanceof TextAreaComponent,
  );
  assert.ok(area);
  area.emit("rating: 5");
  await wait(0);
  assert.equal(plugin.settings.extraFrontmatter, "rating: 5");
});

void test("output folder is sanitized on commit", async () => {
  const plugin = makePlugin();
  const tab = makeTab(plugin);
  await tab.setControlValue("outputFolder", "../../escape");
  assert.equal(plugin.settings.outputFolder, "escape");
  await tab.setControlValue("outputFolder", "");
  assert.equal(plugin.settings.outputFolder, DEFAULT_SETTINGS.outputFolder);
  await tab.setControlValue("outputFolder", "Books/Read");
  assert.equal(plugin.settings.outputFolder, "Books/Read");
});

void test("output folder warns once per edit, not once per keystroke", async () => {
  const tab = makeTab(makePlugin());
  const typed = "../../escape";
  for (let i = 1; i <= typed.length; i++) {
    await tab.setControlValue("outputFolder", typed.slice(0, i));
  }
  assert.deepEqual(notices, [], "nothing fires mid-burst");

  await wait(900);
  assert.equal(notices.length, 1, `one notice per edit, got ${notices.length}`);
  assert.match(notices[0] ?? "", /safe vault-relative path/);
});

void test("a path that is only transiently unsafe never warns", async () => {
  const plugin = makePlugin();
  const tab = makeTab(plugin);
  // "My/" sanitizes to "My" on the way to the perfectly valid "My/Folder".
  for (const v of ["M", "My", "My/", "My/F", "My/Folder"]) {
    await tab.setControlValue("outputFolder", v);
  }
  await wait(900);
  assert.deepEqual(notices, []);
  assert.equal(plugin.settings.outputFolder, "My/Folder");
});

// Changes one setting of each kind, and the two that reset must keep.
const customised: Partial<ReadestSettings> = {
  booksDirs: ["/books/a", "/books/b"],
  outputFolder: "Reading/Books",
  highlightStyle: "callout",
  syncHeadingLevel: 3,
  autoSyncIntervalMinutes: 15,
  includeFrontmatter: false,
  extraFrontmatter: "rating: 5",
};

async function confirmReset(
  tab: ReadestSettingTab,
  label: "Reset" | "Cancel",
): Promise<void> {
  const open = renderInto(named(tab, "Reset to defaults")).components[0];
  assert.ok(open instanceof ButtonComponent);
  assert.equal(open.destructive, true);
  await open.click();
  const modal = openModals[0];
  assert.ok(modal instanceof ConfirmationModal, "reset asks first");
  const button = modal.buttons.find((b) => b.label === label);
  assert.ok(button, `no ${label} button`);
  if (label === "Reset") assert.equal(button.destructive, true);
  await button.click();
}

void test("reset restores defaults but keeps source paths and output folder", async () => {
  const plugin = makePlugin(customised);
  const tab = makeTab(plugin);
  const settings = plugin.settings;
  await confirmReset(tab, "Reset");

  assert.equal(plugin.settings, settings, "reset mutates the settings in place");
  assert.deepEqual(plugin.settings, {
    ...DEFAULT_SETTINGS,
    booksDirs: ["/books/a", "/books/b"],
    outputFolder: "Reading/Books",
  });
  assert.equal(openModals.length, 0, "the modal closes");
  assert.ok(plugin.saveCount >= 1, "reset persists");
  assert.equal(plugin.autoSyncApplied, 1, "the interval timer is re-armed");
  assert.deepEqual(superCalls, ["update"], "the page re-renders");
});

void test("cancelling the reset changes nothing", async () => {
  const plugin = makePlugin(customised);
  await confirmReset(makeTab(plugin), "Cancel");

  assert.deepEqual(plugin.settings, { ...DEFAULT_SETTINGS, ...customised });
  assert.equal(plugin.saveCount, 0);
  assert.equal(openModals.length, 0);
});
