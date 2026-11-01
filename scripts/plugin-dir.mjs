import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join, resolve } from "path";

// The main checkout, whichever worktree runs the build, so one untracked .env
// there serves every worktree.
export const mainCheckout = resolve(
  execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim(),
  "..",
);

// OBSIDIAN_PLUGIN_DIR names a vault's plugin folder to copy each build into,
// for a vault synced to other devices, where a symlink would not follow.
export function pluginDir() {
  const env = join(mainCheckout, ".env");
  if (!process.env.OBSIDIAN_PLUGIN_DIR && existsSync(env)) process.loadEnvFile(env);
  return process.env.OBSIDIAN_PLUGIN_DIR || null;
}
