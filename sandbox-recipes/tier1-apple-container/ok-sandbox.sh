#!/usr/bin/env bash
# Launch Claude Code inside the Apple Container microVM.
#
# Usage:
#   ./ok-sandbox.sh                     # interactive claude in $PWD
#   ./ok-sandbox.sh --unattended        # adds --dangerously-skip-permissions
#   ./ok-sandbox.sh -- <any claude args> # anything after -- passes to claude
#
# Environment:
#   OK_SANDBOX_TAG     — image tag (default: claude-sandbox:latest)
#   OK_SKIP_FIREWALL   — set to 1 to skip guest-side firewall (for debugging)
#   OK_MOUNT_CLAUDE    — set to 0 to NOT mount ~/.claude (use ANTHROPIC_API_KEY only)
#   OK_CPU             — CPUs (default 4)
#   OK_MEM             — memory (default 4g)

set -euo pipefail

TAG="${OK_SANDBOX_TAG:-claude-sandbox:latest}"
CPU="${OK_CPU:-4}"
MEM="${OK_MEM:-4g}"
UNATTENDED=0
CLAUDE_ARGS=()

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --unattended) UNATTENDED=1; shift ;;
    --) shift; CLAUDE_ARGS+=("$@"); break ;;
    --help|-h)
      head -n 16 "$0" | tail -n 14
      exit 0
      ;;
    *) CLAUDE_ARGS+=("$1"); shift ;;
  esac
done

if ! command -v container >/dev/null 2>&1; then
  echo "Apple 'container' CLI not found. See build.sh for installation pointer." >&2
  exit 1
fi

# Build mount array
MOUNTS=(
  -v "$PWD:/workspace"
)

if [[ "${OK_MOUNT_CLAUDE:-1}" == "1" && -d "$HOME/.claude" ]]; then
  MOUNTS+=(-v "$HOME/.claude:/home/claude/.claude")
fi

if [[ -f "$HOME/.gitconfig" ]]; then
  MOUNTS+=(--mount "type=bind,source=$HOME/.gitconfig,target=/home/claude/.gitconfig,readonly")
fi

# Env passthrough (only things the sandbox legitimately needs)
ENVS=()
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  ENVS+=(-e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
fi
if [[ "${OK_SKIP_FIREWALL:-0}" == "1" ]]; then
  ENVS+=(-e "OK_SKIP_FIREWALL=1")
fi

# Build final claude arg list
if [[ ${#CLAUDE_ARGS[@]} -eq 0 ]]; then
  CLAUDE_ARGS=(claude)
else
  # If user passed bare args, prefix with 'claude' unless their first arg IS 'claude'
  if [[ "${CLAUDE_ARGS[0]}" != "claude" ]]; then
    CLAUDE_ARGS=(claude "${CLAUDE_ARGS[@]}")
  fi
fi

if (( UNATTENDED )); then
  # Add the flag only if not already present
  if ! [[ " ${CLAUDE_ARGS[*]} " == *" --dangerously-skip-permissions "* ]]; then
    CLAUDE_ARGS+=(--dangerously-skip-permissions)
  fi
fi

echo "[ok-sandbox] Image:   $TAG"
echo "[ok-sandbox] CPU/MEM: $CPU / $MEM"
echo "[ok-sandbox] Mounts:  $PWD:/workspace + ~/.claude (if present) + ~/.gitconfig (ro)"
echo "[ok-sandbox] Cmd:     ${CLAUDE_ARGS[*]}"
echo ""

exec container run \
  --rm \
  -it \
  -c "$CPU" \
  -m "$MEM" \
  "${MOUNTS[@]}" \
  "${ENVS[@]}" \
  "$TAG" \
  "${CLAUDE_ARGS[@]}"
