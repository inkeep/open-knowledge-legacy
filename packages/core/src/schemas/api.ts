/**
 * Canonical Zod schemas for HTTP API response shapes served by
 * `packages/server/src/api-extension.ts`.
 *
 * Schemas live in `packages/core` (browser-safe) so both the server
 * route handlers and client consumers (`DocumentContext`,
 * `test-harness`) import the same shape — single source of truth,
 * no cross-process drift, no Node deps leaking into the browser
 * bundle.
 *
 * Convention per `/eng:type-safety`: `.loose()` preserves unknown
 * fields for forward-compat; inferred types via `z.infer`. Every
 * exported schema satisfies `StandardSchemaV1<...>` so non-Zod
 * consumers (form libraries, validators) can interop without binding
 * to Zod directly. Zod v4 schemas natively expose `~standard`.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

/**
 * Response shape for `GET /api/server-info`.
 *
 * The per-process `serverInstanceId` is a UUID generated at server start;
 * the client's `ProviderPool` caches it and uses it in
 * `expectedServerInstanceId` claims on every WebSocket reconnect.
 * Mismatch triggers the client-side restart-recovery recycle path (see
 * `provider-pool.ts:handleServerInstanceMismatch`).
 *
 * `currentBranch` is the late-join backstop for the CC1 `branch-switched`
 * stateless broadcast. Stateless frames have no replay, so a client
 * briefly offline during a branch switch silently re-syncs against the
 * new branch with stale-branch IDB. The boot fetch and every reconnect
 * fetch compare against the last-observed branch; a change triggers
 * `handleBranchSwitched` exactly as the live broadcast would. Optional
 * for backwards-compat with non-git deployments where branch is
 * meaningless.
 *
 * `currentDiskAckSVs` is the late-join backstop for the CC1 `disk-ack`
 * stateless broadcasts. Same gap as `branch-switched` (no replay), with
 * a stronger correctness consequence: a stale `lastDiskAckedSV` would
 * cause the mismatch-recycle baseline-selection to over-include
 * durably-persisted bytes in the buffer, re-replaying them onto the
 * post-restart server's markdown-rebuilt Y.Doc and producing
 * duplication. The map is keyed by `documentName`; values are
 * base64-encoded `Uint8Array` state vectors (same wire shape as
 * `CC1DiskAckPayload.sv`). Clients refresh their per-entry
 * `lastDiskAckedSV` on every `__system__` reconnect via this fetch.
 * Empty `{}` is valid (cold server with no flushed docs).
 */
export const ServerInfoResponseSchema = z
  .object({
    serverInstanceId: z.string().min(1),
    currentBranch: z.string().min(1).optional(),
    currentDiskAckSVs: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .loose();
export type ServerInfoResponse = z.infer<typeof ServerInfoResponseSchema>;
// Compile-time assertion: Zod v4 native `~standard` is a `StandardSchemaV1`.
// The cast is a structural identity check — Zod v4 schemas conform to
// StandardSchemaV1 at runtime, but TypeScript doesn't accept the structural
// match without help because the input type is unknown by default.
const _ServerInfoResponseSchemaIsStandard: StandardSchemaV1<unknown, ServerInfoResponse> =
  ServerInfoResponseSchema;
void _ServerInfoResponseSchemaIsStandard;

/**
 * Response shape for `GET /api/principal`.
 *
 * The Zod schema is the single source of truth for the wire shape; the
 * `Principal` type alias re-exported from `../types/principal.ts` is
 * `z.infer<typeof PrincipalResponseSchema>`. Schema-first eliminates the
 * "two parallel declarations + cast at trust boundary" failure class.
 *
 * `display_name` is `.min(1)` so an empty git-config user.name
 * (template-rendered configs, mis-quoted setup scripts) routes through the
 * `safeParse` failure path to the random-identity fallback rather than
 * rendering an empty initial / blank tooltip / blank cursor label downstream.
 * `display_email` has no length constraint because it is never rendered in
 * awareness — it is used only server-side (shadow-repo authoring,
 * Co-Authored-By). Rejecting an otherwise-valid principal because its email
 * is absent would discard a usable `display_name` and `id` unnecessarily.
 *
 * `.loose()` preserves unknown fields for forward-compat — new server
 * fields don't break older clients. Parse failures fall back silently to
 * the random-identity fallback; presence remains functional.
 *
 * Note: this schema uses a bare object shape (no `ok: true` discriminator),
 * matching the post-D22 RFC 9457 wire shape — `handleServerInfo` /
 * `handleWorkspace` / `handlePrincipal` all emit flat `{...data}` objects
 * with `Content-Type: application/json` (no `ok: true` wrapper); errors
 * emit `application/problem+json` per `ProblemDetailsSchema`.
 */
export const PrincipalResponseSchema = z
  .object({
    id: z.string().min(1),
    display_name: z.string().min(1),
    display_email: z.string(),
    source: z.enum(['git-config', 'synthesized']),
    created_at: z.string().min(1),
  })
  .loose();
export type PrincipalResponse = z.infer<typeof PrincipalResponseSchema>;
const _PrincipalResponseSchemaIsStandard: StandardSchemaV1<unknown, PrincipalResponse> =
  PrincipalResponseSchema;
void _PrincipalResponseSchemaIsStandard;

// ---------------------------------------------------------------------------
// RFC 9457 Problem Details (D22, D38)
// ---------------------------------------------------------------------------
//
// Errors emitted from `api-extension.ts` use RFC 9457 Problem Details on the
// wire. The server's `errorResponse` helper constructs a `ProblemDetails`
// object, validates it through `ProblemDetailsSchema.parse()`, and emits with
// `Content-Type: application/problem+json`.
//
// `type` tokens are URN form `urn:ok:error:<kebab>` per D38 (RFC 9457 §3.1.1
// recommends absolute URIs and warns that path-only relative URIs depend on
// base-URI resolution). URNs are routing-independent so the meaning won't
// shift under reverse-proxy / path-prefix.
//
// The schema is closed by policy (NG1) — adding a new token is a single
// edit here in lockstep with the handler PR that emits it. Future opening
// triggers (MCP `upload_asset` ships, public SDK ships) get a new spec.

/**
 * RFC 9457 `type` URN tokens. Closed by policy.
 *
 * Naming convention: `urn:ok:error:<kebab-action-or-condition>`.
 * Adding a new token = single edit here + the handler PR that emits it.
 */
export const ProblemTypeSchema = z.enum([
  // Upload-side (covers all 5 UploadWriteReason variants 1:1)
  'urn:ok:error:malformed-upload',
  'urn:ok:error:collision-exhaustion',
  'urn:ok:error:storage-full',
  'urn:ok:error:storage-readonly',
  'urn:ok:error:storage-error',
  'urn:ok:error:no-file-received',
  'urn:ok:error:parent-doc-name-required',
  'urn:ok:error:path-escape',
  // Cross-handler shared
  'urn:ok:error:method-not-allowed',
  'urn:ok:error:invalid-request',
  'urn:ok:error:internal-server-error',
  // /api/local-op/* security gate (shared by all local-op endpoints)
  'urn:ok:error:loopback-required',
  'urn:ok:error:invalid-origin',
  // /api/local-op/clone (US-005)
  'urn:ok:error:url-not-allowed',
  'urn:ok:error:dir-outside-home',
  'urn:ok:error:concurrent-operation',
  'urn:ok:error:clone-failed',
  'urn:ok:error:clone-timeout',
  'urn:ok:error:server-start-failed',
  // Cluster A: agent-write / -write-md / -patch / -undo.
  // `reserved-docname` rejects writes to system / config doc names (post-
  // identity, attributed). `target-not-found` / `stale-target` /
  // `frontmatter-edit-not-supported` are handleAgentPatch-specific.
  // `no-active-session` is handleAgentUndo-specific.
  'urn:ok:error:reserved-docname',
  'urn:ok:error:target-not-found',
  'urn:ok:error:stale-target',
  'urn:ok:error:frontmatter-edit-not-supported',
  'urn:ok:error:no-active-session',
  // Cluster B: pages CRUD (US-007). `doc-not-found` covers rename / rollback
  // / delete / rename-path "doesn't exist" cases; `doc-already-exists` covers
  // create-page collision and rename-into-existing destinations.
  // `document-not-open` distinguishes rollback's open-in-editor requirement
  // from the absent-on-disk case. `rollback-not-configured` flags the
  // shadow-repo-unavailable startup state separately from internal-error.
  'urn:ok:error:doc-not-found',
  'urn:ok:error:doc-already-exists',
  'urn:ok:error:document-not-open',
  'urn:ok:error:rollback-not-configured',
  // Cluster C: document/links read part 1 (US-008). `document-not-available`
  // distinguishes hocuspocus-document-load failure from `doc-not-found`
  // (former is server-internal, latter is "doesn't exist on disk").
  // `backlink-index-not-configured` flags the (rare) startup state where
  // the backlink index hasn't initialized yet — distinct from internal
  // errors during read.
  'urn:ok:error:document-not-available',
  'urn:ok:error:backlink-index-not-configured',
  // Cluster D: orphans / hubs / dead-links / suggest-links (US-009).
  // No new tokens — reuses cluster-C `backlink-index-not-configured`,
  // cluster-B `doc-not-found` (suggest-links target missing), shared
  // `invalid-request` (orphan-mode / docName validation) and `internal-server-error`.
  // Cluster E: save-version / history / history/<sha> / diff / workspace /
  // rescue-list / rescue-get / server-info / principal (US-010).
  // `shadow-not-configured` covers the startup-state where the shadow repo
  // (history surface) is unavailable; `host-not-allowed` covers the
  // /api/workspace + /api/principal + /api/metrics/agent-presence DNS-rebinding
  // gate; `principal-not-available` is the 404 case when local git-config
  // identity is absent. `not-found` is the rescue-buffer fallback.
  'urn:ok:error:shadow-not-configured',
  'urn:ok:error:host-not-allowed',
  'urn:ok:error:principal-not-available',
  'urn:ok:error:not-found',
  // Cluster G: LocalOp + auth handlers (US-012).
  // `auth-failed` is the catch-all for non-zero subprocess exits across
  // login / repos / pat / status / signout. `no-project-dir` flags the
  // service-unavailable case where the server has no projectDir configured
  // (handleLocalOpAuthIdentity / handleLocalOpAuthSetIdentity). `server-open-failed`
  // covers the local-op/open spawn-or-poll timeout (504). `concurrent-operation`,
  // `loopback-required`, `invalid-origin`, `method-not-allowed`, `invalid-request`,
  // `internal-server-error` are reused.
  'urn:ok:error:auth-failed',
  'urn:ok:error:no-project-dir',
  'urn:ok:error:server-open-failed',
  // Cluster H: sync + seed handlers (US-013). `sync-not-active` flags the
  // service-unavailable state when the sync engine isn't constructed yet
  // (no remote, or sync subsystem disabled). `project-repo-not-configured`
  // flags handleSyncConflictContent's projectDir guard. `seed-prerequisite-missing`
  // covers SeedPrerequisiteError (e.g. project root not git-init'd);
  // `seed-invalid-root` covers SeedRootDirError (rootDir contains '..' or
  // absolute path). All other error paths reuse shared `invalid-request`,
  // `method-not-allowed`, `internal-server-error`, plus cluster-G's
  // `loopback-required` / `invalid-origin` from the shared local-op gate.
  'urn:ok:error:sync-not-active',
  'urn:ok:error:project-repo-not-configured',
  'urn:ok:error:seed-prerequisite-missing',
  'urn:ok:error:seed-invalid-root',
]);
export type ProblemType = z.infer<typeof ProblemTypeSchema>;
const _ProblemTypeSchemaIsStandard: StandardSchemaV1<unknown, ProblemType> = ProblemTypeSchema;
void _ProblemTypeSchemaIsStandard;

/**
 * Per-DU exhaustiveness helper for `ProblemType` (and any subset thereof —
 * `UploadWriteReason` etc.). Mirrors `assertNeverLinkTarget` /
 * `assertNeverDiskEvent`. Using it as `default: assertNeverProblemType(target)`
 * forces a compile error at every consumer site when a new URN token is added
 * to `ProblemTypeSchema` and the switch hasn't grown a matching case.
 */
export function assertNeverProblemType(value: never): never {
  throw new Error(`Unexpected ProblemType variant: ${JSON.stringify(value)}`);
}

/**
 * RFC 9457 Problem Details body shape.
 *
 * Wire shape: `{ type, title, status, instance?, detail? }` with
 * `Content-Type: application/problem+json`. Top-level fields per RFC 9457 §3:
 * - `type` (REQUIRED, URN per D38) — typed problem identifier
 * - `title` (REQUIRED per D14) — short human-readable summary
 * - `status` (REQUIRED) — must equal HTTP response status (D22)
 * - `instance` (OPTIONAL) — UUID per error emit (D13); same value mirrored
 *   in Pino structured log line for grep correlation
 * - `detail` (OPTIONAL) — longer human-readable explanation
 *
 * `.loose()` preserves unknown extension fields per RFC 9457 §3.2.
 */
export const ProblemDetailsSchema = z
  .object({
    type: ProblemTypeSchema,
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    instance: z.string().uuid().optional(),
    detail: z.string().optional(),
  })
  .loose();
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
const _ProblemDetailsSchemaIsStandard: StandardSchemaV1<unknown, ProblemDetails> =
  ProblemDetailsSchema;
void _ProblemDetailsSchemaIsStandard;

// ---------------------------------------------------------------------------
// Per-handler request + success schemas
// ---------------------------------------------------------------------------
//
// Per-handler schemas live alongside the canonical envelope so consumers
// only need a single import path. Success schemas drop the `{ ok: true }`
// wrapper — clients use HTTP-status discrimination (`if (!res.ok)`) per D22.
// Request schemas feed the `withValidation()` middleware wrapper (D34 / FR12)
// so handlers receive an already-typed body and can never be added without
// going through the wrapper.

/**
 * Multipart-form metadata fields validated by `withValidation` for
 * `POST /api/upload`. The binary payload itself is parsed by busboy upstream;
 * Zod validates only the fields that flow through normal parsing.
 *
 * `parentDocName` is required so the server can resolve the asset's
 * destination directory. `agentId` and `agentName` are optional; missing
 * identity routes the upload through the default-agent fallback.
 */
export const UploadRequestSchema = z
  .object({
    parentDocName: z.string().min(1),
    agentId: z.string().min(1).optional(),
    agentName: z.string().min(1).optional(),
  })
  .loose();
export type UploadRequest = z.infer<typeof UploadRequestSchema>;
const _UploadRequestSchemaIsStandard: StandardSchemaV1<unknown, UploadRequest> =
  UploadRequestSchema;
void _UploadRequestSchemaIsStandard;

/**
 * Success response for `POST /api/upload` — flat `{ ...data }` shape with
 * `Content-Type: application/json` (no `ok: true` wrapper per D22).
 *
 * `src` is the on-disk basename the server linked to. `path` is the
 * contentDir-relative path the client emits in the markdown ref — clients
 * MUST prefer `path` over `src` so non-default `attachmentFolderPath`
 * configurations (Obsidian-style `attachments/`, bare-name, parent-relative)
 * round-trip correctly. `deduped` is true when the upload hit the same-dir
 * sha256 cache (no new bytes written).
 */
export const UploadAssetSuccessSchema = z
  .object({
    src: z.string().min(1),
    path: z.string().min(1).optional(),
    deduped: z.boolean().optional(),
  })
  .loose();
export type UploadAssetSuccess = z.infer<typeof UploadAssetSuccessSchema>;
const _UploadAssetSuccessSchemaIsStandard: StandardSchemaV1<unknown, UploadAssetSuccess> =
  UploadAssetSuccessSchema;
void _UploadAssetSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/local-op/clone`.
 *
 * `url` is the git remote URL (https/ssh/git/SCP-style); the server's
 * `isAllowedGitUrl` check enforces the protocol allowlist after schema
 * validation. `dir` is the local destination directory; `isSafeLocalPath`
 * confines it to the user's home directory. Both fields are non-empty
 * strings; protocol/path-safety failures emit `urn:ok:error:url-not-allowed`
 * / `urn:ok:error:dir-outside-home` post-validation.
 */
export const LocalOpCloneRequestSchema = z
  .object({
    url: z.string().min(1),
    dir: z.string().min(1),
  })
  .loose();
export type LocalOpCloneRequest = z.infer<typeof LocalOpCloneRequestSchema>;
const _LocalOpCloneRequestSchemaIsStandard: StandardSchemaV1<unknown, LocalOpCloneRequest> =
  LocalOpCloneRequestSchema;
void _LocalOpCloneRequestSchemaIsStandard;

/**
 * Mid-stream error event emitted on NDJSON streaming endpoints (D36 c).
 *
 * The streaming protocol's `type` field discriminates event kinds
 * (`progress` | `complete` | `error`) — preserved as the wire-level
 * discriminator. Typed RFC 9457 `ProblemDetails` lives nested under
 * `problem`, so the streaming `type: 'error'` and the URN `problem.type`
 * never collide. Pre-stream errors continue to use `errorResponse(...)` +
 * `application/problem+json` content-type per D22.
 *
 * See `handleLocalOpClone` for the canonical streaming-endpoint pattern.
 */
export const StreamingProblemEventSchema = z
  .object({
    type: z.literal('error'),
    problem: ProblemDetailsSchema,
  })
  .loose();
export type StreamingProblemEvent = z.infer<typeof StreamingProblemEventSchema>;
const _StreamingProblemEventSchemaIsStandard: StandardSchemaV1<unknown, StreamingProblemEvent> =
  StreamingProblemEventSchema;
void _StreamingProblemEventSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster A: agent-write / -write-md / -patch / -undo (US-006)
// ---------------------------------------------------------------------------
//
// Mutating handlers that write to Y.Docs through the agent attribution path
// (precedent #24). `withValidation()` enforces these schemas at the wire
// boundary; the handler receives an already-typed body. Body-shape failures
// (schema rejection) emit `urn:ok:error:invalid-request` PRE-identity —
// semantically OK because no Y.Doc mutation is attempted. Semantic failures
// (reserved docname, target-not-found, stale-target, no-active-session) emit
// POST-identity. The `attribution-sweep-coverage.test.ts` ordering check
// enforces this distinction.

/**
 * `docName` shape shared by every mutating handler. The refinement matches
 * `isSafeDocName` in `api-extension.ts`: rejects path traversal and null
 * bytes. Empty strings pass schema (the handler falls back to the legacy
 * `'test-doc'` development default).
 */
const safeDocNameField = z
  .string()
  .refine(
    (s) => !s.includes('..') && !s.startsWith('/') && !s.includes('\x00') && !s.includes('\\'),
    { message: 'docName contains unsafe path characters' },
  )
  .optional();

/**
 * Identity fields shared by every mutating handler. All optional —
 * `extractAgentIdentity` in `api-extension.ts` carries the default-agent
 * fallback for missing fields. The schema only validates the wire-level
 * type (string when present); semantic validation (e.g. agent-id regex)
 * stays inside `extractAgentIdentity`.
 */
const agentIdentityFields = {
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  colorSeed: z.string().optional(),
  clientName: z.string().optional(),
  clientVersion: z.string().optional(),
  label: z.string().optional(),
};

/**
 * Optional summary field shared by write / write-md / patch handlers.
 * Schema-rejected for non-string values (number, boolean, null, array,
 * object) — `urn:ok:error:invalid-request` pre-identity. Empty / whitespace
 * strings reach the handler and `normalizeSummary` classifies them as
 * `kind: 'absent'` (no adoption count).
 */
const summaryField = z.string().optional();

/**
 * Request body for `POST /api/agent-write`. Free-text content append (the
 * server appends a deterministic test string when `content` is omitted).
 */
export const AgentWriteRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    content: z.string().optional(),
    ...agentIdentityFields,
  })
  .loose();
export type AgentWriteRequest = z.infer<typeof AgentWriteRequestSchema>;
const _AgentWriteRequestSchemaIsStandard: StandardSchemaV1<unknown, AgentWriteRequest> =
  AgentWriteRequestSchema;
void _AgentWriteRequestSchemaIsStandard;

/**
 * Request body for `POST /api/agent-write-md`. The canonical agent-write
 * surface. `markdown` is REQUIRED (non-empty) so the schema rejects empty
 * payloads structurally. `position` is the enum the handler routes on;
 * stricter than the historical "any non-prepend/replace silently maps to
 * append" behavior.
 */
export const AgentWriteMdRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    markdown: z.string().min(1),
    position: z.enum(['append', 'prepend', 'replace']).optional(),
    ...agentIdentityFields,
  })
  .loose();
export type AgentWriteMdRequest = z.infer<typeof AgentWriteMdRequestSchema>;
const _AgentWriteMdRequestSchemaIsStandard: StandardSchemaV1<unknown, AgentWriteMdRequest> =
  AgentWriteMdRequestSchema;
void _AgentWriteMdRequestSchemaIsStandard;

/**
 * Request body for `POST /api/agent-patch`. `find` REQUIRED non-empty (the
 * search target). `replace` REQUIRED string (may be empty — that deletes
 * the matched segment). `offset`, when provided, must be a non-negative
 * integer; the handler treats it as the exact starting index for the
 * find/replace and emits `urn:ok:error:stale-target` if the substring at
 * that offset no longer matches.
 */
export const AgentPatchRequestSchema = z
  .object({
    docName: safeDocNameField,
    summary: summaryField,
    find: z.string().min(1),
    replace: z.string(),
    offset: z.number().int().nonnegative().optional(),
    ...agentIdentityFields,
  })
  .loose();
export type AgentPatchRequest = z.infer<typeof AgentPatchRequestSchema>;
const _AgentPatchRequestSchemaIsStandard: StandardSchemaV1<unknown, AgentPatchRequest> =
  AgentPatchRequestSchema;
void _AgentPatchRequestSchemaIsStandard;

/**
 * Request body for `POST /api/agent-undo`. `connectionId` REQUIRED — names
 * the per-session UndoManager whose stack to drain. `scope` defaults to
 * `'last'`; `'file'` is a legacy alias for `'session'` (drains the entire
 * stack in one call) — the handler collapses `'file'` to `'session'` in
 * the response.
 */
export const AgentUndoRequestSchema = z
  .object({
    docName: safeDocNameField,
    connectionId: z.string().min(1),
    scope: z.enum(['last', 'session', 'file']).optional(),
    ...agentIdentityFields,
  })
  .loose();
export type AgentUndoRequest = z.infer<typeof AgentUndoRequestSchema>;
const _AgentUndoRequestSchemaIsStandard: StandardSchemaV1<unknown, AgentUndoRequest> =
  AgentUndoRequestSchema;
void _AgentUndoRequestSchemaIsStandard;

/**
 * Sub-schema for the optional `summary` field on every mutating-handler
 * success response. `truncatedFrom` and `hint` only appear when the
 * server applied the 80-char cap — `summaryResponseFields` derives the
 * shape from `NormalizedSummary`.
 */
export const SummaryResponseFieldSchema = z
  .object({
    value: z.string(),
    truncatedFrom: z.number().int().nonnegative().optional(),
    hint: z.string().optional(),
  })
  .loose();
export type SummaryResponseField = z.infer<typeof SummaryResponseFieldSchema>;
const _SummaryResponseFieldSchemaIsStandard: StandardSchemaV1<unknown, SummaryResponseField> =
  SummaryResponseFieldSchema;
void _SummaryResponseFieldSchemaIsStandard;

/**
 * Orphan-hint emitted by `handleAgentWriteMd` when the just-written doc has
 * no backlinks and at least one plausible hub candidate exists in its
 * folder tree. Soft signal — the agent is free to ignore.
 */
export const OrphanHintSchema = z
  .object({
    type: z.literal('orphan'),
    parentCandidates: z.array(z.string()),
    message: z.string(),
  })
  .loose();
export type OrphanHint = z.infer<typeof OrphanHintSchema>;
const _OrphanHintSchemaIsStandard: StandardSchemaV1<unknown, OrphanHint> = OrphanHintSchema;
void _OrphanHintSchemaIsStandard;

/** Success body for `POST /api/agent-write`. Flat shape per D22 (no `ok: true`). */
export const AgentWriteSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose();
export type AgentWriteSuccess = z.infer<typeof AgentWriteSuccessSchema>;
const _AgentWriteSuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentWriteSuccess> =
  AgentWriteSuccessSchema;
void _AgentWriteSuccessSchemaIsStandard;

/**
 * Success body for `POST /api/agent-write-md`. `subscriberCount` and
 * `systemSubscriberCount` drive the once-per-session preview-attach hint
 * contract; `hints` carries the orphan nudge.
 */
export const AgentWriteMdSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    subscriberCount: z.number().int().nonnegative(),
    systemSubscriberCount: z.number().int().nonnegative(),
    hints: z.array(OrphanHintSchema).optional(),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose();
export type AgentWriteMdSuccess = z.infer<typeof AgentWriteMdSuccessSchema>;
const _AgentWriteMdSuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentWriteMdSuccess> =
  AgentWriteMdSuccessSchema;
void _AgentWriteMdSuccessSchemaIsStandard;

/** Success body for `POST /api/agent-patch`. */
export const AgentPatchSuccessSchema = z
  .object({
    timestamp: z.string().min(1),
    subscriberCount: z.number().int().nonnegative(),
    systemSubscriberCount: z.number().int().nonnegative(),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose();
export type AgentPatchSuccess = z.infer<typeof AgentPatchSuccessSchema>;
const _AgentPatchSuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentPatchSuccess> =
  AgentPatchSuccessSchema;
void _AgentPatchSuccessSchemaIsStandard;

/**
 * Success body for `POST /api/agent-undo`. `scope` reflects the resolved
 * scope after collapsing `'file'` → `'session'`. `undone` is `false` when
 * the UM stack was empty (a no-op undo).
 */
export const AgentUndoSuccessSchema = z
  .object({
    docName: z.string().min(1),
    scope: z.enum(['last', 'session']),
    undone: z.boolean(),
  })
  .loose();
export type AgentUndoSuccess = z.infer<typeof AgentUndoSuccessSchema>;
const _AgentUndoSuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentUndoSuccess> =
  AgentUndoSuccessSchema;
void _AgentUndoSuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster B: pages CRUD (US-007)
// ---------------------------------------------------------------------------
//
// Read + mutate handlers backing the FileTree / NewItemDialog / EditorHeader
// rename surface. `withValidation()` enforces these schemas at the wire
// boundary; semantic failures (doc-not-found, doc-already-exists, etc.) emit
// post-extractAgentIdentity for mutating handlers. Read-only handlers
// (`handlePages`, `handlePageHeadings`) take query params, not bodies; they
// route through a no-op request schema so the wrapper still gates 405.

/**
 * Mapping from a pre-rename docName to its post-rename docName. Used in
 * the `renamed` array of `/api/rename` and `/api/rename-path` success bodies
 * so client UIs (FileTree, EditorHeader) can update their per-doc model
 * atomically without re-fetching the whole tree.
 */
export const RenamedDocMappingSchema = z
  .object({
    fromDocName: z.string().min(1),
    toDocName: z.string().min(1),
  })
  .loose();
export type RenamedDocMapping = z.infer<typeof RenamedDocMappingSchema>;
const _RenamedDocMappingSchemaIsStandard: StandardSchemaV1<unknown, RenamedDocMapping> =
  RenamedDocMappingSchema;
void _RenamedDocMappingSchemaIsStandard;

/** Empty request schema for GET endpoints whose body is unused. */
export const EmptyRequestSchema = z.object({}).loose();
export type EmptyRequest = z.infer<typeof EmptyRequestSchema>;
const _EmptyRequestSchemaIsStandard: StandardSchemaV1<unknown, EmptyRequest> = EmptyRequestSchema;
void _EmptyRequestSchemaIsStandard;

/**
 * Request body for `POST /api/create-page`. `path` is the relative
 * content-dir path including the `.md`/`.mdx` suffix; the handler runs the
 * `isSupportedDocFile` + path-traversal + reserved-docname checks
 * post-validation. `agentId` etc. are optional — `extractAgentIdentity`
 * carries the default-agent fallback when absent.
 */
export const CreatePageRequestSchema = z
  .object({
    path: z.string().min(1),
    ...agentIdentityFields,
  })
  .loose();
export type CreatePageRequest = z.infer<typeof CreatePageRequestSchema>;
const _CreatePageRequestSchemaIsStandard: StandardSchemaV1<unknown, CreatePageRequest> =
  CreatePageRequestSchema;
void _CreatePageRequestSchemaIsStandard;

/** Success body for `POST /api/create-page`. */
export const CreatePageSuccessSchema = z
  .object({
    docName: z.string().min(1),
  })
  .loose();
export type CreatePageSuccess = z.infer<typeof CreatePageSuccessSchema>;
const _CreatePageSuccessSchemaIsStandard: StandardSchemaV1<unknown, CreatePageSuccess> =
  CreatePageSuccessSchema;
void _CreatePageSuccessSchemaIsStandard;

/**
 * Single page entry in the `pages` array of `GET /api/pages`. `docExt` is
 * the actual on-disk extension (`.md` or `.mdx`); `title` is the first
 * non-empty heading or the docName fallback.
 */
export const PageEntrySchema = z
  .object({
    docName: z.string().min(1),
    title: z.string(),
    docExt: z.string().min(1),
    size: z.number().int().nonnegative(),
    modified: z.string().min(1),
  })
  .loose();
export type PageEntry = z.infer<typeof PageEntrySchema>;
const _PageEntrySchemaIsStandard: StandardSchemaV1<unknown, PageEntry> = PageEntrySchema;
void _PageEntrySchemaIsStandard;

/** Success body for `GET /api/pages`. Sorted alphabetically by docName. */
export const PagesSuccessSchema = z
  .object({
    pages: z.array(PageEntrySchema),
  })
  .loose();
export type PagesSuccess = z.infer<typeof PagesSuccessSchema>;
const _PagesSuccessSchemaIsStandard: StandardSchemaV1<unknown, PagesSuccess> = PagesSuccessSchema;
void _PagesSuccessSchemaIsStandard;

/** ATX heading entry (level + slug) emitted by `GET /api/page-headings`. */
export const HeadingEntrySchema = z
  .object({
    level: z.number().int().min(1).max(6),
    text: z.string(),
    slug: z.string(),
  })
  .loose();
export type HeadingEntry = z.infer<typeof HeadingEntrySchema>;
const _HeadingEntrySchemaIsStandard: StandardSchemaV1<unknown, HeadingEntry> = HeadingEntrySchema;
void _HeadingEntrySchemaIsStandard;

/** Success body for `GET /api/page-headings?docName=...`. */
export const PageHeadingsSuccessSchema = z
  .object({
    docName: z.string().min(1),
    headings: z.array(HeadingEntrySchema),
  })
  .loose();
export type PageHeadingsSuccess = z.infer<typeof PageHeadingsSuccessSchema>;
const _PageHeadingsSuccessSchemaIsStandard: StandardSchemaV1<unknown, PageHeadingsSuccess> =
  PageHeadingsSuccessSchema;
void _PageHeadingsSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/rename`. Mirrors `handleRename`'s legacy
 * field set. `agentId` is the explicit-attribution gate (D22 LOCKED 1-way
 * door): when absent, `extractAgentIdentity` defaults are NOT used to
 * attribute the rename — UI-driven Restore stays anonymous. `summary`
 * validation runs unconditionally (independent of `hasAgentId`) so a
 * malformed `summary: 42` returns 400 even when identity is absent.
 */
export const RenameRequestSchema = z
  .object({
    docName: z.string().min(1),
    newDocName: z.string().min(1),
    summary: summaryField,
    ...agentIdentityFields,
  })
  .loose();
export type RenameRequest = z.infer<typeof RenameRequestSchema>;
const _RenameRequestSchemaIsStandard: StandardSchemaV1<unknown, RenameRequest> =
  RenameRequestSchema;
void _RenameRequestSchemaIsStandard;

/** Backlink-rewrite summary entry returned by `/api/rename`. */
export const RenameRewrittenDocSchema = z
  .object({
    docName: z.string().min(1),
    rewrites: z.number().int().nonnegative(),
  })
  .loose();
export type RenameRewrittenDoc = z.infer<typeof RenameRewrittenDocSchema>;
const _RenameRewrittenDocSchemaIsStandard: StandardSchemaV1<unknown, RenameRewrittenDoc> =
  RenameRewrittenDocSchema;
void _RenameRewrittenDocSchemaIsStandard;

/** Success body for `POST /api/rename`. */
export const RenameSuccessSchema = z
  .object({
    renamed: z.array(RenamedDocMappingSchema),
    rewrittenDocs: z.array(RenameRewrittenDocSchema),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose();
export type RenameSuccess = z.infer<typeof RenameSuccessSchema>;
const _RenameSuccessSchemaIsStandard: StandardSchemaV1<unknown, RenameSuccess> =
  RenameSuccessSchema;
void _RenameSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/rename-path`. `kind` selects file vs folder
 * semantics; the handler enforces the actual on-disk shape post-validation.
 */
export const RenamePathRequestSchema = z
  .object({
    kind: z.enum(['file', 'folder']),
    fromPath: z.string().min(1),
    toPath: z.string().min(1),
    ...agentIdentityFields,
  })
  .loose();
export type RenamePathRequest = z.infer<typeof RenamePathRequestSchema>;
const _RenamePathRequestSchemaIsStandard: StandardSchemaV1<unknown, RenamePathRequest> =
  RenamePathRequestSchema;
void _RenamePathRequestSchemaIsStandard;

/** Success body for `POST /api/rename-path`. */
export const RenamePathSuccessSchema = z
  .object({
    renamed: z.array(RenamedDocMappingSchema),
  })
  .loose();
export type RenamePathSuccess = z.infer<typeof RenamePathSuccessSchema>;
const _RenamePathSuccessSchemaIsStandard: StandardSchemaV1<unknown, RenamePathSuccess> =
  RenamePathSuccessSchema;
void _RenamePathSuccessSchemaIsStandard;

/** Request body for `POST /api/delete-path`. */
export const DeletePathRequestSchema = z
  .object({
    kind: z.enum(['file', 'folder']),
    path: z.string().min(1),
    ...agentIdentityFields,
  })
  .loose();
export type DeletePathRequest = z.infer<typeof DeletePathRequestSchema>;
const _DeletePathRequestSchemaIsStandard: StandardSchemaV1<unknown, DeletePathRequest> =
  DeletePathRequestSchema;
void _DeletePathRequestSchemaIsStandard;

/** Success body for `POST /api/delete-path`. */
export const DeletePathSuccessSchema = z
  .object({
    deletedDocNames: z.array(z.string().min(1)),
  })
  .loose();
export type DeletePathSuccess = z.infer<typeof DeletePathSuccessSchema>;
const _DeletePathSuccessSchemaIsStandard: StandardSchemaV1<unknown, DeletePathSuccess> =
  DeletePathSuccessSchema;
void _DeletePathSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/rollback`. `commitSha` is a 40-char git SHA;
 * `versionTag` is optional — when present it appears in the parent-git
 * commit message instead of the short SHA. `agentId` mirrors the rename
 * handler's D22 LOCKED 1-way door — the UI Restore button posts no
 * `agentId` so attribution stays anonymous.
 */
export const RollbackRequestSchema = z
  .object({
    docName: z.string().min(1),
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/i, { message: 'commitSha must be a 40-char git SHA' }),
    versionTag: z.string().optional(),
    summary: summaryField,
    ...agentIdentityFields,
  })
  .loose();
export type RollbackRequest = z.infer<typeof RollbackRequestSchema>;
const _RollbackRequestSchemaIsStandard: StandardSchemaV1<unknown, RollbackRequest> =
  RollbackRequestSchema;
void _RollbackRequestSchemaIsStandard;

/** Success body for `POST /api/rollback`. */
export const RollbackSuccessSchema = z
  .object({
    restoredFrom: z.string().min(1),
    timestamp: z.string().min(1),
    summary: SummaryResponseFieldSchema.optional(),
  })
  .loose();
export type RollbackSuccess = z.infer<typeof RollbackSuccessSchema>;
const _RollbackSuccessSchemaIsStandard: StandardSchemaV1<unknown, RollbackSuccess> =
  RollbackSuccessSchema;
void _RollbackSuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster C: document/links read part 1 (US-008)
// ---------------------------------------------------------------------------
//
// Read-only handlers backing the BacklinksPanel / ForwardLinksPanel / GraphView /
// FileTree / EmptyEditorState / agent-sim consumers. All take query params
// (no body) and use `EmptyRequestSchema` + `skipBodyParse` at the wrapper.

/** Success body for `GET /api/document?docName=...`. */
export const DocumentReadSuccessSchema = z
  .object({
    docName: z.string().min(1),
    content: z.string(),
  })
  .loose();
export type DocumentReadSuccess = z.infer<typeof DocumentReadSuccessSchema>;
const _DocumentReadSuccessSchemaIsStandard: StandardSchemaV1<unknown, DocumentReadSuccess> =
  DocumentReadSuccessSchema;
void _DocumentReadSuccessSchemaIsStandard;

/**
 * Single document entry in the `documents` array of `GET /api/documents`.
 * Symlink-aware: aliases share `size` / `modified` with their canonical
 * sibling. `targetPath` is the canonical-relative on-disk path (only set
 * for `isSymlink: true`).
 */
export const DocumentListEntrySchema = z
  .object({
    docName: z.string().min(1),
    docExt: z.string().min(1),
    size: z.number().int().nonnegative(),
    modified: z.string().min(1),
    isSymlink: z.boolean(),
    canonicalDocName: z.string().nullable(),
    targetPath: z.string().nullable(),
  })
  .loose();
export type DocumentListEntry = z.infer<typeof DocumentListEntrySchema>;
const _DocumentListEntrySchemaIsStandard: StandardSchemaV1<unknown, DocumentListEntry> =
  DocumentListEntrySchema;
void _DocumentListEntrySchemaIsStandard;

/** Success body for `GET /api/documents`. Sorted alphabetically by docName. */
export const DocumentListSuccessSchema = z
  .object({
    documents: z.array(DocumentListEntrySchema),
  })
  .loose();
export type DocumentListSuccess = z.infer<typeof DocumentListSuccessSchema>;
const _DocumentListSuccessSchemaIsStandard: StandardSchemaV1<unknown, DocumentListSuccess> =
  DocumentListSuccessSchema;
void _DocumentListSuccessSchemaIsStandard;

/**
 * Single backlink edge returned by `/api/backlinks`. `anchor` is null when
 * the backlink targets the page root (no `#heading`). `snippet` is the
 * surrounding paragraph or `null` when the source has no nearby prose.
 */
export const BacklinkEntrySchema = z
  .object({
    source: z.string().min(1),
    anchor: z.string().nullable(),
    title: z.string(),
    snippet: z.string().nullable(),
  })
  .loose();
export type BacklinkEntry = z.infer<typeof BacklinkEntrySchema>;
const _BacklinkEntrySchemaIsStandard: StandardSchemaV1<unknown, BacklinkEntry> =
  BacklinkEntrySchema;
void _BacklinkEntrySchemaIsStandard;

/** Success body for `GET /api/backlinks?docName=...`. */
export const BacklinksSuccessSchema = z
  .object({
    docName: z.string().min(1),
    backlinks: z.array(BacklinkEntrySchema),
  })
  .loose();
export type BacklinksSuccess = z.infer<typeof BacklinksSuccessSchema>;
const _BacklinksSuccessSchemaIsStandard: StandardSchemaV1<unknown, BacklinksSuccess> =
  BacklinksSuccessSchema;
void _BacklinksSuccessSchemaIsStandard;

/**
 * Success body for `GET /api/backlink-counts?docNames=a,b,c`. Sparse map —
 * docNames failing `isSafeDocName` are silently dropped (read-only enrichment
 * for sidebar listings; failure is graceful).
 */
export const BacklinkCountsSuccessSchema = z
  .object({
    counts: z.record(z.string().min(1), z.number().int().nonnegative()),
  })
  .loose();
export type BacklinkCountsSuccess = z.infer<typeof BacklinkCountsSuccessSchema>;
const _BacklinkCountsSuccessSchemaIsStandard: StandardSchemaV1<unknown, BacklinkCountsSuccess> =
  BacklinkCountsSuccessSchema;
void _BacklinkCountsSuccessSchemaIsStandard;

/**
 * Single forward-link entry returned by `/api/forward-links`. Discriminated
 * by `kind`: `'doc'` carries `docName` + optional `anchor`; `'external'`
 * carries `url`. `title` falls back to the docName / URL when no
 * page-title is available; `snippet` is the surrounding paragraph or null.
 */
export const ForwardLinkDocEntrySchema = z
  .object({
    kind: z.literal('doc'),
    docName: z.string().min(1),
    anchor: z.string().nullable(),
    title: z.string(),
    snippet: z.string().nullable(),
  })
  .loose();
export type ForwardLinkDocEntry = z.infer<typeof ForwardLinkDocEntrySchema>;
const _ForwardLinkDocEntrySchemaIsStandard: StandardSchemaV1<unknown, ForwardLinkDocEntry> =
  ForwardLinkDocEntrySchema;
void _ForwardLinkDocEntrySchemaIsStandard;

export const ForwardLinkExternalEntrySchema = z
  .object({
    kind: z.literal('external'),
    url: z.string().min(1),
    title: z.string(),
    snippet: z.string().nullable(),
  })
  .loose();
export type ForwardLinkExternalEntry = z.infer<typeof ForwardLinkExternalEntrySchema>;
const _ForwardLinkExternalEntrySchemaIsStandard: StandardSchemaV1<
  unknown,
  ForwardLinkExternalEntry
> = ForwardLinkExternalEntrySchema;
void _ForwardLinkExternalEntrySchemaIsStandard;

export const ForwardLinkEntrySchema = z.discriminatedUnion('kind', [
  ForwardLinkDocEntrySchema,
  ForwardLinkExternalEntrySchema,
]);
export type ForwardLinkEntry = z.infer<typeof ForwardLinkEntrySchema>;
const _ForwardLinkEntrySchemaIsStandard: StandardSchemaV1<unknown, ForwardLinkEntry> =
  ForwardLinkEntrySchema;
void _ForwardLinkEntrySchemaIsStandard;

/** Success body for `GET /api/forward-links?docName=...`. */
export const ForwardLinksSuccessSchema = z
  .object({
    docName: z.string().min(1),
    forwardLinks: z.array(ForwardLinkEntrySchema),
  })
  .loose();
export type ForwardLinksSuccess = z.infer<typeof ForwardLinksSuccessSchema>;
const _ForwardLinksSuccessSchemaIsStandard: StandardSchemaV1<unknown, ForwardLinksSuccess> =
  ForwardLinksSuccessSchema;
void _ForwardLinksSuccessSchemaIsStandard;

/**
 * Single graph node in `/api/link-graph`. Discriminated by `kind`. Doc nodes
 * carry frontmatter-derived metadata (`cluster`, `category`, `tags`) for
 * graph coloring; external nodes carry only the URL + label.
 */
export const LinkGraphDocNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('doc'),
    docName: z.string().min(1),
    anchor: z.string().nullable(),
    label: z.string(),
    cluster: z.string().nullable(),
    category: z.string().nullable(),
    tags: z.array(z.string()).nullable(),
  })
  .loose();
export type LinkGraphDocNode = z.infer<typeof LinkGraphDocNodeSchema>;
const _LinkGraphDocNodeSchemaIsStandard: StandardSchemaV1<unknown, LinkGraphDocNode> =
  LinkGraphDocNodeSchema;
void _LinkGraphDocNodeSchemaIsStandard;

export const LinkGraphExternalNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('external'),
    url: z.string().min(1),
    label: z.string(),
  })
  .loose();
export type LinkGraphExternalNode = z.infer<typeof LinkGraphExternalNodeSchema>;
const _LinkGraphExternalNodeSchemaIsStandard: StandardSchemaV1<unknown, LinkGraphExternalNode> =
  LinkGraphExternalNodeSchema;
void _LinkGraphExternalNodeSchemaIsStandard;

export const LinkGraphNodeSchema = z.discriminatedUnion('kind', [
  LinkGraphDocNodeSchema,
  LinkGraphExternalNodeSchema,
]);
export type LinkGraphNode = z.infer<typeof LinkGraphNodeSchema>;
const _LinkGraphNodeSchemaIsStandard: StandardSchemaV1<unknown, LinkGraphNode> =
  LinkGraphNodeSchema;
void _LinkGraphNodeSchemaIsStandard;

/** Single edge in `/api/link-graph`. `source` / `target` are node ids. */
export const LinkGraphEdgeSchema = z
  .object({
    source: z.string().min(1),
    target: z.string().min(1),
  })
  .loose();
export type LinkGraphEdge = z.infer<typeof LinkGraphEdgeSchema>;
const _LinkGraphEdgeSchemaIsStandard: StandardSchemaV1<unknown, LinkGraphEdge> =
  LinkGraphEdgeSchema;
void _LinkGraphEdgeSchemaIsStandard;

/** Success body for `GET /api/link-graph[?docName=...&degrees=N]`. */
export const LinkGraphSuccessSchema = z
  .object({
    nodes: z.array(LinkGraphNodeSchema),
    links: z.array(LinkGraphEdgeSchema),
  })
  .loose();
export type LinkGraphSuccess = z.infer<typeof LinkGraphSuccessSchema>;
const _LinkGraphSuccessSchemaIsStandard: StandardSchemaV1<unknown, LinkGraphSuccess> =
  LinkGraphSuccessSchema;
void _LinkGraphSuccessSchemaIsStandard;

// -----------------------------------------------------------------------------
// Cluster D: orphans / hubs / dead-links / suggest-links (US-009).
// All four are GET endpoints — request schemas are EmptyRequestSchema (query
// params parsed manually inside the handler; their validity is enforced
// inline via errorResponse `urn:ok:error:invalid-request` emits).
// -----------------------------------------------------------------------------

/**
 * Single entry in the orphans response. `title` is the H1 / frontmatter title
 * pulled from the corresponding markdown file; falls back to `docName` if no
 * usable heading exists.
 */
export const OrphanEntrySchema = z
  .object({
    docName: z.string().min(1),
    title: z.string(),
  })
  .loose();
export type OrphanEntry = z.infer<typeof OrphanEntrySchema>;
const _OrphanEntrySchemaIsStandard: StandardSchemaV1<unknown, OrphanEntry> = OrphanEntrySchema;
void _OrphanEntrySchemaIsStandard;

/** Success body for `GET /api/orphans[?mode=incoming|outgoing|both]`. */
export const OrphansSuccessSchema = z
  .object({
    orphans: z.array(OrphanEntrySchema),
  })
  .loose();
export type OrphansSuccess = z.infer<typeof OrphansSuccessSchema>;
const _OrphansSuccessSchemaIsStandard: StandardSchemaV1<unknown, OrphansSuccess> =
  OrphansSuccessSchema;
void _OrphansSuccessSchemaIsStandard;

/** Single entry in the hubs response. `count` is the inbound-backlink count. */
export const HubEntrySchema = z
  .object({
    docName: z.string().min(1),
    title: z.string(),
    count: z.number().int().nonnegative(),
  })
  .loose();
export type HubEntry = z.infer<typeof HubEntrySchema>;
const _HubEntrySchemaIsStandard: StandardSchemaV1<unknown, HubEntry> = HubEntrySchema;
void _HubEntrySchemaIsStandard;

/** Success body for `GET /api/hubs[?limit=N]`. */
export const HubsSuccessSchema = z
  .object({
    hubs: z.array(HubEntrySchema),
  })
  .loose();
export type HubsSuccess = z.infer<typeof HubsSuccessSchema>;
const _HubsSuccessSchemaIsStandard: StandardSchemaV1<unknown, HubsSuccess> = HubsSuccessSchema;
void _HubsSuccessSchemaIsStandard;

/**
 * Single source-pointer for a dead-link entry — references the page that
 * contains the broken link plus a short snippet for context.
 */
export const DeadLinkSourceSchema = z
  .object({
    source: z.string().min(1),
    title: z.string(),
    snippet: z.string().nullable(),
  })
  .loose();
export type DeadLinkSource = z.infer<typeof DeadLinkSourceSchema>;
const _DeadLinkSourceSchemaIsStandard: StandardSchemaV1<unknown, DeadLinkSource> =
  DeadLinkSourceSchema;
void _DeadLinkSourceSchemaIsStandard;

/** Single dead-link entry — one missing target plus the sources that point at it. */
export const DeadLinkEntrySchema = z
  .object({
    target: z.string().min(1),
    sources: z.array(DeadLinkSourceSchema),
  })
  .loose();
export type DeadLinkEntry = z.infer<typeof DeadLinkEntrySchema>;
const _DeadLinkEntrySchemaIsStandard: StandardSchemaV1<unknown, DeadLinkEntry> =
  DeadLinkEntrySchema;
void _DeadLinkEntrySchemaIsStandard;

/** Success body for `GET /api/dead-links[?sourceDocName=...&sourceDocName=...]`. */
export const DeadLinksSuccessSchema = z
  .object({
    deadLinks: z.array(DeadLinkEntrySchema),
  })
  .loose();
export type DeadLinksSuccess = z.infer<typeof DeadLinksSuccessSchema>;
const _DeadLinksSuccessSchemaIsStandard: StandardSchemaV1<unknown, DeadLinksSuccess> =
  DeadLinksSuccessSchema;
void _DeadLinksSuccessSchemaIsStandard;

/** Target page metadata in a `/api/suggest-links` response. */
export const SuggestLinksTargetSchema = z
  .object({
    docName: z.string().min(1),
    title: z.string(),
    aliases: z.array(z.string()),
  })
  .loose();
export type SuggestLinksTarget = z.infer<typeof SuggestLinksTargetSchema>;
const _SuggestLinksTargetSchemaIsStandard: StandardSchemaV1<unknown, SuggestLinksTarget> =
  SuggestLinksTargetSchema;
void _SuggestLinksTargetSchemaIsStandard;

/** Single mention discovered while scanning the corpus. */
export const SuggestLinksMentionSchema = z
  .object({
    source: z.string().min(1),
    excerpt: z.string(),
    offset: z.number().int().nonnegative(),
  })
  .loose();
export type SuggestLinksMention = z.infer<typeof SuggestLinksMentionSchema>;
const _SuggestLinksMentionSchemaIsStandard: StandardSchemaV1<unknown, SuggestLinksMention> =
  SuggestLinksMentionSchema;
void _SuggestLinksMentionSchemaIsStandard;

/** Success body for `GET /api/suggest-links?docName=...`. */
export const SuggestLinksSuccessSchema = z
  .object({
    target: SuggestLinksTargetSchema,
    mentions: z.array(SuggestLinksMentionSchema),
    truncated: z.boolean(),
  })
  .loose();
export type SuggestLinksSuccess = z.infer<typeof SuggestLinksSuccessSchema>;
const _SuggestLinksSuccessSchemaIsStandard: StandardSchemaV1<unknown, SuggestLinksSuccess> =
  SuggestLinksSuccessSchema;
void _SuggestLinksSuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster E: save-version / history / history/<sha> / diff / workspace /
// rescue-list / rescue-get / server-info / principal (US-010)
// ---------------------------------------------------------------------------
//
// Mix of GET-no-body (history, diff, workspace, rescue, server-info, principal)
// and POST-with-optional-body (save-version) handlers. Save-version is the only
// one taking a request body (writers, message, principal); the others are
// query-string-only. Schemas drop the `{ ok: true }` wrapper per D22.
//
// `serverInfo` and `principal` schemas live in their canonical locations near
// the top of this file (the existing schemas are reshaped in lockstep with
// this story); below are the remaining cluster E success schemas.

/** Optional writer record passed to `POST /api/save-version`. */
export const SaveVersionWriterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    email: z.string().optional(),
  })
  .loose();
export type SaveVersionWriter = z.infer<typeof SaveVersionWriterSchema>;
const _SaveVersionWriterSchemaIsStandard: StandardSchemaV1<unknown, SaveVersionWriter> =
  SaveVersionWriterSchema;
void _SaveVersionWriterSchemaIsStandard;

/** Optional principal identity passed to `POST /api/save-version` (US-020 D12). */
export const SaveVersionPrincipalSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
  })
  .loose();
export type SaveVersionPrincipal = z.infer<typeof SaveVersionPrincipalSchema>;
const _SaveVersionPrincipalSchemaIsStandard: StandardSchemaV1<unknown, SaveVersionPrincipal> =
  SaveVersionPrincipalSchema;
void _SaveVersionPrincipalSchemaIsStandard;

/**
 * Request body for `POST /api/save-version`. Every field optional — the
 * common case posts an empty `{}` body and inherits agent / git defaults.
 *
 * `message` is a free-form summary clipped to 256 chars + newline-stripped
 * server-side. `writers` is an explicit override list (the server otherwise
 * derives it from the calling agent identity). `principal` overrides the
 * git-config author identity for this checkpoint commit.
 */
export const SaveVersionRequestSchema = z
  .object({
    message: z.string().optional(),
    writers: z.array(SaveVersionWriterSchema).optional(),
    principal: SaveVersionPrincipalSchema.optional(),
    ...agentIdentityFields,
  })
  .loose();
export type SaveVersionRequest = z.infer<typeof SaveVersionRequestSchema>;
const _SaveVersionRequestSchemaIsStandard: StandardSchemaV1<unknown, SaveVersionRequest> =
  SaveVersionRequestSchema;
void _SaveVersionRequestSchemaIsStandard;

/**
 * Success response for `POST /api/save-version`. `checkpointRef` is the
 * shadow-repo checkpoint SHA; `versionTag` is the optional `ok/v<N>` tag in
 * the parent git repo (omitted when projectDir lacks a git repo per US-021
 * graceful-availability contract).
 */
export const SaveVersionSuccessSchema = z
  .object({
    checkpointRef: z.string().min(1),
    versionTag: z.string().min(1).optional(),
  })
  .loose();
export type SaveVersionSuccess = z.infer<typeof SaveVersionSuccessSchema>;
const _SaveVersionSuccessSchemaIsStandard: StandardSchemaV1<unknown, SaveVersionSuccess> =
  SaveVersionSuccessSchema;
void _SaveVersionSuccessSchemaIsStandard;

/**
 * Single shadow contributor entry (parsed from a checkpoint commit). Mirrors
 * the in-process `ShadowContributor` type but exposed through a Zod schema so
 * the wire shape is gated by the canonical SSOT.
 */
export const HistoryShadowContributorSchema = z
  .object({
    writerId: z.string().min(1),
    displayName: z.string().min(1),
    summary: z.string().optional(),
    actor: z.unknown().optional(),
    colorSeed: z.string().optional(),
  })
  .loose();
export type HistoryShadowContributor = z.infer<typeof HistoryShadowContributorSchema>;
const _HistoryShadowContributorSchemaIsStandard: StandardSchemaV1<
  unknown,
  HistoryShadowContributor
> = HistoryShadowContributorSchema;
void _HistoryShadowContributorSchemaIsStandard;

/** Single timeline entry returned from `GET /api/history`. */
export const HistoryEntrySchema = z
  .object({
    sha: z.string().min(1),
    timestamp: z.string().min(1),
    author: z.string(),
    authorEmail: z.string(),
    type: z.enum(['checkpoint', 'wip', 'upstream', 'park']),
    message: z.string(),
    contributors: z.array(HistoryShadowContributorSchema),
    checkpoint: z.unknown().nullable(),
  })
  .loose();
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
const _HistoryEntrySchemaIsStandard: StandardSchemaV1<unknown, HistoryEntry> = HistoryEntrySchema;
void _HistoryEntrySchemaIsStandard;

/**
 * Success response for `GET /api/history?docName=...&branch=...`. The
 * `entries` array spans both checkpoint and WIP rows (filterable via the
 * `type` query parameter); pagination is `limit`-bounded server-side
 * (max 200 per page).
 */
export const HistorySuccessSchema = z
  .object({
    entries: z.array(HistoryEntrySchema),
    total: z.number().int().nonnegative().optional(),
    truncated: z.boolean().optional(),
  })
  .loose();
export type HistorySuccess = z.infer<typeof HistorySuccessSchema>;
const _HistorySuccessSchemaIsStandard: StandardSchemaV1<unknown, HistorySuccess> =
  HistorySuccessSchema;
void _HistorySuccessSchemaIsStandard;

/**
 * Success response for `GET /api/history/<sha>?docName=...`. Returns the
 * historical document content + commit metadata.
 */
export const HistoryVersionSuccessSchema = z
  .object({
    sha: z.string().regex(/^[0-9a-f]{40}$/i),
    content: z.string(),
    timestamp: z.string(),
    author: z.string(),
  })
  .loose();
export type HistoryVersionSuccess = z.infer<typeof HistoryVersionSuccessSchema>;
const _HistoryVersionSuccessSchemaIsStandard: StandardSchemaV1<unknown, HistoryVersionSuccess> =
  HistoryVersionSuccessSchema;
void _HistoryVersionSuccessSchemaIsStandard;

/** Single line of a `GET /api/diff` response. */
export const DiffLineSchema = z
  .object({
    type: z.enum(['added', 'removed', 'unchanged']),
    text: z.string(),
  })
  .loose();
export type DiffLine = z.infer<typeof DiffLineSchema>;
const _DiffLineSchemaIsStandard: StandardSchemaV1<unknown, DiffLine> = DiffLineSchema;
void _DiffLineSchemaIsStandard;

/**
 * Success response for `GET /api/diff?docName=...&from=...&to=...`. `from`
 * may be empty (server reads current Y.Doc text) or a 40-char commit SHA.
 */
export const DiffSuccessSchema = z
  .object({
    lines: z.array(DiffLineSchema),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .loose();
export type DiffSuccess = z.infer<typeof DiffSuccessSchema>;
const _DiffSuccessSchemaIsStandard: StandardSchemaV1<unknown, DiffSuccess> = DiffSuccessSchema;
void _DiffSuccessSchemaIsStandard;

/**
 * Success response for `GET /api/workspace`. Loopback-only endpoint —
 * exposes the absolute host filesystem path so the client's "Copy path"
 * action can build full paths without guessing path-separator semantics.
 *
 * `symlinkResolved=false` indicates the contentDir was deleted out from
 * under the server (ENOENT on realpath); the client receives the unresolved
 * path and decides whether to act on it.
 */
export const WorkspaceSuccessSchema = z
  .object({
    contentDir: z.string().min(1),
    pathSeparator: z.enum(['/', '\\']),
    symlinkResolved: z.boolean(),
  })
  .loose();
export type WorkspaceSuccess = z.infer<typeof WorkspaceSuccessSchema>;
const _WorkspaceSuccessSchemaIsStandard: StandardSchemaV1<unknown, WorkspaceSuccess> =
  WorkspaceSuccessSchema;
void _WorkspaceSuccessSchemaIsStandard;

/** Single rescue buffer entry — flat-file (shutdown-flush) source. */
export const RescueEntryFlatSchema = z
  .object({
    docName: z.string().min(1),
    timestamp: z.string().min(1),
    size: z.number().int().nonnegative(),
    source: z.literal('flat'),
  })
  .loose();
export type RescueEntryFlat = z.infer<typeof RescueEntryFlatSchema>;
const _RescueEntryFlatSchemaIsStandard: StandardSchemaV1<unknown, RescueEntryFlat> =
  RescueEntryFlatSchema;
void _RescueEntryFlatSchemaIsStandard;

/** Single rescue buffer entry — timeline-ref (saveInMemoryCheckpoint) source. */
export const RescueEntryTimelineSchema = z
  .object({
    docName: z.string().min(1),
    timestamp: z.string().min(1),
    source: z.literal('timeline'),
    sha: z.string().min(1),
  })
  .loose();
export type RescueEntryTimeline = z.infer<typeof RescueEntryTimelineSchema>;
const _RescueEntryTimelineSchemaIsStandard: StandardSchemaV1<unknown, RescueEntryTimeline> =
  RescueEntryTimelineSchema;
void _RescueEntryTimelineSchemaIsStandard;

/**
 * Success response for `GET /api/rescue` — flat array of rescue buffers
 * across both flat-file (shutdown-flush) and timeline-ref
 * (saveInMemoryCheckpoint) sources. The `source` discriminator field tells
 * the client which artifact class produced the entry. Empty `[]` is valid
 * (no rescue buffers OR no shadow repo configured).
 *
 * Note: `/api/rescue/<docName>` returns raw markdown content with
 * `Content-Type: text/markdown` (not JSON), so it has no JSON success schema.
 */
export const RescueListSuccessSchema = z
  .array(z.union([RescueEntryFlatSchema, RescueEntryTimelineSchema]))
  .meta({
    description: 'Flat array of rescue buffer entries; discriminated via `source`.',
  });
export type RescueListSuccess = z.infer<typeof RescueListSuccessSchema>;
const _RescueListSuccessSchemaIsStandard: StandardSchemaV1<unknown, RescueListSuccess> =
  RescueListSuccessSchema;
void _RescueListSuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster F: metrics + agent activity + test handlers (US-011)
// ---------------------------------------------------------------------------
//
// Eight handlers — `handleAgentActivity`, `handleAgentBurstDiff`,
// `handleTestReset`, `handleTestRescanBacklinks`,
// `handleMetricsReconciliation`, `handleMetricsParseHealth`,
// `handleMetricsAgentPresence`, `handleInstalledAgentsRoute`. No new URN
// tokens — every error path reuses existing tokens (`invalid-request`,
// `reserved-docname`, `no-active-session`, `not-found`, `loopback-required`,
// `host-not-allowed`, `invalid-origin`, `method-not-allowed`,
// `backlink-index-not-configured`, `internal-server-error`).
//
// Several success bodies are operator-only metric snapshots whose field
// shapes change frequently (`ReconciliationMetrics`, `ParseHealthMetrics`).
// We keep their schemas permissive (`.loose()` over `z.record`) rather than
// pinning every counter — operators and dashboards read fields by name, not
// via discriminated narrowing, so a tightening here would just add lockstep
// maintenance with `metrics.ts` / `parse-health.ts` without catching real
// regressions.

/** One unified-diff burst entry on `AgentActivitySuccessSchema.files[].bursts[]`. */
export const ActivityBurstSchema = z
  .object({
    stackIndex: z.number().int().min(0),
    ts: z.number().int().min(0),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
  })
  .loose();
export type ActivityBurst = z.infer<typeof ActivityBurstSchema>;
const _ActivityBurstSchemaIsStandard: StandardSchemaV1<unknown, ActivityBurst> =
  ActivityBurstSchema;
void _ActivityBurstSchemaIsStandard;

/** One file-level activity entry on `AgentActivitySuccessSchema.files`. */
export const ActivityFileSchema = z
  .object({
    docName: z.string().min(1),
    additionsTotal: z.number().int().min(0),
    deletionsTotal: z.number().int().min(0),
    lastTs: z.number().int().min(0),
    bursts: z.array(ActivityBurstSchema),
  })
  .loose();
export type ActivityFile = z.infer<typeof ActivityFileSchema>;
const _ActivityFileSchemaIsStandard: StandardSchemaV1<unknown, ActivityFile> = ActivityFileSchema;
void _ActivityFileSchemaIsStandard;

/** Header info for the agent on `AgentActivitySuccessSchema.agent`. */
export const ActivityAgentHeaderSchema = z
  .object({
    displayName: z.string().min(1),
    color: z.string().min(1),
    icon: z.string().optional(),
    connectionId: z.string().min(1),
  })
  .loose();
export type ActivityAgentHeader = z.infer<typeof ActivityAgentHeaderSchema>;
const _ActivityAgentHeaderSchemaIsStandard: StandardSchemaV1<unknown, ActivityAgentHeader> =
  ActivityAgentHeaderSchema;
void _ActivityAgentHeaderSchemaIsStandard;

/**
 * Success response for `GET /api/agent-activity?agentId=<connId>`. Returns
 * the per-agent activity ledger — every doc the agent has touched in the
 * current session, ordered most-recent first, with per-burst stack indexes
 * + +/- counts. `agent` is `null` when the connId isn't bound to a live
 * session (returns the zero-state ledger so the panel can render "no
 * active session"). Bodies that fail this schema are non-contract responses
 * → `HttpResponseParseError` per FR15.
 */
export const AgentActivitySuccessSchema = z
  .object({
    sessionAlive: z.boolean(),
    agent: ActivityAgentHeaderSchema.nullable(),
    files: z.array(ActivityFileSchema),
  })
  .loose();
export type AgentActivitySuccess = z.infer<typeof AgentActivitySuccessSchema>;
const _AgentActivitySuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentActivitySuccess> =
  AgentActivitySuccessSchema;
void _AgentActivitySuccessSchemaIsStandard;

/**
 * Success response for
 * `GET /api/agent-burst-diff?agentId=<connId>&docName=<path>&stackIndex=<n>`.
 *
 * `diff` is unified-diff text (CommonMark-style — empty string when the
 * StackItem produces a no-op diff). `generatedAt` is the server's wall
 * clock at response-emit time; clients use it for staleness detection
 * against `bursts[].ts` (already returned by `/api/agent-activity`).
 */
export const AgentBurstDiffSuccessSchema = z
  .object({
    diff: z.string(),
    generatedAt: z.number().int().min(0),
  })
  .loose();
export type AgentBurstDiffSuccess = z.infer<typeof AgentBurstDiffSuccessSchema>;
const _AgentBurstDiffSuccessSchemaIsStandard: StandardSchemaV1<unknown, AgentBurstDiffSuccess> =
  AgentBurstDiffSuccessSchema;
void _AgentBurstDiffSuccessSchemaIsStandard;

/**
 * Success response for `POST /api/test-reset?docName=<name>` and
 * `POST /api/test-rescan-backlinks`. Both are dev-only routes and return an
 * empty flat object on success — the HTTP 200 status alone is the
 * confirmation. `.loose()` preserves forward-compat for adding diagnostic
 * fields if needed (nothing relies on emptiness today).
 */
export const TestResetSuccessSchema = z.object({}).loose();
export type TestResetSuccess = z.infer<typeof TestResetSuccessSchema>;
const _TestResetSuccessSchemaIsStandard: StandardSchemaV1<unknown, TestResetSuccess> =
  TestResetSuccessSchema;
void _TestResetSuccessSchemaIsStandard;

export const TestRescanBacklinksSuccessSchema = z.object({}).loose();
export type TestRescanBacklinksSuccess = z.infer<typeof TestRescanBacklinksSuccessSchema>;
const _TestRescanBacklinksSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  TestRescanBacklinksSuccess
> = TestRescanBacklinksSuccessSchema;
void _TestRescanBacklinksSuccessSchemaIsStandard;

/**
 * Success response for `GET /api/metrics/reconciliation`. Returns the raw
 * `ReconciliationMetrics` object from `packages/server/src/metrics.ts`
 * (~30 numeric counters + a `cc1LastSeq` map). The schema is intentionally
 * permissive — operators read fields by name and dashboards iterate the
 * counter map; pinning every field would force lockstep maintenance with
 * every counter addition without catching a real regression.
 */
export const MetricsReconciliationSuccessSchema = z.object({}).loose();
export type MetricsReconciliationSuccess = z.infer<typeof MetricsReconciliationSuccessSchema>;
const _MetricsReconciliationSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  MetricsReconciliationSuccess
> = MetricsReconciliationSuccessSchema;
void _MetricsReconciliationSuccessSchemaIsStandard;

/**
 * Success response for `GET /api/metrics/parse-health`. Returns the raw
 * `ParseHealthMetrics` object from `packages/core/src/metrics/parse-health.ts`
 * (a mix of nested counters and per-descriptor records). Permissive for the
 * same reason as `MetricsReconciliationSuccessSchema`.
 */
export const MetricsParseHealthSuccessSchema = z.object({}).loose();
export type MetricsParseHealthSuccess = z.infer<typeof MetricsParseHealthSuccessSchema>;
const _MetricsParseHealthSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  MetricsParseHealthSuccess
> = MetricsParseHealthSuccessSchema;
void _MetricsParseHealthSuccessSchemaIsStandard;

/** One agent-presence entry on `MetricsAgentPresenceSuccessSchema.presence`. */
export const AgentPresenceEntrySchema = z
  .object({
    displayName: z.string().min(1),
    icon: z.string(),
    color: z.string().min(1),
    currentDoc: z.string().nullable(),
    mode: z.enum(['idle', 'writing']),
    ts: z.number().int().min(0),
  })
  .loose();
export type AgentPresenceEntryWire = z.infer<typeof AgentPresenceEntrySchema>;
const _AgentPresenceEntrySchemaIsStandard: StandardSchemaV1<unknown, AgentPresenceEntryWire> =
  AgentPresenceEntrySchema;
void _AgentPresenceEntrySchemaIsStandard;

/**
 * Success response for `GET /api/metrics/agent-presence`. Returns the
 * filtered presence map (entries within `BROADCASTER_EVICTION_MS` of the
 * server clock — same threshold the broadcaster uses). Loopback +
 * Host-allowlist gated; cross-origin / DNS-rebinding attempts are refused.
 */
export const MetricsAgentPresenceSuccessSchema = z
  .object({
    presence: z.record(z.string().min(1), AgentPresenceEntrySchema),
  })
  .loose();
export type MetricsAgentPresenceSuccess = z.infer<typeof MetricsAgentPresenceSuccessSchema>;
const _MetricsAgentPresenceSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  MetricsAgentPresenceSuccess
> = MetricsAgentPresenceSuccessSchema;
void _MetricsAgentPresenceSuccessSchemaIsStandard;

/**
 * Success response for `GET /api/installed-agents`. Returns a flat boolean
 * record keyed by agent scheme name (`claude` / `codex` / `cursor`) — this
 * shape pre-dates D22 and was always emitted bare (no `ok: true` wrapper).
 * The route stays flat post-RFC-9457 because the consumer
 * (`probeViaFetch`'s `obj[key] === true` check) reads each scheme directly.
 *
 * `.loose()` accommodates new schemes without forcing every existing
 * client to recompile.
 */
export const InstalledAgentsSuccessSchema = z.record(z.string().min(1), z.boolean()).meta({
  description:
    'Flat boolean record keyed by agent-scheme name (claude / codex / cursor). True = installed.',
});
export type InstalledAgentsSuccess = z.infer<typeof InstalledAgentsSuccessSchema>;
const _InstalledAgentsSuccessSchemaIsStandard: StandardSchemaV1<unknown, InstalledAgentsSuccess> =
  InstalledAgentsSuccessSchema;
void _InstalledAgentsSuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster G: LocalOp + auth handlers (US-012)
// ---------------------------------------------------------------------------
//
// Eight handlers: `handleLocalOpOpen`, `handleLocalOpAuthLogin`,
// `handleLocalOpAuthStatus`, `handleLocalOpAuthRepos`, `handleLocalOpAuthSignout`,
// `handleLocalOpAuthPat`, `handleLocalOpAuthIdentity`, `handleLocalOpAuthSetIdentity`.
// Login + repos are NDJSON streaming endpoints — the validated US-005 streaming
// pattern applies (pre-stream errors emit `application/problem+json`; mid-stream
// errors emit a typed `{ type: 'error', problem: ProblemDetails }` event).
// Identity / set-identity / open / signout / pat / status are non-streaming.

/**
 * Request body for `POST /api/local-op/open`.
 *
 * `dir` is the target project directory (`isSafeLocalPath` confines it to the
 * user's home directory; failure emits `urn:ok:error:invalid-request`
 * post-validation).
 */
export const LocalOpOpenRequestSchema = z
  .object({
    dir: z.string().min(1),
  })
  .loose();
export type LocalOpOpenRequest = z.infer<typeof LocalOpOpenRequestSchema>;
const _LocalOpOpenRequestSchemaIsStandard: StandardSchemaV1<unknown, LocalOpOpenRequest> =
  LocalOpOpenRequestSchema;
void _LocalOpOpenRequestSchemaIsStandard;

/**
 * Success body for `POST /api/local-op/open`. Flat shape per D22 — the client
 * uses the returned `port` to redirect into the freshly-spawned UI server.
 */
export const LocalOpOpenSuccessSchema = z
  .object({
    port: z.number().int().positive(),
  })
  .loose();
export type LocalOpOpenSuccess = z.infer<typeof LocalOpOpenSuccessSchema>;
const _LocalOpOpenSuccessSchemaIsStandard: StandardSchemaV1<unknown, LocalOpOpenSuccess> =
  LocalOpOpenSuccessSchema;
void _LocalOpOpenSuccessSchemaIsStandard;

/**
 * Request body shared by `POST /api/local-op/auth/{login,status,repos,signout}`.
 *
 * `host` is optional — defaults to `github.com` server-side. Empty / non-string
 * `host` falls back to the default (history of permissive coercion preserved
 * via `.optional()`).
 */
export const LocalOpAuthHostRequestSchema = z
  .object({
    host: z.string().min(1).optional(),
  })
  .loose();
export type LocalOpAuthHostRequest = z.infer<typeof LocalOpAuthHostRequestSchema>;
const _LocalOpAuthHostRequestSchemaIsStandard: StandardSchemaV1<unknown, LocalOpAuthHostRequest> =
  LocalOpAuthHostRequestSchema;
void _LocalOpAuthHostRequestSchemaIsStandard;

/**
 * Request body for `POST /api/local-op/auth/pat`. `pat` REQUIRED non-empty
 * (the PAT itself; piped to the CLI subprocess on stdin and never logged).
 * `host` defaults to `github.com`.
 */
export const LocalOpAuthPatRequestSchema = z
  .object({
    pat: z.string().min(1),
    host: z.string().min(1).optional(),
  })
  .loose();
export type LocalOpAuthPatRequest = z.infer<typeof LocalOpAuthPatRequestSchema>;
const _LocalOpAuthPatRequestSchemaIsStandard: StandardSchemaV1<unknown, LocalOpAuthPatRequest> =
  LocalOpAuthPatRequestSchema;
void _LocalOpAuthPatRequestSchemaIsStandard;

/**
 * Request body for `POST /api/local-op/auth/set-identity`. `name` and `email`
 * REQUIRED non-empty (after `.trim()` — empty-after-trim values fail schema
 * via `.refine`). The handler writes these to repo-local git config.
 */
export const LocalOpAuthSetIdentityRequestSchema = z
  .object({
    name: z.string().refine((s) => s.trim().length > 0, { message: 'name must be non-empty' }),
    email: z.string().refine((s) => s.trim().length > 0, { message: 'email must be non-empty' }),
  })
  .loose();
export type LocalOpAuthSetIdentityRequest = z.infer<typeof LocalOpAuthSetIdentityRequestSchema>;
const _LocalOpAuthSetIdentityRequestSchemaIsStandard: StandardSchemaV1<
  unknown,
  LocalOpAuthSetIdentityRequest
> = LocalOpAuthSetIdentityRequestSchema;
void _LocalOpAuthSetIdentityRequestSchemaIsStandard;

/**
 * Resolved git identity emitted by `GET /api/local-op/auth/identity`. `null`
 * when neither repo-local nor global git config carry a `user.name` /
 * `user.email`. Mirrors the runtime shape of `resolveGitIdentity()`.
 */
export const LocalOpAuthIdentitySchema = z
  .object({
    name: z.string().min(1),
    email: z.string().min(1),
  })
  .loose()
  .nullable();
export type LocalOpAuthIdentity = z.infer<typeof LocalOpAuthIdentitySchema>;
const _LocalOpAuthIdentitySchemaIsStandard: StandardSchemaV1<unknown, LocalOpAuthIdentity> =
  LocalOpAuthIdentitySchema;
void _LocalOpAuthIdentitySchemaIsStandard;

/** Success body for `GET /api/local-op/auth/identity`. Flat shape per D22. */
export const LocalOpAuthIdentitySuccessSchema = z
  .object({
    identity: LocalOpAuthIdentitySchema,
  })
  .loose();
export type LocalOpAuthIdentitySuccess = z.infer<typeof LocalOpAuthIdentitySuccessSchema>;
const _LocalOpAuthIdentitySuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  LocalOpAuthIdentitySuccess
> = LocalOpAuthIdentitySuccessSchema;
void _LocalOpAuthIdentitySuccessSchemaIsStandard;

/**
 * Success body for `POST /api/local-op/auth/status`. `authenticated` is the
 * load-bearing field; the CLI may emit additional fields (`login`,
 * `host`, …) which `.loose()` preserves. The handler returns the CLI's last
 * JSON line directly — schema is permissive to accommodate evolving CLI
 * output without lockstep migration.
 */
export const LocalOpAuthStatusSuccessSchema = z
  .object({
    authenticated: z.boolean(),
  })
  .loose();
export type LocalOpAuthStatusSuccess = z.infer<typeof LocalOpAuthStatusSuccessSchema>;
const _LocalOpAuthStatusSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  LocalOpAuthStatusSuccess
> = LocalOpAuthStatusSuccessSchema;
void _LocalOpAuthStatusSuccessSchemaIsStandard;

/**
 * Success body for `POST /api/local-op/auth/pat`. The CLI emits a `complete`
 * event on success carrying `login` (and optionally `name`, `email`,
 * `avatarUrl`); the handler returns the parsed line directly. Permissive
 * `.loose()` for the same reason as status.
 */
export const LocalOpAuthPatSuccessSchema = z
  .object({
    type: z.literal('complete').optional(),
    login: z.string().min(1).optional(),
  })
  .loose();
export type LocalOpAuthPatSuccess = z.infer<typeof LocalOpAuthPatSuccessSchema>;
const _LocalOpAuthPatSuccessSchemaIsStandard: StandardSchemaV1<unknown, LocalOpAuthPatSuccess> =
  LocalOpAuthPatSuccessSchema;
void _LocalOpAuthPatSuccessSchemaIsStandard;

/**
 * Success body for `POST /api/local-op/auth/signout` and
 * `POST /api/local-op/auth/set-identity`. Empty object — clients only branch
 * on HTTP status (200 = success). `.loose()` for forward-compat (e.g., a
 * future `signedOutAt: ISO` echo).
 */
export const LocalOpAuthEmptySuccessSchema = z.object({}).loose();
export type LocalOpAuthEmptySuccess = z.infer<typeof LocalOpAuthEmptySuccessSchema>;
const _LocalOpAuthEmptySuccessSchemaIsStandard: StandardSchemaV1<unknown, LocalOpAuthEmptySuccess> =
  LocalOpAuthEmptySuccessSchema;
void _LocalOpAuthEmptySuccessSchemaIsStandard;

// ---------------------------------------------------------------------------
// Cluster H: sync + seed handlers (US-013)
// ---------------------------------------------------------------------------
//
// Nine handlers: `handleSyncStatus`, `handleSyncTrigger`, `handleSyncSetEnabled`,
// `handleSyncConflicts`, `handleSyncResolveConflict`, `handleSyncConflictContent`,
// `handleSyncAbortMerge`, `handleSeedPlan`, `handleSeedApply`. All gated on
// `checkLocalOpSecurity` (loopback + Origin). Sync handlers are HTTP-only — no
// IPC mirror exists. Seed plan/apply are also IPC-mirrored (`ok:seed:plan` /
// `ok:seed:apply` on the desktop bridge); their HTTP fallback in `seedClient()`
// translates the RFC 9457 wire shape back to the in-process `OkSeedPlanResult` /
// `OkSeedApplyResult` discriminated unions so renderers don't branch by
// transport. The RFC 9457 path only carries the SUCCESS payload (`{plan}` /
// `{result}`); error kinds (`prerequisite-missing` / `invalid-root` / `internal`)
// arrive as URN tokens and are translated client-side.

/**
 * `SyncState` literal-union mirroring the in-process `SyncState` type from
 * `sync-engine.ts`. Sourced here so wire consumers (UI, CLI) can branch on
 * states without importing server-internal modules.
 */
export const SyncStateSchema = z.enum([
  'dormant',
  'idle',
  'fetching',
  'pulling',
  'pushing',
  'conflict',
  'offline',
  'auth-error',
  'disabled',
]);
export type SyncStateWire = z.infer<typeof SyncStateSchema>;
const _SyncStateSchemaIsStandard: StandardSchemaV1<unknown, SyncStateWire> = SyncStateSchema;
void _SyncStateSchemaIsStandard;

/**
 * Full sync engine status — emitted as the flat success body of
 * `GET /api/sync/status` AND as the nested `status` field of
 * `POST /api/sync/set-enabled`. Mirrors the in-process `SyncStatus` interface
 * in `sync-engine.ts`. `.loose()` for forward-compat (sync-engine may add
 * fields without a wire migration).
 */
export const SyncStatusSchema = z
  .object({
    state: SyncStateSchema,
    lastSyncUtc: z.string().nullable(),
    lastFetchUtc: z.string().nullable(),
    lastPushedSha: z.string().nullable(),
    ahead: z.number().int().min(0),
    behind: z.number().int().min(0),
    consecutiveFailures: z.number().int().min(0),
    conflictCount: z.number().int().min(0),
    hasRemote: z.boolean(),
    syncEnabled: z.boolean(),
    identityUnresolved: z.boolean(),
    error: z.string().optional(),
    pausedReason: z.string().optional(),
  })
  .loose();
export type SyncStatusWire = z.infer<typeof SyncStatusSchema>;
const _SyncStatusSchemaIsStandard: StandardSchemaV1<unknown, SyncStatusWire> = SyncStatusSchema;
void _SyncStatusSchemaIsStandard;

/** Success body for `GET /api/sync/status`. Wire shape IS the status object. */
export const SyncStatusSuccessSchema = SyncStatusSchema;
export type SyncStatusSuccess = SyncStatusWire;

/**
 * Request body for `POST /api/sync/trigger`. `op` is optional — server defaults
 * to `'sync'` when omitted. Pre-validation, the legacy handler accepted any
 * unknown shape and silently fell through to `'sync'`; the schema-validated
 * form rejects unknown `op` values explicitly with `urn:ok:error:invalid-request`.
 */
export const SyncTriggerRequestSchema = z
  .object({
    op: z.enum(['sync', 'push', 'pull']).optional(),
  })
  .loose();
export type SyncTriggerRequest = z.infer<typeof SyncTriggerRequestSchema>;
const _SyncTriggerRequestSchemaIsStandard: StandardSchemaV1<unknown, SyncTriggerRequest> =
  SyncTriggerRequestSchema;
void _SyncTriggerRequestSchemaIsStandard;

/**
 * Success body for `POST /api/sync/trigger`. Returns 202 Accepted with the
 * resolved `op` echo — the trigger runs in background.
 */
export const SyncTriggerSuccessSchema = z
  .object({
    op: z.enum(['sync', 'push', 'pull']),
  })
  .loose();
export type SyncTriggerSuccess = z.infer<typeof SyncTriggerSuccessSchema>;
const _SyncTriggerSuccessSchemaIsStandard: StandardSchemaV1<unknown, SyncTriggerSuccess> =
  SyncTriggerSuccessSchema;
void _SyncTriggerSuccessSchemaIsStandard;

/** Request body for `POST /api/sync/set-enabled`. */
export const SyncSetEnabledRequestSchema = z
  .object({
    enabled: z.boolean(),
  })
  .loose();
export type SyncSetEnabledRequest = z.infer<typeof SyncSetEnabledRequestSchema>;
const _SyncSetEnabledRequestSchemaIsStandard: StandardSchemaV1<unknown, SyncSetEnabledRequest> =
  SyncSetEnabledRequestSchema;
void _SyncSetEnabledRequestSchemaIsStandard;

/** Success body for `POST /api/sync/set-enabled`. Echoes the post-toggle status. */
export const SyncSetEnabledSuccessSchema = z
  .object({
    status: SyncStatusSchema,
  })
  .loose();
export type SyncSetEnabledSuccess = z.infer<typeof SyncSetEnabledSuccessSchema>;
const _SyncSetEnabledSuccessSchemaIsStandard: StandardSchemaV1<unknown, SyncSetEnabledSuccess> =
  SyncSetEnabledSuccessSchema;
void _SyncSetEnabledSuccessSchemaIsStandard;

/**
 * Single conflict entry shape. Mirrors `ConflictEntry` from
 * `conflict-storage.ts`. SHAs are optional because git can produce
 * delete/edit or add/add conflicts where some stages are missing.
 */
export const ConflictEntrySchema = z
  .object({
    file: z.string().min(1),
    detectedAt: z.string().min(1),
    oursSha: z.string().optional(),
    theirsSha: z.string().optional(),
    baseSha: z.string().optional(),
  })
  .loose();
export type ConflictEntryWire = z.infer<typeof ConflictEntrySchema>;
const _ConflictEntrySchemaIsStandard: StandardSchemaV1<unknown, ConflictEntryWire> =
  ConflictEntrySchema;
void _ConflictEntrySchemaIsStandard;

/** Success body for `GET /api/sync/conflicts`. */
export const SyncConflictsSuccessSchema = z
  .object({
    conflicts: z.array(ConflictEntrySchema),
  })
  .loose();
export type SyncConflictsSuccess = z.infer<typeof SyncConflictsSuccessSchema>;
const _SyncConflictsSuccessSchemaIsStandard: StandardSchemaV1<unknown, SyncConflictsSuccess> =
  SyncConflictsSuccessSchema;
void _SyncConflictsSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/sync/resolve-conflict`. `content` is required
 * iff `strategy === 'content'`; the schema accepts an optional `content` and
 * the handler asserts the conditional after schema parse (kept simple here
 * to avoid an over-narrowed Zod refinement; the handler-level check produces
 * a typed `urn:ok:error:invalid-request` if violated).
 */
export const SyncResolveConflictRequestSchema = z
  .object({
    file: z.string().min(1),
    strategy: z.enum(['mine', 'theirs', 'content']),
    content: z.string().optional(),
  })
  .loose();
export type SyncResolveConflictRequest = z.infer<typeof SyncResolveConflictRequestSchema>;
const _SyncResolveConflictRequestSchemaIsStandard: StandardSchemaV1<
  unknown,
  SyncResolveConflictRequest
> = SyncResolveConflictRequestSchema;
void _SyncResolveConflictRequestSchemaIsStandard;

/**
 * Success body for `POST /api/sync/resolve-conflict`. Empty — clients only
 * branch on HTTP status. `.loose()` for forward-compat.
 */
export const SyncResolveConflictSuccessSchema = z.object({}).loose();
export type SyncResolveConflictSuccess = z.infer<typeof SyncResolveConflictSuccessSchema>;
const _SyncResolveConflictSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  SyncResolveConflictSuccess
> = SyncResolveConflictSuccessSchema;
void _SyncResolveConflictSuccessSchemaIsStandard;

/**
 * Success body for `GET /api/sync/conflict-content?file=<path>`. Each stage
 * may be missing (delete/edit, add/add) — the handler tolerates by returning
 * empty strings rather than 404, so consumers always see all four fields.
 */
export const SyncConflictContentSuccessSchema = z
  .object({
    file: z.string().min(1),
    base: z.string(),
    ours: z.string(),
    theirs: z.string(),
  })
  .loose();
export type SyncConflictContentSuccess = z.infer<typeof SyncConflictContentSuccessSchema>;
const _SyncConflictContentSuccessSchemaIsStandard: StandardSchemaV1<
  unknown,
  SyncConflictContentSuccess
> = SyncConflictContentSuccessSchema;
void _SyncConflictContentSuccessSchemaIsStandard;

/**
 * Success body for `POST /api/sync/abort-merge`. Empty — clients branch on
 * HTTP status only. `.loose()` for forward-compat.
 */
export const SyncAbortMergeSuccessSchema = z.object({}).loose();
export type SyncAbortMergeSuccess = z.infer<typeof SyncAbortMergeSuccessSchema>;
const _SyncAbortMergeSuccessSchemaIsStandard: StandardSchemaV1<unknown, SyncAbortMergeSuccess> =
  SyncAbortMergeSuccessSchema;
void _SyncAbortMergeSuccessSchemaIsStandard;

/**
 * Success body for `GET /api/seed/plan`. The `plan` field is the in-process
 * `ScaffoldPlan` shape from `@inkeep/open-knowledge-server` — deliberately
 * unconstrained here (typed `unknown`) to avoid a parallel maintenance source
 * for the rich nested structure. Consumers re-cast via `OkScaffoldPlan` (the
 * canonical desktop-bridge type). The translation shim in `seedClient()`
 * converts the flat wire `{plan}` to the in-process `{ok: true, plan}`
 * discriminated union for shared consumption with the IPC bridge.
 *
 * The custom check forces presence — `z.unknown()` alone would accept
 * `{plan: undefined}` (i.e. a missing-key body), defeating the request/
 * response shape contract.
 */
export const SeedPlanSuccessSchema = z
  .object({
    plan: z.custom<unknown>((v) => v !== undefined, { message: 'plan is required' }),
  })
  .loose();
export type SeedPlanSuccess = z.infer<typeof SeedPlanSuccessSchema>;
const _SeedPlanSuccessSchemaIsStandard: StandardSchemaV1<unknown, SeedPlanSuccess> =
  SeedPlanSuccessSchema;
void _SeedPlanSuccessSchemaIsStandard;

/**
 * Request body for `POST /api/seed/apply`. Carries the `ScaffoldPlan`
 * returned by `/api/seed/plan` (or constructed offline). Same opaque
 * `unknown`-with-presence-check pattern as `SeedPlanSuccessSchema` —
 * `applySeed()` validates structurally during apply.
 */
export const SeedApplyRequestSchema = z
  .object({
    plan: z.custom<unknown>((v) => v !== undefined, { message: 'plan is required' }),
  })
  .loose();
export type SeedApplyRequest = z.infer<typeof SeedApplyRequestSchema>;
const _SeedApplyRequestSchemaIsStandard: StandardSchemaV1<unknown, SeedApplyRequest> =
  SeedApplyRequestSchema;
void _SeedApplyRequestSchemaIsStandard;

/**
 * Success body for `POST /api/seed/apply`. The `result` field is the
 * `ApplyResult` shape — same opaque `unknown`-with-presence-check pattern.
 * Translation shim turns this into `{ok: true, result}` for the in-process
 * discriminated union.
 */
export const SeedApplySuccessSchema = z
  .object({
    result: z.custom<unknown>((v) => v !== undefined, { message: 'result is required' }),
  })
  .loose();
export type SeedApplySuccess = z.infer<typeof SeedApplySuccessSchema>;
const _SeedApplySuccessSchemaIsStandard: StandardSchemaV1<unknown, SeedApplySuccess> =
  SeedApplySuccessSchema;
void _SeedApplySuccessSchemaIsStandard;
