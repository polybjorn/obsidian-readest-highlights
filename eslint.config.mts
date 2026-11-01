import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.mts',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: {
			obsidianmd,
		},
		rules: {
			"obsidianmd/ui/sentence-case": ["error", { brands: ["Readest", "Obsidian"] }],
		},
	},
	{
		// The tests and their scripts run in Node, never inside Obsidian: there
		// is no popout window, and the demo vault script writes a fresh vault
		// whose config folder can only be Obsidian's default.
		files: ["tests/**"],
		rules: {
			"obsidianmd/hardcoded-config-path": "off",
			"obsidianmd/prefer-window-timers": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"preview.mjs",
		"scripts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
