import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { galleryNotes } from "./gallery-notes";

void test("docs/gallery matches the renderer (npm run gallery regenerates it)", () => {
  const dir = "docs/gallery";
  const notes = galleryNotes();
  assert.deepEqual(readdirSync(dir).sort(), Object.keys(notes).sort());
  for (const [name, content] of Object.entries(notes)) {
    assert.equal(readFileSync(join(dir, name), "utf8"), content, name);
  }
});
