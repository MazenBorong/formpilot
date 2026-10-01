#!/usr/bin/env bash
# One-shot setup: install deps, build, create a local config, and register
# formpilot with whichever of Claude Code / Codex is installed. Safe to
# re-run — every step is idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies (this also downloads a Chromium build)"
npm install

echo "==> Building"
npm run build

if [ ! -f formpilot.config.json ]; then
  echo "==> Creating formpilot.config.json from the example (edit it to add your hosts/profiles)"
  cp formpilot.config.example.json formpilot.config.json
else
  echo "==> formpilot.config.json already exists, leaving it alone"
fi

if command -v claude >/dev/null 2>&1; then
  echo "==> Connecting Claude Code"
  bash "$ROOT/scripts/connect-claude.sh"
else
  echo "==> Claude Code CLI not found, skipping registration"
fi

if command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; then
  echo "==> Connecting Codex"
  bash "$ROOT/scripts/connect-codex.sh"
else
  echo "==> Codex not found, skipping registration"
fi

echo "==> Linking the formpilot CLI onto your PATH"
npm link >/dev/null 2>&1 || echo "    (npm link failed — run 'node $ROOT/dist/src/cli.js fill <url>' directly instead)"

cat <<EOF

Done. formpilot is built$( command -v claude >/dev/null 2>&1 && echo ", registered with Claude Code" )$( { command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; } && echo ", registered with Codex" ).

Next:
  1. Edit $ROOT/formpilot.config.json — add the host(s) you want to test to "allowedHosts".
  2. Ask your agent: "use formpilot to dry-run the <form> on <your-host>, show me the data, then submit it"
     or run it yourself: formpilot fill http://<your-host>/<form-path> --dry-run --headed
EOF
