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

SERVER="$ROOT/dist/src/index.js"

if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q '^formpilot'; then
    echo "==> Claude Code: formpilot already registered"
  else
    echo "==> Registering formpilot with Claude Code"
    claude mcp add formpilot -- node "$SERVER"
  fi
else
  echo "==> Claude Code CLI not found, skipping registration"
fi

CODEX_CONFIG="$HOME/.codex/config.toml"
if command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; then
  mkdir -p "$(dirname "$CODEX_CONFIG")"
  touch "$CODEX_CONFIG"
  if grep -q '^\[mcp_servers.formpilot\]' "$CODEX_CONFIG" 2>/dev/null; then
    echo "==> Codex: formpilot already registered"
  else
    echo "==> Registering formpilot with Codex ($CODEX_CONFIG)"
    {
      echo ""
      echo "[mcp_servers.formpilot]"
      echo "command = \"node\""
      echo "args = [\"$SERVER\"]"
    } >> "$CODEX_CONFIG"
  fi
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
