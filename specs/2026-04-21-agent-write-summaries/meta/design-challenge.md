# Design Challenge Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/specs/2026-04-21-agent-write-summaries/SPEC.md`
**Challenge date:** 2026-04-21
**Challenger:** general-purpose subagent (cold reader)
**Total findings:** 9 (3 H, 4 M, 2 L)

The spec is mostly internally consistent and the workshop did serious work. The challenges below land in three clusters: (1) shape decisions whose "data shape" exceeds what the renderer needs (D1, D17 vs renderer plan); (2) UX decisions whose evidence is thinner than the lock would suggest (D5/D20 cap, D6 bullet UX, D3 optional posture); (3) unintended consequences of D15's attribution change.

The Decision Log was read carefully. Several findings independently converge with rejected alternatives — surfaced here per protocol, with new evidence rather than re-litigation.

---

## High Severity

### [H] Finding 1: Storage shape (`Record<string, string[]>`) carries a doc-grouping the renderer immediately throws away

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §6 FR4, §9 Data model + System design diagram (line 188), §10 D1
**Issue:** The spec stores `summariesByDoc?: Record<string, string[]>` (per-doc bucketed) but the renderer aggregator on line 188 is `allSummaries = contributors.flatMap(c => Object.values(c.summariesByDoc ?? {}).flat())`. This `Object.values(...).flat()` discards the doc keys entirely. The renderer never uses the per-doc grouping. Combined with D17 LOCKED (one summary per call) and D16 LOCKED (doc-list line is *always* shown as ground truth), the `summariesByDoc` shape carries information the v1 system has explicitly committed to ignoring.
**Current design:** "Storage shape: extend existing `ok-contributors:` JSON line with `summariesByDoc?: Record<string, string[]>`" (D1). Plus FR7: "doc-list line is ALWAYS shown alongside (per D16 mixed-render — bullets enrich, doc-list is ground truth)."
**Alternative:** Store `summaries?: string[]` — a flat array per contributor, ordered chronologically. Renderer becomes `allSummaries = contributors.flatMap(c => c.summaries ?? [])` — simpler, faster, same UX. The doc-list line already attests *which* docs the contributor touched (D16); the per-doc bullet bucketing adds no information the user can see today.
**Trade-off:**
- *Gained:* simpler shape on the wire (flat array vs nested object), simpler renderer aggregator, simpler `recordContributor` signature (no per-doc map), simpler `restoreContributors` merge (concat arrays vs merge maps), one fewer test case (no "summary recorded but doc not in docs[]" inconsistency to defend against).
- *Lost:* the schema cannot express "this summary is about foo.md, not bar.md" without a future migration. D9 LOCKED claims "additive" precludes this — but a migration to `Array<{doc, summary}>` is exactly the same magnitude either way (both old shapes coexist with the new shape via parser tolerance).
- *Where the spec's shape wins:* IF future work wants `foo.md: Fixed typo` rendering (Q3 option (c)) or per-doc filtering, `summariesByDoc` is one parser change away. With the flat shape, you'd add `summariesByDocV2` and migrate. The cost difference is small and post-ship-deferrable; the cost today of carrying unused structure is real (more code, more test surface).
- *Asymmetry signal:* D17 locks the *input* as one string (no array, no doc keying) and the *renderer* throws away doc keying. Storage is the only layer that retains the per-doc shape, sandwiched between two layers that don't want it.
**Status:** CHALLENGED
**Suggested resolution:** Re-examine D1 with the question: "What v1 consumer reads `summariesByDoc[doc]` keyed?" If none (current state), simpler shape wins. If FR14 `exec` enrichment consumers want per-doc grouping for agent-to-agent reads (P3 persona, F1) — say so explicitly and keep the nested shape, but document that the renderer aggregator *intentionally* flattens it. Either way, surface the inconsistency in the spec.

---

### [H] Finding 2: D17's "single string per call" is not actually a one-way door — and the array option has a stronger case than the spec credits

**Category:** DESIGN
**Source:** DC3 (framing validity) + DC1 (simpler alternative)
**Location:** §10 D17 LOCKED, §11 Q4 status amendment
**Issue:** D17 locks `summary: string` (singular) per call as a "1-way door" tool API shape. The rationale captured in the changelog is that "multi-bullet emerges via debounce coalescing" — i.e. an agent making 5 edits gets 5 bullets via 5 calls. But (a) the door isn't actually one-way, because going from `string` → `string | string[]` is purely additive in MCP/Zod schema terms (Zod union with discriminator, accept both); (b) the debounce-coalescing argument has a hidden cost that the spec never quantifies; and (c) `summaries: string[]` would let `edit_document` describe a multi-step refactor in one call without firing 5 round-trips through the server, contributor accumulator, and MCP transport.
**Current design:** D17: "single `summary: string` per call. Multi-bullet emerges via debounce coalescing." Status: LOCKED 1-way door.
**Alternative:** `summary: string | string[]` (or `summary?: string` + `summaries?: string[]`) — accept either. Single-string callers behave identically; array callers get to log a sequence in one call.
**Trade-off:**
- *Why "1-way door" mislabel:* additive widening of a Zod schema (string → string | string[]) is precisely the kind of additive change precedent #9 / D9 endorses elsewhere in this spec. The spec invokes precedent #9 to justify D1 schema extension but does not apply the same reasoning to D17. The asymmetry is unprincipled — the actual one-way door is *removing* support for arrays after agents come to depend on them, not adding support.
- *Why the debounce-coalescing argument is incomplete:* yes, 5 calls → 5 bullets via debounce. But each call costs (i) MCP round-trip latency, (ii) one shadow-write attempt + L2 commit retry surface, (iii) one `recordContributor` mutation, (iv) one HTTP body parse + truncate + identity extraction. Multi-step agent edits — common in this codebase's spec/report workflow — pay this 5× when the work was conceptually one operation. An array shape lets the agent batch.
- *What the array unlocks:* "Refactored auth section: extracted middleware helper, fixed token-refresh race, added 2 examples" — three intent bullets, one server call. Today this either becomes one summary at 50 chars (lossy) or three separate calls (wasteful + worse UX in the agent's tool-use loop).
- *What stays simple:* the storage shape doesn't change at all. `summaries: string[]` arrives, server pushes each into `summariesByDoc[docName]` (or the simpler flat shape from Finding 1).
- *Real one-way door consideration:* if v1 ships single-only and an agent integration starts to assume "one call = one bullet" semantics in its UX (e.g. Cursor's "I made 1 change to your doc"), shifting to array later is fine — single still works. If v1 ships array-supported and the codebase later wants to remove array support, *that's* the one-way door. The risk is asymmetric in favor of supporting array now.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D17 for user judgment. The "LOCKED 1-way door" framing overstates the cost of revision. Recommend: support both shapes in v1 (Zod union, additive in tool description). If the user prefers single-only for first-contact UX simplicity, demote D17 to DIRECTED (not LOCKED), document the explicit trigger to add array support (e.g. "if multi-step agent calls average >3 per debounce window"), and capture array in Future Work / Identified.

---

### [H] Finding 3: D15 silently flips rename/rollback row attribution from "Auto-save" to "Claude" — this is a 1-way door for users

**Category:** DESIGN
**Source:** DC2 (stakeholder gap) + DC3 (framing validity)
**Location:** §10 D15 (cited in §11 Q1/Q2 amendments), §16 SCOPE bullet for D15
**Issue:** The spec frames D15 as "positive externality" — rollback/rename rows in TimelinePanel become attributed to the calling agent instead of anonymous `"Auto-save"`. But this is a behavior change visible to *every existing user* the moment v1 ships, regardless of whether the agent provides a `summary`. Today: a user clicks "rollback to v3" via Claude → the timeline shows `"Auto-save"`. After v1: the same action shows `"Claude"`. No opt-out, no setting, no transition path. The spec presents this as a side benefit but does not treat it as the user-visible behavior change it is.
**Current design:** D15 LOCKED: "rename_document and rollback_to_version MCP tools gain agent identity passthrough; server handlers call extractAgentIdentity + recordContributor(primaryDocName, ..., summary ?? default). Rename/rollback rows in TimelinePanel become attributed to the calling agent (positive externality vs. today's anonymous 'Auto-save')."
**Alternative — three options the spec didn't enumerate:**
- *(a) Keep D15's identity plumbing but render rename/rollback rows the same as today (anonymous) when summary is absent.* The summary-absent rendering decision is independent of the identity-recording decision. This preserves zero regression for non-summary callers.
- *(b) Keep D15's full behavior but feature-flag it.* A workspace-level `attributeManagedActions: boolean` config in `.open-knowledge/config.yml` (default `true`). Users who relied on anonymity opt out.
- *(c) Restrict the attribution flip to `rename_document` only (where the agent typically authored the user's intent) and keep `rollback_to_version` anonymous.* Rollback is more often "user clicked the restore button via the agent" — attributing it to the agent might be wrong (the agent is a UI relay, not the actor).
**Trade-off:**
- *Who relies on anonymous rename/rollback?* Audit-trail-light scenarios: workspaces where the user wants to see "I (a human) restored to v3" without their AI tool's name plastered on the row. Compliance contexts where the agent is a tool and the user is the legal actor. Personal-mode users who prefer their TimelinePanel to read like *their* edit log, not their AI's collaborator log.
- *Why this is a 1-way door:* once shipped, every shadow commit produced post-v1 has agent-attributed rename/rollback rows. Reverting requires rewriting shadow history (impossible per existing project design — append-only attribution journal). Pre-v1 commits stay anonymous, post-v1 commits become agent-attributed — the timeline becomes a hybrid forever.
- *What evidence for "users want this"?* The spec's only justification is "positive externality." The workshop did not investigate whether any user actually wants attributed rename/rollback. The synthesis under [[F4]] / multi-agent workflows assumes attribution is universally desired but doesn't test it.
- *Consistency cost:* if rename/rollback get agent attribution, what about future MCP-mediated managed actions (e.g., `delete_document`, `archive_document`, `move_to_folder`)? Each becomes a new D15 cascade decision. The "always attribute, never anonymize" stance creates a precedent that's easier to ship than to reverse.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D15 as a user-judgment decision. Present the three options (always-attribute, attribute-when-summary-present, opt-out config) and surface that this is a default-behavior change for every existing user. The current spec presents it as an implementation detail of the summary feature when it is actually independent. Recommend: option (a) — keep identity plumbing internally but render attribution only when `summary` is non-empty. This preserves D15's value (renames/rollbacks with intent get full attribution) without flipping the default for the silent majority of summary-less invocations.

---

## Medium Severity

### [M] Finding 4: 50-char cap is closer to the UI overflow point than the spec acknowledges; 80 has stronger industry precedent

**Category:** DESIGN
**Source:** DC1 (simpler alternative — calibrate to actual constraint) + DC2 (stakeholder gap — frontend engineer)
**Location:** §10 D5/D20/D21, §6 FR2, §15 prior art F6
**Issue:** The spec selects 50 chars based on "GitHub Desktop IdealSummaryLength=50" precedent (F6). But (a) GitHub Desktop's `MaxSummaryLength=72` is a more honest upper bound that the spec ignores; (b) 50 chars ≈ ~325px in `text-xs` (the spec's chosen typography), and the TimelinePanel content area is ~298px (350px Sheet − 16px×2 padding − dot/gap). At 50 chars, real-world strings will routinely wrap or truncate; (c) Wikipedia uses 500 chars and is the closest semantic kin (free-form edit summaries surfaced in a list view); (d) The spec assumes the truncation rate target of <10% (M2) but provides no calibration data — typical agent-authored summaries (e.g. the kind Cursor or Claude Code would write) trend toward ~60-90 chars in observable practice (LLM-generated commit messages, PR titles).
**Current design:** D5 LOCKED: "truncate to 50 chars (49 + `…`)." D21 layered defense at Zod 200 → API 50.
**Alternative:** 80 chars — matches the conventional 50/72-or-80 commit-message split, fits comfortably within ~298px content area at text-xs (~12 chars buffer for safety), accommodates the natural agent-summary length distribution. Preserves the layered defense (Zod 200 → API 80).
**Trade-off:**
- *50-char wins:* more aggressive forcing function, scannable bullets, fits easily even at smaller viewport sizes.
- *80-char wins:* matches more industry precedent (Linux kernel commit conventions, PR title norms, ChatGPT/Claude generated text length distributions), fits the actual rendering canvas with margin, M2 truncation rate likely closer to <5% than the 50-char regime.
- *What the spec didn't measure:* the actual UI overflow point in pixels (not characters) at the chosen typography. CSS `truncate` already handles per-line overflow; the cap is a forcing function for *information density*, not a layout constraint. The right cap is "small enough to be scannable; large enough that agents don't clip mid-sentence" — this is a craft judgment with evidence on both sides, not a clear win for 50.
- *Layered defense alignment:* D21 keeps the Zod 200 hard cap regardless. Moving the API truncation to 80 doesn't weaken transport-level safety.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D5 / D20 / D21 for user judgment with concrete rendering evidence. Recommend producing 5 example bullets at 50 chars and 5 at 80 chars in the actual TimelinePanel mockup before locking. M2 (<10% truncation) is a post-ship signal — choose the cap that gives the best a-priori chance of hitting it.

---

### [M] Finding 5: Bullet rendering for coalesced commits hasn't been seriously evaluated against alternatives

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §10 D6 LOCKED, §3 NG6, §15 alternatives considered (line 277 mentions "(F) comma-joined" rejected)
**Issue:** D6 LOCKED selects bullet-list rendering with one summary per line. The "Alternatives considered" section (line 277) shows option (F) "comma-joined" was rejected. But three other alternatives that the workshop should have considered are absent:
- *(α) Collapsible bullet list:* render the *first* bullet plus a "+N more" expander (like the existing `WipGroup` "Show N auto-saves" pattern in TimelinePanel.tsx:120). User scans the leading bullet, expands when needed.
- *(β) Hover-expand single line:* render summaries comma-joined on one line, with full bullet expansion on row hover/click. Preserves the existing one-row-per-commit visual rhythm.
- *(γ) Overlay/popover:* timeline row stays compact (just the first bullet); clicking opens a popover with the full bullet list and per-bullet timestamp. Decouples scannability from row density.
**Current design:** D6 LOCKED: "bullet list per row; one summary per line; falls back to doc-list when no summaries."
**Alternative:** Any of α/β/γ above. The spec selected D6 based on "user selected this preview in workshop" but the workshop preview did not include collapsible/expand UX patterns that exist elsewhere in the same panel.
**Trade-off:**
- *D6 wins:* simplest to implement, most accessible (pure DOM list, no interaction), each bullet is glanceable.
- *D6 loses:* coalesced commits with 5-10 bullets eat vertical real estate. The 350px-wide panel becomes a long scrolling column when many WIP commits accumulate. The existing `WipGroup` pattern collapses N auto-saves to one line for exactly this reason — D6 inverts that discipline at the row level.
- *FR13 tries to mitigate but is "Could":* the spec's FR13 ("show up to N bullets with +M more expander") is exactly option (α), but it's classified as "Could" deferred. The very mitigation D6 needs is itself deferred — meaning v1 ships the failure mode.
- *Existing precedent in this same component:* `WipGroup.tsx:124-126` already uses "Show N auto-saves" for collapsing — copying that pattern at the row level is a one-evening implementation cost. Skipping it bets that v1 commits will average 1-2 bullets, but D2's coalescing acknowledgment ("high-volume agents may produce verbose rows") indicates the bet is risky.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D6 to evaluate option (α) — collapsible bullet list with first bullet visible and "+N more" expander — as the v1 default. Cost: ~10 lines in EntryRow. Mitigates D2's known risk without deferring to FR13.

---

### [M] Finding 6: D3 "optional with nudge" + adoption target ≥30% accepts a likely failure mode without contingency

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §10 D3 DIRECTED, §7 M1 metric, §15 ByteRover prior art F6
**Issue:** D3 picks optional+nudge over required, with a stated target of "≥30% adoption." This means the spec accepts a 70% failure rate for the M1 metric as a possibility before triggering revisit. ByteRover (the closest semantic kin per F6) uses *mandatory* `reason` per atomic op — a deliberate departure that the spec's prior-art note acknowledges but doesn't engage with. The spec leans on three claims to justify optional: (i) friction tax on trivial edits, (ii) backward compat with existing agent integrations, (iii) tool-description nudge will move agents to comply.
**Current design:** D3 DIRECTED: "Optional `summary` with strong tool-description nudge; not required... If adoption <30% post-ship, revisit (potentially structured intent OR softer required)."
**Alternative — three sub-options:**
- *(A) Required for `write_document` + `edit_document`; optional for `rename_document` + `rollback_to_version`:* the latter two have natural defaults (D7/D8) so adoption is guaranteed. The former two are where adoption matters and where the M1 risk lives. This is graduated requirement aligned to where the value lives.
- *(B) Required for first call in a session, optional after:* graduate the friction. First write per session forces the agent to internalize the API; subsequent calls can self-judge.
- *(C) Optional but failed-write returned by server when summary absent AND content-change is non-trivial (>N tokens added/removed):* server-side guard that lets typo fixes pass anonymously but forces summary on substantive edits. Reverses the burden — the server, not the agent, decides what counts as trivial.
**Trade-off:**
- *Why D3 might fail:* tool descriptions in this repo are already >300 words each (NG4, line 408). Adding a "summary" param with strong nudge is one more bullet in a long list. Real-world adoption of optional MCP params trends low — the existing `offset` param on `edit_document` (a useful disambiguator) is rarely supplied by agents.
- *Why required-for-some is worth considering:* the M1 ≥30% target is *itself* an admission that optional probably won't work well. If the spec's success path requires <30% adoption to trigger revisit, the spec is essentially shipping a known-incomplete intervention with a measurement plan. The cost of "required for write/edit only" is one breaking change in the MCP API at the start vs. a shipped-and-revised cycle later.
- *Backward compat counter-argument:* "breaks existing agent integrations." But every agent integration in this codebase passes through Open Knowledge's own MCP toolchain — there are no third-party integrations relying on the current optional shape. The "backward compat" cost is hypothetical.
**Status:** CHALLENGED
**Suggested resolution:** Reopen D3 for user judgment. The spec's revisit-trigger acknowledges the optional posture is a bet; the bet's downside is shipping a feature with low-signal adoption that produces sparse timelines. Recommend: explicitly evaluate option (A) — required for write/edit, optional for rename/rollback. If user prefers optional, document the explicit revisit cadence (e.g. "measure M1 weekly for 4 weeks; auto-promote to required if <30% by week 4") rather than open-ended "revisit later."

---

### [M] Finding 7: Decoupling `summary` from `ActivityEntry.description` (NG10) defers an integration whose cost only grows

**Category:** DESIGN
**Source:** DC1 (simpler alternative — consolidate now while channels are small)
**Location:** §3 NG10, §10 D13 DIRECTED, evidence/worldmodel-synthesis F2
**Issue:** The spec's NG10 / D13 decouple `summariesByDoc` from `ActivityEntry.description`. The reasoning: presence channels are ephemeral, shadow `ok-contributors:` is durable, "different concerns." But the F2 evidence shows `ActivityEntry.description` is *currently* auto-populated as `"Added (${agentName}): ${content.slice(0, 50)}"` — this is a generated 50-char "summary" field that nobody reads. The shape is structurally identical to what v1 wants to add. Decoupling preserves two parallel code paths (one auto-derived presence summary, one agent-provided durable summary) that converge in user-facing semantics ("what just happened in agent terms?").
**Current design:** D13 DIRECTED: "Decouple summariesByDoc from existing ActivityEntry.description channel — keep them independent in v1." NG10: "v1 keeps the channels independent — presence is ephemeral, shadow ok-contributors: is durable."
**Alternative:** When agent provides `summary`, populate `ActivityEntry.description` with the same value (rather than the auto-derived `content.slice(0, 50)` placeholder). The Y.Map activity TTL of 30s naturally bounds presence consumption; the durable shadow log still gets the canonical record.
**Trade-off:**
- *Spec's choice wins:* avoids coupling design today; future flash-tooltip can wire it independently when the consumer materializes (Cluster A activity sidebar, F5).
- *Spec's choice loses:* (i) every future write surface that produces a summary now has to remember "set both, in sync"; (ii) the "presence vs. durable" distinction is real but narrow — the user-facing semantic (`agent intent`) is identical, and the spec is creating two fields where one would do; (iii) `ActivityEntry.description` is currently dead code (written but not read) — fixing that dead code in v1 by routing `summary` into it is cheaper than creating a parallel field; (iv) the natural future consumer (Cluster A activity sidebar per F5 / [[specs/2026-04-21-multi-agent-presence/SPEC]]) is already in flight — wiring `summary` into the existing presence channel now positions v2 to consume it without another migration.
- *Bias check:* the spec's reasoning ("decouple to avoid coupling") is the kind of decision that compounds. Every future "should this go in presence or durable?" question gets answered by reading D13 and concluding "decouple, just in case." That's how schema-bloat happens — by avoiding consolidation when consolidation is cheap.
- *Real cost of unifying:* one extra line in `recordContributor` (call into the Activity Y.Map alongside the contributor-tracker push). Roughly 5-10 LOC. The "different lifetimes" argument is true but doesn't preclude shared content.
**Status:** CHALLENGED
**Suggested resolution:** Reopen NG10 / D13 with the question: "What's the cost today of routing `summary` into both channels vs. the cost in 6 months when Cluster A activity sidebar wants to consume it?" The spec's answer is implicit ("future-deferrable") but doesn't show the work. Recommend: at minimum, when a summary IS provided, route it into `ActivityEntry.description` to replace the auto-derived placeholder. This is one-line consolidation with no architectural commitment — the channels stay independent at the schema level, but the data flow converges where the data is identical.

---

## Low Severity

### [L] Finding 8: Precedent #9's "schema is add-only" applies to ProseMirror schema, not commit-message JSON — D9's invocation is approximate

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §10 D9 LOCKED, evidence/code-trace lines 184-196
**Issue:** D9 cites precedent #9 ("schema is add-only forever") as the rationale for additive `summariesByDoc` without a v-bump. But precedent #9 specifically addresses ProseMirror schema evolution and `y-prosemirror`'s destructive-delete behavior on schema-throw — the rationale is CRDT-permanent multi-peer broadcast loss. Commit-message JSON parsing has none of those failure modes; it's a plain JSON object parsed by `parseContributors` with `try/catch` swallowing malformed entries. The precedent is being invoked for its conclusion ("don't break schemas") without the underlying mechanism applying.
**Current design:** D9: "No v-bump on ok-contributors: JSON line; summariesByDoc is purely additive... Per [[precedent#9]] schema-add-only."
**Alternative — observation only:** the codebase already has prior art for explicit version-prefix bumps in shadow-log JSON: `OK_CHECKPOINT_PREFIX = 'ok-checkpoint-v1: '` in `packages/core/src/shadow-repo-layout.ts:162`. The pattern is "new prefix when shape changes nontrivially." `ok-contributors:` (no `-v1` suffix) is the legacy pre-versioning shape; a v-bump path exists if v2 wanted a clean break. The spec's choice to extend additively is fine, but the *justification* lean on precedent #9 is approximate — the actual reason is "the change is small enough that legacy-tolerance + forward-tolerance combined is cheaper than dual-prefix."
**Trade-off:** None — D9's outcome (additive) is the right v1 choice. The finding is editorial: cite the actual rationale (small additive change, parser tolerance both directions, simpler than dual-prefix for one field) rather than invoking precedent #9 whose mechanism doesn't apply.
**Status:** CHALLENGED
**Suggested resolution:** Update D9's rationale text to cite the parser-tolerance pattern directly. Note `ok-checkpoint-v1:` in the codebase as the prior art for explicit version prefixes — this gives future cascading decisions (per-bullet author identity, structured intent) a known v-bump path if additive growth becomes untenable.

---

### [L] Finding 9: NG2 dismisses agent-supplied + server-augmented hybrid without engaging with the strongest version

**Category:** DESIGN
**Source:** DC1 (simpler alternative — hybrid often wins over either pole)
**Location:** §3 NG2 NEVER, §15 alternatives considered (C)
**Issue:** NG2 NEVER rejects "Server-side auto-generation of summaries from diffs" with the rationale "the whole point is *agent intent*, not structural diff description. Diff descriptions are noise." This is true but doesn't engage with a hybrid: agent provides intent ("Fixed token-refresh race"), server appends structural metadata ("(+12 lines, -3 lines)"). The augmentation is non-replacing — the agent's intent stays primary, the structural hint is supplementary.
**Current design:** NG2 NEVER: "The whole point is agent intent, not structural diff description. Diff descriptions are noise."
**Alternative:** When `summary` is provided, server appends a short structural hint to the rendered bullet: `"Fixed token-refresh race (+12, -3)"`. The hint is rendering-time only (not stored in the JSON), keeping the schema clean. Agents can toggle off via response hint ("set `omitDiffStats: true` to suppress").
**Trade-off:**
- *Why NG2 holds:* agents who don't summarize would get pure diff descriptions, which the spec rightly considers noise.
- *Why hybrid is worth considering:* when summary IS provided (the case where adoption succeeds), the structural hint adds quantitative grounding without diluting intent. A reader scanning bullets distinguishes "Fixed typo (+1, -1)" from "Restructured auth (+200, -150)" at a glance — useful signal that the agent's prose alone doesn't carry.
- *Why the spec's framing rejects too much:* NG2 conflates "auto-generate summary" (correctly rejected) with "augment provided summary with diff stats" (a different proposal). The latter is closer to GitHub's PR row UX (title + add/del stats) than to "diff descriptions as primary."
**Status:** CHALLENGED
**Suggested resolution:** Narrow NG2's NEVER scope to "auto-generate summary text in absence of agent input." Move "augment provided summary with diff stats" to NOT NOW with explicit revisit triggers. The spec's rejection is broader than the rationale supports.

---

## Confirmed Design Choices (summary)

These survived the three lenses with no credible challenge:

**DC1 (simpler alternative):**
- D2 (15-30s L2 debounce coalescing) — preserves existing commit cardinality; the alternative (no coalescing) would explode shadow git history.
- D11 (post-ship instrumentation, M1+M2 counters) — cheap, drives the optional/required revisit trigger.
- D12 (`exec` enrichment carries summaries automatically) — pure positive externality; no opt-out needed because the field is additive.
- D14 (PII/secrets hint in tool descriptions) — Wikipedia precedent, cheap insurance.

**DC2 (stakeholder gap):**
- The Risks & Mitigations table covers R3 (rename/rollback wiring cost), R5 (schema lock-in), R6 (env stale during iteration). SRE/security boundaries are appropriately bounded — no auth surface change, summary inherits existing trust boundary.
- Backward compat is the load-bearing invariant and is appropriately defended (FR5, additive parser, A5 assumption verified from code).

**DC3 (framing validity):**
- The SCR problem statement holds. The Complication ("rows convey *who* and *which doc* but not *what*") is grounded in the actual TimelinePanel.tsx:256-264 rendering, and the L2 debounce coalescing is verified at persistence.ts:164. The intersection (scannability tax × MCP scaling × existing journal infrastructure) is real and not post-hoc.
- G2 (zero regression for legacy commits) is correctly load-bearing.
- NG3 (no side-channel storage) — single source of truth argument is sound.
- NG7 (don't fix "History unavailable" here) — appropriately scoped out.
- NG8 / NG11 (don't carry into project-git via save-version) — appropriately deferred; F3 evidence supports.

**Coverage note:** DC1/DC2/DC3 were each applied to every load-bearing decision in the Decision Log. Findings above are where a credible alternative emerged, not where the spec passes scrutiny — most decisions held.
