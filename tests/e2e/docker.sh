#!/usr/bin/env bash
# `npm run test:e2e`: the end-to-end tests in a Linux container against a
# virtual display, so no Obsidian window opens on the desktop running them.
# Arguments go to wdio, e.g. `npm run test:e2e -- --spec tests/e2e/sync.e2e.ts`.
set -euo pipefail
cd "$(dirname "$0")/../.."

docker build -q -t readest-e2e tests/e2e >/dev/null

# node_modules and the Obsidian downloads get volumes of their own: the host's
# copies are built for the host's system, and esbuild and Obsidian are native.
# So does the staged build, which is rewritten in place and read at once, and
# once read stale through Docker Desktop's file sharing.
# npm ci runs only when the lockfile changed since the volume's last install.
# --init, since xvfb-run as process 1 never sees the signal that the display
# is up, and waits forever.
exec docker run --rm --init \
  -v "$PWD:/work" -w /work \
  -v readest-e2e-node-modules:/work/node_modules \
  -v readest-e2e-obsidian-cache:/work/.obsidian-cache \
  -v readest-e2e-stage:/work/.e2e \
  -e OBSIDIAN_VERSIONS -e WDIO_MAX_INSTANCES \
  readest-e2e bash -c '
    set -euo pipefail
    lock=$(sha256sum package-lock.json)
    if [ "$(cat node_modules/.e2e-lock 2>/dev/null)" != "$lock" ]; then
      npm ci --no-audit --no-fund --loglevel=error
      echo "$lock" > node_modules/.e2e-lock
    fi
    exec xvfb-run -a npm run test:e2e:display -- "$@"
  ' bash "$@"
