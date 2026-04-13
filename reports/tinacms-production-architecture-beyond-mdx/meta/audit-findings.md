# Audit Findings

**Artifact:** `/Users/edwingomezcuellar/projects/open-knowledge/reports/tinacms-production-architecture-beyond-mdx/REPORT.md`
**Audit date:** 2026-04-12
**Total findings:** 6 (1 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: Discussion #2962 upvote count is wrong (13 claimed vs 4 actual)

**Category:** FACTUAL
**Source:** T5 (external claims — GitHub API verification)
**Location:** D3 (Collaboration / Concurrency Story), Executive Summary, Cross-Cutting Synthesis
**Issue:** The report claims the Draft Documents discussion (#2962) has "13 upvotes" in three places: the D3 finding, the evidence file, and the executive summary. The actual count from the GitHub API is 4 reactions, not 13.
**Current text:** "13 upvotes, 5 comments. Most recent follow-up 2026-01-13 asking for status: no Tina-team response."
**Evidence:** `gh api repos/tinacms/tinacms/discussions/2962 --jq '.reactions.total_count'` returns `4`. Additionally, the comment count is 7, not 5.
**Status:** CONTRADICTED
**Suggested resolution:** Replace "13 upvotes, 5 comments" with "4 upvotes, 7 comments" throughout the report and evidence file d3-collaboration-story.md. The conclusion drawn from the upvote count ("community follow-ups over 4 years") remains directionally valid — 7 comments over 4 years with no team response is still a strong signal of neglect — but the inflated number overstates community demand intensity and should not stand.

---

## Medium Severity

### [M] Finding 2: Discussion #4639 described as "closed as answered" but is actually still open

**Category:** FACTUAL
**Source:** T5 (external claims — GitHub API verification)
**Location:** D3, lines 219-225
**Issue:** The report states "No follow-up; discussion closed as answered." The GitHub API shows `state: "open"`, `answer_chosen_at: null`. The discussion was never closed and has no chosen answer.
**Current text:** "No follow-up; discussion closed as answered."
**Evidence:** `gh api repos/tinacms/tinacms/discussions/4639 --jq '{state: .state, answer_chosen_at: .answer_chosen_at}'` returns `{"state": "open", "answer_chosen_at": null}`.
**Status:** CONTRADICTED
**Suggested resolution:** Replace "discussion closed as answered" with "discussion remains open with no chosen answer." The factual content of the discussion (user reports last-writer-wins, maintainer redirects to branching) is verified correct — only the disposition metadata is wrong.

---

### [M] Finding 3: SSW contributor count is 22/27 but actual count is closer to 20/27

**Category:** FACTUAL
**Source:** T2 (OSS repo — git log verification)
**Location:** D5, Executive Summary
**Issue:** The report claims "22 of 27 contributors in the last 10 months are SSW staff." Actual git log shows 27 unique author names. Of these, 18 have `[SSW]` tag. Two additional names (Nick Curran, Pat Stuart) are untagged duplicates of SSW-tagged contributors. So SSW-affiliated = 20, not 22. The evidence file then says "remaining 5" but lists 6 names (Copilot bot, Griffen Edge, Michael Bianco, Felix Dawodu, Tihomir Ivanov, Arkadiusz Irlik). The count is internally inconsistent: 22 + 5 = 27 but 20 + 7 (or 6 non-SSW + 1 bot) = 27.
**Current text:** "22 of 27 contributors in the last 10 months are SSW staff."
**Evidence:** `git log --since=2025-06-01 --format='%an' | sort -u` shows 18 `[SSW]`-tagged names + 2 untagged duplicates of SSW staff + 1 bot + 6 external contributors = 27 total. SSW-affiliated count is 20, not 22.
**Status:** CONTRADICTED
**Suggested resolution:** Correct to "20 of 27 unique contributor names are SSW-affiliated (18 tagged `[SSW]`, 2 untagged duplicates)." The directional conclusion (SSW dominates contribution) is unchanged.

---

### [M] Finding 4: 2025 commit count slightly off (254 stated vs 252 actual)

**Category:** FACTUAL
**Source:** T2 (OSS repo — git log verification)
**Location:** D5 evidence file (d5-trajectory-and-sustainability.md, line 78)
**Issue:** Evidence file says "2025: 254 commits." Actual `git log --since=2025-01-01 --until=2025-12-31 --oneline | wc -l` returns 252.
**Current text:** "2025: 254 commits"
**Evidence:** `git log --since=2025-01-01 --until=2025-12-31 --oneline | wc -l` = 252.
**Status:** CONTRADICTED
**Suggested resolution:** Correct to "252." Immaterial to conclusions but should be accurate since the report uses this number in the ~21 commits/month calculation (252/12 = 21/month, same result).

---

## Low Severity

### [L] Finding 5: AsyncLock usage description undercounts — exists in 4 files, not just unifiedClient

**Category:** FACTUAL
**Source:** T2 (OSS repo — grep verification)
**Location:** D3 evidence file (d3-collaboration-story.md, Finding 3)
**Issue:** Evidence says "Only 3 matches" for Lock patterns and claims AsyncLock is solely in `unifiedClient/index.ts` for HTTP cache dedup. Grep for `AsyncLock` finds 4 files: `unifiedClient/index.ts`, `cli/src/next/vite/plugins.ts`, `cli/src/next/commands/dev-command/server/index.ts`, and `cli/src/next/commands/dev-command/index.ts`. The latter uses `indexingLock: AsyncLock` to "Prevent indexes and reads occurring at once" — this is indexing coordination, closer to a structural lock than pure cache dedup.
**Current text:** "Only 3 matches: (1) unifiedClient/index.ts uses AsyncLock ... solely for in-process HTTP response-cache key deduplication"
**Evidence:** `grep -rn 'AsyncLock' packages/` matches 4 files. `dev-command/index.ts:35` has `indexingLock: AsyncLock = new AsyncLock(); // Prevent indexes and reads occurring at once`.
**Status:** CONTRADICTED
**Suggested resolution:** Update to note 4 matches across unifiedClient and CLI packages, all for internal coordination (HTTP cache dedup and indexing serialization), none for user-facing document/editor locking. The conclusion (no user-facing locking) is unchanged.

---

### [L] Finding 6: D3 negative grep claim about 0 matches for crdt/yjs is technically wrong — 1 file matched

**Category:** FACTUAL
**Source:** T2 (OSS repo — grep verification)
**Location:** D3 evidence file (d3-collaboration-story.md, Finding 1)
**Issue:** Evidence claims "yjs|y-prosemirror|automerge|hocuspocus|crdt -> 0 meaningful matches" and the REPORT says "0 meaningful matches." However, grep returns 1 file: `packages/@tinacms/graphql/src/database/index.ts`. Checking the match, it's the string "noinspection" containing "crdt" as a false positive from IntelliJ inspection comments. The claim that there are 0 *meaningful* matches is correct, but the parenthetical "(only pnpm-lock noise)" in the evidence is wrong about where the false positive is — it's in source code, not pnpm-lock.
**Current text:** "0 meaningful matches (only pnpm-lock noise unrelated to Tina packages)"
**Evidence:** `grep -ri 'yjs\|y-prosemirror\|automerge\|hocuspocus\|crdt' packages/` returns `packages/@tinacms/graphql/src/database/index.ts` with "noinspection" comments. The characterization "(only pnpm-lock noise)" is incorrect about the location of the false positive.
**Status:** INCOHERENT
**Suggested resolution:** Correct to "0 meaningful matches (one false positive: IntelliJ `noinspection` comment in `database/index.ts`)." Conclusion unchanged.

---

## Confirmed Claims (summary)

**T2 (OSS repo) spot-checks:**
- Bridge interface is exactly 4 methods (glob, get, put, delete) at `bridge/index.ts:22-40` -- CONFIRMED
- `database/index.ts` put path fires `bridge.put()` then `onPut()` with no merge logic -- CONFIRMED
- `GitHubProvider.onPut` commits per-file via Contents API with sha freshness check -- CONFIRMED
- `invalidMarkdown()` function wraps full source in opaque node; stringify emits source verbatim -- CONFIRMED
- `remarkToPlate.ts` throws `RichTextParseError` on mdxFlowExpression, mdxjsEsm, mdxTextExpression -- CONFIRMED
- `editorial-workflow-constants.ts` FSM states (QUEUED through COMPLETE/ERROR/TIMEOUT) -- CONFIRMED
- `waitForIndexStatus` polls every 5s with 15-minute timeout -- CONFIRMED
- `CLAUDE.md` is 9 bytes containing "AGENTS.md" -- CONFIRMED
- CLI commands: dev, build, audit, init, codemod, searchindex (no mcp/agent) -- CONFIRMED
- Commit velocity: 2023=1723, 2024=313, 2025=252, since-2025-06-01=280, since-2025-10-01=203 -- CONFIRMED (2025 off by 2)
- License is Apache 2.0 -- CONFIRMED
- 27 unique contributors since 2025-06-01, heavily SSW-dominated -- CONFIRMED (count ratio slightly off)

**T5 (external) spot-checks:**
- Discussion #4639 content: user reports last-writer-wins, maintainer @bradystroud says "branching might be the way to go" -- CONFIRMED
- Discussion #2962 opened by @jamespohalloran, June 2022, "no development work has been started" quote present -- CONFIRMED
- Discussion #2962 latest comment 2026-01-13 by @joacimeldre with no Tina response -- CONFIRMED
- calumjs/TinaMCP: 1 star, C#, created 2025-04-29, single day of activity -- CONFIRMED
- npm weekly downloads ~87,896 -- CONFIRMED
- GitHub stars ~13.3k, forks 688, Apache-2.0 -- CONFIRMED
- tina.io/about SSW acquisition quote matches -- CONFIRMED

**Coherence lenses:**
- L1 (contradictions): No cross-finding contradictions detected. D1-D5 findings are internally consistent and mutually reinforcing.
- L2 (confidence-prose): CONFIRMED and INFERRED labels used appropriately. INFERRED items (AI Features scope, SSW FTE count) are hedged with "likely" or "plausible."
- L3 (conditionality): Findings appropriately scoped to OSS codebase; Tina Cloud caveats stated where relevant.
- L5 (summary coherence): Executive summary accurately reflects detailed findings across all 5 dimensions.
- L6 (stance): Factual-with-conclusions stance consistently applied. Implications sections clearly labeled as implications/opinions, not findings.
- L7 (source attribution): Architecture/code artifact -- quick pass. Vendor-sourced claims appropriately caveated (D5 evidence file header, D5 finding 5 body).

## Unverifiable Claims

1. **"SSW's business model is selling consulting hours to enterprise"** -- Directionally consistent with SSW's public positioning but not independently verified via financial records. Treated as common knowledge.
2. **"AI Features (Beta) likely a slash-command LLM helper"** -- Appropriately labeled as INFERRED; gated behind paid tier, no public documentation found. Cannot verify without Tina Cloud Team Plus subscription.
3. **Tina Cloud server-side behavior (branch coordination, PR orchestration, edit-lock)** -- Explicitly flagged as inferred from client-side FSM states. Cannot verify without access to closed-source backend.
