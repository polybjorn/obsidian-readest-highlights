// Records the README's GIF of a sync filling a book note, from the demo vault
// in a separate Obsidian instance driven over the DevTools protocol. Its own
// --user-data-dir keeps it apart from the Obsidian you have open. Frames come
// from the page itself (Page.captureScreenshot), never the screen, and ffmpeg,
// which has to be on the PATH, encodes them. Run with `npm run record-sync`.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "docs/sync.gif");
const OBSIDIAN = process.env.OBSIDIAN_BIN ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const PORT = 9334;
const BOOK = "Pride and Prejudice";
const WINDOW = { width: 900, height: 560 };
const SIDEBAR = 210;
// How long the sync's own motion lasts, captured frame by frame before the
// settled frame is held
const MOTION_MS = 3000;
const SCROLL_FPS = 20;
const SCROLL_FRAMES = 50;
const GIF_WIDTH = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check, what, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(250);
  }
}

async function connect() {
  const targets = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.some((t) => t.type === "page" && t.url.startsWith("app://")) ? list : null;
  }, "the Obsidian window");
  const page = targets.find((t) => t.type === "page" && t.url.startsWith("app://"));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (!pending.has(m.id)) return;
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message));
    else res(m.result);
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

// The vault starts with the book's note holding only its frontmatter, so the
// sync fills a note that exists and creates the rest, as on a first run
function prepare() {
  const work = mkdtempSync(join(tmpdir(), "readest-gif-"));
  const vault = join(work, "vault");
  const books = join(work, "books");
  const profile = join(work, "profile");
  execFileSync("npm", ["run", "--silent", "demo-vault", "--", vault, "--readest", books], { cwd: ROOT, stdio: "inherit" });
  const notes = join(vault, "Readest");
  for (const name of readdirSync(notes)) {
    const path = join(notes, name);
    if (!name.startsWith(BOOK)) rmSync(path);
    else writeFileSync(path, readFileSync(path, "utf8").match(/^---\n[\s\S]*?\n---\n/)[0]);
  }
  // A vault that holds plugins when it first opens gets a trust prompt over
  // every page, so the plugin goes in once the vault has loaded
  const plugin = join(work, "plugin");
  cpSync(join(vault, ".obsidian/plugins/readest-highlights"), plugin, { recursive: true });
  rmSync(join(vault, ".obsidian/plugins"), { recursive: true });
  rmSync(join(vault, ".obsidian/community-plugins.json"));
  writeFileSync(join(plugin, "data.json"), JSON.stringify({ booksDirs: [books], highlightGrouping: "chapter" }));
  // A vault with no theme of its own follows the system's at startup
  writeFileSync(join(vault, ".obsidian/appearance.json"), JSON.stringify({ theme: "moonstone" }));
  mkdirSync(profile);
  writeFileSync(join(profile, "obsidian.json"),
    JSON.stringify({ vaults: { readestdemo000001: { path: vault, ts: Date.now(), open: true } } }));
  return { work, vault, plugin, profile };
}

// A frame counts as new only when enough pixels change by more than the faint
// shade two captures of an unchanged window differ by, since a GIF stores each
// frame in full
const CHANGED = `window.readestChanged = async (png) => {
  const img = new Image();
  img.src = "data:image/png;base64," + png;
  await img.decode();
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
  ctx.drawImage(img, 0, 0);
  const now = ctx.getImageData(0, 0, img.width, img.height).data;
  const prev = window.readestFrame;
  window.readestFrame = now;
  if (!prev) return true;
  let changed = 0;
  for (let i = 0; i < now.length; i += 4) {
    if (Math.abs(now[i] - prev[i]) + Math.abs(now[i + 1] - prev[i + 1]) + Math.abs(now[i + 2] - prev[i + 2]) > 24) changed++;
  }
  return changed > 50;
}`;

// The scroll is set frame by frame before each capture, since a capture takes
// longer than a frame and a scroll left running on the clock comes out as a
// few jumps. The settle is a timer, not requestAnimationFrame, which never
// fires while another window covers this one
const SCROLL_TO = `window.readestScrollTo = async (p) => {
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = document.querySelector(".workspace-leaf-content[data-type=markdown] .markdown-preview-view");
  if (box.readestTo === undefined) {
    // Ends on the last highlight, since a short note's page runs on blank below
    // it. Reading view renders only the sections near the viewport, so the note
    // is measured at the bottom, before it can drop the sections again
    box.readestFrom = box.scrollTop;
    box.scrollTop = box.scrollHeight;
    await settle(300);
    const last = [...box.querySelectorAll(".markdown-preview-section > div")].filter((d) => d.textContent.trim()).at(-1);
    box.readestTo = Math.min(box.scrollHeight - box.clientHeight,
      box.scrollTop + last.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom + 24);
    box.scrollTop = box.readestFrom;
    await settle(300);
  }
  const by = box.readestTo - box.readestFrom;
  box.scrollTop = box.readestFrom + by * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  await settle(50);
}`;

async function record(cdp, work) {
  const dir = join(work, "frames");
  mkdirSync(dir);
  await cdp.evaluate(CHANGED);
  await cdp.evaluate(SCROLL_TO);
  const frames = [];
  const capture = async (duration) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    if (!(await cdp.evaluate(`readestChanged(${JSON.stringify(data)})`))) return;
    const file = join(dir, `${String(frames.length).padStart(4, "0")}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: Date.now(), duration });
  };
  const steps = [
    { hold: 1800 },
    { run: `app.commands.executeCommandById("readest-highlights:sync-all-books")`, motion: MOTION_MS, hold: 2500 },
    { scroll: SCROLL_FRAMES, hold: 2500 },
  ];
  for (const s of steps) {
    if (s.run) await cdp.evaluate(s.run);
    const start = Date.now();
    while (s.motion && Date.now() - start < s.motion) await capture();
    for (let i = 1; i <= (s.scroll ?? 0); i++) {
      await cdp.evaluate(`readestScrollTo(${i / s.scroll})`);
      await capture(1000 / SCROLL_FPS);
    }
    await sleep(200);
    await capture();
    for (const [i, f] of frames.entries()) f.duration ??= frames[i + 1] && frames[i + 1].t - f.t;
    frames.at(-1).duration = s.hold;
  }
  writeFileSync(join(dir, "list.txt"), frames.map((f) => `file '${f.file}'\nduration ${f.duration / 1000}\n`).join(""));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];` +
      "[b][p]paletteuse=dither=none:diff_mode=rectangle",
    // The concat format drops the last frame's duration, so the GIF sets it
    "-fps_mode", "vfr", "-loop", "0", "-final_delay", String(Math.round(frames.at(-1).duration / 10)), OUT]);
  console.log(`Wrote ${OUT.slice(ROOT.length + 1)} from ${frames.length} frames`);
}

const { work, vault, plugin, profile } = prepare();
const app = spawn(OBSIDIAN, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], { stdio: "ignore" });
let cdp;
try {
  cdp = await connect();
  await waitFor(() => cdp.evaluate(`!!window.app?.workspace?.layoutReady`), "the vault to load");
  cpSync(plugin, join(vault, ".obsidian/plugins/readest-highlights"), { recursive: true });
  await cdp.evaluate(`(async () => {
    await app.plugins.loadManifests();
    await app.plugins.setEnable(true);
    await app.plugins.enablePluginAndSave("readest-highlights");
  })()`);
  await waitFor(() => cdp.evaluate(`!!app.plugins.plugins["readest-highlights"]`), "the plugin to load");
  await cdp.evaluate(`(async () => {
    const win = require("@electron/remote").getCurrentWindow();
    win.setContentSize(${WINDOW.width}, ${WINDOW.height});
    win.center();
    // A covered window stops rendering the note's lower sections
    win.setAlwaysOnTop(true);
    document.querySelector(".status-bar").style.display = "none";
    // The window stays on top, so the pointer can hover a fold arrow into view
    document.head.insertAdjacentHTML("beforeend", "<style>.collapse-indicator { display: none; }</style>");
    app.workspace.leftSplit.expand();
    app.workspace.leftSplit.setSize(${SIDEBAR});
    const file = app.vault.getMarkdownFiles().find((f) => f.name.startsWith(${JSON.stringify(BOOK)}));
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: "preview" } });
    await app.workspace.getLeavesOfType("file-explorer")[0]?.view.revealInFolder(file);
  })()`);
  await sleep(1500);
  await record(cdp, work);
} finally {
  cdp?.close();
  app.kill();
  await sleep(500);
  rmSync(work, { recursive: true, force: true });
}
