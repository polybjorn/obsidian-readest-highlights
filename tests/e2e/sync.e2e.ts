import { browser, expect } from "@wdio/globals";
import {
  FIXTURE_BOOK,
  FIXTURE_NOTE,
  SECOND_NOTE,
  editBooknotes,
  freshLibrary,
  notesIn,
  openNote,
  pickBook,
  pluginSettings,
  readNote,
  readestDefaultDir,
  runCommand,
  startTest,
  waitForNotice,
  writeNote,
} from "./helpers";

const COMMENT = "> [!comment] Mine\n> Typed in Obsidian";

// Puts the comment where a user would: on the lines after a highlight's block ID.
function addComment(note: string, highlight: string): string {
  const id = /\^rdst-[a-z0-9-]+\n/.exec(note.slice(note.indexOf(highlight)));
  if (!id) throw new Error(`no block ID after ${highlight}`);
  const at = note.indexOf(highlight) + id.index + id[0].length;
  return `${note.slice(0, at)}\n${COMMENT}\n${note.slice(at)}`;
}

describe("Sync all books", function () {
  let library: string;

  beforeEach(async function () {
    library = freshLibrary();
    await startTest(library, { highlightBlockIds: true });
  });

  it("writes one note per book, leaving out what Readest deleted", async function () {
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created, 0 updated (2 books)");

    expect(await notesIn("Readest")).toEqual([FIXTURE_NOTE, SECOND_NOTE]);
    const note = await readNote(FIXTURE_NOTE);
    expect(note).toContain(`readest-hash: ${FIXTURE_BOOK}`);
    for (const text of [
      "First fixture highlight",
      "Second fixture highlight",
      "Third fixture highlight",
      "A note on the first",
    ]) {
      expect(note).toContain(text);
    }
    expect(note).not.toContain("Deleted in Readest");
  });

  it("leaves notes alone when nothing changed in Readest", async function () {
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created");
    const first = await readNote(FIXTURE_NOTE);

    await runCommand("sync-all-books");
    await waitForNotice("Readest: 0 created, 0 updated (2 books)");
    expect(await readNote(FIXTURE_NOTE)).toBe(first);
  });

  it("keeps a typed comment through re-sync, removal in Readest and return", async function () {
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created");
    const commented = addComment(await readNote(FIXTURE_NOTE), "Second fixture highlight");
    await writeNote(FIXTURE_NOTE, commented);

    await runCommand("sync-all-books");
    await waitForNotice("Readest: 0 created");
    expect(await readNote(FIXTURE_NOTE)).toBe(commented);

    const original = editBooknotes(library, FIXTURE_BOOK, (notes) =>
      notes.map((n) => (n.id === "fx-2" ? { ...n, deletedAt: 10, updatedAt: 10 } : n)),
    );
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 0 created, 1 updated");
    const gone = await readNote(FIXTURE_NOTE);
    const removed = gone.slice(gone.indexOf("Removed from Readest"));
    expect(gone).toContain("Removed from Readest");
    expect(removed).toContain("Second fixture highlight");
    expect(removed).toContain("Typed in Obsidian");
    expect(gone.split("Typed in Obsidian").length).toBe(2);

    original();
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 0 created, 1 updated");
    expect(await readNote(FIXTURE_NOTE)).toBe(commented);
  });

  it("finds a renamed note by its readest-hash instead of writing a new one", async function () {
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created");
    await browser.executeObsidian(async ({ app }, from) => {
      const file = app.vault.getFileByPath(from);
      if (!file) throw new Error(`${from} not in the vault`);
      await app.fileManager.renameFile(file, "Readest/My copy of the fixture.md");
    }, FIXTURE_NOTE);
    editBooknotes(library, FIXTURE_BOOK, (notes) => [
      ...notes,
      { ...notes[0]!, id: "fx-new", cfi: "epubcfi(/6/12!/4/2,/1:0,/1:10)", page: 60, text: "Added after the rename", createdAt: 20, updatedAt: 20 },
    ]);

    await runCommand("sync-all-books");
    await waitForNotice("Readest: 0 created, 1 updated (2 books)");
    expect(await notesIn("Readest")).toEqual(["Readest/My copy of the fixture.md", SECOND_NOTE]);
    expect(await readNote("Readest/My copy of the fixture.md")).toContain("Added after the rename");
  });
});

describe("Sync one book and append", function () {
  beforeEach(async function () {
    await startTest(freshLibrary());
  });

  it("syncs only the book picked", async function () {
    await runCommand("sync-one-book");
    await pickBook("second", "Second Book - Ben Example");
    await waitForNotice('Readest: created "Second Book" (1 highlights)');
    expect(await notesIn("Readest")).toEqual([SECOND_NOTE]);
  });

  it("appends a book under its own heading, once however often it runs", async function () {
    await openNote("Reading notes.md");
    for (let run = 0; run < 2; run++) {
      await runCommand("append-one-book");
      await pickBook("fixture", "Fixture Book - Ada Example");
      await waitForNotice('Readest: appended 4 highlights from "Fixture Book"');
    }
    const note = await readNote("Reading notes.md");
    expect(note.startsWith("# Reading notes\n\nThoughts before any highlights.\n")).toBe(true);
    expect(note.split("## Fixture Book by Ada Example").length).toBe(2);
    expect(note.split("First fixture highlight").length).toBe(2);
  });
});

describe("Finding the library", function () {
  it("uses Readest's default folder when Source is empty, and keeps Source empty", async function () {
    await startTest([]);
    freshLibrary(readestDefaultDir());
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created, 0 updated (2 books)");
    expect((await pluginSettings()).booksDirs).toEqual([]);
  });

  it("falls back to the default folder when no Source path has a library, and lists it", async function () {
    const missing = `${freshLibrary()}-moved`;
    await startTest([missing]);
    freshLibrary(readestDefaultDir());
    await runCommand("sync-all-books");
    await waitForNotice("It has been added to Source");
    await waitForNotice("Readest: 2 created");
    expect((await pluginSettings()).booksDirs).toEqual([missing, readestDefaultDir()]);
  });

  it("says where it looked when there is no library at all", async function () {
    const missing = `${freshLibrary()}-moved`;
    await startTest([missing]);
    await runCommand("sync-all-books");
    await waitForNotice("Readest sync failed: No Readest library.json found");
    expect(await notesIn("Readest")).toEqual([]);
  });
});
