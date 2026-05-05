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

const REQUIRED_HANDLERS = [
  'handleAgentWrite',
  'handleAgentWriteMd',
  'handleAgentPatch',
  'handleAgentUndo',
  'handleSaveVersion',
  'handleRollback',
  'handleCreatePage',
  'handleRenamePath',
  'handleDeletePath',
  'handleUploadImage',
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
  'handleServerInfo',
  'handleSeedPlan',
  'handleSeedApply',
  'handleAgentActivity',
  'handleAgentBurstDiff',
  'handleInstallSkill',
  'handleSkillInstallState',
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
});
