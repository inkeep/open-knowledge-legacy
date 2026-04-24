#!/usr/bin/env bash
# Entrypoint for the Tier 1 Apple Container Claude Code sandbox.
#
# Runs as root (enforced by Containerfile USER root) so iptables can be applied,
# then drops to the 'claude' user for the actual command.
#
# Environment variables:
#   OK_SKIP_FIREWALL=1          — skip firewall setup (useful for debugging)
#   OK_CLAUDE_USER=claude       — override the non-root user
set -euo pipefail

CLAUDE_USER="${OK_CLAUDE_USER:-claude}"

log() { echo "[entrypoint] $*" >&2; }

if [[ "${OK_SKIP_FIREWALL:-0}" == "1" ]]; then
  log "OK_SKIP_FIREWALL=1 — not applying firewall"
else
  if [[ "$(id -u)" == "0" ]]; then
    log "Applying guest-side firewall..."
    /usr/local/bin/firewall-init.sh
  else
    log "WARN: not root — firewall cannot be applied. Running as user $(id -un)."
    log "      Expected to run as root initially; something reshaped the container."
  fi
fi

# Drop to claude user for the actual command.
# Preserve ANTHROPIC_API_KEY + other CLAUDE_ vars that might be set.
cd /workspace

if [[ "$(id -u)" == "0" ]]; then
  log "Dropping to user '$CLAUDE_USER' to run: $*"
  # `exec` replaces the shell process with su — tini remains PID 1.
  # --preserve-environment keeps ANTHROPIC_API_KEY etc; --login gives claude a real shell env.
  exec sudo -u "$CLAUDE_USER" --preserve-env=ANTHROPIC_API_KEY,CLAUDE_CODE_USE_BEDROCK,CLAUDE_CODE_USE_VERTEX,HTTP_PROXY,HTTPS_PROXY,NO_PROXY -- "$@"
else
  # Already running as non-root (shouldn't normally happen, but respect it)
  exec "$@"
fi
