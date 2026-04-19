#!/usr/bin/env bash
#
# _measure-lib.sh — shared helpers for measure-fuzz.sh + measure-stress.sh
#
# Source this from both producer scripts after `set -euo pipefail` to pick
# up the functions below. Keeps host detection, epoch-ms resolution, JSONL
# append serialization, and numeric-flag validation in one place so a
# future schema change or portability fix touches one file, not two.
#
# **This file is not directly invokable.** Source it. `bash _measure-lib.sh`
# exits 1 with a diagnostic.
#
# Convention: functions live in one place; callers set a handful of
# well-named variables (CONTEXT, SEED, etc.) before sourcing and consume
# the functions afterward. No hidden globals — every function is pure
# modulo its explicit arguments.

# Refuse to run as a standalone command — sourcing is the only supported
# invocation. Detects via BASH_SOURCE[0] (the script file) vs $0 (the
# invoking entry point); when they match, we're being run directly.
# shellcheck disable=SC2128
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "error: _measure-lib.sh is a library meant to be sourced, not executed directly." >&2
  echo "       Use measure-fuzz.sh or measure-stress.sh as the entry point." >&2
  exit 1
fi

# ── Portable epoch-ms ──────────────────────────────────────────────────────
# GNU `date +%s%3N` is preferred but macOS BSD `date` emits the literal
# string "%3N" instead of milliseconds. Detect format validity and fall
# back to seconds-times-1000 when the primary form doesn't work.
epoch_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$ms"
  else
    printf '%s000\n' "$(date +%s)"
  fi
}

# ── Host tag ───────────────────────────────────────────────────────────────
# Returns "ci-<runner>" on GitHub Actions, "local-macos" / "local-linux"
# on developer machines, or the lowercased kernel name as a fallback.
detect_host() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    printf '%s\n' "ci-${RUNNER_NAME:-${RUNNER_OS:-github}}"
  elif [[ "$(uname)" == "Darwin" ]]; then
    printf '%s\n' "local-macos"
  elif [[ "$(uname)" == "Linux" ]]; then
    printf '%s\n' "local-linux"
  else
    uname | tr '[:upper:]' '[:lower:]'
  fi
}

# ── Numeric-flag validation ────────────────────────────────────────────────
# Usage: assert_numeric_flag <flag-name> <value> [--signed]
# Exits 2 with a consistent error message on non-numeric input. Used to
# prevent STRESS_FUZZ_SEED=abc silently coercing to NaN→1 at the PRNG
# layer, producing deterministic-looking runs unrelated to the seed.
assert_numeric_flag() {
  local flag_name="$1"
  local value="$2"
  local signed="${3:-}"
  local pattern='^[0-9]+$'
  local label="a non-negative integer"
  if [[ "$signed" == "--signed" ]]; then
    pattern='^-?[0-9]+$'
    label="an integer"
  fi
  if [[ ! "$value" =~ $pattern ]]; then
    echo "error: $flag_name must be $label (got: $value)" >&2
    exit 2
  fi
}

# ── Atomic JSONL append ────────────────────────────────────────────────────
# Shell `>>` append is only atomic for payloads ≤ PIPE_BUF (4096 bytes on
# Linux) and is NOT atomic at any size on macOS. A fuzz record with many
# failing seeds + long --context can exceed 4 KB and would interleave with
# a concurrent measure:stress run appending to the same log, corrupting
# the JSONL trend record. Guard with flock on Linux; fall back to mkdir-
# based mutex on macOS (flock is not in the BSD toolchain).
#
# 10-second lock timeout — if the lock can't be acquired in that time,
# proceed without it (warn + continue) since a stuck lock would hurt more
# than the rare interleaving risk it guards against.
append_jsonl_atomic() {
  local log="$1"
  local record="$2"
  if command -v flock >/dev/null 2>&1; then
    # Acquire exclusive lock on the log file itself (fd 9). Releases on
    # subshell exit.
    (
      flock -x -w 10 9 || {
        echo "warn: could not acquire log lock; writing without lock" >&2
      }
      printf '%s\n' "$record" >> "$log"
    ) 9>> "$log"
  else
    # macOS fallback: `mkdir` is atomic on the same filesystem. Retry for
    # up to 10 seconds with 100 ms backoff, then proceed without the
    # lock (atomic-enough for ad-hoc dev use).
    local lockdir="${log}.lock"
    local i=0
    while ! mkdir "$lockdir" 2>/dev/null; do
      i=$((i + 1))
      if (( i >= 100 )); then
        echo "warn: could not acquire log lock after 10s; writing without lock" >&2
        break
      fi
      sleep 0.1
    done
    printf '%s\n' "$record" >> "$log"
    rmdir "$lockdir" 2>/dev/null || true
  fi
}

# ── jq + git pre-flight ────────────────────────────────────────────────────
# Fail loud and early if the script's hard dependencies are missing. Keeps
# the callers symmetric — neither has to reimplement the check.
require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "error: jq is required (JSONL composition)" >&2
    echo "install: brew install jq  # or equivalent" >&2
    exit 3
  fi
}

resolve_repo_root() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [[ -z "$root" ]]; then
    echo "error: not inside a git repository" >&2
    exit 4
  fi
  printf '%s\n' "$root"
}
