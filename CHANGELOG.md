# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-05-16

### Changed

- README clarifies plugin permissions (vault read/write, read-only Readest folder, no network) and re-sync overwrite behavior.

### Security

- Release artifacts (`main.js`, `styles.css`, `manifest.json`) are now signed with GitHub build provenance attestations.
- Override transitive `yaml` dev dependency to `^2.8.3` to clear scanner advisory.

## [1.0.0] - 2026-04-22

### Added

- Initial release. Import highlights and annotations from Readest into Obsidian.
- Sync to folder (one note per book) or append to current note.
- Filename templates with `{title}`, `{author}`, `{year}`, `{series}`, `{seriesIndex}`, `{isbn}`, `{hash}` tokens.
- Configurable heading level, frontmatter fields, highlight rendering (blockquote / plain / callout / bullet), and metadata placement.
- Re-sync by `readest-hash` frontmatter, with optional preservation of manual edits outside the highlights section.

[Unreleased]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.1...HEAD
[1.0.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/polybjorn/obsidian-readest-highlights/releases/tag/1.0.0
