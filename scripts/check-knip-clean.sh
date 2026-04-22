#!/usr/bin/env bash
#
# Run `bun run knip` and fail if it mutated the working tree.
#
# CI runs `bun run knip && bun run lint`. Knip's `--fix-type exports`
# auto-removes unused exports/types; when the auto-fix produces code biome
# rejects (e.g. `export { X } from 'foo'` → bare `;`, see PR #283), lint fails
# in CI. `bun run check` locally did not run knip, so developers could not
# reproduce the failure before pushing.
#
# This wrapper runs knip, compares `git diff` before/after, and exits non-zero
# if knip added new modifications. Developer WIP changes are preserved — only
# NEW mutations from knip trigger the failure. Review with `git diff` and
# either commit the cleanup or `git checkout --` to revert.

set -euo pipefail

before_diff=$(git diff)
bun run knip
after_diff=$(git diff)

if [ "$before_diff" != "$after_diff" ]; then
  echo ""
  echo "❌ knip auto-removed unused exports/types from the working tree."
  echo "   Review with:    git diff"
  echo "   Commit cleanup: git add -A && git commit"
  echo "   Revert:         git checkout -- ."
  echo ""
  exit 1
fi
