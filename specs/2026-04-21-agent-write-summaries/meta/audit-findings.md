# Audit findings — agent-write-summaries spec

**Audited:** 2026-04-21
**Auditor:** general-purpose subagent loaded with /eng:audit + /eng:spec
**Baseline commit:** 91ae79c4 (matches spec's stamped baseline)
**Total findings:** 13 (5 high, 5 medium, 3 low)

## High-severity findings

### [H1] Precedent #9 ("Schema is add-only forever") is misapplied throughout the spec

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §1 Resolution, §2 G2/G4, §3 NG10/NG11, §6 FR4, §6 FR6, §10 D1/D9, §12 A5, evidence/code-trace, evidence/worldmodel-synthesis, meta/_changelog
**Status:** CONTRADICTED

The spec invokes `[[precedent#9]] schema-add-only` repeatedly to justify the additive `summariesByDoc?` extension on the `ok-contributors:` JSON line (§1 Resolution: "no v-bump per [[precedent#9]] schema-add-only"; §10 D1, D9: "Per [[precedent#9]] schema-add-only").

**Evidence:** `PRECEDENTS.md:22` defines precedent #9 as: *"**ProseMirror schema** evolves only by adding node types, adding attrs, and widening content expressions."* The rationale is grounded in `y-prosemirror@1.3.7`'s destructive `Y.Item` deletion when `schema.node()` throws during CRDT → PM materialization. Enforcement is `packages/core/src/schema-invariant.test.ts` and the y-prosemirror patch.

The shadow-repo `ok-contributors:` JSON line is a completely different domain (commit message JSON, parsed by `parseContributors` in `shadow-repo-layout.ts`). It has nothing to do with ProseMirror schema or y-prosemirror's destructive delete path.

**Suggested resolution:** Stop citing precedent #9 for this spec. Either:
- (a) Reframe the principle in spec-local terms ("`ok-contributors:` JSON evolves additively — old parsers tolerate new fields, new parsers tolerate missing fields"), citing the CONCRETE behavior of `parseContributors` rather than a misapplied precedent. The principle is sound; the citation is wrong.
- (b) Cite precedent #5 ("Contract-first MCP tools") for the `summary` Zod schema and tool-description discipline, which IS applicable to the MCP write surface this spec extends.
- Note: precedent #3 ("Structured event schemas") has language that *opposes* the spec ("Don't grow ad-hoc fields") — citing it would be even worse.

This finding implicates §10 D1's evidence column, §10 D9's rationale column, §6 FR4's notes column, and §12 A5's verification plan. It does not change the technical design — only the authority claim that anchors it.

---

### [H2] D15 plumbing creates human-as-Claude misattribution risk in UI rollback flow

**Category:** COHERENCE / FACTUAL
**Source:** L1 (cross-finding contradictions) + T1
**Location:** §6 FR9/FR10, §10 D15, §11 status-amendment for Q1
**Status:** INCOHERENT (spec calls this a "positive externality" but the path also captures non-MCP humans)

D15 says: "rollback row attribution flips from `Auto-save` → `Claude` as positive externality" and §16 SCOPE says `handleRollback` must call `extractAgentIdentity(body)` + `recordContributor(...)`.

**Evidence:** `packages/app/src/components/EditorPane.tsx:155` — the editor's "Restore" button (a human-driven UI affordance, NOT MCP) calls `fetch('/api/rollback', {body: {docName, commitSha}})`. The body sends only `docName` + `commitSha` — no agent identity fields.

`extractAgentIdentity` at `api-extension.ts:1019-1038` falls back to `agentId='claude-1', agentName='Claude'` when the body has no `agentId`/`agentName`. So the UI Restore button, after D15 plumbing lands, would attribute every human-driven rollback to "Claude" in the timeline.

**Suggested resolution:** Decide explicitly:
- (a) Restrict the `recordContributor` call inside `handleRollback` to bodies that carry an explicit `agentId` (i.e., MCP path only), keeping the UI rollback as today's anonymous server commit. This is the safe-by-default choice and matches the spirit of the "positive externality" claim.
- (b) Detect the human path and emit a `human-${sessionId}` writer instead.
- (c) Accept the UI-as-Claude misattribution and document it as a known issue.

The current SPEC text doesn't disambiguate, and the failure mode (humans showing up as Claude) is user-facing and concerning. Recommend (a) — bound `extractAgentIdentity` to MCP-supplied identity, fall back to defaultWriter (no `ok-contributors:` line) for unattributed bodies. Add an FR or update §16 SCOPE to make this explicit.

---

### [H3] In Scope (§13) requirements list "FR1-FR12" omits FR14 and FR15

**Category:** COHERENCE
**Source:** L1 / L5 (summary coherence)
**Location:** §13 In Scope ("Requirements with acceptance criteria: §6 FR1-FR12")
**Status:** INCOHERENT

§13 In Scope explicitly says "**Requirements with acceptance criteria:** §6 FR1-FR12." But §6 includes FR14 (Should: summaries auto-carry in `exec` enrichment — verifies D12 LOCKED) and FR15 (Should: PII/secrets hint — codifies D14 DIRECTED). Both are requirements anchored by Decision Log entries that are explicitly marked DIRECTED in §10.

If FR14 + FR15 are not In Scope, then D12 and D14 are unimplemented decisions. If they are In Scope, §13 understates the requirement set.

**Suggested resolution:** Update §13 to read "**Requirements with acceptance criteria:** §6 FR1-FR15 (FR13 is Could-priority, deferred per cardinality observation in production)." This matches the actual scope cascaded from D12 + D14. FR13 alone is the legitimate "Could/defer" carve-out.

---

### [H4] Q3 + Q4 status table rows say "Needs user input" but amendments block says they are resolved

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §11 Open Questions table (Q3, Q4 rows) vs. §11 "Status amendments" sub-block immediately below
**Status:** INCOHERENT

The table rows for Q3 (mixed-summary rendering) and Q4 (single string vs. array tool param) still show `Status: Needs user input`. The amendments block immediately below says:
- "Q3 → resolved by D16: option A — bullets enrich, doc-list line is ALWAYS shown as ground truth"
- "Q4 → resolved by D17 LOCKED 1-way door: single `summary: string` per call"

A reader scanning the table sees blockers; a reader reading the amendments block sees them resolved. Both readings are valid because both texts are present.

**Suggested resolution:** Update the Status column for Q1, Q2, Q3, Q4, Q5, Q6, Q9, Q10 to "**Resolved (D15-D21)**" or similar, matching the amendments. Keep the amendments block as a process record of how the resolution arrived. This collapses the dual sources into one current-state view.

---

### [H5] M1 instrumentation note references nonexistent `agentWrites` counter

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §7 M1 Adoption rate ("Tracked in `metrics.ts` alongside existing `agentWrites` counter")
**Status:** CONTRADICTED

**Evidence:** `packages/server/src/metrics.ts` (lines 1-100, full enumeration of the `ReconciliationMetrics` interface and `counters` object). No `agentWrites` counter exists. The file tracks reconciliation, observer fires, CC1 broadcast, persistence disk writes, bridge merge events, collab socket errors — but no agent-write counter of any kind. `grep -rn "agentWrites|agentWriteCount|incrementAgentWrite"` over the server package returns zero matches.

**Suggested resolution:** Reword §7 M1 to: "Increment a new counter (e.g. `agentWriteSummariesProvided` and `agentWriteCalls`) in the API handler; add to the `ReconciliationMetrics` interface in `metrics.ts`. Both must be added together since no per-agent-write counter exists today." This makes the implementation tractable. Also reconsider whether the rate calc (M1 = summariesProvided / agentWrites) needs the denominator counter as a new addition explicitly listed in §16 SCOPE.

---

## Medium-severity findings

### [M1] NG10 inaccurately claims `ActivityEntry.description` is "written-but-not-read"

**Category:** FACTUAL
**Source:** T1 (own codebase) / L4 (evidence-synthesis fidelity)
**Location:** §3 NG10, evidence/worldmodel-synthesis.md F2
**Status:** CONTRADICTED (partially)

NG10 claims `description` is "currently auto-derived... and is written-but-not-read (flash plugins consume only `timestamp`)." Worldmodel-synthesis F2 says "the only reader is `agent-flash-source.ts:96-119`, which ignores it (only consumes `timestamp`)."

**Evidence:** `packages/app/src/editor/TiptapEditor.tsx:288` reads `entry.description` and `:319` parses it for the substring `'prepend'` to set the flash position direction:
```ts
const position: 'append' | 'prepend' = latest?.description?.toLowerCase().includes('prepend')
  ? 'prepend'
  : 'append';
```
So `description` IS read by the WYSIWYG flash plugin (TiptapEditor.tsx) — it's not a dead field. The CodeMirror plugin (`agent-flash-source.ts`) does ignore it, but that's only one of two consumers.

**Suggested resolution:** Update NG10 to: "`description` is currently auto-derived... and is read only by `TiptapEditor.tsx:319` for a heuristic position-direction check (substring `'prepend'`); the CodeMirror flash plugin ignores it. Neither consumer surfaces the description text to users today, but the field is not dead." The decoupling rationale (NG10's core point) still stands — the WYSIWYG heuristic doesn't depend on agent-supplied summaries — but the factual basis for the claim should be precise.

---

### [M2] NG10 line citations include a verb mismatch

**Category:** FACTUAL
**Source:** T1
**Location:** §3 NG10 ("auto-derived (`\"Added (${agentName}): ${content.slice(0, 50)}\"` at `api-extension.ts:1095, 1180, 1715`)")
**Status:** CONTRADICTED (minor)

**Evidence:** Lines 1095 and 1180 do match the format `"Added (..."`. Line 1715 uses `"Patched (..."`:
- `api-extension.ts:1095` — `description: \`Added (${agentName}): ${content.slice(0, 50)}\`` ✓
- `api-extension.ts:1180` — `description: \`Added (${agentName}): ${markdown.trim().slice(0, 50)}\`` ✓
- `api-extension.ts:1715` — `description: \`Patched (${agentName}): ${find.slice(0, 50)}\`` (NOT "Added")

**Suggested resolution:** Reword to "auto-derived using the format `\"<verb> (${agentName}): ${truncated}\"` at api-extension.ts:1095 (Added — handleAgentWrite), 1180 (Added — handleAgentWriteMd), 1715 (Patched — handleAgentPatch)." Material to NG10's argument that the format isn't agent-controlled intent.

---

### [M3] FR5 proposes "drop-malformed-field" policy that diverges from existing parser convention

**Category:** COHERENCE
**Source:** L1 / T1
**Location:** §6 FR5, §13 Backward-compat row
**Status:** INCOHERENT (with current parser behavior)

FR5 says: "Type guard validates `summariesByDoc` is `Record<string, string[]>` when present; **malformed → silently drop the field, contributor still parses**".

**Evidence:** `packages/core/src/shadow-repo-layout.test.ts:104-107` — when `colorSeed` (also an optional field) is present but non-string, the WHOLE ENTRY is skipped, not just the `colorSeed` field. The current parser convention is "any optional-but-wrong-type field invalidates the whole entry":
```ts
test('skips entry where colorSeed is not a string', () => {
  const body = '\nok-contributors: {"id":"agent-a","name":"A","colorSeed":123,"docs":["x"]}';
  expect(parseContributors(body)).toEqual([]);
});
```

FR5's proposed behavior (drop just the field, keep the entry) is a NEW policy. Either it's a deliberate per-field choice (and should be documented as such) or it should match the existing convention (skip the whole entry).

**Suggested resolution:** Decide:
- (a) Adopt the existing convention: malformed `summariesByDoc` → skip entry (consistent with `colorSeed`). Lose attribution + summaries on commit-side bug, predictable behavior.
- (b) Justify the field-level drop as a deliberate choice (e.g., "summaries are decorative, attribution is core; preserving the contributor entry is more important than preserving the summary array"). Update §13 Backward-compat row to match.

Recommend (b) with explicit rationale, because losing attribution because a server bug emitted a malformed summary array would be worse than losing the bullets. But the divergence needs to be acknowledged.

---

### [M4] Line-number citations in §8 / §9 / evidence have several off-by-one drift

**Category:** FACTUAL
**Source:** T1
**Location:** §8 "Current state", §9 system design comments, evidence/code-trace
**Status:** STALE / minor

Many citations are off by 1-100 lines because the file has shifted:
- SPEC says `handleRollback` at `api-extension.ts:2129` — actual is **2130**
- Evidence says `extractAgentIdentity` at `api-extension.ts:1011-1039` — actual is **1012-1039**
- Evidence says `handleAgentPatch` at `api-extension.ts:~1660` — actual is **1593** (note: `~` so already approximate)
- Evidence says `parseContributors` at `shadow-repo-layout.ts:127-157` — verified at 127 (start), but the function ends at 157 ✓

Other line cites verified accurate: `handleAgentWrite:1041` ✓, `handleAgentWriteMd:1112` ✓, `handleRename:2657` ✓, `commitToWipRef:164` ✓, `restoreContributors at persistence.ts:182` ✓.

**Suggested resolution:** Refresh line numbers as part of the next session (cheap mechanical pass). Not blocking — the function names + file paths are unambiguous. Note: line numbers WILL drift again as code evolves; consider whether to drop line numbers from §8 / §9 in favor of function names + file paths only (which is the convention in CLAUDE.md and PRECEDENTS.md).

---

### [M5] FR9 phrasing "side-effect docs stay anonymous (defaultWriter) as today" mixes two distinct attribution layers

**Category:** COHERENCE
**Source:** T1 (own codebase) / L6 (stance consistency)
**Location:** §6 FR9 acceptance, §10 D15 implications
**Status:** INCOHERENT (terminology overload)

FR9 says: "contributor entry attaches to the renamed (new) doc only — backlink-rewritten side-effect docs stay anonymous (`defaultWriter`) as today".

**Evidence:** `packages/server/src/persistence.ts:152-156` — `defaultWriter` is the WIP commit's git-author identity, ALWAYS used for shadow-WIP commits regardless of contributor attribution:
```ts
const defaultWriter: WriterIdentity = {
  id: 'server',
  name: 'openknowledge-server',
  email: 'noreply@openknowledge.local',
};
```
The shadow commit is *always* authored by `defaultWriter`; per-doc attribution is layered on top via `ok-contributors:` JSON lines. The two channels are independent.

So "side-effect docs stay anonymous (defaultWriter) as today" is conflating the commit-author identity (always `defaultWriter`) with the per-doc contributor attribution (`ok-contributors:` lines). The intended meaning is "side-effect docs don't get an `ok-contributors:` entry attributing them to any agent."

**Suggested resolution:** Rephrase as: "side-effect docs are not added to any contributor entry's `docs[]` set in the rename L2 cycle. They land in the shadow commit attributed to the default WIP writer (`server`) with no `ok-contributors:` attribution to the calling agent — same as today's behavior for any non-write-path mutation."

---

## Low-severity findings

### [L1] FR10 sha-short = 7 chars but existing format uses 8 chars

**Category:** FACTUAL
**Source:** T1
**Location:** §6 FR10 ("`Restored to <sha-short>` (sha-short = first 7 chars)"), §10 D8
**Status:** CONTRADICTED (minor, surface inconsistency)

**Evidence:** `api-extension.ts:2259` — `const versionLabel = versionTagForRollback ?? commitSha.slice(0, 8)`. The existing parent-git rollback message uses **8** chars, not 7. SPEC's D8 references "the existing parent-git commit message style at api-extension.ts:2260" — which uses 8.

**Suggested resolution:** Either change FR10 to "first 8 chars" (matches existing) or document the deliberate divergence (e.g., "7 to align with git's `--abbrev=7` default, despite the parent-git message using 8"). Recommend matching the existing 8 for consistency unless there's a stated reason otherwise.

---

### [L2] Q9 status amendment cites D20 but FR2 acceptance criterion uses different wording

**Category:** COHERENCE (minor)
**Source:** L1
**Location:** §6 FR2 vs §11 Q9 amendment
**Status:** INCOHERENT (minor wording drift)

FR2 acceptance: "AND set `truncatedFrom: <originalLength>` in the response (per D20: only when input > 50, NOT for exact-50 input)".

Q9 amendment: "D20: `truncatedFrom` ONLY set when input > 50 chars; documented in FR2."

These are functionally consistent. Minor: FR2 says "NOT for exact-50 input" (clear), Q9 amendment says "ONLY set when input > 50" (also clear). No bug, just two ways of saying the same thing — fine.

**Suggested resolution:** No action needed. Confirms the spec's coherence on the truncation edge case.

---

### [L3] §3 NG3 vs §10 D9 — "additive parser" terminology

**Category:** Wording / L7
**Source:** L7 (inline source attribution)
**Location:** §3 NG3, §10 D9
**Status:** Minor wording

NG3 forbids "any side-channel separate from the existing `ok-contributors:` line". D9 says "No v-bump; `summariesByDoc` is purely additive". Both read clearly individually. Together with the precedent #9 finding (H1) above, the consistent invocation creates a load-bearing pattern that needs to either be repaired or replaced with a spec-local principle.

**Suggested resolution:** Folds into H1's resolution. No standalone action.

---

## Verified claims (sample)

These claims were spot-checked against code and confirmed accurate:

- **Existing handlers that DO call `recordContributor`:** `handleAgentWrite:1098` ✓, `handleAgentWriteMd:1183` ✓, `handleAgentPatch:1718` ✓
- **Existing handlers that do NOT call `recordContributor`:** `handleRollback` (lines 2130-2279, full body verified) ✓, `handleRename` (lines 2657-2724, full body verified) ✓
- **MCP tools with agent-identity passthrough:** `write-document.ts:62-69` ✓, `edit-document.ts:73-80` ✓
- **MCP tools missing agent-identity passthrough:** `rename-document.ts` (no `identityRef` dep, no agent fields in body) ✓, `rollback-to-version.ts` (same) ✓
- **CC1 read pipeline already calls `parseContributors`:** `shadow-log.ts:121` ✓ (worldmodel F1)
- **`enrichment.ts:160` exposes `history` field on enrichment output:** ✓ (typed as `ShadowCommit[] | null`; each `ShadowCommit` carries `contributors[]`)
- **`/api/save-version` does NOT carry contributor lines into project-git:** `api-extension.ts:1888` — `const autoMsg = userMessage ?? \`Checkpoint v${n}\`` ✓ (NG11 evidence)
- **Parser tolerates sibling unknown lines (e.g. `ok-checkpoint-v1`):** `shadow-repo-layout.test.ts:293-307` ✓
- **TimelinePanel renders `allDocs` line at TimelinePanel.tsx:256-264:** ✓
- **`ShadowContributor` interface at `shadow-repo-layout.ts:111-118`:** ✓ (matches the type extension target)
- **`ContributorEntry` shape at `contributor-tracker.ts:12-17`:** ✓
- **`extractAgentIdentity` exists and truncates to `AGENT_NAME_MAX_LEN`:** ✓ (api-extension.ts:1024-1031, A4 verified)
- **Baseline commit `91ae79c4` is current HEAD:** ✓
- **Bug-Q5 commit-body capacity sanity (1KB realistic, git tolerates 100KB+):** A1 plausible, no contradicting evidence found. Not a blocker.

---

## Coverage notes

What I could not verify or chose not to deep-dive:

- **R3 risk's quantification ("requires more invasive changes than budgeted"):** scope unverifiable without estimating actual implementation effort. The code investigation surfaces the gap (rename/rollback need plumbing) but doesn't quantify "more invasive" — that's a judgment call.
- **M2 truncation rate baseline ("unknown"):** consistent with no telemetry today; will need first observed value as baseline.
- **M3 timeline scannability proxy:** explicitly qualitative + ad-hoc — not a verification target.
- **Dep-tree forward-compat for V0-14 `applyAgentUndo` (STOP_IF clause):** the spec correctly flags it; verifying it requires V0-14's actual landing, which is future work.
- **Performance-regression for the bullet rendering:** TimelinePanel render perf with N bullets per row was not benchmarked; the spec's NFR is reasonable in expectation.
- **Multi-agent-presence spec cross-link:** I confirmed `specs/2026-04-21-multi-agent-presence/SPEC.md` exists and is referenced; I did not read its contents to verify the Cluster A claim's mechanics.
