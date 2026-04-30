---
date: 2026-04-30
sources: code (packages/server/src/api-extension.ts, packages/server/src/telemetry.ts, packages/server/src/boot.ts, packages/core/src/schemas/api.ts), CLAUDE.md
type: decision-grounding
applies-to: Q1, Q2, Q3, Q6 (Decision batch 1)
---

# Decision grounding — Batch 1 (Q6 → Q2 → Q1 → Q3)

## Q6 — Envelope migration scope (the gating decision)

### Migration math

| Metric | Count |
|---|---|
| Total HTTP handlers in `api-extension.ts` | **57** (`handleAgentWrite`, `handleAgentWriteMd`, `handleDocumentRead`, …, `handleSyncAbortMerge`) |
| Total `json(res, ...)` response sites | 331 |
| Total error-shape (`json(res, NNN, { ok: false, ...`) emit sites | **256** |
| 4xx/5xx response lines | ~270 |
| `handleUploadImage` error emit sites only | ~5-10 |

**Implication.** Full migration is ~256 sites across 57 handlers — a large mechanical change with broad regression surface. Upload-only is ~5-10 sites with minimal regression risk.

### Existing convergence-target precedents in repo

The codebase already has a "single source of truth + gradual migration" pattern under several names:

| Precedent | Signature | What it shows |
|---|---|---|
| `agent-write-summary.ts:2` | "Agent-write summary normalization — single truncation point" | Single helper, multiple call sites adopt over time |
| `auth-token-schema.ts:26` | "Schema IS the single source of truth" | Zod-as-SSOT for cross-process wire shape |
| `core/src/schemas/api.ts:7` | "single source of truth, no cross-process drift, no Node deps" | **2 schemas already live here for HTTP responses** (`ServerInfoResponseSchema`, `PrincipalResponseSchema`) — direct precedent for `UploadResponseSchema` location |
| `contributor-tracker.ts:77` | "single truncation point per D24" | Normalization-at-API-boundary pattern |

**`core/src/schemas/api.ts` is the canonical site for HTTP response Zod schemas.** Convention: `.loose()` at inner shapes for forward-compat, `z.infer` for derived types, JSDoc explains the wire-shape rationale. `UploadResponseSchema` belongs here (or a new sibling `upload.ts` if separation is preferred for size).

### Repo convention finding for IS1.a

**Existing repo convention is `.loose()` for forward-compat** (verified at `core/src/schemas/api.ts:54,92`). Cross-reference IS1.a's "strict server / loose client hybrid" recommendation conflicts — the hardening should follow established repo convention. Single schema, `.loose()` at inner objects, both server emission and client consumption use the same schema. This simplifies vs the cross-reference's hybrid suggestion and matches D6 (single schema export).

**Cascade implication:** SPEC.md §6 FR1 should specify `.loose()` at the inner `z.object` members; D6 rationale absorbs the convention.

## Q1 — `error.instance` source

### OTel state in default builds (verified)

`telemetry.ts:42`: `if (process.env.OTEL_SDK_DISABLED !== 'false') { return no-op; }`.

`boot.ts:203`: confirms default — `OTEL_SDK_DISABLED != 'false' (default — zero overhead when disabled)`.

**Default state = OTel SDK disabled = no trace context propagated.** OTel trace ID is empty (no-op meter / no-op span) in default builds. Relying on it for `error.instance` would mean the field is absent in production for nearly all installs.

### `crypto.randomUUID()` availability (verified)

Already used 4 places in repo with no import:
- `packages/server/src/config-persistence.ts:232`
- `packages/server/src/persistence.ts:969`
- `packages/core/src/config/write-config-patch.ts:136`
- `packages/core/src/utils/identity.ts:261`

**Available globally** in both Bun and Node 14.17+. Zero-cost addition.

### Implication

| Option | Default-build behavior | Cost | Verdict |
|---|---|---|---|
| Trace ID | Empty in default builds (OTel off) | Free in OTel-enabled, broken in default | **Reject** |
| Fresh UUID | Always populated, log-correlated via Pino | One `crypto.randomUUID()` per error emit | **Recommend** |
| Omit | Field absent from schema | None | Loses triage value |

**HIGH confidence call: fresh UUID per error emit.** OTel is disabled by default; trace-ID strategy fails silently in production.

## Q2 — `error.message` convention

Existing handler `error: 'string'` emits in `api-extension.ts` mix two styles (~50/50):

- **Kebab-code echo:** `'malformed-upload'`, `'storage-full'`, `'storage-readonly'`
- **English sentence:** `'Payload too large'`, `'Invalid docName'`, `'summary must be a string'`, `\`'${docName}' is a reserved document name\``

The new `error: { code, message, instance }` shape lets us split these two roles cleanly:

| Field | Role | Recommendation |
|---|---|---|
| `code` | Typed literal-union discriminator (FR2) | Kebab-case enum (`'malformed-upload'` etc.) |
| `message` | Display string for the human reading the failure | English sentence, may interpolate runtime values (`\`Document '${docName}' is reserved\``) |
| `instance` | Correlation ID | UUID per emit (Q1) |

This maps to RFC 9457's `type` (semantic discriminator) / `title` (short human-readable) / `instance` (correlation) without committing to RFC 9457 (NG2). Zero extra wire weight — same fields, cleaner roles.

**MEDIUM confidence:** there's a real choice between (i) `message` is always present, (ii) `message` is optional and defaults to humanized `code`. (i) is the common Stripe / Twilio convention.

## Q3 — Helper location (cascaded by Q6)

| Q6 outcome | Q3 cascade |
|---|---|
| **A — Upload-only** | Helper colocates in `api-extension.ts` as a closure over `errorResponse`; pattern documented in CLAUDE.md (Q9) for next routes to follow. Extract on 2nd consumer. |
| **B — Scaffolding (upload + 1 paradigmatic)** | Helper extracts to `packages/server/src/http/error-response.ts` immediately. Two consumers justify the file. |
| **C — Full migration** | Helper extracts to `packages/server/src/http/error-response.ts`. ~50 handlers import. |
| **D — Upload-only + meta-test guard** | Helper colocates; meta-test under `tests/integration/error-envelope-coverage.test.ts` enforces. Allowlist for legacy handlers; new routes auto-fail unless they import. |

## Q6 option summary (counter-proposals included)

| Option | Scope | LoC ~ | Pros | Cons |
|---|---|---|---|---|
| **A. Upload-only** | `handleUploadImage` only | ~10 | Smallest scope; matches user's "defensible cut" framing | G5 weak — neighbors are still old-shape |
| **B. Scaffolding** | Upload + `handleAgentWriteMd` | ~25-35 | Two examples create gravitational pull | Wider scope; touches active agent-write paths |
| **C. Full migration** | All 57 handlers, ~256 sites | ~200+ | Codebase-wide convergence | Spec scope balloons; possible regression on rarely-tested paths |
| **D. A + meta-test guard** | Upload-only + CI gate | ~10 + ~50 (meta-test) | Mechanical enforcement; no review burden for new routes | Allowlist for ~50 legacy handlers; meta-test maintenance overhead |

**Read:** Option **A** with explicit Q9 (CLAUDE.md note) is the cleanest cut. The CLAUDE.md addition acts as the forcing function for new routes (every agent session reads CLAUDE.md). Meta-test (Option D) is reasonable but trades small ongoing maintenance for an enforcement guarantee that review discipline + a STOP rule probably already provides for a 5-person team. **Option B** has merit if you'd rather show two examples vs one.

Recommendation: **A** with strong Q9 commitment.
