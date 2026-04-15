# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-14-source-view-polish-engine/SPEC.md`
**Audit date:** 2026-04-14
**Baseline commit verified:** `f17ad00` (matches current HEAD)
**Total findings:** 11 (4 High, 4 Medium, 3 Low)

---

## High Severity

### [H1] Compartment + user-toggle contradiction across §4 / §6.5 / §9 / §11

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** §4 In Scope (lines 50, 60–61), §6.5 (line 261), §7.3 Emphasis trade-off (line 485), §9 (lines 583–587), §11 Phase 5 (lines 666–668), §14 Risks (line 704)
**Issue:** The spec simultaneously asserts that the engine is always-on with no Compartment and no user-facing toggle, AND that there is a Compartment-driven on/off toggle, a settings UI, and a `Cmd+Shift+P` shortcut. These cannot both be true; this is the spec's central product-shape contradiction.
**Current text:**
- §4 line 50: "Compartment wrapping for runtime on/off toggle"
- §4 lines 60–61: "**User preference:** On/off toggle for whole engine (via Compartment reconfigure)"
- §7.3 line 485: "Compartment toggle disables polish if preferred"
- §6.5 line 261: "No Compartment for the polish engine — the engine is always active."
- §9 line 583: "**The engine ships always-on. No user-facing toggles.**"
- §9 line 587: "**Compartment is NOT used.**"
- §11 Phase 5 lines 667–668: "`polishLevel` settings UI (off/minimal/full)" + "`Cmd+Shift+P` shortcut toggle"
- §14 line 704 mitigation: "no Compartment escape hatch (per §9)"
**Evidence:** Self-contradictory within the spec; no external evidence required.
**Status:** INCOHERENT
**Suggested resolution:** Pick one stance (the prompt indicates "no user-facing toggle (engine ships always-on)" is the locked decision). Strip Compartment language from §4 In Scope, drop the "User preference" sub-bullet for whole-engine toggle, remove §7.3's "Compartment toggle" trade-off line, and remove `polishLevel`/`Cmd+Shift+P` from Phase 5. Phase 5 needs full re-scope or removal.

---

### [H2] Phase 2 promises YAML fold; §7.2 explicitly defers fold to Phase 4+

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** §7.2 YAML frontmatter (lines 391, 403, 405), §11 Phase 2 (lines 649–650)
**Issue:** §11 Phase 2 lists "YAML frontmatter with fold" as in-scope and the exit gate requires "fold works." §7.2 says the opposite: "no nested YAML syntax highlighting in Phase 2," fold "deferred — requires `foldNodeProp`... Phase 4 or later," and trade-off "no collapse toggle in Phase 2 (deferred)."
**Current text:**
- §11 line 649: "YAML frontmatter with fold"
- §11 line 650 exit gate: "fold works"
- §7.2 line 403: "**Fold:** deferred — requires `foldNodeProp` on a custom node; ... Phase 4 or later."
**Evidence:** Internal contradiction.
**Status:** INCOHERENT
**Suggested resolution:** Remove "with fold" from Phase 2 and drop the "fold works" exit gate; restate Phase 2 YAML scope as line-tint only per §7.2.

---

### [H3] §7.4 still uses non-existent `LinkReferenceDefinition` node + retains wikilink in broken-ref engine that §7.3/Phase 4 dropped

**Category:** FACTUAL + COHERENCE
**Source:** L1 + T2 (source-verified evidence)
**Location:** §7.4 Family D Broken-reference checkers (lines 547–556), Phase 4 (line 662), §7.3 WikiLink decision (lines 516–528)
**Issue:** Two problems in one section:
1. `collect` pass references "all `LinkReferenceDefinition` labels" — but per `evidence/technical-validation-primitives.md` lines 43, 222–223, this node name **does not exist** in `@lezer/markdown`. The actual node is `LinkReference` (used for both block-level definitions and inline references; disambiguate by parent node). The spec corrects this in §7.2 (definition block) and §7.3 (link/image), but fails to correct it in §7.4.
2. The `check` pass iterates "per `LinkReference` / `WikiLink`" and the CSS class list includes `cm-wikilink-broken`. But §7.3 WikiLink decision explicitly drops wikilinks from the polish engine ("polish engine registry skips this construct"), and Phase 4 line 662 says broken-ref is "link-ref only — wikilink broken-state is the existing plugin's concern, not the engine's."
**Current text (§7.4 line 552):** `collect` pass: gather all `LinkReferenceDefinition` labels + (async) wiki page index"
**Evidence:** `evidence/technical-validation-primitives.md` §1 + §Summary corrections #1.
**Status:** CONTRADICTED + INCOHERENT
**Suggested resolution:** Replace `LinkReferenceDefinition` with `LinkReference` (with parent-node disambiguation note matching §7.2). Strip wikilink/`WikiLink`/`cm-wikilink-broken`/wiki page index from §7.4 entirely; cross-link to wiki-link-source.ts as the wikilink concern owner.

---

### [H4] §6.5 wiring code passes `htmlLanguage` to `htmlTagLanguage`, which is a type error

**Category:** FACTUAL
**Source:** T2 (source-verified)
**Location:** §6.5 Extension wiring (lines 243, 251)
**Issue:** §6.5 imports `htmlLanguage` from `@codemirror/lang-html` and passes it as `htmlTagLanguage: htmlLanguage`. Per `node_modules/@codemirror/lang-html/dist/index.d.ts:64`, `htmlLanguage` is an `LRLanguage`. Per `node_modules/@codemirror/lang-markdown/dist/index.d.ts:115`, `htmlTagLanguage?: LanguageSupport`. `LRLanguage ≠ LanguageSupport`. Evidence file `technical-validation-primitives.md` line 134 explicitly says: "Pass `htmlTagLanguage: html({ matchClosingTags: false })` or omit it (default already does this)."
**Current text:** `htmlTagLanguage: htmlLanguage,  // verified correct option name (NOT `htmlParser`)`
**Evidence:** `evidence/technical-validation-primitives.md` §2 line 134 + §5 line 216.
**Status:** CONTRADICTED
**Suggested resolution:** Change to `htmlTagLanguage: html({ matchClosingTags: false })` (importing `html` not `htmlLanguage`), or omit the option entirely (default behavior is identical). Update import line 243 accordingly. The §5b PR1 snippet uses `htmlTagLanguage: undefined` which is acceptable but the comment "defers to inline HTML via parseCode" is misleading — undefined applies the default `html({matchClosingTags: false})`, which IS the wiring.

---

## Medium Severity

### [M1] Phase 4 fenced-code highlighting depends on `@codemirror/language-data`, which §5b defers in language but adds in PR1

**Category:** COHERENCE
**Source:** L3 (missing conditionality between phases)
**Location:** §5b PR1 dep adds (line 125), §11 Phase 4 (line 663)
**Issue:** The dependency add list (§5b line 125) treats `@codemirror/language-data` as part of PR1 prerequisite; Phase 4 line 663 says "already wired up in PR1; this phase validates it renders correctly under the engine." Consistent — but §6.5 wiring snippet (line 248–250) does NOT actually wire `codeLanguages: languages` despite importing it on line 241. The snippet imports `languages` but only passes `extensions: [GFM]`, omitting `codeLanguages`. Phase 4's "validates it renders correctly" presupposes that the wiring happens earlier, but the spec's wiring template is incomplete.
**Current text (§6.5 lines 247–252):**
```
markdown({
    base: markdownLanguage,
    extensions: [GFM],
    codeLanguages: languages,
    htmlTagLanguage: htmlLanguage,
}),
```
Wait — re-reading: `codeLanguages: languages` IS present on line 250. Misread on first pass. **DOWNGRADE this finding to LOW** or dismiss. Re-checking: yes line 250 has it. Dismissing.
**Status:** Dismissed on re-read — `codeLanguages: languages` is present in §6.5. No finding.

---

### [M2] §6.5 wiring snippet drops the existing `agent-flash-source` extension factory call

**Category:** COHERENCE
**Source:** L1 (spec vs current state)
**Location:** §6.5 (lines 245–258), evidence/open-knowledge-1p-state.md §2
**Issue:** Current SourceEditor.tsx extensions array (per evidence file §2 lines 64–76) includes `createAgentFlashSourceExtension(provider.document)` as a separate factory. §6.5 reduces this to a comment "...other existing extensions (agent-flash-source, wiki-link-source, md-link-source)..." which is fine as shorthand, but combined with the H4 type error on `htmlTagLanguage`, an implementer copy-pasting §6.5 will produce broken code. Also: §6.5 omits the `EditorView.theme({ '&': { height: '100%' } })` block currently in the file — minor but worth noting since "existing extensions" comment is doing a lot of work.
**Current text:** `// ...other existing extensions (agent-flash-source, wiki-link-source, md-link-source)...`
**Evidence:** `evidence/open-knowledge-1p-state.md` §2 SourceEditor.tsx extensions array.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Either inline the full current extensions array or label §6.5 explicitly as "delta only — existing extensions retained verbatim."

---

### [M3] §3 success criteria reference "polish on vs off" but §9 forbids the toggle

**Category:** COHERENCE
**Source:** L1
**Location:** §3 Must pass (line 31), §10.3 Integration tests (lines 610–611), §9 (line 583)
**Issue:** §3 line 31: "Editing parity — find/replace, multi-cursor, column-select, y-codemirror.next collab produce identical behavior with polish on vs off." §10.3: "Multi-cursor / column-select smoke test: operations produce identical results polish-on vs polish-off." If the engine is always-on with no toggle (per §9), "polish on vs off" is undefined as a runtime state. The acceptance criterion presumes a toggle that the product spec rules out.
**Status:** INCOHERENT
**Suggested resolution:** Reframe acceptance as "operations produce identical results with the engine present vs. with the engine module removed from the extensions array" (a build-time / test-fixture distinction, not a runtime toggle). Same fix for §10.3.

---

### [M4] §14 Risk row for "Composition-page feels busy" cites "(§3 qualitative)" for "strict opacity ceilings" but §3 contains no numerical ceilings

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** §14 line 704, §3 qualitative (lines 34–39)
**Issue:** The mitigation text says "Strict opacity ceilings (§3 qualitative)" — but §3 qualitative criteria are the 3-meter test, glance test, prose-unaffected rule, and no-mode-switching-surprise. None of these are numerical opacity ceilings. The actual numerical ceilings (Tier 2 ≤4%, Tier 1 ≤5%, etc.) live in §7 per-construct CSS. The cross-reference is inaccurate.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Either move numerical ceilings into §3 as explicit Must-pass items (e.g., "Tier 1 line tints ≤5%, Tier 2 cell bands ≤4%, structural borders ≤30% mixed") or correct the §14 cross-reference to point at §7 per-construct CSS values.

---

## Low Severity

### [L1] §6.5 import of `htmlLanguage` is unused after H4 fix

**Category:** COHERENCE (consequence of H4)
**Location:** §6.5 line 243
**Issue:** If H4 is resolved by switching to `html({ matchClosingTags: false })`, the import on line 243 should change from `import { htmlLanguage } from '@codemirror/lang-html';` to `import { html } from '@codemirror/lang-html';`.
**Status:** INCOHERENT (cascade from H4)

---

### [L2] §11 Phase numbering inconsistency: Phase 5 marked "(P1)" while §3 has no priority taxonomy

**Category:** COHERENCE
**Location:** §11 Phase 5 (line 666)
**Issue:** Phase 1–4 are tagged "(P0)"; Phase 5 is "(P1)". The spec doesn't define what P1 means, and §15 Open questions notes a P0/P2 binary (per the spec skill convention there's "no P1"). Minor labeling inconsistency, but resolves itself if Phase 5 is removed per H1.
**Status:** INCOHERENT (minor)

---

### [L3] Evidence file references `§3.2` and `§A5` that don't exist in SPEC.md numbering

**Category:** COHERENCE
**Location:** `evidence/technical-validation-crossscan-perf-yjs.md` §1, §5, §Summary
**Issue:** The cross-scan/perf evidence file repeatedly cites "SPEC.md §3.2 cross-scan dispatcher" and "§A5 benchmark." The spec has no §3.2 (architecture is §6.x) and no §A5 (assumption table starts at §17 with A1–A12). Stale references from an earlier draft of SPEC.md. Doesn't affect spec content but undermines traceability.
**Status:** STALE (in evidence, not the spec itself)
**Suggested resolution:** Either update evidence file references to match current §6.3 / §17 A5 numbering, or note this as known evidence-vs-spec drift in a meta footer.

---

## Confirmed Claims (summary)

**Factual claims verified against evidence + source code:**
- "markdown() is called bare" — CONFIRMED. Verified at `packages/app/src/editor/SourceEditor.tsx:64` (`markdown(),`).
- "y-codemirror.next never inspects decorations" — CONFIRMED. `evidence/technical-validation-crossscan-perf-yjs.md` §3 cites `~/.claude/oss-repos/y-codemirror.next/src/y-sync.js:236-303` directly.
- Node-name corrections in §7.2 (`LinkReference`, definition block), §7.3 (`Image` for image-references, `EmphasisMark` for both `*` and `**`, `StrikethroughMark`) — CONFIRMED against `evidence/technical-validation-primitives.md` §1 with exact source line citations from `node_modules/@lezer/markdown/src/markdown.ts` and `extension.ts`.
- `htmlTagLanguage` is the public option name (NOT `htmlParser`) — CONFIRMED. Evidence file §2 line 134 + §5 line 213. (But the wiring SNIPPET in §6.5 still has a value-type error — see H4.)
- Browser-support claims (color-mix oklab, oklch, box-decoration-break with `-webkit-` prefix, custom properties in inline style) — CONFIRMED against `evidence/technical-validation-css-browser-support.md`. Vite 8 baseline = Chrome 111+/Safari 16.4+/Firefox 114+ matches the spec's A11.
- Preserve-source-indent CSS pattern is community-standard (dralletje, codemirror-wrapped-line-indent, Pluto.jl) — CONFIRMED with caveat that rectangular-selection has known visual quirk; spec acknowledges this.
- CM6 versions (`@codemirror/view@6.41.0` > 6.39.4 block-widget cursor fix) — CONFIRMED against `bun.lock` resolution.
- Tailwind v4 token convention (`--color-*`, no `--ok-*` prefix) — CONFIRMED against `globals.css`.

**Coherence checks that passed:**
- Tier 2 cell band opacity "≤4%" — consistent across §4 In Scope, §7.2 Table treatment line 411, and §14 Risk row 707.
- Most node-name corrections (§7.2 / §7.3) propagate consistently EXCEPT §7.4 (see H3).
- NEVER vs NOT NOW non-goal labels look reasonable — image inline thumbnails, render-as-HTML, horizontal scroll, Obsidian Live Preview are correctly NEVER under the locked product stance; interactive widgets / per-cell cursor reveal correctly NOT NOW.
- Confidence labels in §17 Assumptions table align with evidence: CONFIRMED claims have source-verified citations; UNCERTAIN (A5) is the cross-scan perf budget that requires Phase 4 benchmark.

## Unverifiable Claims

- "PROJECT.md table region height = 235,320 px total across 60 rows" (§3 line 28) — could not verify without running the editor; treated as authoritative measurement.
- "Marijn Haverbeke" attribution for "Group ViewPlugins by trigger profile, not per-construct" (§6.4 line 228) — evidence file confirms the pattern is canonical (§5 of crossscan-perf-yjs.md) but does not contain a Marijn quote on this specific point. The phrase "Verified pattern via Subagent 2 evidence" is accurate in spirit; "load-bearing per Marijn Haverbeke" attribution in §6.3 line 219 also doesn't have a direct quote in the evidence — it's an inference from his general "block from StateField, inline from ViewPlugin" guidance, which evidence cites at discuss.codemirror.net thread #4372. The dispatch RULE (§6.3) is reasonable but the specific attribution is overconfident relative to evidence.

## Overconfident Attributions (informational, not severity-rated)

- §6.3 "(load-bearing per Marijn Haverbeke)" — evidence supports the pattern but not the specific framing as Marijn's authoritative position.
- §6.4 "**StateField full rescan is idiomatic.** Marijn-endorsed default" — evidence supports this with thread #4372 quote on StateField vs ViewPlugin and thread #3975 quote on "probably overkill" for incremental. Claim is defensible; attribution is fair.
