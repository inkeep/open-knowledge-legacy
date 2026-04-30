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
