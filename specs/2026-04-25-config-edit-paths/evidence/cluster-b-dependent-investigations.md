---
name: cluster_b_dependent_investigations
description: Investigation of NQ3 (LKG cold-start), NQ6 (revert origin), NQ10 (server-restart recovery), NQ13 (registry location), NQ14 (either-field write target), NQ15 (MCP fs-direct), NQ17 (seed/apply retarget) — seven dependent P0 questions
type: evidence
date: 2026-04-28
sources:
  - packages/cli/src/config/loader.ts (full, 183 lines)
  - packages/cli/src/config/schema.ts (importer audit context)
  - packages/cli/src/content/init.ts (CONFIG_YML_CONTENT template)
  - packages/cli/src/mcp/tools/edit-document.ts:1-120 (HTTP-wrapped MCP precedent)
  - packages/cli/src/mcp/tools/read-document.ts:1-160 (fs-direct MCP precedent)
  - packages/cli/src/mcp/tools/shared.ts:1-200 (resolveProjectServerContext helper)
  - packages/cli/src/mcp/tools/index.ts (registerAllTools)
  - packages/cli/src/auth/token-store.ts:80-134 (FileBackend write — auth-only secret pattern)
  - packages/server/src/server-observers.ts:51-128 (OBSERVER_SYNC_ORIGIN, PairedWriteOrigin, isPairedWriteOrigin)
  - packages/server/src/agent-sessions.ts:160-340 (per-session origin pattern, createSessionOrigin, applyAgentMarkdownWrite, applyAgentUndo)
  - packages/server/src/persistence.ts:600-727 (onLoadDocument with isSystemDoc gate)
  - packages/server/src/seed/apply.ts (full, 127 lines — Tim's #319 pattern)
  - packages/server/src/seed/starter.ts:100-110 (starterFolderRule helper)
  - packages/server/src/api-extension.ts:5445-5520 (handleSeedApply route)
  - packages/app/src/editor/provider-pool.ts:298-366, 642-910, 911-1020 (server-instance-mismatch handshake, branch-mismatch, ProviderPool surface)
  - packages/app/src/editor/client-persistence.ts (full, 160 lines — IndexeddbPersistence wrapper)
  - packages/core/package.json (Zod 4.3.6 dep, exports surface)
  - packages/core/src/index.ts (barrel)
  - reports/zod-v4-catalogs-registries/REPORT.md (singleton + monorepo dedup analysis)
  - specs/2026-04-25-config-edit-paths/SPEC.md (D43, D45, D47, D54 framing)
  - evidence/cluster-a-foundational-investigations.md (NQ1, NQ2 prereqs)
  - evidence/server-side-validation-pattern.md (D45 three-layer model, LKG cache)
  - evidence/cross-process-write-strategy.md (D46 LWW)
  - evidence/architectural-pivot-hocuspocus.md (D5 RESHAPE rationale)
---

# Cluster B — dependent investigations (NQ3, NQ6, NQ10, NQ13, NQ14, NQ15, NQ17)

Seven P0 questions that depend on Cluster A's foundations (admission, auth, schema migration, first-write, file-watcher, OTel) and resolve the operational details of the pivot. Each investigation cites file:line references so a reviewer can re-derive on demand.

---

## NQ3 — Persistence-hook LKG behavior on cold-start with invalid file

### What happens today (loader.ts:67-98)

`loadConfig(cwd?)` runs at server boot from `commands/start.ts`. Today's behavior on broken file:

1. **Syntactically invalid YAML** (parse exception): `loadYamlFile()` (loader.ts:50-65) catches the throw, emits `console.warn('[config] Failed to parse <path>: <err>')`, and **returns null**. The merged config falls through to user → defaults; **the broken workspace file is silently ignored.**
2. **Schema-fail (Zod safeParse fails)**: `loadConfig` (loader.ts:89-95) **throws** an `Error('Invalid configuration:\n...')` listing every issue path + message. The CLI bootstrapping (commands/start.ts → loader) **terminates the process**; `ok start` exits with the validation error printed.

So the existing semantics are split:
- Parse-fail: silent fallthrough (lossy — user's intent ignored).
- Schema-fail: hard crash at boot.

This is the cold-load behavior.

### What the pivot's persistence hook fires on

Per `evidence/server-side-validation-pattern.md` D45 Layer 3 + the `evidence/_init_worldmodel.md` Track 3 LKG cache initialization:

> **Initialization:** On `onLoadDocument` for a config doc, read the file from disk, validate with `ConfigSchema`, cache the validated YAML string. If the file fails to parse or validate at load time, fall back to schema defaults serialized via yaml@2 with a `# Auto-recovered from invalid config — original at config.yml.invalid-<timestamp>` comment block. Move the invalid file aside.

That's option A (recovery). Option B (block-and-error) was the alternative.

### Comparison vs `seed/apply.ts` (the closest precedent)

`packages/server/src/seed/apply.ts:91-119` writes folder entries to an existing config.yml:

```ts
const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
const doc = parseDocument(raw);

let folders = doc.get('folders');
if (!(folders instanceof YAMLSeq)) {
  folders = new YAMLSeq();
  doc.set('folders', folders);
}

for (const edit of edits) {
  (folders as YAMLSeq).add(edit.entry);
  applied += 1;
}

writeFileSync(configPath, doc.toString(), 'utf-8');
```

Note: `yaml@2`'s `parseDocument(raw)` does NOT throw on syntactically invalid YAML — it returns a `Document` with errors collected on `doc.errors`. The seed code never inspects `doc.errors`. **So seed/apply's behavior on a broken existing config is: "preserve the broken doc, append the new `folders[]` entry, re-serialize."** The re-serialization may or may not produce valid YAML depending on what was broken; `writeFileSync` doesn't validate.

This is **NOT a clean precedent** — it's tolerant rather than recovering. The existing seed code is silently appending to a broken file, leaving the broken parts unchanged. That's a different recovery model than D45 L3 wants.

### What option A vs option B means operationally

**Option A (recover + side-aside)**:
- Boot: `onLoadDocument('__config__/workspace')` → read file → `parseDocument` → if `doc.errors.length > 0` OR `ConfigSchema.safeParse(...)` fails → write fresh defaults (atomic tmp+rename) → move invalid file to `<contentDir>/.open-knowledge/config.yml.invalid-<ISO8601>` → emit `console.warn` + structured log event `config-cold-recovery` → populate Y.Text with the fresh defaults YAML.
- LKG cache after boot: defaults YAML (not the broken file).
- User experience: server starts. Settings pane opens normally with defaults. Some-OS-permission-quirk side effects only if rename fails; in that case fall back to in-memory-only LKG (don't sideline) and emit a louder warning.

**Option B (block + error)**:
- Boot: `onLoadDocument` → file invalid → populate Y.Text with the BROKEN content as-is. Settings pane opens with a top-level "Config file invalid" banner. All edits blocked (D45 L3 will reject every persistence cycle since merged YAML is still malformed). User must hand-edit the file to recover; the only way to restore a usable Settings pane is to fix the file first.

### Why option A wins

1. **Existing CLI semantics already auto-recovers parse-fail** (loader.ts:50-65 swallows parse errors). Option A extends that contract; option B inverts it.
2. **The pivot's whole point is "Settings pane = primary edit surface."** Option B forces the user back to a text editor — exactly what the pivot replaces.
3. **Side-aside preserves the original file for forensics.** A `.invalid-<timestamp>` sibling lets the user copy back any keys they hand-tuned. The user never silently loses data; the broken file is a click away.
4. **Schema-fail is the more common case than YAML-parse-fail.** A `theme: 'oops'` typo, a renamed-then-deprecated field, a copy-paste from the wrong scope — these are recoverable by stripping just the offending key. Forcing the user to hand-edit when the recovery is mechanical is bad UX.
5. **D45 L3's revert-to-LKG model assumes there's always an LKG.** If we adopt option B, the LKG is the broken YAML, and L3 reverts FROM valid back TO broken on every failed Y.Text write. Coherence breaks. Option A guarantees the LKG is always schema-valid by construction.
6. **Cold-load is the only moment when defaults can act as the LKG.** At runtime (after the first valid load), the LKG tracks the most-recent successful write. Cold-load with a broken file is the bootstrap case; defaults are the only sane initial value.

### Recommendation — Option A with a soft-fail variant

Adopt Option A. Specifically:

1. On `onLoadDocument` for a config doc:
   ```ts
   const raw = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : '';
   const doc = parseDocument(raw);
   const parsed = doc.toJS();
   const result = ConfigSchema.safeParse(parsed);
   if (doc.errors.length > 0 || !result.success) {
     await sidelineAndRecover(targetPath, raw, doc.errors, result);
     // populate Y.Text with the recovered defaults YAML
     const defaultYaml = serializeDefaults(scope);
     ytext.insert(0, defaultYaml);
     lkgCache.set(documentName, defaultYaml);
     return;
   }
   ytext.insert(0, raw);
   lkgCache.set(documentName, raw);
   ```

2. `sidelineAndRecover(targetPath, raw, parseErrors, schemaResult)`:
   - Atomic rename `targetPath → targetPath.invalid-<ISO8601>` (use `tracedRename`).
   - Atomic write fresh defaults (via `writeConfigPatch` with empty patch) to `targetPath`.
   - If rename fails (read-only fs, missing perms): keep the file in place but populate Y.Text with defaults; emit `config-cold-recovery-sideline-failed` log event so the user can investigate.
   - Emit `console.warn('[config] Recovered from invalid <path>; original moved to <sidelinedPath>. Validation issues: <count>.')`.

3. **Emit a CC1 `'config-validation-rejected'` broadcast** at boot if recovery fired — the Settings pane (when it opens) shows a toast: "Cold-recovered from invalid config; original at `<sidelinedPath>`. You can recover keys manually."

### Soft-fail variant — when sideline is impossible

For the rare case where rename fails (Docker volumes, read-only FS, NFS quirks):
- Don't crash boot.
- Don't populate Y.Text with broken content.
- Populate Y.Text with defaults.
- LKG = defaults.
- L3 will run normally; user edits land cleanly to a fresh defaults-on-disk file (overwriting the broken one on first commit, after a `rename` retry).
- Surfaced via the same toast.

### Confidence: HIGH

Triangulated through (a) existing loader.ts semantics for parse-fail (silent recovery), (b) schema-fail historic crash semantics (a problem the pivot inherits and should fix, not preserve), (c) coherence with D45 L3 LKG model, (d) user-direction "Settings pane is primary."

### Risks

- **R1.** Sideline-fail edge: if the user's filesystem disallows rename (rare), the broken file is overwritten in place by the recovery path. The user's pre-recovery content survives only in process memory (the `raw` string in `onLoadDocument`'s scope). **Mitigation**: log the full content of the broken file under structured debug logging at recovery time; user can reconstruct from logs.
- **R2.** A user might intentionally want to hand-edit and break the YAML temporarily (mid-edit). With option A, the next server reboot would silently sideline their work-in-progress. **Mitigation**: This is rare (file watcher already converges on save), and option A's behavior is consistent with existing parse-fail tolerance. If a user is hand-editing during boot, the structured log lets them recover from the sidelined file.
- **R3 (deferred).** "What happens if the user hand-edits the file mid-server-life and produces broken YAML?" That's NOT cold-start; that's the file-watcher path — covered separately by D45 L3 (parse on every Y.Text update; revert via LKG). Cold-start is bootstrap-only.

---

## NQ6 — Persistence-hook revert transaction origin marker

### Existing precedents

Per `packages/server/src/server-observers.ts:54-72` — `OBSERVER_SYNC_ORIGIN`:

```ts
export const OBSERVER_SYNC_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
} satisfies LocalTransactionOrigin;
```

Three load-bearing properties:
1. **Frozen object literal** (sealed semantics). Identity-based matching via `Set.has` / Y.UndoManager `trackedOrigins` requires the exact object reference (precedent #1).
2. **`skipStoreHooks: true`** — prevents observer → persistence → file-watcher → observer feedback loop. Same pattern as `FILE_WATCHER_ORIGIN` in `external-change.ts`.
3. **`context.origin: 'observer-sync'`** — debug/log signal; not used for matching.

Per `agent-sessions.ts:307-340` — `createSessionOrigin`:

```ts
function createSessionOrigin(sessionId, agentType?, principalId?, displayName?, colorSeed?) {
  const context: Record<string, unknown> & { origin: string; paired: true } = {
    origin: 'agent-write',
    paired: true as const,
    session_id: sessionId,
  };
  // ...append optional fields...
  Object.freeze(context);
  const origin: PairedWriteOrigin = {
    source: 'local',
    skipStoreHooks: false,  // agent writes DO want persistence
    context,
  };
  Object.freeze(origin);
  return origin;
}
```

Per-session origin: deep-frozen via `Object.freeze` on both context and outer; `paired: true` for Observer A/B short-circuit.

### Where revert-origin needs to fire

Per `evidence/server-side-validation-pattern.md` D45 L3:

> On REJECT: do NOT write to disk; revert Y.Text via Y.Doc.transact (server-origin) using the last-known-good cached YAML; emit a CC1 'config-validation-rejected' broadcast with the error details

The flow:
1. L3 fires inside `onStoreDocument` (or a sibling `handleConfigStore` helper).
2. Validation fails → take the LKG cached YAML.
3. Open a new transaction: `document.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, lkgYaml); }, CONFIG_VALIDATION_REVERT_ORIGIN)`.
4. The Yjs delta propagates to all connected clients automatically (via Hocuspocus's broadcast).
5. Client UIs see the revert via the Y.Text observer; their pending edit is now a "dirty form-state" (preserved client-side; server-side state is the LKG).

The key invariant: **the revert transaction MUST NOT re-trigger validation.** Otherwise the next validation would try to re-validate the LKG (which is by construction valid), succeed, and write to disk a SECOND time — racing whatever wrote-to-disk caused this revert in the first place. We need both:
- A `skipStoreHooks: true` to prevent persistence from firing on the revert (no disk write triggered by reverts).
- A gate at the top of L3 validation to short-circuit when the inbound transaction is `CONFIG_VALIDATION_REVERT_ORIGIN`.

### Proposed shape

**File**: `packages/server/src/config-persistence.ts` (NEW)

```ts
import type { LocalTransactionOrigin } from '@hocuspocus/server';

/**
 * Server-internal transaction origin for L3 validation revert writes.
 *
 * Identity-based matching: the persistence-hook validation gate compares
 * `transaction.origin === CONFIG_VALIDATION_REVERT_ORIGIN` (Set-identity
 * via WeakSet, OR direct === if the transaction came from this server
 * instance). When it matches, validation is skipped and persistence
 * does NOT trigger (`skipStoreHooks: true`).
 *
 * NOT paired-write — config docs have only Y.Text; no XmlFragment to
 * pair-mutate. The bridge bypass (D41) means PairedWriteOrigin's
 * Observer A/B short-circuit is not relevant for config docs.
 *
 * Frozen for identity stability (precedent #1).
 */
export const CONFIG_VALIDATION_REVERT_ORIGIN = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: true,
  context: Object.freeze({ origin: 'config-validation-revert' }),
}) satisfies LocalTransactionOrigin;
```

### The L3 entry-point gate

```ts
async function handleConfigStore(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: unknown,
): Promise<void> {
  // Short-circuit revert-origin updates: they're already LKG content,
  // re-validation would be a no-op tax that may race with a concurrent
  // user edit; persistence should NEVER run on reverts.
  if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) {
    return;
  }

  const ytext = document.getText('source');
  const yaml = ytext.toString();

  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (err) {
    revertToLkg(document, documentName, { code: 'YAML_PARSE', message: ... });
    return;
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    revertToLkg(document, documentName, { code: 'SCHEMA_INVALID', issues: ... });
    return;
  }

  // Success: atomic write to disk + update LKG cache
  await tracedWriteFile(...);
  await tracedRename(...);
  lkgCache.set(documentName, yaml);
}

function revertToLkg(document: Y.Doc, documentName: string, error: ConfigValidationError): void {
  const lkg = lkgCache.get(documentName);
  if (lkg === undefined) {
    // Should never happen: cache is populated at onLoadDocument (NQ3).
    // Defensive: emit critical log + continue without revert.
    console.error('[config-persist] LKG missing for', documentName);
    return;
  }
  document.transact(() => {
    const ytext = document.getText('source');
    ytext.delete(0, ytext.length);
    ytext.insert(0, lkg);
  }, CONFIG_VALIDATION_REVERT_ORIGIN);

  // CC1 broadcast (or Awareness ephemeral state) — open question per
  // worldmodel Track 3 unresolved item.
  cc1Broadcaster.signalConfigValidationRejected(documentName, error);
}
```

### `skipStoreHooks: true` is load-bearing

`onStoreDocument` is the canonical persistence hook. The reverting transaction itself triggers `onStoreDocument` (because Y.Text mutated). Without `skipStoreHooks: true`:
1. Revert fires → Y.Text mutated (now matches LKG).
2. `onStoreDocument` fires for the revert transaction.
3. The L3 gate (above) checks `lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN` → matches → returns early.
4. **No disk write happens (correct).**

Even though the gate covers us, `skipStoreHooks: true` is a belt-and-suspenders addition mirroring the precedent in `OBSERVER_SYNC_ORIGIN`. It prevents a future refactor that strips the gate from re-introducing the recursion bug.

### Paired-write registration?

Per the CLAUDE.md STOP rule: "Paired-write origins MUST declare `context.paired: true`." Config docs do NOT engage the markdown bridge (D41 — bridge bypass). They have only `Y.Text('source')`, no `Y.XmlFragment('default')`. So `CONFIG_VALIDATION_REVERT_ORIGIN` should NOT be a paired-write origin (`context.paired: true` would imply Observer A/B short-circuit, which is irrelevant — the bridge isn't running). Keep `CONFIG_VALIDATION_REVERT_ORIGIN` as a plain `LocalTransactionOrigin`.

This is consistent with the bridge bypass invariant: **config docs never participate in paired-write semantics.** Add a unit test that asserts `isPairedWriteOrigin(CONFIG_VALIDATION_REVERT_ORIGIN) === false`.

### Where the origin gets registered

The pattern in this codebase is: **paired-write origins are STRUCTURALLY checked, not registered**. `isPairedWriteOrigin(origin)` reads `origin.context?.paired === true` (server-observers.ts:124-128). So no central registry exists today; the origin's behavior is encoded in the origin's own shape.

For `CONFIG_VALIDATION_REVERT_ORIGIN`:
- **No paired-write registration needed.** It doesn't have `context.paired: true`, so `isPairedWriteOrigin` returns false; observer-bridge ignores it (irrelevant anyway since bridge is bypassed for config docs).
- **The L3 entry-point gate is the registration.** `if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return;` is the only consumer.
- **`skipStoreHooks: true`** is consumed by Hocuspocus internally (or by the equivalent custom `onStoreDocument` dispatch logic that respects the flag).

Document this in a STOP-rule comment colocated with `CONFIG_VALIDATION_REVERT_ORIGIN`'s definition, NOT in the cc1-broadcast.ts docs (the existing paired-write list there).

### Recommendation — formalize as D58 (proposed)

> **D58 — `CONFIG_VALIDATION_REVERT_ORIGIN` shape and gate.**
> Frozen `LocalTransactionOrigin` with `skipStoreHooks: true` and `context.origin: 'config-validation-revert'`. NOT a paired-write origin. The L3 persistence-hook (`handleConfigStore`) short-circuits at entry when `lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN`. The revert-write itself uses `document.transact(fn, CONFIG_VALIDATION_REVERT_ORIGIN)` with deep-frozen origin. Test: assert `isPairedWriteOrigin(CONFIG_VALIDATION_REVERT_ORIGIN) === false`.

### Confidence: HIGH

Pattern is a straight copy of `OBSERVER_SYNC_ORIGIN` (server-observers.ts:67-71) with a different `context.origin` string. The skipStoreHooks + entry-gate combo is the established defense pattern in OK.

### Risks

- **R1.** A future maintainer might add `paired: true` to `CONFIG_VALIDATION_REVERT_ORIGIN` thinking it should match paired-write semantics. The bridge bypass invariant means this is wrong. **Mitigation**: explicit STOP-rule comment + unit test (`isPairedWriteOrigin(CONFIG_VALIDATION_REVERT_ORIGIN) === false`).
- **R2.** Yjs's awareness/sync layer reconstructs `transaction.origin` from the wire payload for remote-peer transactions, but reverts originate ON the server, so they're always local-side. Identity-equality comparison `lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN` is sound for server-initiated reverts.

---

## NQ10 — Server-restart recovery for config Y.Doc state

### The risk in detail

Per the question framing:

> Modal opens → reads from IDB cache (`theme: dark` from yesterday) → server reloads with fresh disk config (`theme: light`) → IDB cache "wins" via Yjs merge until next server-instance-mismatch handshake.

This happens because:
1. y-indexeddb hydrates the Y.Doc from local IDB **before** the WebSocket sync delivers server state.
2. Yjs merges the IDB hydration into the synced state additively (CRDT — both sides' updates retained).
3. For Y.Text concurrent replace, **the IDB content can survive** until a `clearData` + recycle invalidates it.

For content docs, this is a feature: instant Cmd-R hydration, then sync converges. For config docs, the IDB cache holds a stale snapshot of YAML from the prior session; the user expects to see the file's current state, not yesterday's.

### How content docs handle this — the `server-instance-mismatch` handshake

`packages/app/src/editor/provider-pool.ts:789-1018` walks the recycle flow:

1. Tab cold-mount: every entry constructs an `IndexeddbPersistence` with name `ok-ydoc:${branch}:${docName}` (line 682-686).
2. Provider connects to Hocuspocus with `expectedServerInstanceId: cachedServerInstanceId` (line 657-661).
3. Server-side `onAuthenticate` (`standalone.ts:389-395`) compares `expectedServerInstanceId` against the live `serverInstanceId`:
   - Match → accept; sync proceeds; IDB hydration + server state union-merge cleanly (same instance).
   - Mismatch → throw `HocuspocusAuthRejection('server-instance-mismatch')` → client receives `authenticationFailed`.
4. Client-side handler (line 836-841) nulls `cachedServerInstanceId`, calls `handleServerInstanceMismatch`:
   - **Buffer**: per-doc, capture `computeUnsyncedUpdate(provider.document, baseline)` — the user's local pending edits.
   - **clearData**: every entry's `IndexeddbPersistence.clearData()` wipes the IDB.
   - **recycleAllEntries**: destroy + reopen with fresh providers; fresh providers connect with no `expectedServerInstanceId` claim → accepted; sync delivers canonical server state to empty Y.Doc + empty IDB.
   - **Replay**: on first `synced` event of fresh provider, `Y.applyUpdate(provider.document, buffered, TAB_REPLAY_ORIGIN)` re-applies the user's pending edits (line 875-902).

This handshake is the **complete defense for content docs.** It's what would also defend config docs IF they used IDB.

### Two viable shapes for config docs

**Shape (A) — y-indexeddb for config (parity with content)**:
- Config docs use `IndexeddbPersistence` keyed `ok-ydoc:${branch}:__config__/workspace` and `ok-ydoc:${branch}:__user__/config.yml` (or `~unscoped~` for user-global since branch is workspace-only).
- Same handshake: server-instance-mismatch → buffer + clearData + recycle.
- Pros: instant Settings-pane open after Cmd-R (no WS delay); consistent pattern across all docs.
- Cons: the staleness window described in the question IS real for the brief moment between cold mount and first server sync. Specifically: tab cold-mount → IDB hydration of stale `theme: dark` → Settings pane shows dark briefly → server sync delivers `theme: light` → re-renders. Sub-second flicker.

**Shape (B) — skip y-indexeddb for config docs (always re-fetch on connect)**:
- Config providers do NOT construct `IndexeddbPersistence`. The Y.Doc is always empty on cold mount.
- WebSocket sync delivers the server's state (from the LKG cache or fresh disk read at `onLoadDocument`).
- Pros: zero staleness window; user's first paint matches disk truth; eliminates the failure mode entirely.
- Cons: Settings pane shows a brief loading state during cold-mount (≈100-300ms WS handshake). Acceptable — Settings is rarely opened from cold; usually it's opened via Cmd-, which is a deliberate gesture in an already-loaded tab.

### Why Shape (B) wins

1. **Config doc traffic is tiny** (~few KB per scope). Re-fetching on every cold-mount has negligible bandwidth cost.
2. **Staleness > flicker.** The flicker in Shape (A) is brief but is exactly the failure mode we're trying to avoid. A user toggling theme expects visible accuracy.
3. **Config is per-machine, not collaborative.** y-indexeddb's value prop (instant hydration for collab editing in a team) doesn't transfer to config — there's no team here.
4. **Eliminates the cross-process invariant violation.** Workspace config is per-server-instance; cross-tab consistency comes via the file watcher path (D40-D41). User-global config has cross-process fan-out via the file watcher (NQ11). Adding IDB introduces a third source of truth — disk vs server-Y.Doc vs IDB — that the LKG model isn't designed for.
5. **Settings pane is rarely cold-mounted.** It's opened via Cmd-, etc. inside an already-loaded tab. The 100-300ms WS handshake is a deliberate-action latency cost; users don't notice a sub-second loader on a settings open.
6. **No new code path.** `bindConfigDoc(provider, scope)` per `evidence/api-shape-typescript-not-rest.md` constructs its own provider WITHOUT calling `createClientPersistence`. Mirrors the existing `SystemDocSubscriber` precedent (NQ1 evidence) — `__system__` also does NOT use IDB, and it works.

### Verification — does `__system__` use IDB today?

Per `evidence/cluster-a-foundational-investigations.md` NQ1: SystemDocSubscriber constructs `new HocuspocusProvider({ url, name: SYSTEM_DOC_NAME, document: doc, onStateless })` — no `IndexeddbPersistence` wrapper. The system doc is treated as ephemeral signal; IDB isn't useful for it.

Config docs sit in the same conceptual category: small, server-authoritative, file-backed. The `__system__` precedent says "skip IDB for these synthetic docs."

### What about server-instance-mismatch for config providers?

Without IDB, the buffer+clearData+recycle dance simplifies dramatically:
- `expectedServerInstanceId` claim still goes on the auth token (config providers reuse the cached `serverInstanceId` per the existing pattern).
- Server-side mismatch → `authenticationFailed` event on client → handler reconstructs the provider WITHOUT clearData (no IDB to clear) and without buffer-replay (no unsynced edits worth preserving — the user's pending Settings edit is held in form-state, not in Y.Text).
- Practically: the existing `handleServerInstanceMismatch` path can run unchanged; the `clearData` step is a no-op (no persistence attached); the buffer step finds zero unsynced bytes because Y.Text is wiped on recycle.

### Recommendation — formalize as D59 (proposed)

> **D59 — Skip y-indexeddb for config Y.Doc state.**
> `bindConfigDoc(provider, scope)` constructs `HocuspocusProvider` directly without `createClientPersistence`. Cold-mount Y.Doc is always empty until WebSocket sync delivers the server's authoritative state (from LKG or fresh `onLoadDocument`). Mirrors `__system__` precedent (system doc also bypasses IDB). Eliminates the IDB-stale-vs-disk-fresh staleness window. Server-instance-mismatch handshake still applies (auth-token claim → mismatch → recycle), but the buffer + clearData steps are no-ops for config providers. Settings pane shows a brief loading state on cold-mount (≈100-300ms); acceptable for a deliberate-action surface.

Add a STOP rule: **"Config providers MUST NOT use IndexeddbPersistence."** Enforce in `bindConfigDoc` by not exposing a configuration to opt in.

### Confidence: HIGH

Triangulated through (a) `__system__` precedent (no IDB), (b) the ProviderPool handshake's complexity (which we avoid), (c) D45 LKG model's "server is authoritative" framing.

### Risks

- **R1.** If Settings pane cold-mount latency is user-visible (e.g., user opens Settings, sees a 200ms blank), polish via a skeleton state in the pane. Cheap.
- **R2.** A future "offline config edit" feature would need IDB. Out of scope for v0; if needed, the bind shape can opt in via a `{ persist: 'idb' }` flag at that time. Additive.
- **R3.** Branch-mismatch handshake (provider-pool.ts:853): the config provider's `expectedBranch` claim should still match the server's `getActiveBranch()` to prevent cross-branch IDB bleed — but since there's no IDB, the only consequence of a branch mismatch is a fresh provider connection. Effectively a no-op recovery. Document but no work needed.

---

## NQ13 — `fieldRegistry` ownership location

### Where ConfigSchema lives post-pivot (NQ4 from cluster A)

Per cluster A: `ConfigSchema` migrates to `@inkeep/open-knowledge-core` (D44). `fieldRegistry` is the metadata-attachment surface that goes hand-in-hand with the schema (D43, D47).

### Why core is the natural home

1. **Co-location with the schema.** `fieldRegistry.add(schema, meta)` is called inline at schema-definition time (`reports/zod-v4-catalogs-registries/REPORT.md` Dimension 2). Putting `fieldRegistry` in core lets the schema definitions reference it without crossing package boundaries.
2. **Shared by all consumers.** Walker (Modal), loader (CLI), MCP `set_config` allowlist (CLI), persistence-time validator (server) — all need the registry to read field metadata. Core is the only package all four can import without circular deps.
3. **JSON Schema export is registry-aware.** `z.toJSONSchema(schema, { metadata: fieldRegistry })` per the Zod report. SchemaStore export must read the registry; if the registry lives in cli, the export tool (also in cli) imports trivially; if it lives in core, the export tool imports from core. Either works.

### The singleton concern — is it real?

Per the question:

> verify the singleton pattern is robust under bun's monorepo workspace deduping (would two different package versions get two different registries?).

This is a real failure class to investigate. Let me reason through it:

**Bun's deduping for `workspace:*`**: In a monorepo with `"@inkeep/open-knowledge-core": "workspace:*"` in package.jsons, bun resolves all sites to the SAME directory (the `packages/core/`). Module caching is by absolute path; one process imports `@inkeep/open-knowledge-core/index` and gets one module instance. The `fieldRegistry` const declared in `core/src/config/registry.ts` is initialized once per process. Every consumer (cli, server, app) that imports it gets the same `WeakMap` instance.

**Cross-package version mismatch**: If `desktop` declared a dep on `@inkeep/open-knowledge-core@0.2.0` while the workspace ships `0.3.0`, bun *might* resolve to two different node_modules directories. In OK, every internal package uses `"workspace:*"` (per CLAUDE.md convention), so this can't happen for our packages. **External consumers** (no such consumer exists post-pivot — core is private per the package.json `"private": true`) couldn't trigger this either.

**Worktree gotcha** (CLAUDE.md): "Worktrees nested at `.claude/worktrees/X/` inherit `node_modules` via Bun's upward-walk resolution, causing ProseMirror-model dedup failures." For schema, this is the same risk — if a worktree has a stale `node_modules/@inkeep/open-knowledge-core` from a different version. Mitigation: the existing `bun install` in worktree workflow already addresses ProseMirror; same mitigation for `fieldRegistry`.

**globalThis fallback (Zod's pattern)**: Zod v4's `z.globalRegistry` uses `globalThis.__zod_globalRegistry` as a CJS/ESM-safety net (`reports/zod-v4-catalogs-registries/REPORT.md` Dimension 1). For `fieldRegistry`, this pattern can be borrowed: define the registry as

```ts
const REGISTRY_KEY = Symbol.for('@inkeep/open-knowledge:config-field-registry');
type GlobalWithRegistry = typeof globalThis & { [k: symbol]: $ZodRegistry<FieldMeta> | undefined };
const g = globalThis as GlobalWithRegistry;
export const fieldRegistry: $ZodRegistry<FieldMeta> =
  g[REGISTRY_KEY] ?? (g[REGISTRY_KEY] = z.registry<FieldMeta>());
```

This guarantees a singleton even under module-duplication scenarios. Belt-and-suspenders defense.

### Sibling-package alternative — rejected

Putting `fieldRegistry` in a sibling package (e.g., `@inkeep/open-knowledge-config-meta`) would:
- Add a new package to the monorepo.
- Force schema-definition sites in core to import from the sibling — circular if the sibling also imports schema types.
- Provide no upside over the core-with-symbol-singleton approach.

### Recommendation — formalize as D60 (proposed)

> **D60 — `fieldRegistry` lives in `@inkeep/open-knowledge-core` as a Symbol-keyed globalThis singleton.**
> One singleton per process; all consumers (Modal walker, loader, MCP set_config allowlist, persistence-time validator) reuse the same instance. Defense against module-duplication via Symbol.for-keyed globalThis attachment (mirrors Zod v4's `z.globalRegistry` pattern). Adding a sibling registry is a STOP rule violation — there is exactly one canonical registry.

Export shape (in `packages/core/src/config/registry.ts`):
```ts
import { z } from 'zod';

export interface FieldMeta {
  scope: 'user' | 'workspace' | 'either';
  agentSettable: boolean;
  defaultScope?: 'user' | 'workspace';
  // future: deprecation, displayLabel, helpText, ...
}

const REGISTRY_KEY = Symbol.for('@inkeep/open-knowledge:config-field-registry');
type WithRegistry = typeof globalThis & { [k: symbol]: z.$ZodRegistry<FieldMeta> | undefined };

const g = globalThis as WithRegistry;
export const fieldRegistry: z.$ZodRegistry<FieldMeta> =
  g[REGISTRY_KEY] ?? (g[REGISTRY_KEY] = z.registry<FieldMeta>());
```

Re-export from `packages/core/src/index.ts` barrel.

### STOP rule wording

> **STOP — One `fieldRegistry` per process.** Never declare `z.registry<FieldMeta>()` outside `packages/core/src/config/registry.ts`. All schema-meta declarations import the singleton via `import { fieldRegistry } from '@inkeep/open-knowledge-core'`. Sibling registries silently bypass the walker, the loader's scope check, and the MCP allowlist gate — they are unsafe by construction.

### Confidence: HIGH

Triangulated through (a) Zod's own globalThis-Symbol pattern (the upstream precedent), (b) bun's `workspace:*` resolution semantics (deterministic single-instance for our internal packages), (c) the worktree gotcha mitigation already in place via `bun install` workflow.

### Risks

- **R1.** A consumer in another monorepo (hypothetical OSS user pulling `@inkeep/open-knowledge-core` via npm) gets a different `globalThis` — the Symbol key still binds to that process's globalThis, so still one singleton per process. No risk.
- **R2.** Hot-reload in dev mode might re-execute the registry module, but the Symbol-keyed lookup short-circuits the second initialization. Existing entries persist across reloads. Slightly stale metadata is the worst case (and only if the schema definition changed shape). Acceptable.
- **R3.** Test isolation: tests that mutate the registry would leak state across test files in the same process. **Mitigation**: tests should `fieldRegistry.clear()` in `beforeEach` if they mutate state, or use a local registry just for the test (the global one stays untouched).

---

## NQ14 — `scope: 'either'` fields default-write target

### The framing

User direction (D54): Settings pane has User and Workspace sub-tabs. When the user edits an `'either'` field in a particular tab, the write goes to that scope. Explicit, deterministic.

The unresolved case: **MCP `set_config` from an agent has no scope context.** The agent calls `set_config({patch: {appearance: {theme: 'dark'}}})` — what scope does the server pick?

### The existing algorithm (D25, formalized)

Per SPEC.md line 1061 (D25), for the agent-facing MCP tools (no `scope` parameter exposed):

> Algorithm (2-tier ladder per D27 deferral): `inspectConfig(path).workspace ?? inspectConfig(path).user ?? schema.meta.defaultScope ?? 'user'` — most-specific-already-set scope wins (workspace → user-global), with the field's `defaultScope` as fallback when unset everywhere (final fallback `'user'` if no `defaultScope` declared).

Simplified:
1. **If workspace explicitly sets the field** → write to workspace.
2. **Else if user explicitly sets the field** → write to user.
3. **Else use the field's `defaultScope` metadata** → if `'workspace'`, write to workspace; if `'user'`, write to user.
4. **Final fallback** → `'user'`.

### Does D43/D47 change this?

D47 says `defaultScope` is now **one field of the registry's metadata, not the only field.** The shape of the metadata becomes:

```ts
interface FieldMeta {
  scope: 'user' | 'workspace' | 'either';      // legality constraint
  agentSettable: boolean;                       // MCP allowlist gate
  defaultScope?: 'user' | 'workspace';          // inference hint for 'either' fields
}
```

For `scope: 'user'` fields, `defaultScope` is irrelevant (the field can ONLY land at user). For `scope: 'workspace'` fields, similarly. For `scope: 'either'` fields, `defaultScope` is the inference hint when no explicit value is set.

D25's algorithm survives intact under D47, but the metadata source changed: `schema.meta.defaultScope` becomes `getFieldMeta(schema).defaultScope` (walker-based lookup via the registry).

### What about the `scope: 'user'` / `scope: 'workspace'` constraint?

D47 makes `scope` a hard constraint. So for the algorithm:
1. If `scope: 'user'` → write to user (regardless of any `defaultScope` or current workspace value).
2. If `scope: 'workspace'` → write to workspace.
3. If `scope: 'either'` → run D25's most-specific-already-set ladder.

Rejecting illegal placements: if a workspace config.yml on disk contains a `scope: 'user'` field, the loader emits a source-located error (D47); the field is ignored at runtime. So `inspectConfig(path).workspace` will return `undefined` for `scope: 'user'` fields after loader scrubbing. The ladder still works correctly.

### Existing precedence chain for context (loader.ts:67-98)

```ts
// Layer 1: user config
const userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME);
let merged: Record<string, unknown> = {};
const userConfig = loadYamlFile(userConfigPath);
if (userConfig) merged = deepMerge(merged, userConfig);

// Layer 2: workspace config
const workspaceConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME);
const workspaceConfig = loadYamlFile(workspaceConfigPath);
if (workspaceConfig) merged = deepMerge(merged, workspaceConfig);

// Validate with Zod (applies defaults for missing fields)
const result = ConfigSchema.safeParse(merged);
```

This is the **read** chain. For write, `inspectConfig(path)` returns the disk state at each layer:

```ts
inspectConfig('appearance.theme') === {
  workspace: undefined,             // not set in workspace
  user: 'dark',                     // set in user-global to 'dark'
  defaultValue: 'system',           // schema default
}
```

`set_config({patch: {appearance: {theme: 'light'}}})` runs the algorithm:
1. `inspectConfig('appearance.theme').workspace` → `undefined` → skip.
2. `inspectConfig('appearance.theme').user` → `'dark'` → matches → write to user.

If both are unset:
3. `getFieldMeta(appearance.theme).defaultScope` → `'user'` (per the user_outcomes.md table) → write to user.

If `defaultScope` is unset:
4. Fallback → `'user'`.

### Edge case — patches mutate multiple fields in one call

If a single `set_config({patch: {...}})` mutates fields with different inferred scopes (e.g., workspace-pinned `folders[]` and user-only `appearance.theme`), the server must split the patch into per-scope writes:

```ts
function inferScopePerLeaf(patch: DeepPartial<Config>, current: Config): Map<Path, Scope> {
  const targets = new Map<Path, Scope>();
  for (const leaf of flattenPaths(patch)) {
    targets.set(leaf, inferScope(leaf, current));
  }
  return targets;
}
```

Then split:
```ts
const byScope = groupByScope(targets);
if (byScope.workspace) await writeConfigPatch({cwd, scope: 'workspace', patch: byScope.workspace});
if (byScope.user) await writeConfigPatch({cwd, scope: 'user', patch: byScope.user});
```

Two atomic writes, one per scope. Both succeed or one fails atomically (we don't roll back the first; document that in MCP response).

For v0 simplicity and to keep `set_config`'s contract clear, **REJECT mixed-scope patches** with `MIXED_SCOPE` error. Force the agent to call `set_config` twice if they need to mutate both scopes. This avoids the partial-success edge case entirely.

### Recommendation — D25 algorithm survives, formalize as D61 (proposed)

> **D61 — `'either'`-field write-target inference for headless writers (MCP/CLI/seed) follows D25's ladder under D47's metadata.**
>
> Algorithm:
> 1. For each leaf path in the patch, look up `getFieldMeta(schema).scope`.
> 2. If `scope: 'user'` → target `'user'`.
> 3. If `scope: 'workspace'` → target `'workspace'`.
> 4. If `scope: 'either'`:
>    a. `inspectConfig(path).workspace !== undefined` → target `'workspace'` (most-specific-already-set wins).
>    b. Else `inspectConfig(path).user !== undefined` → target `'user'`.
>    c. Else `getFieldMeta(schema).defaultScope` (may be `'user'` or `'workspace'`).
>    d. Else `'user'` (universal fallback).
> 5. **Reject mixed-scope patches** with structured `MIXED_SCOPE` error. The MCP tool's response surfaces which paths inferred which scope; the agent retries with one scope per call.

### Where it's enforced

- **MCP `set_config`** (FR-6, post-pivot): fs-direct via `writeConfigPatch`. Tool reads `cwd` from the call context, builds `currentConfig` via `loadConfig(cwd)`, runs the inference per leaf, and either splits into one `writeConfigPatch` call or errors with `MIXED_SCOPE`.
- **CLI `ok config migrate`** (out of scope for inference; codemod targets explicit scope).
- **Modal Settings pane**: user-driven; explicit scope from current tab. Inference NOT used.
- **Theme toggle button** (chrome): `userBinding.patch({...})` with explicit `scope: 'user'`. Inference NOT used.

### Confidence: HIGH

D25's algorithm is well-precedented (VS Code `Configuration.update` `deriveConfigurationTargets`, source cited in spec D25). D47's metadata move is mechanical; the algorithm reads from a different metadata source but otherwise unchanged.

### Risks

- **R1.** `MIXED_SCOPE` rejection requires the agent to make two calls. Annoying but explicit. Document with examples in the tool description.
- **R2.** A user-error case: agent sets `appearance.theme` (defaultScope: `'user'`) at workspace because it WAS already set there (most-specific-already-set wins). The agent may not realize. **Mitigation**: tool response includes `scope: 'workspace'` in the structured output, and `current` reflects the merged state. Agent can detect.
- **R3.** Algorithm changes if D27 ever ships `.local.yml` — three-tier ladder. Additive (insert local-tier check at top); no break.

---

## NQ15 — MCP `set_folder_rule` removal of HTTP wrapper

### Existing MCP tool patterns

Per `cli/src/mcp/tools/`:

**HTTP-wrapped tools** (most): `edit_document`, `write_document`, `rename_document`, `rollback_to_version`, `save_version`, `get_backlinks`, `get_forward_links`, `get_dead_links`, `get_history`, `get_orphans`, `get_hubs`, `list_documents`, `suggest_links`. All call `httpPost(url, '/api/...', body)` after `resolveProjectServerContext`. Reject with `HOCUSPOCUS_NOT_RUNNING_ERROR` if `url` is undefined.

**Fs-direct tools** (some): `read_document` reads `readFile(abs, 'utf-8')` from `<cwd>/<relPath>`. Uses `resolveProjectServerContext` to get the cwd + config, but does NOT require the server to be running for the file read itself (only the `enrichPath` enrichment uses the optional `serverUrl`, falling back gracefully). Other fs-direct: `exec` (runs commands directly), `consolidate` / `research` / `ingest` (workflow tools that orchestrate by invoking other MCP tools).

**Hybrid tools** (mostly fs-direct): `preview-url.ts` reads `realpathSync` to find lock files; `search.ts` (would need verification — likely combines fs + HTTP for indexes).

### How fs-direct tools resolve cwd + config

Per `shared.ts:172-200` `resolveProjectConfigContext`:

```ts
export async function resolveProjectConfigContext(
  resolveCwd: (explicit?: string) => Promise<string>,
  config: ConfigOrResolver,
  explicitCwd?: string,
): Promise<{ ok: true; cwd: string; config: Config } | { ok: false; error: string }> {
  const cwd = await resolveCwd(explicitCwd);
  const resolvedConfig = await resolveConfig(config, cwd);
  return { ok: true, cwd, config: resolvedConfig };
}
```

This is the **fs-only resolver** — no server URL involved. Tools that only need fs access call this; `read_document` actually upgrades to `resolveProjectServerContext` to opportunistically use the server (for backlinks/etc.) but its core fs-read works without one.

For `set_folder_rule` post-pivot, the structure mirrors `read_document`'s pattern: resolve cwd + config from the tool's call context (no server needed), then call `applyFolderRulesUpsert` (which itself calls `writeConfigPatch` per the pivot).

### Proposed shape

**File**: `packages/cli/src/mcp/tools/set-folder-rule.ts` (NEW)

```ts
import { z } from 'zod';
import { applyFolderRulesUpsert } from '@inkeep/open-knowledge-core';
import { resolveProjectConfigContext, textPlusStructured, textResult, ROUTED_CWD_DESCRIPTION } from './shared.ts';
import type { ConfigOrResolver, ServerInstance } from './shared.ts';

const FolderRuleInputSchema = z.object({
  match: z.string(),
  frontmatter: z.record(z.unknown()).optional(),
  new_match: z.string().optional(),
});

export const DESCRIPTION = [
  '[Operates on disk; no server needed] Upsert one or more folder rules in the workspace `config.yml`.',
  '',
  'Always pass `rules` as an array, even for a single rule. Transactional all-or-nothing — if any rule fails validation, no rules are applied.',
  // ... full description per spec §9.7.2 ...
].join('\n');

interface SetFolderRuleDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
}

export function register(server: ServerInstance, deps: SetFolderRuleDeps): void {
  server.tool(
    'set_folder_rule',
    DESCRIPTION,
    {
      rules: z.array(FolderRuleInputSchema).min(1),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config, args.cwd);
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd } = context;

      // No httpPost. No HOCUSPOCUS_NOT_RUNNING_ERROR. Direct fs write.
      const result = await applyFolderRulesUpsert({ cwd, scope: 'workspace', rules: args.rules });
      if (!result.ok) {
        return textResult(`Validation failed: ${humanFormat(result.error)}`, true);
      }
      return textPlusStructured(
        `Upserted ${args.rules.length} folder rule(s).`,
        { ok: true, applied: result.appliedPaths, current: result.effective },
      );
    },
  );
}
```

### Why fs-direct works without `ok start`

The MCP server (stdio process) is **separate from `ok start`** (the Hocuspocus server). The MCP stdio server starts on agent connection (Claude Code, Cursor, etc.) and runs independently. It can:
1. Read `cwd` from its own process (or from the agent's tool call argument).
2. Load config via `loadConfig(cwd)` — pure node:fs read, no server needed.
3. Write config via `writeConfigPatch({cwd, scope, patch})` — pure node:fs write + atomic rename.
4. The file watcher on a running `ok start` (if any) detects the disk change and updates Y.Text → live UIs refresh.

If no `ok start` is running, the MCP write still succeeds. The user just doesn't see the change reflected live; their next `ok start` boot picks it up. **This is the intended decoupling per the pivot.**

Compare with `edit_document`: that one MUST go through the WebSocket because its target IS Y.Text in a live Y.Doc; without the server, there's no live state to mutate. Config is the inverse — the disk file is the source of truth, the live Y.Doc is a derived view.

### applyFolderRulesUpsert location

Per the pivot:
- `applyFolderRulesUpsert` is a Node-compatible function in `@inkeep/open-knowledge-core` (alongside `writeConfigPatch`).
- It internally calls `writeConfigPatch` after read-modify-(append/replace/rename) on the `folders[]` array.

Confirm in spec §9.7.2 / D38: spec line 1074 says "The `applyFolderRulesUpsert` server-side helper and the `set_folder_rule` MCP tool stay — both call into `writeConfigPatch`." So the helper relocates to core (Node-only export); the MCP tool wraps it.

### What about the pre-existing `applyFolderRulesUpsert` route?

Pre-pivot (existing SPEC D38 + FR-6b): server helper in `packages/server/src/config-edit.ts` + HTTP route `POST /api/config/folders/upsert` + MCP tool that wraps the HTTP route.

Post-pivot: the HTTP route DROPS (NG13). The helper relocates to `@inkeep/open-knowledge-core` (since core hosts `writeConfigPatch`). The MCP tool wraps the helper directly.

### Recommendation — formalize as D62 (proposed)

> **D62 — `set_folder_rule` MCP tool is fs-direct via `applyFolderRulesUpsert` from core. No HTTP, no server requirement.**
>
> Resolution:
> - `applyFolderRulesUpsert(opts: {cwd, scope, rules})` lives in `@inkeep/open-knowledge-core` (sibling to `writeConfigPatch`); reads cwd's workspace config, applies rule upserts (find-or-append-or-rename in the `folders[]` array), writes via `writeConfigPatch({cwd, scope, patch: {folders: [...]}})`.
> - MCP tool `set_folder_rule` wraps `applyFolderRulesUpsert` directly. Uses `resolveProjectConfigContext` (NOT `resolveProjectServerContext` — no server needed).
> - Tool description opens with `[Operates on disk; no server needed]` so agents understand the contract.
> - Live UIs refresh via the file watcher, IF a server is running. The MCP write doesn't depend on a server being live.

This becomes the precedent for any future fs-direct MCP tool. Document the shape in a comment at the top of `set-folder-rule.ts`.

### Confidence: HIGH

`read_document` is the pattern proof: fs-direct read with optional server enrichment. `set_folder_rule` flips it to fs-direct write. `resolveProjectConfigContext` (no server) is already exported and tested.

### Risks

- **R1.** A user without `ok start` running might be confused about why the change "didn't show in the editor." **Mitigation**: the tool description explicitly says "Live UIs refresh via the file watcher when a server is running; otherwise the change is visible on next boot."
- **R2.** Concurrent writes from multiple processes (MCP + CLI both editing): D46 LWW applies. Acceptable.
- **R3.** Permissions: MCP runs as the user; can write to workspace `<cwd>/.open-knowledge/config.yml` only if the user owns it. Same trust boundary as `read_document`.

---

## NQ17 — Existing seed/apply.ts retarget under D5 RESHAPE

### Tim's #319 pattern (full source read above)

`packages/server/src/seed/apply.ts:83-119`:

```ts
const editsByConfig = new Map<string, ConfigEdit[]>();
for (const edit of plan.configEdits) {
  const list = editsByConfig.get(edit.configPath) ?? [];
  list.push(edit);
  editsByConfig.set(edit.configPath, list);
}

for (const [configPath, edits] of editsByConfig) {
  try {
    const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
    const doc = parseDocument(raw);

    let folders = doc.get('folders');
    if (!(folders instanceof YAMLSeq)) {
      folders = new YAMLSeq();
      doc.set('folders', folders);
    }

    for (const edit of edits) {
      (folders as YAMLSeq).add(edit.entry);
      applied += 1;
    }

    writeFileSync(configPath, doc.toString(), 'utf-8');
  } catch (err) {
    for (const edit of edits) {
      errors.push({ path: `${configPath}#${edit.folderMatch}`, error: ... });
    }
  }
}
```

The patch shape for each edit is `{configPath, entry: FolderRule, folderMatch}` (per `seed/types.ts:60-70`), where `entry` is the full `FolderRule`. Apply iterates `edits`, appends each `entry` to `folders[]`, and writes once per configPath.

### Mapping to `writeConfigPatch`

Per the pivot, `writeConfigPatch({cwd, scope, patch})` accepts a `DeepPartial<Config>` where the `folders` field can be a complete array. So:

```ts
// Map seed/apply's per-config-path append-loop to writeConfigPatch:
for (const [configPath, edits] of editsByConfig) {
  // Determine cwd + scope from configPath
  const { cwd, scope } = inferScopeFromConfigPath(configPath);

  // Read current folders[], append new entries
  const currentConfig = loadConfig(cwd).config;
  const currentFolders = currentConfig.folders ?? [];
  const newFolders = [...currentFolders, ...edits.map((e) => e.entry)];

  // Write via writeConfigPatch (atomic, validating, single round-trip)
  const result = await writeConfigPatch({
    cwd,
    scope,
    patch: { folders: newFolders },
  });

  if (!result.ok) {
    for (const edit of edits) {
      errors.push({ path: `${configPath}#${edit.folderMatch}`, error: humanFormat(result.error) });
    }
  } else {
    applied += edits.length;
  }
}
```

The patch shape `{folders: newFolders}` maps cleanly. **One semantic difference**: `writeConfigPatch` validates the merged document; if any `entry` is malformed (e.g., missing required `match` field per FolderRuleSchema), the entire batch fails. Tim's existing code silently writes malformed entries. **The new code is stricter — that's a feature, not a regression.**

### `inferScopeFromConfigPath` helper

Seed today emits `configPath` as an absolute path like `<cwd>/.open-knowledge/config.yml`. We can derive scope by comparing:
- If `path.dirname(configPath) === resolve(cwd, '.open-knowledge')` → scope: `'workspace'`.
- If `path.dirname(configPath) === resolve(homedir(), '.open-knowledge')` → scope: `'user'`.

Seed only writes workspace configs today (per `seed/plan.ts`'s `configEdits` generation), so the simple case is `scope: 'workspace'`. The helper is defensive against future seed extensions.

### Seed-specific concerns

**(1) Does it bypass the file watcher?**

Seed runs server-side via `POST /api/seed/apply` (api-extension.ts:5445-5520). The handler invokes `applySeed(plan, { projectDir: contentDir })`. The atomic write inside `applySeed` triggers the file watcher's normal flow:

- File watcher fires `change` event on `<contentDir>/.open-knowledge/config.yml`.
- Per the pivot, the workspace config watcher (NQ11) detects this change → updates Y.Text in `__config__/workspace` → all open Settings panes refresh.

So seed does NOT bypass the watcher. Good — that means seed's writes flow through the same observable channel as MCP/CLI/UI edits. **This is correct under the pivot.**

**(2) Does it write before any Hocuspocus admission?**

Today: `applySeed` is called from `POST /api/seed/apply` AFTER the server has booted. Hocuspocus is already running. The config doc may or may not be admitted at that point depending on whether someone has connected (admission is lazy via `openDirectConnection` per cluster A NQ1). In the pivot, config docs are pre-materialized at boot (per NQ1 — `openDirectConnection` for `__config__/workspace` and `__user__/config.yml` in `standalone.ts:1246`-style admission), so by the time seed runs, the doc IS admitted.

If seed somehow runs BEFORE Hocuspocus admits the config doc (race during boot), the behavior degrades gracefully:
- `writeConfigPatch` writes to disk regardless of Hocuspocus state (it's a node:fs operation with atomic rename).
- File watcher will detect the write later when Hocuspocus admits the doc.
- The cold-load path (`onLoadDocument`) reads the post-seed disk content directly, getting seed's contributions naturally.

**(3) Self-write detection via writeTracker?**

`writeConfigPatch` should register the written content hash in the file watcher's `writeTracker` (file-watcher.ts:85-105) before doing the atomic rename, so the watcher's `change` event detects it as self-write and skips the Y.Text update path. Otherwise:

- `writeConfigPatch` writes to disk.
- File watcher sees `change` → reads file → updates Y.Text in `__config__/workspace`.
- Persistence layer's `onStoreDocument` fires (because Y.Text changed) → tries to write the same content to disk again → no-op (content matches). Wasted cycle, no harm.

Adding the writeTracker registration avoids the wasted cycle. NQ8 / NQ11 from cluster A already cover this.

### Migration mechanical change

Replace the inner loop body in `seed/apply.ts:83-119`:

**Before**:
```ts
for (const [configPath, edits] of editsByConfig) {
  try {
    const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
    const doc = parseDocument(raw);
    let folders = doc.get('folders');
    if (!(folders instanceof YAMLSeq)) {
      folders = new YAMLSeq();
      doc.set('folders', folders);
    }
    for (const edit of edits) {
      (folders as YAMLSeq).add(edit.entry);
      applied += 1;
    }
    writeFileSync(configPath, doc.toString(), 'utf-8');
  } catch (err) {
    /* error handling */
  }
}
```

**After**:
```ts
for (const [configPath, edits] of editsByConfig) {
  const { cwd, scope } = inferScopeFromConfigPath(configPath, projectDir);
  const result = await applyFolderRulesUpsert({
    cwd,
    scope,
    rules: edits.map((e) => ({ match: e.entry.match, frontmatter: e.entry.frontmatter })),
  });
  if (!result.ok) {
    for (const edit of edits) {
      errors.push({ path: `${configPath}#${edit.folderMatch}`, error: humanFormat(result.error) });
    }
  } else {
    applied += edits.length;
  }
}
```

This delegates entirely to the new `applyFolderRulesUpsert` (which itself calls `writeConfigPatch`), reusing the same pattern as MCP `set_folder_rule`. **Mechanical change**, ~15 lines deleted, ~10 lines added.

### Tests already cover this

`packages/server/src/seed/apply.test.ts:32, 52, 67-78` exercise the apply flow. They check:
- Folders written to disk (assertion against `readFileSync(configPath)`).
- Idempotence on empty plan.
- Error envelope shape.

After the migration:
- Disk-content assertion still works (writeConfigPatch writes the same file).
- Idempotence still works (empty rules → no writeConfigPatch call → no errors).
- Error shape changes from `ApplyError[]` to a richer `ConfigValidationError`-mapped form. Tests need a small update.

### Recommendation — formalize as D63 (proposed)

> **D63 — `seed/apply.ts` retargets to `applyFolderRulesUpsert`.**
> The per-configPath append-loop in `seed/apply.ts:83-119` is replaced with a single call to `applyFolderRulesUpsert({cwd, scope: 'workspace', rules})` per configPath group. The shape `{folders: [...]}` maps cleanly. Validation is now stricter (Zod safeParse on merged) — malformed `entry` shapes that previously slipped through now reject at write time. Tests update accordingly. File watcher path is unchanged (atomic write triggers normal change event); no separate seed-bypass needed. Hocuspocus admission of config docs at boot guarantees the doc is materialized by the time seed runs (if not, the cold-load path picks up seed's writes naturally).

### Confidence: HIGH

`writeConfigPatch` is the pattern's single point of truth for fs writes; seed slotting in is mechanical. The shape mapping is verified (`folders: FolderRule[]` is the exact same type both ways). Validation strictness improvement is a feature.

### Risks

- **R1.** Existing seed plans may contain malformed `FolderRule` entries that slipped past Tim's tolerant write. The migration causes those plans to fail loudly. **Mitigation**: validate all current seed plans against `FolderRuleSchema` in CI; fix any drift. The likely outcome is zero drift (seed/plan.ts:142 calls `starterFolderRule(scopedFolder)` which constructs a valid shape).
- **R2.** seed/apply currently runs synchronously (`writeFileSync`). `writeConfigPatch` is async (`tracedWriteFile + tracedRename`). The handler in api-extension.ts:5513 already awaits `applySeed`, so `applySeed` returning a Promise is fine. The function signature changes from `Promise<ApplyResult>` to `Promise<ApplyResult>` — already async; just internally async work.
- **R3.** Atomic vs non-atomic: today's `writeFileSync` is non-atomic (a crash mid-write leaves a half-written file). `writeConfigPatch`'s tmp+rename is atomic. **Strict improvement.** No risk.

---

## Cross-NQ summary

| NQ | Recommendation | Confidence | Blocker |
|---|---|---|---|
| NQ3 | Option A (recover + side-aside `.invalid-<timestamp>`); soft-fail variant for read-only filesystems. Cold-load LKG = recovered defaults. CC1 toast at boot if recovery fired. | HIGH | None |
| NQ6 | `CONFIG_VALIDATION_REVERT_ORIGIN` — frozen, `skipStoreHooks: true`, NOT paired-write. L3 entry-point gate: `if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return;`. | HIGH | None |
| NQ10 | Skip y-indexeddb for config docs. `bindConfigDoc` does not call `createClientPersistence`. Mirror `__system__` precedent. ≈100-300ms loading state on cold-mount Settings open is acceptable. | HIGH | None |
| NQ13 | `fieldRegistry` lives in `@inkeep/open-knowledge-core` as a Symbol-keyed `globalThis` singleton (mirrors Zod's `z.globalRegistry` pattern). STOP rule: one registry per process. | HIGH | None |
| NQ14 | D25's most-specific-already-set algorithm survives under D47. For mixed-scope patches: REJECT with `MIXED_SCOPE` error (force agent to retry per-scope). | HIGH | None |
| NQ15 | `set_folder_rule` is fs-direct via `applyFolderRulesUpsert` from core. Uses `resolveProjectConfigContext` (no server). Mirrors `read_document`'s fs-direct pattern. Live UIs refresh via file watcher when server is running. | HIGH | None |
| NQ17 | `seed/apply.ts:83-119` retargets to `applyFolderRulesUpsert`. Mechanical change (~15 LoC delete, ~10 LoC add). Validation strictness improvement is a feature. Tests need minor update. | HIGH | None |

No blockers across cluster B. All seven are dependent on cluster A's foundations (admission via `openDirectConnection`, schema in core, `writeConfigPatch` / `applyFolderRulesUpsert` exports), all of which are HIGH confidence with no blockers.

The pattern across all seven recommendations: **consistently use the existing precedent.** D58 mirrors `OBSERVER_SYNC_ORIGIN`. D59 mirrors `__system__` no-IDB. D60 mirrors Zod's `z.globalRegistry`. D61 carries D25 forward under D47's metadata model. D62 mirrors `read_document`'s fs-direct pattern. D63 retargets to the same `writeConfigPatch` foundation MCP and CLI use.

The pivot's coherence shows: each piece slots into a well-tested in-repo pattern.
