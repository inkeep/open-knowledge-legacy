import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_EXT_PATH = join(import.meta.dirname, '../../../server/src/api-extension.ts');
const source = readFileSync(API_EXT_PATH, 'utf8');
const ACTOR_HELPER_PATH = join(
  import.meta.dirname,
  '../../../server/src/extract-actor-identity.ts',
);
const actorHelperSource = readFileSync(ACTOR_HELPER_PATH, 'utf8');

/** Mutating POST handlers that must call extractAgentIdentity.
 *
 * Frontmatter writes from the property panel intentionally do NOT appear
 * here — they bypass HTTP entirely and reach `Y.Map('metadata')` through
 * `bindFrontmatterDoc.patch()` under `FORM_WRITE_ORIGIN`. Attribution
 * comes from the WebSocket connection's `ctx.principalId`, resolved by
 * `resolveWriterFromOrigin` in `persistence.ts`. The HTTP-handler scan
 * here doesn't see those writers — that's expected.
 */
const REQUIRED_HANDLERS = [
  'handleAgentWrite',
  'handleAgentWriteMd',
  'handleAgentPatch',
  'handleAgentUndo',
  'handleSaveVersion',
  'handleRollback',
  'handleCreatePage',
  'handleCreateFolder',
  'handleRenamePath',
  'handleDeletePath',
  'handleTrashCleanup',
  'handleUploadAsset',
];

const EXEMPT_HANDLERS = new Set([
  'handleDocumentRead',
  'handleDocumentList',
  'handleAsset',
  'handleBacklinks',
  'handleBacklinkCounts',
  'handleForwardLinks',
  'handleLinkGraph',
  'handleSearch',
  'handleDeadLinks',
  'handleOrphans',
  'handleHubs',
  'handleTagsList',
  'handleTagsForName',
  'handlePages',
  'handleFolderConfig',
  'handleTemplate',
  'handleSuggestLinks',
  'handlePageHeadings',
  'handleHistory',
  'handleHistoryVersion',
  'handleDiff',
  'handleMetricsReconciliation',
  'handleMetricsParseHealth',
  'handleMetricsAgentPresence',
  'handleWorkspace',
  'handleRescueList',
  'handleRescueGet',
  'handleSyncStatus',
  'handleSyncConflicts',
  'handleSyncConflictContent',
  'handleSyncTrigger',
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
  'handleServerInfo',
  'handleSeedPlan',
  'handleSeedApply',
  'handleSeedPacks',
  'handleAgentActivity',
  'handleAgentBurstDiff',
  'handleInstallSkill',
  'handleSkillInstallState',
  'handleSpawnCursorRoute',
  'handleHandoffDispatchRoute',
  'handleShareConstructUrl',
  'handleSharePublishOwners',
  'handleSharePublishNameCheck',
  'handleSharePublish',
]);

function extractHandlerBody(handlerName: string): string | null {
  const fnDecl = `async function ${handlerName}(`;
  const constDecl = `const ${handlerName} = withValidation(`;
  const fnIdx = source.indexOf(fnDecl);
  const constIdx = source.indexOf(constDecl);
  let start = -1;
  if (fnIdx !== -1) start = fnIdx;
  else if (constIdx !== -1) start = constIdx;
  if (start === -1) return null;
  const nextFn = source.indexOf('\n  async function handle', start + 1);
  const nextConst = source.indexOf('\n  const handle', start + 1);
  const nextRoutes = source.indexOf('\n  const routes:', start + 1);
  const candidates = [nextFn, nextConst, nextRoutes].filter((i) => i !== -1);
  const next = candidates.length === 0 ? -1 : Math.min(...candidates);
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
  test('all required POST handlers call an identity-threading helper', () => {
    const failures: string[] = [];
    for (const handler of REQUIRED_HANDLERS) {
      const body = extractHandlerBody(handler);
      if (body === null) {
        failures.push(`${handler}: function not found in source`);
        continue;
      }
      if (!body.includes('extractAgentIdentity(') && !body.includes('extractActorIdentity(')) {
        failures.push(`${handler}: missing extractAgentIdentity or extractActorIdentity call`);
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

  test('extract-actor-identity.ts never reads body-supplied principalId (D-A11 trust boundary)', () => {
    const code = actorHelperSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/body\s*[.[][^a-zA-Z0-9_]*['"]?principalId/.test(code)).toBe(false);
  });

  test('migrated mutating handlers extract identity before any semantic errorResponse', () => {
    const failures: string[] = [];
    for (const handler of REQUIRED_HANDLERS) {
      const body = extractHandlerBody(handler);
      if (body === null) continue;
      if (!body.includes('errorResponse(')) continue; // pre-migration; skip
      const identityIdx = Math.max(
        body.indexOf('extractAgentIdentity('),
        body.indexOf('extractActorIdentity('),
      );
      if (identityIdx === -1) continue; // already failed by the prior test

      const firstErrorIdx = body.indexOf('errorResponse(');
      if (firstErrorIdx > identityIdx) continue; // post-identity already
      const preIdentityRegion = body.slice(0, identityIdx);
      const allErrorEmitsPreIdentity = [...preIdentityRegion.matchAll(/errorResponse\(/g)].map(
        (m) => m.index ?? 0,
      );
      const bodyShapeContexts = [
        /method-not-allowed/, // top-of-handler method check
        /malformed-upload/, // body-parse failure
        /invalid-request/, // validateBody auto-emit
        /storage-/, // upload streaming pipeline failure pre-identity
      ];
      const allBodyShape = allErrorEmitsPreIdentity.every((idx) => {
        const context = body.slice(Math.max(0, idx - 100), Math.min(body.length, idx + 400));
        return bodyShapeContexts.some((re) => re.test(context));
      });
      if (!allBodyShape) {
        failures.push(
          `${handler}: pre-identity errorResponse(...) emit is not a recognized body-shape error context — semantic errors must be post-identity-extraction per precedent #24`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
