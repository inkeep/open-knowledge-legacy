/**
 * Attribution sweep meta-test (FR-5, D42) — static analysis gate.
 *
 * Asserts that every mutating POST handler in api-extension.ts calls
 * `extractAgentIdentity` and that no new POST handler can be added to the
 * route registry without being explicitly tracked here.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_EXT_PATH = join(import.meta.dirname, '../../../server/src/api-extension.ts');
const source = readFileSync(API_EXT_PATH, 'utf8');

/** Mutating POST handlers that must call extractAgentIdentity. */
const REQUIRED_HANDLERS = [
  'handleAgentWrite',
  'handleAgentWriteMd',
  'handleAgentPatch',
  'handleAgentUndo',
  'handleSaveVersion',
  'handleRollback',
  'handleCreatePage',
  'handleRename',
  'handleRenamePath',
  'handleDeletePath',
  'handleUploadImage',
];

/**
 * Handlers exempt from identity threading: GET-only endpoints, test utilities,
 * local-op handlers whose callers are not agents, and sync orchestrator
 * handlers where the HTTP boundary is control-plane only — the actual commits
 * they produce come from the SyncEngine internally and are already attributed
 * via classified writers (git-upstream, file-system, openknowledge-service).
 * See D42 corrigendum on SPEC.md §10.
 */
const EXEMPT_HANDLERS = new Set([
  'handleDocumentRead',
  'handleDocumentList',
  'handleBacklinks',
  'handleBacklinkCounts',
  'handleForwardLinks',
  'handleLinkGraph',
  'handleDeadLinks',
  'handleOrphans',
  'handleHubs',
  'handlePages',
  'handleSuggestLinks',
  'handlePageHeadings',
  'handleHistory',
  'handleHistoryVersion',
  'handleDiff',
  'handleMetricsReconciliation',
  'handleMetricsParseHealth',
  'handleMetricsAgentPresence',
  'handleUploadConfigGet',
  'handleWorkspace',
  'handleRescueList',
  'handleRescueGet',
  'handleSyncStatus',
  'handleSyncConflicts',
  'handleSyncConflictContent',
  'handleSyncTrigger',
  'handleSyncSetEnabled',
  'handleSyncAbortMerge',
  'handleSyncResolveConflict',
  'handleLocalOpClone',
  'handleLocalOpOpen',
  'handleLocalOpAuthLogin',
  'handleLocalOpAuthStatus',
  'handleLocalOpAuthRepos',
  'handleLocalOpAuthSignout',
  'handleLocalOpAuthPat',
  'handleLocalOpAuthIdentity',
  'handleLocalOpAuthSetIdentity',
  'handleTestReset',
  'handlePrincipal',
  'handleInstalledAgentsRoute',
]);

function extractHandlerBody(handlerName: string): string | null {
  const decl = `async function ${handlerName}(`;
  const start = source.indexOf(decl);
  if (start === -1) return null;
  const next = source.indexOf('\n  async function handle', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function extractStaticRouteHandlerNames(): string[] {
  const routesStart = source.indexOf('\n  const routes:');
  const enableTestRoutes = source.indexOf('\n  if (enableTestRoutes)', routesStart);
  const slice =
    routesStart === -1
      ? ''
      : source.slice(routesStart, enableTestRoutes === -1 ? source.length : enableTestRoutes);
  return [...slice.matchAll(/:\s*(handle\w+)/g)].map((m) => m[1]);
}

describe('attribution sweep coverage (FR-5, D42)', () => {
  test('all required POST handlers call extractAgentIdentity', () => {
    const failures: string[] = [];
    for (const handler of REQUIRED_HANDLERS) {
      const body = extractHandlerBody(handler);
      if (body === null) {
        failures.push(`${handler}: function not found in source`);
        continue;
      }
      if (!body.includes('extractAgentIdentity(')) {
        failures.push(`${handler}: missing extractAgentIdentity call`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('every handler in the static route registry is tracked as required or exempt', () => {
    const names = extractStaticRouteHandlerNames();
    const required = new Set(REQUIRED_HANDLERS);
    const untracked = names.filter((h) => !required.has(h) && !EXEMPT_HANDLERS.has(h));
    expect(untracked).toEqual([]);
  });
});
