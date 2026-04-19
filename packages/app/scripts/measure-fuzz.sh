#!/usr/bin/env bash
#
# measure-fuzz.sh — ad-hoc sampling wrapper for bridge-convergence.fuzz.test.ts
#
# Purpose
# -------
# Sample the architectural CRDT residual rate across an arbitrary seed budget
# and append a structured JSONL record to
# specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl.
# The git history of that file IS the trend record — no CI automation exists
# to flag rate drift (accepted cost per NG6 in
# specs/2026-04-19-ci-signal-quality/SPEC.md).
#
# Usage
# -----
#   bash scripts/measure-fuzz.sh --seeds 500 --context "pre-PR-218 baseline"
#   bash scripts/measure-fuzz.sh --seed-replay 1776559905522 --context "reproduce PR #206 failing seed"
#   bun run measure:fuzz --seeds 100 --context "investigate fuzz rate shift"
#
# Flags
# -----
#   --seeds N          Total seed budget (default: 500). Maps to
#                      BRIDGE_FUZZ_SEEDS=N on the test invocation.
#   --seed-replay SEED Single-seed replay mode — invokes with
#                      STRESS_FUZZ_SEED=SEED. Overrides --seeds.
#   --context "..."    Free-text annotation for the JSONL record's context
#                      field (required — this is what lets future readers
#                      understand WHY a measurement was taken).
#
# Output
# ------
# On success:
#   - Appends one JSONL record to
#     specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
#   - Prints human-readable summary to stdout (seed count, pass/fail, rate,
#     failing seeds with replay commands).
# On test failure:
#   - Still appends JSONL record (failure is a valid measurement).
#   - Exit code matches the test runner (non-zero).
#
# JSONL schema (see specs/2026-04-16-bridge-correctness/evidence/residual-measurements-SCHEMA.md)
# ---------------------------------------------------------------------------
#   {
#     "timestamp":   "2026-04-19T14:23:15Z",   // ISO 8601 UTC at run start
#     "commit":      "abc1234",                // short git SHA
#     "script":      "deep-fuzz",              // fixed for this script
#     "seedCount":   500,
#     "seedsFailed": 23,
#     "rate":        0.046,                    // seedsFailed / seedCount
#     "invokedBy":   "nick",                   // $USER or CI identifier
#     "context":     "pre-PR-218 baseline",
#     "failingSeeds":[1776559905522],
#     "durationMs":  8912000,
#     "host":        "local-macos",
#     "bunVersion":  "1.3.11",
#     "extra":       {}                        // reserved for script-specific fields
#   }
#
# Query patterns (same as script header for discoverability via `head`)
# ---------------------------------------------------------------------
#   # 7-day rolling average rate across all runs:
#   jq -s 'sort_by(.timestamp) | map(select(.timestamp > (now - 7*86400 | todate))) | [.[].rate] | add/length' \
#     specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
#
#   # Recent spikes (>5% rate):
#   jq 'select(.rate > 0.05)' specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl
#
#   # Summary by script:
#   jq -s 'group_by(.script) | map({script: .[0].script, runs: length, avgRate: (map(.rate) | add/length)})' \
#     specs/2026-04-16-bridge-correctness/evidence/residual-measurements.jsonl

set -euo pipefail

# ── Defaults ───────────────────────────────────────────────────────────────
SEEDS=500
SEED_REPLAY=""
CONTEXT=""

# ── Arg parsing ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seeds)
      SEEDS="$2"; shift 2 ;;
    --seed-replay)
      SEED_REPLAY="$2"; shift 2 ;;
    --context)
      CONTEXT="$2"; shift 2 ;;
    -h|--help)
      # Print the full header comment block — from line 1 through the
      # first blank-comment-line sentinel `^$` after the `Query patterns`
      # heading. Using a sentinel (rather than a fixed line range) keeps
      # --help accurate when the header grows.
      sed -n '1,/^$/p' "$0"; exit 0 ;;
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

# Validate numeric inputs: non-numeric --seeds / --seed-replay would export
# a non-numeric env to the child `bun test` and silently coerce to NaN→1
# at the PRNG layer, producing deterministic-looking runs that have no
# relationship to the requested seed. Fail loud instead.
if [[ ! "$SEEDS" =~ ^[0-9]+$ ]]; then
  echo "error: --seeds must be a non-negative integer (got: $SEEDS)" >&2
  exit 2
fi
if [[ -n "$SEED_REPLAY" && ! "$SEED_REPLAY" =~ ^-?[0-9]+$ ]]; then
  echo "error: --seed-replay must be an integer (got: $SEED_REPLAY)" >&2
  exit 2
fi

# ── Environment ────────────────────────────────────────────────────────────
# Validate jq availability upfront — the JSONL composition fails silently
# otherwise.
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (JSONL composition)" >&2
  echo "install: brew install jq  # or equivalent" >&2
  exit 3
fi

# Resolve repo root. Works from any subdirectory and inside git worktrees.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "error: not inside a git repository" >&2
  exit 4
fi

APP_DIR="$REPO_ROOT/packages/app"
LOG_DIR="$REPO_ROOT/specs/2026-04-16-bridge-correctness/evidence"
LOG_FILE="$LOG_DIR/residual-measurements.jsonl"
TEST_FILE="tests/stress/bridge-convergence.fuzz.test.ts"

mkdir -p "$LOG_DIR"

# ── Compose test invocation ────────────────────────────────────────────────
if [[ -n "$SEED_REPLAY" ]]; then
  export STRESS_FUZZ_SEED="$SEED_REPLAY"
  unset BRIDGE_FUZZ_SEEDS
  EFFECTIVE_SEED_COUNT=1
  echo "[measure-fuzz] seed-replay mode: STRESS_FUZZ_SEED=$SEED_REPLAY"
else
  export BRIDGE_FUZZ_SEEDS="$SEEDS"
  unset STRESS_FUZZ_SEED
  EFFECTIVE_SEED_COUNT="$SEEDS"
  echo "[measure-fuzz] sampling mode: BRIDGE_FUZZ_SEEDS=$SEEDS"
fi

# ── Capture metadata at run start ──────────────────────────────────────────
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMMIT="$(git rev-parse --short HEAD)"
INVOKED_BY="${USER:-unknown}"
BUN_VERSION="$(bun --version 2>/dev/null || echo unknown)"

# Host tag: local-macos / local-linux / ci-<runner-label>
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
OUT_FILE="$(mktemp -t measure-fuzz-XXXXXX)"
trap 'rm -f "$OUT_FILE"' EXIT

echo "[measure-fuzz] running $TEST_FILE ..."

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

# We want the test to run but don't want its exit code to kill the script —
# we still need to compose the JSONL record on failure.
TEST_EXIT=0
(
  cd "$APP_DIR"
  bun test "$TEST_FILE" 2>&1
) | tee "$OUT_FILE" || TEST_EXIT=$?

END_MS="$(epoch_ms)"
DURATION_MS=$(( END_MS - START_MS ))

# ── Parse results ──────────────────────────────────────────────────────────
# Preferred signal: the machine-parseable RESULT line emitted by
# `bridge-convergence.fuzz.test.ts`'s after-all hook:
#   [fuzz] RESULT seeds=<n> passed=<n> failed=<n> failingSeeds=[<s1>,<s2>,...]
# Written via `process.stdout.write`, stdout-only. Parsing this decouples
# the script from bun's human-readable `N pass / N fail` format (which is
# fragile to bun output drift and stderr conflation via 2>&1). Mirrors
# `measure-stress.sh`'s RESULT-line strategy for sibling-script symmetry.
#
# Fallback (when RESULT is missing — the test crashed before the after-all
# hook could run): count all seeds as failed conservatively, since we
# cannot confirm any specific seed passed.

FUZZ_RESULT_LINE="$(grep -oE '^\[fuzz\] RESULT seeds=[0-9]+ passed=[0-9]+ failed=[0-9]+ failingSeeds=\[[0-9,]*\]' "$OUT_FILE" | tail -1 || true)"

if [[ -n "$FUZZ_RESULT_LINE" ]]; then
  # Parse the structured line via a single awk pass for robustness against
  # future field reorderings (within reason — extending the format still
  # requires updating this regex, but field-position changes don't).
  RESULT_SEEDS="$(echo "$FUZZ_RESULT_LINE" | grep -oE 'seeds=[0-9]+' | awk -F= '{print $2}')"
  RESULT_PASSED="$(echo "$FUZZ_RESULT_LINE" | grep -oE 'passed=[0-9]+' | awk -F= '{print $2}')"
  RESULT_FAILED="$(echo "$FUZZ_RESULT_LINE" | grep -oE 'failed=[0-9]+' | awk -F= '{print $2}')"
  RESULT_SEEDS_ARR="$(echo "$FUZZ_RESULT_LINE" | sed -E 's/.*failingSeeds=\[(.*)\]$/\1/')"
  SEED_COUNT="$RESULT_SEEDS"
  SEEDS_FAILED="$RESULT_FAILED"
  SEEDS_PASSED="$RESULT_PASSED"
  if [[ -z "$RESULT_SEEDS_ARR" ]]; then
    FAILING_SEEDS_JSON="[]"
  else
    FAILING_SEEDS_JSON="[$RESULT_SEEDS_ARR]"
  fi
else
  # Crash before the after-all emitted RESULT. Fall back to conservative
  # all-failed accounting. failingSeeds is best-effort from whatever seed
  # references the test file managed to print before crashing.
  SEED_COUNT="$EFFECTIVE_SEED_COUNT"
  SEEDS_FAILED="$SEED_COUNT"
  SEEDS_PASSED=0
  FAILING_SEEDS_RAW="$(grep -oE '(seed=|STRESS_FUZZ_SEED=)[0-9]+' "$OUT_FILE" \
    | awk -F= '{print $2}' | sort -u | head -100 || true)"
  if [[ -z "$FAILING_SEEDS_RAW" ]]; then
    FAILING_SEEDS_JSON="[]"
  else
    FAILING_SEEDS_JSON="$(printf '%s\n' "$FAILING_SEEDS_RAW" \
      | jq -R 'tonumber' | jq -s '.')"
  fi
fi

# rate with 4-digit precision. Use awk for portability; Bun/bash arithmetic
# doesn't do floats. Division-by-zero guard.
if [[ "$SEED_COUNT" == "0" ]]; then
  RATE="0"
else
  RATE="$(awk -v a="$SEEDS_FAILED" -v b="$SEED_COUNT" 'BEGIN{ printf "%.4f", a/b }')"
fi

# ── Compose JSONL record ───────────────────────────────────────────────────
RECORD="$(jq -c -n \
  --arg timestamp   "$TIMESTAMP" \
  --arg commit      "$COMMIT" \
  --arg script      "deep-fuzz" \
  --argjson seedCount   "$SEED_COUNT" \
  --argjson seedsFailed "$SEEDS_FAILED" \
  --argjson rate        "$RATE" \
  --arg invokedBy   "$INVOKED_BY" \
  --arg context     "$CONTEXT" \
  --argjson failingSeeds "$FAILING_SEEDS_JSON" \
  --argjson durationMs   "$DURATION_MS" \
  --arg host        "$HOST" \
  --arg bunVersion  "$BUN_VERSION" \
  --argjson extra   '{}' \
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
echo "──────── measure-fuzz summary ────────"
echo "  context:      $CONTEXT"
echo "  commit:       $COMMIT"
echo "  host:         $HOST"
echo "  seedCount:    $SEED_COUNT"
echo "  seedsFailed:  $SEEDS_FAILED"
echo "  rate:         $RATE"
echo "  durationMs:   $DURATION_MS"
echo "  logFile:      $LOG_FILE"
echo ""

if [[ "$SEEDS_FAILED" != "0" ]]; then
  # Derive replay commands from FAILING_SEEDS_JSON (authoritative) rather
  # than the raw grep output. Works whether the seeds came from the
  # RESULT line or the fallback grep path.
  FAILING_SEEDS_LIST="$(jq -r '.[]' <<< "$FAILING_SEEDS_JSON" 2>/dev/null || true)"
  if [[ -n "$FAILING_SEEDS_LIST" ]]; then
    echo "──────── failing seed replay commands ────────"
    while IFS= read -r seed; do
      [[ -z "$seed" ]] && continue
      echo "  STRESS_FUZZ_SEED=$seed bun test $TEST_FILE  # in $APP_DIR"
    done <<< "$FAILING_SEEDS_LIST"
    echo ""
  fi
fi

# Propagate test exit code so CI / users see failure signal.
exit "$TEST_EXIT"
