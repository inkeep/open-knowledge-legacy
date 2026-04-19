#!/usr/bin/env bash
#
# measure-stress.sh — ad-hoc sampling wrapper for server-authoritative-stress.test.ts
#
# Purpose
# -------
# Sample the architectural CRDT residual in the 5-client × 30s stress load
# scenario, with optional seed replay for triaging known-bad seeds, and append
# a structured JSONL record to
# specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl.
#
# Unlike measure-fuzz.sh (which sweeps N seeds in one run), this script is
# typically run one seed at a time — the underlying test is a 30-second
# multi-client convergence scenario, not a seeded-PBT loop. Seed replay is
# powered by the STRESS_SEED env override shipped in PR #212.
#
# Usage
# -----
#   bash scripts/measure-stress.sh --seed 42 --duration 30000 --context "pre-PR-218 baseline"
#   bash scripts/measure-stress.sh --context "investigate 2026-04 rate shift"
#   bun run measure:stress --seed 1776381158793 --context "reproduce CI flake"
#
# Flags
# -----
#   --seed N          STRESS_SEED override. Default: omitted (test uses its
#                     internal Date.now() seed, recorded in the JSONL).
#   --duration MS     Informational only — the test's internal duration is
#                     hard-coded to 30s. Recorded in extra.durationMs for
#                     future use; warning emitted if != 30000.
#   --context "..."   Free-text annotation for the JSONL record's context
#                     field (required).
#
# Output
# ------
# Same JSONL schema as measure-fuzz.sh, with these differences:
#   - script:       "deep-stress"
#   - seedCount:    1  (one run per invocation)
#   - seedsFailed:  0 on pass, 1 on fail
#   - failingSeeds: [<seed>] on failure, [] on pass
#   - extra:        { stressSeed: <seed>, durationMs: <requested> }
#
# See measure-fuzz.sh for the full schema + query pattern examples.

set -euo pipefail

# ── Defaults ───────────────────────────────────────────────────────────────
SEED=""
DURATION=30000
CONTEXT=""

# ── Arg parsing ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      SEED="$2"; shift 2 ;;
    --duration)
      DURATION="$2"; shift 2 ;;
    --context)
      CONTEXT="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,40p' "$0"; exit 0 ;;
    *)
      echo "error: unknown flag: $1" >&2
      echo "run with --help for usage" >&2
      exit 2 ;;
  esac
done

if [[ -z "$CONTEXT" ]]; then
  echo "error: --context is required (free-text annotation for JSONL record)" >&2
  echo "example: --context 'pre-PR-218 baseline'" >&2
  exit 2
fi

if [[ "$DURATION" != "30000" ]]; then
  echo "warning: --duration is informational only; the test's internal duration is 30s." >&2
  echo "         Your value ($DURATION ms) will be recorded in extra.durationMs but not enforced." >&2
fi

# ── Environment ────────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (JSONL composition)" >&2
  echo "install: brew install jq  # or equivalent" >&2
  exit 3
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "error: not inside a git repository" >&2
  exit 4
fi

APP_DIR="$REPO_ROOT/packages/app"
LOG_DIR="$REPO_ROOT/specs/2026-04-16-bridge-correctness/evidence"
LOG_FILE="$LOG_DIR/residual-measurements.jsonl"
TEST_FILE="tests/stress/server-authoritative-stress.test.ts"

mkdir -p "$LOG_DIR"

# ── Compose test invocation ────────────────────────────────────────────────
if [[ -n "$SEED" ]]; then
  export STRESS_SEED="$SEED"
  echo "[measure-stress] seed-replay mode: STRESS_SEED=$SEED"
else
  unset STRESS_SEED
  echo "[measure-stress] fresh seed (test picks via Date.now())"
fi

# ── Capture metadata at run start ──────────────────────────────────────────
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMMIT="$(git rev-parse --short HEAD)"
INVOKED_BY="${USER:-unknown}"
BUN_VERSION="$(bun --version 2>/dev/null || echo unknown)"

if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  HOST="ci-${RUNNER_NAME:-${RUNNER_OS:-github}}"
elif [[ "$(uname)" == "Darwin" ]]; then
  HOST="local-macos"
elif [[ "$(uname)" == "Linux" ]]; then
  HOST="local-linux"
else
  HOST="$(uname | tr '[:upper:]' '[:lower:]')"
fi

# ── Run test, capture output ───────────────────────────────────────────────
OUT_FILE="$(mktemp -t measure-stress-XXXXXX)"
trap 'rm -f "$OUT_FILE"' EXIT

echo "[measure-stress] running $TEST_FILE ..."

# Portable epoch-ms. GNU `date +%s%3N` is preferred but macOS BSD `date` emits
# the literal "%3N" instead of milliseconds. Detect by format-validity.
epoch_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$ms"
  else
    printf '%s000\n' "$(date +%s)"
  fi
}

START_MS="$(epoch_ms)"

TEST_EXIT=0
(
  cd "$APP_DIR"
  bun test "$TEST_FILE" 2>&1
) | tee "$OUT_FILE" || TEST_EXIT=$?

END_MS="$(epoch_ms)"
DURATION_MS=$(( END_MS - START_MS ))

# ── Parse results ──────────────────────────────────────────────────────────
# The stress test prints its active seed via
#   [server-authoritative stress] seed=<n>(...
# Capture it so the JSONL record reflects the actual seed even when the
# caller didn't supply one.
ACTUAL_SEED="$(grep -oE '\[server-authoritative stress\] seed=[0-9]+' "$OUT_FILE" \
  | awk -F= '{print $2}' | head -1 || true)"
if [[ -z "$ACTUAL_SEED" ]]; then
  ACTUAL_SEED="${SEED:-0}"
fi

SEEDS_PASSED_BUN="$(grep -E '^[[:space:]]*[0-9]+ pass' "$OUT_FILE" | tail -1 | awk '{print $1}' || echo 0)"
SEEDS_FAILED_BUN="$(grep -E '^[[:space:]]*[0-9]+ fail' "$OUT_FILE" | tail -1 | awk '{print $1}' || echo 0)"
SEEDS_PASSED_BUN="${SEEDS_PASSED_BUN:-0}"
SEEDS_FAILED_BUN="${SEEDS_FAILED_BUN:-0}"

# seedCount=1 always (one run per invocation). seedsFailed=0|1.
SEED_COUNT=1
if [[ "$TEST_EXIT" -eq 0 && "$SEEDS_FAILED_BUN" == "0" ]]; then
  SEEDS_FAILED=0
  RATE="0.0000"
  FAILING_SEEDS_JSON="[]"
else
  SEEDS_FAILED=1
  RATE="1.0000"
  FAILING_SEEDS_JSON="$(jq -c -n --argjson s "$ACTUAL_SEED" '[$s]')"
fi

# ── Compose extra (script-specific fields) ─────────────────────────────────
EXTRA_JSON="$(jq -c -n \
  --argjson stressSeed "$ACTUAL_SEED" \
  --argjson durationMs "$DURATION" \
  '{ stressSeed: $stressSeed, requestedDurationMs: $durationMs }')"

# ── Compose JSONL record ───────────────────────────────────────────────────
RECORD="$(jq -c -n \
  --arg timestamp   "$TIMESTAMP" \
  --arg commit      "$COMMIT" \
  --arg script      "deep-stress" \
  --argjson seedCount   "$SEED_COUNT" \
  --argjson seedsFailed "$SEEDS_FAILED" \
  --argjson rate        "$RATE" \
  --arg invokedBy   "$INVOKED_BY" \
  --arg context     "$CONTEXT" \
  --argjson failingSeeds "$FAILING_SEEDS_JSON" \
  --argjson durationMs   "$DURATION_MS" \
  --arg host        "$HOST" \
  --arg bunVersion  "$BUN_VERSION" \
  --argjson extra   "$EXTRA_JSON" \
  '{
     timestamp: $timestamp,
     commit: $commit,
     script: $script,
     seedCount: $seedCount,
     seedsFailed: $seedsFailed,
     rate: $rate,
     invokedBy: $invokedBy,
     context: $context,
     failingSeeds: $failingSeeds,
     durationMs: $durationMs,
     host: $host,
     bunVersion: $bunVersion,
     extra: $extra
   }')"

echo "$RECORD" >> "$LOG_FILE"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "──────── measure-stress summary ────────"
echo "  context:      $CONTEXT"
echo "  commit:       $COMMIT"
echo "  host:         $HOST"
echo "  stressSeed:   $ACTUAL_SEED"
echo "  outcome:      $([ $SEEDS_FAILED -eq 0 ] && echo PASS || echo FAIL)"
echo "  durationMs:   $DURATION_MS"
echo "  logFile:      $LOG_FILE"
echo ""

if [[ "$SEEDS_FAILED" == "1" ]]; then
  echo "──────── failure replay command ────────"
  echo "  STRESS_SEED=$ACTUAL_SEED bun test $TEST_FILE  # in $APP_DIR"
  echo ""
fi

exit "$TEST_EXIT"
