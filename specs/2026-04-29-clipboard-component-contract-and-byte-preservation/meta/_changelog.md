# Changelog — Clipboard Component Contract and Byte Preservation

## 2026-04-29 — Spec scaffold + intake

**Session context:** Following an /explore session that mapped PR #310 (CB-v2 MD-Foundation) and the OK→OK paste regression for `<img>` end-to-end, user invoked /spec to formalize the work. Intake captured 4 LOCKED decisions in one turn.

**Created:**
- `SPEC.md` — scaffold with D1-D4 in Decision Log + Q1-Q5 in Open Questions
- `evidence/_user_outcomes.md` — verbatim user-stated outcomes from intake
- `meta/_changelog.md` — this file

**Baseline commit:** `8587b6e5`

**Decisions locked this session:**
- **D1** Preservation = byte-for-byte source identity (not descriptor identity or render fidelity)
- **D2** Both WYSIWYG and Source views in scope, symmetric
- **D3** Outbound clipboard contract for custom OK components (toClipboardHast or equivalent) — architectural foundational pattern, not just OK→OK
- **D4** Cross-machine "raw file pasted as text via email/Slack" scenario in scope; principle = byte preservation across the full paste matrix

**Open Questions raised:**
- **Q1** Where does byte-preservation currently fail? (User explicitly asked)
- **Q2** Clipboard structural payload wire format (PM JSON / canonical mdast / OK subset / markdown-pinned-to-envelope)
- **Q3** MIME-write strategy (sync-event vs Chromium pickling vs both)
- **Q4** `toClipboardHast` contract shape
- **Q5** Cross-machine vs same-machine differences (User explicitly asked)

**Next step:** Step 2 — dispatch /worldmodel for grounded topology.

## 2026-04-29 — Worldmodel grounding + framing investigation

**Session context:** Worldmodel returned full 9-section topology saved to `evidence/_init_worldmodel.md`. User then asked three substantive technical questions: (1) any inherent contradictions with prior precedents/rules, (2) how the OK MIME differs from text/plain MIME, (3) why we don't always do full byte preservation. Investigation produced three new evidence files.

**Renamed:** spec directory from `2026-04-29-paste-byte-preservation` to `2026-04-29-clipboard-component-contract-and-byte-preservation` per user direction.

**Created:**
- `evidence/_init_worldmodel.md` — 9-section grounded topology
- `evidence/precedent-and-d14-analysis.md` — exhaustive precedent-by-precedent contradiction analysis
- `evidence/structural-payload-mechanism.md` — data-attr-on-HTML vs sync-event MIME comparison
- `evidence/byte-preservation-rationale.md` — why coercion exists + 15-editor peer survey

**Decision-implicating findings surfaced:**
- **Sync-event custom MIME for OK→OK contradicts precedent #19(b)**. PM hooks have no slot for a third MIME; the only mechanism is DOM-level `handleDOMEvents.copy/cut/dragstart`, which is prohibited. The data-attr-on-HTML mechanism (sister to PM's auto-attached `data-pm-slice`) sidesteps the contradiction entirely and gives strictly better OS-clipboard-manager survival.
- **Q2 (wire format) and Q3 (MIME-write strategy) collapse** under the data-attr resolution — there's no new MIME, the canonical bytes live in text/plain, the data-attr is a presence flag.
- **D1 needs explicit "modulo NG1-NG11" qualifier** because the unified-stack-inherent normalizations are inherited on the clipboard path. Without the qualifier D1 is uncheckable.
- **Adopting BlockNote's mechanism verbatim is prohibited.** The contract shape (`toClipboardHast` per descriptor) is fine; the dispatch site MUST be `clipboardSerializer.serializeFragment`, not `handleDOMEvents.copy`.
- **Peer-comparison context**: NG1-NG11 normalization set is roughly the median of unified-ecosystem markdown WYSIWYG editors (Outline, Milkdown, Keystatic). Not unique; not unreasonable.

**Pending user reaction:** new design option for Q2/Q3 (data-attr-on-HTML); refined D1 wording; resolution of one contradiction (sync-event MIME path → drop in favor of data-attr).

## 2026-04-30 — FR-13-first pivot + heuristic-survey verification + framing close

**Session context:** User pushed on whether Branch 0 / data-ok-slice was needed at all given text/plain already carries canonical OK markdown. Investigation confirmed FR-13-first dispatcher reorder + extended heuristic achieves the same goal with strictly less infrastructure. Two /research dispatches against primary sources confirmed factual claims about text/markdown clipboard support and per-editor markdown-on-text/plain emission, plus surveyed peer markdown-detection heuristics.

**Created:**
- `evidence/branch-c-disk-outcome-trace.md` — what each Branch C input produces on disk; confirms TipTap `Image.configure` parseDOM is load-bearing
- Appendix at `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` lines 1173-1240 — `## 2026-04-30 verification update` (text/markdown dead, per-editor markdown emission verified)
- Appendix at `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` lines 1242-1363 — `## 2026-04-30 markdown-detection heuristic survey` (peer heuristics, missing signals)
- Evidence at `reports/tiptap-clipboard-round-trip-markdown/evidence/markdown-detection-heuristic-survey.md`

**Decisions locked this session:**
- **D1 (REFINED)** byte-for-byte source identity, **modulo NG1-NG11** storage normalizations baked into the unified parse/serialize pipeline.
- **D5 (NEW)** FR-13-first dispatcher reorder (WYSIWYG and Source). Move markdown-first ahead of Branch C `data-pm-slice`.
- **D6 (NEW)** No custom MIME, no marker attribute, no DOM-level event handlers. Mechanism stays inside PM hooks + CM6 `EditorView.domEventHandlers`.
- **D7 (NEW)** NG1-NG11 carve-out from D1's byte identity. Clipboard path commits to no NEW lossy normalizations beyond NG1-NG11.
- **D8 (NEW)** Heuristic signal extension: blockquote, inline code, paired emphasis (peer-survey), capitalized JSX open tag, lowercase JSX-with-attr (D4/JSX). Threshold formula unchanged.
- **D9 (NEW)** Promotion notice on `2026-04-16-clipboard-mdast-canonical/SPEC.md` NG1 + FR-3 + FR-14 per CLAUDE.md post-ship corrigendum-annotation pattern.

**Open Questions transformed:**
- **Q2 / Q3 DISSOLVED** by D5 + D6 — no structural payload, no new MIME.
- **Q1, Q4, Q5 unchanged** — still P0 for iterate phase.
- **Q6 (NEW)** Compat descriptor clipboard semantics.
- **Q7 (NEW)** Does FR-13-first break Branch C cross-PM-editor interop in any meaningful way?
- **Q8 (NEW)** Default fallback when descriptor doesn't define `toClipboardHast`.

**SPEC.md updated:**
- §1 Problem statement filled with SCR
- §2 Goals G1-G6 drafted
- §3 Non-goals NG-S1 through NG-S13 with temporal tags
- §4 Persona P1 + secondary destinations + secondary sources + AI-agent exclusion
- §5 User journeys J1-J4 + interaction state matrix
- §8 Current state from worldmodel
- §9 Proposed solution skeleton (3 layers: dispatcher reorder, heuristic extension, toClipboardHast contract)
- §10 Decision log D1 refined + D5-D9 added
- §11 Open questions Q2/Q3 closed; Q6/Q7/Q8 added
- §12 Assumptions A1-A4 drafted
- §13 In Scope skeleton with rollout considerations
- §14 Risk register
- §15 Future Work (Explored, Identified, Noted tiers)
- §16 Agent constraints provisional

**Verification claims (primary-source against IANA / W3C / WebKit / Chromium / Firefox / OSS source):**
- text/markdown clipboard support: confirmed dead
- text/x-markdown: extinct
- W3C mandatory MIMEs: text/plain + text/html + image/png (narrower than initially stated)
- BlockNote 3-MIME pattern + DOM-level mechanism: verified, mechanism prohibited under #19(b)
- Outline / Milkdown / Keystatic / BlockNote / Linear (partial) / VS Code / GitHub textarea / HackMD / AI chat copy-buttons (partial): markdown-on-text/plain emission verified or appropriately hedged
- 4 architectural patterns for markdown discrimination: signal-count (Outline/BlockNote/OK), try-parse-and-validate (Milkdown/Keystatic/BlockSuite/tiptap-markdown), MIME-only (@github/paste-markdown), no-detection (Lexical/Plate/ToastUI)
- OK's heuristic well-aligned with peer pattern; 3 signals to add for AI-chat coverage; JSX signals justified for OK-specific MDX-native authoring

**Framing (Step 3) closes here.** All P0-for-framing items resolved:
- SCR + 5-probe stress test ✓
- Persona discipline + journeys ✓
- Surface maps via worldmodel ✓
- Granular evidence files ✓
- Scope hypothesis confirmed ✓
- Decisions locked ✓

**Next step:** Step 4 — extract backlog from worldmodel + framing, prioritize P0 vs P2, present priority triage to user. Q1 (path-by-path matrix audit) becomes the first iterate-phase P0 investigation.

## 2026-04-30 — Step 4 close + Step 5 begin

**Session context:** Systematic backlog extraction via three probes (walk-through / tensions / negative space) surfaced 18 new candidate items. User confirmed proposed priorities (with default demotions for cross-machine cross-cases, configurability, and mechanical-finalize tasks).

**New items written to SPEC.md:**
- §11 Open Questions — Q9-Q26 added; Q5 demoted to P2
- §12 Assumptions — A5-A7 added (drag-and-drop preservation, toClipboardHast perf, telemetry extensibility)
- §14 Risks — R6-R8 added (editor-teardown crashes, heuristic false-positives, large-selection perf)

**Priority distribution:**
- P0: Q1, Q4, Q6, Q7, Q8, Q9-Q19, Q25, Q26 (16 items)
- P2: Q5, Q20-Q24 (6 items)

**Iterate-phase tracks (decision dependency ordering):**
- **Track A — Q1 path-by-path matrix audit.** Cross J1-J4 × dispatcher branches × node types. Feeds §6 FR acceptance + §13 In Scope. Other P0s consume its findings.
- **Track B — Q4+Q6+Q8+Q12+Q13+Q26 contract design.** toClipboardHast signature + per-descriptor implementations + fallback chain + error handling + telemetry contract + threat model. Gates §9 design.
- **Track C — Q9+Q10+Q11+Q14+Q15+Q16+Q17+Q18+Q19+Q25 finalization.** Drag-and-drop fidelity, cross-view symmetry, test strategy, edge-case verifications, documentation alignment. Runs after Track A + B converge.

**Next step:** Dispatch Track A + Track B in parallel as Task subagents. Track A writes empirical matrix; Track B writes contract design. Both feed iterate-phase synthesis.

## 2026-04-30 — Track A + Track B return; D10-D14 locked

**Track A output:** `evidence/q1-byte-preservation-matrix.md` — 36 cells across J1-J4 × dispatcher branches × node types. 5 BUG classes; 2 NEW findings beyond worldmodel (jsxInline/rawMdxFallback asymmetric naming, HtmlDetailsAccordion broken in pre- and post-D5/D8).

**Track B output:** `evidence/q4-q6-q8-toclipboardhast-contract.md` — full contract design with signature, 8-descriptor emission table, cascade, error handling, telemetry, threat model.

**Open Questions resolved this turn:**
- **Q1** — Path-by-path matrix complete. 5 BUG classes, all D5+D8 except Q27 HtmlDetailsAccordion. NG carve-outs concrete: NG1/NG3/NG9/NG10/NG11.
- **Q4** — Contract signature LOCKED as D10.
- **Q6** — Compat semantics resolved per descriptor table. GFMCallout + CommonMarkImage round-trip OK; HtmlDetailsAccordion split as Q27.
- **Q7** — NO RISK. FR-13-first does not regress Linear/Outline/BlockNote interop.
- **Q8** — Three-layer cascade LOCKED as D11.
- **Q12** — Error semantics LOCKED (symmetric with FR-11) as part of D10.
- **Q13** — Telemetry contract LOCKED as D12.
- **Q14** — Pre-PR-310 capitalized `<Image>` survives via wildcard descriptor + D5.
- **Q15** — Split into Q28 (cross-view symmetry trace UNVERIFIED).
- **Q16** — Source dispatcher reorder REQUIRED per D2/G4 symmetric coverage. LOCKED as D13.
- **Q26** — No new XSS surfaces; six attack scenarios audited; all mitigated.

**New Open Questions surfaced this turn:**
- **Q27** — HtmlDetailsAccordion `<details>` inbound round-trip broken in pre- AND post-D5/D8. ~30 LoC fix (extend `LOWERCASE_JSX_CANONICAL_TAGS` + transformer). Mirrors `cb-v2-iframe-embed-pattern` structural fix.
- **Q28** — `<u>foo</u>` cross-view symmetry runtime trace.

**New Decisions LOCKED:**
- **D10** — toClipboardHast signature.
- **D11** — Three-layer cascade.
- **D12** — Telemetry contract.
- **D13** — Source dispatcher symmetric reorder per D5.
- **D14** — NG carve-out enumeration concrete (NG1/NG3/NG9/NG10/NG11 surface on clipboard path).

**Pending user judgment (3 design decisions):**
- **O1** — Callout cross-app HTML class taxonomy (OK `callout` vs GFM `markdown-alert`)
- **O3** — HtmlDetailsAccordion fix (in-spec ~30 LoC vs new NG carve-out vs split spec) — recommend in-spec per greenfield directive
- **jsxInline/rawMdxFallback asymmetry** — fix outbound/inbound naming or leave (recommend leave; not load-bearing under FR-13-first)

**Next step:** User input on O1 / O3 / asymmetry; then iterate-phase Track C (Q9 drag-and-drop, Q10 cross-view symmetry, Q11 test strategy, Q17 NG-S6 acceptance test, Q18-Q19 corrigendum mechanics, Q25 a11y, Q27 HtmlDetailsAccordion, Q28 `<u>` runtime trace).

## 2026-04-30 — D15 + D16 + D17 locked; Track C dispatching

**Session context:** User confirmed the dispatch architecture for the Callout split (one site lookup by `node.name`; compat re-promotion via `callout-transformer.ts` makes dispatch uniform). Locked Decision 1 → A (split taxonomy). Locked Decision 2 → A (Q27 fix in-spec). Defaulted Decision 3 → A (asymmetry leave) since not addressed.

**Decisions LOCKED:**
- **D15** Callout cross-app HTML taxonomy split: canonical OK `callout` taxonomy, compat GFM `markdown-alert` taxonomy. Two `toClipboardHast` impls; one dispatch site.
- **D16** Q27 HtmlDetailsAccordion fix in-spec. Extend `LOWERCASE_JSX_CANONICAL_TAGS` + add `details-transformer.ts`. ~30 LoC mirroring `callout-transformer.ts` pattern.
- **D17** jsxInline / rawMdxFallback asymmetry — LEAVE. Non-load-bearing under D5+D8.

**Q27 status:** Decision LOCKED (D16); implementation design open — dispatching Track C-Design subagent.

**Next step:** Track C dispatching in parallel:
- **Track C-Design** — Q27 implementation design (`details-transformer.ts` shape, tag set extension specifics, R23 PUA-guard interaction, test plan)
- **Track C-Verify** — Q9 (drag-and-drop fidelity) + Q10 (cross-view symmetry under toClipboardHast) + Q28 (`<u>foo</u>` cross-view runtime trace)

After Track C lands: Q11 (test strategy synthesis), then Q17/Q18/Q19/Q25 finalization items.

## 2026-04-30 — Greenfield directive reset; D16 reframe; D17 reversal

**Session context:** User issued a directional reset on greenfield posture: "(1) best architecture/correctness based on evidence-based decisions — what two staff engineers would decide; (2) clean codebase with maintainable code that sets or fixes the right precedents; (3) best product experience without over-engineering." Don't lean on "defer to future"/"scope"/"pragmatism" as crutches.

**Memory updated:** `feedback_no_deferred_debt_greenfield.md` rewritten with the three-axis decision framework + watch-outs.

**Track C-Design returned with critical finding:**
- `details-accordion-promoter.ts` (~325 LoC) ALREADY EXISTS at `packages/core/src/markdown/`, wired in `pipeline.ts:170`.
- `LOWERCASE_JSX_CANONICAL_TAGS` extension is a NO-OP for paired `<details>...</details>` (carve-out only triggers on self-closing).
- Real bug: `mdManager.parseToMdast('<details>...')` silently skips the transformer in production but works in isolated unified() chain. I19 invariant has 11 failing tests.
- Suspected root cause: frozen-processor mutation discrepancy in `createParseProcessor` (possible precedent #15(d) idempotent-attacher violation or processor-caching issue).
- D16 reframed: not "build new transformer" but "investigate and fix root cause of production parse path skipping the existing transformer."

**D17 reversal under the directive:**
- Original D17: "LEAVE asymmetry — non-load-bearing under D5+D8."
- Reversed D17: UNIFY. Outbound emits BOTH `class="..."` AND `data-...=""` on jsxInline + rawMdxFallback. ~10 LoC.
- Reasoning: asymmetry has no positive justification; cross-app destinations don't have CSS for either class. Setting clean precedent now costs less than fixing 5 future descriptors. Symmetric outbound is strictly more byte-preserving.

**Audit of other §3 NG-S* and §15 deferrals against the directive:** all 14 remaining deferrals retained — each has evidence-based justification (verified architectural decisions like NG-S1-NG-S4; third-party-quality issues like NG-S6; legitimately separate spec scopes like NG-S7; no-evidence-of-need items like NG-S5/NG-S8/NG-S9/NG-S10).

**Q28 promotion:** `<u>foo</u>` cross-view symmetry runtime trace promoted from ○ tracked-thread to active P0 in Track C-Verify. Was deferred-as-tracked-thread; under directive, all P0 verifications run before ship.

**Next step:** Dispatch Track C-Verify (Q9 + Q10 + Q28) + Q27 root-cause investigation in parallel.

## 2026-04-30 — Track C-Verify + Q27 root-cause both return; Q27 RESOLVED with 0 LoC; D18 added; Q29 + Q30 surfaced

**Track C-Verify findings:**
- Q9 drag-and-drop: ✓ all three scenarios preserved.
- Q10 cross-view symmetry under toClipboardHast: ✓ holds.
- Q28 `<u>foo</u>` cross-view round-trip: ✗ breaks WYSIWYG-inbound. Fix: ~8 LoC — extend D8 with raw-HTML-inline signal `/<[a-z]+>[^<\n]*<\/[a-z]+>/`. Locked as **D18**.
- Surfaced: Underline mark is silently broken across markdown pipeline (no `markHandlers.underline`). Out of clipboard scope — markdown-pipeline-layer issue. Tracked as **Q30** for separate-spec follow-up.

**Q27 root cause: STALE BUILD.** `packages/core/dist/index.mjs` was 2 days behind source. Production consumers + `bun test` from root resolve to dist; per-package scripts use `--conditions=development` to source. Four transformers (remarkGithubAlerts, calloutTransformerPlugin, detailsAccordionPromoterPlugin, imagePromoterPlugin) silently dropped in production for 2 days. Fix: 0 LoC code change — `bun run build`. Verified post-rebuild: I19 went from 8/19 to 19/19. **D16 reframed to RESOLVED.**

**Cross-cutting concern surfaced:** CI build hygiene gap. The `--conditions=development` flag for per-package tests bypasses dist; turbo's `^build` dependency for `bun run check` may not always trigger on cache-replay. Q27 was the canonical example; other in-flight transformer work has the same exposure. Tracked as **Q29** — needs investigation + design.

**New decisions LOCKED:**
- **D18** Q28 raw-HTML-inline heuristic signal extension (~8 LoC).

**New Open Questions:**
- **Q29** CI build hygiene gap (stale-dist class of bug). P0; needs cross-cutting investigation; potentially precedent-#17 territory.
- **Q30** Underline mark silently broken (markdown pipeline mark coverage audit). P2; separate spec.

**Next step:** Q11 test strategy synthesis (informed by Q1+Q4+Q9+Q10+Q28); Q17 NG-S6 acceptance test; Q18-Q19 corrigendum mechanics; Q25 a11y; Q29 CI build hygiene investigation. Then audit (Step 6).

## 2026-04-30 — Q29 + Q30 deferred; §6 FRs drafted

**Session context:** User confirmed Q29 (CI build hygiene) and Q30 (Underline mark / markdown-pipeline mark coverage audit) both defer to Future Work / Identified — both legitimately separate scopes requiring different domain expertise.

**Spec updates:**
- §11 Q29, Q30 marked Deferred (P2)
- §15 Future Work / Identified — added Q29 (CI build hygiene) and Q30 (markdown-pipeline mark coverage) with concrete next-investigation guidance
- §6 Functional Requirements — full draft of FR-1 through FR-12 derived from D1-D18 + resolved OQs:
  - FR-1: WYSIWYG dispatcher reorder per D5
  - FR-2: Source dispatcher symmetric reorder per D13
  - FR-3: is-markdown.ts heuristic extension per D8 (5 new signals)
  - FR-4: is-markdown.ts raw-HTML-inline signal per D18 (1 additional)
  - FR-5: toClipboardHast contract on JsxComponentMetaBase per D10
  - FR-6: Three-layer fallback cascade per D11
  - FR-7: Per-descriptor toClipboardHast implementations per D15
  - FR-8: Telemetry contract per D12
  - FR-9: jsxInline + rawMdxFallback outbound shape symmetry per D17
  - FR-10: NG carve-out enumeration per D14
  - FR-11: D16 production parse path verification (post-rebuild)
  - FR-12: Predecessor-spec corrigendum per D9
- §6 Non-functional requirements drafted
- Total implementation surface estimated: ~250-300 LoC across 7 files

**P0 Open Questions remaining:**
- Q11 test strategy synthesis — covered implicitly by FR acceptance criteria; may need explicit consolidation
- Q17 NG-S6 acceptance test — design needed
- Q18 branch label nomenclature — mechanical at finalize
- Q19 predecessor corrigendum mechanics — mechanical at finalize (FR-12)
- Q25 a11y verification — fold into FR-7 acceptance criteria

**Next step:** Final pass on §11 to close Q11/Q17/Q18/Q19/Q25 (most are covered by FR acceptance / mechanical-at-finalize); then Step 6 (Audit) — spawn parallel /audit + design challenger subprocesses.

## 2026-04-30 — Audit + assess-findings + corrections applied

**Audit Step 6 — auditor returned 11 findings** (3 HIGH / 4 MEDIUM / 4 LOW). Saved to `meta/audit-findings.md`. No decision-implicating factual errors; all corrections to coherence/factual/completeness gaps.

**Assess-findings Step 7 — applied protocol to all 11 findings.** All classified as Valid bug or Valid improvement (HIGH confidence, no Decline). Per greenfield directive (no deferred tech debt), all applied:

| Finding | Severity | Classification | Action |
|---|---|---|---|
| F1 NG numbering (canonical vs predecessor) | HIGH | Valid bug | Realigned FR-10 + D14 + Q1 matrix to canonical NG1-NG11 (CLAUDE.md). Qualified §3 NG-S8/S9/S10 as predecessor 2026-04-16 SPEC NG references. |
| F2 Q27 stale entry | HIGH | Valid bug | §11 Q27 entry rewritten to reflect D16 reframe (stale-build / 0 LoC). |
| F3 Q1/Q4/Q6/Q7/Q8 status mismatch | HIGH | Valid bug | Status columns updated from "Open" to RESOLVED with one-line resolution per row. |
| F4 duplicate NFR | MEDIUM | Valid bug | Deleted second `### Non-functional requirements` subsection at lines 137-143; kept the more accurate first version (~250-300 LoC). |
| F5 duplicate Q25 | MEDIUM | Valid bug | Deleted duplicate Open Q25 row; kept the resolved version. |
| F6 evidence file count | MEDIUM | Valid improvement | Updated §1 Links from "7 granular files" to "12 files: 2 meta + 10 substantive" with full enumeration. |
| F7 FR-1 implicit FR-3 dep | MEDIUM | Valid improvement | Added explicit "Depends on FR-3" cross-reference to FR-1 acceptance criteria + "FR-1 + FR-3 + FR-4 ship as an indivisible bundle." |
| F8 cross-spec FR-3 collision | LOW | Valid improvement | Predecessor cross-spec FR/NG references qualified throughout (`predecessor 2026-04-16-clipboard-mdast-canonical/SPEC.md` prefix). |
| F9 3 vs 4 transformers | LOW | Valid improvement | FR-11 wording updated to "all four post-Apr-27 transformer registrations." |
| F10 Image extension parseDOM precision | LOW | Valid improvement | §1 line 26 updated to `'img[src]:not([src^="data:"])'` matching §8. |
| F11 Linear UNCERTAIN qualifier | LOW | Valid improvement | D5 + Q7 hedged: "Cmd+Opt+C verified; default Cmd+C UNCERTAIN — but irrelevant: Branch C falls through correctly either way." |

**Cross-cutting answer surfaced during corrections:** user asked whether the work addresses CM6 (Source view) copy-paste fidelity for `<img>`→`![]()` regression class. Confirmed: D5 + D8 + D13 fixes ALL FOUR cross-view directions (Source→Source, Source→WYSIWYG, WYSIWYG→Source, WYSIWYG→WYSIWYG). Same root cause across all four (Branch D's htmlToMdast routing `<img>` HTML through standard image handler). Same architectural fix (FR-13-first prefers text/plain canonical bytes before HTML cleanup). Documented in conversation; FR-2 acceptance criteria already capture it.

**Audit complete (Step 6+7 done). Step 8 (Verify and finalize) next.** Plus design challenger subprocess (was queued but not yet dispatched — should run in parallel with finalize per workflow).

## 2026-04-30 — Design challenger returned; F1 fizzles on examination

**Design challenger** returned 8 findings (3 H / 3 M / 2 L). Saved to `meta/design-challenge.md`. Two rejections from the spec held cleanly under independent scrutiny: NG-S1 (sync-event MIME — PM source confirms no extension point) and D6 (PM-hooks-only mechanism boundary).

**Six findings surfaced as reopen-candidates or improvements; user assessment in progress:**
- **F1 [H] FR-13-first cross-PM-editor risk** — FIZZLES on examination. Branch C's `/data-pm-slice/i/` trigger is auto-attached only by PM's `serializeForClipboard`; non-PM editors (Affine/BlockSuite, Lexical) don't reach Branch C — they hit Branch D's `htmlToMdast` cleanup which is unchanged by D5. PM editors with canonical-markdown text/plain (Linear/Outline/BlockNote/Milkdown — verified) have text/plain ≡ text/html equivalence for OK-schema-mappable content. PM editors with degraded text/plain don't trigger `isMarkdown` so FR-13 doesn't fire and Branch C runs as today. Risk surface essentially nil. **D5 stands cleanly; no rollback-path doc needed.**
- **F2/F6 [H+M] D15 canonical/compat HTML taxonomy split** — pending user judgment.
- **F3 [H] Q29 deferral vs greenfield directive** — pending user judgment.
- **F4 [M] Cross-app destination test gap** — pending user judgment.
- **F5 [M] Cascade opt-out primitive** — pending user judgment.
- **F7 [L] Try-parse rejection rationale** — polish at finalize.
- **F8 [L] Required toClipboardHast on canonical descriptors** — pending user judgment.

**Next step:** User decides on F2/F3/F4/F5/F8. Then Step 8 (verify and finalize).

## 2026-04-30 — Walker pivot + greenfield-directive cascade

**Session context:** User's questions about email-client behavior + type expansion + generalizing across all rendered elements drove a substantial architectural pivot away from per-descriptor `toClipboardHast` contracts to a **live-DOM walker as the default cross-app text/html outbound mechanism**. Two /research dispatches verified prior art (mature library territory: html-to-image, dom-to-image, html2canvas, computed-style-to-inline-style, juice/client, multiple Chrome extensions) and adversarial gotchas (no showstoppers; chevron-as-real-DOM refactor required as pre-flight).

**Decisions LOCKED this session:**
- **D19 (NEW)** — Live-DOM walker as cross-app text/html outbound mechanism. `clipboardSerializer.serializeFragment` walks live DOM via `view.nodeDOM(pos)`, clones, copies allowlisted computed styles inline. Generic across all descriptors. Single source of truth = React render + resolved CSS.
- **D20 (NEW)** — Q29 build hygiene: drop `--conditions=development` from per-package test scripts. Reversed from Future Work deferral under design challenge F3 + greenfield directive. Tests + production converge on dist artifact. Closes the stale-dist class structurally.
- **D10 (REVISED)** — `toClipboardHast` becomes OPTIONAL override (was: required on canonical). Walker is default; descriptor only overrides for hidden state (Tabs-like, Canvas-like). v1 5-pack: zero overrides needed.
- **D11 (REVISED)** — Two-layer cascade (was: three). Layer 1 = optional descriptor override. Layer 2 = walker default. No middle `tryNativeHtmlPrimitive` layer.
- **D15 (SUPERSEDED)** — Canonical/compat HTML taxonomy split rendered moot by walker. Both descriptors render through same React component via `rendersAs` + identity translateProps; live DOM is identical; walker emits identical shape. F2/F6 design challenge resolves.
- **D8 (REFINED)** — Try-parse-and-validate alternative measured at ~1380x slower than signal-count (`evidence/f7-isMarkdown-perf-microbench.md`); both fit within budget. Signal-count chosen for constant-factor / JIT-stability discipline. Rejection rationale rewritten with measured numbers.

**FR additions/revisions:**
- FR-5/FR-6/FR-7 (REVISED) — walker-default architecture instead of per-descriptor toClipboardHast
- FR-13 (NEW) — chevron-as-real-DOM refactor: replace `::before` triangles in Callout collapsible / Accordion / HtmlDetailsAccordion with `<ChevronRight>` lucide icons + CSS rotation on `[open]`. Pre-flight for walker.
- FR-14 (NEW) — walker allowlist (CSS properties) + blocklist (classes/attributes) filter. Strips editor-only chrome (jsx-component-wrapper `::before`/`::after`, `data-selected`, etc.).
- FR-15 (NEW) — Q29 build hygiene fix per D20 (drop `--conditions=development`).
- FR-16 (NEW) — sanitizer-proxy hermetic test for boundary-12 cross-app rendering per F4. ~40 snapshot tests across 5 destination profiles × 8 descriptors.
- FR-12 (EXTENDED) — corrigendum mechanic now also covers `2026-04-23-cb-v2-md-foundation/SPEC.md` D-MF13 (Callout `collapsible`/`defaultOpen` props ARE shipped per code).

**New OQ:**
- Q31 (NEW) — `Callout.tsx:64-151` ships `collapsible` + `defaultOpen` props despite cb-v2 D-MF13 LOCKED "no foldable props". Surfaced and corrigendum scope extended via FR-12.

**Q29 status flip:** P2 deferred → P0 Resolved (D20 + FR-15). Removed from §15 Future Work / Identified.

**Design challenge findings status:**
- F1 (cross-PM-editor risk) — FIZZLED on examination
- F2/F6 (D15 taxonomy split) — RESOLVED (superseded by D19 walker; identity collapses through `rendersAs`)
- F3 (Q29 deferral) — APPLIED (D20)
- F4 (sanitizer-proxy test gap) — APPLIED (FR-16)
- F5 (cascade opt-out primitive) — FOLDED INTO walker (descriptor sets `data-clipboard-omit="true"` on React render root; walker filters)
- F7 (D8 rationale) — APPLIED (rewritten with verified numbers)
- F8 (required toClipboardHast on canonical) — REFRAMED (walker is default; toClipboardHast is optional override; no required-on-canonical needed because walker covers everything by default)

**Pre-flight requirement surfaced:** chevron refactor (FR-13) must land before walker (FR-5) because pseudo-element `::before` chevrons in Callout collapsible / Accordion / HtmlDetailsAccordion are silently lost under naive `cloneNode`. ~50 LoC refactor; bounded scope; good hygiene independent of clipboard concerns.

**Next step:** Step 8 (verify and finalize) — run mechanical adversarial checks, derive Agent Constraints (§16), run quality bar, persist final state. Update baseline commit.

## 2026-04-30 — Step 8 finalize complete

**Mechanical adversarial checks:**
- ASSUMED decisions: NONE (D1-D20 all LOCKED, RESOLVED, or SUPERSEDED).
- 1-way-door confidence: D6, D10 revised, D19 walker — all HIGH-confidence with primary-source evidence.
- Non-goal temporal tags: 13 NG-S items reviewed; all justified appropriately.
- Pre-mortem: most fragile assumption is FR-13 chevron refactor as walker pre-flight. Mitigation bounded (~50 LoC, lucide-react existing dep, well-understood pattern). Pattern Y fallback as backstop. Risk LOW.

**Resolution completeness gate:** all 7 criteria met (decisions made, 3P deps named, architectural viability, integration feasibility, verifiable AC, no Out-of-Scope dependencies, collective end-to-end outcome).

**Agent Constraints (§16) finalized:**
- SCOPE: 9-10 files across `packages/app/src/editor/clipboard/`, `packages/app/src/editor/components/`, `packages/core/src/registry/types.ts`, `packages/{app,core,server,cli}/package.json`, plus tests + corrigenda
- EXCLUDE: PM schema, bridge/observer/CRDT, persistence/agent-write, disk-side markdown round-trip, existing rehype plugins, per-descriptor toClipboardHast (walker default makes them unnecessary)
- STOP_IF: 7 conditions including precedent #19(b) violations, schema changes, walker filter failures, drop-conditions-development surfacing non-clipboard regressions
- ASK_FIRST: 8 categories including new MIMEs, dispatcher reorder beyond FR-13, NG carve-out modifications, required-on-canonical reversal, walker filter extension, Callout prop removal

**Status:** Approved. Spec ready for `/ship`.

**Baseline commit:** 8587b6e5 (verified at finalize 2026-04-30; codebase state matches spec assumptions; FR-11 dist-rebuild verification + FR-15 build-hygiene fix should run as first implementation tracer to validate the baseline assumptions).

**Implementation surface estimate (final):** ~250-350 LoC across 9-10 files. No new runtime dependencies. No CRDT schema changes. No bridge invariant changes. Tracer-bullet sequence in `evidence/test-strategy.md` (14 cycles).

**Recommended /ship sequence:**
1. **Pre-flight:** `bun run build` in `packages/core` (FR-11) + drop `--conditions=development` (FR-15). Verify I19 19/19; verify full test suite passes against rebuilt dist.
2. **Tracer 1-3:** is-markdown.ts heuristic extension + dispatcher reorder (FR-1, FR-2, FR-3, FR-4).
3. **Tracer 4:** chevron-as-real-DOM refactor (FR-13) — lucide ChevronRight + CSS rotation. Visual regression snapshot tests.
4. **Tracer 5-7:** clipboard-walker.ts + allowlist/blocklist + Pattern Y fallback (FR-5, FR-6, FR-14).
5. **Tracer 8-9:** TS type extension (FR-7 optional override; D10 revised) + telemetry contract (FR-8).
6. **Tracer 10-12:** PBT invariants (I19, I20, I21).
7. **Tracer 13:** Sanitizer-proxy boundary-12 tests (FR-16).
8. **Tracer 14:** Playwright E2E suite (10-test budget per evidence/test-strategy.md).
9. **Finalize:** Predecessor corrigenda (FR-12) on `2026-04-16-clipboard-mdast-canonical/SPEC.md` + `2026-04-23-cb-v2-md-foundation/SPEC.md`.

Step 8 complete.
