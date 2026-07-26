// Pre-1.13 settings fallback.
//
// Obsidian 1.13 renders a setting tab from getSettingDefinitions(). Older
// versions know nothing about it and call display() instead, which the base
// class leaves empty - so on 1.12.x the tab renders blank. This walks the same
// definitions with the classic Setting API so one definition set serves both.
//
// Dead code on 1.13+: a non-empty getSettingDefinitions() suppresses display().
// Delete this file and its three call sites in settings.ts once minAppVersion
// reaches 1.13.
import { PluginSettingTab, Setting } from "obsidian";
import type {
  SettingControl,
  SettingDefinition,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingDefinitionList,
  SettingDefinitionPage,
} from "obsidian";

export interface SettingsHost {
  getControlValue(key: string): unknown;
  setControlValue(key: string, value: unknown): void | Promise<void>;
}

// update() and refreshDomState() both landed in 1.13.0 alongside the
// declarative API, so the base class only defines them there. Resolving one off
// the prototype is the feature check and the call site in a single step, which
// keeps the two from drifting apart. Returning undefined means the running app
// predates the declarative API, so the caller re-renders instead.
export function baseSettingTabMethod(
  name: "update" | "refreshDomState",
): (() => void) | undefined {
  const proto = PluginSettingTab.prototype as Partial<
    Record<"update" | "refreshDomState", () => void>
  >;
  return proto[name];
}

function resolve<T>(value: T | (() => T) | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  return typeof value === "function" ? (value as () => T)() : value;
}

// Control values arrive as unknown; only primitives have a meaningful field
// representation, and nothing else should reach a text input.
function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function renderFallback(
  host: SettingsHost,
  containerEl: HTMLElement,
  definitions: SettingDefinitionItem[],
): void {
  containerEl.empty();
  for (const item of definitions) renderItem(host, containerEl, item);
}

function renderItem(
  host: SettingsHost,
  parent: HTMLElement,
  item: SettingDefinitionItem,
): void {
  if (!resolve(item.visible, true)) return;
  if ("type" in item) {
    // SettingDefinitionGroup declares type as 'group' | 'list', so the literal
    // check does not narrow to the list interface on its own.
    if (item.type === "page") renderPage(host, parent, item);
    else if (item.type === "list")
      renderList(host, parent, item as SettingDefinitionList);
    else renderGroup(host, parent, item);
    return;
  }
  renderSetting(host, parent, item);
}

function renderPage(
  host: SettingsHost,
  parent: HTMLElement,
  page: SettingDefinitionPage,
): void {
  const heading = new Setting(parent).setName(page.name).setHeading();
  if (page.desc) heading.setDesc(page.desc);
  if (page.items) {
    for (const item of page.items) renderItem(host, parent, item);
    return;
  }
  // Imperative sub-pages have no pre-1.13 equivalent.
  if (page.page) unsupported(parent, page.name);
}

function renderGroup(
  host: SettingsHost,
  parent: HTMLElement,
  group: SettingDefinitionGroup,
): void {
  const target = group.cls ? parent.createDiv({ cls: group.cls }) : parent;
  if (group.heading) new Setting(target).setName(group.heading).setHeading();
  for (const item of group.items ?? []) renderItem(host, target, item);
}

// Lists get built-in add, delete and drag-reorder chrome on 1.13. Here the row
// mutations become explicit buttons; reorder-by-drag becomes move up / down.
function renderList(
  host: SettingsHost,
  parent: HTMLElement,
  list: SettingDefinitionList,
): void {
  if (list.heading) new Setting(parent).setName(list.heading).setHeading();

  const items = list.items ?? [];
  let rendered = 0;

  // index is the position in the backing array, which is what onDelete and
  // onReorder splice by. Skipping hidden rows in place keeps the two aligned;
  // filtering first would renumber them.
  items.forEach((item, index) => {
    const setting = renderSetting(host, parent, item);
    if (!setting) return;
    rendered++;
    const { onReorder, onDelete } = list;
    if (onReorder) {
      setting.addExtraButton((b) =>
        b
          .setIcon("chevron-up")
          .setTooltip("Move up")
          .setDisabled(index === 0)
          .onClick(() => onReorder(index, index - 1)),
      );
      setting.addExtraButton((b) =>
        b
          .setIcon("chevron-down")
          .setTooltip("Move down")
          .setDisabled(index === items.length - 1)
          .onClick(() => onReorder(index, index + 1)),
      );
    }
    if (onDelete) {
      setting.addExtraButton((b) =>
        b
          .setIcon("x")
          .setTooltip("Remove")
          .onClick(() => onDelete(index)),
      );
    }
  });

  if (rendered === 0 && list.emptyState) {
    info(parent, list.emptyState);
  }

  const addItem = list.addItem;
  if (addItem) {
    new Setting(parent).addButton((btn) =>
      btn
        .setButtonText(addItem.name)
        .onClick(() => addItem.action(btn.buttonEl)),
    );
  }
}

function renderSetting(
  host: SettingsHost,
  parent: HTMLElement,
  def: SettingDefinition | SettingDefinitionPage,
): Setting | null {
  if (!resolve(def.visible, true)) return null;
  if ("type" in def) {
    renderItem(host, parent, def);
    return null;
  }

  const setting = new Setting(parent);
  if (def.name) setting.setName(def.name);
  if (def.desc) setting.setDesc(def.desc);

  if (def.render) {
    // The second parameter is a 1.13 SettingGroup with no pre-1.13 equivalent.
    // Render callbacks in this plugin must therefore take only the Setting;
    // one that reads the group would break on old builds.
    (def.render as (setting: Setting) => unknown)(setting);
    return setting;
  }
  if (def.control) {
    applyControl(host, setting, def.control);
    return setting;
  }
  if (def.action) {
    // Row-level actions have no pre-1.13 equivalent; surface rather than skip.
    unsupported(parent, def.name);
    setting.settingEl.detach();
    return null;
  }
  return setting;
}

function applyControl(
  host: SettingsHost,
  setting: Setting,
  control: SettingControl,
): void {
  const disabled = resolve(control.disabled, false);
  const current = host.getControlValue(control.key);
  const commit = (value: unknown) => {
    void host.setControlValue(control.key, value);
  };

  switch (control.type) {
    case "toggle":
      setting.addToggle((t) =>
        t
          .setValue(Boolean(current))
          .setDisabled(disabled)
          .onChange(commit),
      );
      return;
    case "dropdown":
      setting.addDropdown((d) =>
        d
          .addOptions(control.options)
          .setValue(toText(current))
          .setDisabled(disabled)
          .onChange(commit),
      );
      return;
    // Folder controls fall back to a plain path field; the vault-folder
    // autocomplete is 1.13-only.
    case "text":
    case "folder":
    case "file":
      setting.addText((t) => {
        if (control.placeholder) t.setPlaceholder(control.placeholder);
        t.setValue(toText(current))
          .setDisabled(disabled)
          .onChange(commit);
      });
      return;
    case "textarea":
      setting.addTextArea((t) => {
        if (control.placeholder) t.setPlaceholder(control.placeholder);
        t.setValue(toText(current))
          .setDisabled(disabled)
          .onChange(commit);
      });
      return;
    // setControlValue does the numeric coercion and rejects unparsable input,
    // so the raw field value is what gets handed over.
    case "number":
      setting.addText((t) => {
        t.inputEl.type = "number";
        if (control.min !== undefined) t.inputEl.min = String(control.min);
        if (control.max !== undefined) t.inputEl.max = String(control.max);
        if (control.step !== undefined) t.inputEl.step = String(control.step);
        if (control.placeholder) t.setPlaceholder(control.placeholder);
        t.setValue(toText(current))
          .setDisabled(disabled)
          .onChange(commit);
      });
      return;
    case "slider":
      setting.addSlider((s) =>
        s
          .setLimits(control.min ?? 0, control.max ?? 100, control.step ?? 1)
          .setValue(Number(current) || 0)
          .setDisabled(disabled)
          .onChange(commit),
      );
      return;
    // A control type added to the definitions later but not mapped here would
    // otherwise vanish silently on old Obsidian. Make it visible instead.
    default:
      unsupported(setting.settingEl.parentElement ?? setting.settingEl, "");
  }
}

function info(parent: HTMLElement, text: string | DocumentFragment): void {
  new Setting(parent).setDesc(text).settingEl.addClass("readest-info-row");
}

function unsupported(parent: HTMLElement, name: string): void {
  const setting = new Setting(parent).setDesc(
    "Needs Obsidian 1.13 or later to change.",
  );
  if (name) setting.setName(name);
  setting.settingEl.addClass("readest-info-row");
}
