#!/usr/bin/env bash
#
# Guard rail for AGENTS.md (symlinked as CLAUDE.md): every byte loads on
# every session. Anthropic's CLAUDE.md guidance and the harness's startup
# warning both name 40,000 chars as the point where instruction adherence
# noticeably degrades. We hold one threshold below that as a soft warning
# so growth gets noticed before it bites.
#
#   < 35,000 chars  → silent pass
#   35,000–39,999   → warn (commit allowed; print a reminder)
#   ≥ 40,000        → fail
#
# Prior art + per-section budget: reports/agents-md-size-reduction/REPORT.md
#
# Skip with OK_SKIP_AGENTS_MD_SIZE_CHECK=1 (intentional one-off bypass).

set -euo pipefail

if [ "${OK_SKIP_AGENTS_MD_SIZE_CHECK:-0}" = "1" ]; then
  exit 0
fi

FILE="AGENTS.md"
WARN_AT=35000
FAIL_AT=40000

if [ ! -f "$FILE" ]; then
  exit 0
fi

# Only run if AGENTS.md is part of the working-tree change set.
# `git diff --cached --name-only` lists what's about to be committed.
if ! git diff --cached --name-only -- "$FILE" | grep -q .; then
  # AGENTS.md not staged — but we still spot-check the file size in case
  # someone is committing alongside an upstream merge that bloated it.
  size=$(wc -c < "$FILE" | tr -d ' ')
  if [ "$size" -ge "$FAIL_AT" ]; then
    echo ""
    echo "❌ $FILE is ${size} chars (≥ ${FAIL_AT} hard cap) even though it is"
    echo "   not in this commit. Trim it before continuing — this file loads"
    echo "   on every agent session and degrades instruction adherence."
    echo "   Background: reports/agents-md-size-reduction/REPORT.md"
    echo ""
    exit 1
  fi
  exit 0
fi

size=$(wc -c < "$FILE" | tr -d ' ')

if [ "$size" -ge "$FAIL_AT" ]; then
  echo ""
  echo "❌ $FILE is ${size} chars — over the ${FAIL_AT} hard cap."
  echo "   Trim before committing. Anthropic and the harness both warn that"
  echo "   bloated CLAUDE.md degrades instruction adherence."
  echo "   Patterns + canonical homes: reports/agents-md-size-reduction/REPORT.md"
  echo "   Bypass once: OK_SKIP_AGENTS_MD_SIZE_CHECK=1 git commit ..."
  echo ""
  exit 1
elif [ "$size" -ge "$WARN_AT" ]; then
  echo ""
  echo "⚠️  $FILE is ${size} chars — past the ${WARN_AT} soft warning."
  echo "   Hard cap is ${FAIL_AT}. Consider compressing a section or moving"
  echo "   tutorial-style content out — see reports/agents-md-size-reduction/."
  echo ""
fi

exit 0
