#!/usr/bin/env bash
#
# bun-install-ci.sh — retry wrapper around `bun install --frozen-lockfile`
# for use in Open Knowledge CI workflows.
#
# WHY THIS EXISTS
#   Bun has no built-in retry for tarball-fetch / tarball-extract failures
#   (oven-sh/bun#26879 — still open as of 2026-05). A single transient
#   registry/CDN hiccup during the network phase aborts the whole install
#   with exit 1 and turns a CI job red on noise. We have seen this shape
#   recur on the OK validation job — different transitive packages, same
#   path (cache-miss → resolve OK → fail during extract), the trigger is
#   whichever tarball happens to be in flight at the upstream blip. The
#   bug class is package-agnostic; specific run IDs live in the PR that
#   landed this wrapper (search git log for `bun-install-ci`).
#
# WHAT IT DOES
#   Runs `bun install --frozen-lockfile` (or whatever is in $BUN_INSTALL_CMD)
#   up to $BUN_INSTALL_MAX_ATTEMPTS times, sleeping
#   $BUN_INSTALL_RETRY_SLEEP_BASE * 2^(n-1) seconds between attempts
#   (5s, 10s for the prod default of 3 attempts at 5s base). Emits a
#   GitHub Actions ::warning:: annotation per retry and a single ::error::
#   annotation on final exhaustion so the noise is visible in the Actions
#   UI without masking persistent failures.
#
# WHY NOT SOMETHING ELSE
#   - Wider Bun cache scope is orthogonal — it reduces frequency of cold
#     installs but does not remove the failure mode. Pair with retry, do
#     not substitute.
#   - `.bun-version` bump: oven-sh/bun#26879 is still open. When it lands,
#     remove this wrapper and the workflow call sites.
#   - Inline retry at each call site: 11 call sites in total — 5 in
#     public-open-knowledge-validation.yml, 3 in root .github/workflows/
#     (beta-cut, main-reset, mirror-sync), and 3 in OK-mirrored workflows
#     (release.yml, desktop-release.yml, desktop-build.yml). Centralizing
#     keeps the retry knobs in one place.
#
# ENV
#   BUN_INSTALL_CMD                Path to the install executable. Default:
#                                  unset, meaning the script runs
#                                  `bun install --frozen-lockfile` directly.
#                                  Tests inject a stub script here. The
#                                  wrapper does not gate this on a "test
#                                  mode" flag — fork-PR security is enforced
#                                  upstream by reviewer-approval and the
#                                  gate-job pattern, not by this script.
#   BUN_INSTALL_MAX_ATTEMPTS       Total attempts (default: 3). Must be a
#                                  positive integer. 1 means "no retry,
#                                  just run once".
#   BUN_INSTALL_RETRY_SLEEP_BASE   Base seconds between retries (default: 5).
#                                  Must be a non-negative integer. Doubled
#                                  each retry: 5s, 10s, 20s. Tests pass 0.
#
# EXIT
#   0 on success at any attempt.
#   64 on invalid input (per sysexits.h EX_USAGE).
#   Last attempt's exit code on retry exhaustion.
#
# CALL FORM (workflow YAML)
#   - run: bash scripts/bun-install-ci.sh
#
# OPEN QUESTIONS
#   - oven-sh/bun#26879 is unresolved upstream. The failure-mode shape
#     (whether ~/.bun/install/cache gets poisoned on extract failure) is
#     unknown. The wrapper does NOT clean the cache between retries — if
#     exhausted retries become common (third recurrence of the same
#     package across runs, or a pattern of "all 3 attempts fail same"),
#     either add targeted cache cleanup or escalate upstream.

set -euo pipefail

BUN_INSTALL_MAX_ATTEMPTS="${BUN_INSTALL_MAX_ATTEMPTS:-3}"
BUN_INSTALL_RETRY_SLEEP_BASE="${BUN_INSTALL_RETRY_SLEEP_BASE:-5}"
BUN_INSTALL_CMD="${BUN_INSTALL_CMD:-}"

# Input validation. Reject anything other than a positive integer for
# attempts and a non-negative integer for sleep base. The previous
# attempt-counter loop used `[ -ge ]` to detect exhaustion, which silently
# returns false on non-integer rhs and produced an unbounded retry loop
# when MAX_ATTEMPTS was misconfigured (e.g. "3.0", "3 ", "abc"). Validate
# loudly here so misconfiguration fails the CI step in milliseconds rather
# than emitting hundreds of ::warning::s until the job times out.
if ! [[ $BUN_INSTALL_MAX_ATTEMPTS =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::BUN_INSTALL_MAX_ATTEMPTS must be a positive integer, got '${BUN_INSTALL_MAX_ATTEMPTS}'" >&2
  exit 64
fi
if ! [[ $BUN_INSTALL_RETRY_SLEEP_BASE =~ ^[0-9]+$ ]]; then
  echo "::error::BUN_INSTALL_RETRY_SLEEP_BASE must be a non-negative integer, got '${BUN_INSTALL_RETRY_SLEEP_BASE}'" >&2
  exit 64
fi

# Single source of truth for the install invocation. The `if -n` guard
# keeps the default path identical to what every prior workflow used —
# only test runs swap in a stub.
run_install() {
  if [ -n "$BUN_INSTALL_CMD" ]; then
    "$BUN_INSTALL_CMD" "$@"
  else
    bun install --frozen-lockfile "$@"
  fi
}

attempt=1
while true; do
  rc=0
  run_install "$@" || rc=$?
  if [ "$rc" -eq 0 ]; then
    exit 0
  fi
  if [ "$attempt" -ge "$BUN_INSTALL_MAX_ATTEMPTS" ]; then
    noun="attempts"
    [ "$BUN_INSTALL_MAX_ATTEMPTS" = "1" ] && noun="attempt"
    echo "::error::bun install --frozen-lockfile failed after ${BUN_INSTALL_MAX_ATTEMPTS} ${noun} (last exit ${rc}). Tracker: https://github.com/oven-sh/bun/issues/26879"
    exit "$rc"
  fi
  sleep_for=$((BUN_INSTALL_RETRY_SLEEP_BASE * (1 << (attempt - 1))))
  # Annotation format mirrors .github/scripts/gh-retry.sh and the inline
  # gh-api retry in public-open-knowledge-validation.yml (`(attempt N/M)`
  # parenthetical) so operators scanning the Annotations panel see a
  # uniform shape across CI jobs.
  echo "::warning::bun install --frozen-lockfile failed (attempt ${attempt}/${BUN_INSTALL_MAX_ATTEMPTS}, exit ${rc}); retrying in ${sleep_for}s"
  sleep "$sleep_for"
  attempt=$((attempt + 1))
done
