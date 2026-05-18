#!/usr/bin/env bash
#
# Run the MCP `instructions.ts` build-time generator in --check mode and fail
# if the committed `packages/server/src/mcp/instructions.ts` does not match
# what the generator would produce against the canonical SKILL.md sections.
# Mirrors `check-knip-clean.sh` / `check-notices-clean.sh` /
# `check-schema-snapshot-clean.sh` so `bun run check` catches drift before
# push.
#
# Canonical source: packages/server/assets/skills/open-knowledge/SKILL.md.
# Regenerate after editing SKILL.md:
#   bun run packages/server/scripts/generate-instructions.ts
# See `packages/server/scripts/generate-instructions.ts` for the extraction
# contract (4 H2 sections by exact-match heading text).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"
bun packages/server/scripts/generate-instructions.ts --check
