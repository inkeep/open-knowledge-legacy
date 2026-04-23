#!/usr/bin/env bash
# Launch Claude Code inside the matryoshka sandbox (Apple Container + bubblewrap inside).
# Same arg surface as tier1-apple-container/ok-sandbox.sh — see its --help.

set -euo pipefail

TAG="${OK_SANDBOX_TAG:-claude-matryoshka:latest}"
CPU="${OK_CPU:-4}"
MEM="${OK_MEM:-4g}"
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

if ! command -v container >/dev/null 2>&1; then
  echo "Apple 'container' CLI not found." >&2
  exit 1
fi

MOUNTS=(
  -v "$PWD:/workspace"
)

# Do NOT mount ~/.claude by default in matryoshka — the built-in sandbox reads
# from the in-container /home/claude/.claude/settings.json which is already
# configured. If you need your host settings (e.g. authenticated session),
# explicitly enable:
if [[ "${OK_MOUNT_HOST_CLAUDE:-0}" == "1" && -d "$HOME/.claude" ]]; then
  MOUNTS+=(-v "$HOME/.claude:/home/claude/.claude-host")
fi

if [[ -f "$HOME/.gitconfig" ]]; then
  MOUNTS+=(--mount "type=bind,source=$HOME/.gitconfig,target=/home/claude/.gitconfig,readonly")
fi

ENVS=()
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  ENVS+=(-e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
fi

if [[ ${#CLAUDE_ARGS[@]} -eq 0 ]]; then
  CLAUDE_ARGS=(claude)
else
  if [[ "${CLAUDE_ARGS[0]}" != "claude" ]]; then
    CLAUDE_ARGS=(claude "${CLAUDE_ARGS[@]}")
  fi
fi

if (( UNATTENDED )); then
  if ! [[ " ${CLAUDE_ARGS[*]} " == *" --dangerously-skip-permissions "* ]]; then
    CLAUDE_ARGS+=(--dangerously-skip-permissions)
  fi
fi

echo "[matryoshka] Image:   $TAG"
echo "[matryoshka] Mounts:  $PWD:/workspace (+ gitconfig ro)"
echo "[matryoshka] Cmd:     ${CLAUDE_ARGS[*]}"
echo "[matryoshka] The inner /sandbox is pre-enabled via baked settings.json."
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
