---
date: 2026-04-30
sources:
  - "specs/2026-04-30-realtime-frontmatter-entries/evidence/_user_outcomes.md"
  - "specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md"
  - "specs/2026-04-24-frontmatter-editing-ux/SPEC.md"
  - "PRECEDENTS.md"
  - "CLAUDE.md"
  - "packages/app/src/components/PropertyPanel.tsx"
  - "packages/app/src/components/PropertyContext.tsx"
  - "packages/app/src/components/PropertyWidgets.tsx"
  - "packages/app/src/components/EditorActivityPool.tsx"
  - "packages/app/src/components/EditorArea.tsx"
  - "packages/app/src/lib/frontmatter-validation-events.ts"
  - "packages/app/src/editor/SourceEditor.tsx"
  - "packages/app/src/editor/source-polish/view-plugin.ts"
  - "packages/app/src/editor/TiptapEditor.tsx"
  - "packages/core/src/bridge/bind-frontmatter-doc.ts"
  - "packages/core/src/bridge/frontmatter-y.ts"
  - "packages/core/src/config/bind-config-doc.ts"
  - "packages/core/src/extensions/frontmatter.ts"
  - "packages/core/src/frontmatter/schema.ts"
  - "packages/core/src/frontmatter/yaml-codec.ts"
  - "packages/core/src/frontmatter/errors.ts"
  - "packages/core/src/schemas/cc1.ts"
  - "packages/server/src/server-observers.ts"
  - "packages/server/src/agent-sessions.ts"
  - "packages/server/src/persistence.ts"
  - "packages/server/src/external-change.ts"
  - "packages/server/src/api-extension.ts"
  - "packages/server/src/cc1-broadcast.ts"
  - "packages/server/src/frontmatter-l3.ts"
  - "packages/server/src/frontmatter-edit-origin.ts"
  - "packages/server/src/page-identity.ts"
  - "packages/cli/src/mcp/tools/frontmatter-patch.ts"
  - "packages/cli/src/mcp/tools/index.ts"
  - "packages/cli/src/mcp/tools/edit-document.ts"
  - "reports/CATALOGUE.md"
  - "reports/codemirror-markdown-source-view-rendering/REPORT.md"
  - "reports/markdown-source-view-constructs/REPORT.md"
  - "reports/frontmatter-schema-conventions-for-agent-readable-docs/REPORT.md"
  - "reports/source-toggle-architecture/REPORT.md"
  - "https://codemirror.net/examples/decoration/"
  - "https://discuss.codemirror.net/t/how-to-integrate-yaml-front-matter-in-codemirror-6-with-markdown/8092"
  - "https://discuss.codemirror.net/t/drag-and-drop-lines-of-text/7161"
  - "https://github.com/yjs/y-codemirror.next"
  - "https://help.obsidian.md/properties"
depth: full
---

# Worldmodel — Realtime frontmatter entries

Topic: making `PropertyPanel` a structured editor view over the YAML region of `Y.Text('source')` rather than over a separate per-key `Y.Map('metadata')`. All edits — name keystroke, value keystroke, drag-to-reorder, add, delete — become Y.Text mutations to the `---\n…\n---\n` region. Greenfield permission to undo predecessor decisions.

## Meta

- Channels run: web (3 probes, last 2 partial — see Channel notes), code (inline, deep — `/explore` not dispatched because the codebase work is largely concentrated in 6-8 files and this skill is owned by the orchestrator's main thread for editing latency), reports (CATALOGUE scan + targeted reads), user-provided sources (predecessor specs + `_user_outcomes.md`), catalog skills (none — repo has no `product-surface-areas` / `internal-surface-areas` / `audience-impact` skills), OSS repos (none relevant — only `episodic-memory` available, off-topic).
- Channels unavailable: catalog skills (absent), OSS repos (no relevant matches).
- Stagnation events: none — every channel surfaced new structure.

## Confirmed direction (user-stated, verbatim)

From `_user_outcomes.md`:
- "I expect that the frontmatter editor is just a fancy WYSIWYG editor flavor on top of the underlying collaborative document text."
- Single source of truth = `Y.Text('source')`. `Y.Map('metadata')` becomes a derived projection cache OR is fully eliminated.
- Drag-to-reorder semantically equivalent to moving selected text from A → B; commit only on mouseup (drop). Editor manages YAML structure (newlines, indentation) at commit.
- Greenfield: no migration concern. Safe to rip `Y.Map('metadata')` per-key schema.

## Surfaces

### Product surfaces (user-visible)

| ID | Surface | File / location | Role | Touched by topic |
|---|---|---|---|---|
| P-1 | PropertyPanel (top-of-doc form table) | `packages/app/src/components/PropertyPanel.tsx` | Renders rows for each frontmatter key; bound to `Y.Map('metadata')` today via `bindFrontmatterDoc(provider)` for writes + `useFrontmatterMap` for reads | **Replace** — bind to YAML region of `Y.Text('source')` |
| P-2 | PropertyWidgets (Text / Number / Boolean / Date / List) | `packages/app/src/components/PropertyWidgets.tsx` | Per-type controlled inputs; commit via callback into PropertyPanel.commitPatch | Reuse — widgets are framework-independent. Commit pathway changes |
| P-3 | "Add Properties" toolbar button | `packages/app/src/components/EditorArea.tsx:196` (icon=`ListPlus`) | Clicking calls `requestAddProperty(activeDocName)` via PropertyContext | Reuse — replace target invocation |
| P-4 | Add / rename / delete inline flows | `PropertyPanel.tsx:beginAdd / beginRename / removeProperty / commitAdd / commitRename` | Inline forms inside the panel | All routed through new Y.Text writer |
| P-5 | Drag-to-reorder (NEW per user) | not yet built — topic of spec | "Move selected text from A to B cursor position" semantics; commit on mouseup | New surface — needs DnD library decision |
| P-6 | Source mode (CodeMirror) | `packages/app/src/editor/SourceEditor.tsx` (uses `yCollab(ytext, awareness)` from `y-codemirror.next`) | Direct edit of full `Y.Text('source')` including the YAML region | Co-edit target — both surfaces write the same Y.Text |
| P-7 | WYSIWYG mode (TipTap) | `packages/app/src/editor/TiptapEditor.tsx` | Edits `Y.XmlFragment('default')`; consults `metaMap.get('frontmatter')` at line 649/654 for legacy slot reads (hidden / preview behavior) | Coupled — body edits must not touch FM region |
| P-8 | CC1 toast + flash on rejection | `frontmatter-validation-events.ts` + `subscribeToFrontmatterValidationRejected` | PropertyPanel surfaces server-side L3 rejections | Reuse semantically; trigger conditions change |
| P-9 | Initial-load empty state | `PropertyPanel.tsx:322` (`if (keys.length === 0 && !adding) return null`) | No panel rendered when frontmatter is empty | Read path changes — derive from Y.Text region instead of Y.Map |

### Internal surfaces (mechanism)

| ID | Surface | File / location | Role | Touched |
|---|---|---|---|---|
| I-1 | `bindFrontmatterDoc(provider)` | `packages/core/src/bridge/bind-frontmatter-doc.ts` | Returns `{ current(), patch(), subscribe(), dispose() }`. Today writes to `Y.Map('metadata')` per-key under `FORM_WRITE_ORIGIN`. ~240 LOC | **Replace contract** or replace internals — emit Y.Text mutations, not Y.Map |
| I-2 | `FORM_WRITE_ORIGIN` (browser side) | `bind-frontmatter-doc.ts:53` | Frozen `LocalTransactionOrigin` with `context.origin: 'form-write'`, `paired: false`, `skipStoreHooks: false` | Likely retained — semantics shift to "Y.Text region edit", not "metaMap edit" |
| I-3 | `FORM_WRITE_ORIGIN` (server side) | `packages/server/src/frontmatter-edit-origin.ts` (sibling of `config-edit-origin.ts`) | Structurally identical to I-2; recognized by `origin.context.origin === 'form-write'` | Retained / re-purposed |
| I-4 | `FRONTMATTER_VALIDATION_REVERT_ORIGIN` | `frontmatter-edit-origin.ts:23` | `skipStoreHooks: true`; loop guard for L3 hook | Re-purpose if L3 still validates; otherwise delete |
| I-5 | Frontmatter Y-state helpers | `packages/core/src/bridge/frontmatter-y.ts` (~250 LOC) | `getFrontmatterMap`, `getFrontmatter`, `setFrontmatterFromYaml`, `setFrontmatterProperty`, `composeFrontmatterForStore`, `writeFrontmatterDualSlot` | **Most reduced or removed** — Y.Text region writes don't need per-key set/delete; reading the map is `parseFrontmatterYaml(stripFrontmatter(ytext.toString()).frontmatter)` |
| I-6 | YAML codec | `packages/core/src/frontmatter/yaml-codec.ts` | `parseFrontmatterYaml`, `serializeFrontmatterMap`, `applyPatchToDocument`, `withFences`, `getDocumentKeys` (uses `yaml@2.x` `parseDocument`/`Document.toString()`; preserves comments + source order) | Critical reuse — same parser, but the editor mutates the Y.Text region as text, then re-parses for read |
| I-7 | Frontmatter schema | `packages/core/src/frontmatter/schema.ts` | `FrontmatterValueSchema`, `FrontmatterMapSchema`, `FrontmatterPatchSchema`, `FrontmatterTypeSchema`, `inferType`, `isIsoDateString` | Retained — the L1 client validation still applies before committing a Y.Text region mutation |
| I-8 | Frontmatter validation errors | `packages/core/src/frontmatter/errors.ts` | `FrontmatterValidationError`, `FrontmatterValidationErrorSchema`, `toFrontmatterIssue`, `fieldErrorsFromError` | Retained — error shape consumed by toast + flash |
| I-9 | Strip / prepend / unwrap helpers | `packages/core/src/extensions/frontmatter.ts` | `stripFrontmatter`, `prependFrontmatter`, `unwrapFrontmatterFences`, `FRONTMATTER_RE` regex | Critical reuse — region detection in Y.Text |
| I-10 | Server observers (Y.XmlFragment ↔ Y.Text bridge + metaMap deep observer) | `packages/server/src/server-observers.ts` (~800 LOC) | Observer A (XmlFragment → Y.Text), Observer B (Y.Text → XmlFragment), Observer Meta (metaMap deep change → A re-fire). Composes `prependFrontmatter(getFrontmatter(doc), body)` on every drain | **Substantial change** — Observer Meta becomes obsolete; Observer B's `writeFrontmatterDualSlot` call disappears; Observer A's FM source becomes Y.Text region directly |
| I-11 | `applyAgentMarkdownWrite` | `packages/server/src/agent-sessions.ts:100-199` | Server-side agent write (paired origin) — composes `existingFm` from `metaMap.get('frontmatter')`, may update FM via `writeFrontmatterDualSlot` | Refactored — read existing FM directly from Y.Text region; mirror to Y.Text directly via `applyFastDiff` (already does this for body); FM region mutation becomes part of the same atomic Y.Text composition |
| I-12 | `applyAgentUndo` | `packages/server/src/agent-sessions.ts:222-298` | Post-undo composition; reads FM from `stripFrontmatter(ytext.toString())` already (no metaMap read for FM source!) | Already aligned with new direction — minor cleanup of the metaMap mirror call |
| I-13 | `onLoadDocument` (persistence) | `packages/server/src/persistence.ts:730-810` | Reads disk file; calls `writeFrontmatterDualSlot` to populate per-key + legacy slot; populates Y.Doc | Simplification — Y.Text receives full file content; no per-key population |
| I-14 | `onStoreDocument` (persistence) | `packages/server/src/persistence.ts:824-880` | L3 frontmatter validation hook + serialize XmlFragment + `composeFrontmatterForStore(document)` | Simplification — disk write is `ytext.toString()` (already includes FM region); L3 hook becomes "validate FM region of Y.Text" or is deleted |
| I-15 | L3 validation hook | `packages/server/src/frontmatter-l3.ts` | Validates per-key metaMap entries; reverts via `FRONTMATTER_VALIDATION_REVERT_ORIGIN`; calls `onFrontmatterRejected` | Either deleted (no per-key surface to defend) or re-purposed (parse `stripFrontmatter(ytext)`, validate, revert via Y.Text edit) |
| I-16 | CC1 broadcaster `emitFrontmatterValidationRejected` | `packages/server/src/cc1-broadcast.ts:373-400` + `packages/core/src/schemas/cc1.ts:191` | Pub-sub channel for L3 rejections | Retain conditionally on I-15's fate |
| I-17 | `applyExternalChange` (file-watcher) | `packages/server/src/external-change.ts:62-127` | On disk change: parse markdown, update XmlFragment, `writeFrontmatterDualSlot`, mirror Y.Text via `applyFastDiff` | Simplification — Y.Text mirror already covers FM region; remove dual-slot call |
| I-18 | `page-identity.ts` (regex YAML reader) | `packages/server/src/page-identity.ts` | Fail-tolerant FM reader for graph display: `splitFrontmatterLines`, `extractFrontmatterScalar`, `parseFrontmatterMetadata` | Retained — reads from disk content, not Y.Doc |
| I-19 | MCP `frontmatter_patch` tool (PARKED) | `packages/cli/src/mcp/tools/frontmatter-patch.ts` | HTTP transport `/api/frontmatter-patch` was removed; tool is parked in `tools/index.ts` as commented-out import (line 51) | Stay parked — predecessor's plan reaffirmed |
| I-20 | MCP `edit_document` (a.k.a. `agent-patch`) | `packages/cli/src/mcp/tools/edit-document.ts:28` + `packages/server/src/api-extension.ts:204` (counter `ok.frontmatter.agent_patch_fm_touch_total`) | Body-only; rejects FM-intersecting find/replace with HTTP 400 | Unchanged |
| I-21 | `PropertyContext` (cross-tree signal bus) | `packages/app/src/components/PropertyContext.tsx` | Per-doc counter; toolbar bumps, panel watches | Reused as-is |
| I-22 | EditorActivityPool integration | `packages/app/src/components/EditorActivityPool.tsx:705` | Mounts `<PropertyPanel provider={entry.provider}>` only in WYSIWYG (not source mode) inside `DocumentBoundary` | Still mounts only in WYSIWYG; the binding's source CRDT changes underneath |
| I-23 | TipTap reader of legacy slot | `packages/app/src/editor/TiptapEditor.tsx:649,654` | Reads `metaMap.get('frontmatter')` (single-string slot) for some preview / metadata behavior | Migration target — read via `stripFrontmatter(ytext.toString())` instead |
| I-24 | `attribution-sweep-coverage.test.ts` | `packages/app/tests/integration/attribution-sweep-coverage.test.ts:19` | References `bindFrontmatterDoc.patch()` under `FORM_WRITE_ORIGIN` (handler not in REQUIRED_HANDLERS) | Re-pointed at the Y.Text-direct binding's origin |
| I-25 | Tests touching frontmatter-y / bind-frontmatter-doc | `packages/core/src/bridge/frontmatter-y.test.ts`, `packages/core/src/bridge/bind-frontmatter-doc.test.ts`, `packages/server/src/api-agent-frontmatter.test.ts`, `packages/server/src/frontmatter-l3.test.ts`, `packages/server/src/persistence-perkey.test.ts`, `packages/app/tests/fidelity/frontmatter-perkey-roundtrip.test.ts`, `packages/app/tests/fidelity/bridge-observer-conversion.test.ts`, `packages/server/src/server-observers.test.ts` (FORM_WRITE non-paired test ~L1203, TEST_NON_PAIRED_ORIGIN ~L931) | Substantial test churn |
| I-26 | Test harness FM probes | `packages/app/tests/integration/test-harness.ts:861, 961` | Reads `metaMap.get('frontmatter')` directly for assertions | Migrate to read via Y.Text |
| I-27 | Frontmatter telemetry | `packages/server/src/frontmatter-telemetry.ts` (`recordFrontmatterEditSurface('source-mode' | 'mcp-write' | 'file-watcher' | 'form')`) | Counts edits per surface | Retained; new surface name = same `'form'` value |
| I-28 | Bridge invariant (substrate) | CLAUDE.md "Editor substrate" §1: `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`. `attachBridgeInvariantWatcher` in test harness | Critical — must continue to hold under new write topology |

## Connections + dependencies

### Today's write paths (post-predecessor)

```
PropertyPanel.commitPatch
  └─ binding.patch(patch)                    [bind-frontmatter-doc.ts]
       └─ FrontmatterPatchSchema.parse(L1)
       └─ ydoc.transact(() => {              [origin: FORM_WRITE_ORIGIN]
           setFrontmatterProperty(doc,k,v)
           ...
         })
            └─ metaMap.set(k, v)             [Y.Map('metadata') per-key]
                  ↓
          observerMeta fires                 [server-observers.ts:488]
                  ↓
          Settlement: runObserverASync       [Observer A path]
                  ↓
          recompose: prependFrontmatter(
            getFrontmatter(doc), body)       [getFrontmatter SYNTHESIZES YAML
                                              from per-key, falls back to
                                              legacy slot]
                  ↓
          applyFastDiff(ytext, ...)          [Y.Text mirror under
                                              OBSERVER_SYNC_ORIGIN]
                  ↓
          onStoreDocument                    [persistence.ts:824]
            ├─ validateAndRevertFrontmatterIfBad   [L3 hook]
            └─ composeFrontmatterForStore(doc)     [prefers legacy slot
                                                    verbatim if it parses
                                                    equal to per-key state;
                                                    else canonical synthesis]
```

### After topic landing (target)

```
PropertyPanel.commitMutation
  └─ binding.<edit>(args)                    [bind-frontmatter-doc.ts]
       └─ Schema check on the pre-image (L1)
       └─ ydoc.transact(() => {              [origin: FORM_WRITE_ORIGIN]
           // operate on the YAML REGION of Y.Text directly
           const fm = stripFrontmatter(ytext.toString()).frontmatter
           const yamlBody = unwrapFrontmatterFences(fm)
           const next = applyEdit(yamlBody, args)   // string-level
           const fenced = withFences(next)
           replace ytext[0..fm.length] with `fenced`   // Y.Text edit
         })
                  ↓
          observerB fires                    [server-observers.ts:699]
                  ↓
          runObserverBSync — already strips FM, parses body, applies to
          XmlFragment, mirrors Y.Text canonical
                  ↓
          onStoreDocument
            └─ ytext.toString() → disk      [no compose needed; Y.Text IS
                                              the canonical document]
```

The post-topic path collapses I-1, I-5, I-10 (Observer Meta), I-13 (per-key onLoad), I-14 (composeFrontmatterForStore), I-15 (L3 validation against metaMap), and possibly I-16 to a single "edit Y.Text region" pathway. The substrate invariant (`ytext === serialize(fragment)`) continues to hold because (a) the FM region is part of `ytext.toString()` and (b) `serialize(fragment)` doesn't include FM (FM is regex-stripped before parsing into XmlFragment per `applyExternalChange`, `Observer B`, `applyAgentMarkdownWrite`). The composed-string equality on which the invariant depends is `prependFrontmatter(<FM-from-Y.Text-region>, body) === ytext` — trivially true if FM lives in Y.Text.

### Top-5 connection / blast-radius items

1. **Observer A's metaMap deep observer (`observerMeta`, server-observers.ts:488-512) becomes dead code** if `Y.Map('metadata')` no longer carries FM state. Removing it requires also removing `metaDirty` flag and the meta-related branches in the settlement dispatcher (lines 745, 757, 772-774). The settlement-handler precedent (`#13(b)`) governs this — D5-LOCKED in `specs/2026-04-16-bridge-correctness/SPEC.md`.

2. **`getFrontmatter(doc)` consumers (8 sites)** — server-observers.ts (lines 358, 448, 498, 519, 686, 713), agent-sessions.ts (lines 129, 272 use legacy slot directly), api-extension.ts (line 2243), test-harness.ts (lines 861, 961). The function synthesizes FM string from per-key entries with legacy-slot fallback. After topic: replace with `stripFrontmatter(ytext.toString()).frontmatter`. TipTapEditor.tsx:649,654 reads legacy slot directly — needs same migration.

3. **Bridge invariant `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`** (CLAUDE.md substrate §1, attached watcher in tests). Today: composed-string baseline = `prependFrontmatter(getFrontmatter(doc), serialize(fragment))`. After: `serialize(fragment)` is unchanged (FM still stripped pre-parse); `prependFrontmatter(<FM-from-ytext>, ...)` recomposes. Path A's `lastSyncedXmlMd` baseline (server-observers.ts:340, 449, 499, 524, 675, 686, 714) must remain consistent — every `getFrontmatter(doc)` call site changes. **Risk:** Observer A currently observes both XmlFragment AND metaMap to refresh baseline; after topic, Observer A only needs to observe XmlFragment (FM lives in Y.Text the bridge is already writing to). Subtle: every Y.Text-region edit is also an Observer B trigger — must verify B's normalize gate doesn't re-trigger A on the same drain.

4. **L3 defense-in-depth (`frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, CC1 broadcaster, persistence ctx wiring in boot.ts/standalone.ts, error events module, PropertyPanel subscription)** — predecessor adds ~7 files of validation infra to defend `metaMap.set()` from non-binding writers. After topic: there are no non-binding writers to `metaMap` for FM (because FM doesn't live there). L3 either deletes entirely or moves to "parse Y.Text FM region on store, revert by Y.Text edit" — a different shape that overlaps with malformed-YAML handling already done by `setFrontmatterFromYaml`/`Observer B`'s "keeps last valid per-key state" semantics. **Decision needed:** is there a writer class that justifies L3 at all once FM lives in Y.Text?

5. **`composeFrontmatterForStore(doc)` legacy-verbatim preference (frontmatter-y.ts:232)** — exists to preserve YAML comments + blank lines + scalar styles across `doc-load → no-op-form-edit → doc-save` round-trips. Today: prefers `metaMap.get('frontmatter')` verbatim if it parses equal to per-key. After: comment preservation comes for free because Y.Text region edits are surgical (region replace within `---` fences) — comments outside the edited line ranges are left alone. **But:** drag-to-reorder under the new model rewrites the entire YAML region (because `yaml.parseDocument` round-trip with reordered keys must re-serialize). Must validate the FR4 round-trip PBT (`parse(serialize(map)) === map`) still passes for all common shapes; comments can be preserved by editing the parsed `Document` AST and re-stringifying ONLY the moved region, not the whole block.

### Bidirectional surface map (forward / backward)

**What feeds `Y.Map('metadata')` today (writers):**
- `bindFrontmatterDoc.patch` (PropertyPanel) — under FORM_WRITE_ORIGIN
- `setFrontmatterFromYaml` (`onLoadDocument`, `applyExternalChange`, Observer B) — under FILE_WATCHER_ORIGIN / OBSERVER_SYNC_ORIGIN
- `writeFrontmatterDualSlot` (multiple sites) — wraps `setFrontmatterFromYaml` + legacy slot mirror
- `applyAgentMarkdownWrite`, `applyAgentUndo` (agent-sessions.ts) — paired session origin
- `api-extension.ts:2285` (rollback handler) — direct `metaMap.set('frontmatter', ...)` for legacy mirror
- L3 hook revert path — under `FRONTMATTER_VALIDATION_REVERT_ORIGIN`

**What reads `Y.Map('metadata')` today (readers):**
- `getFrontmatter(doc)` — synthesizes YAML string for body composition (per-key fallback to legacy)
- `getFrontmatterMap(doc)` — typed map for PropertyPanel render
- Server-observers.ts (current FM check, `priorFm` capture)
- Agent-sessions.ts (existing FM)
- TipTap editor (some preview/metadata read)
- Test harness probes

**After topic — single writer class for the YAML region:** `bindFrontmatterDoc` per-edit operations; ALL other write paths become Y.Text-region writes that compose at the markdown level (already largely the case for `applyAgentMarkdownWrite` and Observer B). `Y.Map('metadata')` either ceases to exist as a CRDT root (most aligned with user's "fully eliminated" option) OR becomes a pure read-only projection cache that observers refresh on every Y.Text-FM change.

## Entities + terminology

### Repo-internal canonical terms (cited multiple sites)

- **Bridge invariant** — `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`. CLAUDE.md substrate §1. Watched by `attachBridgeInvariantWatcher` in test harness.
- **Baseline invariant** — Observer A's `lastSyncedXmlMd` matches current XmlFragment state. Staleness → incorrect diffs.
- **Item-preservation invariant** — Sync ops must not replace Y.Items whose content already matches at target position.
- **Paired-write origin** (`isPairedWriteOrigin`) — origins that atomically mutate BOTH XmlFragment and Y.Text in one transact. Recognized structurally by `context.paired === true`. Observer A AND Observer B short-circuit on these (CLAUDE.md STOP rule + precedent #1 extension).
- **`OBSERVER_SYNC_ORIGIN`** — server-side cross-CRDT writes use this to self-skip.
- **`FORM_WRITE_ORIGIN`** — non-paired (today: metaMap-only; after topic: Y.Text-region-only). Recognized by `origin.context.origin === 'form-write'` (structural).
- **`FRONTMATTER_VALIDATION_REVERT_ORIGIN`** — `skipStoreHooks: true`; loop guard for L3 hook.
- **Settlement dispatcher** — precedent #13(b). One `afterAllTransactions` drain per outermost `doc.transact()`. Observer A runs first, then Observer B.
- **Three rings of defense (L1/L2/L3)** — L1 client-side schema parse before write; L2 headless writer (`writeConfigPatch`-style); L3 server persistence-hook gate. Frontmatter today: L1 = `bindFrontmatterDoc.patch`; L2 = none; L3 = `frontmatter-l3.ts`.
- **CC1 broadcast** — pure-signal push primitive over `__system__` Y.Doc awareness. Channels include `frontmatter-validation-rejected`, `config-validation-rejected`, `disk-ack`, `files`, `backlinks`, `graph`. Schema in `packages/core/src/schemas/cc1.ts`.
- **Writer-ID taxonomy** (precedent #25) — `agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`. Frontmatter form writes resolve to `principal-<UUID>` via `resolveWriterFromOrigin` on `FORM_WRITE_ORIGIN`.
- **Legacy single-string slot** — `metaMap.get('frontmatter')` returning the entire fenced YAML string. Predecessor spec keeps this as the "transition mirror" alongside per-key entries; `writeFrontmatterDualSlot` writes both. Heavy reader base (8+ sites).
- **`Y.Map('metadata')`** — name has the legacy-slot connotation built-in; renaming to e.g. `'metadata-cache'` if it survives as projection-only would clarify.
- **`composeFrontmatterForStore`** — disk-write composition that prefers legacy verbatim for comment preservation.
- **`parseFrontmatterYaml`** — `yaml@2.x` `parseDocument`-based parser preserving comments + source order via `Document.contents`. Returns `{ doc, map, parseError? }`.
- **Region-slice / position-slice** — phase B of the markdown-pipeline post-parse walker. Distinct concept; not the same as "YAML region of Y.Text" but vocabulary collision worth noting.

### Decision-numbering (precedent + spec)

- Predecessor spec `2026-04-30-crdt-direct-frontmatter-writes`: AC-C1..C6 (client), AC-S1..S7 (server), AC-R1..R5 (removal), AC-Q1..Q5 (quality gates), AC-N1..N2 (non-regression).
- Earlier `2026-04-24-frontmatter-editing-ux` SPEC: D1 (top-of-doc table), D2 LOCKED (per-key Y.Map storage — **superseded by topic**), D3 LOCKED (YAML disk = source of truth), D5 (5 widget types), D7 (`getFrontmatterMap` reader API), D8 (canonical YAML serialization), D9 (`frontmatterCache` removed), D10 (per-key Y-types: Y.Text for editable strings, Y.Array<Y.Text> for lists, primitives for atomics — **superseded by topic**), D11 (substrate bridge invariant kept), D12 (Observer A observes metaMap deep — **becomes obsolete**), D13 (per-key diff reconciliation in Observer B / file-watcher / load), D14 (FORM_WRITE_ORIGIN — non-paired), D17 (toolbar-button-only initialization trigger), D18 (per-row hover chrome), D19 (drag-and-drop reorder, YAML order preserved — **central to topic**), D22 LOCKED (5 widget types), D23 (inline rename on key label), D24 LOCKED 1-way (forbid FM in agent-patch + add `frontmatter_patch` MCP tool — predecessor parked the tool), D25 LOCKED (yaml.parseDocument for comment preservation), D26 LOCKED (position invariant — panel always above body), D27 (form ↔ source per-key LWW — **becomes "Y.Text last-write-wins at the keystroke level"**), D28 (Zod at boundaries), D29 LOCKED 1-way (`frontmatter_patch` MCP tool shape — **parked**), D30 (write-path simplification: form + frontmatter_patch touch only metaMap — **superseded by topic**).
- **Decisions topic must reopen / supersede:** D2, D7 (read API), D9, D10, D11 (still applies but gets simpler), D12, D13, D27, D30.
- **Decisions topic preserves:** D1, D3, D5/D22, D8, D14 (origin retained, semantics shift), D15-D21 (UX layout), D23, D25, D26, D28.

### Personas

From `_user_outcomes.md` (intake):
- **Single user-facing persona:** knowledge worker editing frontmatter properties through the WYSIWYG editor.
- Constraints (must not break, from earlier spec §4): P2 developer/source-mode user, P3 MCP agent, P4 file-watcher / git workflow.

## Patterns

### Strongest pattern matches for "structured editor view over Y.Text region"

1. **`bindConfigDoc(provider, scope)`** (`packages/core/src/config/bind-config-doc.ts`) — the canonical sibling pattern. Binds a Y.Text directly (the entire Y.Text holds YAML), parses with `parseDocument` on read, applies a `ConfigPatch` via `applyPatchToDocument` on the Document AST, serializes to `Document.toString()`, replaces Y.Text content under no specific origin (propagates through Hocuspocus normally). Self-heals corrupt YAML. Three-layer L1/L2/L3 defense. **The new `bindFrontmatterDoc` shape collapses to "this, but on a sub-region of Y.Text".**

2. **CodeMirror `Decoration.replace` + `WidgetType`** ([codemirror.net/examples/decoration/](https://codemirror.net/examples/decoration/)) — standard CM6 pattern for hiding a region of source and rendering a custom UI in its place. The `Decoration.replace` wraps a range with a `WidgetType` that owns the DOM. **Could be the rendering pattern in source mode** (replace the YAML region with the same PropertyPanel UI); the underlying Y.Text remains untouched and synced via `yCollab`. WYSIWYG mode would render the panel as today, sourcing reads from the Y.Text region.

3. **`source-polish/view-plugin.ts` `buildDecorationsForRanges`** (`packages/app/src/editor/source-polish/`) — internal precedent for region-scoped CodeMirror decoration via `syntaxTree(state)` iteration + `Decoration.line` / `Decoration.mark`. Already handles markdown constructs (Strikethrough, ListItem, FencedCode). **Adds a precedent for "scope a CM6 decoration to a specific markdown region"** — could extend to wrap the FM region with a replace-decoration WidgetType hosting the panel form when in source mode.

4. **`@codemirror/lang-yaml`'s `yamlFrontmatter` helper** ([discuss.codemirror.net/t/8092](https://discuss.codemirror.net/t/how-to-integrate-yaml-front-matter-in-codemirror-6-with-markdown/8092)) — official support for parsing the leading `---` block as YAML inside a markdown buffer. Repo doesn't use it today (regex via `FRONTMATTER_RE` does the job for split/strip). Could simplify region detection.

5. **`applyAgentMarkdownWrite` / `applyAgentUndo`** (`agent-sessions.ts`) — server-side templates for atomic full-document Y.Text composition under a paired origin. The new browser-side binding for FM-region edits is the non-paired single-CRDT analog; existing server-side composition logic likely reusable for `setFrontmatterFromYaml`-equivalent edits.

6. **CodeMirror drag-and-drop primitives** ([discuss.codemirror.net/t/7161](https://discuss.codemirror.net/t/drag-and-drop-lines-of-text/7161), `dropCursor` extension, `dragMovesSelection` facet) — standard pattern for line-level drag-reorder via `EditorView.domEventHandlers` for `dragstart`/`drop`. **Drag-to-reorder requirement maps directly** to "delete from line A, insert at line B" Y.Text ops, committed once on mouseup.

7. **Document-as-AST editing** — predecessor spec D25 already established `yaml.parseDocument` + `Document.toString()` as the codec; both surfaces consume it. **Drag-to-reorder commit becomes:** parse current FM body to Document, swap two `Pair`s in `doc.contents.items`, stringify, replace Y.Text region atomically.

### Patterns with caveats

- **Y.Text observers are NOT React effects** (CLAUDE.md WARN rule). The PropertyPanel's `useFrontmatterMap(provider)` already uses `metaMap.observeDeep`; will switch to `ytext.observe` (with a derived FM-region computation that re-parses on every change, debounced or with a content-equality bailout). Bounded by the Activity-mount limit of 3 (precedent #18(c)).

- **`isPairedWriteOrigin` STOP rule** — adding a new origin that atomically mutates BOTH Y.XmlFragment and Y.Text MUST opt in via `context.paired: true`. The new binding still touches only Y.Text; **NOT paired**, mirroring today's FORM_WRITE_ORIGIN.

- **Settlement dispatcher** (precedent #13(b)) — Observer A runs before B in the same drain. When the new path writes Y.Text, Observer B fires (synchronously with the bridge), and Observer A's `lastSyncedXmlMd` baseline must be refreshed to include the new FM. Observer B's existing logic (`stripFrontmatter`, etc.) already handles this; verifying baseline-stale risk is a key spec investigation.

- **No drag-and-drop libraries in repo today** — `@dnd-kit`, `react-dnd`, etc. are absent. FileTree.tsx uses `headless-tree`'s built-in dragAndDrop. **New library decision is out-of-scope-of-worldmodel but in-scope for spec.**

## 3P landscape (brief)

- **Obsidian Properties view** ([help.obsidian.md/properties](https://help.obsidian.md/properties)) — closest user-facing precedent. Edits the YAML frontmatter file directly; UI updates "in real time" through a Properties pane. No public CRDT — Obsidian is local-first/single-user. Provides typed value enforcement (number/checkbox/date/time). Reorder via drag in the Properties view; YAML order preserved on disk. Web evidence does not detail internal architecture.

- **Notion property panel** ([notion.com/blog/data-model-behind-notion](https://www.notion.com/blog/data-model-behind-notion)) — block-based architecture; properties live as database fields per-block, NOT as document text. Field-level merge for free (each property is its own block attribute). Diametrically opposite to "structured view over text"; the user's chosen direction explicitly inverts this.

- **Lex / Plate / TinaCMS** — slate/PM editors with structured frontmatter blocks. TinaCMS uses git-backed content with frontmatter editing UIs (see `reports/tinacms-production-architecture-beyond-mdx/`); structured FM lives in MDX files but TinaCMS edits are file-level, not realtime CRDT.

- **`y-codemirror.next` + CodeMirror 6 decorations** — established pattern for region-scoped UI on a collaborative text doc. Replace-decoration with WidgetType is the canonical primitive ([codemirror.net/examples/decoration/](https://codemirror.net/examples/decoration/)). No widely-cited precedent for an Obsidian-style Properties view rendered specifically over a CRDT-synced Y.Text region — the topic is at the frontier.

- **Liveblocks + CodeMirror** ([liveblocks.io/docs/guides/codemirror+yjs+nextjs](https://liveblocks.io/docs/guides/how-to-create-a-collaborative-code-editor-with-codemirror-yjs-nextjs-and-liveblocks)) — collaborative code editor pattern; full Y.Text binding via `yCollab`. Region-specific structured forms not detailed in the public guide.

## Prior research (reports)

Top relevance from `reports/CATALOGUE.md`:

- **`frontmatter-schema-conventions-for-agent-readable-docs/`** (2026-04-05) — frontmatter conventions across Fumadocs, Mintlify, Fern, Docusaurus. Schema + governance background; informs widget type set + reserved keys.
- **`codemirror-markdown-source-view-rendering/`** (2026-04-14) — CM6 primitives, Obsidian / SilverBullet patterns for source-view markdown rendering. Direct precedent for region-scoped decorations in source mode.
- **`markdown-source-view-constructs/`** (2026-04-14) — per-construct rendering decisions. Adjacent to "render YAML region differently".
- **`source-toggle-architecture/`** (2026-04-07) — WYSIWYG ↔ source toggle architecture, dual-CRDT topology. Frames how a structured panel can behave consistently across modes.
- **`frontmatter-editing-ux-patterns/`** (referenced from predecessor spec) — sidebar / inline / modal alternatives evaluated. UX-pattern context.
- **`yjs-transaction-settlement-hooks/`** (2026-04-16) — `afterAllTransactions` semantics underpinning the settlement dispatcher. Critical for understanding observer behavior when the FM region edits flow through Y.Text.
- **`three-way-merge-content-preservation/`** (2026-04-16) — diff3 + DMP semantics that drive Observer A path B. Less central but relevant when concurrent FM region edits race source-mode FM edits.
- **`yjs-constrained-observer-sync/`** (2026-04-07) — one-way Y.XmlFragment → Y.Text observer sync with y-codemirror.next.
- **`config-edit-paths/`** (2026-04-25) — YAML round-trip, schema-driven editing across yaml@2, js-yaml, Zod. Most directly relevant given `bindConfigDoc` is the sibling pattern.
- **`auto-persistence-version-history-patterns/`** (2026-04-08) — version history patterns; shadow-repo writer-ID taxonomy adjacent.

## Most relevant precedents (`PRECEDENTS.md`)

- **#1 Typed transaction origins** — extension: paired-write opt-in via `context.paired: true`; `FORM_WRITE_ORIGIN` retains its non-paired status under the new model.
- **#9 Schema is add-only forever** — orthogonal but informs the UndoManager `trackedOrigins` Set-identity STOP rule.
- **#11 Minimize CRDT mutation in sync bridges** — directly applies. New direction must avoid replacing Y.Text Items unnecessarily; surgical region-replace is the goal.
- **#12 XmlFragment is authoritative for markdown state; Y.Text mirrors it** — TENSION. Today's XmlFragment-authoritative pattern composes via `prependFrontmatter(getFrontmatter(doc), body)`. Under topic, FM lives in Y.Text and is NOT in XmlFragment — same as today, but `getFrontmatter(doc)` becomes `stripFrontmatter(ytext.toString()).frontmatter`. The "XmlFragment authoritative" framing for body still holds; FM has no XmlFragment representation either before or after.
- **#13(a)** — bridge invariants enforced by watchers (must continue under new topology).
- **#13(b)** — settlement-based propagation (still governs Observer A/B).
- **#14 Cross-CRDT sync is single-writer, server-side** — applies. Client-side observers do NOT write the derived CRDT. The new path writes only Y.Text; client never bridges to XmlFragment.
- **#18(c) Bounded Activity-mount + Y.js observers ≠ React effects** — PropertyPanel's new `ytext.observe` subscription rides the same ACTIVITY_MOUNT_LIMIT bound as today's metaMap deep observe.
- **#24 Per-session actor identity at the CRDT origin layer** — `FORM_WRITE_ORIGIN` is non-session (browser-stamped, structurally validated server-side). Holds.
- **#25 Writer-ID taxonomy** — `principal-<UUID>` resolves from `FORM_WRITE_ORIGIN` via `resolveWriterFromOrigin`. Holds.
- **#28 Direct PM dispatch for nested editors** — relevant if the panel embeds CodeMirror per-row (out-of-scope per current widget set; not used today).

## Current state vs unresolved

### Already shipped on `edit-frontmatter` branch (recent commits)

- `42f22fd0 spec: CRDT-direct frontmatter writes (remove /api/frontmatter-patch)` — predecessor spec landed.
- `d1b690e9 feat: CRDT-direct frontmatter writes via bindFrontmatterDoc` — `bindFrontmatterDoc.patch()` writes per-key Y.Map under FORM_WRITE_ORIGIN; PropertyPanel migrated; HTTP `/api/frontmatter-patch` deleted; L3 hook + CC1 broadcast wired.
- `b4b80533 docs: refresh package READMEs for CRDT-direct frontmatter writes`
- `8d8264dd fixup! local-review: address findings (pass 1)` and `c1c76cb7 fixup! local-review: address findings (pass 2)` — local-review iteration.

### Predecessor spec decisions topic must undo

| Decision | Status |
|---|---|
| AC-C1..C6 (client `bindFrontmatterDoc.patch` writes per-key) | **Reverse** — patch writes Y.Text region |
| AC-S1 (FORM_WRITE_ORIGIN non-paired touches only metaMap) | **Reframe** — touches only Y.Text |
| AC-S3..S5 (L3 hook validates per-key metaMap) | **Reframe or delete** — see I-15 above |
| AC-R1..R5 (removed `/api/frontmatter-patch`) | **Hold** — HTTP endpoint stays gone |
| AC-Q4 (multi-client conflict last-wins per-key metaMap) | **Reframe** — Y.Text per-character semantics replace per-key LWW |
| Predecessor's "per-key Y.Map storage replaces single-string slot" (predecessor's predecessor D2 LOCKED) | **Re-open** — both can collapse |

### UNRESOLVED items (need spec investigation)

1. **Observer Meta + metaDirty fate.** If `Y.Map('metadata')` is fully eliminated, `observerMeta` (server-observers.ts:488-512), the `metaDirty` flag, and the meta-related branches in the settlement dispatcher (lines 745, 757, 772-774) become dead code. Trail: entire metaMap deep-observation infrastructure in server-observers.ts is conditional on Y.Map carrying state. If `Y.Map('metadata')` becomes a derived projection cache (option B), Observer Meta might survive but flip purpose: re-fire on Y.Text FM-region change to refresh the cache, which is backwards (Y.Text would be the source).

2. **L3 validation hook fate.** Predecessor justifies L3 as "defense for direct `metaMap.set()` from non-binding writers." After topic, no such writers exist (metaMap doesn't carry FM). Questions: (a) Is there an L3 analog that validates the YAML region of Y.Text on store, and reverts via Y.Text edit? (b) Does `setFrontmatterFromYaml`'s "keep last valid" semantics + Observer B's parse-failure handling already cover this defense surface? Trail: `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, CC1 broadcaster integration in `cc1-broadcast.ts:373-400`, persistence ctx wiring in boot.ts/standalone.ts, error events module in app/lib/, PropertyPanel's `subscribeToFrontmatterValidationRejected` effect (PropertyPanel.tsx:170-192) — 7+ files all ride on this decision.

3. **Comment preservation under drag-to-reorder.** `composeFrontmatterForStore`'s legacy-verbatim path (frontmatter-y.ts:232) preserves YAML comments + blank lines + scalar styles when per-key state matches the parsed legacy slot. Under topic: Y.Text region edits ARE surgical text edits, so non-edited lines (including comments) are untouched in Y.Text directly. **But:** drag-to-reorder must rewrite the order of `Pair` entries — re-stringifying via `parseDocument().toString()` may or may not preserve comment placement attached to specific keys. Trail: `yaml@2.x` `Document.toString()` semantics for moved `Pair`s; predecessor spec D25 LOCKED on `parseDocument`; Q16 in predecessor's predecessor (unresolved YAML-construct round-trip) flagged as "open — to investigate".

4. **PropertyPanel read pathway under Y.Text source.** Today's `useFrontmatterMap(provider)` does `metaMap.observeDeep` and re-renders on every metaMap change. After topic: `ytext.observe` fires on every Y.Text mutation (every keystroke in source mode, every body-edit in WYSIWYG via Observer A). Need: cheap content-equality bailout that re-parses only when the FM region changed. Trail: PropertyPanel.tsx:711-721 (`useFrontmatterMap`); pattern matches CodeMirror's transactionFilter / view-plugin debouncing approach but Y.js observer fires synchronously and isn't a React effect (precedent #18(c)). React Compiler bails on same-value Map identity, so a synchronous parse+structural-compare is acceptable if cheap.

5. **Drag-to-reorder commit semantics under concurrent edits.** User said "position writes shouldn't be considered for collaborative change until they are dropped (mouseup)". Under Y.Text: the drag is a local visual state; on drop, replace the FM region with the reordered YAML in one transact. **What happens if a remote peer edits a different FM property mid-drag?** The reordered local state may stomp the remote write. Trail: predecessor spec D27 (form ↔ source per-key LWW for same key) covered concurrent-write same-key but didn't model concurrent-reorder vs concurrent-edit — Y.Text last-write-wins on overlapping ranges is the default. Per-key field-level merge that the predecessor advertised is genuinely lost when reorder rewrites the entire region; the "rewrite only the moved range" approach (parse Document, swap pairs, stringify only the affected slice) preserves more than full-region replace, but is non-trivial.

### ADJACENT items

- **MCP `frontmatter_patch` tool** (`packages/cli/src/mcp/tools/frontmatter-patch.ts`, parked) — relevant if a future spec un-parks it. Topic doesn't move this surface; agent FM writes today route through `applyAgentMarkdownWrite` in agent-sessions.ts which already operates at the Y.Text composition level.

- **`Y.Map('metadata')` legacy slot cleanup at file-watcher / persistence boundary** — `applyExternalChange` and `onLoadDocument` write the legacy slot via `writeFrontmatterDualSlot`. Once metaMap is gone, these calls just disappear. Tracked under blast-radius #2 above.

- **`page-identity.ts` regex YAML reader** (`packages/server/src/page-identity.ts`) — disk-content reader, not Y.Doc reader. Out of scope.

### INACCESSIBLE items

- None — every channel surface mapped is in-repo or public web.

## Summary table — files that change vs files that stay

### Likely substantial change (refactor or delete)

`packages/core/src/bridge/bind-frontmatter-doc.ts` (replace internals, possibly contract), `packages/core/src/bridge/frontmatter-y.ts` (most fns either delete or shrink), `packages/core/src/bridge/bind-frontmatter-doc.test.ts`, `packages/core/src/bridge/frontmatter-y.test.ts`, `packages/server/src/server-observers.ts` (Observer Meta / metaDirty), `packages/server/src/server-observers.test.ts`, `packages/server/src/agent-sessions.ts` (read FM from Y.Text not metaMap; remove `writeFrontmatterDualSlot` calls), `packages/server/src/persistence.ts` (onLoadDocument simplification, onStoreDocument compose simplification, possibly delete L3 wiring), `packages/server/src/external-change.ts`, `packages/server/src/api-extension.ts` (rollback metaMap legacy mirror), `packages/server/src/frontmatter-l3.ts` + `frontmatter-edit-origin.ts` + `frontmatter-l3.test.ts` + `persistence-perkey.test.ts` (deletion candidate), `packages/server/src/cc1-broadcast.ts` (delete `emitFrontmatterValidationRejected` if L3 deleted), `packages/core/src/schemas/cc1.ts` (delete CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED if L3 deleted), `packages/app/src/lib/frontmatter-validation-events.ts` (delete with above), `packages/app/src/components/PropertyPanel.tsx` (read pathway + drag-and-drop), `packages/app/src/components/PropertyWidgets.tsx` (small — trail through drag handle), `packages/app/src/editor/TiptapEditor.tsx:649,654` (legacy slot reader), `packages/app/tests/integration/test-harness.ts:861,961`, `packages/app/tests/integration/attribution-sweep-coverage.test.ts`, `packages/app/tests/fidelity/frontmatter-perkey-roundtrip.test.ts`, `packages/app/tests/fidelity/bridge-observer-conversion.test.ts`, `packages/server/src/api-agent-frontmatter.test.ts`.

### Stay (read-only or out of scope)

`packages/core/src/frontmatter/schema.ts` (Zod schemas), `packages/core/src/frontmatter/yaml-codec.ts` (parser/codec), `packages/core/src/frontmatter/errors.ts` (error shape), `packages/core/src/extensions/frontmatter.ts` (regex + strip/prepend/unwrap), `packages/server/src/page-identity.ts`, `packages/server/src/frontmatter-telemetry.ts`, `packages/cli/src/mcp/tools/frontmatter-patch.ts` (parked), `packages/cli/src/mcp/tools/edit-document.ts`, MCP `agent-write-md` flow.

### New (likely)

A drag-and-drop dependency or a small handlers helper for the panel; possibly a `Y.Text`-region edit helper module in `packages/core/src/bridge/` (e.g., `frontmatter-region.ts`) housing parse-edit-stringify primitives for add/rename/remove/reorder operations on the FM region.

## Triangulation + confidence

- **HIGH (multi-channel, code-verified):** Predecessor spec landed on `edit-frontmatter`; PropertyPanel + binding wired; metaMap per-key writes under FORM_WRITE_ORIGIN; L3 hook live in persistence.ts; legacy-slot mirror still consumed at 8+ sites. Source: code reads + predecessor spec + ARCHITECTURE-aligned commit history.
- **HIGH (single-source but code-verified):** Substrate bridge invariant unchanged through the topic; Y.Text already carries FM region (`writeFrontmatterDualSlot` writes it; Observer A composes `prependFrontmatter(getFrontmatter, body)` for Y.Text). Source: server-observers.ts.
- **MEDIUM:** `composeFrontmatterForStore`'s comment-preservation guarantee under Y.Text-region drag-to-reorder. Spec depends on what `yaml@2.x` `Document.toString()` does when `Pair` order changes via in-place rearrangement — need a probe.
- **MEDIUM:** The "structured editor view over Y.Text region" pattern's industry-standard implementation. Web evidence shows CM6 replace-decoration + WidgetType is the primitive; no widely-publicized end-to-end Yjs example for FM-region structured forms — at the frontier.
- **LOW (conditional):** Whether L3 defense is needed at all once FM lives in Y.Text. Defensive logic may still be valuable for malformed-on-load / malformed-from-source-mode scenarios; current `setFrontmatterFromYaml` "keep last valid" semantics already cover some of this. Resolution depends on a spec-time decision about what defense surface a Y.Text-resident FM region needs.
