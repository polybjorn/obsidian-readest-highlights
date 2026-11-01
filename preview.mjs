import { copyFileSync, readFileSync, realpathSync } from "fs";
import { join } from "path";
import { mainCheckout as target, pluginDir } from "./scripts/plugin-dir.mjs";

if (pluginDir()) {
  console.log("The build already copied itself into OBSIDIAN_PLUGIN_DIR.");
  process.exit(0);
}

// Without OBSIDIAN_PLUGIN_DIR Obsidian loads the plugin from the main checkout
// (the folder symlinked into the vault), so a build made in a git worktree is
// invisible until copied there.

if (realpathSync(target) === realpathSync(".")) {
  console.log("Built in the main checkout, so Obsidian already sees it.");
  process.exit(0);
}

copyFileSync("main.js", join(target, "main.js"));
console.log(`Copied main.js to ${target}`);

// styles.css is tracked, so copying it dirties the main checkout. Only do it
// when this branch actually changed it.
const css = "styles.css";
if (!readFileSync(css).equals(readFileSync(join(target, css)))) {
  copyFileSync(css, join(target, css));
  console.log(
    `Copied ${css} too. Undo with \`git restore ${css}\` in the main checkout.`,
  );
}
