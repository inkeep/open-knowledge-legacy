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
#   bash scripts/measure-stress.sh --seed 42 --context "pre-PR-218 baseline"
#   bash scripts/measure-stress.sh --context "investigate 2026-04 rate shift"
#   bun run measure:stress --seed 1776381158793 --context "reproduce CI flake"
#
# Flags
# -----
#   --seed N          STRESS_SEED override. Default: omitted (test uses its
#                     internal Date.now() seed, recorded in the JSONL).
#   --context "..."   Free-text annotation for the JSONL record's context
#                     field (required).
#
# The underlying test's run duration is hard-coded to 30s internally. There is
# no run-time override flag for duration — the script enforces no knob that
# the test does not honor, per feedback-driven principle "no config that lies."
# If a future test parameterizes duration, add a flag here that sets the
# corresponding env var.
#
# Output
# ------
# Same JSONL schema as measure-fuzz.sh, with these differences:
#   - script:       "deep-stress"
#   - seedCount:    1  (one run per invocation)
#   - seedsFailed:  0 on pass, 1 on fail-or-crash
#   - outcome:      "pass" | "fail" | "crash" (inside extra)
#   - failingSeeds: [<seed>] on a real test failure where the seed banner
#                   was captured; [] on pass OR on crash before banner
#                   (to avoid poisoning the log with a phantom seed 0)
#   - extra:        { stressSeed: <seed-or-null>, outcome: "pass"|"fail"|"crash" }
#
# See measure-fuzz.sh for the full schema + query pattern examples.

set -euo pipefail

# ── Defaults ───────────────────────────────────────────────────────────────
SEED=""
CONTEXT=""

# ── Arg parsing ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      SEED="$2"; shift 2 ;;
    --context)
      CONTEXT="$2"; shift 2 ;;
    -h|--help)
      # Print the full header comment block up to the first blank-comment-
      # line sentinel `^$`. Sentinel-based extraction so --help stays
      # accurate as the header grows.
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

# Validate --seed is numeric. Non-numeric values exported as STRESS_SEED
# would coerce to NaN→1 at the test's Number() call, producing a
# deterministic-looking run unrelated to the operator's request.
if [[ -n "$SEED" && ! "$SEED" =~ ^-?[0-9]+$ ]]; then
  echo "error: --seed must be an integer (got: $SEED)" >&2
  exit 2
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
# Two stable signals the stress test emits:
#
#   (1) Startup banner — printed BEFORE any setup work in the test body:
#         [server-authoritative stress] seed=<n>
#         [server-authoritative stress] seed=<n> (replay)
#       Emitted even on pre-loop crash. Primary source for stressSeed.
#
#   (2) Machine-parseable result line — printed AFTER all assertions pass:
#         [stress] RESULT outcome=pass seed=<n> edits=<n> convergenceMs=<n>
#       Written via `process.stdout.write`, stdout-only (never stderr), so
#       the grep below is unambiguous and insensitive to bun output drift.
#
# Parsing the test's own structured lines — not bun test's human summary —
# decouples the script from bun's output format (Minor #3 fix).

ACTUAL_SEED_BANNER="$(grep -oE '\[server-authoritative stress\] seed=[0-9]+' "$OUT_FILE" \
  | awk -F= '{print $2}' | head -1 || true)"
if [[ -n "$ACTUAL_SEED_BANNER" ]]; then
  ACTUAL_SEED="$ACTUAL_SEED_BANNER"
elif [[ -n "$SEED" ]]; then
  ACTUAL_SEED="$SEED"
else
  ACTUAL_SEED=""
fi

# Machine-parseable result line — only emitted on a successful run (after
# all assertions pass). Absence = test failed or crashed before reaching
# the summary.
HAS_RESULT_PASS="$(grep -cE '^\[stress\] RESULT outcome=pass' "$OUT_FILE" || true)"
HAS_RESULT_PASS="${HAS_RESULT_PASS:-0}"

# Classify outcome:
#   "pass"  — test exit 0 AND the RESULT line printed
#   "fail"  — test exit != 0 AND the seed banner printed (real test
#             failure with a known seed for replay)
#   "crash" — test exit != 0 AND the seed banner did NOT print (setup
#             failure, OOM, or pre-banner assertion — seed is unknown,
#             no replay command should suggest a specific value)
#
# Note: on a successful run, exit code alone is not sufficient — a bun
# test that ran but reported an assertion failure still has exit != 0.
# The RESULT line is the authoritative pass marker.
SEED_COUNT=1
if [[ "$TEST_EXIT" -eq 0 && "$HAS_RESULT_PASS" -ge 1 ]]; then
  OUTCOME="pass"
  SEEDS_FAILED=0
  RATE="0.0000"
  FAILING_SEEDS_JSON="[]"
elif [[ -n "$ACTUAL_SEED_BANNER" ]]; then
  OUTCOME="fail"
  SEEDS_FAILED=1
  RATE="1.0000"
  FAILING_SEEDS_JSON="$(jq -c -n --argjson s "$ACTUAL_SEED" '[$s]')"
else
  OUTCOME="crash"
  SEEDS_FAILED=1
  RATE="1.0000"
  # Crash before banner — no known seed to attribute the failure to. Emit
  # an empty failingSeeds array so grep'ing the log for real seed failures
  # stays sharp; `outcome: "crash"` is the triage filter.
  FAILING_SEEDS_JSON="[]"
fi

# ── Compose extra (script-specific fields) ─────────────────────────────────
# stressSeed is JSON null when unknown (crash before banner, no --seed given).
# Consumers query `.extra.stressSeed != null` to filter to records with a
# replayable seed.
if [[ -z "$ACTUAL_SEED" ]]; then
  EXTRA_JSON="$(jq -c -n --arg outcome "$OUTCOME" \
    '{ stressSeed: null, outcome: $outcome }')"
else
  EXTRA_JSON="$(jq -c -n --argjson stressSeed "$ACTUAL_SEED" --arg outcome "$OUTCOME" \
    '{ stressSeed: $stressSeed, outcome: $outcome }')"
fi

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
echo "  stressSeed:   ${ACTUAL_SEED:-<unknown — crash before banner>}"
echo "  outcome:      $OUTCOME"
echo "  durationMs:   $DURATION_MS"
echo "  logFile:      $LOG_FILE"
echo ""

if [[ "$OUTCOME" == "fail" ]]; then
  echo "──────── failure replay command ────────"
  echo "  STRESS_SEED=$ACTUAL_SEED bun test $TEST_FILE  # in $APP_DIR"
  echo ""
elif [[ "$OUTCOME" == "crash" ]]; then
  echo "──────── crash diagnostic ────────"
  echo "  The test crashed before printing its seed banner. Seed is unknown."
  echo "  Rerun with an explicit seed to reproduce deterministically:"
  echo "    bun run measure:stress --seed <n> --context 're-investigating crash'"
  echo ""
fi

exit "$TEST_EXIT"
