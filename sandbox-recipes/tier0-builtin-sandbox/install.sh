#!/usr/bin/env bash
# Install a Tier 0 Claude Code sandbox settings profile into ~/.claude/settings.json.
# Backs up any existing file first.
#
# Usage:
#   ./install.sh interactive
#   ./install.sh unattended-trusted
#   ./install.sh unattended-hardened

set -euo pipefail

PROFILE="${1:-}"

case "$PROFILE" in
  interactive|unattended-trusted|unattended-hardened) ;;
  *)
    echo "Usage: $0 <interactive|unattended-trusted|unattended-hardened>" >&2
    exit 64
    ;;
esac

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SRC_DIR/settings-${PROFILE}.json"
DST_DIR="$HOME/.claude"
DST="$DST_DIR/settings.json"

if [[ ! -f "$SRC" ]]; then
  echo "Missing source: $SRC" >&2
  exit 1
fi

# Validate source is valid JSON before touching the destination.
if ! jq . "$SRC" >/dev/null 2>&1; then
  echo "Source is not valid JSON: $SRC" >&2
  exit 1
fi

mkdir -p "$DST_DIR"

BAK=""
if [[ -f "$DST" ]]; then
  BAK="$DST.bak.$(date +%Y%m%d-%H%M%S)"
  cp -p "$DST" "$BAK"
  echo "Backed up existing settings to: $BAK"
fi

# Merge with any existing settings if present; otherwise just copy.
# This preserves non-sandbox keys the user may have configured.
if [[ -n "$BAK" && -f "$BAK" ]]; then
  jq -s '.[0] * .[1]' "$BAK" "$SRC" > "$DST.tmp"
  mv "$DST.tmp" "$DST"
  echo "Merged profile '$PROFILE' into $DST (sandbox keys overwritten, other keys preserved)"
else
  cp "$SRC" "$DST"
  echo "Installed profile '$PROFILE' to $DST"
fi

echo ""
echo "Next steps:"
echo "  1. In Claude Code, run /sandbox to activate."
echo "  2. For unattended profiles, pair with --dangerously-skip-permissions."
echo "  3. See README.md in this directory for posture notes."
