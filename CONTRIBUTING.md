# Contributing

This is a small community plugin maintained by a single author; bug reports, small fixes, and well-scoped feature PRs are all welcome.

## Development setup

```sh
git clone https://github.com/polybjorn/obsidian-readest-highlights
cd obsidian-readest-highlights
npm ci
```

## Running the plugin locally

The build outputs `main.js` next to `manifest.json` and `styles.css`. To use the dev build inside Obsidian, symlink the repo into a vault's plugin folder:

```sh
ln -s "$(pwd)" /path/to/your/vault/.obsidian/plugins/readest-highlights
```

The target folder name must be `readest-highlights` (matching `manifest.id`), regardless of where the repo lives.

Enable the plugin in Settings -> Community plugins. To pick up a rebuild, toggle the plugin off and back on in that same panel.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch build (esbuild). |
| `npm run build` | One-shot production build, runs `tsc --noEmit` first. |
| `npm run lint` | ESLint with the Obsidian plugin ruleset. |
| `npm test` | Run the test suite (`tsx --test tests/*.test.ts`). |

## Commit messages

Conventional Commits:

```
type: short imperative description
```

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `ci`, `build`, `perf`, `revert`. PRs that don't follow this convention may be squashed with a rewritten message on merge.

## Pull requests

- Branch from `main`.
- Keep the change focused; one PR per concern.
- Include a test plan in the PR description (what you ran, what you observed). For UI changes, a screenshot helps.
- New features that change settings should update the relevant README section in the same PR.
- For changes that touch UI, settings, rendering, or the build, test the plugin against a real Obsidian vault before opening the PR. CI runs lint, tests, and build, but does not load the bundle in Obsidian.
