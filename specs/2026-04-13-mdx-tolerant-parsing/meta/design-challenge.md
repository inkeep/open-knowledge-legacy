# Design Challenge Findings

**Artifact:** specs/2026-04-13-mdx-tolerant-parsing/SPEC.md
**Challenge date:** 2026-04-13
**Total findings:** 8 (3 high, 3 medium, 2 low)

Method: read SPEC end-to-end; opened evidence directory (empty); read the two cited reports that exist in-tree (`reports/tinacms-production-architecture-beyond-mdx/REPORT.md`, `reports/mdx-crdt-roundtrip-fidelity/REPORT.md`); spot-checked `packages/core/src/markdown/{pipeline.ts,index.ts}` and `packages/core/src/extensions/jsx-component.ts` to validate claimed current state.

---

## High Severity

### [H] Finding 1: D5 "one editor for both" conflates UI surface with parser configuration — the spec's own prior art supports an extension-gated split

**Category:** DESIGN
**Source:** DC1 / DC3
**Location:** §10 Decision Log (D5, "Locked"); §3 NG1; §15 Future Work ("Strict MDX opt-in for `.mdx` files").
**Issue:** D5 rejects splitting parser behavior by `.md` vs `.mdx` extension with the rationale "Product direction is 'one editor for both' (PROJECT.md:70). Extension gating conflicts with 'bring your own files' and component support in `.md` files." This conflates two orthogonal concerns:
  - **UI surface** — "one editor" means the same TipTap view, keybindings, sidebar, CRDT sync (not in dispute).
  - **Parser configuration** — which micromark extensions and mdast handlers run before that view gets populated.
  
  A single editor UI can still dispatch to different parser configurations based on file extension, content signal, or workspace config. Conflating them forecloses an option the spec's own cited prior art endorses.
**Current design:** "D5 Don't split by `.md` vs `.mdx` extension ... **Locked** ... Extension gating conflicts with 'bring your own files' and component support in `.md` files."
**Alternative:** Two parser profiles sharing one editor:
  - `.md` default profile: agnostic MDX mode + R23 guard (tolerant; JSX tags still recognized so `<Callout>` works in `.md` for users who want it).
  - `.mdx` default profile: strict MDX mode with acorn validation available for authors who do want expression validation.
  - Workspace config overrides both defaults; extension is only the *default*, not a hard gate — satisfies "component support in `.md` files."
  
  This is the two-tier strategy tinacms-production-architecture-beyond-mdx/REPORT.md:52, 367, 371, 373, 379 explicitly documents after 7 years of production shipping: *"OK could adopt a similar two-tier strategy if supporting both strict MDX and plain markdown content — forgiving parse for `.md`, strict for `.mdx`"* (line 379). TinaCMS's dispatch is per-collection via `field.parser.type`; the product ships one UI.
**Trade-off:** Gained — authors who want strict validation on `.mdx` keep it without forcing every `.md` user to carry MDX parser risk; rollback story is simpler (downgrade only affects `.md`). Lost — two code paths to maintain; config surface grows by one knob.
**Status:** CHALLENGED
**Suggested resolution:** Re-open D5. Distinguish "one editor UI" (keep) from "one parser mode" (question). Capture in evidence/ whether agnostic-mode's cost on `.mdx` users (lost acorn validation per D1) was weighed against the cost on `.md` users (carrying MDX guard complexity for pure-markdown docs). §15's "Strict MDX opt-in for `.mdx` files" Future Work item already admits this path is viable — then D5's "Locked" status is premature.

---

### [H] Finding 2: The "~95% coverage" claim for Layers 1+2 is unsourced, and R6 (block-level fallback) is downgraded to Future Work on its basis

**Category:** DESIGN
**Source:** DC3 / DC1
**Location:** §9 Proposed Solution ("covers the smallest remaining surface — and becomes much simpler because Layers 1-2 have already eliminated ~95% of failures"); §10 D4 ("No production system has implemented it. With Layers 1-2 covering ~95%..."); §12 A3 ("Agnostic mode + guard covers ~95% of crash cases" — MEDIUM); §7 M2 ("Zero `parseSafe` raw-text fallbacks on the project's own markdown files").
**Issue:** The 95% figure is load-bearing — it's the reason R6 gets demoted from "Must" to "Should" and then into Future Work, which means the fallback UX for the remaining cases is the whole-document raw-text paragraph (structural collapse). But 95% has no citation: there's no evidence file, no corpus benchmark, no fuzz/probe run number. The only stated verification is M2, which tests 3 project markdown files (PROJECT.md, AGENTS.md, ARCHITECTURE.md) — a sample, not a denominator. Evidence directory is empty.
**Current design:** "D4 Block-level fallback is 'Should', not 'Must' ... With Layers 1-2 covering ~95%, the remaining ~5% can use whole-doc raw-text fallback as a temporary measure."
**Alternative:** One of:
  - Quantify the claim before demoting R6. Define a corpus (fumadocs test fixtures + agents-docs real MDX + a synthetic adversarial set), run agnostic-mode+guard on it, report pass/fall-through rates as evidence. Then D4 is either justified or R6 is re-elevated.
  - Keep R6 as Must if quantification isn't feasible this sprint. Whole-document raw-text fallback is a user-visible regression (structural collapse); promoting it from "last resort" to "the expected behavior for 5% of docs" is a UX decision that deserves explicit framing, not a coverage-math side effect.
**Trade-off:** Gained — the spec's claim survives audit; demotion decisions rest on data not intuition. Lost — one probe's worth of work.
**Status:** CHALLENGED
**Suggested resolution:** Run a probe against real MDX corpora (fumadocs examples, agents-docs content, known-crash inputs from git history) and write an evidence file with the pass-rate under agnostic+guard. If the number is materially <95%, re-elevate R6 or make block-level fallback a Must. If ≥95%, the claim becomes citeable and D4 survives.

---

### [H] Finding 3: No rollback/feature-flag strategy for a MEDIUM-confidence global parser swap

**Category:** DESIGN
**Source:** DC2 (SRE lens)
**Location:** §12 A2 ("`micromark-extension-mdx` is stable enough for production ... MEDIUM ... Published official package, but low adoption"); §13 Deployment / phasing ("Single PR. Three commits"); §14 Risks (no rollback entry).
**Issue:** The spec replaces `remark-mdx` (heavily used, battle-tested transitive of the MDX toolchain) with `micromark-extension-mdx` + `mdxFromMarkdown/mdxToMarkdown` — a less-adopted sibling the spec itself rates MEDIUM confidence. This swap is global: every parse path (server persistence, agent-sessions, parseSafe, observers, test harness) flips in one PR. If a regression surfaces post-merge (round-trip corner case, performance cliff, interaction with the patched `@handlewithcare/remark-prosemirror`), rollback is "revert the PR" — which also reverts jsxInline and the parseSafe simplification. There is no feature flag (e.g., `agnostic: boolean` plugin option), no percentage rollout (not applicable to a CLI product but notable for the dev server path), and no runtime kill switch.
**Current design:** "Single PR. Three commits: 1. Agnostic MDX mode + pipeline swap + parseSafe simplification ..." — atomic coupling of parser swap, schema change (jsxInline), and cleanup in one merge unit.
**Alternative:** Separate the landing so the parser swap is reversible independently:
  - Commit A: introduce `remarkMdxAgnostic` plugin next to `remarkMdx`, add a `pipeline.ts` config flag (env var or plugin option) defaulting to strict. Land untouched.
  - Commit B: jsxInline node type + handler change (independent of mode).
  - Commit C: flip default to agnostic in a follow-up after the I9/I11 PBT run and round-trip suite on a branch.
  - Commit D: remove parseSafe brace-retry once C has soaked.
  
  This also mitigates Finding 1 — the flag becomes the per-file dispatch mechanism if the spec ever accepts the dual-parser model.
**Trade-off:** Gained — independent revertability, staged validation, flag becomes a hook for future dual-parser dispatch. Lost — a larger merge sequence, a transient "unused plugin" state.
**Status:** CHALLENGED
**Suggested resolution:** Add a Rollback row to §14 Risks. Either commit to the 3-commit atomic strategy with an explicit "revert the whole PR" rollback (and accept the coupling cost), or split as above. Not having a rollback story for a MEDIUM-confidence dependency swap is the gap.

---

## Medium Severity

### [M] Finding 4: D3 — shipping `jsxInline` as `atom: true` now creates a latent schema migration for T1 Layer 3, not an additive one

**Category:** DESIGN
**Source:** DC1
**Location:** §10 D3 ("Build jsxInline as part of this spec ... ~30 lines and unblocks the correct rendering path"); §12 A4 ("`jsxInline` has no schema migration impact — HIGH confidence — New node type (additive). Existing `jsxComponent` nodes unaffected"); §16 "jsxInline as upgrade path" ("Our spec creates jsxInline as `atom: true` (Layer 1). T1's Layer 3 will change it to `atom: false` with `content: 'inline*'`. This is an additive schema evolution — no migration needed since no existing Y.Docs have jsxInline nodes yet.").
**Issue:** The "no existing Y.Docs have jsxInline nodes yet" claim is only true at the instant this spec ships. Once this spec merges, every user who opens a doc with inline MDX (`<Icon />` in prose — the exact scenario G4 is built for) will accumulate `jsxInline` atoms in their Y.Doc. By the time T1 Layer 3 lands and wants to flip `atom: true → atom: false, content: 'inline*'`, those accumulated atoms are real data that must be migrated. ProseMirror's schema.nodeFromJSON() will reject docs that don't match the new shape. y-prosemirror does not auto-migrate atom → non-atom transitions.
**Current design:** Ship jsxInline as atom now; T1 Layer 3 changes shape later, called "additive evolution."
**Alternative:**
  - Land jsxInline with the eventual T1 Layer 3 shape from the start: `atom: false, content: 'inline*'`, children populated from `mdxJsxTextElement.children` (which remark-mdx already provides as parsed mdast). The parser path is the same regardless of atom-ness, and the rendering path is a one-time cost paid here instead of a migration cost paid at T1.
  - Or: land jsxInline as atom but document the migration strategy explicitly (walk y-prosemirror fragment, rewrite atom jsxInline → inline-content jsxInline with parsed children) and add it to §15 Future Work with maturity tier "Identified."
  - Or: defer jsxInline to T1 entirely. G4 (inline MDX doesn't block-break) is then addressed by either keeping jsxComponent block-only and leaving inline `<Icon />` as a block break in the interim, or by a temporary mark that doesn't survive into Layer 3.
**Trade-off:** Gained — avoids a post-ship migration on real user data; removes the claim-state of "no existing Y.Docs" that is only momentarily true. Lost — more complex Layer 1 work now (populate children); possible scope creep toward T1.
**Status:** CHALLENGED
**Suggested resolution:** Validate whether y-prosemirror tolerates an atom → non-atom schema evolution on docs that already contain the node. If yes, A4's HIGH confidence holds. If no, either move jsxInline's shape toward its T1 destination now, or downgrade A4 to MEDIUM and add a concrete migration plan to §15 with an "Identified" maturity tier.

---

### [M] Finding 5: D7 — `componentName` alongside `content` creates two sources of truth for component identity without a reconciliation rule

**Category:** DESIGN
**Source:** DC1
**Location:** §10 D7 ("Makes jsxComponent self-describing. ~5 lines ... Read-only metadata — serialization still uses raw `content`"); §9 R9 ("`componentName` is read-only metadata"); §16 ("T1's re-spec would read props from mdast `attributes` (for the prop panel) but STILL serialize via `sourceRaw` → `html` → verbatim. The structured data is read-only; the raw source is the serialization authority.").
**Issue:** The spec says `content` (raw source) is the serialization authority and `componentName` is read-only metadata. Good. But the spec does not specify what refreshes `componentName` when `content` changes. Scenarios:
  - User edits `<Callout>...` to `<Note>...` via source mode. `content` updates via CRDT. Does the observer re-parse and update `componentName`? Handler path isn't specified.
  - User (later, under T1) uses a prop panel to edit the component. T1 writes structured attrs. If the prop panel writes `componentName` directly but the raw-source serializer reconstructs from `content`, the two can diverge silently.
  - A typo in `content` (`<Caout>`) paired with a stale `componentName: "Callout"` — which wins for UI label?
  
  "Read-only metadata" doesn't define a refresh policy. Without one, `componentName` becomes stale and the UI shows wrong labels over time.
**Current design:** "~5 lines (1 attr + 1 handler line) ... Read-only metadata — serialization still uses raw `content`."
**Alternative:**
  - Define the reconciliation rule explicitly: `componentName` is recomputed from `content` on every observer B parse pass (source → fragment), ensuring `content` is the single source of truth. Cost: slightly more than 5 lines — also needs a parse-on-every-sync path.
  - Or defer D7 to T1. T1 is the spec where component identity becomes a first-class attribute (prop panels, registry lookup, typed attrs). Adding it in Layer 1 as "read-only metadata" creates a facility with no load-bearing caller in this spec — G1-G5 are achieved without it. Scope pull-forward, not scope simplification.
**Trade-off:** Gained — avoids a silent divergence class; keeps Layer 1 minimal. Lost — T1 has to introduce the attr itself (trivial).
**Status:** CHALLENGED
**Suggested resolution:** Either specify the refresh rule (observer B recomputes on every parse) and add a test for staleness, or defer D7 to T1 where it has a caller. The "enables future registry lookup" argument is weak because T1 already re-parses raw source for other reasons (prop extraction).

---

### [M] Finding 6: D6 — parseSafe brace-retry is called dead code without the test that demonstrates it

**Category:** DESIGN
**Source:** DC1 / DC3
**Location:** §10 D6 ("Agnostic mode makes balanced braces always succeed. The `GUARD_OPEN_BRACE` retry in parseSafe is vestigial. Simplify to two tiers: parse → raw text."); §9 R4 ("With agnostic mode, the 'retry with `{` protected' tier in `parseSafe()` becomes dead code").
**Issue:** The claim "balanced braces always succeed under agnostic mode" and the claim "therefore the brace-retry is dead" are not the same claim. The brace-retry exists for any `{`-triggered crash — balanced AND unbalanced. Unbalanced `{` in prose (e.g., `"a { start"` without a matching `}`) is handled today by the R23 guard's brace-stack logic (§8 "brace-stack matching with paragraph/blockquote awareness"), which pre-protects unmatched `{` via PUA sentinel. So the chain is: R23 handles unmatched → agnostic mode handles matched → parseSafe retry is redundant. The spec says this in prose but doesn't cite the case analysis. Q1 (PUA interaction with agnostic expression parser) is open at P0 and gates exactly this claim.
**Current design:** D6 proposed as safe based on an un-demonstrated "dead code" property.
**Alternative:**
  - Land R4 only after Q1 resolves. The brace-retry is ~5 lines — its continued existence is a cheap safety net and removing it before evidence is premature optimization.
  - Alternatively, keep the brace-retry tier but convert it to a counter-incrementing observability point (log-only, no path change) for one release. If the counter stays at 0 across real usage, remove.
**Trade-off:** Gained — the cleanup waits for evidence; observability for a release gives a real empirical floor. Lost — a few lines of "dead" code linger briefly.
**Status:** CHALLENGED
**Suggested resolution:** Gate R4 on Q1's resolution. Move "remove parseSafe brace-retry" to a follow-up commit after the I9 PBT at 10K runs under agnostic mode demonstrates PUA sentinels and agnostic parser co-exist, and after one week of the parseSafe brace-retry counter showing zero hits in the dev server's own usage.

---

## Low Severity

### [L] Finding 7: Cited prior art and Mike's draft spec are dead links in this worktree; evidence directory is empty

**Category:** DESIGN (artifact integrity)
**Source:** DC2 (cold-reader lens)
**Location:** §Links ("Prior art: [reports/mdx-tolerant-parsing-architecture/](../../reports/mdx-tolerant-parsing-architecture/REPORT.md)", "Mike's draft: [specs/2026-04-13-markdown-mdx-tolerant-parsing/](../2026-04-13-markdown-mdx-tolerant-parsing/SPEC.md) (PR #105)"); §16 ("Mike's tolerant parsing spec (PR #105)").
**Issue:** From this worktree (`spec+mdx-tolerant-parsing`):
  - `reports/mdx-tolerant-parsing-architecture/` — does not exist (checked `ls reports/ | grep mdx`).
  - `specs/2026-04-13-markdown-mdx-tolerant-parsing/` — does not exist.
  - `specs/2026-04-13-mdx-tolerant-parsing/evidence/` — exists but is empty.
  
  A cold reader cannot verify any claim that cites these. Section 16's "Relationship to other specs" treats Mike's PR #105 as authoritative prior art for D1, D3, D4, D5 mapping — but the artifact isn't reachable. §9's architecture diagram and D4's "no production system has implemented block-level fallback" both lean on the missing `mdx-tolerant-parsing-architecture` report.
**Current design:** Spec relies on links that resolve in some other branch but not this one.
**Alternative:** Either (a) cherry-pick the cited artifacts into this worktree before finalization, (b) inline the load-bearing findings from Mike's PR #105 and the missing report into evidence files in this spec's `evidence/`, or (c) replace the links with direct citations the reader can verify (git refs to PRs/commits, quoted excerpts).
**Trade-off:** Gained — the spec survives cold reading; implementer can verify rationale without cross-branch hunting. Lost — some copying.
**Status:** CHALLENGED
**Suggested resolution:** Before finalization (Step 8), confirm every §Links and §16 reference is reachable from the branch the spec will merge on, or inline the citations.

---

### [L] Finding 8: R7 (fallback visual indicator) punted to Future Work leaves no user-visible cue during the degradation window

**Category:** DESIGN
**Source:** DC2 (customer-facing engineer lens)
**Location:** §6 R7 "Should"; §15 Future Work ("Fallback visual indicator: Dashed border + 'raw' badge in WYSIWYG for fallback blocks. Depends on R6.").
**Issue:** Until R6 (block-level fallback) and R7 (indicator) ship, the user experience at the moment of degradation is: document that previously rendered with structure suddenly appears as a single raw-text paragraph (§6 R4, §9 simplified parseSafe). There's no error, no "we couldn't parse this region" indicator, no path to source mode from the WYSIWYG. The user's mental model is "my file broke." Source mode is a safety net (§5 P1 failure/recovery) but the user has to know to look there.
**Current design:** R7 deferred to Future Work with an R6 dependency.
**Alternative:** Ship a minimal non-visual degradation telemetry in this spec — one toast, one console warning, or one status-bar indicator when `parseSafe` falls through to raw text. Does not depend on R6. ~10 lines. Closes the "silent failure" gap until R6+R7 ship.
**Trade-off:** Gained — users see something when the fallback triggers; support/debugging gets a signal. Lost — a tiny UI surface.
**Status:** CHALLENGED
**Suggested resolution:** Add a "Must" requirement for a minimal user-visible failure signal (toast, banner, or status indicator) independent of R6/R7. Or confirm with product that silent whole-doc degradation is acceptable UX during the Future Work window.

---

## Confirmed Design Choices (summary)

- **D1 (agnostic over strict)** holds under DC1 and DC3. Rationale is grounded: TQ27 product scope does not need JS expression validation; `mdxJsxFlowElement.attributes` structured data is preserved by micromark-extension-mdx without acorn (validated against `packages/core/src/markdown/index.ts:432-437` handler behavior); storage-layer contract (NG4) unchanged. A3/A2 assumptions are real but tracked as open questions Q1-Q3.
- **D2 (retain R23 guard)** holds under DC1. Spec correctly observes agnostic mode doesn't change `<` behavior; guard's proven-by-PBT role is intact.
- **Problem framing (§1 SCR)** holds under DC3. The Complication (editor's own documentation breaks in the editor) is concrete and self-evidencing. The intersection of "bring your own markdown" + "component support" + "raw passthrough" is real, not post-hoc — each dimension is traceable to a product quote (PROJECT.md:70, AGENTS.md:531, ARCHITECTURE.md:31, PROJECT.md:110) and each maps to a distinct R-requirement.
- **jsxComponent → jsxInline handler split (R3)** holds under DC1 as a parser-layer change (the question challenged in Finding 4 is the *schema shape*, not the *handler change*).
- **R10 (`isolating: true`)** holds — correct ProseMirror default for opaque nodes; cited as precondition for T3 keyboard nav and not in dispute.
