# Contributing

Bug reports, fixes and focused feature PRs are welcome. The plugin has one maintainer, so open an issue before starting a larger feature.

## Development setup

```sh
git clone https://github.com/polybjorn/obsidian-readest-highlights
cd obsidian-readest-highlights
npm ci
```

## Running the plugin locally

The build writes `main.js` next to `manifest.json` and `styles.css`. Symlink the repo into a vault's plugin folder under the name `readest-highlights`, which must match `manifest.id`:

```sh
ln -s "$(pwd)" /path/to/your/vault/.obsidian/plugins/readest-highlights
```

Enable the plugin in Settings -> Community plugins. To load a rebuild, toggle it off and on there, or install [Hot Reload](https://github.com/pjeby/hot-reload), which reloads it whenever `main.js` changes.

In a git worktree, `npm run preview` builds and copies the result into the main checkout, the folder Obsidian loads. `npm run build` in the main checkout switches back.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Rebuild on every change |
| `npm run build` | Type-check, then a production build |
| `npm run preview` | Build, then copy it into the main checkout |
| `npm run lint` | ESLint with the Obsidian plugin rules |
| `npm test` | Run the tests |
| `npm run gallery` | Regenerate `docs/gallery` (or a folder given after `--`); `npm test` fails while it is out of date |

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type: short imperative description`, where type is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `style` or `revert`. Messages that don't fit may be rewritten when the PR lands.

## Pull requests

- Branch from `main`, one concern per PR.
- Fill in the test plan in the PR template. A screenshot helps for UI changes.
- Add tests for new or changed behavior. Tests live in `tests/`, named after the `src/` module they cover.
- Update `docs/settings.md` when a setting or the output changes, and `README.md` when a command or requirement does.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything users will notice. It becomes the release notes, so write it for them.
- Keep the plugin working on the Obsidian version in `minAppVersion`. Feature-detect a newer API instead of raising it.
- Test in a real vault before opening the PR. CI runs lint, tests and build, but never loads the plugin in Obsidian.
