#!/usr/bin/env bash
# Guest-side iptables allowlist for Apple Container Claude Code sandbox.
# Applied at container start by entrypoint.sh.
#
# Default-deny outbound; allow only:
#   - DNS (53/udp, 53/tcp) to the vmnet gateway
#   - HTTPS to the named domains
#   - Anthropic API (api.anthropic.com)
#   - npm + GitHub (required for typical development)
#
# LIMITATION: this runs as root inside the container. A process that escalates
# to root inside the container can flush these rules. That's why this is
# "guest-side" — for hypervisor-level enforcement we'd need host-side pf
# rules scoped to the container's vmnet IP (open research per the report).
#
# Usage:
#   firewall-init.sh            # apply rules
#   firewall-init.sh --dry-run  # print rules without applying

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# Domains the container can reach. Keep this list minimal. Add domains as needed
# for your workflow. Every addition is an exfiltration vector — a broad allow
# like github.com permits data exfiltration via gist creation per the Anthropic
# sandbox docs' own warning about broad allowlists.
ALLOWED_DOMAINS=(
  api.anthropic.com
  claude.ai
  registry.npmjs.org
  registry.yarnpkg.com
  github.com
  api.github.com
  raw.githubusercontent.com
  objects.githubusercontent.com
  codeload.github.com
  ghcr.io
  pypi.org
  files.pythonhosted.org
  deb.debian.org
  security.debian.org
  deb.nodesource.com
)

log() { echo "[firewall-init] $*" >&2; }

apply_rule() {
  if (( DRY_RUN )); then
    echo "iptables $*"
  else
    iptables "$@"
  fi
}

require_iptables() {
  if ! command -v iptables >/dev/null 2>&1; then
    log "iptables not installed; aborting."
    exit 1
  fi
}

main() {
  require_iptables
  log "Applying outbound allowlist firewall (dry-run=$DRY_RUN)"

  # Flush existing rules (idempotent re-apply)
  apply_rule -F OUTPUT
  apply_rule -F INPUT
  apply_rule -F FORWARD

  # Allow loopback
  apply_rule -A OUTPUT -o lo -j ACCEPT
  apply_rule -A INPUT -i lo -j ACCEPT

  # Allow established/related (return traffic)
  apply_rule -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  apply_rule -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

  # Allow DNS to anywhere (required for domain resolution; could tighten to vmnet gateway)
  apply_rule -A OUTPUT -p udp --dport 53 -j ACCEPT
  apply_rule -A OUTPUT -p tcp --dport 53 -j ACCEPT

  # Resolve and allow each domain. iptables takes IPs, so we resolve now.
  # NOTE: resolving at apply-time means CDN IP changes won't be picked up until
  # next container start. For long-running containers, prefer ipset with periodic refresh.
  for domain in "${ALLOWED_DOMAINS[@]}"; do
    if ips=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u); then
      while IFS= read -r ip; do
        [[ -z "$ip" ]] && continue
        apply_rule -A OUTPUT -d "$ip" -p tcp --dport 443 -j ACCEPT
        # npm falls back to 80 for registry metadata sometimes
        apply_rule -A OUTPUT -d "$ip" -p tcp --dport 80 -j ACCEPT
      done <<< "$ips"
    else
      log "WARN: could not resolve $domain; skipping"
    fi
  done

  # Default deny everything else outbound
  apply_rule -A OUTPUT -j REJECT --reject-with icmp-port-unreachable

  if (( ! DRY_RUN )); then
    log "Firewall applied. Outbound restricted to ${#ALLOWED_DOMAINS[@]} domains."
  else
    log "Dry-run complete — no rules applied."
  fi
}

main "$@"
