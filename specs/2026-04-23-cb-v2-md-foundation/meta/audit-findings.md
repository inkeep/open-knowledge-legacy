# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/cb-v2-md-foundation/specs/2026-04-23-cb-v2-md-foundation/SPEC.md`
**Audit date:** 2026-04-23
**Total findings:** 7 (2 high, 3 medium, 2 low)

Drift check: baseline commit `315deae6` matches `HEAD` (no drift since spec was written); all evidence-file path references remain valid.

---

## High Severity

### [H] Finding 1: `remark-github-alerts` does NOT emit `mdxJsxFlowElement` nodes — neither shape hypothesized in A-MF4 is correct

**Category:** FACTUAL
**Source:** T3 (3P dependencies) — verified against source of `hyoban/remark-github-alerts`
**Location:** §6 FR-7, §12 A-MF4, §11 Q-MF1, evidence/research-report-pointers.md Callout §Parse plugin
**Issue:** A-MF4 frames the risk as binary ("emits `mdxJsxFlowElement` … If custom, add an mdast-type-to-Callout handler (~20 LoC)") and FR-7 commits to "`> [!TYPE]\nText` parses to `mdxJsxFlowElement(Callout, {type, title?})`". Source inspection of `hyoban/remark-github-alerts@v0.1.1` (the package name the spec uses throughout, resolved via Q-MF1 attribution) shows it emits **neither** shape — it mutates the existing `blockquote` node by attaching `data: { hName: 'div', hProperties: {...} }` for rehype consumption. No `mdxJsxFlowElement`, no custom mdast type.
**Current text:** A-MF4: "`remark-github-alerts` emits `mdxJsxFlowElement` mdast nodes (not custom `githubAlert` node type). If custom, add an mdast-type-to-Callout handler (~20 LoC). | MED | Verify at implementation; either path is viable"
**Evidence:** The package source returns `blockquote` mdast nodes with `data.hName`/`data.hProperties` — a rehype-oriented transform. A handler would have to rewrite blockquotes-with-hName-data into `mdxJsxFlowElement`, which is neither of the two paths the assumption enumerates. FR-7's committed "parses to `mdxJsxFlowElement(Callout, ...)`" describes the final desired mdast shape, not what the plugin produces. Remarkably, the same risk applies to the alternative package the web search surfaces as a more-discoverable alt (`jaywcjlove/remark-github-blockquote-alert`) — also blockquote-based, also no MDX-JSX output.
**Status:** CONTRADICTED
**Suggested resolution:** Either (a) upgrade A-MF4 from MED confidence to a known design requirement ("pair `remark-github-alerts` with a custom ~40-LoC blockquote-to-mdxJsxFlowElement transformer; the plugin alone is insufficient") and scope the LoC into FR-7's acceptance criteria, or (b) drop `remark-github-alerts` entirely and commit to the "custom ~150-line visitor" alternative flagged in Q-MF1 from day one. The spec's current framing presents "confirm plugin shape at implementation time" as low-risk verification; actually it's either a confirmed additional ~40-LoC transform or a de-facto decision to write the full custom visitor. Q-MF1's LOCKED-not-DELEGATED recommendation would remove ambiguity.

---

### [H] Finding 2: `inherited-architectural-decisions.md` §"Tests inherited + adjusted" references 9-value Callout enum and Callout foldable/defaultOpen PropDef — contradicts D-MF11 + D-MF13

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** evidence/inherited-architectural-decisions.md lines 69-73
**Issue:** The evidence file claims the 5-pack exercises "enum PropDef (Callout type × **9 values**; plus preload/variant supporting instances)" and "boolean PropDef (Callout **foldable/defaultOpen**; …Toggle defaultOpen)". Both descriptions are stale relative to D-MF11 (Callout enum narrowed to 5 values) and D-MF13 (Callout ships no foldable props). This evidence file was authored against an earlier iteration of the spec and never updated when the 2026-04-23 decisions landed. The `variant` prop reference is also stale relative to D-MF14 (Toggle drops `variant`).
**Current text (evidence/inherited-architectural-decisions.md L69-73):**
```
- enum PropDef (Callout type × 9 values; plus preload/variant supporting instances)
- string PropDef (every descriptor has at least one)
- number PropDef (Image, Video dimensions)
- boolean PropDef (Callout foldable/defaultOpen; Video 4 booleans; Audio 3 booleans; Toggle defaultOpen)
- reactnode PropDef (every descriptor children/icon)
```
**Evidence:** SPEC §10 D-MF11: "Callout descriptor enum narrows to GFM's 5 canonical types." §10 D-MF13: "Callout descriptor has no foldable props (no `collapsible`, no `defaultOpen`)." §10 D-MF14: "Toggle descriptor drops `variant` enum." Research-report-pointers.md correctly reflects all three decisions; this evidence file was not updated alongside them.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite the "Tests inherited + adjusted" section to reflect current descriptors: "enum PropDef (Callout type × 5 values; Image loading 2 values; Video/Audio preload 3 values)"; remove `variant` reference; replace Callout foldable/defaultOpen with a non-Callout boolean exemplar. The factual load-bearing claim this section makes — that the 5-pack still exercises every PropDef type — remains valid; only the illustrations are stale.

---

## Medium Severity

### [M] Finding 3: `cut-inventory.md` describes DIY Video component with YouTube/Vimeo URL sniff and DIY Callout with "9 types + foldable props" — contradicts D-MF11/12/13

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions within evidence corpus), L5 (summary coherence)
**Location:** evidence/cut-inventory.md lines 46, 47
**Issue:** Lines 46-47 describe the to-be-added DIY components as:
- `Callout.tsx` — ~150 LoC (shadcn semantic tokens + lucide icons, **9 types + foldable props**)
- `Video.tsx` — ~80 LoC (HTML5 `<video>` + **YouTube/Vimeo URL sniff → `<iframe>`**)
Both descriptions predate D-MF11 (5 types), D-MF12 (no URL sniff), D-MF13 (no foldable). Same drift pattern as Finding 2 — evidence file documented the earlier scoping and wasn't refreshed when the three narrowing decisions locked. Unlike Finding 2, cut-inventory.md is the sheet that parent-agent-acting-on-this-spec will consult to drive the implementation, so a reader would make scoping errors.
**Current text (evidence/cut-inventory.md L46-47):**
```
- `Callout.tsx` — ~150 LoC (shadcn semantic tokens + lucide icons, 9 types + foldable props)
- `Video.tsx` — ~80 LoC (HTML5 `<video>` + YouTube/Vimeo URL sniff → `<iframe>`)
```
**Evidence:** D-MF11, D-MF12, D-MF13 in SPEC §10. Research-report-pointers.md lines 14-15, 33-38 reflect the current narrowed surfaces correctly; cut-inventory.md does not. LoC estimates likely shrink too (less code = less LoC, though the spec doesn't gate on LoC so that's cosmetic).
**Status:** INCOHERENT
**Suggested resolution:** Replace with "`Callout.tsx` — ~120 LoC (shadcn semantic tokens + lucide icons, 5 GFM types, static admonition)" and "`Video.tsx` — ~60 LoC (pure HTML5 `<video>` wrapper; no URL sniffing)". Re-estimate LoC or drop the estimate altogether (LoC isn't acceptance-gated).

---

### [M] Finding 4: D-MF13 premise "Mintlify separates foldability into `<Expandable>` primitive = our Toggle" oversimplifies Mintlify's surface

**Category:** FACTUAL
**Source:** T3 / T4 — verified against https://mintlify.com/docs/content/components/expandables and /accordion
**Location:** §10 D-MF13 rationale, evidence/research-report-pointers.md Callout §foldable
**Issue:** D-MF13 argues that Mintlify "separates foldability into `<Expandable>` primitive = our Toggle" and cites it as symmetric support for the "no foldable Callout" decision. Mintlify's actual shape: `<Expandable>` has exactly 2 props (`title`, `defaultOpen`) — it's the "minimal toggle" per the Callout/Toggle research. `<Accordion>` has 6 props (title, description, defaultOpen, id, icon, iconType). OK's proposed 6-prop Toggle (D-MF14) matches Mintlify **Accordion**, not Expandable. The "Expandable = our Toggle" equation is off by 4 props. The Callout-foldable decision survives the re-framing (neither Mintlify nor Fumadocs has foldable callouts) but the supporting argument needs tightening.
**Current text (§10 D-MF13):** "Matches Mintlify (static Callout; collapsibility via separate `<Expandable>` primitive = our Toggle) … Users wanting a foldable admonition today compose via MDX: `<Toggle title="..."><Callout type="warning">...</Callout></Toggle>` — matches Mintlify's primitive-separation pattern exactly."
**Evidence:** Mintlify Expandable documented props (verified): `title: string`, `defaultOpen: boolean`. Mintlify Accordion documented props: `title`, `description`, `defaultOpen`, `id`, `icon`, `iconType`. OK Toggle per D-MF14: `title`, `defaultOpen`, `icon`, `description`, `id`, `name` — matches Accordion (minus iconType, plus name). `<Expandable>` is the minimal toggle; `<Accordion>` is the full-featured one; OK Toggle is the union of Accordion + HTML5 `<details name>`.
**Status:** CONTRADICTED (partial — decision is sound; citation is inaccurate)
**Suggested resolution:** Rewrite D-MF13 rationale as: "Matches Mintlify's primitive separation — foldability lives in `<Accordion>`/`<Expandable>` (both have `defaultOpen`), not in Callout. Our Toggle subsumes both. Users wanting a foldable admonition compose `<Toggle title="..."><Callout type="warning">…</Callout></Toggle>`." Toggle-research-report-pointers.md §Final descriptor shape already gets this right ("matches Mintlify Accordion surface exactly"); the fix is spec-local.

---

### [M] Finding 5: evidence/research-report-pointers.md §Callout claims `remark-github-alerts` is by "Remco Haszing" — actual author is `hyoban`

**Category:** FACTUAL
**Source:** T4 (web verification)
**Location:** §11 Q-MF1 ("remark-github-alerts (Remco Haszing)")
**Issue:** Q-MF1 attributes `remark-github-alerts` to Remco Haszing. The package at https://github.com/hyoban/remark-github-alerts is by GitHub user `hyoban`. Remco Haszing (`remcohaszing`) is a prolific author of remark plugins (including `remark-mdx`, `remark-directive`, etc.) and may be why the confusion arose, but he is not the author of this specific package. Minor because the attribution doesn't affect technical decisions, but the user directive for this spec emphasized research health evaluation during implementation (Q-MF1 DELEGATED), and an incorrect-authorship signal points evaluators at the wrong maintainer profile.
**Current text:** "GFM-alerts → Callout: which exact plugin package — `remark-github-alerts` (Remco Haszing) vs custom ~150-line visitor?"
**Evidence:** npm + GitHub metadata for `remark-github-alerts@0.1.1` lists `hyoban` as author. Published from repo `github.com/hyoban/remark-github-alerts`.
**Status:** CONTRADICTED
**Suggested resolution:** Replace "(Remco Haszing)" with "(hyoban)" in Q-MF1. Same fix in research-report-pointers.md if the attribution appears there (spot check finds it doesn't — only Q-MF1 has it).

---

## Low Severity

### [L] Finding 6: `cut-inventory.md` claims `compound-wrappers.tsx` is 432 LoC — actual is 431

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/cut-inventory.md line 38
**Issue:** `cut-inventory.md` L38 states "compound-wrappers.tsx — 432 LoC, only consumer was Tab/Accordion/etc." `wc -l packages/app/src/editor/components/compound-wrappers.tsx` returns `431`. Off-by-one, likely from an earlier count with a trailing newline. Does not change any decision; purely cosmetic. Noted for completeness because cut-inventory.md is cited as the implementation-driving manifest.
**Current text:** "compound-wrappers.tsx — 432 LoC, only consumer was Tab/Accordion/etc."
**Evidence:** `$ wc -l packages/app/src/editor/components/compound-wrappers.tsx` → `431`.
**Status:** STALE (minor)
**Suggested resolution:** Change `432` to `431` or drop the LoC figure (it's not gated anywhere). Also: `~431 LoC` appears in SPEC §1 Complication ("~431 LoC `compound-wrappers.tsx` + support machinery") — that one is correct; the corresponding evidence-file text can align either way.

---

### [L] Finding 7: Evidence file `inherited-architectural-decisions.md` says `bridgeId` is consumer of "PR #168 Selection layer" — the lock rationale in the parent CB-v2 SPEC Q10 frames bridgeId as compound-component consumer

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** evidence/inherited-architectural-decisions.md line 23; also A-MF3, cut-inventory.md L63
**Issue:** Three places in the evidence corpus state that "Selection layer (PR #168) remains the only consumer of `bridgeIdPlugin` PluginState" (A-MF3 is HIGH confidence on this). The parent CB-v2 SPEC Q10 LOCKED description frames `bridgeId` primarily as the Context-Bridge-Registry glue for compound components ("CB23 acceptance … scope-resolved Context capture"). Context Bridge Registry is retracted on this branch (D-MF4 + inherited-architectural-decisions.md §"Precedent retracted"). So either:
- (a) PR #168 Selection layer is a separate, later-added consumer (the evidence implies this with "only consumer") — in which case the 5-pack genuinely has a live consumer and the plugin stays, OR
- (b) bridgeId was originally scoped for compound consumers, PR #168 adopted it incidentally, and "only consumer" is accurate but the framing makes it sound load-bearing when it's actually a historical accident.
The ambiguity isn't resolved in the inherited-architectural-decisions.md pointer — reader can't tell whether keeping `bridgeIdPlugin` is "load-bearing for PR #168" or "legacy kept because PR #168 picks it up."
**Current text (A-MF3):** "Selection layer (PR #168) remains the only consumer of `bridgeIdPlugin` PluginState after our cut | HIGH | Confirmed via explore output; no other downstream readers found"
**Evidence:** Parent CB-v2 SPEC Q10 rationale (lines 2225-2226) cites bridgeId as compound-context infrastructure. cut-inventory.md L63 says "Keep unchanged (load-bearing): bridge-id-plugin.ts — consumer is PR #168 Selection layer." Neither says *when* PR #168 became a consumer or what selection-layer need bridgeId serves.
**Status:** UNVERIFIABLE (from evidence in this spec; one sentence of provenance would close the gap)
**Suggested resolution:** Add a one-liner to A-MF3 or inherited-architectural-decisions.md clarifying what PR #168 uses bridgeId for (e.g., "Selection layer keys per-NodeView selection state off bridgeId for descendant-selected highlighting"). Prevents a future reader from questioning why the plugin stays when its original compound-component consumer is gone.

---

## Confirmed Claims (summary)

Coverage of verified claims across the 7 coherence lenses + 5 factual tracks:

**Factual T1 (own codebase):**
- `built-ins.ts` contains 17 descriptors with the 12 cut names at the claimed line ranges (CONFIRMED: L294-317 Banner; L60-107 Card; L111-127 Step; L131-167 Tabs; L171-201 Accordion; L205-256 File/Files/Folder; L321-335 TypeTable; L339-346 InlineTOC; L258-292 ImageZoom; L348-363 Audio; L33-56 Callout).
- All 5 `emptyChildName` descriptors are in cuts (Cards → Card, Steps → Step, Tabs → Tab, Accordions → Accordion, Files → File L479+L490). Zero 5-pack descriptors have `emptyChildName`. Claim that `typed-children-guard.ts` becomes a no-op is structurally correct.
- `compound-wrappers.tsx` only consumer is `componentMap.tsx` L31 (EditorAccordion/EditorAccordions/EditorTab/EditorTabs imports). Correct.
- `InlineTOCView.tsx` is the only consumer of `EditorContext.tsx` (verified via `grep useEditorContext|EditorContextProvider` — three files: JsxComponentView.tsx, InlineTOCView.tsx, EditorContext.tsx). JsxComponentView's wrap (L813) becomes null-consumer without InlineTOCView. Correct.
- `globals.css` L9 has the `@source "../../../node_modules/fumadocs-ui/dist/**/*.js"` scan directive; 27 `--color-fd-*` occurrences; fd-accordion-up / fd-collapsible-up keyframes at L1367-1400; `[data-component-type="imagezoom"]` at L1536; `[data-component-type="cards"]` + `[data-component-type="steps"]` halo tuning at L1545-1546. All claims in cut-inventory.md §CSS verified.
- `slash-command/component-items.ts` L20 + L53: `GitGraph` import exists (pre-existing dead; removed with Mermaid). Correct.
- Audio's current `hasChildren: false, isSelfClosing: true` at L561-562 — matches FR-4's flip intent.
- `shared.ts` L33 + L78: `TypedChildrenGuard` registration present. Correct.

**Factual T3/T4 (external):**
- `react-medium-image-zoom@5.4.3` exists (CONFIRMED via GitHub + unpkg; last release April 7, 2026). FR-16 + D-MF3 correct.
- HTML5 `<details name>` browser support: Chrome 120, Safari 17.2, Firefox 130 (CONFIRMED via caniuse). A-MF5 + Toggle research citation accurate.
- Mintlify Accordion: 6 props (title/description/defaultOpen/id/icon/iconType). D-MF14's claim that Toggle 6-prop descriptor "matches Mintlify Accordion surface exactly" structurally correct (modulo Mintlify's iconType and our `name`).
- Fumadocs has no Video or Audio component. D-MF12's foundational claim verified.
- `remark-github-alerts` package exists on npm (hyoban, v0.1.1, March 2025); maintained. (Q-MF1 correct that the package exists; Finding 1 shows it doesn't emit the expected shape.)

**Coherence lenses:**
- **L1 (cross-finding contradictions):** Findings 2 + 3 — two evidence files carry stale claims against D-MF11/12/13/14.
- **L2 (confidence-prose misalignment):** A-MF4 carries MED confidence — correctly — but the prose ("either path is viable") understates the likelihood that the plugin produces neither path (Finding 1).
- **L3 (missing conditionality):** FR-7 acceptance "Round-trip invariant: `parse(gfmAlert) === parse(mdxCalloutEquivalent)` produces same PM tree" is unconditional; the implementation-time work to make that invariant hold is elided (Finding 1 makes it ~40-LoC additional transform, not plugin-wiring).
- **L4 (evidence-synthesis fidelity):** Research reports correctly reflect current decisions (e.g., research-report-pointers.md Toggle §Final descriptor shape accurately narrates D-MF14). SPEC's §10 decisions faithfully represent the narrowing argument. Drift is inside the evidence-helpers (Findings 2, 3), not between spec and source research.
- **L5 (summary coherence):** §1 Problem Statement correctly identifies the 5-pack. §2–§7 goals/requirements match. No drift between summary and detailed §10.
- **L6 (stance consistency):** Uniformly prescriptive-but-reversible ("NO (reversible additively)") — stance is applied consistently across all 15 D-MF decisions.
- **L7 (inline source attribution):** Spec footnotes research reports inline at every FR-*. A reader can trace each narrowed decision to its cross-platform evidence without opening evidence files, except for Finding 4's D-MF13 citation precision.

## Unverifiable Claims

- **PR #168 Selection layer's bridgeId consumption.** Flagged as Finding 7. The spec claims bridgeIdPlugin has one consumer (PR #168) but provides no pointer to the consumer's code or spec. Not reachable from this worktree's tree alone.
- **Compound-wrappers.tsx preservation on PR #165 branch.** D-MF4 claims "All preservation via PR #165 branch." Could not verify PR #165's branch content from this audit's scope; accepting as-is under the user directive "preservation is on PR #165."
- **`remark-github-alerts` maintenance health beyond March 2025.** Last release March 21, 2025 (v0.1.1). The spec's Q-MF1 delegates this verification to implementation time; cannot be resolved today.
- **Exact LoC estimates for new DIY components** (~150 for Callout, ~120 for Image, ~80 for Video, ~40 for Audio, ~40 for Toggle in cut-inventory.md). Not verifiable pre-implementation; not acceptance-gated.
