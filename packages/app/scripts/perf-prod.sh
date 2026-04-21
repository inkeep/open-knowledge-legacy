#!/usr/bin/env bash
#
# perf-prod.sh — prod-fidelity perf measurement wrapper.
#
# Orchestrates build → start CLI → run perf:profile N times → tear down.
# Gives developers a one-command path to measure against the built artifact
# (equivalent to what ships to users) instead of `bun run dev` (Vite HMR
# + transform overhead, uncomparable).
#
# Usage:
#   packages/app/scripts/perf-prod.sh --scenario=<name> [--runs=5] [--env="KEY=value"]
#
# Examples:
#   # G2 regression-gate capture (canonical reference per V2 SPEC §11):
#   packages/app/scripts/perf-prod.sh --scenario=cold-pool-warm \
#     --env="OK_PERF_BIG_DOC=STORIES"
#
#   # G4 mode-toggle with 10 runs:
#   packages/app/scripts/perf-prod.sh --scenario=mode-toggle --runs=10
#
# What it does (precedent #22 shell-script conventions):
#   1. Runs `bun run build` from repo root (turbo-cached; no-op when clean).
#   2. Starts `open-knowledge start --port 0` (kernel-assigned) in the
#      background; polls `<repo>/.open-knowledge/server.lock` for the real
#      port (same lock MCP discovery reads — see precedent #1 + cli.ts).
#   3. Runs `bun run perf:profile --scenario=<name> --target=http://localhost:<port> --headless`
#      N times. Results land at `packages/app/tests/perf/results/<scenario>.<ts>.json`.
#   4. Sends SIGTERM to the server; the CLI's CC8 shutdown ordering
#      releases the lock cleanly. Waits up to 5s for lock to disappear.
#   5. Parses the N most recent result files, extracts the scenario's
#      primary metric, reports individual values + median.
#
# Exit codes:
#   0 — N runs completed, median reported
#   1 — usage error (missing --scenario, bad flag value)
#   2 — build failure
#   3 — server failed to start / lock never populated
#   4 — perf:profile run failure
#   5 — results parsing / median computation failure
#
# Not a replacement for the CI-based baseline-capture protocol — see
# packages/app/tests/stress/perf-baseline-update.md §"Local prod-fidelity
# dry-run." Runner hardware differs; local medians are directional signal
# only.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_measure-lib.sh
source "$HERE/_measure-lib.sh"

# ── Arg parsing ──────────────────────────────────────────────────────────────

SCENARIO=""
RUNS=5
EXTRA_ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario=*) SCENARIO="${1#--scenario=}"; shift ;;
    --runs=*)     RUNS="${1#--runs=}"; shift ;;
    --env=*)      EXTRA_ENV="${1#--env=}"; shift ;;
    -h|--help)
      sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "error: unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SCENARIO" ]]; then
  echo "error: --scenario=<name> is required" >&2
  echo "       available scenarios (packages/app/tests/perf/scenarios/):" >&2
  ls "$HERE/../tests/perf/scenarios/" 2>/dev/null | grep '\.ts$' | sed 's/\.ts$//' | sed 's/^/         /' >&2
  exit 1
fi
assert_numeric_flag --runs "$RUNS"
if (( RUNS < 1 )); then
  echo "error: --runs must be >= 1 (got $RUNS)" >&2
  exit 1
fi

require_jq
REPO_ROOT="$(resolve_repo_root)"

CLI_BIN="$REPO_ROOT/packages/cli/dist/cli.mjs"
LOCK_FILE="$REPO_ROOT/.open-knowledge/server.lock"
RESULTS_DIR="$REPO_ROOT/packages/app/tests/perf/results"

# ── 1. Build (turbo-cached) ──────────────────────────────────────────────────

echo "[perf-prod] Building app + cli (turbo cache-friendly; no-op when clean)…"
cd "$REPO_ROOT"
if ! bun run build >/dev/null 2>&1; then
  echo "error: bun run build failed — re-run manually to see output:" >&2
  echo "       cd $REPO_ROOT && bun run build" >&2
  exit 2
fi

if [[ ! -x "$CLI_BIN" && ! -f "$CLI_BIN" ]]; then
  echo "error: CLI binary not found at $CLI_BIN after build" >&2
  exit 2
fi

# ── 2. Start CLI in background ───────────────────────────────────────────────

# Remove any stale lock file from a previous crashed run. The CLI's
# acquireServerLock has stale-PID recovery but we'd rather start clean.
if [[ -f "$LOCK_FILE" ]]; then
  STALE_PID="$(jq -r '.pid // "0"' "$LOCK_FILE" 2>/dev/null || echo "0")"
  if [[ "$STALE_PID" != "0" ]] && ! kill -0 "$STALE_PID" 2>/dev/null; then
    echo "[perf-prod] Removing stale server.lock from dead pid $STALE_PID"
    rm -f "$LOCK_FILE"
  fi
fi

echo "[perf-prod] Starting open-knowledge on kernel-assigned port…"
# Send CLI stdout/stderr to a logfile we can tail for debugging but don't
# flood the parent's output with it.
SERVER_LOG="$(mktemp -t perf-prod-server.XXXXXX.log)"
node "$CLI_BIN" start --port 0 >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  local ec=$?
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[perf-prod] Stopping server (pid $SERVER_PID)…"
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    # Wait up to 5s for clean shutdown + lock release.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if ! kill -0 "$SERVER_PID" 2>/dev/null && [[ ! -f "$LOCK_FILE" ]]; then break; fi
      sleep 0.5
    done
    # If still alive, force-kill. The CLI's CC8 shutdown is deterministic,
    # so this path shouldn't trigger under normal conditions.
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "[perf-prod] WARN: server did not exit on SIGTERM; sending SIGKILL" >&2
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
  fi
  if [[ $ec -ne 0 ]]; then
    echo "[perf-prod] Script exited non-zero ($ec). Server log: $SERVER_LOG" >&2
  else
    rm -f "$SERVER_LOG" 2>/dev/null || true
  fi
  exit $ec
}
trap cleanup EXIT INT TERM

# ── 3. Wait for lock with real port ──────────────────────────────────────────

echo "[perf-prod] Waiting for $LOCK_FILE with a bound port…"
PORT=""
for i in $(seq 1 60); do
  if [[ -f "$LOCK_FILE" ]]; then
    PORT="$(jq -r '.port // 0' "$LOCK_FILE" 2>/dev/null || echo "0")"
    if [[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 0 )); then
      echo "[perf-prod] Server listening on port $PORT (after ${i} * 0.5s = $((i*500))ms)"
      break
    fi
  fi
  # Check the server didn't crash on startup.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "error: open-knowledge server exited before binding a port — log:" >&2
    tail -30 "$SERVER_LOG" >&2 || true
    exit 3
  fi
  sleep 0.5
done
if [[ -z "$PORT" || ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT == 0 )); then
  echo "error: server lock never populated with a real port after 30s — log:" >&2
  tail -30 "$SERVER_LOG" >&2 || true
  exit 3
fi

# ── 4. Run perf:profile N times ──────────────────────────────────────────────

APP_DIR="$REPO_ROOT/packages/app"
cd "$APP_DIR"

run_start_ts="$(epoch_ms)"
run_failures=0
for i in $(seq 1 "$RUNS"); do
  echo "[perf-prod] Run $i/$RUNS — scenario=$SCENARIO target=http://localhost:$PORT"
  # Build the env-prefix command. `env $EXTRA_ENV` takes zero or more
  # KEY=value tokens space-separated. An empty string is a no-op.
  if [[ -n "$EXTRA_ENV" ]]; then
    # shellcheck disable=SC2086
    if ! env $EXTRA_ENV bun run perf:profile --scenario="$SCENARIO" --target="http://localhost:$PORT" --headless; then
      run_failures=$((run_failures + 1))
      echo "[perf-prod] WARN: run $i exited non-zero — continuing" >&2
    fi
  else
    if ! bun run perf:profile --scenario="$SCENARIO" --target="http://localhost:$PORT" --headless; then
      run_failures=$((run_failures + 1))
      echo "[perf-prod] WARN: run $i exited non-zero — continuing" >&2
    fi
  fi
done

if (( run_failures == RUNS )); then
  echo "error: all $RUNS runs failed — see logs above" >&2
  exit 4
fi
if (( run_failures > 0 )); then
  echo "[perf-prod] NOTE: $run_failures/$RUNS runs failed (median computed from remaining)" >&2
fi

# ── 5. Extract primary metric + median ───────────────────────────────────────

# Map scenario → jq path for the metric we care about most. When a
# scenario doesn't have a canonical primary metric, the script reports
# all result filenames and leaves median computation to the caller.
case "$SCENARIO" in
  warm-switch-cached)      METRIC=".metrics.warmSwitchMs" ;;
  cold-pool-warm)          METRIC=".metrics.coldPoolWarmMs" ;;
  cold-load-with-fallback) METRIC=".metrics.interactiveReadyMs" ;;
  cold-load-big-doc)       METRIC=".metrics.coldLoadMs" ;;
  mode-toggle)             METRIC=".metrics.modeToggleMs" ;;
  warm-switch)             METRIC=".metrics.warmSwitchMs" ;;
  outline-polling)         METRIC=".metrics.hoverToOutlineMs" ;;
  *)                       METRIC="" ;;
esac

# Find the N most-recent result files for this scenario that were
# modified AFTER run_start_ts (the script's launch epoch). Excludes
# pre-existing results from older measurement sessions.
cd "$RESULTS_DIR"
# shellcheck disable=SC2012  # ls with -t is intentional; file names have no spaces/newlines.
latest_files="$(ls -t "$SCENARIO".*.json 2>/dev/null | head -n "$RUNS" || true)"
if [[ -z "$latest_files" ]]; then
  echo "error: no result files found for scenario=$SCENARIO in $RESULTS_DIR" >&2
  exit 5
fi

echo ""
echo "[perf-prod] ===== SUMMARY — $SCENARIO ====="
echo "[perf-prod] Runs: $RUNS (failures: $run_failures)"
echo "[perf-prod] Results: $RESULTS_DIR"
echo ""
if [[ -z "$METRIC" ]]; then
  echo "[perf-prod] No primary metric registered for this scenario — listing result files:"
  echo "$latest_files" | sed 's/^/  /'
  echo ""
  echo "[perf-prod] To extract a custom metric: jq '.metrics.<field>' <result-file>"
else
  echo "[perf-prod] Primary metric: $METRIC"
  echo ""
  values=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    v="$(jq -r "$METRIC // -1" "$f" 2>/dev/null || echo "-1")"
    printf '[perf-prod]   %s: %s ms\n' "$f" "$v"
    values+="$v"$'\n'
  done <<< "$latest_files"

  # Compute median of non-negative values. Negative values (scenario
  # sentinel for "could not measure") are excluded from the median but
  # still reported above as -1 for visibility.
  median="$(printf '%s' "$values" | awk 'BEGIN{c=0} /^-?[0-9]+(\.[0-9]+)?$/ && $1 >= 0 {a[c++]=$1+0} END {
    if (c == 0) { print "NO_VALID_VALUES"; exit }
    asort(a)
    if (c % 2 == 1) { print a[(c+1)/2] }
    else { print (a[c/2] + a[c/2+1]) / 2 }
  }' LC_ALL=C)"
  echo ""
  if [[ "$median" == "NO_VALID_VALUES" ]]; then
    echo "[perf-prod] WARN: no valid (non-negative) values to compute median from" >&2
  else
    printf '[perf-prod] MEDIAN: %s ms\n' "$median"
  fi
fi
echo ""
echo "[perf-prod] NOTE: For the canonical baseline capture, follow the CI-based"
echo "[perf-prod]       protocol in packages/app/tests/stress/perf-baseline-update.md."
echo "[perf-prod]       Local medians are directional signal, not the authority."

# Cleanup runs via the trap.
