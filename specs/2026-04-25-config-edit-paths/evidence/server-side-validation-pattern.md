---
name: server_side_validation_pattern
description: Defense-in-depth validation pattern for config writes — client-side gate (Modal walker) + server-side persistence-time validation + Y.Text revert-to-LKG on rejection
type: evidence
date: 2026-04-28
sources:
  - "session: 2026-04-28 release-pivot intake (Track 1)"
  - "packages/server/src/persistence.ts:740-870 (onStoreDocument hook structure)"
  - "packages/server/src/persistence.ts:746 (isSystemDoc short-circuit precedent)"
  - "evidence/_init_worldmodel.md (Track 3 — Hocuspocus has no atomic Y.Doc rollback on hook rejection)"
---

# Server-side validation pattern

## The user's question (Track 1)

> "Can we do special server side validation as well, with rejection or revert? Can we make sure that client side validation passes before we save to the server?"

Yes to both. The pattern is **defense-in-depth**: three validation layers, each independent, each with a defined failure mode.

## The three layers

### Layer 1 — Client-side gate (Modal walker)

**What:** The Zod walker in the Modal Settings UI validates every field commit *before* it touches Y.Text.

**Mechanism:** Per existing D10 ("Block writes while invalid"). The walker imports `ConfigSchema` from `@inkeep/open-knowledge-core`, computes the merged config from the user's pending change + current state, runs `ConfigSchema.safeParse(merged)`, and only commits to Y.Text if `result.success === true`. Invalid fields show inline errors and stay in dirty state.

**Failure mode:** Invalid commits never reach Y.Text. The user sees the failure inline instantly. No round-trip required.

**This is authoritative for normal user flows.** A correctly-built Modal never sends invalid YAML through Y.Text.

### Layer 2 — Headless writer validation (MCP / CLI)

**What:** MCP `set_config` and CLI `ok config validate` / `ok config migrate` import the same `ConfigSchema` and validate before fs writes.

**Mechanism:** `writeConfigPatch({ cwd, scope, patch })` (per `evidence/api-shape-typescript-not-rest.md`) parses the existing file, applies the patch via yaml@2, validates the merged document with Zod, and only writes on success. Returns `Result<{...}, ConfigValidationError>`.

**Failure mode:** Invalid patches return `result.ok === false` with structured errors. No fs write happens. The MCP tool returns `isError: true` to the agent; the CLI prints errors to stderr and exits 1.

**This is authoritative for agent + CLI flows.** A correctly-built tool never writes invalid YAML to disk.

### Layer 3 — Persistence-time validation hook (server-side, defense-in-depth)

**What:** Hocuspocus persistence's `onStoreDocument` hook (the same one that writes content `.md` files) gets a config-doc-specific path that revalidates Y.Text → YAML → `ConfigSchema.safeParse` before writing to disk.

**Mechanism:** Add a config-doc branch to `onStoreDocument` in `packages/server/src/persistence.ts`:

```ts
async onStoreDocument({ document, documentName, lastTransactionOrigin }) {
  if (isSystemDoc(documentName)) return;            // existing
  if (isConfigDoc(documentName)) {                  // NEW
    return handleConfigStore(document, documentName, lastTransactionOrigin);
  }
  if (isBatchInProgress()) return;                  // existing
  // ... existing markdown content path ...
}
```

`handleConfigStore` does:

1. Read current `Y.Text('source')` content
2. `yaml.parse(text)` → if syntactically invalid, REJECT
3. `ConfigSchema.safeParse(parsed)` → if invalid, REJECT
4. On success: atomic tmp+rename to disk, update LKG cache for this doc, return
5. On REJECT: do NOT write to disk; revert Y.Text via Y.Doc.transact (server-origin) using the last-known-good cached YAML; emit a CC1 'config-validation-rejected' broadcast with the error details

**Failure mode:** A malicious or buggy client that bypasses Layer 1 (e.g., raw Y.Text mutation via dev tools, ProseMirror plugin writing wrong shape, schema-version mismatch) gets caught here. The Modal sees the Y.Text revert via its observer, plus a CC1 toast notification ("Save failed: <reason>"). User's pending edit is preserved as a form-state dirty field; they can correct and retry.

**Why this needed:** Per `evidence/_init_worldmodel.md` Track 3, Hocuspocus's `onStoreDocument` does NOT atomically revert Y.Doc state on throw — that's an upstream limitation. We implement revert-to-LKG manually inside the hook by mutating Y.Text with a server-origin transaction. The Yjs delta propagates to all clients automatically.

## The LKG (last-known-good) cache

**Lifetime:** In-memory, per server instance. One entry per admitted config doc (`__config__/workspace`, `__user__/config.yml`).

**Initialization:** On `onLoadDocument` for a config doc, read the file from disk, validate with `ConfigSchema`, cache the validated YAML string. If the file fails to parse or validate at load time, fall back to schema defaults serialized via yaml@2 with a `# Auto-recovered from invalid config — original at config.yml.invalid-<timestamp>` comment block. Move the invalid file aside.

**Update:** Every successful Layer 3 validation updates the cache to the new YAML.

**Eviction:** When the doc is unloaded (no clients connected, debounce expired), the cache entry is GC'd.

**Concurrency:** The cache is read+written from inside the same `onStoreDocument` execution path, which is serialized by Hocuspocus per-doc — no lock needed.

## What client-side validation *cannot* prevent

Layer 1 + Layer 2 are correctness gates *for code we control*. Layer 3 catches:

- Direct Y.Text mutation via browser dev tools (rare but real for power users)
- Buggy client builds (a future Modal version that sends malformed patches)
- Schema-version drift (an old client connected to a new server with a tightened schema)
- Hand-edits to the YAML file mid-Hocuspocus-session (file watcher updates Y.Text → if invalid, persistence-time validation catches the round-trip)
- Non-OK writers writing to the file (e.g., a misbehaving editor extension, hand-edit that breaks YAML syntax)

The third case (schema-version drift) is the most realistic. With `z.looseObject` per existing D34, unknown fields pass through silently — so version drift mostly manifests as ignored fields, not validation failures. But a *type mismatch* (old client sends `{port: "5173"}` instead of `5173`) would fail validation, and Layer 3 catches it.

## Error envelope shape (TypeScript-only, not wire format)

```ts
export type ConfigValidationError =
  | { code: 'YAML_PARSE'; line?: number; col?: number; message: string }
  | { code: 'SCHEMA_INVALID'; issues: Array<{ path: (string|number)[]; message: string; code: string }> }
  | { code: 'SCOPE_VIOLATION'; field: string; allowedScopes: FieldScope[]; actualScope: FieldScope }
  | { code: 'WRITE_ERROR'; cause: string }
  | { code: 'UNKNOWN'; message: string };

export interface ConfigValidationErrorEnvelope {
  error: ConfigValidationError;
  /** Human-readable summary suitable for inline UI. */
  humanFormat(): string;
}
```

Used by:
- `ConfigBinding.patch()` (UI consumers)
- `writeConfigPatch()` (headless)
- The CC1 'config-validation-rejected' broadcast payload (Layer 3 → all open Modals)

## Implementation cost estimate

- **Layer 1:** Zero new code (D10 already commits to this; the Zod walker is the existing in-scope work).
- **Layer 2:** ~30 LoC for `writeConfigPatch` (yaml@2 parseDocument + setIn + safeParse + atomic write + Result return).
- **Layer 3:** ~40 LoC in `persistence.ts` config-doc branch + ~20 LoC for the in-memory LKG cache + ~10 LoC for the CC1 broadcast wiring. Plus the `isConfigDoc()` predicate (~5 LoC, sibling to `isSystemDoc()`).

Total spec-new server-side code: **~75-90 LoC.** Comparable to a single new HTTP route handler in the existing spec.

## Why this is better than HTTP-route validation

The existing spec's D32 (two-validator pattern) ran patch-payload + merged-document validation at the HTTP boundary. Under the pivot:

- We dropped the HTTP boundary entirely → no patch-payload validation needed (the patch IS in-process code).
- Layer 3 validates the merged document at persistence time — same purpose as D32's second validator, lower in the stack.
- Layer 1 + Layer 2 cover the equivalent of D32's first validator, but inline at the writer rather than at a boundary.

D32 collapses to **one effective validator** (merged-doc safeParse), called at three layers depending on entry point. The semantics are preserved; the boundary moved.

## Recommendation for the spec

Lock this as D45 (proposed):

> **D45 — Three-layer defense-in-depth validation.**
> - Layer 1: Modal Zod walker validates per-field commits before Y.Text writes (D10).
> - Layer 2: `writeConfigPatch()` validates merged config before fs writes (MCP/CLI/seed).
> - Layer 3: Hocuspocus `onStoreDocument` config-doc branch validates Y.Text → YAML → `ConfigSchema.safeParse` before disk; on rejection, reverts Y.Text via server-origin transaction using in-memory LKG cache and emits CC1 'config-validation-rejected'.
> - All three layers share `ConfigSchema` from `@inkeep/open-knowledge-core` and the `ConfigValidationError` discriminated union.

D45 supersedes D32's two-validator HTTP-boundary framing. D32 is retained for audit trail, marked SUPERSEDED.
