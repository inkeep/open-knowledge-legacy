# Frontmatter Editing UX — Spec

**Status:** Approved (audit + design-challenge passed; all P0 OQs closed; all decisions LOCKED / DIRECTED)
**Owner(s):** Sarah (sarah@inkeep.com)
**Last updated:** 2026-04-24
**Baseline commit:** e5751346
**Links:**

- Research report: [reports/frontmatter-editing-ux-patterns/REPORT.md](../../reports/frontmatter-editing-ux-patterns/REPORT.md)
- Evidence: [`./evidence/`](./evidence/)
- Process changelog: [`./meta/_changelog.md`](./meta/_changelog.md)
- Tracking: _to be filed_

---

## 1) Problem statement

**Situation.** [[Open Knowledge]] is a collaborative WYSIWYG markdown editor (TipTap + CodeMirror source mode; Y.js / Hocuspocus CRDT). Every `.md`/`.mdx` under `content.dir` is an Open Knowledge document, and frontmatter carries first-class structure — `title`, dates, `topics`, `subjects`, `status`, owners, cross-links — across thousands of markdown files in this repo (specs / reports / stories / projects / docs all rely on it). Today frontmatter is stored as a single YAML string at `Y.Map('metadata')['frontmatter']` and is editable only by toggling to source mode and writing raw YAML by hand.

**Complication.** Three compounding costs:

1. **UX barrier for non-developers.** WYSIWYG mode has no metadata affordance. Common edits — change title, add a tag, flip status — require source-mode YAML literacy. A hard wall for non-developer authors and friction for everyone else.
2. **CRDT correctness under multi-writer pressure.** Single-string storage gives document-level last-write-wins on the entire frontmatter block. Concurrent edits from a human and an MCP agent (or two humans) to *different* fields silently overwrite each other. Incidence grows as MCP-driven authoring scales.
3. **Mode-switch tax.** Even authors comfortable with YAML pay a context-switch cost when metadata edits could be inline.

**Resolution.** A top-of-document property table in WYSIWYG mode (Obsidian-style: typed form fields above the body), backed by per-key `Y.Map` storage so concurrent edits to different properties merge at the field level. Source mode continues to show raw YAML; YAML on disk remains the source of truth. MVP target is non-developer human authors; existing developer / MCP / file-watcher paths are constraints to preserve, not personas to design for.

## 2) Goals

- **G1:** Non-developer authors can read, change, add, and remove frontmatter properties without leaving WYSIWYG mode or touching raw YAML.
- **G2:** Concurrent edits from humans and MCP agents to *different* frontmatter fields merge at the field level — no silent last-write-wins overwrite.
- **G3:** YAML on disk remains the source of truth and round-trips losslessly through the form for the supported types.
- **G4:** Existing MCP write tools (`write_document`, `edit_document`), file-watcher external-change path, and source-mode raw-YAML editing keep working unchanged at the contract level.

## 3) Non-goals

<!-- Each non-goal carries a temporal tag and revisit condition.
     NEVER  — fundamentally misaligned with product direction
     NOT NOW — valid but out of scope (link to Future Work if applicable)
     NOT UNLESS — conditional; only reconsider if specific trigger fires -->

- **[NOT NOW]** **NG1:** Workspace-wide property registry / All-Properties governance panel — Revisit if: vault property sprawl becomes a documented pain point.
- **[NOT NOW]** **NG2:** Property-name autocomplete across docs / cross-doc property suggestions — Revisit if: NG1 is built.
- **[NOT NOW]** **NG3:** Vault-wide property rename / merge / retype — Revisit if: NG1 is in scope.
- **[NOT NOW]** **NG4:** Schema-first validation (TinaCMS / Sanity-style schema files) — Revisit if: structured content collections become a primary use case.
- **[NEVER]** **NG5:** Relations / references / rollups / formulas (Notion-style) — fundamentally incompatible with YAML-on-disk source-of-truth model.
- **[NEVER]** **NG6:** Rich text inside property values — same reason as NG5.
- **[NOT NOW]** **NG7:** Mobile / responsive form UX — Revisit if: cross-platform editor work picks up.
- **[NOT NOW]** **NG8:** Formal accessibility audit (keyboard nav, screen reader, ARIA conformance) — Revisit if: a11y becomes a release gate. Baseline a11y will be implemented but not formally audited as part of MVP.
- **[NOT NOW]** **NG9:** Field-level CRDT presence indicators ("Alice is editing `tags`") — Revisit if: collaborative friction becomes observable.
- **[NOT NOW]** **NG10:** Type *inference* from existing values across the vault. v1 has the user pick a type when adding a property; per-doc value-shape rendering of existing YAML is still in scope.
- **[NOT NOW]** **NG11:** Object / nested-field type in the property table — Revisit if: a documented use case for nested frontmatter emerges. Per D22, MVP types are YAML scalars + flat lists only.
- **[NEVER]** **NG12:** URL as a distinct frontmatter *type* — URL is just `str` in YAML; there's no schema-level convention for it. Strings that happen to be URLs continue to render as the Text widget. Specialized URL rendering (auto-link, validation) deferred to Future Work as a Text-widget enhancement, not a separate type.

## 4) Personas / consumers

**Primary (the persona we are designing for):**

- **P1 — Non-developer author, writing-first.** Reads and edits prose. Wants to set / update metadata without YAML knowledge. The MVP target.

**Constraints (must not break):**

- **P2 — Developer author / power user.** Comfortable in source mode; relies on raw YAML round-trip fidelity. Source mode is their primary surface and stays unchanged.
- **P3 — MCP agent (Claude / tooling).** Writes frontmatter via `write_document` / `edit_document`. Existing tool contracts must keep working at the API level.
- **P4 — File-watcher / git workflows.** External edits (git pull, IDE save) continue to flow through to the form via the existing external-change path.

## 5) User journeys

### P1 — Non-developer author, writing-first

**Happy path — editing an existing property on an existing doc:**

1. User opens a doc that already has frontmatter. `PROPERTIES (7)` panel is rendered at the top of the WYSIWYG canvas in expanded state (default).
2. User clicks a value cell (e.g. `title`) and edits inline. Change streams via CRDT to disk and to other connected clients.
3. User's cursor and partial edits merge at the field level with any concurrent writes to other properties (per D2 / D10).

**Happy path — adding a property:**

1. User clicks `+ Add property` at the bottom of the panel.
2. Name input appears inline; user types the property name.
3. User clicks the type icon to open the type picker (Text / Number / Boolean / Date / List — per D5); picks a type.
4. User enters the initial value using the widget for that type.
5. Property persists to Y.Map (per-key), panel re-renders with the new row.

**Happy path — removing / reordering a property:**

1. On hover, the row reveals a drag handle on the left and a trash icon on the right.
2. User drags the row up or down to reorder; order persists to YAML on disk (per D19).
3. User clicks trash to delete; row disappears; property is removed from Y.Map and from YAML on disk.

**Happy path — doc with no frontmatter:**

1. Panel is not rendered (D17).
2. User invokes the initialization trigger (Q21 — location TBD) to seed the frontmatter block with a first property; panel appears.

**Collapse:**

1. User clicks the chevron next to `PROPERTIES`; whole panel collapses to a single row showing only the label + count. Body-content scroll position unchanged.

**Failure / recovery — concurrent writes:**

1. User edits `title` in the form while an MCP agent adds a `topics` entry via `write_document` at the same moment.
2. Both writes land; both are visible to both writers after sync (per D2 field-level merge).

**Failure / recovery — malformed YAML on source-mode paste:**

1. User pastes invalid YAML into source mode.
2. Observer B fails to parse; keeps last valid per-key state. Body continues to render; form shows last-valid snapshot.
3. User fixes YAML; Observer B reconciles per-key diff (per D13).

### Interaction state matrix

| Surface | Loading | Empty (no frontmatter) | Error | Success | Partial |
|---|---|---|---|---|---|
| Properties panel | Not shown until Y.Doc attaches and FM state loads | **Panel not rendered** (D17) — initialization via trigger (Q21) | Source-mode YAML malformed: panel shows last-valid snapshot + subtle indicator (TBD); edits still possible | Panel renders with N rows; each row binds to its Y-value | Some properties still loading cached vs. Y-synced: rows visible in placeholder state until Y-state settles |
| Type picker dropdown | N/A | N/A | N/A | Opens on type-icon click; lists D5 types (+ Q22 types if accepted); select changes type with value-coercion rules (TBD) | N/A |
| List chip input | N/A | Empty input shows placeholder (TBD by designer) | Rejected chip content (e.g. list-of-list attempted) shows inline error | Chips render with `✕`; Enter appends; Backspace on empty input removes last chip | N/A |
| `+ Add property` inline flow | N/A | N/A | Duplicate property name: inline error, keep focus | Name entered → type picked → value entered → Enter commits; new row appears | User abandons mid-flow (blur / Escape): row discarded |

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria |
|---|---|---|
| Must | FR1 (G1): WYSIWYG-mode authors can read, edit, add, remove, and reorder frontmatter properties without raw YAML | Property panel renders for any doc with frontmatter; click-to-edit on values lands edits; `+ Add property` flow creates a new property with a chosen type; trash icon removes; drag handle reorders |
| Must | FR2 (G1): Empty-state initialization | A doc with no frontmatter shows no panel; a toolbar trigger creates the first property and reveals the panel |
| Must | FR3 (G2): Concurrent edits to *different* properties merge at field level | Integration test: human writes property A while MCP agent writes property B in the same doc; both writes survive after sync |
| Must | FR4 (G3): YAML on disk round-trips losslessly through the form for D5 widget types + comments | Round-trip PBT: `parse(serialize(map)) === map` for fixtures including comments; doc-load → no-op-form-edit → doc-save produces byte-identical YAML modulo intentional canonicalization |
| Must | FR5 (G4): MCP `write_document` / `edit_document` / `agent-write-md` / `agent-undo` continue to work at API contract level | Existing `api-agent-frontmatter.test.ts` cases pass after migration (with per-key assertions added) |
| Must | FR5a (G4): New `frontmatter_patch` MCP tool exposed. `agent-patch` rejects FM-intersecting patches with a clear 400 after a 30-day soft-deprecation window | `frontmatter-patch.test.ts` verifies Merge Patch semantics (set / create / delete), atomicity, Zod validation at boundary; `agent-patch` FM-intersection test returns 400 with migration hint |
| Must | FR6 (G4): File-watcher external-change path preserves form state | Edit YAML on disk while panel is open; per-key Y.Map updates; form re-renders without flicker |
| Must | FR7 (G4): Source-mode raw-YAML editing remains supported | Toggle to source mode shows the YAML; edits there flow through Observer B to per-key Y.Map (D13 reconciliation) |
| Must | FR8 (G2): Form-driven writes pass attribution discipline | Meta-test: new HTTP route(s) for property writes are in `REQUIRED_HANDLERS` and call `extractAgentIdentity` (precedent #24) |
| Should | FR9: Type widget rendering matches per-doc value shape | A property whose YAML value is `[a, b]` renders as the chip input regardless of declared type; mismatch is recoverable via type picker |
| Should | FR10: Bridge invariant remains green under per-key writes | `attachBridgeInvariantWatcher` (or its successor) shows zero violations across the integration test suite |
| Could | FR11: Form interactions emit OTel spans | `frontmatter.form_write` span with `doc.name`, `frontmatter.key`, `frontmatter.op` (set / add / remove / reorder) |

### Non-functional requirements

- **Performance:** Form render < 16ms for typical (≤ 10 properties) docs; `+ Add property` flow latency < 100ms end-to-end
- **Reliability:** Bridge invariant + I1-I11 markdown-pipeline PBTs pass at every CI tier
- **Security/privacy:** No new disk-write paths outside `fs-traced.ts`; no new unbounded-cardinality span attributes (CLAUDE.md cardinality rule)
- **Operability:** Form-write span emitted (FR11); attribution-sweep meta-test gates new routes
- **Cost:** No new third-party dependencies (`yaml@2.x` already present)

## 7) Success metrics & instrumentation

| Metric | Baseline | Target | Instrumentation |
|---|---|---|---|
| Frontmatter edits via the form (share of total FM edits) | 0 (no form exists) | ≥ 40% within 4 weeks of GA | OTel span `frontmatter.form_write` + `ok.frontmatter.edit_surface` counter (labels: `source=form/source-mode/mcp-write/mcp-patch/file-watcher`) |
| `agent-patch` FM-touching call rate | Unknown (no telemetry today — added as part of this work) | Measured for 30-day soft-deprecation window; target ≥ 80% migrated to `frontmatter_patch` before enforcement | New counter `ok.frontmatter.agent_patch_fm_touch_total` in `handleAgentPatch` |
| Bridge-invariant violations on CI | 0 (current state) | 0 (no regression) | Existing `attachBridgeInvariantWatcher` + new round-trip PBT `parse(serialize(map)) === map` |
| YAML round-trip fidelity under form edits | N/A (no form today) | 100% — `doc-load → no-op form edit → doc-save` produces byte-identical YAML modulo intentional canonicalization | New integration test in `api-agent-frontmatter.test.ts`; fixtures with comments, Unicode, non-ASCII, various scalar styles |
| Field-level merge success rate (concurrent writes to different keys) | 0% (doc-level LWW today) | 100% (both writes survive) | New integration test: simulate human form + MCP `frontmatter_patch` concurrent writes; assert both keys present post-sync |
| Bundle-size impact of the property panel (browser) | — | < 15 KB gzipped added to app bundle | `bun run build` size report; CI gate if > +20 KB |

Additional tracing (no explicit target; operability):

- Span: `frontmatter.form_write` with attributes `{doc.name, frontmatter.key, frontmatter.op: set|add|remove|reorder}`
- Span: `frontmatter.patch` for MCP `frontmatter_patch` handler with `{doc.name, patch.keys_count, patch.ops: {set, delete, create}}`
- Metric: `ok.frontmatter.patch.duration` histogram (unit: s)

## 8) Current state (how it works today)

L2 surface map: [`evidence/migration-blast-radius.md`](./evidence/migration-blast-radius.md). Headlines:

- **Storage shape:** `Y.Map('metadata')['frontmatter']` = a single YAML string; CRDT layer never parses YAML (pure regex split / concat via [`stripFrontmatter`](../../packages/core/src/extensions/frontmatter.ts) / `prependFrontmatter`). See [`packages/core/src/bridge/frontmatter-y.ts`](../../packages/core/src/bridge/frontmatter-y.ts).
- **Touch surface:** 27 sites across 17 files — 9 production writers, ~22 readers. Two YAML parsers coexist: regex-only in [`page-identity.ts`](../../packages/server/src/page-identity.ts) (fail-tolerant, returns `undefined` on malformed), real `yaml@2.x` in CLI / config paths. `yaml@2.x` already a workspace dependency (no new dep cost).
- **Observer A / Observer B are paired** (the substrate bridge invariant `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` composes the FM string on both sides — see CLAUDE.md "Editor substrate" §1; this is the unnumbered substrate invariant, not the markdown-pipeline `I1=Identity` PBT). Observer A today refreshes baseline only on XmlFragment events — under per-key storage, a pure form-write that doesn't touch XmlFragment will not refresh Observer A's baseline unless it also observes `Y.Map('metadata')` deep changes (new requirement).
- **Highest-risk write site:** the patch handler at [`api-extension.ts:2106-2148`](../../packages/server/src/api-extension.ts#L2106-L2148) — does `indexOf(find)` character-level splice across the FM/body boundary on a composed full string. **Cannot survive per-key without a redesign decision** (see Q19).
- **WYSIWYG editor:** TipTap-based, no current frontmatter UI. Source mode (CodeMirror with `y-codemirror.next`) is the only place to edit YAML by hand.

## 9) Proposed solution (vertical slice)

_(deferred to UX design phase + storage migration design phase)_

### Alternatives considered

_(see [research report](../../reports/frontmatter-editing-ux-patterns/REPORT.md) — sidebar form, inline YAML block, settings modal patterns evaluated and rejected for this audience)_

## 10) Decision log

<!-- Resolution status:
     LOCKED — invariant; do not deviate
     DIRECTED — direction set, details flexible
     DELEGATED — implementer decides
     INVESTIGATING — active research
     DEFERRED — explicitly not decided now
     ASSUMED — treated as decided but unverified -->

| ID | Decision | Type | Resolution | 1-way door? | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | UX pattern: top-of-document property table (Obsidian-style) | P | DIRECTED | No | Best fit for heterogeneous content + writing-first audience; sidebar / inline-block / modal alternatives all fail key criteria for non-dev authors | [Research report](../../reports/frontmatter-editing-ux-patterns/REPORT.md) | Form lives in WYSIWYG above body; source mode unchanged |
| D2 | Storage: per-key `Y.Map('metadata')` entries, **not** single-string | T | LOCKED | Yes | Field-level CRDT merge for concurrent multi-writer edits; single-string gives only document-level LWW | [Research report §7](../../reports/frontmatter-editing-ux-patterns/REPORT.md), [research evidence](../../reports/frontmatter-editing-ux-patterns/evidence/collaborative-realtime.md) | Migration of all frontmatter touch sites; bridge / observer touch-up; MCP write paths re-route |
| D3 | YAML on disk = source of truth; form is the WYSIWYG projection | P+T | LOCKED | No | Aligns with markdown-native thesis and existing persistence model | CLAUDE.md (Markdown pipeline) | Form ↔ YAML round-trip required for supported types; non-supported YAML constructs pass through unchanged |
| D4 | MVP scope: non-developer authors edit frontmatter friendly. Governance / registry / autocomplete out (NG1–NG3) | P | LOCKED | No | User-directed scope cut | This session | P1 primary; P2–P4 are constraints, not targets |
| D5 | Type widget set: text, number, boolean (checkbox), date, list (string array, e.g. tags) | T | DIRECTED | No | YAML-clean serialization; covers existing repo frontmatter patterns; aligns with Obsidian's 7-type model minus `datetime` and `tags-with-registry` | [Research §5](../../reports/frontmatter-editing-ux-patterns/REPORT.md) | Implies five widget components; "Add property" flow includes a type picker |
| D6 | Add-property flow: user picks a type from a short menu (no inference from typed value, no cross-doc suggestion) | P | DIRECTED | No | Simplest path; no registry exists to suggest from in MVP | This session (D4) | "Add property" UI is name + type picker + initial value |
| D7 | Reader API: keep `getFrontmatter(doc): string` (synthesized from per-key Y.Map on demand) and add `getFrontmatterMap(doc): Record<string, unknown>` alongside | T | DIRECTED | No | ~22 callers depend on the string shape today; replacing breaks all of them. Adding the structured reader lets consumers migrate opportunistically | [migration-blast-radius.md §Contract surfaces](./evidence/migration-blast-radius.md) | Single-file touchpoint in [`frontmatter-y.ts`](../../packages/core/src/bridge/frontmatter-y.ts); all existing callers stay compiling |
| D8 | Canonical YAML serialization: `yaml@2.x` with `sortMapEntries: false`, default scalar style, no anchors | T | DIRECTED | No | Already a workspace dependency; deterministic output is load-bearing for bridge invariant I1 under per-key storage | Same evidence | Property order preserved as set in Y.Map; byte-stable round-trip verified via PBT |
| D9 | `frontmatterCache` in [`persistence.ts`](../../packages/server/src/persistence.ts) removed — Y.Map is the single source | T | DIRECTED | No | Parallel string cache becomes stale once Y.Map is structured; single source removes reconciliation class | Same evidence | Read fallback reads disk on cache miss (same as today); no behavior-level change for consumers |
| D10 | Per-key value Y-types: `Y.Text` for editable strings (fields the user types character-by-character like `title`, `description`); `Y.Array<Y.Text>` for list fields (tags, topics, subjects); primitive JS values for atomic fields (number, boolean, ISO date string) | T | DIRECTED | No | Y.Text only where sub-string concurrent editing matters (cursor preservation, character-level merge). Primitives for atomics — field-level merge already achieved by per-key Y.Map slot | Same evidence + CLAUDE.md `Y.js observers` guidance | 2-axis type mapping for the form: widget type × Y-type. Codifies in the writer helper |
| D11 | Substrate **bridge invariant** (CLAUDE.md "Editor substrate" §1: `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`) — keep composed-string equality as today; canonical YAML serialization (D8) makes this well-defined under per-key storage. **Note:** this is the unnumbered substrate invariant, NOT the markdown-pipeline `I1=Identity` PBT (those are separate, see `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`) | T | DIRECTED | No | Reformulating to per-key equality churns 7+ test files and adds complexity; canonical serialization absorbs the change at one site | [migration-blast-radius.md §Bridge invariants](./evidence/migration-blast-radius.md) | `attachBridgeInvariantWatcher` unchanged; new PBT: `parse(serialize(map)) === map` |
| D12 | Observer A observes `Y.Map('metadata')` deep changes in addition to XmlFragment events; refreshes `lastSyncedXmlMd` baseline on per-key mutations | T | DIRECTED | No | Pure form writes don't touch XmlFragment; without this, Observer A's baseline goes stale and Path B three-way merge uses wrong reference | Same evidence | Extends `server-observers.ts` dispatch; paired-write short-circuit must extend to new per-key write origin |
| D13 | Disk ↔ per-key reconciliation strategy: **per-key diff** (parse YAML, compute add/remove/modify per key, apply per-key) — **not** bulk `clear() + setAll()` | T | DIRECTED | No | Bulk replace breaks UndoManager attribution (undo reverts ALL properties as one frame); per-key diff preserves UM granularity | Same evidence (R6 in risk register) | Applies to `applyExternalChange`, `onLoadDocument`, `handleRollback`, and Observer B reconciliation |
| D14 | Form-driven write origin: new `FORM_WRITE_ORIGIN` (per-session via `createSessionOrigin`-style construction). **Not declared `paired: true`** (refined by D30 — form/frontmatter_patch writes touch only metaMap, so Observer A must fire normally to propagate to Y.Text; no short-circuit needed). Reuse of existing agent origin explicitly rejected | T | DIRECTED | No | Attribution requires a distinct origin for browser-principal form writes (vs agent writes via `session.origin`). Paired marker would incorrectly short-circuit Observer A and leave Y.Text stale | Audit H3; user-proposed simplification 2026-04-24 | New entry in origin registry; NOT added to `isPairedWriteOrigin` set; `attribution-sweep-coverage.test.ts` `REQUIRED_HANDLERS` updated when the route lands |
| D15 | UX layout: panel at top of WYSIWYG editor, above the body. Muted chrome (subtle border, slightly distinct background). `PROPERTIES (N)` label with chevron | P | DIRECTED | No | User-provided screenshots | User session 2026-04-24 | Panel is a sibling to the body editor, not inside the ProseMirror doc (shapes D19 TipTap integration choice) |
| D16 | Collapse behavior: whole panel collapses as a single unit via the chevron. Binary expanded / collapsed | P | DIRECTED | No | User-provided screenshots; Obsidian-aligned | Same | No "N visible + show more" partial disclosure |
| D17 | Empty state: if the doc has no frontmatter, the panel is NOT rendered. Initialization trigger = **editor-toolbar button** (near the existing hide-sidebar control). Slash-menu trigger explicitly excluded — see D26 | P | DIRECTED | No | User-directed; rationale: the panel must structurally live above the body and never appear inside it; slash-menu insertion would let a user place / reorder it as a body block, violating the invariant | User session 2026-04-24 | Toolbar button is part of editor chrome, not a ProseMirror node |
| D18 | Per-row chrome on hover: drag handle (far left) for reorder, trash (far right) for delete. Type icon doubles as affordance — clicking it opens a type picker dropdown | P | DIRECTED | No | User-provided screenshots | Same | Type-icon-as-button is load-bearing; dropdown lists supported types with icons |
| D19 | Property ordering: user-controlled via drag-and-drop; order is persisted in YAML and in Y-state | P+T | DIRECTED | No | User-provided screenshots | Same | YAML on disk uses `sortMapEntries: false` (already D8); Y.Map preserves local insertion order via internal item-tree. **Note (Audit M4):** Y.js provides deterministic cross-peer convergence via YATA, but the converged order under concurrent inserts of distinct keys may not match either peer's local insertion order. Acceptable for MVP — reorder is a single-writer drag-drop op; concurrent-add races are vanishingly rare today |
| D20 | List / tags rendering: chip input with `✕` remove per chip; typing + Enter appends a new chip | P | DIRECTED | No | User-provided screenshots | Same | Chip input = the list widget for all `Y.Array<Y.Text>` fields (per D10) |
| D21 | "Add property" affordance: persistent `+ Add property` row at the bottom of the expanded panel; clicking enters the name + type + initial-value flow (per D6) inline in the panel, not a modal | P | DIRECTED | No | User-provided screenshots | Same | New-row UX lives inside the panel's own frame |
| D22 | Type inventory LOCKED at D5's five widgets — Text / Number / Boolean / Date / List. The line we're drawing: "value shape that round-trips cleanly through plain YAML as a standard frontmatter primitive." YAML 1.2 core scalars are `bool / int / float / null / str`. Date qualifies as a Text-shape with ISO 8601 widget formatting because ISO 8601 is unambiguous. URL, Object, Select, Multi-select excluded: URL has no YAML-schema convention; Object implies nested-field UX (Future Work NG11); Select / Multi-select would require a per-doc or per-vault options registry that MVP explicitly cuts (D4) | P | LOCKED | No | User-directed: "we only need to support valid markdown frontmatter." Widget configuration for Select requires a list of options that lives outside YAML (registry / per-doc config), which MVP doesn't ship | User session 2026-04-24 | Type picker dropdown lists exactly the 5 widgets |
| D23 | Rename property name via inline click on the key label — clicking the property name puts it into edit mode in place; Enter / blur commits, Escape reverts | P | DIRECTED | No | User-directed | Same | Same row, two edit affordances (key label + value cell); no separate menu / modal |
| D24 | Patch handler under per-key storage: **option (a) — forbid FM patches in `agent-patch`; add dedicated `frontmatter_patch` MCP tool.** Handler returns 400 on `agent-patch` calls whose `find` text matches an FM-line pattern or intersects the FM region. New `frontmatter_patch` tool is the sole MCP surface for frontmatter edits | Cross-cutting | LOCKED | Yes — 1-way for MCP agent contract | (a) gives validation uniformity across all write surfaces (one Zod `FrontmatterValue` schema for form / MCP / Observer B / disk), lowest handler complexity, best diagnosability (clear 4xx with "use `frontmatter_patch`"). Breaking change cost is real but bounded — mitigated by shipping `frontmatter_patch` before enforcing the forbid rule. (b) virtual-string compose imposes per-call YAML compose+parse forever; (c) route-by-content introduces heuristic ambiguity at FM/body boundary | Analysis 2026-04-24 via `/shared:analyze`; [migration-blast-radius.md §Phase 3](./evidence/migration-blast-radius.md) | Ship `frontmatter_patch` tool as part of MVP; add a 30-day soft-deprecation window where `agent-patch` FM calls log a warning before enforcing 400. Add a counter in `handleAgentPatch` now to measure FM-touching frequency for the deprecation-window telemetry |
| D28 | **Zod at boundaries.** Shared `FrontmatterValue` discriminated union (keyed on widget type: text / number / boolean / date / list) is the single source of truth for: MCP tool input schemas (`frontmatter_patch` payload), HTTP handler input validation (form writes), per-key metaMap value validation on write, and disk YAML parse validation (`applyExternalChange`, `onLoadDocument`). Matches the repo-wide Zod-at-boundary pattern already in `packages/cli/src/utils/frontmatter.ts` | T | DIRECTED | No | Already the repo's convention for YAML-parsed surfaces; one schema avoids shape drift across 4 boundaries; catches malformed frontmatter at storage boundary instead of in downstream consumers | Repo convention, eng:typescript-api-design | One new exported schema module (likely `packages/core/src/frontmatter/schema.ts`); imported by MCP tool, HTTP handler, Observer B, file watcher |
| D29 | **`frontmatter_patch` MCP tool shape.** Payload: `{docName: string, patch: Record<string, FrontmatterValue \| null>, types?: Record<string, FrontmatterType>, summary?: string}`. Semantics: JSON Merge Patch (RFC 7396) — key with value = set / create; key with `null` = delete; missing keys = unchanged. `types` map is optional per-key type override for new-property creation (default type inference: ISO 8601 string → date, boolean → boolean, number → number, string[] → list, else text). Atomicity: reject-all-or-commit-all — if any key fails Zod validation, the whole patch rejects with a per-key error report | Cross-cutting | LOCKED | Yes — 1-way for MCP tool contract (public API) | Merge Patch is a known RFC that agents already understand. Atomic semantics match transaction boundaries in the handler. Type override covers the edge case where an ISO 8601 string is intended as Text not Date | User session 2026-04-24 | New MCP tool file (`packages/cli/src/mcp/tools/frontmatter-patch.ts`); new HTTP route `/api/frontmatter-patch`; new handler `handleFrontmatterPatch` added to `REQUIRED_HANDLERS` |
| D30 | **Write-path simplification for form + frontmatter_patch writes.** These surfaces touch ONLY `Y.Map('metadata')` per-key entries (not XmlFragment, not Y.Text directly). Observer A (which observes both roots per D12) re-composes YAML + body and propagates to Y.Text. Origin (see D14) is NOT declared paired: single-root writes don't need the short-circuit. Existing `applyAgentMarkdownWrite` body-write path keeps its paired-origin triple-write pattern unchanged — it still writes XmlFragment + metaMap + Y.Text atomically | T | DIRECTED | No | Simpler architecture for the new code paths; atomicity cost is acceptable for metadata (Y.Text is a derived view under Observer A's contract). Doesn't touch the body-write code path, so no regression risk to existing agent-write flows | User-proposed simplification 2026-04-24; compatible with D12 Observer A metadata-deep-observation | `setFrontmatterProperty` helper writes one per-key entry; form handler and `frontmatter_patch` handler call it inside `doc.transact(fn, FORM_WRITE_ORIGIN)` without the `paired: true` marker. Observer A fires after commit, re-composes, propagates. `applyAgentMarkdownWrite` is NOT modified |
| D25 | YAML comment preservation on round-trip: use `yaml.parseDocument` (preserves `# comment` lines, blank lines, source order via `Document.contents`). NOT `yaml.parse` (drops them) | T | LOCKED | No | User-directed: "preserve." Comments in spec / report frontmatter carry usage and intent, not noise | User session 2026-04-24 | Reader / writer helpers (D7) wrap `parseDocument` / `Document.toString()`. Round-trip PBT must include comment-bearing fixtures |
| D26 | UX **position invariant** (LOCKED): the frontmatter panel must always render at the top of the document and cannot be moved, reordered, or deleted as a block within the body. Implementation pattern (DIRECTED, implementer latitude): a React component sibling to the TipTap editor wrapped within the same `DocumentBoundary` — alternative is a fixed-first-position ProseMirror node-view if integration evidence shows React-sibling breaks selection/focus/undo | P+T | **LOCKED on position; DIRECTED on implementation** | LOCKED part: yes — but the lock is the position invariant, not the implementation choice | User-directed: "users should not be able to reorder it with other blocks in the doc." | User session 2026-04-24; Audit L4 / Challenge 4 | Renders inside `DocumentBoundary` for clean remount on doc switch (render-tree placement, not the Suspense / `use(promise)` hybrid pattern). Resolves Q14 |
| D27 | Form ↔ source-mode merge semantics: when a user edits property `K` in the form while another writer (source-mode YAML edit, MCP agent) edits the same `K` concurrently, resolution is **last-writer-wins per-key**. Different keys merge cleanly (per D2). Observer B parses source-mode YAML and applies a per-key diff (D13) — same-key conflicts collapse to LWW at the per-key slot, not at the doc level | T | DIRECTED | No | Today's behavior is doc-level LWW; per-key LWW is strictly better. Option 3 ("source mode is read-only projection") is a much larger source-mode UX change deferred to Future Work. Same-key concurrent races are rare today | Audit Challenge 7; D13 | Concurrency edge cases addressable via per-key LWW + later refinement if friction observed |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | UX: layout | P | P0 | — | — | **Resolved by D15** |
| Q2 | UX: empty state (no panel when frontmatter absent) | P | P0 | — | — | **Resolved by D17** — trigger location still open (Q21) |
| Q3 | UX: collapse behavior | P | P0 | — | — | **Resolved by D16** |
| Q4 | UX: list / tags rendering | P | P0 | — | — | **Resolved by D20** |
| Q5 | UX: add-property flow | P | P0 | — | — | **Resolved by D21 + D6** |
| Q6 | UX: remove / reorder / rename | P | P0 | — | — | **Resolved by D18 + D19** — inline-rename interaction pattern still to confirm (Q23) |
| Q7 | UX: keyboard navigation — Tab cycles through fields in panel order, Shift+Tab reverses, Escape exits to body, Enter confirms edit. Arrow keys inside chip inputs navigate chips | P+T | P1 | No | Engineering call based on common form patterns; user-redirect optional | Resolved — DELEGATED |
| Q8 | T: per-key Y.Map value Y-types | T | P0 | — | — | **Resolved by D10** |
| Q9 | T: migration trigger for existing in-flight Y.Docs | T | P0 | — | — | **Resolved — DIRECTED eager-on-load.** `onLoadDocument` parses YAML and writes per-key entries during the load transaction; mixed-state never observable; boot cost is a one-time per-doc parse. Cleanest reader contract (no transitional fallback paths). Implementer re-validates in Phase 0 |
| Q10 | T: Observer A per-key baseline refresh | T | P0 | — | — | **Resolved by D12** |
| Q11 | T: Observer B reconciliation strategy | T | P0 | — | — | **Resolved by D13** |
| Q12 | T: MCP write path retargeting (`write_document`, `edit_document`, `applyAgentMarkdownWrite`) | T | P0 | — | — | Resolved by helper-based migration — see [blast-radius §Phase 1](./evidence/migration-blast-radius.md) |
| Q13 | T: file-watcher path retargeting | T | P0 | — | — | **Resolved by D13** (per-key diff applies same as Observer B) |
| Q14 | T: TipTap integration pattern | T | P0 | — | — | **Resolved by D26** — React component sibling, not ProseMirror node |
| Q15 | T: attribution origin for form-driven writes | T | P0 | — | — | **Resolved by D14** |
| Q16 | T: YAML round-trip fidelity for unsupported constructs (anchors, multi-line scalars, custom tags) — pass through untouched? Drop on round-trip? Document as gap? | T | P0 | No | Corpus check on repo's existing frontmatter (grep for non-scalar constructs); test matrix | Open — to investigate |
| Q17 | T: integration with markdown pipeline irreducible gaps (NG1 blank-line normalization, etc. per CLAUDE.md "Storage-layer fidelity contract") — confirm form does not amplify these | T | P0 | No | Reference existing fidelity invariants + I1 watcher | Open — to investigate |
| Q18 | T: OTel / tracing — should form-driven writes emit a span class (e.g. `frontmatter.form_write`)? | T | P2 | No | Reference [`telemetry.ts`](../../packages/server/src/telemetry.ts) | Open — investigate during implementation |
| Q19 | T+P: Patch handler shape under per-key storage | Cross-cutting | P0 | — | — | **Resolved by D24** — option (b) virtual-string compose, with Phase 4 verification gate |
| Q20 | T: YAML comment preservation | Cross-cutting | P0 | — | — | **Resolved by D25** — `yaml.parseDocument` |
| Q21 | UX: initialization trigger location | P | P0 | — | — | **Resolved by D17** — toolbar button only |
| Q22 | UX: type inventory | P | P0 | — | — | **Resolved by D22** — D5's five types only; URL not a YAML type, Object deferred |
| Q23 | UX: inline rename interaction | P | P0 | — | — | **Resolved by D23** — inline click on key label |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | TipTap supports rendering a non-editor-DOM React component above the editor cleanly without breaking ProseMirror selection / focus / undo | MED | /explore TipTap pattern in iterative loop after UX direction set | Before UX design phase exits | Active |
| A2 | The current Observer A "prepend frontmatter on serialize" path can be cleanly retargeted under per-key storage without breaking bridge invariants I1–I11 | HIGH | Verified via [migration-blast-radius.md](./evidence/migration-blast-radius.md); D11 (keep I1 composed-string) + D8 (canonical YAML) provide the path | Verified 2026-04-24 | **Resolved** |
| A3 | MCP write-path callers do not depend on `metaMap.get('frontmatter')` returning a byte-identical string they previously wrote (they compose / re-parse on each side) | HIGH | Verified via code trace — `applyAgentMarkdownWrite` re-composes from payload each call; callers treat FM as shape, not bytes. External callers (CLI YAML tooling) use `yaml@2.x` with their own canonicalization | Verified 2026-04-24 | **Resolved** |

## 13) In Scope (implement now)

The MVP delivers the property panel UX backed by per-key Y.Map storage, with all existing write paths preserved. Lifted from §10 D-decisions and §6 requirements:

### Storage migration (D2, D7–D14)

- **Goal:** Per-key Y.Map storage replaces single-string `frontmatter` slot; field-level CRDT merge for concurrent multi-writer edits.
- **Includes:**
  - New reader / writer helpers in [`packages/core/src/bridge/frontmatter-y.ts`](../../packages/core/src/bridge/frontmatter-y.ts) (`getFrontmatter`, `getFrontmatterMap`, `setFrontmatterFromYaml`, `setFrontmatterProperty`)
  - Canonical YAML serialization via `yaml@2.x` `parseDocument` / `Document.toString()` (D8, D25)
  - Observer A + B contract updates: deep-observe `Y.Map('metadata')`, baseline refresh on per-key mutations, per-key diff reconciliation (D12, D13)
  - Migration of all 9 production write sites + ~22 readers per [`evidence/migration-blast-radius.md`](./evidence/migration-blast-radius.md)
  - `frontmatterCache` removal (D9)
  - In-flight Y.Doc migration trigger (Q9 — pending decision)
- **Acceptance:** FR3, FR4, FR6, FR7, FR10 pass. Round-trip PBT green.

### MCP write-path retargeting (D14, D24, D29)

- **Goal:** Existing MCP tools (`write_document`, `edit_document`, `agent-write-md`, `agent-undo`, `rollback`) keep working at API contract level under per-key storage; new `frontmatter_patch` tool covers FM edits.
- **Includes:**
  - `applyAgentMarkdownWrite` and `applyAgentUndo` migrated to per-key helpers (no API change)
  - Patch handler ([`api-extension.ts:2106-2157`](../../packages/server/src/api-extension.ts#L2106-L2157)): add FM-intersection detection + 400 rejection; log warning for 30-day soft-deprecation window
  - New MCP tool `frontmatter_patch` ([`packages/cli/src/mcp/tools/frontmatter-patch.ts`](../../packages/cli/src/mcp/tools/frontmatter-patch.ts)) with Merge Patch semantics (D29)
  - New HTTP route `/api/frontmatter-patch` + handler `handleFrontmatterPatch` in `REQUIRED_HANDLERS`
  - New `FORM_WRITE_ORIGIN` (non-paired, D14 refined by D30)
  - Counter added to `handleAgentPatch` measuring FM-touching patch frequency (deprecation-window telemetry)
- **Acceptance:** FR5 passes; `api-agent-frontmatter.test.ts` extended to cover per-key state; new test `frontmatter-patch.test.ts` covers Merge Patch semantics + atomicity; `agent-patch` FM-intersection regression test rejects + logs.

### Form UX surface (D1, D5, D15–D26)

- **Goal:** Top-of-document property panel rendered above the body in WYSIWYG mode; non-dev authors edit frontmatter without YAML.
- **Includes:**
  - React component sibling to TipTap, wrapped in `DocumentBoundary` (D26 — implementation choice; PM node-view alternative if integration evidence warrants)
  - Five widget types: Text / Number / Boolean / Date / List (D5; D22 pending re-decision)
  - Per-row hover chrome (drag handle, trash, type-icon-as-picker — D18, D19)
  - Inline rename on key label (D23)
  - `+ Add property` flow (D6, D21)
  - Empty-state toolbar trigger (D17)
  - Collapse via chevron (D16)
- **Acceptance:** FR1, FR2, FR9 pass. User journey scenarios in §5 verifiable in QA.

### Attribution + telemetry

- **Goal:** Form-driven writes satisfy precedent #24 attribution discipline and emit observability signals.
- **Includes:**
  - New HTTP route(s) for property writes registered in `REQUIRED_HANDLERS` ([`attribution-sweep-coverage.test.ts:16`](../../packages/app/tests/integration/attribution-sweep-coverage.test.ts#L16))
  - `extractAgentIdentity(body)` at handler entry; `session.dc.document.transact(fn, FORM_WRITE_ORIGIN)`
  - OTel span `frontmatter.form_write` (FR11, P2)
- **Acceptance:** FR8 passes; attribution sweep meta-test green; new span visible in dev OTel stack.

### Owner + Next actions

- **Owner / DRI:** Sarah (sarah@inkeep.com)
- **Next actions:** Resolve four pending decisions (D22 select / multi-select, D24 patch handler shape, D26 LOCKED scope, Q9 migration trigger). Then proceed to `/ship`.

### Risks + mitigations

See §14.

### What gets instrumented / measured

- `frontmatter.form_write` span (op = set / add / remove / reorder)
- Round-trip PBT: `parse(serialize(map)) === map` (CI gate)
- Bridge invariant watcher + markdown-pipeline I1-I11 PBTs (existing CI gates extended)
- Attribution sweep meta-test (existing CI gate)

## 14) Risks & mitigations

Full risk register in [`evidence/migration-blast-radius.md`](./evidence/migration-blast-radius.md#risk-register) (R1–R12). Top-risk summary:

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| R1: Non-deterministic YAML serialization causes bridge-invariant flap + polluted git diffs | MED | HIGH | D8 locks `yaml@2.x` with explicit options; add round-trip PBT `parse(serialize(map)) === map` as a CI gate before Phase 2 | Implementer |
| R2: Observer B overwrites form-driven per-key writes when source mode re-reconciles | MED | HIGH | D13 per-key diff (not bulk replace) + new integration test: concurrent form-write + source-mode YAML edit, assert form value preserved | Implementer |
| R5: Patch handler character-offset drift under per-key — agent computes `find` at offset N, FM byte-length shifts between call and apply, `staleTarget` storms | MED | MED | Resolved by Q19 decision (options a/b/c all address this); adopt chosen path with agent-patch regression tests | Implementer |
| R6: UndoManager attribution loss if writer uses bulk `clear()+setAll()` — undoing one property reverts all | MED | HIGH | D13 locks per-key diff; add undo-of-property test | Implementer |
| R8: New form-driven endpoint slips past `attribution-sweep-coverage.test.ts` meta-test | LOW | MED | Meta-test already gates — will fail until the new route is added to `REQUIRED_HANDLERS` | Implementer (automatic) |
| R9: Y.Text mirror diverges when form write doesn't touch XmlFragment | MED | MED | D12 (Observer A observes metadata deep changes) resolves; add integration test: form-only write, assert Y.Text reflects new FM after settlement | Implementer |
| R10: Comment / blank-line preservation regression if agents + users hand-author rich YAML | MED | Depends on Q20 | Gated by Q20 — if comments must round-trip, use `yaml.parseDocument`; if not, document NG11-style gap | Needs user input |
| R12: New per-key write origin omits `context.paired: true`, triggers Observer A/B amplification | LOW | HIGH | D14 adds new origin with paired marker by construction; T8/T9/T10 regression tests extended to the new write surface | Implementer |
| R3: Per-key migration trigger ambiguity — mixed-state Y.Docs in flight | MED | HIGH | Resolved by D-pending (Q9 promoted to a real decision — see Open Questions) | Implementer + user |
| R4: YAML library tolerance mismatch — regex parser silently tolerates malformed YAML, `yaml@2.x` throws | MED | MED | Keep regex parser for graph-display fallback paths; switch CRDT-write paths to `yaml@2.x` only with explicit error handling at parse boundary | Implementer |
| R7: Bridge-invariant watcher false-positive on canonical-YAML mismatch during transition | MED | MED | One-time canonicalization on doc-load aligns baselines; D11 + D8 jointly mitigate | Implementer |
| R11: `frontmatterCache` becomes stale parallel store under per-key writes | LOW | MED | D9 removes the cache; readers fall through to disk on doc-not-yet-opened cases | Implementer |

## 15) Future Work

### Explored

- **Type inference across the vault** (NG10) — investigated in research report §5. Cross-product type-inference mechanisms documented (Obsidian's value-shape inference, Notion's database-level types). Recommended approach if promoted: per-doc value-shape inference on read (already implicit in MVP — list values render as chips, dates as date widgets), vault-wide inference deferred until the registry exists. *Why not in scope now:* requires the registry (NG1) to be useful at vault scale. *Triggers to revisit:* NG1 promotion.
- **URL-as-Text-widget enhancement** (NG12) — researched as part of type inventory analysis. Recommended approach: auto-linkify on hover, validate format on commit, click-to-open. UX layer over plain `str`, zero YAML type change. *Why not in scope now:* MVP scope cut excludes affordance polish beyond core five widgets. *Triggers to revisit:* user feedback on URL fields.

### Identified

- **Workspace-wide property registry + governance panel** (NG1–NG3) — Obsidian's "All Properties" view. Needs its own spec pass; will require a `__system__`-scoped Y.Doc subsystem with `isSystemDoc()` gate.
- **Field-level CRDT presence indicators** (NG9) — technically straightforward via Y.js awareness; gated on observed friction.
- **Object / nested-field type** (NG11) — supported by YAML, deferred for MVP UX scope. Could promote with a sub-table-in-row UX pattern.

### Noted

- Schema-first validation (NG4)
- Mobile / responsive (NG7)
- Formal a11y audit (NG8)

## 16) Agent constraints

**SCOPE** — files and directories implementation should touch:

- `packages/core/src/bridge/frontmatter-y.ts` — extend readers (D7)
- `packages/core/src/frontmatter/` (new directory) — `schema.ts` (Zod `FrontmatterValue` per D28), `yaml-codec.ts` (canonical `yaml@2.x` serialization per D8, D25)
- `packages/server/src/server-observers.ts` — Observer A (deep-observe metaMap per D12), Observer B (per-key diff reconciliation per D13)
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite` + `applyAgentUndo` migrate to per-key helpers (no API change)
- `packages/server/src/api-extension.ts` — new `handleFrontmatterPatch` + `handleSetProperty` routes; FM-intersection detection + 400 in `handleAgentPatch`; deprecation counter
- `packages/server/src/external-change.ts` — per-key diff on file-watcher path (D13)
- `packages/server/src/persistence.ts` — `onLoadDocument` eager migration (Q9); `onStoreDocument` canonical YAML serialization; `frontmatterCache` removal (D9)
- `packages/server/src/page-identity.ts` — adapt regex readers to per-key Y.Map where possible; keep regex disk-fallback (M5)
- `packages/cli/src/mcp/tools/frontmatter-patch.ts` (new) — `frontmatter_patch` MCP tool (D29)
- `packages/app/src/components/` (new property panel + type widgets + add-property flow per D15-D21)
- `packages/app/src/editor/` — form wire-up to metaMap observer (D12)
- Test infrastructure: `packages/app/tests/integration/frontmatter-patch.test.ts` (new), `api-agent-frontmatter.test.ts` (extended for per-key), `server-observers.test.ts` (extended for per-key)

**EXCLUDE** — areas not in scope for this spec:

- Workspace-wide property registry, All-Properties panel, cross-doc autocomplete, vault-wide rename (NG1–NG3)
- Schema-first validation frameworks (NG4)
- Relations / rollups / Object / URL widgets (NG5, NG6, NG11, NG12)
- Mobile / responsive UX (NG7)
- Formal a11y audit (NG8 — baseline a11y is in scope, formal audit is not)
- Field-level CRDT presence indicators (NG9)
- Type inference across the vault (NG10)
- `applyAgentMarkdownWrite` body-write path architecture — D30 explicitly leaves this unchanged
- Client-side observer write paths — precedent #14 STOP rule; do not reintroduce

**STOP_IF** — conditions requiring human review before proceeding:

- Phase 4 patch-handler prototype (D24 implementation) shows FM-intersection detection to be materially unreliable — escalate before broader rollout
- Canonical YAML round-trip PBT (`parse(serialize(map)) === map`) fails for common fixtures — D8 canonicalization choice needs re-review
- Bridge invariant watcher shows regressions post-migration that can't be traced to a specific origin — escalate before merge
- Any proposal to reintroduce client-side observer write paths — STOP, this is a precedent #14 violation
- Any proposal to declare `FORM_WRITE_ORIGIN` paired — contradicts D30; escalate before implementing
- Any new disk-write call site outside `packages/server/src/fs-traced.ts` helpers — STOP, CLAUDE.md STOP rule

**ASK_FIRST** — categories of action requiring confirmation:

- Any change to the `frontmatter_patch` MCP tool contract (payload shape, Merge Patch semantics, atomicity) after spec finalization — D29 is LOCKED, changes are re-specs
- Any addition or removal from the 5-widget type set (D22 LOCKED)
- Any change to the position invariant in D26 (panel always at top of doc, never a movable body block)
- Any change that would remove the 30-day soft-deprecation window for `agent-patch` FM rejection
- Any change that moves frontmatter storage away from per-key `Y.Map` entries (D2 LOCKED, 1-way)
