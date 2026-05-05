import {
  type BridgeInvariantSite,
  type BridgeInvariantViolation,
  BridgeInvariantViolationError,
  type BridgeToleranceClass,
  detectAppliedToleranceClasses,
  normalizeBridge,
} from '@inkeep/open-knowledge-core';
import {
  incrementBridgeInvariantViolations,
  incrementBridgeInvariantViolationsSuppressed,
  incrementBridgeToleranceApplied,
} from './metrics.ts';

const DEFAULT_DEBOUNCE_S = 60;

const lastEmitMs = new Map<string, number>();

const MAX_VIOLATION_RATE_TUPLES = 1024;

const lastToleranceEmitMs = new Map<string, number>();

function toleranceRateKey(site: BridgeInvariantSite, cls: BridgeToleranceClass): string {
  return `${site}::${cls}`;
}

function readDebounceMs(): number {
  const raw = process.env.OK_BRIDGE_VIOLATION_DEBOUNCE_S;
  if (raw === undefined) return DEFAULT_DEBOUNCE_S * 1000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DEBOUNCE_S * 1000;
  return parsed * 1000;
}

function rateKey(site: BridgeInvariantSite, docName: string | undefined): string {
  return `${site}::${docName ?? '__nodoc__'}`;
}

export function shouldEmitBridgeInvariantViolation(
  site: BridgeInvariantSite,
  docName: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  const key = rateKey(site, docName);
  const last = lastEmitMs.get(key);
  const debounceMs = readDebounceMs();
  if (last !== undefined && nowMs - last < debounceMs) return false;
  if (lastEmitMs.size >= MAX_VIOLATION_RATE_TUPLES) {
    for (const [k, lastMs] of lastEmitMs) {
      if (nowMs - lastMs >= debounceMs) lastEmitMs.delete(k);
    }
  }
  lastEmitMs.set(key, nowMs);
  return true;
}

export function shouldEmitBridgeToleranceApplied(
  site: BridgeInvariantSite,
  toleranceClass: BridgeToleranceClass,
  nowMs: number = Date.now(),
): boolean {
  const key = toleranceRateKey(site, toleranceClass);
  const last = lastToleranceEmitMs.get(key);
  const debounceMs = readDebounceMs();
  if (last !== undefined && nowMs - last < debounceMs) return false;
  lastToleranceEmitMs.set(key, nowMs);
  return true;
}

export function __resetBridgeWatchdogForTests(): void {
  lastEmitMs.clear();
  lastToleranceEmitMs.clear();
}

export function __getViolationRateTupleCountForTests(): number {
  return lastEmitMs.size;
}

export function shouldThrowOnBridgeInvariantViolation(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'test' || env.OK_BRIDGE_THROW_ON_VIOLATION === '1';
}

interface AssertBridgeInvariantOpts {
  site: BridgeInvariantSite;
  docName?: string;
  origin?: unknown;
  nowMs?: number;
  suppressDevThrow?: boolean;
}

export function assertBridgeInvariant(
  ytextSnapshot: string,
  fragmentMdSnapshot: string,
  opts: AssertBridgeInvariantOpts,
): boolean {
  const ytextNorm = normalizeBridge(ytextSnapshot);
  const fragNorm = normalizeBridge(fragmentMdSnapshot);
  if (ytextNorm === fragNorm) {
    if (ytextSnapshot !== fragmentMdSnapshot) {
      const classes = detectAppliedToleranceClasses(ytextSnapshot, fragmentMdSnapshot);
      for (const cls of classes) {
        if (shouldEmitBridgeToleranceApplied(opts.site, cls, opts.nowMs)) {
          incrementBridgeToleranceApplied(cls);
          console.warn(
            JSON.stringify({
              event: 'bridge-tolerance-applied',
              site: opts.site,
              class: cls,
            }),
          );
        }
      }
    }
    return true;
  }

  const violation: BridgeInvariantViolation = {
    site: opts.site,
    origin: opts.origin,
    docName: opts.docName,
    ytextSnapshot,
    fragmentMdSnapshot,
    unifiedDiff: `  ytext: ${ytextNorm.slice(0, 300)}\n  frag:  ${fragNorm.slice(0, 300)}`,
    stack: new Error().stack,
  };

  if (shouldThrowOnBridgeInvariantViolation() && !opts.suppressDevThrow) {
    throw new BridgeInvariantViolationError(violation);
  }

  const shouldEmit = shouldEmitBridgeInvariantViolation(opts.site, opts.docName, opts.nowMs);
  if (!shouldEmit) {
    incrementBridgeInvariantViolationsSuppressed();
    return false;
  }
  incrementBridgeInvariantViolations();
  console.warn(
    JSON.stringify({
      event: 'bridge-invariant-violation',
      site: opts.site,
      'doc.name': opts.docName ?? null,
      'tolerance-class-attempted': 'untracked',
      'normalize-equal-modulo-tolerance': false,
      ytextLen: ytextSnapshot.length,
      fragmentLen: fragmentMdSnapshot.length,
      diff: violation.unifiedDiff,
      timestamp: new Date().toISOString(),
    }),
  );
  return false;
}
