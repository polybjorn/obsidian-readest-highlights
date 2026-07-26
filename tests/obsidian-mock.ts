// Runtime stand-in for the `obsidian` package, which ships types only (its
// package.json has an empty "main"), so anything importing it is unloadable
// under the test runner. tsconfig.test.json maps the "obsidian" specifier
// here; tsc and eslint still resolve it to the real declarations, which is
// why the tests cast at the boundary.
//
// Only the surface settings.ts and settings-compat.ts actually touch is
// modelled. Anything missing should fail loudly rather than silently no-op.

export class FakeEl {
  cls: string[] = [];
  children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  text = "";
  rows = 0;
  type = "";
  min = "";
  max = "";
  step = "";
  // Set by Setting so a tree walk can recover the row that owns an element.
  setting: Setting | null = null;

  createDiv(o?: { cls?: string }): FakeEl {
    const el = new FakeEl();
    if (o?.cls) el.cls.push(o.cls);
    el.parentElement = this;
    this.children.push(el);
    return el;
  }

  empty(): void {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }

  detach(): void {
    const parent = this.parentElement;
    if (parent) {
      const i = parent.children.indexOf(this);
      if (i >= 0) parent.children.splice(i, 1);
    }
    this.parentElement = null;
  }

  addClass(c: string): void {
    this.cls.push(c);
  }

  setText(t: string): void {
    this.text = t;
  }
}

type ChangeCb = (value: never) => unknown;

class ValueComponent {
  value = "";
  placeholder = "";
  disabled = false;
  inputEl = new FakeEl();
  changeCb: ChangeCb | null = null;

  setValue(v: string): this {
    this.value = v;
    return this;
  }
  setPlaceholder(p: string): this {
    this.placeholder = p;
    return this;
  }
  setDisabled(d: boolean): this {
    this.disabled = d;
    return this;
  }
  onChange(cb: ChangeCb): this {
    this.changeCb = cb;
    return this;
  }
  // Test driver: simulate the user editing the field.
  emit(v: unknown): void {
    this.changeCb?.(v as never);
  }
}

export class TextComponent extends ValueComponent {}
export class TextAreaComponent extends ValueComponent {}

export class ToggleComponent extends ValueComponent {
  boolValue = false;
  override setValue(v: unknown): this {
    this.boolValue = Boolean(v);
    return this;
  }
}

export class DropdownComponent extends ValueComponent {
  options: Record<string, string> = {};
  addOptions(o: Record<string, string>): this {
    this.options = { ...this.options, ...o };
    return this;
  }
}

export class SliderComponent extends ValueComponent {
  limits: [number, number, number] = [0, 100, 1];
  setLimits(min: number, max: number, step: number): this {
    this.limits = [min, max, step];
    return this;
  }
}

export class ButtonComponent {
  buttonEl = new FakeEl();
  label = "";
  disabled = false;
  clickCb: (() => unknown) | null = null;
  setButtonText(t: string): this {
    this.label = t;
    return this;
  }
  setDisabled(d: boolean): this {
    this.disabled = d;
    return this;
  }
  onClick(cb: () => unknown): this {
    this.clickCb = cb;
    return this;
  }
  click(): void {
    this.clickCb?.();
  }
}

export class ExtraButtonComponent extends ButtonComponent {
  icon = "";
  tooltip = "";
  setIcon(i: string): this {
    this.icon = i;
    return this;
  }
  setTooltip(t: string): this {
    this.tooltip = t;
    return this;
  }
}

export type AnyComponent =
  | TextComponent
  | TextAreaComponent
  | ToggleComponent
  | DropdownComponent
  | SliderComponent
  | ButtonComponent
  | ExtraButtonComponent;

export class Setting {
  settingEl = new FakeEl();
  descEl = new FakeEl();
  name = "";
  desc = "";
  heading = false;
  components: AnyComponent[] = [];

  constructor(parent: FakeEl) {
    this.settingEl.parentElement = parent;
    this.settingEl.setting = this;
    parent.children.push(this.settingEl);
  }

  setName(n: string): this {
    this.name = n;
    return this;
  }
  setDesc(d: string): this {
    this.desc = typeof d === "string" ? d : String(d);
    return this;
  }
  setHeading(): this {
    this.heading = true;
    return this;
  }
  setDisabled(): this {
    return this;
  }
  setClass(c: string): this {
    this.settingEl.addClass(c);
    return this;
  }
  setTooltip(): this {
    return this;
  }

  private add<T extends AnyComponent>(c: T, cb: (c: T) => unknown): this {
    this.components.push(c);
    cb(c);
    return this;
  }

  addText(cb: (c: TextComponent) => unknown): this {
    return this.add(new TextComponent(), cb);
  }
  addTextArea(cb: (c: TextAreaComponent) => unknown): this {
    return this.add(new TextAreaComponent(), cb);
  }
  addToggle(cb: (c: ToggleComponent) => unknown): this {
    return this.add(new ToggleComponent(), cb);
  }
  addDropdown(cb: (c: DropdownComponent) => unknown): this {
    return this.add(new DropdownComponent(), cb);
  }
  addSlider(cb: (c: SliderComponent) => unknown): this {
    return this.add(new SliderComponent(), cb);
  }
  addButton(cb: (c: ButtonComponent) => unknown): this {
    return this.add(new ButtonComponent(), cb);
  }
  addExtraButton(cb: (c: ExtraButtonComponent) => unknown): this {
    return this.add(new ExtraButtonComponent(), cb);
  }
}

// Obsidian < 1.13 has neither update() nor refreshDomState() on the prototype;
// baseSettingTabMethod() keys off exactly that. Tests flip this to exercise
// both branches.
export class PluginSettingTab {
  containerEl = new FakeEl();
  constructor(
    public app: unknown,
    public plugin: unknown,
  ) {}
  display(): void {}
}

export const superCalls: string[] = [];

export function setDeclarativeSupport(supported: boolean): void {
  const proto = PluginSettingTab.prototype as unknown as Record<
    string,
    unknown
  >;
  if (supported) {
    proto.update = function update(): void {
      superCalls.push("update");
    };
    proto.refreshDomState = function refreshDomState(): void {
      superCalls.push("refreshDomState");
    };
  } else {
    delete proto.update;
    delete proto.refreshDomState;
  }
}
setDeclarativeSupport(false);

export const notices: string[] = [];

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export function resetMock(): void {
  notices.length = 0;
  superCalls.length = 0;
}

// Real Obsidian semantics: resetTimer restarts the countdown on each call.
export function debounce<T extends unknown[]>(
  cb: (...args: T) => unknown,
  timeout = 0,
  resetTimer = false,
): ((...args: T) => void) & { cancel: () => void; run: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  const fire = () => {
    timer = null;
    const args = pending;
    pending = null;
    if (args) cb(...args);
  };
  const debounced = (...args: T): void => {
    pending = args;
    if (timer && resetTimer) clearTimeout(timer);
    else if (timer) return;
    timer = setTimeout(fire, timeout);
  };
  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  debounced.run = (): void => {
    if (timer) clearTimeout(timer);
    fire();
  };
  return debounced;
}

// Minimal line-based YAML good enough to separate "key: value pairs" from
// scalars and syntax errors. Not a real parser - tests here cover the wiring
// around parseYaml, not Obsidian's YAML semantics.
export function parseYaml(input: string): unknown {
  const lines = input.split("\n").filter((l) => l.trim() !== "");
  const out: Record<string, string> = {};
  let sawPair = false;
  for (const line of lines) {
    if (/^\s/.test(line)) throw new Error("bad indentation of a mapping entry");
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      if (lines.length === 1) return line.trim();
      throw new Error("could not find expected ':'");
    }
    sawPair = true;
    out[m[1] as string] = m[2] as string;
  }
  return sawPair ? out : null;
}
