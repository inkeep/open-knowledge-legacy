/**
 * Attribution sweep meta-test — static analysis gate.
 *
 * Asserts: (1) every mutating POST handler in api-extension.ts threads
 * identity at entry (via either `extractAgentIdentity` for agent-write
 * handlers or `extractActorIdentity` for rename + rollback); (2) no new
 * POST handler can be added to the route registry without being explicitly
 * tracked here; (3) `extract-actor-identity.ts` never reads body-supplied
 * `principalId` — server's `getPrincipal()` is the sole source (HTTP body
 * is unauthenticated; structurally enforcing the trust boundary).
 */
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
  'handleRenamePath',
  'handleDeletePath',
  // Single unified upload handler — `/api/upload` (accept-all by extension).
  // The per-MIME `handleUploadVideo` / `handleUploadAudio` shape was retired
  // when this branch superseded #310's pipeline; one handler, one identity
  // call site. Renamed handleUploadImage → handleUploadAsset (D24/US-004)
  // because the route is no longer image-specific post-FR-8 unification.
  'handleUploadAsset',
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
  // GET /api/server-info — identity-free readonly endpoint surfacing the
  // per-process serverInstanceId for CRDT restart-recovery defense.
  'handleServerInfo',
  // `ok seed` scaffolder endpoints (SPEC 2026-04-23-ok-seed-scaffold). Both
  // operate on project-level folder structure + config.yml on behalf of the
  // local user, not agent content — same rationale as sync/local-op handlers.
  'handleSeedPlan',
  'handleSeedApply',
  'handleAgentActivity',
  'handleAgentBurstDiff',
  // `/api/install-skill` — local-op style endpoint guarded by
  // `checkLocalOpSecurity`. Builds `openknowledge.skill` and hands off to
  // the OS file association (Claude Desktop). Operates on the user's
  // ~/Downloads folder on behalf of the local user, not agent content —
  // same rationale as sync/local-op/seed handlers.
  'handleInstallSkill',
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
    // Identity threading is satisfied by either `extractAgentIdentity` (used
    // by agent-write handlers) OR `extractActorIdentity` (used by rename +
    // rollback handlers; routes agent identity OR principal-fallback).
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
    // Strip comments + JSDoc so the structural check only inspects executable code.
    const code = actorHelperSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/body\s*[.[][^a-zA-Z0-9_]*['"]?principalId/.test(code)).toBe(false);
  });

  // For every mutating handler migrated to the RFC 9457 envelope, semantic
  // `errorResponse(...)` calls MUST happen AFTER identity extraction (via
  // either `extractAgentIdentity` for agent-write handlers or
  // `extractActorIdentity` for rename + rollback handlers). Body-shape
  // failures routed through `validateBody` are anonymous (semantically OK —
  // no Y.Doc mutation attempted) and are excluded from the ordering check.
  // The policy is documented in `packages/server/src/http/README.md`.
  //
  // The check is gated on the migrated handler being present and on it
  // calling `errorResponse`. Pre-migration handlers (still using inline
  // `json(res, NNN, { ok: false, ... })`) are skipped.
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

      // Find the FIRST `errorResponse(` call. If it precedes the identity
      // extraction it MUST be a body-shape error (i.e. the catch block that
      // follows readUploadBody / inside validateBody) — those emissions are
      // pre-identity by policy. Heuristic: a `validateBody(` call earlier
      // in the function is fine; a bare `errorResponse(` not wrapped by
      // `if (e instanceof UploadWriteError)` style guarding is suspicious.
      // We approximate by scanning text between `errorResponse(` and
      // identityIdx for the surrounding context.
      const firstErrorIdx = body.indexOf('errorResponse(');
      if (firstErrorIdx > identityIdx) continue; // post-identity already
      // pre-identity emit detected — verify it sits inside body-shape paths:
      // a `catch` of body parsing, or a `validateBody(` call site, or after
      // a raw method-not-allowed early-return at the top of the function.
      // These are the recognized pre-identity emission contexts.
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
        // Inspect ~500 chars of context around the emit to confirm it is a
        // body-shape error. Conservative: any of the allowlisted URN
        // tokens within the surrounding window passes.
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
