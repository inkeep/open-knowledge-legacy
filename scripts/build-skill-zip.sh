#!/usr/bin/env bash
#
# Build openknowledge.skill — the packaged Agent Skill artifact for Claude Desktop
# / Cowork. Output is a ZIP with a .skill extension (Anthropic's canonical format
# for file-association install on macOS, per /Applications/Claude.app Info.plist
# CFBundleDocumentTypes).
#
# Source: packages/server/assets/skills/open-knowledge/
# Output: openknowledge.skill (at the path passed as $1, defaulting to cwd)
#
# Used by:
#   - CI release workflow (.github/workflows/release.yml) — builds + attaches to
#     every `@inkeep/open-knowledge` GitHub Release.
#   - Local dev via `bun run build:skill-zip` — same bits, same validation.
#
# Structure validated post-build per FR4 (spec D3 bash smoke-test):
#   1. ZIP contains `open-knowledge/SKILL.md`
#   2. Size < 100 KB (room to grow from ~10 KB DEFLATE baseline without
#      accidental binary bloat)
#   3. SKILL.md frontmatter `name:` matches `open-knowledge` (spec FR2)
#   4. SKILL.md `metadata.version:` matches @inkeep/open-knowledge CLI version
#      (spec FR3 / D5)

set -euo pipefail

OUT_PATH="${1:-openknowledge.skill}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILL_SRC="$REPO_ROOT/packages/server/assets/skills/open-knowledge"
CLI_PKG_JSON="$REPO_ROOT/packages/cli/package.json"

if [[ ! -d "$SKILL_SRC" ]]; then
  echo "ERROR: skill source not found at $SKILL_SRC" >&2
  exit 1
fi

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "ERROR: SKILL.md missing from $SKILL_SRC" >&2
  exit 1
fi

if [[ ! -f "$CLI_PKG_JSON" ]]; then
  echo "ERROR: $CLI_PKG_JSON not found" >&2
  exit 1
fi

# Resolve to absolute path before `cd` so relative OUT_PATHs end up in the
# invoker's cwd, not in packages/server/assets/skills.
case "$OUT_PATH" in
  /*) ABS_OUT="$OUT_PATH" ;;
  *)  ABS_OUT="$PWD/$OUT_PATH" ;;
esac

# Build the ZIP. `cd` into the parent of the wrapper folder so the archive
# contains `open-knowledge/SKILL.md` and not `packages/server/assets/skills/open-knowledge/SKILL.md`.
rm -f "$ABS_OUT"
(cd "$(dirname "$SKILL_SRC")" && zip -rq "$ABS_OUT" "$(basename "$SKILL_SRC")")

# Smoke-test 1: wrapper folder is at ZIP root with SKILL.md inside.
if ! unzip -l "$ABS_OUT" | grep -q 'open-knowledge/SKILL.md'; then
  echo "ERROR: ZIP missing open-knowledge/SKILL.md at wrapper-folder root" >&2
  unzip -l "$ABS_OUT" >&2
  exit 1
fi

# Smoke-test 2: size ceiling (100 KB). Current baseline is ~10 KB; the ceiling
# catches accidental binary bloat without rejecting normal growth.
SIZE=$(stat -f%z "$ABS_OUT" 2>/dev/null || stat -c%s "$ABS_OUT")
if [[ "$SIZE" -gt 102400 ]]; then
  echo "ERROR: $ABS_OUT is $SIZE bytes, exceeds 100 KB ceiling" >&2
  exit 1
fi

# Smoke-test 3: SKILL.md frontmatter `name:` matches `open-knowledge`.
if ! unzip -p "$ABS_OUT" open-knowledge/SKILL.md | grep -qE '^name: open-knowledge$'; then
  echo "ERROR: SKILL.md frontmatter name does not match 'open-knowledge'" >&2
  unzip -p "$ABS_OUT" open-knowledge/SKILL.md | head -5 >&2
  exit 1
fi

# Smoke-test 4: `metadata.version:` matches the CLI package version (FR3 / D5).
# Skip if metadata.version is absent (SKILL.md hasn't been updated for Ship 1b
# yet) — the release workflow re-runs this after Ship 1b is merged and
# frontmatter includes the field. Soft-check logs a warning but doesn't fail.
CLI_VERSION=$(jq -r '.version' "$CLI_PKG_JSON")
SKILL_VERSION=$(unzip -p "$ABS_OUT" open-knowledge/SKILL.md | awk '/^metadata:/{found=1} found && /^  version:/{gsub(/["'\'' ]/, "", $2); print $2; exit}')

if [[ -n "$SKILL_VERSION" ]]; then
  if [[ "$SKILL_VERSION" != "$CLI_VERSION" ]]; then
    echo "ERROR: SKILL.md metadata.version ($SKILL_VERSION) != cli package.json version ($CLI_VERSION)" >&2
    exit 1
  fi
else
  echo "WARNING: SKILL.md metadata.version not set — skipping version-match check. Add metadata.version once Ship 1b lands." >&2
fi

# Compute SHA256 for the release log (observability per NFR).
SHA256=$(shasum -a 256 "$ABS_OUT" 2>/dev/null || sha256sum "$ABS_OUT")
SHA256=${SHA256%% *}

echo "Built $ABS_OUT (size: $SIZE bytes, sha256: $SHA256, cli version: $CLI_VERSION${SKILL_VERSION:+, skill version: $SKILL_VERSION})"
