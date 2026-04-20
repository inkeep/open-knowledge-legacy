# Audit Findings

**Artifact:** /Users/edwingomezcuellar/projects/open-knowledge/reports/yjs-14-ecosystem-adoption/REPORT.md
**Audit date:** 2026-04-16
**Total findings:** 14 (4 high, 5 medium, 5 low)

---

## High Severity

### [H] Finding 1: Two evidence files referenced by REPORT.md do not exist

**Category:** COHERENCE + FACTUAL
**Source:** L4 (evidence-synthesis fidelity), T2 (file-system verification)
**Location:** REPORT.md lines 110, 211, 366 (D2 and D6 finding headers + References section)
**Issue:** The REPORT cites two evidence files that are not present in the evidence directory, yet claims their dimensions are CONFIRMED in the rubric (lines 62-68).
**Current text (REPORT.md:110):** `**Evidence:** [evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md](evidence/y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md)`
**Current text (REPORT.md:211):** `**Evidence:** [evidence/open-knowledge-yjs-consumption-surface.md](evidence/open-knowledge-yjs-consumption-surface.md)`
**Evidence:** `ls /Users/edwingomezcuellar/projects/open-knowledge/reports/yjs-14-ecosystem-adoption/evidence/` returns only 5 files:
- hocuspocus-features-vs-y-websocket-server.md
- tiptap-collab-packages-source-trace.md
- y-codemirror-vs-y-codemirror-source-diff.md
- yjs-14-maintainer-roadmap-and-signals.md
- yjs-core-v13-vs-v14-source-diff.md

Both `y-prosemirror-v1-vs-y-prosemirror-v2-source-diff.md` and `open-knowledge-yjs-consumption-surface.md` are missing. This means D2 (y-prosemirror diff) and D6 (1P consumption surface) are marked CONFIRMED in the rubric without their linked evidence artifacts existing. The References section at line 366 enumerates them as "all written 2026-04-16, source-traced" — not true.
**Status:** UNVERIFIABLE (for the missing-evidence-file claims) / INCOHERENT (rubric marks CONFIRMED without evidence)
**Suggested resolution:** Either (a) locate the missing evidence files (possibly written in a different location during subagent runs) and place them under `evidence/`, or (b) mark D2 and D6 as "evidence file missing" and downgrade their rubric status to UNVERIFIED until re-traced.

---

### [H] Finding 2: REPORT incorrectly claims `@y/prosemirror@2.0.0-2` has no yUndo and yCursor plugins

**Category:** FACTUAL
**Source:** T3 (3P dependency verification via direct npm tarball inspection)
**Location:** REPORT.md line 46 (Executive Summary bullet 8); evidence file `y-codemirror-vs-y-codemirror-source-diff.md` line 398; evidence file `tiptap-collab-packages-source-trace.md` line 414
**Issue:** The REPORT states "yUndo and yCursor plugins are not yet ported" in `@y/prosemirror@2.0.0-2`, and cites keys.js having them commented out. This is factually contradicted by direct source inspection of the published npm tarball.
**Current text (REPORT.md:46):** "**`@y/prosemirror@2.0.0-2` re-implements y-prosemirror with delta-based architecture.** `updateYFragment` is GONE, replaced by `nodeToDelta` + `deltaToPSteps`. **yUndo and yCursor plugins are not yet ported.**"
**Evidence:**
- Downloaded `@y/prosemirror@2.0.0-2` tarball from `https://registry.npmjs.org/@y/prosemirror/-/prosemirror-2.0.0-2.tgz`
- `package.json#main` is `./dist/y-prosemirror.cjs`; `package.json#exports['.'].import` is `./src/y-prosemirror.js` (not `./src/index.js`)
- `src/y-prosemirror.js` contents verbatim:
  ```
  export * from './plugins/cursor-plugin.js'
  export { ySyncPlugin, isVisible, getRelativeSelection, ProsemirrorBinding, updateYFragment } from './plugins/sync-plugin.js'
  export * from './plugins/undo-plugin.js'
  export * from './plugins/keys.js'
  ...
  ```
- `src/plugins/undo-plugin.js` is 125 LOC and exports `undo`, `redo`, `yUndoPlugin`, `defaultProtectedNodes`, `defaultDeleteFilter`, etc.
- `src/plugins/cursor-plugin.js` is 267 LOC and exports `yCursorPlugin`, `defaultAwarenessStateFilter`, `defaultCursorBuilder`, `defaultSelectionBuilder`, `createDecorations`.
- `src/plugins/keys.js` exports all three keys, including `yUndoPluginKey` and `yCursorPluginKey` — NOT commented out (evidence file claim of "commented-out stub at keys.js:11-23" is incorrect for the published package).
- Additional "`updateYFragment` is GONE" claim is also wrong — `src/y-prosemirror.js` line 2 explicitly re-exports `updateYFragment` from `./plugins/sync-plugin.js`.

The evidence files appear to have confused the `yjs/y-prosemirror` GitHub `upgrade-y` branch (PR #208, an unfinished alpha in active development) with the actually-published `@y/prosemirror@2.0.0-2` tarball on npm. These are different source trees.
**Status:** CONTRADICTED
**Suggested resolution:** Re-trace `@y/prosemirror@2.0.0-2` from the npm tarball (not from the GitHub `upgrade-y` branch) and correct:
1. REPORT.md line 46 — remove "yUndo and yCursor plugins are not yet ported" OR add version/branch conditionality ("on the experimental `upgrade-y` branch" vs the published package)
2. REPORT.md line 267 — remove "NOT YET PORTED in @y/prosemirror v2.0.0-2" for cursor plugin
3. Evidence files' assertions about `updateYFragment` being gone / keys commented out

This materially changes the migration-cost estimate in D4 §10.2 (REPORT.md line 175): "**Estimated 1-2 months focused work**" is based partly on "port cursor + undo plugins from y-prosemirror@1.3.7" — if those plugins are already in `@y/prosemirror@2.0.0-2`, the fork cost is smaller.

---

### [H] Finding 3: Internal count inconsistency — "1 PRESENT / 4 PARTIAL / 12 ABSENT" vs evidence "1 / 3 / 13" vs summary-table count "4 / 6 / 7"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L7 (source attribution)
**Location:** REPORT.md lines 44, 185, 193-196 (Executive Summary + D5 header + D5 details); evidence `hocuspocus-features-vs-y-websocket-server.md` lines 22-23, summary table lines 869-888
**Issue:** The headline claim "missing 12 of 17 Hocuspocus features" surfaces three different counts across the artifact stack:
- REPORT.md line 44: "**missing 12 of 17 Hocuspocus features we use.**"
- REPORT.md line 185: "1 is PRESENT in @y/websocket-server, 4 are PARTIAL, **12 are ABSENT**."
- REPORT.md line 196: "**ABSENT (12):** onStoreDocument debounce/mutex/skipStoreHooks, afterLoadDocument, onAuthenticate + queue-during-auth, openDirectConnection + DirectConnection.disconnect, broadcastStateless/CC1, Connection per-conn ordered queue, extensions API + 23-hook dispatcher, etc." → enumerated items count to 7 distinct features, not 12.
- Evidence file §0 lines 22-23: "**PRESENT: 1 | PARTIAL: 3 | ABSENT: 13**" (total 17 ✓)
- Evidence file §18 summary table (lines 869-888): by classifying each of the 17 rows, actual counts are PRESENT=4, PARTIAL=6, ABSENT=7 (total 17 ✓).

Three different categorizations for the same 17 capabilities, none of which agree. The REPORT's figure ("12 ABSENT") doesn't match either the evidence-file headline (13 ABSENT) or the evidence-file summary table (7 ABSENT). The classification is internally incoherent.
**Evidence:** Summary table in evidence lines 869-888 has 4 rows classified PRESENT (#11 awareness, #13 synced event, #14 status event, #17 y-protocols-vs-y-protocols), 6 rows PARTIAL (#1, #2, #6, #9, #12, #15), 7 rows ABSENT (#3, #4, #5, #7, #8, #10, #16).
**Status:** INCOHERENT
**Suggested resolution:** Reconcile to a single canonical count. Decide whether "PRESENT" includes both server-side and client-side capabilities (if split, produce two tables: server-only vs client-only). If the headline number becomes "12 missing," enumerate all 12 explicitly (the prose at line 196 attempts this but counts to 7 items). The simplest fix: use the summary-table counts (4/6/7) and update the REPORT headline and D5 intro to match.

---

### [H] Finding 4: Unsupported "Zero of ~60 surveyed production users have migrated" claim

**Category:** FACTUAL
**Source:** L7 (inline source attribution)
**Location:** REPORT.md line 41 (Executive Summary bullet 3)
**Issue:** The REPORT asserts that "Zero of ~60 surveyed production users have migrated" — but no evidence file contains a survey, survey methodology, list of 60 users, or any traceable primary source. The closest adjacent evidence is the npm-downloads ratio (adoption = 0.275%) and the ecosystem-signals table in `yjs-14-maintainer-roadmap-and-signals.md` §5h (which covers 10 projects, not 60).
**Current text:** "`y-prosemirror`: 701K vs `@y/prosemirror`: **9 weekly**. `y-codemirror.next`: 30.5K vs `@y/codemirror`: **4**. Zero of ~60 surveyed production users have migrated."
**Evidence:** `grep "60 surveyed|survey"` against the full report directory returns only this one hit in REPORT.md. No survey exists.
**Status:** UNVERIFIABLE
**Suggested resolution:** Either (a) replace with a claim grounded in the 10-project ecosystem table (§5h of maintainer-roadmap evidence) — e.g. "Of 10 surveyed downstream projects [Hocuspocus, TipTap, Liveblocks, partykit, AFFiNE, BlockSuite, BlockNote, Outline, y-tiptap], only BlockNote is publicly committed to Yjs 14"; or (b) drop the "~60" number entirely and keep just the npm-downloads ratio which is verifiable.

---

## Medium Severity

### [M] Finding 5: "rc.12 and rc.13 ... ~14 hours apart" is imprecise (actual: ~9 hours)

**Category:** FACTUAL
**Source:** T4 (web/GitHub verification)
**Location:** REPORT.md line 241 (D7 first bullet); evidence `yjs-14-maintainer-roadmap-and-signals.md` line 57
**Issue:** The REPORT claims rc.12 and rc.13 were published ~14 hours apart. Direct verification via `gh release view` shows rc.12 was published 2026-04-14T14:29:06Z and rc.13 was published 2026-04-14T23:31:15Z — a gap of ~9 hours and 2 minutes, not ~14 hours.
**Current text:** "rc.12 and rc.13 ship without release notes (bot-published, ~14 hours apart)."
**Evidence:** `gh release view v14.0.0-rc.13 --repo yjs/yjs` → published 2026-04-14T23:31:15Z; `gh release view v14.0.0-rc.12` → published 2026-04-14T14:29:06Z. Difference: 9h 2m.
**Status:** CONTRADICTED (minor)
**Suggested resolution:** Change "~14 hours apart" to "~9 hours apart" — low impact but verifiable.

---

### [M] Finding 6: FOSDEM 2026 abstract says "preview upcoming functionality," not "production-ready timeline"

**Category:** FACTUAL / L2 (confidence-prose misalignment)
**Source:** T5 (external claim verification via WebFetch of FOSDEM event page)
**Location:** REPORT.md line 354 (Open Questions section)
**Issue:** The REPORT asks "What's BlockNote's Yjs 14 ship-date? Their FOSDEM 2026 talk implied production-ready timeline." The FOSDEM abstract actually says "preview upcoming functionality" which is notably weaker than a "production-ready timeline" implication.
**Current text:** "**What's BlockNote's Yjs 14 ship-date?** Their FOSDEM 2026 talk implied production-ready timeline. Worth tracking."
**Evidence:** WebFetch of https://fosdem.org/2026/schedule/event/8VKQXR-blocknote-yjs-prosemirror/ returns abstract: "preview upcoming functionality for Attributed Version History (who wrote what, and when?) and Track Changes (suggestions)." The maintainer-roadmap evidence file line 81 correctly calls this wording out as "upcoming functionality... preview" rather than "released" or "ready" — but that nuance is lost in REPORT.md line 354.
**Status:** INCOHERENT (internal mis-characterization — evidence is correct, REPORT summary overstates)
**Suggested resolution:** Change "implied production-ready timeline" to "previewed v14 attribution features" to match the abstract wording and the evidence file's own reading.

---

### [M] Finding 7: REPORT claim "No runtime guard collision" reconciliation is clear, but surrounding prose is confusing about which codebase has the guard

**Category:** COHERENCE (L2 / L4)
**Source:** T2 (direct source inspection of `@y/y@14.0.0-rc.13` and `@hocuspocus/server` node_modules)
**Location:** REPORT.md lines 96-97 (D1 implications); REPORT.md line 190 (D5 key facts)
**Issue:** The user's prompt flagged conflicting signals about `__$YJS14$__`. The REPORT does reconcile this correctly if read carefully — but the reconciliation could be clearer. My verification confirms:
- `@y/y@14.0.0-rc.13/src/index.js:45` DOES have `const importIdentifier = '__ $YJS14$ __'` — the v14 guard exists ✓
- `yjs@13.6.30/src/index.js:116` has `const importIdentifier = '__ $YJS$ __'` — v13 guard exists ✓
- `grep -rn "YJS14\|__\$YJS" node_modules/@hocuspocus/{server,provider,common}/src/` returns zero hits — Hocuspocus has NO YJS14 guard ✓

So the evidence is consistent: Yjs v14 HAS the guard, Hocuspocus DOES NOT. Two different codebases, two different questions. The REPORT says at line 97 "Earlier evidence claiming a `__$YJS14$__` blocking guard was overstated" — but the overstatement is specifically that the guard would *block* dual-load (it doesn't — it just logs a warning on same-major dual-load, not on v13+v14 dual-load because they're different keys). The guard IS present in v14; it just doesn't do what the overstatement claimed.
**Current text (REPORT.md:190):** "**No `__$YJS14$__` runtime guard exists in Hocuspocus.**"
**Current text (REPORT.md:96-97):** "**No runtime guard collision** — v13 uses `'__ $YJS$ __'`, v14 uses `'__ $YJS14$ __'` (different strings, no collision). Dual-load triggers ZERO warning even though `instanceof` checks across versions silently fail. Earlier evidence claiming a `__$YJS14$__` blocking guard was overstated."
**Evidence:** Direct source read verified in both repositories.
**Status:** CONFIRMED (REPORT text is technically accurate; just worded in a way that could mislead on first read)
**Suggested resolution:** Consider adding a single reconciling sentence: "The `__$YJS14$__` guard IS present in `@y/y`'s source but does NOT prevent v13+v14 dual-load (keys differ). It is NOT present in Hocuspocus at all." This resolves the "conflicting signals" the user prompt flagged, making the reconciliation explicit.

---

### [M] Finding 8: Maintainer-roadmap evidence is mildly stale on Hocuspocus rc dates (pre-dates rc.3/4/5 publish)

**Category:** FACTUAL / L3 (missing conditionality / staleness)
**Source:** T4 (npm registry)
**Location:** `yjs-14-maintainer-roadmap-and-signals.md` lines 11-12 (dateline block)
**Issue:** The evidence file declares "Latest Hocuspocus preview release: v4.0.0-rc.2 (published 2026-04-15)" but the npm registry shows rc.2 was published 2026-04-08, and rc.3/rc.4/rc.5 all published 2026-04-16 (today of the audit). The evidence file's Hocuspocus rc dates are stale/wrong by a few hours-to-days. The REPORT does reference rc.5 (line 245) in the D7 key facts section — so the REPORT text is actually more current than its own evidence dateline.
**Current text (evidence):** "Latest Hocuspocus preview release: v4.0.0-rc.2 (published 2026-04-15)"
**Evidence:** `curl https://registry.npmjs.org/@hocuspocus/server` shows:
- 4.0.0-rc.0: 2026-03-16
- 4.0.0-rc.1: 2026-03-30
- 4.0.0-rc.2: 2026-04-08  (not 2026-04-15 as the evidence claims)
- 4.0.0-rc.3: 2026-04-16
- 4.0.0-rc.4: 2026-04-16
- 4.0.0-rc.5: 2026-04-16
**Status:** STALE
**Suggested resolution:** Update evidence dateline to reflect rc.5 as latest (2026-04-16). Since the REPORT already references rc.5, the main change is fixing the evidence file's pre-dated rc.2 claim.

---

### [M] Finding 9: "8 days ago" math is correct but accidental claim-bundling risks staleness

**Category:** FACTUAL / L3 (conditionality)
**Source:** T4 (npm registry)
**Location:** REPORT.md line 47 (Executive Summary bullet 9)
**Issue:** REPORT states "`@tiptap/y-tiptap@3.0.3` was published 2026-04-08 (8 days ago) STILL pinning `yjs ^13.5.38`." The math is correct today (2026-04-16 - 2026-04-08 = 8 days) but bundling a derived "N days ago" figure into a factual finding makes the report self-dating. Any reader accessing this report later will see stale math.
**Current text:** "`@tiptap/y-tiptap@3.0.3` was published 2026-04-08 (8 days ago) STILL pinning `yjs ^13.5.38`."
**Evidence:** `npm view @tiptap/y-tiptap@3.0.3 time` returns 2026-04-08T09:25:00Z ✓.
**Status:** CONFIRMED (but L3 pattern warning)
**Suggested resolution:** Convert "(8 days ago)" to an absolute date reference: "published 2026-04-08 (8 days before this report's publication date of 2026-04-16)". Minor wording nit.

---

## Low Severity

### [L] Finding 10: "281 LOC" vs actual 280 LOC for @y/websocket-server/src/utils.js

**Category:** FACTUAL
**Source:** T2 (direct tarball inspection)
**Location:** REPORT.md line 44 (Executive Summary bullet 6); evidence `hocuspocus-features-vs-y-websocket-server.md` line 14, §0
**Issue:** Both the REPORT and the evidence say "@y/websocket-server@0.1.5 is a 281-LOC starter" and "281 LOC" in multiple places. My `wc -l /tmp/audit-yjs14/ywss/package/src/utils.js` returned 280. Off by one. Probably a rounding artifact from a trailing newline or prior version.
**Current text:** "**`@y/websocket-server` is a 281-LOC starter**"
**Evidence:** `wc -l` = 280. The REPORT's count is off by 1.
**Status:** CONFIRMED (rounding error only)
**Suggested resolution:** Either ignore (within rounding tolerance for a starter-LOC headline) or update to "280 LOC". Low priority.

---

### [L] Finding 11: "2,000-LOC framework rewrite" vs "~1,850 server LOC + ~250 client-side" internal count drift

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** REPORT.md line 54 (Net practical implication); REPORT.md line 202 (D5); evidence summary table line 889
**Issue:** The REPORT says multiple things about the rewrite cost on `@y/websocket-server`:
- REPORT.md line 44: "Estimated ~1,850 server LOC + ~250 client to recover what Hocuspocus rc.1 ships in 3,000+ LOC"
- REPORT.md line 54: "~2,000-LOC framework rewrite"  
- REPORT.md line 197: "~1,850 server LOC + ~250 client-side"
- REPORT.md line 202: "~2,000-LOC framework rewrite"
- Evidence §0 line 25 (narrative): "~2,000–2,800 LOC of net-new server framework code" (a range)
- Evidence §18 summary table line 889: "**~1,850 server LOC + ~250 client-side stateless**" (total 2,100)

Two non-aligned numbers (2,000 vs 1,850+250=2,100) are used interchangeably. The "~2,000" framing likely rounds the "1,850+250=2,100" figure, but the inconsistency is visible.
**Status:** INCOHERENT (minor)
**Suggested resolution:** Pick one canonical figure ("~2,100 LOC total: ~1,850 server + ~250 client") and use it consistently.

---

### [L] Finding 12: "rc.0 → rc.13 spans 2026-02-25 → 2026-04-14 (48 days)" verified

**Category:** CONFIRMED
**Source:** T4
**Location:** REPORT.md line 48
**Issue:** Math check. `(2026-04-14) - (2026-02-25)` via `python3 datetime.date`: 48 days exactly. ✓
**Status:** CONFIRMED
**Suggested resolution:** None — claim is accurate.

---

### [L] Finding 13: Adoption ratio arithmetic verified

**Category:** CONFIRMED
**Source:** T4 (npm API + arithmetic)
**Location:** REPORT.md line 41
**Issue:** `9822 / 3566137 * 100 = 0.2754...%` → rounds to "0.275%" as claimed. ✓
**Status:** CONFIRMED
**Suggested resolution:** None.

---

### [L] Finding 14: dmonad quote on issue #751 verified verbatim

**Category:** CONFIRMED
**Source:** T5 (GitHub API)
**Location:** REPORT.md line 42; evidence `yjs-14-maintainer-roadmap-and-signals.md` lines 96-100
**Issue:** Verbatim quote verification via `gh issue view 751 --repo yjs/yjs --comments`. The quoted text matches the live issue comment exactly. Date 2025-11-30T23:15:55Z confirmed.
**Status:** CONFIRMED
**Suggested resolution:** None.

---

## Confirmed Claims (summary)

Claims verified via factual tracks, not called out individually in High/Medium/Low above:

**T4 (web/GitHub API verification) confirmed:**
- yjs weekly downloads = 3,566,137 ✓
- @y/y weekly downloads = 9,822 ✓
- y-prosemirror weekly downloads = 701,459 ✓
- @y/prosemirror weekly downloads = 9 ✓
- y-codemirror.next weekly downloads = 30,501 ✓
- @y/codemirror weekly downloads = 4 ✓
- loro-crdt weekly downloads ~23.5K (evidence) — not independently re-verified in this audit
- dmonad issue #751 quote + date ✓
- FOSDEM 2026 talk speakers (Yousef El-Dardiry + Nick Perez), ZenDiS + DINUM funding attribution ✓
- `@tiptap/y-tiptap@3.0.3` publish date 2026-04-08 and `peerDependencies.yjs: ^13.5.38` ✓
- `@hocuspocus/server@4.0.0-rc.0` through `-rc.5` all declare `peerDependencies.yjs: ^13.6.8` ✓
- Yjs repo has no MIGRATION.md / RELEASE_NOTES_V14.md / ROADMAP.md ✓
- RC cadence dates (rc.0 = 2026-02-25, rc.13 = 2026-04-14, 48-day span) ✓

**T1/T2 (own codebase + OSS repo source code) confirmed:**
- `@y/y@14.0.0-rc.13/src/index.js:45` has `const importIdentifier = '__ $YJS14$ __'` ✓
- `yjs@13.6.30/src/index.js:116` has `const importIdentifier = '__ $YJS$ __'` ✓
- `@hocuspocus/server@4.0.0-rc.1/src/` has zero `__$YJS14$__`-class guards ✓
- `@hocuspocus/server/src/Hocuspocus.ts:3, MessageReceiver.ts:13, Document.ts:7` all `import from "yjs"` (not `@y/y`) — confirms the structural-incompatibility wall claim ✓
- `@y/websocket-server@0.1.5/src/utils.js:1` imports `from 'yjs'` (legacy package name) while `@y/websocket@4.0.0-rc.2/src/y-websocket.js:6` imports `from '@y/y'` — confirms the upstream "split-brain naming" claim ✓
- `patches/y-prosemirror@1.3.7.patch` only modifies `node_modules/y-prosemirror/` — confirmed ✓
- `node_modules/@tiptap/y-tiptap/dist/y-tiptap.js` is 2250 LOC, has no `rawMdxFallback` substitution, has raw `el._item.delete(transaction)` at line 862 ✓ (patch coverage gap on y-tiptap validated)
- `@y/websocket-server@0.1.5` has no `broadcastStateless`, no `openDirectConnection`, no per-doc storeDocument debounce — validates 3 of the "ABSENT" feature claims ✓
- Node >=22 engines.node requirement on `@y/y@14.0.0-rc.13` ✓
- `lib0 ^1.0.0-rc.12` dependency on `@y/y@14.0.0-rc.13` ✓

**L1-L6 (coherence lenses) passes:**
- L1: No direct cross-section contradictions beyond the count-mismatch in Finding 3
- L2: Confidence calibrated to evidence throughout (Finding 6 is the one lapse, medium)
- L3: Conditionality generally well-scoped (Finding 9 raised the self-dating nit)
- L5: Executive Summary is well-aligned with detailed findings (aside from the enumerated-vs-counted 12 ABSENT mismatch in Finding 3)
- L6: Stance consistency — the REPORT holds a generally factual + decision-triggers posture throughout; no unexpected slips into advocacy

---

## Unverifiable Claims

Claims that could not be fully confirmed within audit budget:
1. **"Zero of ~60 surveyed production users have migrated"** (REPORT.md:41) — see Finding 4; no survey exists in evidence.
2. **Node 22 required but no Node-22 syntax in source** (evidence `yjs-core-v13-vs-v14-source-diff.md:678-683`) — did not exhaustively re-verify; spot-check of `src/index.js` showed no top-level await, no `import.meta.resolve()`.
3. **Wire-format byte-level interop between v13 and v14** (explicitly flagged by the evidence file itself as a verification gap) — not in audit scope.
4. **~700-900 LOC fork estimate for y-tiptap Yjs14 migration** (REPORT.md:171, evidence `tiptap-collab-packages-source-trace.md:434) — a cost estimate inherently subjective; depends on corrected Finding 2 status (cursor + undo plugins already ported reduces the estimate).
5. **AFFiNE pins yjs 13.6.21** (REPORT.md:246; evidence `yjs-14-maintainer-roadmap-and-signals.md:470) — cited to a Substack article + AFFiNE docs; not independently re-verified via AFFiNE's package.json.
6. **BlockNote is the lone publicly-committed Yjs 14 design partner** (REPORT.md:49, 247) — supported by FOSDEM abstract and the evidence file's §5h table covering 10 projects, but "lone" is a comprehensive claim that a 10-project survey cannot fully verify (rests on the claim that no other project has made a public commitment).
