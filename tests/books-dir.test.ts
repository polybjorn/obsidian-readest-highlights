import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SETTINGS,
  readestRecordedBooksDir,
  resolveBooksDir,
} from "../src/settings";

async function tempDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "readest-books-dir-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function booksDir(t: TestContext): Promise<string> {
  const dir = await tempDir(t);
  await writeFile(join(dir, "library.json"), "[]");
  return dir;
}

// The platform default is always a candidate, so point HOME (and the Windows
// and XDG roots) at an empty folder or a real Readest install on the test
// machine would satisfy the lookup.
async function isolateHome(t: TestContext): Promise<void> {
  const home = await tempDir(t);
  const saved = {
    HOME: process.env.HOME,
    APPDATA: process.env.APPDATA,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  };
  process.env.HOME = home;
  process.env.APPDATA = home;
  process.env.XDG_DATA_HOME = home;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

void test("reads localBooksDir from Readest's settings.json", async (t) => {
  const config = await tempDir(t);
  await writeFile(
    join(config, "settings.json"),
    JSON.stringify({ localBooksDir: "/data/Readest/Books", version: 1 }),
  );
  assert.equal(await readestRecordedBooksDir(config), "/data/Readest/Books");
});

void test("recorded books dir is null when settings.json is unusable", async (t) => {
  const missing = await tempDir(t);
  assert.equal(await readestRecordedBooksDir(missing), null);

  for (const content of ["not json", "[]", "{}", '{"localBooksDir": 3}']) {
    const config = await tempDir(t);
    await writeFile(join(config, "settings.json"), content);
    assert.equal(await readestRecordedBooksDir(config), null, content);
  }
});

void test("a moved Readest data folder is found with no paths set", async (t) => {
  await isolateHome(t);
  const moved = await booksDir(t);
  const settings = { ...DEFAULT_SETTINGS, booksDirs: [] };
  assert.equal(await resolveBooksDir(settings, Promise.resolve(moved)), moved);
});

void test("a listed path wins over Readest's recorded folder", async (t) => {
  await isolateHome(t);
  const listed = await booksDir(t);
  const recorded = await booksDir(t);
  const settings = { ...DEFAULT_SETTINGS, booksDirs: [listed] };
  assert.equal(
    await resolveBooksDir(settings, Promise.resolve(recorded)),
    listed,
  );
});

void test("the error lists every path tried and points at Source", async (t) => {
  await isolateHome(t);
  const empty = await tempDir(t);
  const recorded = join(empty, "Readest", "Books");
  await mkdir(recorded, { recursive: true });
  const settings = { ...DEFAULT_SETTINGS, booksDirs: [empty] };
  await assert.rejects(
    resolveBooksDir(settings, Promise.resolve(recorded)),
    (err: Error) =>
      err.message.includes(empty) &&
      err.message.includes(recorded) &&
      err.message.includes("under Source"),
  );
});
