# Installation

Available in [Obsidian community plugins](https://community.obsidian.md/plugins/readest-highlights).

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

## Beta versions

Betas are GitHub pre-releases, which Obsidian's own updater never offers. To try one, install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community plugins, run "BRAT: Add a beta plugin for testing", enter `polybjorn/obsidian-readest-highlights` and pick the latest version. BRAT then updates it to each new beta. Once the stable release is out, pick it in BRAT or remove the plugin from BRAT's list so Obsidian's updater takes over.

## First-run configuration

1. Settings -> Community plugins -> Readest Highlights -> gear icon.
2. On the Setup page: if Readest is in the default platform location, leave Source empty; otherwise click the folder icon to pick the Readest Books folder.
3. Try "Sync one book to folder..." from the command palette to verify the source path resolves and one note renders as expected, before running "Sync all books to folder".

See [settings.md](settings.md) for the full configuration reference.
