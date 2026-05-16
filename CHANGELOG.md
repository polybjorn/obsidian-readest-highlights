# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.3...HEAD
[1.0.3]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.2...1.0.3
[1.0.2]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/polybjorn/obsidian-readest-highlights/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/polybjorn/obsidian-readest-highlights/releases/tag/1.0.0
