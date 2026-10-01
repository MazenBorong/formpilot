#!/usr/bin/env bash
# Registers formpilot as an MCP server with Codex, by appending to
# ~/.codex/config.toml. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/dist/src/index.js"
CODEX_CONFIG="$HOME/.codex/config.toml"

if [ ! -f "$SERVER" ]; then
  echo "==> $SERVER not built yet, building first"
  (cd "$ROOT" && npm run build)
fi

mkdir -p "$(dirname "$CODEX_CONFIG")"
touch "$CODEX_CONFIG"

if grep -q '^\[mcp_servers.formpilot\]' "$CODEX_CONFIG"; then
  echo "formpilot is already registered in $CODEX_CONFIG"
else
  {
    echo ""
    echo "[mcp_servers.formpilot]"
    echo "command = \"node\""
    echo "args = [\"$SERVER\"]"
  } >> "$CODEX_CONFIG"
  echo "formpilot is registered with Codex ($CODEX_CONFIG)."
fi
