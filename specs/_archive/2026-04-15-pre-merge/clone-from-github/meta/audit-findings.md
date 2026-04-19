# Audit Findings

**Artifact:** `specs/2026-04-14-clone-from-github/SPEC.md`
**Audit date:** 2026-04-14
**Total findings:** 5 (3 high, 1 medium, 1 low)

---

## High Severity

### [H1] Finding 1: §9 API design contradicts evidence and architecture diagram on clone trigger mechanism

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions), L4 (evidence-synthesis fidelity)
**Location:** §9 "Editor-to-CLI subprocess protocol" (line 241), evidence `editor-integration-surfaces.md` Q2, architecture diagram (line 199)
**Issue:** The §9 API design section states the clone dialog "does NOT call a server HTTP endpoint for the clone operation. Instead, it spawns `open-knowledge clone` as a child process." But a browser-side React app cannot spawn child processes — it runs in a sandboxed browser context. The spec's own evidence file (Q2) correctly identifies `POST /api/local-op/clone` as the mechanism: the server HTTP endpoint spawns the CLI subprocess and streams JSONL back via chunked `Transfer-Encoding`. The architecture diagram (line 199) also labels the transport between browser and CLI as "HTTP." Three surfaces in the same spec disagree: the §9 prose says "not HTTP," the evidence says "POST /api/local-op/clone," and the diagram shows "HTTP."
**Current text:** "The clone dialog does NOT call a server HTTP endpoint for the clone operation. Instead, it spawns `open-knowledge clone <url> --dir <path> --json` as a child process and reads structured JSON lines from stdout"
**Evidence:**
- Evidence file Q2: "For clone: `POST /api/local-op/clone` spawns `open-knowledge clone --json <url>` as child process, streams JSONL via chunked `Transfer-Encoding`."
- Architecture diagram (line 199): "HTTP (clone dialog spawns CLI subprocess; new server instance serves the cloned project)"
- Browser React apps cannot call `child_process.spawn()` — Node APIs are not available in the browser runtime.
**Status:** INCOHERENT
**Suggested resolution:** Align §9 API design text with the evidence file and architecture diagram. The correct architecture is: clone dialog calls `POST /api/local-op/clone` on the running server → server endpoint spawns `open-knowledge clone --json` as a child process → JSONL streamed back to browser via chunked HTTP response → dialog reads response body as a `ReadableStream`. The "Why subprocess" rationale (subprocess isolation, one-server-per-contentDir) remains valid — the HTTP endpoint is a relay, not in-process clone work. Add `POST /api/local-op/clone` to the API endpoints table in §9.

---

### [H2] Finding 2: P3 user journey contradicts FR9 on trust-pending mechanism

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §5 P3 user journey step 4 (line 90), §6 FR9 (line 122)
**Issue:** The P3 user journey says the editor opens in "**preview mode** (read-only, reusing PR #39's preview primitive)." FR9 says the opposite: "Separate from PR #39's diff/preview mode (which is document-level timeline). Trust-pending is project-level." FR9 is the authoritative requirement and is consistent with evidence Q4. The user journey uses stale terminology and incorrectly claims PR #39's preview primitive is reused. An implementer reading the user journey before reaching FR9 would attempt to reuse diff mode, which is architecturally wrong (diff is per-document, trust is per-project).
**Current text:** "Editor opens in **preview mode** (read-only, reusing PR #39's preview primitive)."
**Evidence:** FR9 (line 122): "Separate from PR #39's diff/preview mode (which is document-level timeline). Trust-pending is project-level." Evidence Q4: "Trust-pending is project-level, not document-level. Should NOT reuse diff mode. Instead: Add `trustPending: boolean` to EditorPane."
**Status:** INCOHERENT
**Suggested resolution:** Rewrite P3 journey step 4 to: "Editor opens in **trust-pending mode** — all documents render in source-mode read-only with a project-level banner: 'This project was cloned from github.com/team/shared-kb. Review its settings before editing. [Review config] [Trust and enable editing] [Keep read-only].'" Remove the "(reusing PR #39's preview primitive)" parenthetical.

---

### [H3] Finding 3: §8 "Current state" misnames EditorMode values and makes a false reusability claim

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 "Current state" (line 160)
**Issue:** §8 states "Editor modes: `'editing' | 'preview' | 'diff'` state machine (from PR #39 timeline spec). Preview mode = read-only CodeMirror. Reusable for untrusted-project case." Two errors: (1) The actual EditorMode type at `EditorPane.tsx:16` is `'wysiwyg' | 'source' | 'diff'` — two of three values are wrong ('editing' should be 'wysiwyg', 'preview' should be 'source'). (2) The claim "Reusable for untrusted-project case" is contradicted by FR9 and evidence Q4, which both say trust-pending is a separate project-level mechanism. This §8 text creates a false mental model that feeds into the P3 journey error (H2).
**Current text:** "**Editor modes:** `'editing' | 'preview' | 'diff'` state machine (from PR #39 timeline spec). Preview mode = read-only CodeMirror. Reusable for untrusted-project case."
**Evidence:** `packages/app/src/components/EditorPane.tsx:16`: `export type EditorMode = 'wysiwyg' | 'source' | 'diff';` FR9 (line 122): "Separate from PR #39's diff/preview mode."
**Status:** CONTRADICTED
**Suggested resolution:** Rewrite to: "**Editor modes:** `'wysiwyg' | 'source' | 'diff'` state machine (from PR #39 timeline spec). Diff mode shows historical versions (per-document, triggered by timeline entry). Source mode shows CodeMirror. Trust-pending mode (new) is a project-level flag separate from these document-level modes — see FR9."

---

## Medium Severity

### [M1] Finding 4: §8 lists `preview` CLI command but CLAUDE.md only lists three — stale cross-reference risk

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §8 "Current state" (line 154)
**Issue:** §8 says "Four commands (`start`, `init`, `mcp`, `preview`). No `clone`." Verified: all four exist in `cli.ts` lines 68-80. However, CLAUDE.md only lists three commands (start, init, mcp). This is not a spec error — the codebase confirms four commands — but it signals that `preview` was added recently and may not be widely known. No action needed on the spec; noted for context.
**Current text:** "**CLI:** Four commands (`start`, `init`, `mcp`, `preview`). No `clone`."
**Evidence:** `packages/cli/src/cli.ts:80` registers the preview command. CLAUDE.md CLI Commands table lists only start/init/mcp.
**Status:** CONFIRMED (spec is correct; CLAUDE.md is stale)
**Suggested resolution:** No spec change needed. Consider updating CLAUDE.md's CLI Commands table to include `preview` separately.

---

## Low Severity

### [L1] Finding 5: Evidence file line numbers slightly imprecise

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** `evidence/editor-integration-surfaces.md` Q1, `evidence/upstream-sync-flow.md`
**Issue:** Minor line number drift between evidence files and current code state. (a) Evidence Q1 says "FileTree.tsx:394-416" for the `documents.length === 0` check — the primary check is at line 410, not 394. Line 394 is a `loading` state check. The range 410-416 is accurate for the empty-state rendering block. (b) Evidence says `shadow-repo.ts:220-224` for the `!oldHead` message branch — actual lines are 222-224 (ternary expression). These are minor and don't affect the spec's design decisions.
**Current text:** "FileTree.tsx:394-416" / "shadow-repo.ts:220-224"
**Evidence:** `FileTree.tsx:410`: `if (documents.length === 0) {`; `shadow-repo.ts:222-224`: the ternary message expression.
**Status:** STALE (minor drift)
**Suggested resolution:** Update evidence file line numbers if they will be referenced during implementation. Low priority — the function/pattern names are correct even if line numbers have drifted.

---

## Confirmed Claims (summary)

**T1 (own codebase) — verified:**
- `simple-git` import at `shadow-repo.ts:16` — exact match
- `start.ts:36-50` auto-init logic with `runInit({ cwd, mcp: false })` — exact match (line 41)
- `sonner.tsx` exists at `packages/app/src/components/ui/sonner.tsx` — confirmed
- `commitUpstreamImport()` with `!oldHead` message branch — confirmed at lines 222-224
- `reconciledBaseByBranch` as in-memory Map — confirmed at `persistence.ts:63`
- `commitUpstreamImport` trigger condition at `standalone.ts:1056` — exact match
- `readServerLock()`, `acquireServerLock()`, `updateServerLockPort()` all exist in `server-lock.ts`
- No existing HEAD-persistence mechanism across restarts — confirmed absent
- `simple-git` is a server dependency (`^3.35.2`) in `packages/server/package.json`
- Four CLI commands (start, init, mcp, preview) registered in `cli.ts` lines 68-80
- Empty-state detection via `documents.length === 0` — confirmed in `FileTree.tsx`
- FR9 trust-pending design (separate from diff mode, project-level boolean) — internally consistent with evidence Q4

**T1 (referenced artifacts) — verified existence:**
- `reports/open-from-github-onboarding-mechanics/REPORT.md` — exists
- `reports/git-library-for-knowledge-platform/REPORT.md` — exists
- `reports/onboarding-multiproject-ux/REPORT.md` — exists
- `specs/2026-04-10-document-timeline-rollback/SPEC.md` — exists

**T3/T4 (3P dependencies):**
- `@napi-rs/keyring` is a new dependency (not in any package.json) — consistent with spec's A2 assumption and smoke test plan
- OAuth App Device Flow does not require `client_secret` — correct per GitHub's documentation and OAuth 2.0 Device Flow spec (RFC 8628)
- `keytar` archived status — confirmed (GitHub repo archived; `@napi-rs/keyring` is the replacement)

**Coherence lenses — no issues found:**
- L2 (confidence-prose): A2 MEDIUM confidence for `@napi-rs/keyring` Bun compat is appropriately calibrated
- L3 (conditionality): No unconditional claims found that should be conditional
- L5 (summary coherence): Problem statement, goals, requirements, and solution are well-aligned
- L6 (stance): Consistently prescriptive throughout (appropriate for spec)
- L7 (source attribution): Code/architecture artifact; no stat-heavy claims requiring inline sources

## Unverifiable Claims

- **OAuth App clientId `Ov23liqlSd0V1MwR6rhI` is registered on `inkeep` org** — cannot verify GitHub org settings from this context. The spec asserts it was registered during intake. If false, Device Flow will fail at runtime.
- **A4: Privacy policy at `https://inkeep.com/policies/privacy` is "suitable for the OAuth App registration"** — spec marks as "verified via web search" but suitability is a legal judgment, not a factual claim. Noted, not flagged.
