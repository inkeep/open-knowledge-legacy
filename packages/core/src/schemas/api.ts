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
    ok: z.literal(true),
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
 * unlike `ServerInfoResponseSchema`. `handlePrincipal` returns the raw
 * `principal` record directly; `handleMetricsAgentPresence` follows the same
 * pattern. The `ok: true` envelope applies to endpoints that synthesize their
 * own response objects (`handleServerInfo`, `handleWorkspace`).
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
