# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Highlights can be grouped under chapter headings, like Readest's own export: set Separator to "Group under chapter headings" in Rendering settings. Chapter titles come from a table-of-contents cache Readest writes when a book is opened, so if a book shows no chapters, open it once in Readest and re-sync. (#42)

### Fixed

- Page and chapter group headings now nest one level below the sync heading. Previously they were always `###`, so with Heading level set to H3 or H4 a re-sync mistook the first group heading for the end of the section and duplicated the rest. The default heading level is unaffected.

## [1.5.2] - 2026-07-26

No user-visible changes. The Obsidian 1.13 settings helpers are now resolved at runtime instead of through `super`, which clears the plugin review lint. Behavior on both 1.12.x and 1.13.x is unchanged.

## [1.5.1] - 2026-07-26

### Fixed

- Settings are reachable again on Obsidian 1.12.x. Plugin 1.4.0 moved settings to an API that only Obsidian 1.13 provides, which left the settings tab blank for anyone who installed it manually. It also stranded the stable channel, since Obsidian never offers a plugin version above your app version: existing installs stopped updating at 1.3.0, and fresh installs fell all the way back to 1.0.0. Settings now render either way, and the plugin requires Obsidian 1.12.7 again. (#35)
- Editing the output folder no longer stacks up one notification per character typed. The warning about a path being adjusted now appears once, after you stop typing, and no longer appears at all for a path that is only briefly invalid while you type it.

### Added

- "Extra fields" frontmatter is validated as you type, with broken YAML flagged inline.
- Source paths can be dragged to reorder. (Obsidian 1.13 and later)

### Changed

- The output folder field autocompletes existing vault folders. (Obsidian 1.13 and later)
- More settings turn up in search under alternate terms. (Obsidian 1.13 and later)

On Obsidian 1.12.x the settings appear as one scrolling page rather than four, and source paths reorder with buttons instead of dragging.

## [1.5.0] - 2026-07-25

### Added

- The template tokens (`{title}`, `{author}`, `{hash}`, etc.) are now substituted in "Extra fields" frontmatter, and two new tokens, `{publisher}` and `{language}`, join the set. (#32)
- Optional block IDs under each highlight, so you can link to a specific highlight from a canvas or another note. Off by default; the ID stays stable across re-syncs. (inspired by #31)
- Optional "Open in Readest" link under each highlight that jumps to the annotation in the app. Off by default; pick the web (universal) or `readest://` app form.

## [1.4.0] - 2026-07-17

### Changed

- The settings UI now uses Obsidian 1.13's declarative settings API. All plugin settings show up in Obsidian's settings search, and the four tabs (Setup, Heading, Frontmatter, Rendering) are now navigable pages. Settings, defaults, and note output are unchanged.

Requires Obsidian 1.13.0 or later. Users on older Obsidian versions stay on plugin 1.3.0.

## [1.3.0] - 2026-07-17

### Added

- Option to collapse line breaks within a highlight, replacing them with spaces (thanks @idkicarus).
- Auto-sync: optionally run a full sync when Obsidian starts, and/or re-sync on a fixed interval while it's open. Auto-sync runs are quiet - they only notify when something changed or a new failure appeared, and they don't rewrite notes that haven't changed. Both are off by default.
- Sort order setting for highlights: by position in the book (default, as before) or by when the highlight was made.
- Publisher and Language frontmatter fields, off by default.
- Series and Publisher can now be written as wiki-links, matching the existing option on Author and Genre.

### Fixed

- A note spanning multiple lines no longer breaks out of its blockquote or callout when attached to the highlight.
- A `## Highlights` line inside a fenced code block is no longer mistaken for the section heading during re-sync, which could cut the note at the wrong place.
- Note text now gets the same whitespace cleanup as highlight text (line breaks are kept).

## [1.2.2] - 2026-06-29

### Added

- Warn when a book's Readest config is a newer schema version than this plugin supports _and_ no highlights can be read from it - the case where a future format change would otherwise import nothing with no signal. A newer Readest version that still syncs highlights fine stays quiet.

### Changed

- "Only highlights" now also includes squiggly annotations; Readest treats squiggly as a highlight style.

### Removed

- The "Only highlights and underlines" filter option. Its only effect was excluding bookmarks, which now rarely differs from "All annotations"; if it was selected, it falls back to "All annotations" (use "Only with notes" to filter to annotations you wrote a note on).

### Fixed

- A highlight that shared a text location with another highlight was silently dropped from the note; both are now kept.
- A highlight sharing a location with an underline is no longer rendered as underlined.
- Frontmatter no longer breaks when a title, author, series, or genre value contains a newline or tab.
- Long titles in non-Latin scripts (e.g. Norwegian, CJK) no longer exceed the filesystem's filename limit; names are capped by byte length.
- A title made entirely of unsupported filename characters now falls back to the book hash instead of producing a nameless file.
- Bookmarks with no text or note no longer render as empty highlight entries.
- One book that fails to write no longer aborts the whole "Sync all" run; the remaining books still sync and the count reports any failures.
- A filename collision now finds a free name instead of failing the sync.
- A `library.json` that isn't a JSON array now reports a clear "format may have changed" error instead of an opaque crash; library entries with no usable book hash are skipped, and duplicate book hashes are flagged.
- The output folder is kept vault-relative (leading slashes and `..` segments are stripped) so it can't point outside the vault.
- A non-numeric "Max genres" entry no longer silently resets the limit to unlimited.

## [1.2.1] - 2026-06-29

### Fixed

- Stop the false "update the plugin" warning that appeared on every sync with current Readest libraries. The warning no longer keys off Readest's config schema version (which changes for reasons unrelated to highlights) - it now fires only when a highlight genuinely can't be read, so newer Readest versions sync cleanly. (thanks @logicelf for the diagnosis in PR #23)

## [1.2.0] - 2026-05-18

### Added

- Show count: optional "Total highlights: N" line under the highlights heading. Counts the annotations actually rendered (respects the Filter setting). Off by default.
- Notice when a book's `config.json` schema version exceeds what this build supports; sync continues on best effort.

### Changed

- Per-book config reads run in parallel; sync is faster on large libraries.

### Fixed

- JSON parse failures in `library.json` or a book's `config.json` name the offending file path in the error message.

## [1.1.1] - 2026-05-16

### Changed

- Vaults synced across devices: the current platform's Readest default location is now always tried as a last-resort fallback when none of your listed paths match. When the fallback succeeds and you had at least one explicit entry, the discovered path is appended to your Source list so the next sync skips the lookup.

## [1.1.0] - 2026-05-16

### Added

- Genre formatting options: Format (plain or wiki-link), Max genres cap, Natural order (swap inverted headings like "Knowledge, Theory of" to "Theory of Knowledge"), Clean names (strip cataloging suffixes and de-duplicate).
- Duplicate-hash detection: notes sharing a `readest-hash` now surface as a Notice instead of one silently overwriting the other in the sync index.

### Fixed

- Author and genre frontmatter render correctly for books whose metadata uses localized object shapes; previously appeared as `[object Object]`.
- Embedded quotes in author/isbn/series/tag/genre values are escaped, keeping the YAML block valid.
- Concurrent sync clicks no longer launch parallel runs; second click reports "sync already running".
- Two books with the same templated filename produce separate notes; the second gets a hash suffix instead of overwriting the first.
- "Append one book" failures surface as a Notice; previously silent.
- Output folder pointing at an existing file produces a clear error.
- Cleared Output folder falls back to the default.
- Browse picker shows a Notice when the file dialog is unavailable.
- Generated filenames capped at 200 characters to stay under filesystem limits.
- Lines containing only `---` in "Extra fields" are stripped to keep the frontmatter block valid.
- Sync waits for Obsidian to finish initial scanning before building the hash index, preventing duplicate notes when syncing immediately after launch.

## [1.0.3] - 2026-05-16

### Changed

- Scoped vault traversal to the configured output folder instead of walking every markdown file in the vault. Same behavior, less access, faster on large vaults.

## [1.0.2] - 2026-05-16

### Security

- Bumped vulnerable transitive dev dependencies (`ajv`, `flatted`, `minimatch`, `brace-expansion`, `fast-uri`) flagged by `npm audit` and the Obsidian community plugin scorecard. Dev-only, no runtime change.

## [1.0.1] - 2026-05-16

### Added

- Release artifacts (`main.js`, `styles.css`, `manifest.json`) are now signed with GitHub build provenance attestations.

## [1.0.0] - 2026-04-22

- Initial release.

[Unreleased]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.5.2...HEAD
[1.5.2]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.5.1...1.5.2
[1.5.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.4.0...1.5.0
[1.4.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.3.0...1.4.0
[1.3.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.2.2...1.3.0
[1.2.2]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.2.1...1.2.2
[1.2.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.2.0...1.2.1
[1.2.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.1.1...1.2.0
[1.1.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.3...1.1.0
[1.0.3]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.2...1.0.3
[1.0.2]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/polybjorn/obsidian-readest-highlights/releases/tag/1.0.0
