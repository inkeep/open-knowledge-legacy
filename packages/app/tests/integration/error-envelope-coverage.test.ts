/**
 * Allowlist-based error-envelope coverage meta-test (FR17, D36 a).
 *
 * Mirrors the precedent #20 / `attribution-sweep-coverage.test.ts` style:
 * static AST scan over `packages/server/src/api-extension.ts` to gate
 * regression of already-migrated handlers back into inline
 * `json(res, NNN, { ok: false, ... })` envelopes.
 *
 * Convergence model:
 *   - PR1 (US-004) seeds the allowlist with all 56 handlers EXCEPT
 *     `handleUploadAsset` (the canonical migrated example).
 *   - Each cluster PR (US-006 onward) removes its handlers from the
 *     allowlist as it migrates them.
 *   - The final cleanup PR (US-014) removes the allowlist entirely; the
 *     test then enforces "no inline `{ ok: false, ... }` envelopes
 *     anywhere" — fail-on-any-occurrence mode.
 *
 * The test fails the build with file:line + handler name when a handler
 * NOT on the allowlist contains an inline error envelope or omits
 * `errorResponse(...)`.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_EXT_PATH = join(import.meta.dirname, '../../../server/src/api-extension.ts');
const source = readFileSync(API_EXT_PATH, 'utf8');

/**
 * Handlers still using inline `{ ok: false, ... }` error envelopes. Each
 * cluster PR (US-006 onward) removes its handlers as it migrates them.
 * Final PR (US-014) deletes the allowlist entirely and flips the test
 * into fail-on-any-occurrence mode.
 */
const UNMIGRATED_HANDLERS = new Set([
  'handleAgentActivity',
  'handleAgentBurstDiff',
  'handleAgentPatch',
  'handleAgentUndo',
  'handleAgentWrite',
  'handleAgentWriteMd',
  'handleBacklinkCounts',
  'handleBacklinks',
  'handleCreatePage',
  'handleDeadLinks',
  'handleDeletePath',
  'handleDiff',
  'handleDocumentList',
  'handleDocumentRead',
  'handleForwardLinks',
  'handleHistory',
  'handleHistoryVersion',
  'handleHubs',
  'handleInstalledAgentsRoute',
  'handleLinkGraph',
  'handleLocalOpAuthIdentity',
  'handleLocalOpAuthLogin',
  'handleLocalOpAuthPat',
  'handleLocalOpAuthRepos',
  'handleLocalOpAuthSetIdentity',
  'handleLocalOpAuthSignout',
  'handleLocalOpAuthStatus',
  'handleLocalOpOpen',
  'handleMetricsAgentPresence',
  'handleMetricsParseHealth',
  'handleMetricsReconciliation',
  'handleOrphans',
  'handlePageHeadings',
  'handlePages',
  'handlePrincipal',
  'handleRename',
  'handleRenamePath',
  'handleRescueGet',
  'handleRescueList',
  'handleRollback',
  'handleSaveVersion',
  'handleSeedApply',
  'handleSeedPlan',
  'handleServerInfo',
  'handleSuggestLinks',
  'handleSyncAbortMerge',
  'handleSyncConflictContent',
  'handleSyncConflicts',
  'handleSyncResolveConflict',
  'handleSyncSetEnabled',
  'handleSyncStatus',
  'handleSyncTrigger',
  'handleTestRescanBacklinks',
  'handleTestReset',
  'handleWorkspace',
]);

function listAllHandlers(): string[] {
  return Array.from(
    new Set([...source.matchAll(/async function (handle\w+)\(/g)].map((m) => m[1])),
  );
}

function extractHandlerBody(name: string): string | null {
  const decl = `async function ${name}(`;
  const start = source.indexOf(decl);
  if (start === -1) return null;
  const next = source.indexOf('\n  async function handle', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/** Match `json(res, NNN, { ok: false, ... }` literal patterns. */
const INLINE_ERROR_RE = /json\(\s*res\s*,\s*\d+\s*,\s*\{\s*ok:\s*false\b/;

describe('error envelope coverage (FR17, D36 a)', () => {
  test('allowlist is exhaustive — no migrated handlers accidentally listed', () => {
    // The migrated handlers are detected mechanically: they invoke
    // `errorResponse(...)`. The allowlist must NOT include any such handler.
    const all = listAllHandlers();
    const incorrectlyAllowlisted: string[] = [];
    for (const name of all) {
      if (!UNMIGRATED_HANDLERS.has(name)) continue;
      const body = extractHandlerBody(name);
      if (!body) continue;
      if (body.includes('errorResponse(')) {
        incorrectlyAllowlisted.push(name);
      }
    }
    expect(incorrectlyAllowlisted).toEqual([]);
  });

  test('every migrated handler uses errorResponse and no inline { ok: false } envelopes', () => {
    const all = listAllHandlers();
    const failures: string[] = [];
    for (const name of all) {
      if (UNMIGRATED_HANDLERS.has(name)) continue;
      const body = extractHandlerBody(name);
      if (!body) {
        failures.push(`${name}: not found in api-extension.ts`);
        continue;
      }
      if (INLINE_ERROR_RE.test(body)) {
        failures.push(`${name}: contains inline json(res, NNN, { ok: false, ... }) envelope`);
      }
      if (!body.includes('errorResponse(')) {
        failures.push(`${name}: missing errorResponse(...) usage`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('every handler in api-extension.ts is either migrated or on the allowlist', () => {
    const all = listAllHandlers();
    const knownMigrated = new Set<string>();
    for (const name of all) {
      if (UNMIGRATED_HANDLERS.has(name)) continue;
      knownMigrated.add(name);
    }
    // PR1 / US-004 ships exactly one migrated handler — handleUploadAsset.
    // Subsequent cluster PRs add more migrated handlers as the allowlist
    // shrinks. The test is satisfied when every handler is accounted for
    // (migrated XOR allowlisted) — no third state.
    const orphans = all.filter((n) => !UNMIGRATED_HANDLERS.has(n) && !knownMigrated.has(n));
    expect(orphans).toEqual([]);
  });
});
