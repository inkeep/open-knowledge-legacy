# CRDT-Direct Frontmatter Writes — Remove `/api/frontmatter-patch`

**Status:** spec
**Author:** Claude (autonomous, ack: Andrew)
**Date:** 2026-04-30
**Branch:** `edit-frontmatter` (worktree at `.claude/worktrees/edit-frontmatter`)
**Builds on:** PR #365 (per-key frontmatter migration)

## Problem

PR #365 ships a property panel that lets users edit frontmatter through a form. Form writes round-trip through a server HTTP handler (`POST /api/frontmatter-patch`) that authenticates the writer, validates the patch with Zod, and writes per-key entries to `Y.Map('metadata')` under a per-session origin. The CRDT layer then handles propagation as usual.

This is symmetric with how the **config.yaml** Settings pane works conceptually, but inconsistent with how it works mechanically. The Settings pane uses a pure CRDT path: `bindConfigDoc(provider).patch(deepPartial)` validates client-side against `ConfigSchema`, then writes Y.Text directly. No HTTP endpoint. Server-side L3 persistence hook validates again on the way to disk and reverts via `CONFIG_VALIDATION_REVERT_ORIGIN` if the write is bad, broadcasting `cc1:config-validation-rejected` so the originating client can toast and flash the affected field.

The frontmatter HTTP endpoint:

- **adds 400 lines of duplicate plumbing** (request parsing, identity extraction, type coercion, response envelope) that the CRDT path renders unnecessary;
- **bifurcates attribution** — the meta-test `attribution-sweep-coverage.test.ts` scans HTTP handlers; the same writer attributed via a connection origin is invisible to the sweep;
- **invents a per-field error shape** (`{ ok: false, error, fieldErrors }`) that exists nowhere else in the codebase;
- **has no MCP consumer today** (MCP frontmatter writes go through `/api/agent-write-md` or `/api/agent-patch`, both already migrated to direct CRDT in agent-sessions). The HTTP endpoint serves exactly one caller: `PropertyPanel.tsx`.

The config.yaml pattern is the proven, repo-canonical way to bind a form to a CRDT doc with full validation + cross-client error feedback. We adopt it for frontmatter.

## Goals

1. Delete `/api/frontmatter-patch` (handler, route entry, focused tests).
2. Migrate `PropertyPanel.tsx` to write through a new `bindFrontmatterDoc(provider)` binding.
3. Preserve existing user-visible behavior: per-key writes, atomic-reject-on-invalid-type, error toasts, undo through the per-session UndoManager, attribution to the connection's `principalId`.
4. Add an L3 server-side validation hook that mirrors the config-doc pattern: validate per-key writes against `FrontmatterValueSchema`, revert under a dedicated `FRONTMATTER_VALIDATION_REVERT_ORIGIN`, broadcast `cc1:frontmatter-validation-rejected` so the originating client can toast.
5. Update `attribution-sweep-coverage.test.ts` to remove `handleFrontmatterPatch` from `REQUIRED_HANDLERS`.

## Non-goals

- **MCP changes.** MCP doesn't consume this endpoint. The (commented-out) `update_frontmatter` MCP tool stays parked.
- **Schema evolution.** `FrontmatterValueSchema` / `FrontmatterPatchSchema` / `FRONTMATTER_TYPES` are unchanged.
- **New PropertyPanel features.** No new widgets, no reorder, no schema enforcement on user-defined property names beyond what the existing Zod schema enforces.
- **Refactoring `bindConfigDoc`** to share generic infrastructure with `bindFrontmatterDoc`. The two will be siblings; a unifying abstraction can come later if a third binding emerges.
- **Server-side validation parity for non-form writers.** Disk-mode load (`onLoadDocument` / `applyExternalChange`) and existing agent helpers already call `setFrontmatterFromYaml` which handles malformed YAML by returning false (no-op). The L3 hook is a defense-in-depth gate for **direct metaMap writes** that bypass `setFrontmatterFromYaml`.

## Acceptance criteria

### Client-side

- AC-C1. `bindFrontmatterDoc(provider)` returns `{ current, patch, subscribe, dispose }`. Signature mirrors `bindConfigDoc` modulo the patch type (`FrontmatterPatch` not `ConfigPatch`).
- AC-C2. `binding.patch(patch, types?)` validates against `FrontmatterPatchSchema` BEFORE any Y.Doc mutation. On failure, returns `Result.err({ code: 'SCHEMA_INVALID', issues })` and does not touch `Y.Map('metadata')`. On success, writes per-key entries (delete via `null`) inside one `doc.transact(fn, FORM_WRITE_ORIGIN)` block and returns `Result.ok({ appliedKeys })`.
- AC-C3. `binding.subscribe(listener)` fires on every `Y.Map('metadata')` deep change AND on provider `synced`. Returns an `Unsubscribe`.
- AC-C4. `binding.dispose()` detaches the metaMap observer and the provider listener; subsequent `patch()` calls return `Result.err({ code: 'WRITE_ERROR', detail: 'binding disposed' })`.
- AC-C5. `PropertyPanel.commitPatch` is replaced by `binding.patch`. The result is mapped to the existing `PatchResult` shape so the surrounding error/highlight machinery is unchanged. No `fetch` calls remain in `PropertyPanel.tsx`.
- AC-C6. `PropertyPanel` subscribes to the new CC1 channel `frontmatter-validation-rejected`. When a rejection event arrives for the active doc, the panel surfaces a toast equivalent to today's HTTP-error-mapped toast and flashes the affected key's row.

### Server-side

- AC-S1. `FORM_WRITE_ORIGIN` is exported from `packages/server/src/agent-sessions.ts` (or a new `packages/server/src/form-write-origin.ts` if cyclic). Shape: `{ source: 'local', skipStoreHooks: false, context: { origin: 'form-write' } }`. NOT paired (single-root writer touches only metaMap; Observer A must fire normally to recompose Y.Text).
- AC-S2. `FRONTMATTER_VALIDATION_REVERT_ORIGIN` is exported from a new `packages/server/src/frontmatter-edit-origin.ts`. Shape: `{ source: 'local', skipStoreHooks: true, context: { origin: 'frontmatter-validation-revert' } }`. NOT paired.
- AC-S3. The L3 frontmatter hook runs in `onStoreDocument` for non-config docs. On entry, it inspects the per-key metaMap state, validates each entry against `FrontmatterValueSchema`, and on any failure: (a) reverts the failed key to its previous valid value via `FRONTMATTER_VALIDATION_REVERT_ORIGIN` (or deletes the key if no prior valid value exists), (b) calls `ctx.onFrontmatterRejected?.(docName, error)`, and (c) returns a `'reverted'` outcome marker for telemetry.
- AC-S4. The hook is a no-op when the last transaction origin is `FRONTMATTER_VALIDATION_REVERT_ORIGIN` (revert→validate→revert loop guard, mirroring config L3).
- AC-S5. The hook is a no-op when no per-key changes occurred this transaction (compares against a per-doc validated-LKG cache analogous to `configLkgCache`, kept in `persistenceCtx`).
- AC-S6. `cc1Broadcaster.emitFrontmatterValidationRejected(docName, error)` is added with channel constant `CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED = 'frontmatter-validation-rejected'`. Payload schema: `{ v: 1, ch, seq, docName, error }`.
- AC-S7. `boot.ts` / `standalone.ts` wires `persistence.frontmatterRejectedCtx.onFrontmatterRejected` to `cc1Broadcaster?.emitFrontmatterValidationRejected(docName, error)`.

### Removal

- AC-R1. `handleFrontmatterPatch` function in `packages/server/src/api-extension.ts` is deleted.
- AC-R2. The `'/api/frontmatter-patch': handleFrontmatterPatch` entry in the routes object (around line 6206) is deleted.
- AC-R3. `packages/server/src/api-frontmatter-patch.test.ts` and `packages/server/src/api-frontmatter-patch-telemetry.test.ts` are migrated to test the binding + L3 hook + CC1 broadcast path. Test names rename to reflect the new surface (`bind-frontmatter-doc.test.ts` lives in `packages/core/src/bridge/` next to the binding; the integration-style "writer to converged disk" test stays under `packages/server/src/frontmatter-l3.test.ts`).
- AC-R4. `attribution-sweep-coverage.test.ts` removes `handleFrontmatterPatch` from `REQUIRED_HANDLERS`. No new entry is added — connection-origin writers don't show up in the HTTP-handler scan.
- AC-R5. The comment in `PropertyWidgets.tsx:7` referencing `/api/frontmatter-patch` is updated to reference the binding.

### Quality gates

- AC-Q1. `bun run check` passes (typecheck + biome + unit + integration + conversion + fidelity).
- AC-Q2. New unit test in `packages/core/src/bridge/bind-frontmatter-doc.test.ts`: invalid type → `Result.err`, no metaMap mutation. Valid patch → `Result.ok`, metaMap entries match.
- AC-Q3. New integration test in `packages/server/src/frontmatter-l3.test.ts`: a direct `metaMap.set('badkey', invalid)` triggers L3 revert AND `emitFrontmatterValidationRejected`.
- AC-Q4. New integration test (multi-client harness): two clients commit different property values to the same key concurrently; convergence to last-wins; both clients see the same final metaMap state.
- AC-Q5. The Playwright property-panel coverage (in `docs-open.e2e.ts` or a property-specific file already in this PR) still passes after migration — UX behavior identical.

### Non-regression

- AC-N1. Existing per-key Y.Map('metadata') write paths from agent-sessions, file-watcher, and observer-B are unaffected. They continue to use their existing origins (per-session, FILE_WATCHER_ORIGIN, OBSERVER_SYNC_ORIGIN) and are gated out of the L3 hook by origin check.
- AC-N2. Undo behavior: a form write committed via `binding.patch` can be undone via the per-session UndoManager (the form origin is tracked in `um.trackedOrigins`). This is the same as today's HTTP path, which writes under per-session `formOrigin`.

## Technical design

### Module layout

| File | Status | Purpose |
|---|---|---|
| `packages/core/src/bridge/bind-frontmatter-doc.ts` | NEW | Client binding (analogous to `bind-config-doc.ts`) |
| `packages/core/src/bridge/bind-frontmatter-doc.test.ts` | NEW | Unit tests for the binding |
| `packages/core/src/bridge/frontmatter-y.ts` | EXTEND | Add `deleteFrontmatterProperty(doc, key)` and (if needed) `renameFrontmatterProperty(doc, oldKey, newKey)` per-key helpers |
| `packages/server/src/frontmatter-edit-origin.ts` | NEW | `FRONTMATTER_VALIDATION_REVERT_ORIGIN` (mirrors `config-edit-origin.ts`) |
| `packages/server/src/agent-sessions.ts` | EXTEND | Export `FORM_WRITE_ORIGIN` constant for use by the binding's transact origin |
| `packages/server/src/persistence.ts` | EXTEND | Add `validateFrontmatterMap` + L3 hook in `onStoreDocument` (non-config branch); add `frontmatterLkgCache: Map<docName, FrontmatterMap>` to ctx |
| `packages/server/src/cc1-broadcast.ts` | EXTEND | Add `CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED` constant, payload schema, `emitFrontmatterValidationRejected` method |
| `packages/server/src/api-extension.ts` | DELETE | Remove `handleFrontmatterPatch` (lines 2407-2806) and `'/api/frontmatter-patch'` route entry (line 6206) |
| `packages/server/src/api-frontmatter-patch.test.ts` | DELETE | Replaced by `bind-frontmatter-doc.test.ts` + `frontmatter-l3.test.ts` |
| `packages/server/src/api-frontmatter-patch-telemetry.test.ts` | DELETE | Replaced by L3-hook telemetry assertions in `frontmatter-l3.test.ts` |
| `packages/server/src/frontmatter-l3.test.ts` | NEW | Integration test: direct metaMap write → L3 revert → CC1 broadcast |
| `packages/app/src/components/PropertyPanel.tsx` | EDIT | Replace `commitPatch` `fetch` with `binding.patch`. Subscribe to CC1 rejection channel. |
| `packages/app/src/components/PropertyWidgets.tsx` | EDIT | Update top-of-file comment to reference the binding |
| `packages/app/tests/integration/attribution-sweep-coverage.test.ts` | EDIT | Remove `handleFrontmatterPatch` from `REQUIRED_HANDLERS` |

### `bindFrontmatterDoc` API

```ts
// packages/core/src/bridge/bind-frontmatter-doc.ts

import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Result } from '../config/result.ts';
import {
  FrontmatterPatchSchema,
  type FrontmatterPatch,
  type FrontmatterMap,
  type FrontmatterValue,
} from '../frontmatter/schema.ts';
import {
  getFrontmatterMap,
  setFrontmatterProperty,
  deleteFrontmatterProperty,
} from './frontmatter-y.ts';

/** Origin marker the client uses for form writes. Must match the server-side
 *  `FORM_WRITE_ORIGIN` re-exported from `@inkeep/open-knowledge-server`. The
 *  binding hard-codes the structural shape (it can't import server code) and
 *  the server's `isFormWriteOrigin` predicate validates structurally. */
export const FORM_WRITE_ORIGIN_BROWSER = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: false,
  context: Object.freeze({ origin: 'form-write' }),
});

export interface FrontmatterBinding {
  current(): FrontmatterMap;
  patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult;
  subscribe(listener: (map: FrontmatterMap) => void): () => void;
  dispose(): void;
}

export type FrontmatterBindingPatchResult = Result<
  { appliedKeys: string[] },
  | { code: 'SCHEMA_INVALID'; issues: ConfigIssue[] /* reuse */ }
  | { code: 'WRITE_ERROR'; detail: string }
>;

export function bindFrontmatterDoc(
  provider: { document: Y.Doc; on: (event: string, handler: () => void) => void; off: ... },
): FrontmatterBinding {
  // ... see bind-config-doc.ts for the lifecycle pattern (observer + 'synced' + dispose)
}
```

The binding lives in `core` (not `app`) so it can be unit-tested against a bare `Y.Doc` without spinning up Hocuspocus, mirroring `bind-config-doc.ts`.

### `patch()` semantics

```
1. Parse `patch` against `FrontmatterPatchSchema`.
   - Failure → return Result.err({ code: 'SCHEMA_INVALID', issues }). No Y.Doc mutation.
2. doc.transact(() => {
     for each [key, value] in patch:
       if value === null:
         deleteFrontmatterProperty(doc, key);
       else:
         setFrontmatterProperty(doc, key, value);
   }, FORM_WRITE_ORIGIN_BROWSER);
3. Return Result.ok({ appliedKeys: keys(patch) }).
```

The legacy single-string `Y.Map('metadata').get('frontmatter')` slot mirror is maintained by Observer A on metaMap deep changes (existing behavior, US-004).

### Server-side L3 hook

Add to `onStoreDocument` in `persistence.ts`, in the non-config branch, before the existing serialize-to-disk path:

```
if (!isConfigDoc(documentName) && !isSystemDoc(documentName)) {
  const outcome = validateAndRevertFrontmatterIfBad(document, documentName, lastTransactionOrigin, ctx);
  if (outcome === 'reverted') {
    // Skip the disk write — a follow-up onStoreDocument will fire after the revert.
    return;
  }
  // 'no-op' or 'valid' → fall through to existing disk write
}
```

`validateAndRevertFrontmatterIfBad` is short:

1. If `lastTransactionOrigin === FRONTMATTER_VALIDATION_REVERT_ORIGIN` → no-op (loop guard).
2. Read the current `FrontmatterMap` via `getFrontmatterMap(doc)`.
3. Compare against `frontmatterLkgCache.get(documentName)`. If equal → no-op.
4. Validate each entry's value against `FrontmatterValueSchema`. If all pass:
   - Update LKG cache and return `'valid'`.
5. If any entry fails:
   - Build a detailed error: `{ code: 'SCHEMA_INVALID', issues: [{ key, message }, ...] }`.
   - Revert the bad keys to their LKG values inside `doc.transact(fn, FRONTMATTER_VALIDATION_REVERT_ORIGIN)`. Keys with no prior LKG entry are deleted.
   - Call `ctx.onFrontmatterRejected?.(documentName, error)`.
   - Return `'reverted'`.

The LKG cache is filled lazily — the first valid validation for a doc populates it. This means a brand-new doc can absorb a single bad-key write without an LKG to revert to: the hook deletes the bad key (clean state).

### CC1 broadcast wiring

```
// cc1-broadcast.ts (additions only)

export const CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED = 'frontmatter-validation-rejected' as const;

const CC1FrontmatterValidationRejectedPayloadSchema = z.object({
  v: z.literal(CC1_CONTRACT_VERSION),
  ch: z.literal(CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED),
  seq: z.number(),
  docName: z.string(),
  error: FrontmatterValidationErrorSchema, // narrow zod type — { code, issues: [{key, message}] }
});

emitFrontmatterValidationRejected(docName: string, error: FrontmatterValidationError): void {
  // structurally identical to emitConfigValidationRejected
}
```

`boot.ts` (or `standalone.ts`) wires the persistence ctx callback through:

```
persistence.frontmatterRejectedCtx = {
  onFrontmatterRejected: (docName, error) =>
    cc1Broadcaster?.emitFrontmatterValidationRejected(docName, error),
};
```

### Client subscription

```ts
// PropertyPanel.tsx

const subscribeToFrontmatterValidationRejected = useFrontmatterValidationRejected(provider);
useEffect(() =>
  subscribeToFrontmatterValidationRejected((event) => {
    if (event.docName !== docName) return;
    toast.error(humanFormatFrontmatterError(event.error));
    for (const issue of event.error.issues) {
      flashKey(issue.key);
    }
  }),
  [docName],
);
```

The `useFrontmatterValidationRejected` hook lives in `packages/app/src/hooks/`, modeled on `useConfigValidationRejected` in the Settings pane.

### Concurrency & undo

- **Multi-client convergence.** Two browsers patching the same key independently both write into the same metaMap slot. Y.Map.set is last-writer-wins on the per-key level (Yjs is value-replacing for primitives, structural for nested types). Verified by AC-Q4 integration test.
- **Undo.** The browser writes use `FORM_WRITE_ORIGIN_BROWSER`. The per-session UndoManager already includes any origin in `trackedOrigins` that was set when the session was created. To preserve undo, we either (a) extend per-session origin construction to include `FORM_WRITE_ORIGIN_BROWSER` in `trackedOrigins`, or (b) leave it out and accept that browser form writes don't enter the per-session undo stack (they're already user-driven; users undo via the panel UI). **Decision: (b)** — form widgets have their own undo affordances (Escape-to-revert, mentioned in the existing 8ef39e3e "fix(properties)" commit). Browser-side Cmd-Z on the panel is a non-goal.

### Headless / agent writes

Direct Yjs writes from server-side agent paths (already migrated to per-key in US-003/US-004) bypass the L3 frontmatter hook because they fire under per-session `session.origin` (paired) — not `FORM_WRITE_ORIGIN`. The hook is therefore a **form-write defense only**, not a universal validator. Agent writes are validated at the source (`setFrontmatterFromYaml` returns false on bad YAML; `setFrontmatterProperty` accepts only `FrontmatterValue`-typed inputs). This is the same posture as config: `bindConfigDoc` is L1, `writeConfigPatch` (headless) is L2, the persistence hook is L3 — three rings of defense, not one universal gate.

### Migration order (single PR but staged commits for review)

1. **Add primitives** — `bindFrontmatterDoc`, per-key `delete`/`rename` helpers, `FORM_WRITE_ORIGIN`, `FRONTMATTER_VALIDATION_REVERT_ORIGIN`. Tests for each. No removal yet.
2. **Add L3 hook + CC1** — wire validation in `persistence.ts`, add CC1 channel, integration test for the revert+broadcast path.
3. **Migrate PropertyPanel** — switch `commitPatch` to `binding.patch`. Subscribe to CC1 rejection. Verify Playwright still passes.
4. **Remove HTTP endpoint** — delete `handleFrontmatterPatch`, route entry, `api-frontmatter-patch.test.ts`, `api-frontmatter-patch-telemetry.test.ts`. Update attribution sweep test.
5. **Final pass** — comments updated, README/internals docs updated.

Each step is a commit. The whole sequence ships as one PR addition (continues PR #365).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| L3 hook accidentally reverts agent-session writes | Low | Origin check at entry: skip when origin is `OBSERVER_SYNC_ORIGIN`, any paired origin, `FILE_WATCHER_ORIGIN`, etc. Only validates non-paired form-origin writes (or unknown-origin writes — defense-in-depth). Test asserts the hook fires for direct `metaMap.set` only. |
| LKG cache grows unbounded | Low (small map of docName → FrontmatterMap) | Same as `configLkgCache` — bounded by # open docs in the server lifetime. Could prune on doc unload if needed. Not a concern at our scale. |
| Multi-client conflict produces toast on the wrong client | Medium | The CC1 broadcast goes to ALL clients; each client filters by `docName` and active state. Could add `originatingClientId` to the payload for stricter targeting. **Defer** — current behavior matches config and hasn't been flagged. |
| `attribution-sweep-coverage.test.ts` regresses (something silently bypasses attribution) | Medium | The sweep only catches HTTP handlers. Connection-origin writes are attributed via `resolveWriterFromOrigin` in persistence.ts; that resolver has its own coverage. Add a new meta-test `connection-origin-writer-coverage.test.ts` that asserts every `LocalTransactionOrigin` exported from server-side is either: (a) paired (agent + agent-undo), (b) classified by `resolveWriterFromOrigin` (file-watcher, upstream-import, form-write, etc.), or (c) explicitly EXEMPT. **Decision:** add this in a follow-up — not a blocker for this PR. |

## Open questions (resolved before implementation)

- **Q: Should `FORM_WRITE_ORIGIN` live in `core` or `server`?**
  A: Server-defined (per-session bundle) but the structural shape is mirrored in core's `bindFrontmatterDoc` as `FORM_WRITE_ORIGIN_BROWSER`. The L3 hook validates structurally (`origin.context.origin === 'form-write'`), not by reference equality, so the two objects are semantically the same writer.

- **Q: Does the binding need an L2 (headless) entry point analogous to `writeConfigPatch`?**
  A: No — there's no headless caller today. MCP doesn't write frontmatter through this path; agent-sessions does, and it has its own per-key write helpers. If a future headless caller emerges, add `writeFrontmatterPatch` then.

- **Q: How does `getFrontmatterMap` interact with the LKG cache when the doc loads from disk?**
  A: `onLoadDocument` populates `metaMap` from disk (existing behavior). The first L3 validation pass after load reads the resulting map and fills the LKG cache. Until then, the LKG is `undefined` and any failed validation deletes the bad key (as opposed to reverting to a prior value).

## Test cases

### Unit (`bind-frontmatter-doc.test.ts`)

- T-U1. Patch with valid types → returns `Result.ok({ appliedKeys })`, metaMap reflects entries.
- T-U2. Patch with invalid type (e.g., `{ count: 'not-a-number' }` against `FrontmatterValueSchema`'s number coercion rules) → returns `Result.err({ code: 'SCHEMA_INVALID' })`, metaMap unchanged.
- T-U3. Patch with `{ key: null }` → key removed from metaMap.
- T-U4. Reserved key `'frontmatter'` (the legacy slot mirror) → returns `Result.err({ code: 'SCHEMA_INVALID', issues: [...] })`.
- T-U5. Subscribe → fires on metaMap mutation. Unsubscribe → no further fires.
- T-U6. Dispose → patch returns `WRITE_ERROR`.

### Integration (`frontmatter-l3.test.ts`)

- T-I1. Direct `metaMap.set(doc, 'count', 'not-a-number')` (bypass binding) under no origin → L3 hook reverts (deletes key) and fires `onFrontmatterRejected`.
- T-I2. Form write under `FORM_WRITE_ORIGIN` with valid patch → L3 passes, LKG cache updated, no callback.
- T-I3. Form write with invalid value → L3 reverts to prior LKG; client receives CC1 broadcast.
- T-I4. Agent-session write (paired origin) with valid map → L3 hook origin-check skips (no validation, no LKG update).
- T-I5. Multi-client: client A patches `title=alpha`, client B patches `title=beta` concurrently → both clients converge to one of the two values; metaMap state matches across clients.

### E2E (existing Playwright)

- Existing property-panel E2E tests pass without modification (the wire format underneath PropertyPanel changes; the user-facing contract does not).

## Deliverables checklist

- [ ] `bindFrontmatterDoc` module + tests
- [ ] Per-key delete/rename helpers + tests
- [ ] `FORM_WRITE_ORIGIN` + `FRONTMATTER_VALIDATION_REVERT_ORIGIN`
- [ ] L3 hook in `persistence.ts` + LKG cache
- [ ] `validateFrontmatterMap` helper
- [ ] CC1 channel + `emitFrontmatterValidationRejected`
- [ ] `boot.ts` / `standalone.ts` wiring
- [ ] `PropertyPanel.tsx` migration
- [ ] CC1 subscription hook for the panel
- [ ] HTTP handler deletion + route deletion
- [ ] Test file deletions + replacements
- [ ] `attribution-sweep-coverage.test.ts` update
- [ ] `bun run check` green
- [ ] Documentation: update `packages/core/src/bridge/README.md` and `packages/server/README.md` with the new pattern; update `AGENTS.md` STOP/WARN if a new contract emerges
- [ ] Pushed to `origin/edit-frontmatter`
