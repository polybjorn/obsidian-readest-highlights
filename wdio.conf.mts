// End-to-end tests in a real, sandboxed Obsidian: `npm run test:e2e` runs this
// in Docker (tests/e2e/docker.sh), `npm run test:e2e:display` here. Runs the
// oldest public release the manifest's minAppVersion allows and the latest
// stable one, each on the oldest installer that app version supports, the
// setup most users who never reinstall have. OBSIDIAN_VERSIONS="1.15.0/1.15.0"
// picks others.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env } from "node:process";
import ObsidianLauncher from "obsidian-launcher";
import { parseObsidianVersions } from "wdio-obsidian-service";

const cacheDir = resolve(".obsidian-cache");
const stage = resolve(".e2e/plugin");
const fixtureLibrary = resolve("tests/e2e/fixtures/readest");

// The build goes to its own folder, not the repo root, since the launcher
// copies a data.json beside main.js into the test vault, and the root one holds
// the developer's own settings and Readest path. The config is loaded again in
// every worker, which must not rebuild under a running test.
if (!env.WDIO_WORKER_ID) {
  mkdirSync(stage, { recursive: true });
  execFileSync(process.execPath, ["esbuild.config.mjs", "production"], {
    env: { ...env, OBSIDIAN_PLUGIN_DIR: stage },
    stdio: "inherit",
  });
  // Points at the fixture from the first load, so nothing can fall back to
  // the Readest library of the machine running the tests.
  writeFileSync(resolve(stage, "data.json"), JSON.stringify({ booksDirs: [fixtureLibrary] }));
}

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return (x![i] ?? 0) > (y![i] ?? 0);
  return false;
};

// A .0 release often ships to Insiders only, which the launcher cannot download
// without an account, so the floor is the first public build at or above it.
const { minAppVersion } = JSON.parse(readFileSync("manifest.json", "utf8")) as {
  minAppVersion: string;
};
const oldest = (await new ObsidianLauncher({ cacheDir }).getVersions()).find(
  (v) => v.isBeta === false && !newer(minAppVersion, v.version),
)?.version;
if (!oldest) throw new Error(`No public Obsidian release at or above ${minAppVersion}`);

const versions = await parseObsidianVersions(
  env.OBSIDIAN_VERSIONS ?? `${oldest}/earliest latest/earliest`,
  { cacheDir },
);

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  specs: ["./tests/e2e/**/*.e2e.ts"],
  maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),
  capabilities: versions.map(([appVersion, installerVersion]) => ({
    browserName: "obsidian",
    "wdio:obsidianOptions": {
      appVersion,
      installerVersion,
      plugins: [stage],
      vault: "tests/e2e/fixtures/vault",
    },
  })),
  services: ["obsidian"],
  reporters: ["obsidian"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60 * 1000,
  },
  // Readest's default and recorded library paths come from the home folder
  // (APPDATA and XDG on other systems), so an empty one leaves the plugin no
  // way to reach a real library when a test's own path is missing. The
  // driver, and Obsidian under it, inherit this worker's environment.
  beforeSession() {
    const home = mkdtempSync(join(tmpdir(), "readest-e2e-home-"));
    Object.assign(env, {
      HOME: home,
      APPDATA: join(home, "AppData"),
      XDG_CONFIG_HOME: join(home, ".config"),
      XDG_DATA_HOME: join(home, ".local", "share"),
    });
  },
  waitforInterval: 100,
  waitforTimeout: 10 * 1000,
  logLevel: "warn",
  cacheDir,
  injectGlobals: false,
};
