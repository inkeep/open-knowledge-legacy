#!/usr/bin/env bash
# Launch Claude Code inside the Lima VM.
#
# Usage:
#   ./ok-sandbox.sh                     # claude in $PWD (mapped to VM path)
#   ./ok-sandbox.sh --unattended        # adds --dangerously-skip-permissions
#   ./ok-sandbox.sh -- <any claude args>

set -euo pipefail

NAME="${OK_LIMA_NAME:-claude-sandbox}"
UNATTENDED=0
CLAUDE_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unattended) UNATTENDED=1; shift ;;
    --) shift; CLAUDE_ARGS+=("$@"); break ;;
    --help|-h)
      echo "Usage: $0 [--unattended] [-- <claude args>]"
      exit 0
      ;;
    *) CLAUDE_ARGS+=("$1"); shift ;;
  esac
done

if ! command -v limactl >/dev/null 2>&1; then
  echo "Lima not installed. Run: brew install lima" >&2
  exit 1
fi

# Ensure the VM exists and is running
if ! limactl list --format '{{.Name}}' 2>/dev/null | grep -qx "$NAME"; then
  echo "VM '$NAME' doesn't exist. Run: ./setup.sh" >&2
  exit 1
fi

STATUS=$(limactl list --format '{{.Status}}' "$NAME" 2>/dev/null || echo "Unknown")
if [[ "$STATUS" != "Running" ]]; then
  echo "[ok-sandbox] Starting VM '$NAME'..."
  limactl start "$NAME"
fi

# Compose the claude command
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

# Pass through ANTHROPIC_API_KEY if set
ENVS=()
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  ENVS+=(--env "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
fi

echo "[ok-sandbox] Entering VM '$NAME' in $PWD"
echo "[ok-sandbox] Cmd:     ${CLAUDE_CMD[*]}"
echo ""

exec limactl shell "${ENVS[@]}" --workdir "$PWD" "$NAME" -- "${CLAUDE_CMD[@]}"
