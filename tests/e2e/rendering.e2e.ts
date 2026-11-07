import { browser, expect } from "@wdio/globals";
import {
  FIXTURE_NOTE,
  freshLibrary,
  openNote,
  runCommand,
  startTest,
  waitForNotice,
} from "./helpers";

describe("Rendering in Obsidian", function () {
  // The stylesheet colors these callouts with the theme's color variables,
  // which changed shape in 1.13 (an r,g,b triplet before, a full color after),
  // so only a real Obsidian shows whether the color reaches the callout.
  it("colors each highlight callout after its Readest color, with no title", async function () {
    await startTest(freshLibrary(), {
      highlightStyle: "callout",
      colorCallouts: true,
    });
    await runCommand("sync-all-books");
    await waitForNotice("Readest: 2 created");
    await openNote(FIXTURE_NOTE, "preview");
    // The leaf keeps an editor beside the reading view, with callouts of its own.
    const reading = ".markdown-reading-view";
    await browser
      .$(`${reading} .callout[data-callout="quote-blue"]`)
      .waitForDisplayed();

    const looks = await browser.execute(
      (scope) =>
        ["yellow", "blue", "green"].map((color) => {
          const callout = document.querySelector(
            `${scope} .callout[data-callout="quote-${color}"]`,
          )!;
          const title = callout.querySelector(".callout-title")!;
          return {
            color,
            calloutColor: getComputedStyle(callout)
              .getPropertyValue("--callout-color")
              .trim(),
            themeColor: getComputedStyle(document.body)
              .getPropertyValue(`--color-${color}`)
              .trim(),
            background: getComputedStyle(callout).backgroundColor,
            titleShown: getComputedStyle(title).display !== "none",
          };
        }),
      reading,
    );
    for (const look of looks) {
      expect(look.calloutColor).toBe(look.themeColor);
      expect(look.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(look.titleShown).toBe(false);
    }
    expect(new Set(looks.map((l) => l.background)).size).toBe(3);
  });
});
