// Writes the gallery notes to docs/gallery, or to the folder given, such as
// one inside a vault: `npm run gallery -- <folder>`.
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { galleryNotes } from "./gallery-notes";

const dir = process.argv[2] ?? "docs/gallery";
mkdirSync(dir, { recursive: true });
const notes = galleryNotes();
for (const [name, content] of Object.entries(notes)) {
  writeFileSync(join(dir, name), content);
}
process.stdout.write(`Wrote ${Object.keys(notes).length} notes to ${dir}\n`);
