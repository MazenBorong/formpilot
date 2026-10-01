#!/usr/bin/env bash
# Registers formpilot as an MCP server with Claude Code, user-scoped (works
# from any project, not just this one). Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/dist/src/index.js"

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH — install Claude Code first: https://claude.com/claude-code"
  exit 1
fi

if [ ! -f "$SERVER" ]; then
  echo "==> $SERVER not built yet, building first"
  (cd "$ROOT" && npm run build)
fi

if claude mcp list 2>/dev/null | grep -q '^formpilot'; then
  echo "formpilot is already registered with Claude Code. To re-register (e.g. to change scope), run:"
  echo "  claude mcp remove formpilot && npm run claude"
else
  claude mcp add formpilot --scope user -- node "$SERVER"
  echo "formpilot is registered with Claude Code (available from any project)."
fi
