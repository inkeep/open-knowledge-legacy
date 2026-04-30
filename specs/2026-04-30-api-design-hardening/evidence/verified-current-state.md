---
date: 2026-04-30
sources: code (packages/app/src/editor/image-upload/index.ts:300-340, packages/app/src/editor/asset-dispatch/{dispatcher,registry,types}.ts, packages/server/src/upload-errors.ts, packages/server/src/api-extension.ts, packages/server/src/telemetry.ts), GitHub PR API (gh pr view)
type: verified-current-state
applies-to: §1, §6 FR6, §8, §13 IS3, §13 IS5, §14 risks
purpose: capture verified facts that correct claims in worldmodel/SPEC.md and ground Step 4 OQ extraction
---

# Verified current state — coherence corrections + grounding

Brief facts re-verified against `HEAD = fbfe9673` for Step 4 backlog extraction. Several worldmodel claims that flowed into SPEC.md §1/§8/§13 are imprecise.

## C1. Client parse pattern in `image-upload/index.ts`

**Claim in worldmodel + SPEC.md §1 / §8:** "client at `image-upload/index.ts:319` parses `e.message` substring back to `UploadWriteReason`-shaped value. NO compile-time link."

**Actual code (verified at line 323):**

```ts
// Lines 317-322 are JSDoc comments noting that server reasons populate `message`.
const message = body.message ?? body.error ?? `Upload failed (${res.status})`;
console.error('[uploadAndInsert] Server error:', message);
showError(editor, uploadId, message);
```

The client reads `body.message` OR `body.error` from the JSON envelope as a **display string**. There is **no** substring-to-reason parse, no typed-reason narrowing, no consumption of `UploadWriteReason` on the client at all. The typed `reason` exists only server-side; the wire crosses as an unstructured string and the client treats it as opaque.

The `UploadResponseBody` type the client uses (`upload-file.ts:60,100` and `index.ts:309`) is a hand-rolled `{ src?, message?, error?, deduped?, sha?, byteLength? }` lookalike — not derived from the server's typed class.

**Implication for IS5 framing:** The fix shape (Zod-derived `error.code` typed via `UploadResponseSchema`, client `safeParse` + narrow) is still correct and valuable, but the value proposition shifts. The hardening **introduces typed-reason consumption where none exists today**, rather than "removes a substring-parse." Net win is the same; the framing is sharper.

## C2. `AssetViewerLookupResult.found` callsite count (FR6 acceptance)

**Claim in SPEC.md §6 FR6 + §13 IS3:** "All 3 consumer sites … updated."

**Verified via grep** of `packages/app/src/editor/asset-dispatch/`:

| Site | Kind |
|---|---|
| `types.ts:91` | Type definition (`export type AssetViewerLookupResult = {found: true; viewer} \| {found: false}`) |
| `registry.ts:18` | Type import |
| `registry.ts:29` | Method signature on `AssetViewerRegistry.lookup(ext): AssetViewerLookupResult` |
| `dispatcher.ts:67` | The single consumer reads `lookup.found` |

So the rename touches **1 type definition, 1 type import, 1 method signature, 1 reader (`dispatcher.ts:67`)** — call it 4 sites if every textual occurrence counts; **1 consumer** if only `.found` reads count. The "3 consumer sites" wording implies 3 readers, which is wrong.

**Implication for IS3 risk:** Even simpler than scoped — TypeScript catches the lone reader on the rename. No mid-merge code surprises.

## C3. Correlation-ID landscape (informs Q1: what does `error.instance` carry?)

**Verified via grep of `randomUUID` / `crypto\.randomUUID` / `nanoid` / `requestId` / `request_id` in `api-extension.ts` + `telemetry.ts`:** zero hits. There is no existing per-request UUID in HTTP responses today.

**OTel trace propagation (CLAUDE.md observability section + `api-extension.ts:6321,6366`):** W3C `traceparent` is propagated; HTTP-initiated paths inherit it via `onRequest`. Each request has a `trace_id` / `span_id` already, threaded through Pino logs (CLAUDE.md "Pino logs carry `trace_id` / `span_id` for trace↔log correlation").

**Three viable shapes for `error.instance`:**

1. **OTel trace ID (16 hex chars / 32 with span)** — already present, already log-correlated, no new generation step. Cardinality bounded by request count. Field semantics: "this error's trace id, look it up in Tempo."
2. **Fresh UUID v4 per error** — independent of OTel; works when OTel SDK is disabled (`OTEL_SDK_DISABLED=true`, the default). Adds one `crypto.randomUUID()` call. Field semantics: "this is a server-side correlation token, look it up in Pino logs."
3. **Omit `instance` entirely until a triage use case names it** — keep the schema slot optional; defer.

**No prior precedent in this repo to lean on** — clean call.

## C4. PR sequencing assumptions (A1, A2 in SPEC.md §12)

**As of 2026-04-30 (today), `gh pr view` confirms:**

| PR | Title | State | Updated |
|---|---|---|---|
| #354 | typed-ipc-migration seed (FU-3) | OPEN, **draft** | 2026-04-28 |
| #380 | cb-v2 placeholder for canonical descriptors | OPEN | 2026-04-30 10:04 |
| #374 | mermaid canonical + KaTeX | OPEN | 2026-04-30 00:48 |
| #372 | math canonical + KaTeX | OPEN | 2026-04-30 00:41 |

**Implication for A1 (PR #354 sequencing):** Still draft, untouched for 2 days. The "before-or-roughly-alongside" hedge is weakening — A1's expiry trigger ("if it stalls or descopes, reopen NG5") may fire on the spec's own implementation timeline.

**Implication for A2 (PR #380/#374/#372):** All three OPEN, recently updated (today). Active, in-flight, but unmerged. A2 sequencing risk is real if any reviewer pause delays a merge past hardening implementation start.

## C5. Other handlers' error-envelope shape (informs Q6: scope of envelope migration)

**Verified count via grep of `{ ok: false, error: 'string' }` style emits in `api-extension.ts`:** ~20+ sites in `handleAgentWriteMd`, `handleAgentPatch`, `handleAgentUndo`, `handleCreatePage`, plus shorter handlers. Errors range from kebab-code-as-string (`'malformed-upload'`) to English sentences (`'Payload too large'`, `'Invalid docName'`, `'summary must be a string'`). The drift the spec called out in §1 is repo-wide, not just upload-local.

**Implication for G5 ("each new HTTP route can copy the canonical pattern"):** If only `handleUploadImage` migrates to `errorResponse` + Zod-typed error envelope, the next route author copying from the nearest neighbor is *just as likely* to copy from a `handleAgentWriteMd` neighbor as from `handleUploadImage`. The "canonical pattern" claim is weaker without breadth — but a wholesale agent-write migration is its own scope. Q6 surfaces this trade-off.
