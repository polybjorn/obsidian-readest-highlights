// Covers the pre-1.13 settings fallback (issue #35: blank settings tab on
// Obsidian 1.12.x). Runs against tests/obsidian-mock.ts via the "obsidian"
// path alias in tsconfig.test.json.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  FakeEl,
  Setting,
  TextComponent,
  TextAreaComponent,
  ToggleComponent,
  DropdownComponent,
  ButtonComponent,
  ExtraButtonComponent,
  PluginSettingTab,
  notices,
  superCalls,
  resetMock,
  setDeclarativeSupport,
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

// tsc typechecks this file against the real obsidian declarations, where
// containerEl is an HTMLElement; at runtime the path alias makes it a FakeEl.
function container(tab: ReadestSettingTab): FakeEl {
  return tab.containerEl as unknown as FakeEl;
}

// Rows in render order, skipping any detached by the renderer.
function rowsOf(el: FakeEl, out: Setting[] = []): Setting[] {
  for (const child of el.children) {
    if (child.setting) out.push(child.setting);
    rowsOf(child, out);
  }
  return out;
}

function render(tab: ReadestSettingTab): Setting[] {
  // display() is what Obsidian < 1.13 calls, so exercising it is the point. The
  // local type keeps the deprecation off the call without a blanket disable.
  (tab as unknown as { display: () => void }).display();
  return rowsOf(container(tab));
}

function rowNamed(rows: Setting[], name: string): Setting {
  const found = rows.find((r) => r.name === name);
  assert.ok(found, `no row named ${JSON.stringify(name)}`);
  return found;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

void beforeEach(() => {
  resetMock();
  setDeclarativeSupport(false);
});

void test("the 1.12 fallback renders a populated tab (issue #35)", () => {
  const rows = render(makeTab(makePlugin()));
  assert.ok(rows.length > 40, `expected a full tab, got ${rows.length} rows`);
  // The four pages become headings rather than tabs on the old API.
  for (const page of ["Setup", "Heading", "Frontmatter", "Rendering"]) {
    assert.ok(
      rows.some((r) => r.name === page && r.heading),
      `missing page heading ${page}`,
    );
  }
});

void test("no definition falls through to an unsupported placeholder", () => {
  const rows = render(makeTab(makePlugin({ includeFrontmatter: true })));
  const stranded = rows.filter((r) => r.desc.includes("Needs Obsidian 1.13"));
  assert.deepEqual(
    stranded.map((r) => r.name),
    [],
    "every control type in the definitions must have a pre-1.13 rendering",
  );
});

void test("every control row renders an interactive component", () => {
  const rows = render(makeTab(makePlugin()));
  const named = rows.filter((r) => r.name && !r.heading);
  const inert = named.filter(
    (r) => r.components.length === 0 && !r.settingEl.cls.includes("readest-info-row"),
  );
  assert.deepEqual(inert.map((r) => r.name), []);
});

void test("toggles, dropdowns and text fields commit through setControlValue", async () => {
  const plugin = makePlugin();
  const rows = render(makeTab(plugin));

  const toggle = rowNamed(rows, "Sync on startup").components[0];
  assert.ok(toggle instanceof ToggleComponent);
  toggle.emit(true);
  assert.equal(plugin.settings.autoSyncOnStartup, true);

  const dropdown = rowNamed(rows, "Style").components[0];
  assert.ok(dropdown instanceof DropdownComponent);
  dropdown.emit("callout");
  assert.equal(plugin.settings.highlightStyle, "callout");

  const filename = rowNamed(rows, "Filename template").components[0];
  assert.ok(filename instanceof TextComponent);
  filename.emit("{title}");
  assert.equal(plugin.settings.filenameTemplate, "{title}");

  await wait(0);
  assert.ok(plugin.saveCount >= 3, "each commit persists");
});

void test("number fields coerce, and reject unparsable input without clobbering", async () => {
  const plugin = makePlugin();
  const rows = render(makeTab(plugin));
  const interval = rowNamed(rows, "Sync interval").components[0];
  assert.ok(interval instanceof TextComponent);
  assert.equal(interval.inputEl.type, "number");

  interval.emit("15");
  assert.equal(plugin.settings.autoSyncIntervalMinutes, 15);
  await wait(0);
  assert.equal(plugin.autoSyncApplied, 1, "interval change reschedules");

  interval.emit("abc");
  assert.equal(
    plugin.settings.autoSyncIntervalMinutes,
    15,
    "garbage must not reset the stored value",
  );

  interval.emit("-4");
  assert.equal(plugin.settings.autoSyncIntervalMinutes, 0, "clamped at zero");
});

void test("visibility predicates hide dependent rows", () => {
  const on = render(makeTab(makePlugin({ includeFrontmatter: true })));
  assert.ok(on.some((r) => r.name === "Readest hash"));

  const off = render(makeTab(makePlugin({ includeFrontmatter: false })));
  assert.equal(
    off.some((r) => r.name === "Readest hash"),
    false,
    "frontmatter rows hide when the master toggle is off",
  );
});

void test("source list wires add, remove and reorder to backing-array indices", async () => {
  const plugin = makePlugin({ booksDirs: ["/a", "/b", "/c"] });
  const tab = makeTab(plugin);
  const rows = render(tab);

  const dirRows = rows.filter((r) => r.settingEl.cls.includes("readest-books-dir-row"));
  assert.equal(dirRows.length, 3);

  const firstRow = dirRows[0] as Setting;
  const lastRow = dirRows[2] as Setting;
  const upFirst = firstRow.components.find(
    (c): c is ExtraButtonComponent =>
      c instanceof ExtraButtonComponent && c.icon === "chevron-up",
  );
  assert.ok(upFirst);
  assert.equal(upFirst.disabled, true, "first row cannot move up");

  const downLast = lastRow.components.find(
    (c): c is ExtraButtonComponent =>
      c instanceof ExtraButtonComponent && c.icon === "chevron-down",
  );
  assert.ok(downLast);
  assert.equal(downLast.disabled, true, "last row cannot move down");

  const downFirst = firstRow.components.find(
    (c): c is ExtraButtonComponent =>
      c instanceof ExtraButtonComponent && c.icon === "chevron-down",
  );
  assert.ok(downFirst);
  downFirst.click();
  await wait(0);
  assert.deepEqual(plugin.settings.booksDirs, ["/b", "/a", "/c"]);

  const remove = rowsOf(container(tab))
    .filter((r) => r.settingEl.cls.includes("readest-books-dir-row"))[1]
    ?.components.find(
      (c): c is ExtraButtonComponent =>
        c instanceof ExtraButtonComponent && c.icon === "x",
    );
  assert.ok(remove);
  remove.click();
  await wait(0);
  assert.deepEqual(plugin.settings.booksDirs, ["/b", "/c"]);

  const add = rowsOf(container(tab))
    .flatMap((r) => r.components)
    .find(
      (c): c is ButtonComponent =>
        c instanceof ButtonComponent && c.label === "Add path",
    );
  assert.ok(add);
  add.click();
  await wait(0);
  assert.equal(plugin.settings.booksDirs.length, 3);
});

void test("empty source list shows its empty state", () => {
  const rows = render(makeTab(makePlugin({ booksDirs: [] })));
  assert.ok(
    rows.some((r) => r.desc === "Using the platform default location."),
  );
});

void test("extra frontmatter field renders and commits", async () => {
  const plugin = makePlugin({ includeFrontmatter: true });
  const rows = render(makeTab(plugin));
  const area = rowNamed(rows, "Extra fields").components.find(
    (c): c is TextAreaComponent => c instanceof TextAreaComponent,
  );
  assert.ok(area, "textarea render callback must work without a SettingGroup");
  area.emit("rating: 5");
  await wait(0);
  assert.equal(plugin.settings.extraFrontmatter, "rating: 5");
});

void test("output folder is sanitized on commit", () => {
  const plugin = makePlugin();
  const rows = render(makeTab(plugin));
  const folder = rowNamed(rows, "Folder").components[0];
  assert.ok(folder instanceof TextComponent);

  folder.emit("../../escape");
  assert.equal(plugin.settings.outputFolder, "escape");

  folder.emit("");
  assert.equal(plugin.settings.outputFolder, DEFAULT_SETTINGS.outputFolder);

  folder.emit("Books/Read");
  assert.equal(plugin.settings.outputFolder, "Books/Read");
});

void test("output folder warns once per edit, not once per keystroke", async () => {
  const plugin = makePlugin();
  const rows = render(makeTab(plugin));
  const folder = rowNamed(rows, "Folder").components[0];
  assert.ok(folder instanceof TextComponent);

  const typed = "../../escape";
  for (let i = 1; i <= typed.length; i++) folder.emit(typed.slice(0, i));
  assert.deepEqual(notices, [], "nothing fires mid-burst");

  await wait(900);
  assert.equal(notices.length, 1, `one notice per edit, got ${notices.length}`);
  const [first] = notices;
  assert.ok(first);
  assert.match(first, /safe vault-relative path/);
});

void test("a path that is only transiently unsafe never warns", async () => {
  const plugin = makePlugin();
  const rows = render(makeTab(plugin));
  const folder = rowNamed(rows, "Folder").components[0];
  assert.ok(folder instanceof TextComponent);

  // "My/" sanitizes to "My" on the way to the perfectly valid "My/Folder".
  for (const v of ["M", "My", "My/", "My/F", "My/Folder"]) folder.emit(v);
  await wait(900);
  assert.deepEqual(notices, []);
  assert.equal(plugin.settings.outputFolder, "My/Folder");
});

void test("dependent-row changes re-render the tab on 1.12", async () => {
  const plugin = makePlugin({ includeFrontmatter: true });
  const tab = makeTab(plugin);
  render(tab);
  assert.ok(rowsOf(container(tab)).some((r) => r.name === "Readest hash"));

  const toggle = rowNamed(
    rowsOf(container(tab)),
    "Include frontmatter",
  ).components[0];
  assert.ok(toggle instanceof ToggleComponent);
  toggle.emit(false);
  await wait(0);

  const after = rowsOf(container(tab));
  assert.equal(
    after.some((r) => r.name === "Readest hash"),
    false,
    "refreshDomState must rebuild the tab when the old API is in play",
  );
  assert.deepEqual(superCalls, [], "no 1.13-only base method was called");
});

void test("on 1.13 the tab delegates to the declarative base instead", async () => {
  setDeclarativeSupport(true);
  const plugin = makePlugin({ includeFrontmatter: true });
  const tab = makeTab(plugin);

  tab.refreshDomState();
  assert.deepEqual(superCalls, ["refreshDomState"]);

  tab.update();
  assert.deepEqual(superCalls, ["refreshDomState", "update"]);

  // The definitions are what Obsidian renders natively there; assert they are
  // well-formed rather than re-rendering them ourselves.
  assert.ok(tab.getSettingDefinitions().length > 0);
});

void test("PluginSettingTab prototype shape drives the version gate", () => {
  setDeclarativeSupport(false);
  assert.equal(
    typeof (PluginSettingTab.prototype as { update?: unknown }).update,
    "undefined",
  );
  setDeclarativeSupport(true);
  assert.equal(
    typeof (PluginSettingTab.prototype as { update?: unknown }).update,
    "function",
  );
});
