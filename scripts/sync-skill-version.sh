#!/usr/bin/env bash
#
# Sync SKILL.md's `metadata.version:` to match packages/cli/package.json version.
#
# Workflow: after running `bun run changeset version` (which bumps package.json
# files in the changesets fixed group), run this script to bring SKILL.md's
# version in lockstep. The release workflow's bash smoke-test fails the release
# if they ever drift — so running this after a version bump is required.
#
# Per spec 2026-04-24-skill-dual-track-install/SPEC.md D5 / D8: SKILL.md version
# is committed to git (single source of truth), and the release workflow
# verifies alignment with CLI package version before building the .skill asset.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_MD="$REPO_ROOT/packages/server/assets/skills/open-knowledge/SKILL.md"
CLI_PKG_JSON="$REPO_ROOT/packages/cli/package.json"

CLI_VERSION=$(jq -r '.version' "$CLI_PKG_JSON")
CURRENT_VERSION=$(awk '/^metadata:/{found=1} found && /^  version:/{gsub(/["'\'' ]/, "", $2); print $2; exit}' "$SKILL_MD")

if [[ "$CURRENT_VERSION" == "$CLI_VERSION" ]]; then
  echo "SKILL.md metadata.version already at $CLI_VERSION — no change needed."
  exit 0
fi

# In-place rewrite: match `  version: "..."` under the `metadata:` block.
# Use a tempfile + mv for atomicity (never leaves SKILL.md in a half-written state).
TMP="$(mktemp)"
awk -v new_ver="$CLI_VERSION" '
  /^metadata:/ { in_meta=1 }
  in_meta && /^  version:/ {
    print "  version: \"" new_ver "\""
    in_meta=0
    next
  }
  /^---$/ && NR > 1 { in_meta=0 }
  { print }
' "$SKILL_MD" > "$TMP"

mv "$TMP" "$SKILL_MD"
echo "Updated $SKILL_MD: metadata.version $CURRENT_VERSION → $CLI_VERSION"
