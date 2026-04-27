---
name: design-challenge
description: Cold-read independent design critique of the frontmatter-editing-ux spec. Challenges decision rationale and surfaces alternatives that survive the spec's own rejection arguments.
type: spec-meta
date: 2026-04-24
challenger: cold reader
sources:
  - specs/2026-04-24-frontmatter-editing-ux/SPEC.md
  - specs/2026-04-24-frontmatter-editing-ux/evidence/migration-blast-radius.md
  - specs/2026-04-24-frontmatter-editing-ux/evidence/current-storage-trace.md
  - reports/frontmatter-editing-ux-patterns/REPORT.md
---

# Design challenge — cold read

## Summary (5 lines)

1. **Most concerning:** D2 (per-key Y.Map storage, LOCKED, 1-way door) is sequenced *first* in the migration plan. The MVP target persona (P1, non-developer authors) gets zero benefit from it on day one — they edit one field at a time. The 27-site refactor is being paid up-front to unlock G2 (multi-writer field-level merge), which only matters once MCP traffic to frontmatter is meaningful. This is a load-bearing rationale that the spec asserts but does not quantify.
2. **Weakest part of the spec:** D24 (patch-handler virtual-string compose) is explicitly a "prototype it, escalate if it fails" decision marked DIRECTED yet flagged 1-way door. This is the spec acknowledging the MCP `agent-patch` contract is a square peg in a round hole and deferring the resolution to implementation time. It should be resolved at spec time — the architectural mismatch is real.
3. **Second-weakest:** D22's exclusion of select/multi-select. The justification ("only support valid YAML/frontmatter") is the wrong frame — select is a UX-layer constraint over a string, not a YAML type. The spec foreclosed the most-requested CMS field type with reasoning that doesn't apply.
4. **NG1 deferral risk:** the research report explicitly warns property sprawl ("`date` vs `Date` vs `created_at`") is the dominant failure mode at scale, and Obsidian (the cited reference) shipped Properties *with* a registry. MVP ships without even the lightest "this property exists in N other docs" hint. Sprawl will arrive in week one of MCP usage.
5. **Verdict: minor tightening (lean toward reopen on D2 sequencing).** The UX direction is sound and well-evidenced. But the spec front-loads a 1-way-door storage migration to deliver a concurrency benefit whose demand is asserted, not measured, and defers (D24) the only piece that genuinely *requires* per-key thinking. Reopen the sequencing question; consider shipping the form against single-string with an edit-lock UX layer, then migrate to per-key when contention is observed.

---

## Challenge 1 — Per-key storage migration is sequenced before the demand for it is demonstrated

**Severity:** HIGH

**What the spec decided.** D2 (LOCKED, 1-way door): per-key `Y.Map` storage replaces single-string. Migration spans 27 touch sites, 6 phases, with explicit risk register R1–R12. Justification: "Field-level CRDT merge for concurrent multi-writer edits; single-string gives only document-level LWW."

**What I'm challenging.** The spec asserts G2 ("Concurrent edits from humans and MCP agents to *different* frontmatter fields merge at the field level") as a top-level goal, but the spec offers no evidence that this concurrency is currently observed, growing, or breaking users. The complication section (§1) says "Incidence grows as MCP-driven authoring scales" — that is a *prediction*, not data. Meanwhile the *primary persona* P1 is "non-developer author, writing-first" who, by construction, edits one field at a time and rarely concurrently with an agent on the same document. The locked, 1-way-door, 27-site migration is paying maximum architectural cost to deliver a benefit whose demand is hypothetical for the persona being designed for.

A lighter alternative survives the spec's own arguments: ship the form against the existing single-string storage, use a UX-layer edit-lock (server-issued lease while a form field is focused; agents see "frontmatter editing in progress, retry") for the rare concurrent-write case, and migrate to per-key only when observed contention crosses a threshold. This sequence:

- Preserves the entire body of existing tests (no Observer A/B baseline reformulation, no I1 reformulation, no per-key UM attribution test).
- Cuts D24's pain entirely (the patch handler keeps working as-is).
- Lets the form ship in weeks instead of after the 6-phase migration completes.
- Preserves the 1-way door — D2 can still be locked later, with measured demand to justify it.

**Evidence.**

- SPEC §1 Complication.2: "Concurrent edits from a human and an MCP agent (or two humans) to *different* fields silently overwrite each other. **Incidence grows** as MCP-driven authoring scales." (Emphasis added — claim is forward-looking.)
- SPEC §4 P1 explicitly framed as "primary (the persona we are designing for)"; P3 (MCP agent) listed only as "constraint."
- migration-blast-radius.md §Risk register: 12 distinct migration risks (R1–R12), several rated HIGH impact (R1, R2, R6, R12).
- migration-blast-radius.md §Sequencing recommendation: 6 phases, 19 numbered work items, before the form even appears (Phase 4, item 12).
- Research report §7: "Concurrent property type changes ... are unresolved across all products. Notion sidesteps with database-level locks." So the alleged dominant pattern (Notion) doesn't even use field-level CRDT for this.

**Alternative I'd propose.** Re-sequence D2 to *follow* the form ship, not precede it. Phase 0 ships the form against single-string storage with a write-conflict lease (or simply with the existing LWW behavior plus telemetry counting "would-have-been-clobbered" frontmatter writes). After 4–8 weeks of real traffic, decide whether the per-key migration is justified by measured contention. If yes, do the 6-phase migration with confidence. If no, save the engineering effort.

Note this is exactly the sequence the spec rejects implicitly via D2 LOCKED + 1-way door framing — but the rejection is not argued. There's no section in the spec or evidence that says "we considered shipping form-first, here's why we rejected it."

**What evidence would tip the decision.** A measurement of *actual* concurrent-frontmatter writes per unit time in current usage, broken down by writer category (per CLAUDE.md precedent #25 — agent vs principal vs file-system). If the rate of human↔agent concurrent edits to different frontmatter fields is meaningfully non-zero today, lock D2 now. If it's zero or near-zero, defer until the form has shipped and collected demand evidence. The telemetry surface already exists (`packages/server/src/telemetry.ts`).

---

## Challenge 2 — D24 is a deferred architectural mismatch, not a decision

**Severity:** HIGH

**What the spec decided.** D24 (DIRECTED, 1-way door): patch handler under per-key storage uses option (b) virtual-string compose — handler synthesizes `prependFrontmatter(serialize(perKeyMap), body)` per call, performs the splice, re-parses FM region into a per-key diff. Crucially, the decision text ends with: "**Verification gate at Phase 4 implementation:** implementer prototypes (b) first; if it proves untenable ... escalate with evidence and the user re-decides between (a) forbid FM patches and (c) route-by-content."

**What I'm challenging.** This isn't a decision; it's a hypothesis with a fallback plan. A 1-way-door flag with three live options under it means the spec is shipping uncertainty into implementation. The deeper issue is that `agent-patch` was built for a single-string world. Asking it to operate on a per-key data model and faithfully reverse-derive the diff back to per-key updates is reintroducing the semantic mismatch at the wrong layer — inside the handler, every call.

The cleanest path is the one the spec rejects in the rationale text: split `agent-patch` into `body-patch` (no FM) and `frontmatter-set-property` (typed, per-key). The MCP tool surface change is a real cost, but it's a one-time documented breaking change, not a forever-in-the-handler complexity tax. And it's a change agents can adapt to easily — patches that touch frontmatter are a small subset of patches.

The spec's argument against (a) is: "(a) is a breaking change for any agent that has used patches to edit frontmatter." That is true but doesn't quantify the cost. How many MCP agent calls per day touch FM via patch? If the answer is 5%, splitting the tools is cheaper than D24's complexity. If the answer is 80%, D24 is justified. The spec doesn't say.

**Evidence.**

- migration-blast-radius.md site #5: "**Cannot survive per-key without redesign.** A patch that targets `title:` line text has no per-key analogue — it crosses the boundary."
- migration-blast-radius.md §R5: "agent computes `find` at offset N, FM byte-length shifts between call and apply, `staleTarget` storms" — i.e., D24's option (b) re-introduces a class of bugs that per-key storage was supposed to eliminate.
- SPEC D24 itself acknowledges the gate: "implementer prototypes (b) first; if it proves untenable."
- CLAUDE.md "Don't bypass `writeTracker` or `skipStoreHooks`" + "Server-side agent writes use the XmlFragment-authoritative pattern" (precedent #10) — the codebase strongly prefers single-API-boundary helpers, not in-handler reconstruction logic. D24 violates that grain.

**Alternative I'd propose.** Resolve at spec time, not implementation time. Two viable options:

1. **Split `agent-patch`** into `body-patch` (refuse FM-region matches with a clear error) and `frontmatter-set-property` (typed, per-key, atomic). Document the breaking change. Pre-announce to MCP agent authors. Ship the new tools with the form; deprecate the FM-touching patch path on a deadline.
2. **Keep `agent-patch` but route by content** (option c in the spec). When the patch's `find` text matches an FM line, internally route to per-key writes. This is more complex than (1) but preserves the wire contract.

Either is more honest than "prototype and re-decide." If the spec believes (b) is the right call, it should commit; if it isn't sure, it should resolve to (a) or (c) at spec time.

**What evidence would tip the decision.** Telemetry on current `agent-patch` traffic split by FM-region vs body-only matches over the last 30 days. If FM-touching patches are <10%, choose (a) split. If >50%, justify (b) on real volume. Without this, the spec is making a load-bearing decision blind.

---

## Challenge 3 — D22 forecloses select/multi-select on a category error

**Severity:** MED

**What the spec decided.** D22 (LOCKED): type inventory locked at D5's five types — Text, Number, Boolean, Date, List. URL excluded because "URL is **not** a YAML 1.2 type." Object excluded for MVP.

**What I'm challenging.** The reasoning in D22 conflates two different concepts: YAML serialization types (str, int, float, bool, null, timestamp, sequence, map) and UX-layer field types (text, number, checkbox, date, list, **select, multi-select, URL, email, color, rating, …**). Select is not a YAML type; it serializes as a plain string. Multi-select serializes as a sequence of strings. Both are widget-layer constraints over types YAML already has.

The research report (§5) explicitly lists select/multi-select as part of "a practical type set for a markdown-native editor": *"text, number, boolean, date, list, tags, and select/multi-select"*. The spec's chosen type set drops two of seven without justification. For non-developer authors specifically (P1), `status: draft|review|published` is one of the most common metadata patterns in the world. Dropping select/multi-select means every author types `staus: draf` (sic) and the registry-less, autocomplete-less MVP (NG1, NG2) won't catch it.

The same critique catches URL's exclusion — URL is a Text widget with auto-link rendering. The spec rejects "specialized URL rendering" as a separate type but acknowledges (NG12) it could be a Text-widget enhancement. So the type isn't excluded — only the affordance is. NG12 could be in MVP at near-zero cost (one line of validation, one line of rendering).

**Evidence.**

- Research report §5: "A practical type set for a markdown-native editor covers: **text** (string), **number**, **boolean** (toggle/checkbox), **date** (with optional time), **list** (array of strings, rendered as chips), **tags** (list with workspace-wide autocomplete), and **select/multi-select** (list with predefined options)."
- Research report §7 Pattern Selection Matrix: "Type safety: Form widgets" listed as a benefit of the chosen pattern — but the spec's type set defeats type safety for the most common categorical-data case (status, priority, type tags).
- D22 rationale text: "URL widget would be a UX-only layer over a plain string and wouldn't survive YAML round-trip as a distinct type." Same argument applies (with opposite sign) to select/multi-select — they're UX-only layers over plain strings, but select would round-trip cleanly because it's an *enum subset* of strings.

**Alternative I'd propose.** Add select/multi-select as a sixth/seventh widget type. The per-doc options list lives in the field's UX state; serialization is plain string / list of strings. Without a workspace registry (NG1 deferred), the option list is per-doc — author defines the options when adding the field. That's still strictly better than free text for the status/priority/severity use cases.

For URL: keep D22's stance that URL is not a separate type, but pull in the URL-as-Text-widget enhancement (NG12) into MVP. Auto-linkify on hover, validate format on commit. No round-trip issue.

**What evidence would tip the decision.** A grep across the existing repo's `.md` frontmatter for fields where the value is one of a small enum (status, type, priority, severity, stage, …). If >5% of documents have such fields, select/multi-select is a P0 type for MVP.

---

## Challenge 4 — D26's "structurally outside the body" framing is rigid for power users

**Severity:** MED

**What the spec decided.** D26 (LOCKED, 1-way door): the frontmatter panel lives structurally outside the body content area, rendered as a React component sibling to the TipTap editor. "Cannot be moved, reordered, or deleted as a block within the body." This is the load-bearing reason slash-menu insertion was rejected (D17).

**What I'm challenging.** The user's stated rationale ("users should not be able to reorder it with other blocks in the doc") is a constraint about the panel's *position relative to the body*, not its existence as a node. There are two adjacent UX expectations the spec treats as identical that are not:

1. **Position invariant:** the panel must be at the top of the doc, never inside it. (Reasonable.)
2. **Structural invariant:** the panel is not a ProseMirror node. (Stronger claim, harder to justify.)

The spec collapses (1) and (2) into one decision. But there are middle paths — the panel could be a *fixed-position ProseMirror node* (like a header) whose position is enforced by a doc-validity rule, with the slash menu refusing to insert it elsewhere. This is how some editors implement "title" as a special first node.

The reason this matters: P2 (developer / power user) is listed as a "constraint persona" but the spec gives them no escape hatch. Some power users genuinely want the panel collapsed below the body for distraction-free writing, or beside the body in a side-by-side layout. D26 LOCKED forecloses that. NG7 (mobile/responsive) reinforces this — at narrow widths, "fixed position above body" is the worst layout.

The 1-way door is justified if implementation truly diverges between "React sibling" and "fixed PM node" — but the spec doesn't show that. It just locks the simpler one.

**Evidence.**

- SPEC D26 rationale: 'User-directed: "users should not be able to reorder it with other blocks in the doc."' This is statement (1), not (2).
- SPEC D17: "the panel must structurally live above the body and never appear inside it; slash-menu insertion would let a user place / reorder it as a body block, violating the invariant" — again (1), used to justify (2).
- CLAUDE.md "Don't collapse the hybrid render tree" STOP rule: the existing `DocumentErrorBoundary → Suspense → EditorActivityPool → Activity → DocumentBoundary` shape is load-bearing. D26's "React sibling" pick aligns with this — but a fixed PM node would too, with the panel rendered via a node-view inside the existing tree.

**Alternative I'd propose.** Soften D26 from LOCKED to DIRECTED. Keep the position invariant (panel-above-body) as the LOCKED constraint. Defer the "React component vs fixed PM node-view" choice to implementation, with whichever option survives integration with the hybrid render tree winning. Optionally add a Future Work entry for "panel position preference" (top, bottom, side) once the MVP is shipped and someone asks for it.

**What evidence would tip the decision.** TipTap precedent: are there shipped editors using a "fixed first-node" pattern for metadata? If yes, the React-sibling lock is over-strict. Also: how does the form interact with `Y.UndoManager` under each option? If undo-of-form-edit must traverse the same UM as body edits, a PM node may be cleaner than a sibling component subscribing to a separate Y.Map.

---

## Challenge 5 — NG1/NG2 deferral conflicts with the research report's central warning

**Severity:** MED

**What the spec decided.** NG1 (workspace-wide property registry), NG2 (cross-doc property suggestions / autocomplete), NG3 (vault-wide rename / merge / retype) all marked NOT NOW. D4 LOCKED: "Governance / registry / autocomplete out (NG1–NG3) ... User-directed scope cut."

**What I'm challenging.** The research report's headline finding (§6 Schema-Driven vs Freeform) is: "Pure freeform YAML produces key inconsistencies (`date` vs `Date` vs `created_at`), type confusion, and invisible typos. No discoverability of what properties exist across documents." It then concludes "the hybrid model ['suggest, don't enforce'] is the sweet spot." Obsidian — the spec's chosen reference implementation — shipped Properties *with* a property registry for exactly this reason.

The spec is choosing the part of Obsidian's design (top-of-doc property table) that's UX-visible to a single-doc editor and dropping the part that prevents the failure mode at scale (the registry). For a single user writing one doc, that's fine. For a knowledge base with thousands of docs (the spec says "thousands of markdown files in this repo (specs / reports / stories / projects / docs all rely on it)"), it isn't.

The risk is asymmetric: shipping without a registry means within weeks the vault accumulates `tags`, `Tags`, `tag`, `topics`, `subjects`, and the registry becomes harder to retrofit because typos are now load-bearing in N documents. Even a *minimum-viable hint* — "this property exists in N other docs as type T" rendered next to the type picker on add — would prevent ~80% of sprawl at near-zero cost. It doesn't require governance UX, vault-wide rename, or NG3's complexity.

**Evidence.**

- Research report Executive Summary: "Decomposing metadata to per-key Y.Map entries would give field-level merge ... **The 'suggest, don't enforce' hybrid model** (infer types from existing data, autocomplete from workspace-wide usage, allow unknown keys) is the sweet spot between schema rigidity and freeform chaos."
- Research report §6: "If the workspace has 100+ documents → the 'All Properties' governance view (Obsidian's model) is essential to prevent property sprawl."
- SPEC §1 Situation: "frontmatter carries first-class structure ... across thousands of markdown files in this repo." So the workspace is exactly the size where the report says governance matters.
- The repo has a precedent for `__system__`-scoped Y.Doc subsystems (CLAUDE.md "CC1 push-over-awareness"); a property registry is a natural fit for that pattern.

**Alternative I'd propose.** Keep NG1's "All Properties" governance panel out of MVP (that's expensive UX). But pull a *minimum-viable property usage hint* into MVP: when the user starts typing a new property name in the Add-Property flow, show a list of existing property names from the current vault with usage count and inferred type. No rename, no governance, no `__system__` doc — just a synchronous read of the open documents' Y.Maps when the autocomplete dropdown opens. If the repo gets big enough that this read is slow, that's the trigger to promote to NG1's full registry.

This is what the user-facing "suggest, don't enforce" promise actually requires. Without it, MVP is "freeform YAML, but in a form" — which is half the value at most of the cost.

**What evidence would tip the decision.** Run the property-name grep across the current repo's markdown. If property names are already inconsistent today (`createdAt` vs `created_at` etc.) the in-MVP autocomplete is a bug fix. If they're uniformly clean, defer.

---

## Challenge 6 — D2 + D24 + D26 together front-load risk with no concurrent-multi-writer demonstration

**Severity:** HIGH (compositional — each individual decision could be defended; the bundle is the issue)

**What the spec decided.** Three load-bearing 1-way doors locked at spec time without quantitative evidence:

- D2 (per-key storage)
- D24 (patch handler virtual-string compose)
- D26 (panel structurally outside body)

**What I'm challenging.** Each LOCKED 1-way door demands "evidence-backed justification (or clearly labeled uncertainty + plan)" per the spec workflow's validation loop. D2 cites the research report's collaborative-realtime evidence file, but that file describes *capabilities* of CRDT models, not *measured demand* in this codebase. D24 explicitly defers verification to implementation. D26 cites only "user-provided screenshots" and a one-sentence quote. None of these cite traffic patterns, contention rates, or user-research signals from non-developer authors specifically.

The spec is shipping three 1-way doors on a single user session's screenshots and intuition. The Decision Log column "1-way door?" is filled in but the underlying check ("evidence-backed justification") is sparse for the locked items.

**Evidence.**

- SPEC D2 evidence column: links to research report and one evidence file. Both describe capability, not demand.
- SPEC D24 evidence column: links to migration-blast-radius.md §Phase 3, which is the spec's own planning doc — circular evidence.
- SPEC D26 evidence column: "User session 2026-04-24" — a single conversation.
- SPEC §workflow validation loop (skill content): "For each 1-way door, ensure: explicit user confirmation, evidence-backed justification (or clearly labeled uncertainty + plan)." Confirmation is present; evidence depth is uneven.

**Alternative I'd propose.** Demote D2, D24, D26 from LOCKED to DIRECTED for the duration of MVP. Keep them as the working direction but document an explicit reversal trigger for each:

- D2 reversal trigger: "if patch-handler integration (D24) blows up in implementation, reopen storage choice."
- D24 reversal trigger: already in the spec — implementer prototypes, escalates.
- D26 reversal trigger: "if TipTap integration evidence (A1) shows React-sibling breaks selection/focus/undo, reopen as fixed PM node."

This is the "minor tightening" verdict — the directions are right, the lock-confidence is overstated.

**What evidence would tip the decision.** Concurrent-write telemetry (per Challenge 1) for D2; agent-patch traffic split for D24; TipTap A1 verification (still listed as Active in the spec's Assumptions table) for D26.

---

## Challenge 7 — Source-mode YAML edit + form edit concurrency is under-specified

**Severity:** MED

**What the spec decided.** D13: "per-key diff" reconciliation when source mode YAML is parsed and applied to per-key Y.Map. R2 in the risk register: "Observer B overwrites form-driven per-key writes when source mode re-reconciles."

**What I'm challenging.** The spec's failure-recovery user journey for malformed YAML (§5) is well-handled, but the *valid-YAML* race is more interesting and under-specified. Scenario:

1. User A opens source mode and starts typing `topics:\n  - foo\n  - bar`.
2. User B (in another tab, or an MCP agent) clicks the form's `topics` chip input and adds `baz`.
3. Both writes land within the Observer B debounce window.

What's the merge result? D13 says "per-key diff" but `topics` is a single key — both writers are touching it. D10 says lists use `Y.Array<Y.Text>`, which gives per-element merge. So if User B's add lands as a `Y.Array.push(Y.Text("baz"))` and User A's typed YAML reconciles via per-key diff into "the new array is `[foo, bar]`", does User B's `baz` survive? The spec doesn't trace this through.

The deeper question: source mode and form mode operate on different abstraction levels — source mode is text-of-YAML, form mode is structured Y values. Reconciling them concurrently is a known-hard problem (it's why most editors disable one mode while the other is active, e.g., Obsidian's Source-mode-vs-Live-Preview-mode boundary).

**Evidence.**

- SPEC §5 failure path covers malformed YAML but not concurrent valid-YAML races.
- D13 says "per-key diff" but the example use cases (file-watcher, onLoadDocument, rollback) are all *replacement* scenarios. The form↔source-mode concurrency is a *merge* scenario.
- migration-blast-radius.md §R2: "Form properties silently revert when source-mode YAML is re-typed." This is the failure mode I'm describing — the spec acknowledges it but the mitigation ("integration test") doesn't define the merge semantics.
- Research report §7: "Concurrent property type changes ... are unresolved across all products."

**Alternative I'd propose.** Add a sub-decision (D13a or new) defining the form↔source-mode merge semantics: which mode wins when both have valid concurrent edits to the same property? Three reasonable options:

1. Last-writer-wins per-key (today's behavior, but at the key level instead of doc level).
2. Form takes precedence when source mode is "settling" (debounce window).
3. Source mode is a read-only projection of the per-key Y.Map (and edits there route through a parser-and-apply pipeline that uses the form's writer helper).

Option 3 is the most invariant-friendly but is a large source-mode UX change. Option 1 is smallest. Either is better than "implementer figures it out."

**What evidence would tip the decision.** Look at how Obsidian (the cited reference) handles this — its source-mode and Live-Preview properties form coexist; what does it do on concurrent edits across the boundary? Also: how often do users have source mode open simultaneously with the form? If it's rare, defer.

---

## Challenge 8 — "MVP target is non-developer authors" is asserted but not validated

**Severity:** LOW

**What the spec decided.** SPEC §4 P1: "Non-developer author, writing-first ... The MVP target." All other personas (P2 dev, P3 MCP agent, P4 file-watcher) are constraints, not targets.

**What I'm challenging.** The persona is named but not characterized with depth. What proportion of current Open Knowledge users are non-developer authors? Are any non-developer authors *currently* using the product, or is this an aspirational persona? The complication section says they hit a "hard wall," but a hard wall means they don't use the product — so they aren't there to design for. A spec that designs for an aspirational persona instead of an existing one is at high risk of building the wrong thing.

This is not a critique of the goal (G1 is a fine goal) but of the framing. The spec would be sharper as: "Developer authors *also* avoid frontmatter editing because the YAML mode-switch tax is real (complication.3); the form removes that tax for everyone, and *additionally* unblocks non-developer authors." That framing changes what counts as MVP-shippable — the developer's mode-switch tax gives an easier-to-measure success metric (form usage % among developers known to be using OK today).

**Evidence.**

- SPEC §1 complication.1: "WYSIWYG mode has no metadata affordance ... A hard wall for non-developer authors."
- SPEC §1 complication.3: "Even authors comfortable with YAML pay a context-switch cost."
- SPEC §7 Success metrics: deferred. Without metrics, the persona claim is not falsifiable.

**Alternative I'd propose.** Reframe the primary persona as "any author currently using OK who edits frontmatter" — deduplicate the value proposition across P1 and P2. Add a measurable success metric to §7 ("≥X% of frontmatter edits in week 4 post-launch use the form") that doesn't require knowing which user is a "non-developer." This keeps the design direction (form, friendly types, no YAML literacy required) but anchors success to observable behavior.

**What evidence would tip the decision.** Existing user telemetry on who edits frontmatter today and how (source-mode YAML, file-system tools, MCP). If the answer is "almost nobody edits frontmatter directly because YAML is a wall," that validates the persona but also weakens the urgency of D2 (per-key concurrency benefits scale with traffic that doesn't exist yet — see Challenge 1).

---

## Closing observation

The spec is well-organized and the alternatives within each decision are surfaced honestly. The challenges above don't reject the direction; they push back on **sequencing** (D2 first vs form first), **scope** (select/multi-select, minimum-viable property hint), and **lock-confidence** (1-way doors with thin evidence).

Three specific cold-read takeaways the spec author should weigh:

1. **The MVP could ship faster, smaller, and with the same UX win** by deferring D2's storage migration and using a UX-layer edit-lock for the rare concurrency case (Challenge 1). Reopen the sequencing question.
2. **D24 should be resolved at spec time, not implementation time** — splitting `agent-patch` into body-patch and frontmatter-set-property is a cleaner one-time breaking change than the in-handler virtual-string complexity (Challenge 2).
3. **Select/multi-select belongs in MVP** — it's a UX-layer concern over a YAML string, the spec foreclosed it on the wrong rationale, and it's the most-requested CMS field type (Challenge 3).
