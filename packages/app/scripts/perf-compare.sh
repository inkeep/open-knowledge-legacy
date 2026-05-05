#!/usr/bin/env bash
#
# perf-compare.sh — diff two committed perf baseline JSONs (US-006)
#
# Purpose
# -------
# Future perf experiments diff a "post-change" baseline against the M0.5
# anchor (or any prior baseline) to mechanically answer "did this improve
# perf?". Output is an advisory markdown table — exit code reflects only
# I/O / parse errors, never regression severity (per AC 5).
#
# Usage
# -----
#   bash scripts/perf-compare.sh \
#     --from tests/perf/baselines/2026-04-23-post-v2-baseline.json \
#     --to   tests/perf/baselines/2026-05-15-content-visibility-auto.json
#
#   # Filter to a single scenario or doc
#   bun run perf:compare -- --from a.json --to b.json --scenario=cold-pool-warm
#   bun run perf:compare -- --from a.json --to b.json --doc=PROJECT
#
#   # Tighten variance threshold (default 5%)
#   bun run perf:compare -- --from a.json --to b.json --variance-threshold=0.10
#
# Output shape
# ------------
# Markdown table:
#   | Scenario | Doc | Metric | From | To | Δ (abs) | Δ (%) |
#
# Per-row tag (last column when applicable):
#   ⬆️ IMPROVED   — change beyond threshold AND in the favorable direction
#   ⬇️ REGRESSED  — change beyond threshold AND in the unfavorable direction
#   ➡️ UNCHANGED  — within ±threshold (treated as noise)
#
# Direction semantics:
#   - Metric names ending in `Ms` are latency — lower is better.
#   - All other metrics — higher is better (counts, throughput, etc.).
#   This heuristic is intentionally simple; refine in this script's
#   `direction_for_metric` function if a future metric breaks the rule.
#
# Exit codes
# ----------
#   0  success (regardless of any IMPROVED / REGRESSED rows)
#   1  malformed input (jq parse failure)
#   2  missing file or missing required argument
#   64 --help requested
#
# Dependencies: jq (must be on PATH).
#

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: perf-compare.sh --from <a.json> --to <b.json> [options]

Required:
  --from <path>              Path to "from" baseline JSON
  --to <path>                Path to "to" baseline JSON

Optional:
  --scenario <name>          Filter to one scenario (e.g. cold-pool-warm)
  --doc <KEY>                Filter to one doc (e.g. PROJECT)
  --variance-threshold <N>   Treat |Δ%| <= N as noise (default 0.05 = 5%)
  --help                     Show this message

Exit codes:
  0  ok (advisory output only)
  1  malformed JSON
  2  missing file or missing required arg
  64 --help printed

Output: markdown table on stdout.
EOF
}

# -- argument parsing -------------------------------------------------------

FROM=""
TO=""
SCENARIO=""
DOC=""
THRESHOLD="0.05"

while [ $# -gt 0 ]; do
  case "$1" in
    --from)
      FROM="${2:-}"
      shift 2
      ;;
    --from=*)
      FROM="${1#*=}"
      shift
      ;;
    --to)
      TO="${2:-}"
      shift 2
      ;;
    --to=*)
      TO="${1#*=}"
      shift
      ;;
    --scenario)
      SCENARIO="${2:-}"
      shift 2
      ;;
    --scenario=*)
      SCENARIO="${1#*=}"
      shift
      ;;
    --doc)
      DOC="${2:-}"
      shift 2
      ;;
    --doc=*)
      DOC="${1#*=}"
      shift
      ;;
    --variance-threshold)
      THRESHOLD="${2:-}"
      shift 2
      ;;
    --variance-threshold=*)
      THRESHOLD="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 64
      ;;
    *)
      echo "perf-compare: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$FROM" ] || [ -z "$TO" ]; then
  echo "perf-compare: --from and --to are required" >&2
  usage >&2
  exit 2
fi
if [ ! -f "$FROM" ]; then
  echo "perf-compare: --from file not found: $FROM" >&2
  exit 2
fi
if [ ! -f "$TO" ]; then
  echo "perf-compare: --to file not found: $TO" >&2
  exit 2
fi

# Validate JSON parse early so we can exit 1 cleanly on malformed input.
if ! jq -e . "$FROM" >/dev/null 2>&1; then
  echo "perf-compare: malformed JSON in --from: $FROM" >&2
  exit 1
fi
if ! jq -e . "$TO" >/dev/null 2>&1; then
  echo "perf-compare: malformed JSON in --to: $TO" >&2
  exit 1
fi

# -- diff computation -------------------------------------------------------
#
# We pull out tuples (scenario, doc, metric, p50_value) from each side, then
# join them in jq. The shape of a baseline is per SPEC §13.2:
#   { scenarios: { <name>: { docs: { <key>: { <metric>: { p50, p95, runs } } } } } }
#
# We compare p50 only — the canonical comparator per the same SPEC. Future
# extensions can add p95 by widening the jq projection.

# Build filter expressions to apply scenario / doc filters in jq.
SCENARIO_FILTER='select(true)'
if [ -n "$SCENARIO" ]; then
  SCENARIO_FILTER="select(.scenario == \"$SCENARIO\")"
fi
DOC_FILTER='select(true)'
if [ -n "$DOC" ]; then
  DOC_FILTER="select(.doc == \"$DOC\")"
fi

# jq pipeline: flatten to {scenario, doc, metric, p50} tuples on each side.
flatten_jq='
  .scenarios as $scenarios
  | $scenarios | to_entries[] as $sc
  | $sc.value.docs | to_entries[] as $d
  | $d.value | to_entries[] as $m
  | select($m.value.p50 != null)
  | {scenario: $sc.key, doc: $d.key, metric: $m.key, p50: $m.value.p50}
'

# Materialize both sides into JSON arrays so we can join them.
FROM_TUPLES=$(jq -c "[$flatten_jq]" "$FROM")
TO_TUPLES=$(jq -c "[$flatten_jq]" "$TO")

# Join on (scenario, doc, metric); emit one row per pair and `null` placeholders
# for rows present in only one side.
JOINED=$(
  jq -n \
    --argjson from "$FROM_TUPLES" \
    --argjson to "$TO_TUPLES" \
    --arg scenarioFilter "$SCENARIO" \
    --arg docFilter "$DOC" \
    '
    def keyOf(o): "\(o.scenario)|\(o.doc)|\(o.metric)";
    # Build {key → tuple} maps via from_entries (requires field name "value").
    ($from | map({key: keyOf(.), value: .}) | from_entries) as $fromMap
    | ($to | map({key: keyOf(.), value: .}) | from_entries) as $toMap
    | (($fromMap | keys) + ($toMap | keys) | unique) as $keys
    | $keys[]
    | ($fromMap[.] // null) as $f
    | ($toMap[.] // null) as $t
    | ($f // $t) as $any
    | { scenario: $any.scenario, doc: $any.doc, metric: $any.metric,
        from_p50: ($f.p50 // null), to_p50: ($t.p50 // null) }
    | ( if ($scenarioFilter != "") then select(.scenario == $scenarioFilter) else . end )
    | ( if ($docFilter != "") then select(.doc == $docFilter) else . end )
    '
)

# -- markdown table emission ------------------------------------------------

direction_for_metric() {
  # Returns 'lower' or 'higher' — which direction is "better".
  local metric="$1"
  case "$metric" in
    *Ms|*ms) echo "lower" ;;
    *) echo "higher" ;;
  esac
}

format_num() {
  # 1 decimal place, trailing zero stripped if integer.
  local n="$1"
  if [ "$n" = "null" ] || [ -z "$n" ]; then
    echo "(missing)"
  else
    printf "%.1f" "$n" | sed 's/\.0$//'
  fi
}

echo "| Scenario | Doc | Metric | From | To | Δ (abs) | Δ (%) | Status |"
echo "|---|---|---|---:|---:|---:|---:|---|"

while IFS= read -r row; do
  [ -z "$row" ] && continue
  scenario=$(echo "$row" | jq -r '.scenario')
  doc=$(echo "$row" | jq -r '.doc')
  metric=$(echo "$row" | jq -r '.metric')
  from_raw=$(echo "$row" | jq -r '.from_p50')
  to_raw=$(echo "$row" | jq -r '.to_p50')

  if [ "$from_raw" = "null" ] || [ "$to_raw" = "null" ]; then
    note="(missing $( [ "$from_raw" = "null" ] && echo from || echo to))"
    echo "| $scenario | $doc | $metric | $(format_num "$from_raw") | $(format_num "$to_raw") | — | — | $note |"
    continue
  fi

  # Compute deltas via awk for portability (bash arithmetic doesn't do floats).
  read -r delta_abs delta_pct <<EOF
$(awk -v f="$from_raw" -v t="$to_raw" 'BEGIN { d=t-f; if (f != 0) p=(d/f)*100; else p=0; printf "%.2f %.2f", d, p }')
EOF

  abs_pct=$(awk -v p="$delta_pct" 'BEGIN { print (p<0 ? -p : p) }')
  threshold_pct=$(awk -v t="$THRESHOLD" 'BEGIN { print t*100 }')
  is_noise=$(awk -v a="$abs_pct" -v t="$threshold_pct" 'BEGIN { print (a<=t ? "1" : "0") }')

  if [ "$is_noise" = "1" ]; then
    status="➡️ UNCHANGED"
  else
    direction=$(direction_for_metric "$metric")
    sign=$(awk -v d="$delta_abs" 'BEGIN { print (d<0 ? "neg" : "pos") }')
    if [ "$direction" = "lower" ]; then
      [ "$sign" = "neg" ] && status="⬆️ IMPROVED" || status="⬇️ REGRESSED"
    else
      [ "$sign" = "pos" ] && status="⬆️ IMPROVED" || status="⬇️ REGRESSED"
    fi
  fi

  echo "| $scenario | $doc | $metric | $(format_num "$from_raw") | $(format_num "$to_raw") | $delta_abs | ${delta_pct}% | $status |"
done < <(echo "$JOINED" | jq -c '.')
