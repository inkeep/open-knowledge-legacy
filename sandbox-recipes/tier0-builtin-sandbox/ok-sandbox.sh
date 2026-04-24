#!/usr/bin/env bash
# Tier 0 has no container — the sandbox is Seatbelt applied to claude's own
# bash subprocess. So this wrapper just verifies a profile is installed,
# then launches `claude` directly.
#
# Usage:
#   ./ok-sandbox.sh                     # runs claude in $PWD
#   ./ok-sandbox.sh --unattended        # adds --dangerously-skip-permissions
#                                       # (safe because the sandbox is kernel-enforced)
#   ./ok-sandbox.sh -- <any claude args>

set -euo pipefail

UNATTENDED=0
CLAUDE_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unattended) UNATTENDED=1; shift ;;
    --) shift; CLAUDE_ARGS+=("$@"); break ;;
    --help|-h)
      echo "Usage: $0 [--unattended] [-- <claude args>]"
      echo ""
      echo "Tier 0 uses Anthropic's built-in sandbox (Seatbelt on macOS)."
      echo "No container — the sandbox wraps claude's bash subprocess directly."
      echo ""
      echo "Prerequisite: install a settings profile first:"
      echo "  ./install.sh interactive"
      echo "  ./install.sh unattended-trusted"
      echo "  ./install.sh unattended-hardened"
      exit 0
      ;;
    *) CLAUDE_ARGS+=("$1"); shift ;;
  esac
done

# Sanity check: did the user install a profile?
SETTINGS="$HOME/.claude/settings.json"
if [[ ! -f "$SETTINGS" ]]; then
  echo "[tier0] No ~/.claude/settings.json found." >&2
  echo "[tier0] Install a profile first:" >&2
  echo "[tier0]   ./install.sh interactive" >&2
  echo "[tier0]   ./install.sh unattended-trusted" >&2
  echo "[tier0]   ./install.sh unattended-hardened" >&2
  exit 1
fi

# Check sandbox is enabled in settings
if command -v jq >/dev/null 2>&1; then
  if ! jq -e '.sandbox.enabled == true' "$SETTINGS" >/dev/null 2>&1; then
    echo "[tier0] WARN: ~/.claude/settings.json does not have sandbox.enabled=true." >&2
    echo "[tier0]       Claude will run WITHOUT sandbox protection." >&2
    echo "[tier0]       Run ./install.sh <profile> first, or press Ctrl+C to abort." >&2
    sleep 2
  fi
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "[tier0] claude CLI not found. Install: https://code.claude.com/docs" >&2
  exit 1
fi

# Compose the command
if [[ ${#CLAUDE_ARGS[@]} -eq 0 ]]; then
  CLAUDE_CMD=(claude)
else
  if [[ "${CLAUDE_ARGS[0]}" != "claude" ]]; then
    CLAUDE_CMD=(claude "${CLAUDE_ARGS[@]}")
  else
    CLAUDE_CMD=("${CLAUDE_ARGS[@]}")
  fi
fi

if (( UNATTENDED )); then
  if ! [[ " ${CLAUDE_CMD[*]} " == *" --dangerously-skip-permissions "* ]]; then
    CLAUDE_CMD+=(--dangerously-skip-permissions)
  fi
fi

echo "[tier0] Sandbox via ~/.claude/settings.json (Seatbelt on macOS)"
echo "[tier0] Cmd: ${CLAUDE_CMD[*]}"
echo ""

exec "${CLAUDE_CMD[@]}"
