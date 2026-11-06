import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

function section(changelog: string, name: string): string {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## \[|^\[.*\]:/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n").trim();
}

/** A beta has no section of its own, so its notes are what is unreleased at its commit. */
export function releaseNotes(changelog: string, tag: string): string {
  return section(changelog, tag.includes("-") ? "Unreleased" : tag);
}

/** Whether a PR changes what users get without saying so in the changelog. */
export function lacksEntry(title: string, labels: string[], files: string[]): boolean {
  if (labels.includes("no-changelog") || !/^(feat|fix)(\(.*\))?!?:/.test(title)) return false;
  return files.some((file) => file.startsWith("src/") || file === "styles.css") && !files.includes("CHANGELOG.md");
}

function printNotes(tag: string): void {
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), tag);
  if (!notes) {
    console.error(`CHANGELOG.md has no notes for ${tag}`);
    process.exit(1);
  }
  console.log(notes);
}

function checkPr(): void {
  const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as {
    pull_request: { title: string; labels: { name: string }[]; base: { ref: string } };
  };
  const diff = execFileSync("git", ["diff", "--name-only", `origin/${pr.base.ref}...HEAD`], { encoding: "utf8" });
  if (lacksEntry(pr.title, pr.labels.map((label) => label.name), diff.trim().split("\n"))) {
    console.error("Add a line to CHANGELOG.md under [Unreleased], or the no-changelog label if users never got what this changes");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, tag] = process.argv.slice(2);
  if (command === "notes" && tag) printNotes(tag);
  else if (command === "check-pr") checkPr();
  else {
    console.error("Usage: changelog.ts notes <tag> | check-pr");
    process.exit(1);
  }
}
