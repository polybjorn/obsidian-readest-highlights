import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnnotationFilter } from "../src/filters";

const ann = (style: string | null, note = "") => ({ style, note });

void test("'all' returns no predicate (includes everything)", () => {
  assert.equal(buildAnnotationFilter("all"), undefined);
});

void test("'highlights' counts both highlight and squiggly", () => {
  const f = buildAnnotationFilter("highlights");
  assert.ok(f);
  assert.equal(f(ann("highlight")), true);
  assert.equal(f(ann("squiggly")), true);
  assert.equal(f(ann("underline")), false);
  assert.equal(f(ann(null)), false);
});

void test("'underlines' matches only underline", () => {
  const f = buildAnnotationFilter("underlines");
  assert.ok(f);
  assert.equal(f(ann("underline")), true);
  assert.equal(f(ann("squiggly")), false);
  assert.equal(f(ann("highlight")), false);
});

void test("'withNotes' matches a non-empty note regardless of style", () => {
  const f = buildAnnotationFilter("withNotes");
  assert.ok(f);
  assert.equal(f(ann(null, "a note")), true);
  assert.equal(f(ann("highlight", "   ")), false);
  assert.equal(f(ann("highlight", "")), false);
});
