// Writes a demo vault of public-domain books for README screenshots:
// `npm run demo-vault -- <folder>`. The notes render with the plugin defaults
// plus chapter headings, and the built plugin is copied in so its stylesheet
// draws the squiggly underline. Run `npm run build` first. The hashes
// match no real Readest book, so a sync from the demo vault adds notes beside
// these and never overwrites one.
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { bookFilename, optionsFromSettings, renderBookNote } from "../src/renderer";
import { DEFAULT_SETTINGS } from "../src/settings";
import type { ReadestAnnotation, ReadestLibraryBook } from "../src/types";

type Quote = [
  chapter: string,
  page: number,
  color: string,
  text: string,
  extra?: Partial<ReadestAnnotation>,
];

type Demo = [
  title: string,
  author: string,
  published: string,
  subject: string[],
  quotes: Quote[],
];

// Pride and Prejudice is the screenshot note, so its first screen mixes
// chapter headings, a note, an underline and a squiggly underline.
const demos: Demo[] = [
  ["Pride and Prejudice", "Jane Austen", "1813", ["Courtship", "Domestic fiction"], [
    ["Chapter 1", 1, "yellow", "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife."],
    ["Chapter 5", 22, "red", "I could easily forgive his pride, if he had not mortified mine.", { note: "Elizabeth, on Darcy at the assembly." }],
    ["Chapter 5", 23, "blue", "Vanity and pride are different things, though the words are often used synonymously.", { style: "squiggly" }],
    ["Chapter 11", 68, "green", "I declare after all there is no enjoyment like reading!", { style: "underline" }],
    ["Chapter 31", 196, "violet", "There is a stubbornness about me that never can bear to be frightened at the will of others."],
  ]],
  ["Frankenstein", "Mary Shelley", "1818", ["Science fiction", "Gothic fiction"], [
    ["Chapter 10", 94, "red", "I was benevolent and good; misery made me a fiend."],
    ["Chapter 10", 95, "blue", "Life, although it may only be an accumulation of anguish, is dear to me, and I will defend it."],
    ["Chapter 20", 158, "yellow", "Beware; for I am fearless, and therefore powerful."],
  ]],
  ["Jane Eyre", "Charlotte Brontë", "1847", ["Bildungsromans", "Love stories"], [
    ["Chapter 6", 58, "green", "Life appears to me too short to be spent in nursing animosity or registering wrongs."],
    ["Chapter 23", 284, "violet", "I am no bird; and no net ensnares me: I am a free human being with an independent will, which I now exert to leave you."],
    ["Chapter 38", 517, "yellow", "Reader, I married him."],
  ]],
  ["A Tale of Two Cities", "Charles Dickens", "1859", ["Historical fiction"], [
    ["Book 1, Chapter 1", 1, "yellow", "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness"],
    ["Book 3, Chapter 15", 389, "red", "It is a far, far better thing that I do, than I have ever done; it is a far, far better rest that I go to than I have ever known."],
  ]],
  ["Anna Karenina", "Leo Tolstoy", "1877", ["Domestic fiction", "Russia"], [
    ["Part 1, Chapter 1", 1, "blue", "Happy families are all alike; every unhappy family is unhappy in its own way."],
  ]],
  ["The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "1892", ["Detective and mystery stories"], [
    ["A Scandal in Bohemia", 5, "green", "You see, but you do not observe. The distinction is clear."],
    ["A Scandal in Bohemia", 6, "yellow", "It is a capital mistake to theorize before one has data."],
    ["A Case of Identity", 58, "violet", "It has long been an axiom of mine that the little things are infinitely the most important."],
  ]],
  ["The Book of Tea", "Kakuzo Okakura", "1906", ["Tea", "Japan"], [
    ["I. The Cup of Humanity", 3, "green", "Tea began as a medicine and grew into a beverage."],
    ["I. The Cup of Humanity", 4, "yellow", "Teaism is a cult founded on the adoration of the beautiful among the sordid facts of everyday existence."],
  ]],
];

const dir = process.argv[2];
if (!dir) throw new Error("Usage: npm run demo-vault -- <folder>");
const built = ["main.js", "manifest.json", "styles.css"];
if (!existsSync("main.js")) throw new Error("main.js is missing; run npm run build first");

const settings = { ...DEFAULT_SETTINGS, highlightGrouping: "chapter" as const };
const options = optionsFromSettings(settings);
const notes = join(dir, settings.outputFolder);
mkdirSync(notes, { recursive: true });

for (const [title, author, published, subject, quotes] of demos) {
  const hash = createHash("md5").update(title).digest("hex");
  const book: ReadestLibraryBook = {
    hash,
    format: "EPUB",
    title,
    author,
    createdAt: 0,
    metadata: { published, language: "en", subject },
  };
  const annotations = quotes.map(([chapter, page, color, text, extra], i): ReadestAnnotation => ({
    bookHash: hash,
    id: `${hash.slice(0, 8)}-${i}`,
    type: "annotation",
    cfi: `epubcfi(/6/${(i + 1) * 2}!/4/2)`,
    page,
    chapter,
    text,
    style: "highlight",
    color,
    note: "",
    createdAt: i,
    updatedAt: i,
    deletedAt: null,
    ...extra,
  }));
  const name = bookFilename(book, settings.filenameTemplate);
  writeFileSync(join(notes, name), renderBookNote({ book, annotations }, options));
}

// A new vault has no configured config folder yet, so Obsidian's default is
// the one it will read.
// eslint-disable-next-line obsidianmd/hardcoded-config-path
const config = join(dir, ".obsidian");
const plugin = join(config, "plugins", "readest-highlights");
mkdirSync(plugin, { recursive: true });
for (const file of built) copyFileSync(file, join(plugin, file));
writeFileSync(join(config, "community-plugins.json"), '["readest-highlights"]\n');
process.stdout.write(`Wrote ${demos.length} notes and the plugin to ${dir}\n`);
