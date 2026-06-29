export type AnnotationFilter =
  | "all"
  | "highlights"
  | "underlines"
  | "withNotes";

type Filterable = { style: string | null; note?: string };

// Maps a filter mode to an annotation predicate. `undefined` means "include
// everything" (the "all" mode). Kept pure (no obsidian import) so it is unit
// tested directly. Squiggly counts as a highlight: in Readest it is a
// text-emphasis mark like a highlight, so "Only highlights" includes it.
export function buildAnnotationFilter(
  mode: AnnotationFilter,
): ((a: Filterable) => boolean) | undefined {
  switch (mode) {
    case "withNotes":
      return (a) => !!a.note && a.note.trim().length > 0;
    case "highlights":
      return (a) => a.style === "highlight" || a.style === "squiggly";
    case "underlines":
      return (a) => a.style === "underline";
    default:
      return undefined;
  }
}
