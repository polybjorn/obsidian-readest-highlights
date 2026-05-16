# Obsidian Readest Highlights

![manifest version](https://img.shields.io/github/manifest-json/v/polybjorn/obsidian-readest-highlights)
![obsidian](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/polybjorn/obsidian-readest-highlights/main/manifest.json&query=$.minAppVersion&label=obsidian&color=7c3aed&logo=obsidian&logoColor=white&prefix=%E2%89%A5)
![CI](https://github.com/polybjorn/obsidian-readest-highlights/actions/workflows/ci.yml/badge.svg)

Import highlights and annotations from [Readest](https://readest.com) into your Obsidian vault.

![Example book note with imported highlights](docs/highlights-example.png)

Readest stores its library, progress, and annotations locally as JSON. This plugin reads those files and renders the highlights into markdown notes, either as one note per book in a dedicated folder, or appended to whichever note you have open.

## Requirements

Desktop Obsidian with access to a Readest Books folder. Readest's built-in sync (optional) is the easiest way to collect annotations from other devices into one folder, but any setup that exposes the folder to Obsidian works.

### What the plugin accesses

- **Readest folder, read-only.** A path outside your vault, configured in Settings. The plugin only reads `library.json` and each book's `config.json`, and never writes to this folder. Reading outside the vault requires the Node `fs` module because Obsidian's vault API does not cover external paths.
- **Vault, read and write.** Scans notes for the `readest-hash` frontmatter field inside your output folder to match books to existing notes on re-sync, then creates or updates notes there.
- **No network.** The plugin makes no outbound requests.

## Commands

| Command | Action |
|---|---|
| Sync all books to folder | Creates or updates a note per book in the configured folder. |
| Sync one book to folder... | Pick a single book from a fuzzy picker. |
| Append one book to current note... | Pick a book, appends its highlights to the active note. |

## Settings

![Setup settings tab](docs/setup-settings.png)

### Setup

- **Source**: one or more paths to Readest's Books folder. The first valid path is used, so you can list per-device locations for vaults synced across devices. Can be left empty if Readest uses its default Books folder on your platform (macOS, Windows, Linux); otherwise enter the path.
- **Output**: vault folder and filename template. Templates accept tokens `{title}`, `{author}`, `{year}`, `{series}`, `{seriesIndex}`, `{isbn}`, `{hash}`.

### Heading

- **Heading level**: H1-H4 or None. Applied to both sync and append.
- **Sync heading / Append heading**: heading text (token-aware) shown above highlights in each mode.
- **Preserve manual edits**: on re-sync, only rewrite the highlights section; other content stays. Disabled when heading level is None.

### Frontmatter

Optional YAML block at the top of book notes. Pick which fields to include (tags, author as plain text or wiki-link, year, ISBN, series, genre, Readest hash) and/or add free-form YAML.

### Rendering

- **Highlights**: filter (all annotations / only highlights / only underlines / only with notes / only highlights and underlines), style (blockquote, plain, callout, bullet), and separator (horizontal rule, blank line, group under page headings, none).
- **Metadata**: page number and color toggles, inline or below-highlight placement. Underlined annotations render as `<u>…</u>` so they stay visually distinct (toggleable).
- **Notes**: include personal notes attached to highlights, placed inside the highlight, separated below, or in a `> [!note]` callout.

## Re-sync behavior

On re-sync the plugin looks for an existing note with a matching `readest-hash` in its frontmatter before falling back to the filename template. Renaming a note in Obsidian or changing the filename template doesn't orphan old notes, as long as the Readest hash frontmatter field stays enabled.

Sync rewrites the highlights section of matched notes. With **Preserve manual edits** on, content outside that section stays. The option is force-disabled when heading level is None, in which case the whole note body is rewritten. Try **Sync one book** before **Sync all books** the first time.

## Disclaimer

Independent community plugin, not affiliated with Readest. Development was AI-assisted.
