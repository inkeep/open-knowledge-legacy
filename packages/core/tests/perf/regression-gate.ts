/**
 * R4 perf regression gate (SPEC §6).
 *
 * Compares a fresh benchmark run against a committed baseline and fails the
 * gate if any tracked block-count regresses beyond the configured threshold.
 *
 * THRESHOLD FORMULA (pinned, per SPEC §6 R4 and Q4):
 *   allowed_regression_ms = max(2 × p99_stdev_ms, 10% × baseline_p99_ms)
 *   fresh_p99_ms - baseline_p99_ms > allowed_regression_ms ⇒ REGRESSION
 *
 * The 10% floor dominates on low-variance runners (fast hardware, quiet
 * CI); the 2σ term dominates on noisy runners. Variance is measured at
 * calibration time across N runs and baked into `baseline.json`.
 *
 * "Variance" in the spec text is the common-parlance sense — standard
 * deviation (σ), not statistical variance (σ²). Using σ keeps units in
 * milliseconds across the whole formula. See `evidence/r4-calibration.md`
 * for the N=? calibration measurement.
 *
 * The module is dual-use: library functions for the synthetic-regression
 * unit test, plus a thin CLI entry (`import.meta.main`) for the tier-2
 * turbo task to invoke against a real results file.
 *
 * GATE LOCATION. This file runs in tier-2 CI only (see `turbo.json`
 * `test:perf:regression` task). The synthetic-regression unit tests next
 * to it (`regression-gate.test.ts`) are fast and pure — they CAN run in
 * tier-1 if wired, but we keep them out of `bun test src/` to honor the
 * existing tier-1 budget under `bun run check`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ───────────────────────── Types ──────────────────────────────────────────

/** Single-op latency stats as emitted by the bench harness. */
export interface OpStats {
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/** Per-block-count entry in a fresh benchmark run. */
export interface FreshBlockResult {
  blockCount: number;
  docSizeChars: number;
  parseMs: OpStats;
  serializeMs: OpStats;
  roundTripMs: OpStats;
}

export interface FreshResults {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  methodology: {
    warmupIters: number;
    measuredIters: number;
    gcBetweenRuns: boolean;
  };
  runner: Record<string, unknown>;
  results: FreshBlockResult[];
}

/**
 * Per-block-count baseline entry. Each tracked op carries a p99 target
 * AND a p99 stdev measured across the calibration runs. Stdev is the
 * variance term in the threshold formula.
 */
export interface BaselineBlockEntry {
  blockCount: number;
  docSizeChars: number;
  parseMs: { p99: number; p99StdevMs: number };
  serializeMs: { p99: number; p99StdevMs: number };
  roundTripMs: { p99: number; p99StdevMs: number };
}

export interface Baseline {
  schemaVersion: 1;
  /** ISO timestamp at which the baseline was captured. */
  capturedAt: string;
  /** Human-readable class the calibration runs landed on ("local-m-series", "gh-ubuntu-latest", etc.). */
  runnerClass: string;
  /** Number of independent benchmark runs aggregated into this baseline. */
  calibrationRuns: number;
  /** Threshold knobs pinned by SPEC §6 R4. */
  threshold: {
    floorPct: number; // e.g. 0.10 — 10%
    varianceMultiplier: number; // e.g. 2 — 2σ
  };
  results: BaselineBlockEntry[];
}

export type OpName = 'parseMs' | 'serializeMs' | 'roundTripMs';

export interface OpRegressionRow {
  blockCount: number;
  op: OpName;
  baselineP99: number;
  freshP99: number;
  deltaMs: number;
  allowedDeltaMs: number;
  regression: boolean;
}

export interface RegressionReport {
  pass: boolean;
  rows: OpRegressionRow[];
  missingFresh: number[]; // block counts present in baseline but missing in fresh
  extraFresh: number[]; // block counts present in fresh but not tracked in baseline
}

// ───────────────────────── Core comparison ────────────────────────────────

const OP_NAMES: OpName[] = ['parseMs', 'serializeMs', 'roundTripMs'];

/**
 * Compare a fresh run against the baseline.
 *
 * Semantics:
 *   - Every baseline block-count must be present in the fresh results;
 *     missing ones are treated as a failure (listed in `missingFresh`).
 *   - Extra block counts in the fresh run are reported (`extraFresh`)
 *     but not a failure — the baseline is authoritative about what is
 *     tracked.
 *   - For each (blockCount, op) pair, regression is evaluated per the
 *     THRESHOLD FORMULA at the top of this file.
 */
export function evaluateRegression(baseline: Baseline, fresh: FreshResults): RegressionReport {
  const freshByCount = new Map<number, FreshBlockResult>();
  for (const r of fresh.results) freshByCount.set(r.blockCount, r);

  const rows: OpRegressionRow[] = [];
  const missingFresh: number[] = [];

  for (const b of baseline.results) {
    const f = freshByCount.get(b.blockCount);
    if (!f) {
      missingFresh.push(b.blockCount);
      continue;
    }
    for (const op of OP_NAMES) {
      const baselineP99 = b[op].p99;
      const stdev = b[op].p99StdevMs;
      const freshP99 = f[op].p99;
      const deltaMs = freshP99 - baselineP99;
      const varianceTerm = baseline.threshold.varianceMultiplier * stdev;
      const floorTerm = baseline.threshold.floorPct * baselineP99;
      const allowedDeltaMs = Math.max(varianceTerm, floorTerm);
      rows.push({
        blockCount: b.blockCount,
        op,
        baselineP99,
        freshP99,
        deltaMs,
        allowedDeltaMs,
        regression: deltaMs > allowedDeltaMs,
      });
    }
  }

  const extraFresh: number[] = [];
  const baselineCounts = new Set(baseline.results.map((b) => b.blockCount));
  for (const r of fresh.results)
    if (!baselineCounts.has(r.blockCount)) extraFresh.push(r.blockCount);

  const pass = missingFresh.length === 0 && rows.every((r) => !r.regression);
  return { pass, rows, missingFresh, extraFresh };
}

// ───────────────────────── Formatting ─────────────────────────────────────

export function formatReport(report: RegressionReport): string {
  const lines: string[] = [];
  lines.push(`perf regression gate: ${report.pass ? 'PASS' : 'FAIL'}`);
  if (report.missingFresh.length > 0) {
    lines.push(`  missing block counts in fresh run: ${report.missingFresh.join(', ')}`);
  }
  if (report.extraFresh.length > 0) {
    lines.push(`  extra block counts in fresh run (not tracked): ${report.extraFresh.join(', ')}`);
  }
  for (const row of report.rows) {
    const marker = row.regression ? '✗' : '✓';
    const deltaSign = row.deltaMs >= 0 ? '+' : '';
    lines.push(
      `  ${marker} ${String(row.blockCount).padStart(5)} ${row.op.padEnd(12)}` +
        ` baseline=${row.baselineP99.toFixed(2)}ms` +
        ` fresh=${row.freshP99.toFixed(2)}ms` +
        ` Δ=${deltaSign}${row.deltaMs.toFixed(2)}ms` +
        ` allowed=${row.allowedDeltaMs.toFixed(2)}ms`,
    );
  }
  return lines.join('\n');
}

// ───────────────────────── IO helpers ─────────────────────────────────────

export function loadBaseline(path: string): Baseline {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.schemaVersion !== 1) {
    throw new Error(`baseline.json schemaVersion must be 1 (got ${raw.schemaVersion})`);
  }
  return raw as Baseline;
}

export function loadFreshResults(path: string): FreshResults {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.schemaVersion !== 1) {
    throw new Error(`results.json schemaVersion must be 1 (got ${raw.schemaVersion})`);
  }
  return raw as FreshResults;
}

// ───────────────────────── CLI ────────────────────────────────────────────

/**
 * CLI entry. Usage:
 *   bun run packages/core/tests/perf/regression-gate.ts <baseline> <fresh>
 *
 * Exits 0 on PASS, 1 on FAIL. Prints a human-readable report to stdout.
 */
async function main(): Promise<void> {
  const [, , baselineArg, freshArg] = process.argv;
  if (!baselineArg || !freshArg) {
    console.error('usage: regression-gate.ts <baseline.json> <fresh-results.json>');
    process.exit(2);
  }
  const baseline = loadBaseline(resolve(baselineArg));
  const fresh = loadFreshResults(resolve(freshArg));
  const report = evaluateRegression(baseline, fresh);
  console.log(formatReport(report));
  process.exit(report.pass ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
