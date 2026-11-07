import { browser, expect } from "@wdio/globals";
import { freshLibrary, openSettings, pluginSettings, startTest } from "./helpers";

const MISSING = "No Readest library here on this device, so sync skips this path.";

describe("Settings", function () {
  it("lists each Source path and marks the one with no library on this device", async function () {
    const library = freshLibrary();
    const missing = `${library}-moved`;
    await startTest([library, missing]);
    await openSettings("Setup");

    const rows = await browser.$$(".readest-books-dir-row");
    expect(rows.length).toBe(2);
    expect(await rows[0]!.$("input").getValue()).toBe(library);
    expect(await rows[1]!.$("input").getValue()).toBe(missing);
    await expect(rows[1]!.$(".readest-inline-error")).toHaveText(MISSING);
    await expect(rows[0]!.$(".readest-inline-error")).toHaveText("");
  });

  it("adds a Source path and saves what is typed into it", async function () {
    const library = freshLibrary();
    await startTest([]);
    await openSettings("Setup");

    await browser.$('[aria-label="Add path"]').click();
    const input = browser.$(".readest-books-dir-row input");
    await input.setValue(`${library}-moved`);
    await expect(browser.$(".readest-books-dir-row .readest-inline-error")).toHaveText(MISSING);
    await input.setValue(` ${library} `);
    await expect(browser.$(".readest-books-dir-row .readest-inline-error")).toHaveText("");
    expect((await pluginSettings()).booksDirs).toEqual([library]);
  });

  it("asks before a reset, and keeps Source and the output folder through one", async function () {
    const library = freshLibrary();
    await startTest(library, {
      highlightStyle: "callout",
      syncHeadingLevel: 3,
      outputFolder: "Books/Readest",
    });
    await openSettings();

    await browser.$(".readest-reset-group button.mod-destructive").click();
    const dialog = browser.$(".modal-container.mod-confirmation");
    await expect(dialog.$(".modal-title")).toHaveText("Reset settings to defaults?");
    await dialog.$("button.mod-cancel").click();
    await expect(dialog).not.toBeExisting();
    expect(await pluginSettings()).toMatchObject({ highlightStyle: "callout", syncHeadingLevel: 3 });

    await browser.$(".readest-reset-group button.mod-destructive").click();
    await browser.$(".modal-container.mod-confirmation button.mod-destructive").click();
    await browser.waitUntil(async () => (await pluginSettings()).highlightStyle === "bullet");
    expect(await pluginSettings()).toMatchObject({
      highlightStyle: "bullet",
      syncHeadingLevel: 2,
      outputFolder: "Books/Readest",
      booksDirs: [library],
    });
  });
});
