# Design Challenge Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/specs/2026-04-29-clipboard-component-contract-and-byte-preservation/SPEC.md`
**Challenge date:** 2026-04-30
**Total findings:** 8 (3 high, 3 medium, 2 low)

---

## Summary of dimensions probed

The spec was challenged across the eight axes the user named. Of those, **three surface real concerns**, **three fizzle** (the rejection holds under independent scrutiny), and **two surface medium concerns worth flagging**. The three high-severity findings cluster around: (1) FR-13-first cross-PM-editor regression risk that wasn't fully traced, (2) the canonical/compat HTML taxonomy split's ROI, and (3) the Q29 deferral genuinely violating the user's own greenfield directive. The strongest "fizzle" — i.e., a rejection that holds extremely cleanly under independent scrutiny — is **NG-S1 (sync-event custom MIME)**: the prosemirror-view source confirms there is genuinely no extension point to write a third MIME without DOM-level handlers.

---

## High Severity

### [H] Finding 1: FR-13-first cross-PM-editor risk for content with custom inline nodes is under-traced

**Category:** DESIGN
**Source:** DC1 (simpler alternative + interface depth)
**Location:** SPEC §10 D5 (line 213); §6 FR-1 (line 116); evidence `branch-c-disk-outcome-trace.md` Payload (d); evidence `q1-byte-preservation-matrix.md` J3.4–J3.7

**Issue:** The spec's D5 rationale claims FR-13-first preserves cross-PM-editor interop because "Linear/Outline/BlockNote text/plain is canonical markdown" (verified for Outline, BlockNote; Linear's default Cmd+C UNCERTAIN per Q1 J3.4). The spec then asserts "their text/plain is markdown-canonical… FR-13 catches them too with equivalent results."

But Branch C trace evidence (`branch-c-disk-outcome-trace.md` Payload (d)) shows that **for Outline content with custom inline nodes** like `<span data-mention="user-123">@mention</span>`, Branch C's text/html walk **silently drops the wrapper** but **preserves the visible text** — yielding `- Item with @mention`. The text/plain markdown counterpart from Outline would be `- Item with @mention` (visible text only — same byte content).

For *this specific case*, the two paths converge. **But the spec hasn't surveyed all custom inline node types across PM-based editors that ship today** — only the well-known ones (heading/list/strong/emphasis/link). The risk is that some PM editor's text/plain is a *strict subset* of what its text/html carries, and FR-13-first would lose the difference. Examples worth probing:

- **Linear's "@-mention" or "issue-link" tokens.** Their text/html may carry `<span data-mention-id>` while text/plain may degrade to literal `@username`. If Linear's text/html→OK schema has a richer mapping than text/plain → mdast, FR-13-first is strictly worse.
- **BlockNote's custom inline nodes** (e.g., inline mentions, smart links). BlockNote ships canonical markdown to text/plain (verified) — but their `cleanHTMLToMarkdown(externalHTML)` runs BEFORE setting clipboard MIMEs, so text/plain IS the lowered form. Less concerning here.
- **Affine/BlockSuite custom blocks** that don't have markdown analogs.

**Current design:** "Cross-PM-editor interop (Linear, Outline, BlockNote) is preserved — their text/plain is also markdown-canonical (verified 2026-04-30)" (§1 Resolution).

**Alternative:** A **hybrid Branch C-with-fallback** approach: keep Branch C ahead of FR-13 for `data-pm-slice`-bearing payloads (so cross-PM-editor sources still get parseDOM treatment for richest fidelity), BUT add a **post-Branch-C custom dispatch** that detects "Branch C produced an OK→OK content-loss" pattern (e.g., text/plain has `<img>` JSX shape but PM tree contains a generic `image` node) and re-routes through FR-13. This preserves Branch C's parseDOM advantages for cross-app sources while fixing the OK→OK regression class.

A simpler alternative: keep the current dispatcher order but add a **JSX-aware pre-check inside Branch C** that calls FR-13 when the text/plain looks like JSX content. The pre-check is "narrow" — only fires on JSX-shape detection, doesn't affect any other path.

**Trade-off:** The hybrid is more complex (two dispatch decisions instead of one). FR-13-first is simpler but assumes equivalence between text/plain and text/html for all cross-PM-editor sources. The user has not surveyed cross-PM-editor sources beyond Linear/Outline/BlockNote/Milkdown — and even Linear's default Cmd+C is UNCERTAIN.

**Status:** CHALLENGED

**Suggested resolution:** Either (a) verify the equivalence claim against a broader cross-PM-editor corpus (Affine, Notion-as-PM, Lexical-based editors) before locking D5, OR (b) re-examine Branch-C-with-narrow-JSX-pre-check as a safer reorder that preserves parseDOM richness for sources that need it, OR (c) accept the risk explicitly and document a rollback path: if a cross-PM-editor regression surfaces post-merge, the dispatcher reorder is one-line revertable.

**Implicates:** D5 (FR-13-first dispatcher reorder).

---

### [H] Finding 2: Canonical/compat HTML taxonomy SPLIT (D15) lacks evidence that the split delivers cross-app render value

**Category:** DESIGN
**Source:** DC1 (simpler alternative — interface depth deletion test)
**Location:** SPEC §10 D15 (line 222); §6 FR-7 (line 122); evidence `q4-q6-q8-toclipboardhast-contract.md` §"Per-descriptor implementations"

**Issue:** D15 ships TWO `toClipboardHast` implementations for callouts: canonical Callout emits `<aside class="callout callout-{type}" data-callout-type="{type}">...` and compat GFMCallout emits `<div class="markdown-alert markdown-alert-{type}">...`. The rationale: "OK's Callout has richer prop surface than GFM's 5-type alert (title, icon, color, collapsible)... using OK's own class taxonomy keeps the cross-app shape consistent with what the in-app render already produces."

But the spec's own evidence confirms:
- Most cross-app destinations (Slack, Notion, Gmail, GitHub textarea, VS Code, Apple Notes) **strip `class` attributes via their HTML sanitizers** OR have no CSS for either taxonomy. The class taxonomy only matters when the destination has matching CSS.
- The *only* destination with native CSS for either taxonomy is **GitHub** (which recognizes `markdown-alert-{type}`). Slack/Notion/Gmail/Apple Notes have no matching CSS for either taxonomy.
- For destinations without CSS, both taxonomies render as **unstyled blocks** — visually equivalent to each other.

**Apply the deletion test (interface-depth probe):** If we deleted GFMCallout's distinct `toClipboardHast` and made BOTH descriptors emit the canonical OK shape (or BOTH emit the GitHub markdown-alert shape), what would change?

- **Deletion of canonical Callout's distinct shape** (unified to GitHub markdown-alert): GitHub renders correctly; everything else renders as unstyled block (same as today). Loss: in-app cross-tab paste shows "GitHub-style" rather than "OK-style" callout chrome (but for OK→OK paste, content goes through text/plain via FR-13-first — text/html is never read, the in-app render is the descriptor's React component). **No actual visual difference.**
- **Deletion of GFMCallout's distinct shape** (unified to canonical OK shape): Cross-app render of `> [!NOTE]` source becomes `<aside class="callout">` shape. GitHub still renders an unstyled aside (no matching CSS). All other destinations render unstyled (same as today). **No actual visual difference.**

The split's only justification is *internal consistency* ("two source forms, two presentations"). But the **outbound clipboard never sees the user** — it's machine-to-machine HTML. The internal consistency argument applies only when the in-app render uses the clipboard HTML, which it doesn't (in-app render is the React component, not parsed HTML).

**Current design:** Two `toClipboardHast` implementations per callout; ~25 LoC each (~50 LoC total).

**Alternative:** **Unify on GitHub markdown-alert taxonomy for both** (Option B from `q4-q6-q8-toclipboardhast-contract.md`). One implementation; both descriptors flow through the same `toClipboardHast`. Saves ~25 LoC, eliminates the dispatch-by-`node.name` lookup at FR-6 cascade site, and yields *better* cross-app render value (GitHub specifically gets a stylized callout instead of an unstyled aside).

**Trade-off:** Loses the canonical/compat *aesthetic* split. Gains a clearer single emission convention. If a future destination ever ships native CSS for `class="callout"` (none does today), unifying forecloses that. But if a future destination matters, OK can re-introduce the split additively.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine D15 against the deletion test. The "internal consistency" rationale wasn't tested against the question "does any user-visible behavior actually depend on this split?" Empirical answer based on evidence: no destination today has CSS for the canonical taxonomy; GitHub has CSS for the compat taxonomy. Unifying on GFM taxonomy is strictly more useful in cross-app rendering AND simpler to maintain.

**Implicates:** D15 (canonical/compat HTML taxonomy split).

---

### [H] Finding 3: Q29 deferral genuinely violates the user's own greenfield directive

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — future maintainer / SRE)
**Location:** SPEC §11 Q29 (line 263); §15 Future Work / Identified ("CI build hygiene"); evidence `q27-root-cause-analysis.md` §"Three follow-ups worth considering"

**Issue:** The Q27 stale-dist failure was caught only by a manual `parseToMdast` invocation during this spec's investigation phase. Per the evidence: "All consumers of `@inkeep/open-knowledge-core` via the dist path inherit the same stale behavior. This includes the published `@inkeep/open-knowledge` CLI, `@inkeep/open-knowledge-server` HTTP API agent-write paths, and Electron utility-process server. So `<details>` content authored against a deployed CLI/Electron build today round-trips as `paragraph > text` instead of `HtmlDetailsAccordion` — a real production parity gap, not just a test artifact."

In other words: **Q27 was not "a stale build that nobody noticed in the test suite." It was "a stale build that broke production for 2 days, undetected, because the test suite uses `--conditions=development` which bypasses the broken artifact."**

The user's MEMORY.md explicitly notes: **"No deferred tech debt on greenfield"** and **"Resolve findings in-scope, use /assess-findings, no tech debt deferral on greenfield projects."**

The Q29 entry says: "DEFERRED to Future Work per user direction 2026-04-30 — cross-cutting build/CI concern requiring different domain expertise; legitimate separate scope."

**The "different domain expertise" framing is generous.** Per the evidence file `q27-root-cause-analysis.md`, the candidate fixes are:
- (a) Precommit hook rebuilds dist on source change — trivial git hook (~5 LoC).
- (b) Drop `--conditions=development` so tests + production converge — single config change in 4 packages.
- (c) Assert `dist/index.mjs` mtime ≥ source mtime in CI — single shell script.
- (d) Custom turbo task ordering — config tweak.

Each candidate is small, scoped to build infra, and the user (Nick — CPO/CTO) owns this layer per MEMORY.md. **There is no domain-expertise gap.**

The greenfield directive should not be selectively applied. Either Q29 is in-scope (resolved here, ~5 LoC max for option a), or the greenfield directive is itself a soft commitment — but mixing modes erodes the directive's force across the spec. If a Q29-class bug surfaces post-merge (which is essentially guaranteed given the candidates are simple), it will be caught the same way Q27 was: by accident, after production exposure.

**Current design:** Q29 deferred to Future Work; FR-11 ships a one-time `bun run build` mechanical action.

**Alternative:** Inline a precommit-hook check (option a) or a turbo task ordering fix (option d) within this spec. ~5-10 LoC. Closes the bug class instead of leaving the next stale-dist incident to surface in production.

**Trade-off:** Spec scope grows by ~5-10 LoC and one CI config edit. The build hygiene fix is independent of the clipboard work — but the user's greenfield directive specifically excludes this kind of carve-out reasoning ("different domain ≠ deferred debt").

**Status:** CHALLENGED

**Suggested resolution:** Re-examine the Q29 deferral against MEMORY.md's no-deferred-tech-debt directive. If the greenfield directive holds, Q29 should be promoted to In Scope and resolved with a precommit hook (cheapest option) or `--conditions=development` removal (most thorough). Alternatively, document that the greenfield directive has a "different-domain" exemption and tighten its phrasing for future specs.

**Implicates:** Q29 (deferred), and indirectly D16 (which "resolves" Q27 with 0 LoC but leaves the structural cause untouched). Also implicates the consistency of the greenfield directive across the spec.

---

## Medium Severity

### [M] Finding 4: Test budget excludes cross-app destination rendering — but a key bug class lives there

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — customer-facing engineer)
**Location:** SPEC §7 (test strategy summary, line 152); evidence `test-strategy.md` lines 124-145; evidence `test-strategy.md` Q32

**Issue:** The 10-E2E budget at `test-strategy.md` excludes real-destination paste verification (boundary 12). Q32 explicitly recommends snapshot tests over real-Slack/Notion/Gmail E2E because "Real destinations are too flaky and slow. Trust the HTML output is what destinations render."

But the bug class boundary 12 catches that hermetic snapshots cannot is **destination-specific HTML mutation**. Examples:
- Slack's HTML sanitizer might strip `<aside>` elements but preserve `<div>` (destination-side decision OK can't predict from snapshots).
- Notion's import pipeline might require `<details>` to be at the top level of a block, not nested.
- Gmail's compose-pane sanitizer might require specific `class` allowlists that vary by mail-client version.

The spec's MEDIUM confidence on "cross-app destination rendering" is honest. But **the user's primary outcome (G2 — "OK→external paste of any custom component renders semantically in cross-app destinations") is exactly what hermetic snapshots cannot verify.** A snapshot says "we emit `<aside class='callout'>'`. It does NOT say "Slack/Notion render this as a styled callout."

**Current design:** Hermetic HTML snapshot tests + 10 E2E budget excluding real destinations. MEDIUM confidence acknowledged.

**Alternative:** Promote at least ONE real-destination E2E. Candidate: a Playwright test that runs `clipboard-write OK→external` against a known sanitizer endpoint (e.g., post to a Slack webhook in a test workspace, scrape the message DOM, assert the rendering). This is genuinely flaky but catches the bug class hermetic snapshots miss.

Alternative simpler: use one of the **published HTML-sanitizer libraries** (DOMPurify default config, sanitize-html with various profiles) as a hermetic proxy for destination behavior. Run snapshots through each sanitizer and assert key shapes survive. This is hermetic, deterministic, and catches the "destination strips `<aside>`" class without real-Slack flakiness.

**Trade-off:** Real-destination E2E adds 1-2 flaky tests; sanitizer-proxy adds 0 flaky tests but requires choosing which sanitizer profiles match real destinations. Without either, **G2 is asserted but not tested at the destination boundary** — the success metric is "every canonical descriptor renders semantically in 5 surveyed destinations" which is currently **unverified**.

**Status:** CHALLENGED

**Suggested resolution:** Adopt the sanitizer-proxy approach as a hermetic boundary-12 test layer. Run the 5 surveyed destinations' approximate sanitizer profiles against the `toClipboardHast` outputs and assert the semantic shapes survive. ~30-50 LoC; deterministic; catches the bug class.

**Implicates:** G2 success metric, FR-7 acceptance criteria.

---

### [M] Finding 5: D11's three-layer cascade lacks an opt-out primitive — descriptors can never emit nothing

**Category:** DESIGN
**Source:** DC1 (simpler alternative + completeness)
**Location:** SPEC §6 FR-6 (line 121); §10 D11 (line 220); evidence `q4-q6-q8-toclipboardhast-contract.md` §"Behavior on each return path"

**Issue:** The three-layer cascade is: descriptor → tryNativeHtmlPrimitive → `<pre class="mdx-component">`. Layer 3 always succeeds. **There is no way for a descriptor to say "emit nothing on the clipboard."**

This is fine for the 5 canonical + 3 compat descriptors today, all of which want SOME cross-app emission. But the spec's foundational pattern (`toClipboardHast` as a contract for "every future custom OK component") doesn't accommodate the case where:
- A descriptor is **internal-only** (e.g., a "comment-anchor" or "draft-marker" that should never leak to cross-app destinations).
- A descriptor's content is **sensitive** (e.g., a "personal-note" descriptor that should be stripped on copy-out for privacy).
- A descriptor is a **stub** awaiting full implementation and shouldn't emit garbage.

The cascade's null/throw behavior funnels these to the `<pre class="mdx-component">` fallback — which leaks the descriptor's source bytes to cross-app destinations as escaped MDX text. That's exactly what the spec is trying to prevent for capitalized JSX.

**Current design:** Descriptors return hast (emit), null (cascade to Layer 2/3), or throw (telemetry + cascade to Layer 2/3).

**Alternative:** Add a fourth return type — an explicit "opt-out" sentinel (e.g., return `'omit'` or a typed tagged union `{ kind: 'omit' }`). Behavior: emit zero bytes for this descriptor. The text/plain side still has the source bytes (descriptor's `serialize` arm); only text/html omits.

**Trade-off:** TypeScript contract gets one more return-type case. ~3 LoC change to the dispatch site. Forecloses a class of future bugs where a descriptor wants privacy-preserving copy semantics.

**Status:** CHALLENGED (medium — completeness gap, not a current bug)

**Suggested resolution:** Re-examine D11's return-type space. Adding `'omit'` is small and additive; not adding it forces every future descriptor that wants "no emission" to either ship a custom hast that's "intentionally empty" (still emits a `<span></span>` shell) or rely on PR-time review to catch the leak.

**Implicates:** D10/D11 (toClipboardHast contract surface).

---

### [M] Finding 6: D17 reversal undermines the consistency case for D15

**Category:** DESIGN
**Source:** DC3 (framing validity — internal consistency)
**Location:** SPEC §10 D17 (line 226 — REVERSED 2026-04-30 under greenfield directive); D15 (line 222); §11 Q29 (line 263 — DEFERRED)

**Issue:** The greenfield directive was applied to D17 (forcing symmetric class+data-attr emission for `jsxInline`/`rawMdxFallback`) on the rationale: "Setting a clean precedent NOW costs ~10 LoC; setting it later (after 5 more descriptors land with mismatched shapes) costs much more."

The same logic applies — **even more strongly** — to D15 (canonical/compat HTML taxonomy split). The split *creates* mismatched shapes between two descriptors that share a callout-class semantic. Setting that precedent NOW costs `~25 LoC saved`; reversing it later (after 5 more compat descriptors land each with their own taxonomy) costs much more.

But D15 was NOT reversed under the greenfield directive. The "internal consistency" rationale held for D15 but the greenfield directive overrode the same rationale at D17. **This is inconsistent application of the directive.**

Cross-cutting on Q29: The greenfield directive was ALSO not applied to Q29 (deferred to Future Work) — even though Q29's fix is smaller than D17's (~5 LoC vs ~10 LoC).

**Current design:** D17 reversed (greenfield); D15 LOCKED (not reversed); Q29 deferred (not greenfield-applied).

**Alternative:** Either (a) reverse D15 under the same greenfield logic that reversed D17 — unify on GFM taxonomy as Finding 2 proposes, OR (b) document that the greenfield directive has a specific scope (e.g., "applies only to outbound HTML shape symmetry") and that D15's "two source forms, two presentations" is exempt.

**Trade-off:** Inconsistent directive application erodes the directive's force across future specs. A reader who internalizes the D17 reasoning will be confused why D15's similar structure didn't trigger the same reversal.

**Status:** CHALLENGED (medium — framing inconsistency, not a substance error)

**Suggested resolution:** Re-examine D15 under the same lens as D17. Either reverse it (per Finding 2) or explicitly note in the Decision Log that the greenfield directive applies to outbound HTML *symmetry* across descriptor pairs but not to outbound HTML *taxonomy* choice for distinct descriptors.

**Implicates:** D15, D17, Q29 — and the consistency of the greenfield directive's application.

---

## Low Severity

### [L] Finding 7: Try-parse-and-validate (Milkdown/Keystatic pattern) rejection rationale is thin

**Category:** DESIGN
**Source:** DC1 (simpler alternative — long-form rationale check)
**Location:** SPEC §9 line 197; §10 D8 (line 215); §15 Future Work / Explored

**Issue:** The signal-count heuristic adds 6 new signals in this spec (D8 + D18). The rejection of try-parse-and-validate is one paragraph: "same false-positive shape as signal-count (ambiguous bytes resolve identically); 50-150x slower per paste; no functional gain."

Per `references/decision-protocol.md` "Long-form rationale gate": the choice between heuristic-extension and try-parse-and-validate is a foundational call that affects every future descriptor's signal coverage. This decision matches the triple gate (hard-to-reverse + surprising-without-context + result-of-real-tradeoff), but the Decision Log entry has only a one-line rationale.

The "50-150x slower" claim is unverified in the spec's evidence. The signal-count regex check is ~0.1ms (claimed). 50-150x slower would put try-parse at 5-15ms, well under the 250ms p95 paste budget — so the perf argument is not load-bearing on its face.

The "same false-positive shape" claim is plausible but not supported by evidence. Try-parse could **expose richer signal**: a successful parse of `> [!NOTE]\nbody` as `mdast(blockquote(text))` IS a different signal from "matched blockquote regex" — it tells you the bytes parse to a non-trivial structural mdast subtree. That's strictly more information than regex.

**Current design:** Signal-count heuristic with 6 new signals (D8 + D18). Each future descriptor whose source form doesn't match an existing signal needs a new signal added.

**Alternative:** Try-parse-and-validate (Milkdown/Keystatic pattern). Run `mdManager.parse(text)` and inspect the resulting mdast for non-trivial structure (e.g., any non-paragraph block, any non-text mdast type, any custom-named mdxJsxFlowElement/mdxJsxTextElement). Signal: "this parses to a meaningful mdast tree." No regex maintenance burden.

**Trade-off:** Signal-count is faster but accumulates signal-list maintenance debt linearly with descriptor count. Try-parse is slower but self-extends as the parser learns new descriptors. As the spec ships 6 new signals AND an 8th descriptor (HtmlDetailsAccordion compat) that's NOT covered by any of them — the signal-list maintenance cost is already manifesting.

**Status:** CHALLENGED (low — likely the rejection holds, but the rationale should be stronger)

**Suggested resolution:** Re-verify the perf claim with a measurement (1k-iteration microbench against AI-chat copy-button output). If try-parse is genuinely 5-15ms, that's well under budget and the perf rejection collapses. The "same false-positive shape" claim deserves a more careful argument or empirical comparison on adversarial inputs. If after re-verification signal-count still wins, the Decision Log entry should record the verified numbers — not just the asserted ratio.

**Implicates:** D8 (heuristic extension architecture choice).

---

### [L] Finding 8: Spec mentions but doesn't enforce a "drift detection" mechanism for new descriptors

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — future maintainer)
**Location:** SPEC §1 Complication #3 (line 28); §10 D10 (line 219); §6 FR-5 (line 120)

**Issue:** The spec's stated motivation includes: "There is no per-descriptor declaration of 'what should this look like in cross-app HTML.' Every future custom OK component (iframe per the planned report; Frame v2; AI-native primitives) inherits the same regression class on day one until someone adds it to the carve-out."

The `toClipboardHast` contract addresses this. But the spec doesn't include a **mechanical drift-detection test** for the descriptor registry — i.e., a test that fails when a new descriptor is registered without `toClipboardHast` defined AND its source form doesn't match any signal in `is-markdown.ts`.

Without such a test, the workflow is: developer adds Frame v2 descriptor → forgets to add `toClipboardHast` → cascade falls through Layer 2/3 → cross-app paste yields `<pre class="mdx-component">` → user reports the regression weeks later → spec is "right in spirit" but the same class of bug recurs.

The spec's I20 PBT (toClipboardHast adversarial-attribute corpus) verifies *existing* descriptors' toClipboardHast outputs — but it doesn't catch missing implementations on *new* descriptors.

**Current design:** `toClipboardHast?` is OPTIONAL on `JsxComponentMetaBase`; cascade emits `<pre class="mdx-component">` when undefined. No mechanical enforcement.

**Alternative:** Add a registry-level invariant test (e.g., `packages/core/src/registry/coverage.test.ts`): "every descriptor whose source form would NOT trigger `is-markdown.ts` heuristic with current signals MUST define `toClipboardHast`." Mechanical enforcement; fails CI on drift.

Even simpler: change the contract from optional to required on canonical descriptors (compat descriptors keep optional). Forces explicit `toClipboardHast: () => null` for canonical descriptors that intentionally fall through to Option B.

**Trade-off:** Adds one mechanical test or one TS-contract change. Catches the regression class structurally instead of relying on review attentiveness.

**Status:** CHALLENGED (low — completeness gap, not a current bug)

**Suggested resolution:** Add a drift-detection test or tighten the contract to make the cascade default explicit. Either approach prevents the regression class the spec was designed to close from re-emerging on new descriptors.

**Implicates:** D10 (toClipboardHast contract surface), the spec's foundational claim that the contract solves the "every future descriptor inherits the regression" class.

---

## Confirmed Design Choices (rejections that hold under independent scrutiny)

### NG-S1 — Sync-event custom MIME (rejection HOLDS cleanly)

**Verdict:** The rejection is structurally airtight under independent verification of the prosemirror-view source.

**Evidence:** `node_modules/prosemirror-view/src/clipboard.ts` line 5-40 (`serializeForClipboard`) returns `{dom, text, slice}`. The CALLER at `node_modules/prosemirror-view/src/input.ts` line 595-612 (`handlers.copy = editHandlers.cut`) is a DOM-level event handler internal to PM that calls `event.preventDefault()` and `data.setData('text/html', dom.innerHTML)` + `data.setData('text/plain', text)` — only two MIMEs.

PM's `someProp` extension surface for clipboard is exactly:
- `transformCopied: (slice, view) => Slice` — slice transform, no MIME write
- `clipboardSerializer: DOMSerializer` — emits text/html only
- `clipboardTextSerializer: (slice, view) => string` — emits text/plain only
- `transformPastedHTML/Text/Pasted` — paste-side, no copy-side
- `handlePaste` — paste-side, no copy-side

**There is no PM-side extension point to write a third MIME.** The only mechanism is `editor.setProps({ handleDOMEvents: { copy: ... } })` which precedent #19(b) explicitly prohibits ("would re-introduce the drag-and-drop coupling problem that caused D14 to flip to PM hooks").

The DC1 simpler-alternative probe was: could PM's hooks themselves be extended? Inspection of `prosemirror-view/src/input.ts` confirms PM's own copy handler is DOM-level — but it's INTERNAL to PM. Patching PM (forking it) is not a viable alternative.

The structural-payload-mechanism evidence's analysis is correct. **NG-S1's rejection is the kind of locked decision that holds extremely cleanly.**

### NG-S2 — `data-ok-slice` attribute marker (rejection holds — see qualifier)

**Verdict:** The rejection holds, but with one nuance worth surfacing for completeness.

The original analysis at `evidence/structural-payload-mechanism.md` actually RECOMMENDED `data-ok-slice` as the precedent-conformant solution. The spec then rejected it (NG-S2) in favor of FR-13-first. The rejection rationale ("strictly more implementation surface; achieves same outcome with less code") holds under independent scrutiny — FR-13-first really is simpler.

But the rejection should acknowledge that **`data-ok-slice` would have been more robust** in one scenario: cross-PM-editor sources whose text/plain is a strict subset of text/html (Finding 1's risk). With `data-ok-slice`, OK could distinguish "OK-origin content" from "external PM-editor content" structurally, then route only OK-origin through FR-13. External PM-editor content keeps Branch C parseDOM treatment.

The trade-off is real: FR-13-first is simpler but assumes equivalence; `data-ok-slice` is slightly more complex but provenance-aware. The spec's choice is defensible but not strictly dominant. (See Finding 1.)

### Per-descriptor `toClipboardHast` contract shape (D10) holds

**Verdict:** The contract signature `toClipboardHast?: (node, ctx) => HastNodes | null` is well-designed. The cascade behavior with null/throw distinct from undefined-method is clean. The TS contract surface is minimal. Sister-method-to-`serialize` framing is on-pattern. No DC1/DC2/DC3 lens surfaces a real concern beyond Finding 5 (opt-out primitive) and Finding 8 (drift detection).

### D6 — No custom MIME / no marker attribute / no DOM-level handlers (holds)

**Verdict:** The hard-line stance holds under DC2 (security stakeholder) and DC1 (simpler alternative) scrutiny. The mechanism boundary is clear; alternatives have been independently evaluated.

### Q27 D16 reframe (RESOLVED 2026-04-30, 0 LoC) holds for what it claims

**Verdict:** The "stale-build" diagnosis is correctly grounded in `evidence/q27-root-cause-analysis.md` with verified mtime + dist-content inspection. The 0 LoC fix is mechanically correct. **What does NOT hold** is the deferral of the structural cause to Q29 (Finding 3). D16's reframe is right; Q29's deferral is wrong.

---

## Severity tally

| Severity | Count | Findings |
|---|---|---|
| High | 3 | F1 (FR-13-first cross-PM-editor risk), F2 (D15 split rationale), F3 (Q29 greenfield-directive violation) |
| Medium | 3 | F4 (test budget excludes destination boundary), F5 (no opt-out primitive in cascade), F6 (D17 reversal vs D15 inconsistency) |
| Low | 2 | F7 (try-parse rejection rationale thin), F8 (no drift detection for new descriptors) |

**Strongest "fizzle" (rejection holds extremely cleanly):** NG-S1 sync-event custom MIME. The prosemirror-view source confirms no extension point exists; the rejection is structurally airtight, not just preferential.

**Decisions worth reopening (in priority order):**
1. **D15** (canonical/compat HTML taxonomy split) — Finding 2 + Finding 6: deletion test shows no user-visible behavior depends on the split; greenfield directive logic from D17 reversal applies symmetrically.
2. **Q29 deferral** — Finding 3: the greenfield directive should not have an unstated "different-domain" exemption; production exposure is real.
3. **D5** (FR-13-first) — Finding 1: not a reversal but an evidence gap; survey cross-PM-editor sources beyond the four already verified, OR document explicit rollback path.
