# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Security

- Release artifacts (`main.js`, `styles.css`, `manifest.json`) are now signed with GitHub build provenance attestations.

## [1.0.0] - 2026-04-22

- Initial release.

[Unreleased]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.1.0...HEAD
[1.1.0]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.3...1.1.0
[1.0.3]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.2...1.0.3
[1.0.2]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/polybjorn/obsidian-readest-highlights/releases/tag/1.0.0
