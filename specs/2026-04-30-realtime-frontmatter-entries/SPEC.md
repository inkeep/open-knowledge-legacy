# Realtime frontmatter entries — Spec

**Status:** Approved
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-30
**Baseline commit:** c1c76cb7
**Links:**
- Predecessor spec: [`specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md`](../2026-04-30-crdt-direct-frontmatter-writes/SPEC.md) — partially superseded; see [`evidence/predecessor-decisions-superseded.md`](./evidence/predecessor-decisions-superseded.md)
- Original PropertyPanel UX spec: [`specs/2026-04-24-frontmatter-editing-ux/SPEC.md`](../2026-04-24-frontmatter-editing-ux/SPEC.md)
- Worldmodel topology: [`evidence/_init_worldmodel.md`](./evidence/_init_worldmodel.md)
- User-stated outcomes (intake): [`evidence/_user_outcomes.md`](./evidence/_user_outcomes.md)
- Sibling pattern (architectural template): [`evidence/bindconfigdoc-sibling-pattern.md`](./evidence/bindconfigdoc-sibling-pattern.md)
- Substrate invariants: [`evidence/substrate-invariants.md`](./evidence/substrate-invariants.md)

---

## 1) Problem statement

**Situation.** PropertyPanel binds to `Y.Map('metadata')` per-key entries (CRDT-direct branch, just shipped). Property name = Y.Map key. Editing a name commits as delete-old-key + add-new-key, so renames always reorder to the end. Two clients renaming to the same target silently overwrite (no conflict surface). Names + values commit on blur, not per-keystroke — there is no live collaboration on a name being typed. The codebase already has the canonical pattern for "typed read/patch/subscribe over a Y.Text holding YAML" (`bindConfigDoc`); the body editor (TipTap) binds to `Y.XmlFragment('default')`, which the bridge mirrors to `Y.Text('source')` via Observer A; CodeMirror source mode binds to `Y.Text('source')` directly via `y-codemirror.next`. The frontmatter UI is the only structured editor in the system that does not bind to a CRDT root-level structure (today: per-key entries in `Y.Map('metadata')`).

**Complication.** The visible bug (rename → reorder) is the surface symptom of a deeper modeling choice: names-as-Y.Map-keys forecloses keystroke-level CRDT, in-place rename, order-across-edits, and duplicate-name conflict surfacing — all four at once. Defending against the dual-storage divergence the per-key schema introduces costs ~7 surfaces of L3 validation infrastructure (~3 standalone files — `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, `frontmatter-validation-events.ts` — plus ~4 call-site surfaces: CC1 broadcaster method, `cc1.ts` channel constant, persistence wiring, PropertyPanel subscription effect). Greenfield permission has been granted to revisit.

**Resolution.** Make PropertyPanel a structured editor view over the YAML region of `Y.Text('source')` — mirror `bindConfigDoc`'s pattern but scoped to the `---\n…\n---\n` sub-region. Every UI operation (name keystroke, value keystroke, drag-to-reorder, add, delete) becomes a Y.Text byte-range edit inside one `doc.transact(fn, FORM_WRITE_ORIGIN)`. Keystroke-level CRDT for names and values; order preserved because the slot's byte range doesn't move on a name edit; duplicate names representable in YAML rather than silently overwritten. `Y.Map('metadata')` per-key schema is eliminated or downgraded to a derived projection cache (decision in iterative loop).

## 2) Goals

- **G1 — Realtime keystroke CRDT on names + values.** Property name and value edits propagate per-character through `Y.Text('source')`, no commit-on-blur for name typing.
- **G2 — Order preserved across all edits.** Renames, value changes, and structural edits never reorder a property. The intake-driver bug (`title` → `titles` reorders to end) cannot recur.
- **G3 — Duplicate names are representable, not silently dropped.** Two slots with the same name are a visible state in the CRDT and surfaced in the UI as a conflict.
- **G4 — Drag-to-reorder behaves like moving selected text.** Local visual state during drag; committed as a Y.Text edit on mouseup.
- **G5 — Net complexity reduces.** Predecessor's L3 validation infra (~7 surfaces / ~3 files) is eliminated or substantially simplified; `Y.Map('metadata')` per-key schema is eliminated or downgraded.
- **G6 — No bridge regression.** Substrate bridge invariant (`stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`) continues to hold; body editing collaboration is unaffected.

## 3) Non-goals

- **[NOT NOW]** NG1: Un-parking the `frontmatter_patch` MCP tool. The HTTP endpoint stays gone; the parked TS file stays parked. — Revisit if a future spec re-considers the MCP tool surface.
- **[NOT NOW]** NG2: New widget types beyond text / number / boolean / date / list. — Revisit if user research surfaces demand.
- **[NOT NOW]** NG3: Schema-driven property name autocomplete or suggestions. — Revisit when broader schema-validation UX is designed.
- **[NOT NOW]** NG4: Bulk frontmatter editing across multiple docs.
- **[NOT UNLESS]** NG5: Custom YAML formatting preferences (block vs flow style chooser). — Only if specific user demand surfaces.
- **[NOT UNLESS]** NG6: Field-level CRDT merge for two clients editing the same YAML key concurrently. — The new model replaces per-key field-level merge with Y.Text character-level merge. Different-key concurrent edits merge cleanly via Y.Text character-level CRDT (better than per-key LWW). Same-key concurrent value edits collapse to Y.Text byte-range LWW on overlapping ranges (regression vs. predecessor's per-key slot LWW). Reconsider only if same-key concurrent edits produce unacceptable user-visible conflicts in practice. **Per-property CRDT identity is also surrendered**, which forecloses future per-property history, per-property comments, and per-property awareness without rebuilding identity over yaml@2's Pair byte ranges (acknowledged trade-off; see §15 Future Work).

## 4) Personas / consumers

### P1: Knowledge worker editing frontmatter via PropertyPanel
- **JTBD:** When I'm editing the metadata properties of a knowledge doc in the WYSIWYG editor… But renames silently move properties around and concurrent edits silently overwrite each other… Help me edit names, values, and order in real-time with the same fidelity I expect from any text input… So I trust the editor and don't bounce to source mode for safety.
- **Current workflow + workarounds:** User clicks a property name to rename, types, blurs to commit. Rename moves the property to the bottom. Workaround: switch to source mode (CodeMirror) and edit YAML directly, where order is naturally preserved because Y.Text doesn't reorder on edit.
- **Pain points:** Silent reordering on rename. Loss of trust in panel. No visibility into concurrent edits. Commit-on-blur creates a "did it save?" moment.
- **Trust/security sensitivities:** Edits must be durable. No silent data loss when two users rename to the same name.
- **Success in their terms:** Type a property name and watch it update letter-by-letter on a peer's screen; rename in place without losing position; see when a duplicate name occurs.

### Secondary system constraints (not personas — must not regress)
- **Source-mode user (CodeMirror).** Edits Y.Text directly. PropertyPanel must observe the same Y.Text region and stay consistent. No regression on source-mode edit semantics.
- **MCP agent.** `applyAgentMarkdownWrite` already composes at Y.Text level; this spec simplifies it (drops the metaMap mirror). Agent FM writes via `agent-write-md` continue to work.
- **File watcher / git workflow.** Disk YAML stays the source of truth (D3 LOCKED preserved). External edits flow through Y.Text via `applyExternalChange` as today.

## 5) User journeys

### P1: Knowledge worker editing a property

1. **Discovery** — User opens a markdown doc in the editor. PropertyPanel renders above the body if frontmatter exists; otherwise the toolbar's "Add Properties" button is the entry point.
2. **Setup** — None. Panel loads from Y.Text on doc open.
3. **First use** — Click property name → inline input becomes editable in place; type "s" at the end of "title" → "titles" appears in the same row (no reorder), other properties unchanged. Same for value edits.
4. **Ongoing use** — Rename / change value / add / remove properties. Drag-to-reorder by grabbing a row and dropping at a new position.
5. **Failure / debug** — Source-mode malformed YAML: panel surfaces a parse error inline; rows render last-valid state until YAML re-parses. Two clients rename to same name: both rows render with a visible duplicate-name marker.
6. **Growth** — Co-editing with a peer; agent-driven writes (Claude / MCP) appear in the panel without mode switching.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| PropertyPanel | First-paint while ytext loads | No FM region in Y.Text → panel hidden, toolbar button visible | YAML region unparseable → last-valid render + inline error | Full set of properties rendered + editable | One key in midst-of-rename / one value mid-edit |
| Drag-to-reorder | n/a | No rows to drag | Drop on invalid target → revert visually, no commit | Drop on valid target → Y.Text edit committed on mouseup | Mid-drag visual state (local-only, not yet committed) |
| Add property | n/a | Empty + Add button visible | Commit fails L1 schema → inline error | New row appears, focus moves to name input | New row added but name still empty (allowed transient state) |
| Rename | n/a | n/a | Commit produces duplicate or invalid YAML → handled per Dup-name OQ + L1 timing OQ | Renamed in place; position preserved | Mid-typing — name partial, no commit yet |
| Source-mode coupling | First-paint | No FM in source → panel hidden | Source-mode malformed YAML → panel shows last-valid + error | Source edit propagates to panel | Source mid-edit observed in panel via ytext.observe |

## 6) Requirements

### Functional requirements

| Requirement | Acceptance criteria | Notes |
|---|---|---|
| FR1 — Names + values are realtime keystroke-level CRDT | Two clients, one typing in the name field of a property, the other observing: each character appears in the observer's view as it's typed (no commit-on-blur lag for the visible name). Same for value fields. Verified in integration test (D24 layer c). | Replaces commit-on-blur rename; backed by D11 (binding API) + D20 (read perf) |
| FR2 — Rename preserves position | Adding "s" to "title" → "titles" leaves the property in the same row of the panel and the same line of the YAML region; no other property moves. Verified in unit test (D24 layer a) and E2E (D24 layer d). | Driver-bug fix; backed by D8 + D11 (rename method writes Pair name in place, not delete+insert) |
| FR3 — Order preserved across all non-reorder edits | Add / delete / value-edit / rename do not change the order of any other property. PBT property holds (D24 layer b). | Backed by D8 + D11 |
| FR4 — Drag-to-reorder moves property to drop position | Drag row at index i, drop at index j, mouseup commits a single Y.Text region replace. Visual order during drag is local-only (no Y.Text mutation). Verified in E2E (D24 layer d). | Backed by D12 + D14 |
| FR5 — Drag-reorder is keyboard-accessible | Focused row + space lifts; arrow keys move; space/enter drops; escape cancels. Screen-reader announcements per `@dnd-kit` accessibility preset. Verified in E2E + axe-core scan. | Backed by D14 + D22 |
| FR6 — Duplicate names are surfaced, not silently dropped | Two slots with name `title` render as two rows, each with a visible duplicate-name marker. Both editable. Renaming one to a unique value clears the marker. Both lines persist to disk YAML. Verified in unit test + E2E. | Backed by D17 + D18 + A6 |
| FR7 — Empty/whitespace name is a transient panel state | Panel allows the name input to be momentarily empty during editing without surfacing an error. No Y.Text mutation occurs while name is empty/whitespace. Commit gates on non-empty + L1-valid name. Verified in unit test. | Backed by D16 + D19 |
| FR8 — Add property lands at bottom | New property row appears at the bottom of the panel; corresponding YAML line appears at the bottom of the FM region. Verified in unit test + E2E. | Backed by D15 |
| FR9 — Malformed YAML produces a non-blocking banner | Source-mode user types malformed YAML in FM region → panel shows last-valid render + inline banner ("Frontmatter YAML is malformed; fix in source mode to recover"). Panel does not unmount; Y.Text continues to receive edits. Verified in unit test + integration test. | Backed by D21 + D30 |
| FR10 — Substrate bridge invariant holds under all FM-region edits | `attachBridgeInvariantWatcher` reports zero violations across all integration test scenarios (set / delete / add / rename / reorder; concurrent two-client; drag-while-typing). | Backed by D2 + A4 |
| FR11 — Predecessor's L3 infra is removed | `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, CC1 broadcaster method `emitFrontmatterValidationRejected`, `frontmatter-validation-events.ts`, `cc1.ts` channel `frontmatter-validation-rejected`, persistence-context wiring, and PropertyPanel's rejection-subscription effect are deleted. `bun run check` passes. | Backed by D10 |
| FR12 — `Y.Map('metadata')` is no longer a CRDT root for FM data | All `metaMap.get(...)` / `metaMap.set(...)` / per-key reads/writes related to frontmatter are removed or migrated to `stripFrontmatter(ytext.toString()).frontmatter`. `bun run check` passes. | Backed by D8 |
| FR13 — Persistence writes Y.Text to disk directly | `onStoreDocument` writes `ytext.toString()` to disk verbatim; `composeFrontmatterForStore` is deleted. Disk content equality preserved against current corpus. Verified in `persistence.test.ts` regression. | Backed by D26 |
| FR14 — Agent-write paths read FM from Y.Text | `applyAgentMarkdownWrite` and `applyAgentUndo` read FM via `stripFrontmatter(ytext.toString()).frontmatter`; `writeFrontmatterDualSlot` calls deleted. Existing `api-agent-frontmatter.test.ts` re-pointed and passing. | Backed by D25 |

### Non-functional requirements

- **Performance:** No measurable regression in body-edit p99 latency in source mode under typical FM size (≤10 keys, ≤1KB). `ytext.observe` content-equality bailout (D20) is the gate. Verified by a micro-benchmark run during implementation.
- **Reliability:** Substrate bridge invariant (FR10) continues to hold under all FM-region edit shapes. Existing C-matrix (C1–C10) integration tests extended for FM-region edits.
- **Security/privacy:** Unchanged. Frontmatter remains non-secret content under `principal-<UUID>` writer-ID per precedent #25 (D5 LOCKED).
- **Operability:** Existing `recordFrontmatterEditSurface('form')` telemetry preserved; per-op breakdown is Future Work.
- **Cost:** Net LOC reduction (~7 files deleted under D10 + Observer Meta + per-key helpers under D9 + composeFrontmatterForStore under D26). Adds `@dnd-kit/core` + `@dnd-kit/sortable` deps (~18KB gz total).

## 7) Success metrics & instrumentation
- _Pending Step 5._

## 8) Current state (how it works today)

The just-shipped CRDT-direct branch landed at baseline `c1c76cb7`:

- **PropertyPanel.tsx** binds to `Y.Map('metadata')` via `bindFrontmatterDoc(provider)` for writes + `useFrontmatterMap(provider)` for synchronous render reads.
- **`bindFrontmatterDoc.patch(patch)`** validates against `FrontmatterPatchSchema` (L1), then commits per-key `metaMap.set` / `metaMap.delete` inside `doc.transact(fn, FORM_WRITE_ORIGIN)`.
- **Server-side observer pipeline:** `observerMeta` deep-observes metaMap; settlement dispatcher routes to Observer A path which composes `prependFrontmatter(getFrontmatter(doc), serialize(fragment))` into `Y.Text` under `OBSERVER_SYNC_ORIGIN`. `getFrontmatter(doc)` synthesizes YAML from per-key metaMap with legacy-slot fallback.
- **Persistence:** `onLoadDocument` calls `writeFrontmatterDualSlot` to populate per-key + legacy slot; `onStoreDocument` runs L3 validation hook + `composeFrontmatterForStore(doc)` (which prefers legacy verbatim when it parses equal to per-key, for comment preservation).
- **L3 defense surface (~7 files):** `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, CC1 broadcaster `emitFrontmatterValidationRejected`, `cc1.ts` schema, persistence-context wiring, error events module, PropertyPanel rejection-subscription effect.
- **Legacy single-string slot** (`metaMap.get('frontmatter')`) is still the read source for ~8 sites: server-observers, agent-sessions (2 sites), api-extension rollback handler, TipTap (2 sites for hidden/preview), test harness probes (2 sites).

Full topology + code references: [`evidence/_init_worldmodel.md`](./evidence/_init_worldmodel.md). Decision-trace of what gets superseded vs preserved: [`evidence/predecessor-decisions-superseded.md`](./evidence/predecessor-decisions-superseded.md).

The driver bug — `PropertyPanel.renameProperty` issues `{[oldKey]: null, [newKey]: value}` to `binding.patch`, which Y.Map-deletes the old key and Y.Map-sets the new one. Y.Map preserves insertion order, so the new key always lands at the end.

## 9) Proposed solution (vertical slice)
### User experience / surfaces

- **PropertyPanel** (`packages/app/src/components/PropertyPanel.tsx`) renders rows for each parsed FM property. Reads from `Y.Text('source')` via `ytext.observe` + content-equality bailout (D20). Each row has an inline-editable name input and a typed value widget (text / number / boolean / date / list).
- **Drag handle** on each row (left-anchored, hover-revealed). `@dnd-kit/sortable` provides pointer + keyboard sensors (D14, D22). Visual reorder during drag is local React state only; on `mouseup`, panel calls `binding.reorder(orderedKeys)`, which commits a single Y.Text region replace under `FORM_WRITE_ORIGIN` (D12).
- **"Add Property" button** at the bottom of the panel. Click → row appears at bottom (D15) with focus on the name input. Empty name is a valid transient state (D16); commit gates on non-empty + L1-valid.
- **Duplicate-name marker** (warning icon + tooltip) renders on each affected row when two or more rows share a name (D17). Editing a name to a unique value clears the marker.
- **Inline error overlay** (existing `FrontmatterValidationError` shape) for commit-time L1 failures.
- **Banner** above the panel rows ("Frontmatter YAML is malformed; fix in source mode to recover") for unparseable YAML region (D21, D30). Panel renders last-valid below the banner.
- **Toolbar "Add Properties" button** (`packages/app/src/components/EditorArea.tsx`) — wiring unchanged (D7). Clicking still calls `requestAddProperty(docName)` via `PropertyContext`, but the panel's response now opens the new-row input bound to the Y.Text region.

#### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| WYSIWYG editor (default doc view) | PropertyPanel above body | All FRs land here; rename / drag / dup-name / banner |
| Source mode (CodeMirror) | Y.Text region edited directly via `yCollab` | Panel observes the same Y.Text; switching modes mid-edit converges (D28) |
| New-doc onboarding | Empty FM → panel hidden; toolbar "Add Properties" button visible (D7) | First add lands at bottom (D15) |

### System design

- **Architecture overview.** PropertyPanel becomes a structured editor view over the YAML region of `Y.Text('source')`. The region is detected by `FRONTMATTER_RE` (D3); parsed by `yaml@2.x` `parseDocument` (D4) into an in-memory `Document`. UI commits edit the `Document` AST and replace the Y.Text region atomically inside `doc.transact(fn, FORM_WRITE_ORIGIN)` (D2). `Y.Map('metadata')` no longer holds FM state (D8); Observer Meta + metaDirty + L3 infra deleted (D9, D10).

- **Data model.** Source of truth: `Y.Text('source')`. FM region: bytes `[0, frontmatter.length]` per `stripFrontmatter`. No derived CRDT state; no projection cache. Disk: `ytext.toString()` written verbatim by `onStoreDocument` (D26).

- **API/transport.** Browser-side: `bindFrontmatterDoc(provider)` returns `{ current(), patch(), rename(), reorder(), subscribe(), dispose() }` (D11). All write methods commit under `FORM_WRITE_ORIGIN`. Server-side: no new transport surface; existing Hocuspocus WebSocket carries Y.Text deltas. HTTP `/api/frontmatter-patch` stays gone (predecessor AC-R1..R5 preserved).

- **Auth/permissions.** Unchanged. `FORM_WRITE_ORIGIN` resolves to `principal-<UUID>` per precedent #25 (D5).

- **Enforcement point(s).** L1 schema gate inside `bindFrontmatterDoc.patch / rename / reorder` (D19). No L3 server hook (D10).

- **Observability.** Existing `recordFrontmatterEditSurface('form')` preserved. Per-op breakdown is Future Work. Existing `fs.*` traced writes (`fs-traced.ts`) cover persistence as today.

#### Data flow diagram

```
PropertyPanel.commit<op>(args)
  └─ binding.<patch | rename | reorder>(args)                  [bind-frontmatter-doc.ts]
       └─ L1 schema gate on pre-image (commit only — D19)
       └─ ydoc.transact(() => {                                 [origin: FORM_WRITE_ORIGIN]
           const fm   = stripFrontmatter(ytext.toString()).frontmatter   // FRONTMATTER_RE region detect
           const doc  = parseDocument(unwrapFrontmatterFences(fm))       // yaml@2 AST
           applyEdit(doc, args)                                          // patch / rename / reorder
           const next = withFences(String(doc))                          // re-stringify, re-fence
           ytext.delete(0, fm.length); ytext.insert(0, next)             // atomic byte-range replace
         })
                ↓
       Observer B fires (Y.Text → XmlFragment): FM stripped pre-parse;
       body unchanged on FM-only edit; XmlFragment untouched.
                ↓
       Bridge invariant watcher confirms equality.
                ↓
       onStoreDocument: ytext.toString() → disk (D26)
```

- **Primary flow:** PropertyPanel UI gesture → `binding.<op>` → `doc.transact` → Y.Text region replace → Observer B (no-op for body) → next `onStoreDocument` writes Y.Text verbatim to disk.
- **Shadow paths to test:**
  - **nil / missing:** doc with no FM region — `stripFrontmatter` returns `frontmatter === ''`; panel hidden; "Add Properties" button initiates the first FM block.
  - **empty:** FM region with `---\n---\n` (zero pairs) — panel shows empty state; add lands at bottom.
  - **wrong type:** Y.Text region malformed YAML — panel shows last-valid + banner (D21).
  - **timeout:** Hocuspocus reconnect mid-edit — provider's `synced` listener re-fires `binding.subscribe` listeners with fresh state.
  - **conflict:** two clients rename to same target — duplicate-name UI (D17), both lines on disk (D18).
  - **partial failure:** L1 schema fails on commit → no Y.Text mutation, inline error.

#### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| `bindFrontmatterDoc.patch / rename / reorder` | L1 schema fails | Zod `safeParse` returns `{ success: false }` | No Y.Text mutation; return `Result.err` to caller | Inline error overlay on the affected row |
| Y.Text region | Malformed YAML (source-mode user typed it) | `parseFrontmatterYaml` returns `parseError` | Panel renders last-valid map + banner (D21) | Non-blocking banner; user fixes in source mode |
| Drag-reorder | Concurrent remote edit during drag duration | Y.Text last-write-wins on overlapping byte range; bridge invariant watcher detects no violation | Local commit may stomp remote edit (D13 accepted trade-off) | Brief race-window edge case; surgical-edit upgrade in §15 Future Work |
| `onStoreDocument` | Disk write failure (FS error) | `fs-traced.ts` reports failure | Existing `wireFsTraced` retries / surfaces error per precedent | Disk write retry; user sees existing persistence error envelope |
| `applyAgentMarkdownWrite` | Agent submits malformed YAML in `frontmatter` field | Existing internal validation in agent-sessions | Existing error path | Agent-side error; not user-facing in panel |
| Source-mode + panel concurrent | Source-mode user editing FM while panel commits | Both serialize through Y.Text last-write-wins | Y.Text CRDT character-level merge for non-overlapping edits; LWW for overlapping | Same as any concurrent text edit in CodeMirror today |
| Activity unmount | PropertyPanel unmounts while observer is firing | `binding.dispose()` in cleanup | Subscription detached; no leak | None |

### Alternatives considered

- **Tail-rebuild fix on the existing per-key schema** (rejected). Would have solved the rename-reorder bug only — leaves dup-name silent overwrite, leaves commit-on-blur, leaves the dual-storage class of bugs. Larger spec investment for narrower outcome.
- **Stable-ID-keyed slots `Y.Map<id, {name: Y.Text, value: …}>`** (rejected during intake). Would have given keystroke-level CRDT on names without changing source-of-truth, but introduces an entirely new schema with stable-ID generation, ordering semantics, migration concerns, and YAML serialization at the boundary. Does not solve the dual-storage class.
- **Per-region projection cache** (`Y.Map('metadata-cache')` refreshed by a Y.Text observer; rejected). Would preserve fast-read for hot paths, but reintroduces the dual-storage divergence risk D8 explicitly eliminates. No identified read site needs sub-millisecond access that re-parsing typical FM doesn't satisfy.
- **`@codemirror/lang-yaml`'s `yamlFrontmatter`** for region detection (rejected for now per D3). Adds a dependency without clear value over `FRONTMATTER_RE`. Reconsider when source-mode decoration-based FM rendering becomes a Future Work item (Q27).
- **Surgical Pair-swap edit on drop** instead of full-region replace (deferred to §15 Future Work). Preserves more remote edits during the drag race window. D12 chose simplicity for v1; upgrade path is straightforward if D13's accepted trade-off proves unacceptable.

## 10) Decision log

| ID | Decision | Type (P/T/X) | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Property panel binds to YAML region of `Y.Text('source')`, not a separate per-key `Y.Map`. | T | DIRECTED | Effectively 1-way (greenfield rip-out) | User-stated architectural premise (intake). Mirrors `bindConfigDoc` sibling pattern; eliminates dual-storage class entirely. | `evidence/_user_outcomes.md`, `evidence/bindconfigdoc-sibling-pattern.md` | Supersedes predecessor D2/D7/D9/D10/D12/D13/D27/D30 (see `evidence/predecessor-decisions-superseded.md`) |
| D2 | `FORM_WRITE_ORIGIN` retains non-paired status; semantics shift from "metaMap-only edit" to "Y.Text-region edit". | T | LOCKED | Yes — STOP rule (paired-write origin discipline) | Binding still touches only one CRDT root (Y.Text). Observer B fires normally; body XmlFragment unchanged on FM-only edits. | `evidence/substrate-invariants.md` (paired-write discipline section) | Tests checking origin shape stay; Observer B normalize-gate must verify no loop on FM-only edits (see §11 OQ). |
| D3 | Region detection uses existing `FRONTMATTER_RE` regex from `packages/core/src/extensions/frontmatter.ts`. | T | DIRECTED | No | Codebase already standardized on this regex via `stripFrontmatter` / `prependFrontmatter` / `unwrapFrontmatterFences`. `@codemirror/lang-yaml` would add a dep without clear value at this stage. | `evidence/_init_worldmodel.md` §Patterns | If decoration-based source-mode rendering becomes a future spec, lang-yaml may be reconsidered then. |
| D4 | YAML editing on the FM region uses `yaml@2.x` `parseDocument(yaml, { uniqueKeys: false })` + `Document.toString()`. The `uniqueKeys: false` option is mandatory at every parseDocument call site in the new binding and `frontmatter-region.ts`. | T | LOCKED | No (predecessor D25 already locked the parser; this LOCKs the option) | Probe-verified (`evidence/yaml2-probe-results.md`): default `uniqueKeys: true` causes `Document.toString()` to throw on dup-key Documents. With `uniqueKeys: false`, both lines emit cleanly and round-trip correctly. Required for D17/D18 (dup-name UI + disk semantics) to be achievable. Comment preservation under reorder also confirmed (with documented edge case for document-start free-floating comments). | `evidence/yaml2-probe-results.md`, `evidence/bindconfigdoc-sibling-pattern.md`, predecessor SPEC D25 | Out-of-binding parsers (`page-identity.ts` regex reader, MCP `edit-document`) are unaffected. |
| D5 | Writer-ID resolution unchanged: `FORM_WRITE_ORIGIN` continues to resolve to `principal-<UUID>` per precedent #25. | T | LOCKED | No | Precedent #25 governs writer-ID taxonomy; FORM_WRITE_ORIGIN's structural `context.origin === 'form-write'` check is preserved. | `PRECEDENTS.md` #25, `frontmatter-edit-origin.ts` | No change to attribution tests. |
| D6 | Y.Text undo semantics for FM-region edits = native byte-level Y.UndoManager. No special handling for FM operations. | T | DIRECTED | No | Y.Text undo is byte-level by design; `FORM_WRITE_ORIGIN` is tracked by UndoManager already. Multi-step drag-reorder undo granularity is Future Work polish. | `PRECEDENTS.md` #24 / Y.UndoManager docs | Drag-undo step granularity remains an open UX-polish item (deferred). |
| D7 | "Add property" toolbar wiring stays as-is (`requestAddProperty(docName)` via `PropertyContext`). | T | DELEGATED | No | No reason to change the cross-tree signal — only the panel's response to it changes. | `packages/app/src/components/PropertyContext.tsx`, `EditorArea.tsx` | Implementer tweaks only if it gets in the way during implementation. |
| D8 | `Y.Map('metadata')` is **fully eliminated** as a CRDT root. No derived projection cache. All FM reads parse the YAML region of `Y.Text('source')` on demand. | T | LOCKED | Yes — 1-way for the FM-domain | Investigation: ~30 reader call sites across ~28 files (full enumeration in §17). None require sub-millisecond read latency that re-parsing typical FM (5-10 keys, <1KB) would not satisfy. Eliminating the map removes an entire dual-storage class of bugs. | `evidence/_init_worldmodel.md` §Connections, code grep enumeration | All `metaMap.get(...)` / `metaMap.set(...)` / `setFrontmatterFromYaml` / `writeFrontmatterDualSlot` / `getFrontmatterMap` / `getFrontmatter` call sites migrate to `stripFrontmatter(ytext.toString()).frontmatter` + `parseFrontmatterYaml`. |
| D9 | `observerMeta`, `metaDirty` flag, and meta-related branches in the settlement dispatcher are **deleted** (couples to D8). Observer A no longer observes metaMap. | T | DIRECTED | No | Direct consequence of D8; `Y.Map('metadata')` no longer carries FM state, so the deep observer is dead code. | `packages/server/src/server-observers.ts` (sites identified in worldmodel §Connections) | Reduces server-observer LOC; settlement-dispatcher precedent #13(b) governs remaining Observer A / B path. |
| D10 | The L3 validation hook + `frontmatter-edit-origin.ts` + CC1 broadcaster method `emitFrontmatterValidationRejected` + `frontmatter-validation-events.ts` + `cc1.ts` channel + persistence wiring + PropertyPanel rejection-subscription effect are **deleted** entirely. | X | LOCKED | Effectively 1-way (greenfield rip) | Predecessor's L3 was specifically to defend `metaMap.set` from non-binding writers. After D8, no such writers exist. Source-mode malformed YAML defended by D21 (panel last-valid render); file-watcher defended by `applyExternalChange` last-valid semantics; agent writes already validate internally. | `evidence/predecessor-decisions-superseded.md`, `evidence/substrate-invariants.md` | ~7 files deleted. Removes ~3 channels of complexity. Test files for L3 also deleted (`frontmatter-l3.test.ts`, `persistence-perkey.test.ts`'s L3 cases). |
| D11 | Binding API: hybrid contract — `patch(FrontmatterPatch)` for set/delete/add (RFC 7396 shape, today's contract), plus explicit `rename(oldKey, newKey)` and `reorder(orderedKeys: string[])` methods. All under one `doc.transact(fn, FORM_WRITE_ORIGIN)` per call. | T | DIRECTED | No (reversible — internal API) | Patch shape could be extended to ordered operations (RFC 6902 JSON Patch style), but explicit methods chosen for discoverability over a polymorphic ops-array shape, and to mirror `bindConfigDoc`'s patch + targeted-helpers pattern. The operation shapes are also genuinely different — set/delete keys vs. position swap. | `evidence/bindconfigdoc-sibling-pattern.md` | `binding.subscribe()` and `binding.current()` unchanged in shape; semantics shift to "parsed map from Y.Text region". |
| D12 | Drag-reorder commit = **full FM-region replace** on mouseup. Local visual reorder during drag (not committed); on drop, parse the FM region, swap `Pair`s in `Document.contents.items`, re-stringify, and replace the Y.Text region in one transact. | T | DIRECTED | No | Simpler implementation than surgical line-range edit. Concurrent-edit-during-drag race window is brief (drag duration 100-1000ms typical); accepted trade-off (D13). | `evidence/_init_worldmodel.md` §Patterns + §Unresolved | Comment preservation depends on yaml@2 `Document.toString()` behavior on Pair reorder (A1). Verify in implementation. |
| D13 | Concurrent-edit-during-drag is an accepted trade-off. If a remote peer edits a property's value while a local drag is in progress, the local mouseup commit may stomp the remote edit (Y.Text last-write-wins on overlapping byte ranges). | T | DIRECTED | No (revisitable in Future Work) | The race window is the drag duration. With surgical edit (Future Work option), only the moved Pair's lines would change, preserving remote edits to other properties. Today's choice prioritizes implementation simplicity. | Decision-protocol velocity calibration | If user reports stomp incidents in practice, surgical-edit strategy is the future-work upgrade path (logged in §15 Future Work). |
| D14 | Drag-and-drop library = `@dnd-kit/core` + `@dnd-kit/sortable`. | T | DIRECTED | Yes (3P dep selection) | `@dnd-kit` has built-in keyboard navigation, ARIA semantics, small bundle (~12KB gz core + ~6KB sortable), composable sensors, MIT license, actively maintained. `react-dnd` is older HOC-style API; `headless-tree` is tree-specific (FileTree); HTML5 native lacks keyboard a11y. | `evidence/_init_worldmodel.md` §3P landscape | Adds `@dnd-kit/core` + `@dnd-kit/sortable` to `packages/app/package.json`. |
| D15 | Add-property lands at the **bottom** of the panel (matches today's behavior + YAML-bottom convention). | P | DIRECTED | No | Predictable; consistent with how YAML insertion typically appends. Future enhancement (insertion-point landing) deferred. | Velocity-calibration default | One sentence in §6 acceptance. |
| D16 | Empty / whitespace-only name = transient valid **panel** state (renders with placeholder, no error during typing). Invalid for **commit** — no Y.Text mutation occurs until name is non-empty + L1-valid. | P | DIRECTED | No | Mid-typing the user's name field is naturally empty for a moment; surfacing an error there is hostile. Commit-gate prevents `: value` from landing in YAML. | `bindFrontmatterDoc` L1 gate covers commit | One row in §6 acceptance. |
| D17 | Duplicate-name UI = both rows rendered with a visible conflict marker (e.g., a warning icon + tooltip "Duplicate name"). Both rows remain editable. Renaming one to a unique value clears the marker. | P | DIRECTED | No | Surfaces the conflict to the user. Avoids silent overwrite. Less heavy-handed than refuse-at-commit. | Goal G3 in §2 | Couples to D18 disk semantics. |
| D18 | Duplicate-name disk semantics = both lines emitted by yaml@2 `Document.toString()`. Downstream readers (e.g., `page-identity.ts`) get last-wins on parse, which is acceptable per the user's "surface conflicts, don't overwrite" goal. | T | DIRECTED | No | yaml@2's `Document.toString()` emits all `Pair`s in `doc.contents.items` (assumption A6); duplicate-key behavior on parse is loader-specific but typically last-wins. | A6 (verify in implementation) | Couples to D17 UI. |
| D19 | L1 schema validation fires on **commit**, not per-keystroke. Per-keystroke validation would surface noise during typing. | X | DIRECTED | No | Mid-typing `tit` is not a valid frontmatter property in `FrontmatterPatchSchema`'s structural sense, but it's a valid transient typing state. Validation timing aligns with `bindFrontmatterDoc.patch`'s pre-commit gate. | `bindFrontmatterDoc` L1 contract | Tests assert: typing partial input does not fire L1 errors; commit gates do. |
| D20 | Read-pathway perf bailout = `YTextEvent.delta`-based positional check. The `ytext.observe(event => …)` callback receives a delta describing inserts/deletes by position. Track the FM region byte length from the last successful parse; on each event, walk the delta and bail out if every op's position is `>= cachedFmLen`. Re-parse only when the FM region byte range was actually touched. | T | LOCKED | No | `Y.Text.toString()` is O(n) in live-item count (verified in `node_modules/yjs/src/types/YText.js:935`) — not O(1) substring access. A naive `ytext.toString()` per body keystroke would walk the entire text + allocate a 100KB string for a long doc 60 fps. Delta-based bailout is O(delta size), pure local arithmetic. | yjs YText source, design-challenge Finding #3 | Implementation lives in the `useFrontmatterFromYText` hook (replacing `useFrontmatterMap`). |
| D21 | Error envelope: panel renders **last-valid** state when YAML region is unparseable (source-mode malformed YAML, file-watcher disk drift). An inline banner above the panel rows surfaces "Frontmatter YAML is malformed; fix in source mode to recover." Commit-time L1 errors continue to use the existing `FrontmatterValidationError` Zod shape (existing inline error UI). | X | DIRECTED | No | Replaces the deleted L3 surface. Last-valid behavior matches predecessor's `setFrontmatterFromYaml` "keep last valid" semantics. Banner is non-modal; user can continue editing valid properties. | `evidence/substrate-invariants.md`, predecessor `setFrontmatterFromYaml` | One row in §6 acceptance. |
| D22 | Drag accessibility via `@dnd-kit/sortable`'s built-in keyboard pattern: focus a row → space to lift → arrow keys to move → space/enter to drop, escape to cancel. ARIA roles via `useSortable`'s `attributes` + `listeners`. Announcements via `@dnd-kit`'s `accessibility` preset. | P | DIRECTED | No | OOTB pattern from D14's library choice. | `@dnd-kit` accessibility docs | One row in §6 acceptance. |
| D23 | YAML-special characters (`:`, `'`, `"`, `#`, leading whitespace, etc.) in property names: allowed in the panel's name input. yaml@2 `Document.toString()` auto-quotes when serializing. No UI-side rejection. | P | DIRECTED | No | yaml@2 handles quoting natively per its `parseDocument` ↔ `Document.toString()` round-trip guarantee. UI-side rejection would be over-restrictive. | `evidence/_init_worldmodel.md` §Patterns | Tests cover round-trip for keys with special chars. |
| D24 | Test plan layers: (a) unit `bind-frontmatter-doc.test.ts` covering set / delete / add / rename / reorder; (b) fidelity PBT `frontmatter-region-roundtrip.test.ts` covering `parse(serialize(parse(ytext_fm))) === parse(ytext_fm)` with arbitrary `FrontmatterMap` AND the comment-preservation cases from `evidence/yaml2-probe-results.md`; (c) integration multi-client convergence in test-harness (two-client editing different keys; drag while peer types); (d) E2E Playwright `frontmatter-edit.e2e.ts` covering rename-preserves-position, drag-reorder, dup-name marker; (e) **malformed-YAML fuzz layer** `frontmatter-malformed.test.ts` injecting unparseable bytes at all four entry points (source-mode keystroke producing transient invalid YAML; file-watcher delivering malformed disk content; agent write supplying malformed YAML; concurrent two-client interleaving producing unparseable merge state) and asserting: panel renders last-valid (FR9), disk persists Y.Text verbatim (D31), no bridge-invariant violation (FR10), no observer storm. | T | DIRECTED | No | Layers match the established testing tiers in the repo. PBT layer specifically guards bridge invariant + comment-preservation (A1) regression. Fuzz layer (e) is the **only** verification of the new threat model after L3 deletion (D10 + D31) — without it, "no defense gap" is unverified per design-challenge Finding #7. | `CLAUDE.md` Testing section, design-challenge Finding #7 | Tests live next to source per repo convention. |
| D25 | Agent-write integration: `applyAgentMarkdownWrite` and `applyAgentUndo` read FM via `stripFrontmatter(ytext.toString()).frontmatter`; remove `writeFrontmatterDualSlot` calls. **Specifically:** `agent-sessions.ts:129` currently reads `existingFm = metaMap.get('frontmatter')` — migrate to Y.Text read. `applyAgentUndo` (`agent-sessions.ts:264-265`) already reads FM from Y.Text per worldmodel I-12 — verify and preserve. Remove `writeFrontmatterDualSlot` call at `agent-sessions.ts:175` and any other persistence-mirror sites. | T | DIRECTED | No | Mechanical migration; per-session paired origin discipline preserved. | `packages/server/src/agent-sessions.ts:129, 175, 264-265`, worldmodel I-11/I-12, audit Finding 1 | Tests in `api-agent-frontmatter.test.ts` re-pointed at Y.Text reads. |
| D26 | Persistence simplification: `onStoreDocument` writes `ytext.toString()` directly to disk. `composeFrontmatterForStore` deleted. `onLoadDocument` populates Y.Text with full file content; `writeFrontmatterDualSlot` calls deleted. | T | DIRECTED | Yes (1-way for the persistence layer) | Y.Text already mirrors disk + FM region; no recomposition needed. Comment preservation falls out naturally from yaml@2 round-trip on FM-region edits. | `evidence/predecessor-decisions-superseded.md`, predecessor D8 (canonical YAML on disk) preserved | Tests in `persistence-perkey.test.ts` migrated; some cases delete (per-key-specific). |
| D27 | Graph / backlinks subsystem unaffected: `page-identity.ts` reads disk content via regex (not Y.Doc); `live-derived-index.ts` and `suggest-links.ts` use `getFrontmatter(doc) + prependFrontmatter` to recompose strings — both migrate to `stripFrontmatter(ytext.toString())` reads. | T | DIRECTED | No | Verified via code grep (Step 5 investigation). No deeper coupling. | code grep enumeration | Two-line migration in each consumer. |
| D28 | Source-mode ↔ panel coupling = `ytext.observe` directly. No separate signal. CodeMirror's `yCollab` and the panel's observer attach to the same Y.Text and converge naturally. | T | DIRECTED | No | Simplest possible coupling; matches `bindConfigDoc`'s subscribe pattern. | `evidence/bindconfigdoc-sibling-pattern.md` | Verified in integration test. |
| D29 | Activity-mount discipline: `ytext.observe` subscription lives inside the PropertyPanel mounted within `EditorActivityPool` entry, bound by `ACTIVITY_MOUNT_LIMIT=3` per precedent #18(c). Same bound as today's `metaMap.observeDeep`. | T | LOCKED | No | STOP rule: Y.js observers are not React effects; bounding via Activity-pool is mandatory. | `PRECEDENTS.md` #18(c), CLAUDE.md substrate | Subscription disposal on Activity unmount preserved. |
| D30 | Malformed-YAML failure mode: panel renders last-valid + banner per D21. No automatic revert (L3 deleted per D10). User fixes by editing source mode. | X | DIRECTED | No | Aligned with the user's source-of-truth model (Y.Text holds whatever is in source mode); minimum-surprise. | D10, D21 | One row in §6 acceptance. |
| D31 | Threat model: **Y.Text region IS the source of truth**, including malformed bytes. No parse-on-store gate, no automatic revert, no defense beyond commit-time L1 in the binding (already there) + read-time graceful degradation in the panel (D21). Disk persists what `Y.Text` says, even if malformed. This is intentional alignment with the user-stated "Y.Text is the truth" intake direction. | X | LOCKED | Yes — invariant; defines the post-D10 threat model | Resolves the A3 circularity (challenge Finding #1): A3's reference to `setFrontmatterFromYaml`'s "keep last valid" semantics is moot because that function is deleted under D26. The new threat model accepts that whatever bytes are in the FM region of Y.Text are the truth; defense moves to the binding's L1 commit gate (against UI-driven malformed inputs) and the panel's last-valid render (against transient invalid states from source-mode typing or disk drift). Malformed-disk-YAML round-trip is **acceptable** — the file watcher, `applyExternalChange`, and `onStoreDocument` all faithfully mirror disk ↔ Y.Text without an extra parse gate. | design-challenge Finding #1, A3 circularity resolution | Implementer must NOT silently introduce a parse-on-store check or any L3-class infrastructure. If telemetry on malformed-YAML occurrence is desired, a structured WARN log at `onStoreDocument` is acceptable — but it must NOT block the write or revert the document. |
| D32 | Observer A baseline refresh after FM-only Y.Text edits: rely on the existing **already-in-sync gate** at `server-observers.ts:369` (`normalizeBridge(currentText) === normalizeBridge(md)`). After Observer Meta deletion (D9), pure FM-only edits do not trigger Observer A directly. Path A's three-way merge sees `lastSyncedXmlMd` as the diff pre-image; on the next body edit that DOES trigger A, the already-in-sync gate detects baseline drift and refreshes via the gate's natural path. **Verified by extending the C-matrix integration test** (D24 layer c) to cover: peer A makes pure FM edit → peer B makes body edit → assert no bridge-invariant violation, no content loss. | T | LOCKED | Yes — substrate invariant | Audit Finding 4 + design-challenge Finding #4. The alternatives (Y.Text observer that force-refreshes baseline; explicit `xmlDirty=true` from FM edit) add infrastructure for a problem the existing gate already handles. The C-matrix verification test makes this **explicit** rather than relying on STOP_IF discovery during implementation. | `server-observers.ts:369`, `evidence/substrate-invariants.md`, audit Finding 4 | Test scenario lands in D24 layer c. If the C-matrix test reveals the gate is insufficient, fall back to alternative (b) — add a Y.Text observer that triggers baseline refresh — but design as a follow-up, not blocking this spec. |
| D33 | FM region size limit: enforce `MAX_FM_REGION_BYTES = 65536` (64 KB) at the binding's L1 commit gate. Refuse commits that would push the region above the limit (return `Result.err` with `code: 'SCHEMA_INVALID'` + `detail: 'Frontmatter region exceeds 64KB limit'`). Source-mode user can still type past the limit (Y.Text accepts any bytes); the next `onStoreDocument` writes whatever's in Y.Text — but the panel will refuse new commits until the user trims. | X | DIRECTED | No | Closes the unbounded-region attack surface (challenge Finding #8). 64 KB is generous (typical FM is <1 KB; the limit guards against pathological cases). At the binding L1, this is ≤5 LOC. | design-challenge Finding #8 | Constant declared in `frontmatter-region.ts`; tested in `bind-frontmatter-doc.test.ts`. |

## 11) Open questions

All P0 questions resolved into §10 (D8–D30). Deferred items live in §15 Future Work.

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| _(none open)_ | | | | | | |

### Resolved this iteration (mapped from §10)

| Question | Resolution → Decision |
|---|---|
| Q1 — Y.Map fate | D8 (full elimination) |
| Q2 — L3 hook fate | D10 (delete entirely) |
| Q3 — Binding contract | D11 (hybrid: patch + rename + reorder) |
| Q4 — Drag commit strategy | D12 (full-region replace on drop) |
| Q5 — Comment preservation under reorder | A1 (probe-verified — `evidence/yaml2-probe-results.md`; promoted to HIGH confidence) |
| Q6 — Concurrent-edit during drag | D13 (accepted trade-off; surgical-edit upgrade path in §15) |
| Q7 — DnD library | D14 (`@dnd-kit/core` + `@dnd-kit/sortable`) |
| Q8 — Add landing | D15 (bottom) |
| Q9 — Empty name | D16 (transient panel state, no commit until valid) |
| Q10 — Dup-name UI | D17 (both rows + conflict marker) |
| Q11 — Dup-name disk | D18 (both lines emitted; A6 probe-verified — `evidence/yaml2-probe-results.md`; requires `parseDocument({ uniqueKeys: false })` per D4) |
| Q12 — L1 timing | D19 (commit-only) |
| Q13 — Read perf | D20 (byte-range string-equality bailout; A2 verified) |
| Q14 — Error envelope | D21 (last-valid + inline banner) |
| Q15 — Drag a11y | D22 (`@dnd-kit/sortable` keyboard pattern) |
| Q16 — YAML-special chars | D23 (allowed; yaml@2 auto-quotes) |
| Q17 — Test plan | D24 (4 layers: unit / fidelity PBT / integration / E2E) |
| Q18 — Agent-write integration | D25 |
| Q19 — Persistence simplification | D26 |
| Q20 — Graph/backlinks subsystem coupling | D27 |
| Q21 — Source-mode coupling | D28 |
| Q22 — Activity-mount discipline | D29 |
| Q23 — Test churn enumeration | Investigated — 28 files identified, listed in §13 In Scope |
| Q24 — Malformed-YAML failure modes | D30 (panel last-valid + banner; no L3 revert) |
| Q25 — Observer Meta deletion | D9 (deleted; couples to D8) |

### Cross-cutting concerns (resolved)

- **Error envelope (D21, D30):** panel renders last-valid + inline banner for parse errors; commit errors via existing `FrontmatterValidationError` Zod shape (existing inline error UI). No L3 revert (D10).
- **L1/L2/L3 defense pattern (D10):** L1 retained at the binding (commit-time schema gate); L2 not needed (no headless writer for FM beyond agent-sessions, which already validates internally); L3 deleted entirely.
- **Telemetry naming:** existing `recordFrontmatterEditSurface('form')` preserved; per-op breakdown is Future Work.
- **Idempotency:** Y.Text byte-range edits are not idempotent at the CRDT level — applying the same insert twice produces different state. The binding's `doc.transact(fn, FORM_WRITE_ORIGIN)` wrapping guards against double-commit on a single user gesture (one transact per UI commit).

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `yaml@2.x` `Document.toString()` preserves comment placement when `Pair`s are reordered in `doc.contents.items`, with one acceptable edge case (document-start free-floating comments may shift if a key is moved to position 0). | HIGH | **Probe-verified:** `evidence/yaml2-probe-results.md`. | Resolved 2026-04-30 | Resolved |
| A2 | `YTextEvent.delta`-based bailout (D20) is O(delta size) per event, vs. the rejected naive `ytext.toString()` strategy that would be O(n) per event. Implementation-time micro-benchmark confirms no measurable regression in body-edit p99 latency. | HIGH | Micro-benchmark during implementation comparing delta-based bailout vs. `ytext.toString()`-based bailout under 60 fps keystroke synthetic load with FM size 5–10 keys + body 1–100 KB. | During implementation (D24 perf assertion) | Active |
| A3 | _Resolved by D31._ The new threat model is "Y.Text region IS the source of truth, including malformed bytes." There is no `setFrontmatterFromYaml` "keep last valid" defense after D26 deletes that function — defense moves to L1 commit gate + panel last-valid render. Malformed-disk-YAML round-trip is acceptable (D31). | n/a | n/a | Resolved 2026-04-30 (A3 superseded by D31) | Resolved |
| A4 | Substrate bridge invariant continues to hold under Y.Text-region FM edits. | HIGH | `attachBridgeInvariantWatcher` in test harness; C-matrix integration test (D24 layer c). | Step 5 iteration | Active |
| A5 | `applyAgentUndo` already reads FM from Y.Text per worldmodel I-12. `applyAgentMarkdownWrite` reads `existingFm` from `metaMap.get('frontmatter')` (`agent-sessions.ts:129`) and is a **mechanical migration** to `stripFrontmatter(ytext.toString()).frontmatter`. After migration, no `writeFrontmatterDualSlot` calls remain. | MED | Code trace + migration in implementation per D25; verified via `api-agent-frontmatter.test.ts` re-pointed at Y.Text reads. | During implementation | Active |
| A6 | `yaml@2.x` with `parseDocument(yaml, { uniqueKeys: false })` + `Document.toString()` emits both entries when two `Pair`s have the same key. Downstream `toJSON()` returns last-wins; iterating `doc.contents.items` returns all entries. | HIGH | **Probe-verified:** `evidence/yaml2-probe-results.md`. Requires `uniqueKeys: false` at every parseDocument call site in the new binding (D4). | Resolved 2026-04-30 | Resolved |

## 13) In Scope (implement now)

Covers G1–G6 in §2. Every FR1–FR14 maps to a §10 decision; resolution completeness gate (§8 of /spec workflow) passes — see verification matrix below.

### Goals
- G1 — Realtime keystroke CRDT on names + values.
- G2 — Order preserved across all edits.
- G3 — Duplicate names representable, surfaced in UI.
- G4 — Drag-to-reorder as "move selected text".
- G5 — Net complexity reduction (~7 L3 files deleted; Y.Map metadata schema removed).
- G6 — No bridge regression.

### Non-goals (carry from §3)
NG1–NG6.

### Requirements with acceptance criteria
See §6 — FR1 through FR14, each with specific ACs.

### Proposed solution
See §9.

### Owner / DRI
Andrew Mikofalvy.

### Next actions (sequencing — not exhaustive)

1. **Add primitives** — `bindFrontmatterDoc` rewrite (D11): `patch / rename / reorder / current / subscribe / dispose` reading + writing Y.Text region. Helper `frontmatter-region.ts` for parse-edit-stringify primitives. Reuse `parseFrontmatterYaml`, `stripFrontmatter`, `prependFrontmatter`, `withFences`, `unwrapFrontmatterFences`.
2. **Migrate readers** — every site listed below switches from `metaMap.get(...)` / `getFrontmatter(doc)` to `stripFrontmatter(ytext.toString()).frontmatter` + `parseFrontmatterYaml`.
3. **Delete predecessor infra (D9 + D10 + D26):** `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, `frontmatter-validation-events.ts`, `cc1.ts` channel + broadcaster method, persistence-context wiring, PropertyPanel L3 subscription effect, `composeFrontmatterForStore`, `writeFrontmatterDualSlot`, Observer Meta + metaDirty, `setFrontmatterFromYaml`, `setFrontmatterProperty`, per-key `getFrontmatterMap`/`getFrontmatter` (replaced by inline Y.Text region read + parse). Delete corresponding test files (`frontmatter-l3.test.ts`, `persistence-perkey.test.ts`, `frontmatter-perkey-roundtrip.test.ts`).
4. **PropertyPanel rewrite** — `useFrontmatterMap` becomes `useFrontmatterFromYText` (snapshots region + content-equality bailout per D20); `commitPatch` / `renameProperty` route through new binding methods; add `@dnd-kit` integration for drag with keyboard a11y (D14, D22); duplicate-name marker UI (D17); banner for malformed YAML (D21).
5. **Server-side cleanup** — `applyAgentMarkdownWrite` / `applyAgentUndo` read FM from Y.Text (D25); `api-extension.ts` rollback handler legacy-slot mirror removed; `live-derived-index.ts` and `suggest-links.ts` migrate to ytext FM read (D27).
6. **Persistence simplification** — `onStoreDocument` writes `ytext.toString()` directly; `onLoadDocument` populates Y.Text only; `applyExternalChange` drops dual-slot call (D26).
7. **Tests** — D24 four layers: unit (`bind-frontmatter-doc.test.ts`), fidelity PBT (`frontmatter-region-roundtrip.test.ts`), integration (multi-client convergence in test-harness), E2E (`frontmatter-edit.e2e.ts`). A1, A2, A6 verified during this phase.
8. **Verify substrate invariants** — `attachBridgeInvariantWatcher` reports zero violations across new test scenarios (FR10).
9. **Run `bun run check` to green** before merging (D24 quality gate).

### Test churn enumeration (D24, FR11+FR12)

28 files identified by code grep at baseline `c1c76cb7`. Classification (read full list in §17 below or `evidence/_init_worldmodel.md` §"Summary table"):

- **Delete** (per-key/L3-specific): `packages/server/src/frontmatter-l3.test.ts`, `packages/server/src/persistence-perkey.test.ts`, `packages/app/tests/fidelity/frontmatter-perkey-roundtrip.test.ts`.
- **Substantial rewrite**: `packages/core/src/bridge/bind-frontmatter-doc.test.ts` (covers new API surface), `packages/core/src/bridge/frontmatter-y.test.ts` (most cases delete; a few migrate to test ytext-region helpers), `packages/server/src/server-observers.test.ts` (Observer Meta cases delete; FORM_WRITE non-paired cases migrate), `packages/server/src/api-agent-frontmatter.test.ts`, `packages/server/src/external-change.test.ts`, `packages/app/tests/fidelity/bridge-observer-conversion.test.ts`, `packages/app/src/editor/observers.test.ts`, `packages/app/tests/integration/session-undo-manager.test.ts`.
- **Re-point** (one-line migration): `packages/app/tests/integration/test-harness.ts` (lines 861, 961 — ytext read), `packages/app/tests/integration/attribution-sweep-coverage.test.ts` (binding origin reference).
- **New**: `packages/core/src/bridge/bind-frontmatter-doc.test.ts` (D11 API), `packages/app/tests/fidelity/frontmatter-region-roundtrip.test.ts` (D24 layer b PBT), `packages/app/tests/e2e/frontmatter-edit.e2e.ts` (D24 layer d).

### Risks + mitigations
See §14.

### What gets instrumented/measured
Existing `recordFrontmatterEditSurface('form')`. No new instrumentation in this scope.

### Resolution completeness gate (verification)

| Item | Decisions resolved | 3P deps named | Architecture validated | Integration confirmed | ACs verifiable | No FW dep |
|---|---|---|---|---|---|---|
| FR1 (realtime keystroke) | D11, D20 | none | yes (`bindConfigDoc` precedent) | yes (D24 layer c) | yes | yes |
| FR2 (rename preserves position) | D8, D11 | none | yes | yes (unit + E2E) | yes | yes |
| FR3 (order preserved on non-reorder edits) | D8, D11 | none | yes | yes (PBT) | yes | yes |
| FR4 (drag-reorder commit) | D12, D14 | `@dnd-kit/core` + `@dnd-kit/sortable` | yes | yes (E2E) | yes | yes |
| FR5 (drag a11y) | D14, D22 | `@dnd-kit` (built-in) | yes | yes (E2E + axe-core) | yes | yes |
| FR6 (dup-name surfacing) | D17, D18, A6 | none | yes (assumption A6 verified during impl) | yes (unit + E2E) | yes | yes |
| FR7 (empty name) | D16, D19 | none | yes | yes (unit) | yes | yes |
| FR8 (add lands at bottom) | D15 | none | yes | yes (unit + E2E) | yes | yes |
| FR9 (malformed YAML banner) | D21, D30 | none | yes | yes (unit + integration) | yes | yes |
| FR10 (bridge invariant) | D2, A4 | none | yes | yes (`attachBridgeInvariantWatcher`) | yes | yes |
| FR11 (L3 infra removed) | D10 | none | yes | yes (`bun run check`) | yes | yes |
| FR12 (`Y.Map('metadata')` removed for FM) | D8, D9 | none | yes | yes (`bun run check`) | yes | yes |
| FR13 (persistence writes ytext to disk) | D26 | none | yes | yes (regression) | yes | yes |
| FR14 (agent-write Y.Text reads) | D25 | none | yes (migration target validated, ~3-line edit at `agent-sessions.ts:129, 175, 264-265`) | yes (`api-agent-frontmatter.test.ts` re-pointed) | yes | yes |

**Collective check:** All FRs together deliver an end-to-end user-visible outcome (knowledge worker editing FM in PropertyPanel as realtime CRDT) without dependency on any §15 Future Work item.

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Greenfield cutover | Single PR; no migration. User confirmed safe to kill/restart client and server. | `bun run check` green; manual QA in dev env |
| Bun lockfile churn (new `@dnd-kit` deps) | Run `bun install` after package.json change; commit `bun.lock` per CLAUDE.md `bun.lock` merge-conflict guidance | `bun install` clean diff |
| Test churn breadth | Land delete-and-rewrite of test files in same PR as source changes | `bun run check` per package |
| Worktree gotcha | Always `bun install` in worktree before `bun run check` per CLAUDE.md | First `bun run check` post-checkout |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Re-parsing YAML on every body keystroke regresses source-mode editing perf | MED | High (customer-visible) | Q13 — content-equality bailout strategy; benchmark before merging | Andrew |
| Comment placement degrades over drag-reorder cycles | MED | Med (gradual disk-content drift) | Q5 — `yaml@2` probe; choose surgical-edit strategy in Q4 if probe fails | Andrew |
| Concurrent edit during drag stomps remote write — **the stomp window is `dragstart` → `mouseup` → server broadcast (multi-second under network jitter), and the overlap is the entire FM region, not just the moved Pair's lines**. Any concurrent value edit on any key by any peer is at risk. | MED | **HIGH (data loss across multiple peers' concurrent edits, not just one)** — escalated 2026-04-30 per design-challenge Finding #5. v1 ships D12 full-region replace; surgical-edit upgrade stays in §15 Future Work. Triggers to promote surgical-edit upgrade into scope: any user-reported stomp incident in practice; multi-user editing becoming a common pattern. | D12 v1 ships as-is with explicit risk acceptance; §15 Future Work item carries the upgrade-path implementation sketch | Andrew |
| Eliminating L3 leaves a malformed-YAML write through that no other layer catches | LOW | Med (can ship corrupt YAML) | Q2 — trace defense surfaces; A3 verification | Andrew |
| Test churn is larger than anticipated (predecessor's per-key tests + L3 tests + integration matrix) | HIGH | Low (mechanical work) | Q23 — early enumeration | Andrew |

## 15) Future Work

### Explored
- **Surgical Pair-swap drag-reorder (Q4 alternative).**
  - What we learned: full-region replace (D12) chosen for v1; surgical line-range edit preserves more concurrent remote edits during the drag race window.
  - Recommended approach: parse Y.Text region into yaml@2 `Document`, capture moved Pair's source line range, delete those lines from Y.Text, re-stringify just the moved Pair, insert at target byte offset — all in one transact.
  - Why not in scope now: implementation simplicity for v1; D13 accepts the brief race-window stomp risk.
  - Triggers to revisit: user reports concurrent-edit-during-drag stomp incidents; multi-user editing becomes more common.
  - Implementation sketch: `binding.reorder(orderedKeys)` internals branch on a feature flag; surgical strategy lives in `frontmatter-region.ts` alongside the v1 strategy.

### Identified
- **Source-mode panel rendering (Q27).**
  - What we know: `@codemirror/lang-yaml`'s `yamlFrontmatter` parser exists; `Decoration.replace` + `WidgetType` is the canonical CM6 region-rendering primitive; `source-polish/view-plugin.ts` is an internal precedent for region-scoped decorations.
  - Why it matters: source-mode users currently see raw YAML; rendering the structured panel inline would bring the same UX to source mode.
  - What investigation is needed: feasibility of mounting React-rendered widgets inside CM6 via `WidgetType` + the cost of bidirectional cursor mapping during region-replace.
- **Per-operation telemetry breakdown (Q26).**
  - What we know: existing `recordFrontmatterEditSurface('form')` lives in `frontmatter-telemetry.ts`.
  - Why it matters: observability into op mix would inform UX iteration.
  - What investigation is needed: minimal — an enum extension + call-site updates.
- **Per-property CRDT identity for advanced features (audit Finding 11 + challenge Finding #8).**
  - What we know: this spec surrenders per-property CRDT identity (NG6 expanded). The Y.Text-region model has no stable per-property handle — properties are byte ranges that move on every edit.
  - Why it matters: future features that want per-property identity — per-property version history (`Y.UndoManager` scoped to a single key); per-property comments / suggestions (Google-Docs-style "comment on this property"); per-property awareness ("two cursors editing the same property") — would need to reconstruct identity by mapping yaml@2's `Pair` byte ranges at every operation.
  - What investigation is needed: design a stable-property-id layer derived from Pair source-position tracking IF a feature in this class is funded. Non-trivial; couples binding to yaml@2 emitter internals.

### Noted
- Un-parking `frontmatter_patch` MCP tool (NG1).
- New widget types beyond the 5 LOCKED set (NG2).
- Schema-driven property name autocomplete (NG3).
- Bulk frontmatter editing across docs (NG4).
- Custom YAML formatting preferences (NG5).
- Drag-undo step granularity tuning (Q30 from earlier OQ list).
- Auto-scroll-during-drag (Q28 from earlier OQ list).
- Edit-during-drag interaction polish (Q29 from earlier OQ list).

## 16) Agent constraints

- **SCOPE:**
  - `packages/core/src/bridge/bind-frontmatter-doc.ts` — rewrite to D11 contract.
  - `packages/core/src/bridge/frontmatter-y.ts` — most fns delete; a few may move to `frontmatter-region.ts` (new helper module under `packages/core/src/bridge/`).
  - `packages/core/src/bridge/index.ts` — export adjustments.
  - `packages/server/src/server-observers.ts` — delete Observer Meta + metaDirty + meta-related settlement-dispatcher branches.
  - `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite` + `applyAgentUndo` read FM from Y.Text; remove `writeFrontmatterDualSlot` calls.
  - `packages/server/src/persistence.ts` — `onLoadDocument` simplification (no per-key population); `onStoreDocument` writes `ytext.toString()` directly; remove L3 wiring.
  - `packages/server/src/external-change.ts` — drop dual-slot mirror call.
  - `packages/server/src/api-extension.ts` — rollback handler legacy-slot mirror removed.
  - `packages/server/src/live-derived-index.ts`, `packages/server/src/suggest-links.ts` — migrate `getFrontmatter(doc)` → ytext-region read.
  - `packages/app/src/components/PropertyPanel.tsx` — read pathway switches to ytext.observe; commit pathway switches to new binding methods; add `@dnd-kit` integration; duplicate-name marker; banner.
  - `packages/app/src/editor/TiptapEditor.tsx` — replace legacy slot reads (lines 649, 654 per worldmodel) with ytext-region reads.
  - Test files per §13 "Test churn enumeration" — delete / rewrite / re-point.
  - `packages/app/package.json` — add `@dnd-kit/core` + `@dnd-kit/sortable`.
  - **DELETE:** `packages/server/src/frontmatter-l3.ts`, `packages/server/src/frontmatter-edit-origin.ts`, `packages/server/src/frontmatter-l3.test.ts`, `packages/server/src/persistence-perkey.test.ts`, `packages/app/src/lib/frontmatter-validation-events.ts`, `packages/app/tests/fidelity/frontmatter-perkey-roundtrip.test.ts`.
  - **DELETE from CC1 schemas:** `packages/core/src/schemas/cc1.ts` channel `frontmatter-validation-rejected` + `emitFrontmatterValidationRejected` from `packages/server/src/cc1-broadcast.ts`.
  - **NEW:** `packages/core/src/bridge/frontmatter-region.ts` (parse-edit-stringify primitives), `packages/app/tests/fidelity/frontmatter-region-roundtrip.test.ts`, `packages/app/tests/stress/frontmatter-edit.e2e.ts`, `packages/app/tests/fidelity/frontmatter-malformed.test.ts` (fuzz layer per D24 layer e).

- **EXCLUDE:**
  - `packages/cli/src/mcp/tools/frontmatter-patch.ts` — stays parked. Do not unpark.
  - `packages/server/src/page-identity.ts` — disk regex reader, unaffected.
  - `packages/server/src/frontmatter-telemetry.ts` — preserve as-is; per-op breakdown is Future Work.
  - `packages/cli/src/mcp/tools/edit-document.ts` and FM-rejection logic in `api-extension.ts` (`ok.frontmatter.agent_patch_fm_touch_total`) — body-only, unaffected.
  - The bridge invariant watcher itself (`attachBridgeInvariantWatcher` in test harness) — verify, do not modify.
  - The `Y.XmlFragment('default')` body bridge code paths (Observer A body sync, Observer B body sync) — preserved per FR10.
  - Any `__system__`, `__config__`, `__user__` doc handling — separate domain.

- **STOP_IF:**
  - The substrate bridge invariant (`stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`) fails in any integration test scenario.
  - `bun run check` produces a regression in body-edit perf benchmarks (existing `packages/core/tests/perf/baseline.json`).
  - The C-matrix test extending FR10 + D32 (peer A pure FM edit + peer B body edit) reveals that the existing `already-in-sync gate` at `server-observers.ts:369` does NOT refresh `lastSyncedXmlMd` — surface to user; fall back to D32 alternative (b) (Y.Text observer that triggers baseline refresh).
  - Drag-reorder commit MUST recompute the FM region byte range inside `doc.transact` immediately before the byte-range replace, never use a snapshot from `dragstart`. If a remote peer's body edit shifts the FM region's byte offsets mid-drag, a snapshot from dragstart would point into the body and corrupt it. Verified by integration test (peer A drags; peer B inserts at byte 0 mid-drag; assert peer A's drop targets the post-shift FM region).
  - `attachBridgeInvariantWatcher` reports any violation in the new fuzz-layer (D24 layer e) tests for malformed YAML at any of the four entry points.
  - Any agent-write attribution test fails (`attribution-sweep-coverage.test.ts` or `api-agent-frontmatter.test.ts`).
  - Net file-count delta is positive (this spec is supposed to *reduce* code; new files only for `frontmatter-region.ts` + new tests; everything else nets negative).
  - Implementation introduces a parse-on-store check or any L3-class infrastructure (violates D31). Structured WARN logging at `onStoreDocument` is acceptable; blocking the write or reverting the document is not.

- **ASK_FIRST:**
  - Adding any 3P dependency beyond `@dnd-kit/core` + `@dnd-kit/sortable` (e.g., a YAML-region-specific parser, a virtual-list library for the panel rows).
  - Re-opening any `LOCKED` decision (D2, D4, D5, D8, D10, D29) — these are 1-way doors; surface evidence and confirm.
  - Re-introducing any form of `Y.Map('metadata')` write surface (defeats D8).
  - Adding a server-side validation hook outside `onStoreDocument` (re-opens D10).
  - Changing the `FORM_WRITE_ORIGIN` shape (re-opens D2 + STOP rule).
  - Modifying `applyAgentMarkdownWrite`'s composition order or session-origin discipline (precedent #24 + D25).

## 17) Test churn manifest (full list)

Full enumeration from code grep at baseline `c1c76cb7`. See §13 §"Test churn enumeration" for classification.

```
packages/app/src/components/PropertyPanel.tsx
packages/app/src/editor/TiptapEditor.tsx
packages/app/src/editor/observers.test.ts
packages/app/src/lib/frontmatter-validation-events.ts          [DELETE]
packages/app/tests/fidelity/bridge-observer-conversion.test.ts
packages/app/tests/fidelity/frontmatter-perkey-roundtrip.test.ts [DELETE]
packages/app/tests/integration/attribution-sweep-coverage.test.ts
packages/app/tests/integration/session-undo-manager.test.ts
packages/app/tests/integration/test-harness.ts
packages/core/src/bridge/bind-frontmatter-doc.test.ts          [REWRITE]
packages/core/src/bridge/bind-frontmatter-doc.ts
packages/core/src/bridge/frontmatter-y.test.ts                 [REWRITE]
packages/core/src/bridge/frontmatter-y.ts                      [SHRINK or DELETE; helpers move to frontmatter-region.ts]
packages/core/src/bridge/index.ts
packages/core/src/frontmatter/schema.ts                        [STAY]
packages/core/src/index.ts
packages/server/src/agent-sessions.ts
packages/server/src/api-agent-frontmatter.test.ts              [REWRITE]
packages/server/src/api-extension.ts
packages/server/src/external-change.test.ts                    [REWRITE]
packages/server/src/external-change.ts
packages/server/src/frontmatter-edit-origin.ts                 [DELETE]
packages/server/src/frontmatter-l3.test.ts                     [DELETE]
packages/server/src/frontmatter-l3.ts                          [DELETE]
packages/server/src/live-derived-index.ts
packages/server/src/persistence-perkey.test.ts                 [DELETE]
packages/server/src/persistence.ts
packages/server/src/server-observers.test.ts                   [REWRITE]
packages/server/src/server-observers.ts
packages/server/src/standalone.ts                              [STAY — verify no L3 wiring left]
packages/server/src/suggest-links.ts
packages/server/src/cc1-broadcast.ts                           [SHRINK — remove emitFrontmatterValidationRejected]
packages/core/src/schemas/cc1.ts                               [SHRINK — remove frontmatter-validation-rejected channel]
```

New files: `packages/core/src/bridge/frontmatter-region.ts`, `packages/app/tests/fidelity/frontmatter-region-roundtrip.test.ts`, `packages/app/tests/stress/frontmatter-edit.e2e.ts` (Playwright; `tests/stress/` is the canonical Playwright `*.e2e.ts` location per repo convention), `packages/app/tests/fidelity/frontmatter-malformed.test.ts` (D24 layer e fuzz suite).
