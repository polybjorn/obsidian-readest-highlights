# Installation

## Community plugins browser (recommended)

1. Open Obsidian.
2. Settings -> Community plugins.
   - If this is your first community plugin, turn off Restricted mode when prompted.
3. Browse, search "Readest Highlights".
4. Install, then Enable.

## Manual install

For an offline install or a specific version:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [release page](https://github.com/polybjorn/obsidian-readest-highlights/releases) for the version you want.
2. Inside your vault, create `.obsidian/plugins/readest-highlights/`.
3. Copy the three files into that directory.
4. In Obsidian, Settings -> Community plugins -> reload the list, then enable Readest Highlights.

Obsidian's community plugin updater will overwrite a manually installed copy when a newer release publishes.

## First-run configuration

1. Settings -> Community plugins -> Readest Highlights -> gear icon.
2. On the "Setup" tab: if Readest is in the default platform location, leave Source empty; otherwise click the folder icon to pick the Readest Books folder.
3. Try "Sync one book to folder..." from the command palette to verify the source path resolves and one note renders as expected, before running "Sync all books to folder".

See [settings.md](settings.md) for the full configuration reference.
