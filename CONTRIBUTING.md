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
ln -s "$(pwd)" /path/to/your/vault/.obsidian/plugins/obsidian-readest-highlights
```

Then enable the plugin in Obsidian's Community plugins settings. Re-run `npm run dev` after changes; Obsidian's "Reload plugin" command picks up the new build.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch build (esbuild). |
| `npm run build` | One-shot production build, runs `tsc --noEmit` first. |
| `npm run lint` | ESLint with the Obsidian plugin ruleset. |
| `npm test` | Run the test suite (`tsx --test tests/*.test.ts`). |

## Commit messages

Conventional Commits (enforced by a commit-msg hook):

```
type: short imperative description
```

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `ci`, `build`, `perf`, `revert`.

## Pull requests

- Branch from `main`.
- Keep the change focused; one PR per concern.
- Include a test plan in the PR description (what you ran, what you observed). For UI changes, a screenshot helps.
- New features that change settings should update the relevant README section in the same PR.

## Releases

Maintainer-only. Tagging `X.Y.Z` triggers the release workflow, which builds, attests, and uploads `main.js`, `manifest.json`, and `styles.css` to a GitHub release. Obsidian's community plugin browser picks up the new version on its next refresh.
