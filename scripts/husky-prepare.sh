#!/usr/bin/env bash
#
# Conditional husky setup for Open Knowledge.
#
# Why this exists:
#   When OK is checked out as its own clone (inkeep/open-knowledge), `.git`
#   is at the OK root and husky correctly writes core.hooksPath to that
#   .git/config. Hooks fire from `<OK>/.husky/`. That's the design.
#
#   When OK lives inside the agents-private monorepo, OK has no own `.git`
#   — the actual `.git` is at the parent root. Husky walks up and finds the
#   parent's `.git`, then writes a core.hooksPath that points back at
#   `<parent>/public/open-knowledge/.husky/` — clobbering whatever the
#   parent had configured. After that, every `git push` from anywhere in
#   agents-private fires OK's standalone-clone hook
#   (`bun run format && bun run lint && bun run check`) instead of the
#   parent's intended `pnpm check:monorepo-traps && pnpm check:pre-push`.
#   Developers then either install node_modules in every subtree or skip
#   hooks with `--no-verify` (forbidden by the repo's Git Safety Protocol).
#
#   This guard skips husky entirely in the monorepo case so the parent's
#   own `.husky/` stays in charge of git hooks.
#
# Discriminator:
#   In a standalone clone, `<OK>/.git` exists — either a directory (regular
#   clone) or a file pointing to a real gitdir (a `git worktree add` of the
#   standalone clone). In the monorepo, `<OK>/.git` does not exist at all.
#   `[ -e .git ]` is true in both standalone shapes and false in the
#   monorepo case.
#
# Tested by: scripts/check-husky-prepare-guard.sh

set -euo pipefail

if [ ! -e .git ]; then
  # OK is checked out as a subdirectory of an enclosing repo (the
  # agents-private monorepo). Don't touch the parent's git config.
  exit 0
fi

bunx husky
chmod +x .husky/pre-commit .husky/pre-push 2>/dev/null || true
