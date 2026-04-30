/**
 * Error-envelope coverage meta-test (FR17, D36 a) — fail-on-any-occurrence mode.
 *
 * Mirrors the precedent #20 / `attribution-sweep-coverage.test.ts` style:
 * static AST scan over `packages/server/src/api-extension.ts` enforcing that
 * every handler emits errors via `errorResponse(...)` and never via an inline
 * `json(res, NNN, { ok: false, ... })` envelope, and that no handler emits an
 * inline `json(res, NNN, { ok: true, ... })` success wrapper either (D22 drops
 * the `ok: true` wrapper from success bodies).
 *
 * Allowlist history (now retired):
 *   - PR1 (US-004) seeded an allowlist with 56 handlers (every handler except
 *     `handleUploadAsset`, the canonical migrated example).
 *   - Each cluster PR (US-006 through US-013) removed its handlers from the
 *     allowlist as it migrated them.
 *   - US-014 (this revision) removes the allowlist entirely; the test is now
 *     "no inline error envelopes anywhere" — fail-on-any-occurrence.
 *
 * Failure mode: file:line + handler name + the offending pattern.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_EXT_PATH = join(import.meta.dirname, '../../../server/src/api-extension.ts');
const source = readFileSync(API_EXT_PATH, 'utf8');

function listAllHandlers(): string[] {
  // Handlers in `api-extension.ts` come in two shapes: legacy
  // `async function handleX(...)` and `const handleX = withValidation(Schema,
  // ...)`. The structural meta-test treats both as valid handler shapes.
  return Array.from(
    new Set([
      ...[...source.matchAll(/async function (handle\w+)\(/g)].map((m) => m[1]),
      ...[...source.matchAll(/const (handle\w+) = withValidation\(/g)].map((m) => m[1]),
    ]),
  );
}

function extractHandlerBody(name: string): string | null {
  const fnDecl = `async function ${name}(`;
  const constDecl = `const ${name} = withValidation(`;
  const fnIdx = source.indexOf(fnDecl);
  const constIdx = source.indexOf(constDecl);
  let start = -1;
  if (fnIdx !== -1) start = fnIdx;
  else if (constIdx !== -1) start = constIdx;
  if (start === -1) return null;
  const nextFn = source.indexOf('\n  async function handle', start + 1);
  const nextConst = source.indexOf('\n  const handle', start + 1);
  // The last handler in the file has no successor — bound at the route table
  // declaration `\n  const routes:` so we don't accidentally fold the
  // onRequest extension (which itself uses `errorResponse(...)` for the
  // /api/* Origin gate, post-US-011) into the prior handler's slice.
  const nextRoutes = source.indexOf('\n  const routes:', start + 1);
  const candidates = [nextFn, nextConst, nextRoutes].filter((i) => i !== -1);
  const next = candidates.length === 0 ? -1 : Math.min(...candidates);
  return source.slice(start, next === -1 ? source.length : next);
}

const INLINE_ERROR_RE = /json\(\s*res\s*,\s*\d+\s*,\s*\{\s*ok:\s*false\b/;
const INLINE_SUCCESS_WRAPPER_RE = /json\(\s*res\s*,\s*\d+\s*,\s*\{\s*ok:\s*true\b/;

describe('error envelope coverage (FR17, D36 a) — fail-on-any-occurrence', () => {
  test('every handler uses errorResponse and emits no inline { ok: false } envelopes', () => {
    const all = listAllHandlers();
    const failures: string[] = [];
    for (const name of all) {
      const body = extractHandlerBody(name);
      if (!body) {
        failures.push(`${name}: not found in api-extension.ts`);
        continue;
      }
      if (INLINE_ERROR_RE.test(body)) {
        failures.push(`${name}: contains inline json(res, NNN, { ok: false, ... }) envelope`);
      }
      if (INLINE_SUCCESS_WRAPPER_RE.test(body)) {
        failures.push(`${name}: contains inline json(res, NNN, { ok: true, ... }) success wrapper`);
      }
      if (!body.includes('errorResponse(')) {
        failures.push(`${name}: missing errorResponse(...) usage`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('zero inline { ok: false } envelopes anywhere in api-extension.ts', () => {
    // Whole-file sweep: catches inline literals outside per-handler bodies
    // (helper functions, the onRequest extension, route-table fallthroughs).
    // The per-handler scan above bounds at the `\n  const routes:` declaration
    // and would miss anything below; this assertion is the structural
    // backstop.
    const matches = [...source.matchAll(/json\(\s*res\s*,\s*\d+\s*,\s*\{\s*ok:\s*false\b/g)];
    if (matches.length > 0) {
      const locations = matches.map((m) => {
        const lineNumber = source.slice(0, m.index ?? 0).split('\n').length;
        return `api-extension.ts:${lineNumber}`;
      });
      expect(locations).toEqual([]);
    }
    expect(matches.length).toBe(0);
  });

  test('zero inline { ok: true } success wrappers anywhere in api-extension.ts', () => {
    // D22 drops the `ok: true` wrapper from success bodies. Same whole-file
    // sweep as above: fail-on-any-occurrence.
    const matches = [...source.matchAll(/json\(\s*res\s*,\s*\d+\s*,\s*\{\s*ok:\s*true\b/g)];
    if (matches.length > 0) {
      const locations = matches.map((m) => {
        const lineNumber = source.slice(0, m.index ?? 0).split('\n').length;
        return `api-extension.ts:${lineNumber}`;
      });
      expect(locations).toEqual([]);
    }
    expect(matches.length).toBe(0);
  });
});
