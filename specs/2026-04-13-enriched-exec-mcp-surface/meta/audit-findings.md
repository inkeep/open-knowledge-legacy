# Audit Findings

**Artifact:** `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md`
**Audit date:** 2026-04-13
**Total findings:** 12 (3 HIGH, 5 MED, 4 LOW)

---

## High Severity

### [H] Finding 1: FR15 relies on "co-authored-by trailers split into multi-writer attribution" — trailers do NOT exist on the per-writer WIP commits that FR15 reads

**Category:** Factual / COHERENCE
**Source:** T1 (codebase verification)
**Location:** SPEC §6 FR15; D12 rationale.
**Issue:** FR15 says enrichPath reads the last N commits against `<path>` from the shadow bare repo, with each entry containing a writer and "Co-authored-by trailers split into multi-writer attribution." Per-writer WIP commits written by `commitWip` (`packages/server/src/shadow-repo.ts:128-204`) only carry a single `GIT_AUTHOR_NAME`/`EMAIL` and never emit `Co-authored-by:` trailers. Co-authored-by trailers are ONLY emitted by `saveVersion` at `packages/server/src/shadow-repo.ts:436-448`, which writes to the *project* repo's HEAD, not to per-writer WIP refs. The shadow checkpoint ref that lands in the shadow repo at `saveVersion` time may include them on the checkpoint commit, but the "recent activity history per path" surface is fed by WIP refs (which is where per-writer, per-edit-burst attribution actually lives).
**Current text:** "Co-authored-by trailers split into multi-writer attribution." (FR15 notes)
**Evidence:** `packages/server/src/shadow-repo.ts:128-204` (commitWip — no trailers), `:436-448` (saveVersion — trailers only on project HEAD commit).
**Status:** CONTRADICTED
**Suggested resolution:** FIX — either (a) drop the trailer-splitting language from FR15 (per-WIP-ref commits already have single-writer attribution via author name/email, which is sufficient for the "agent vs human" differentiator); or (b) if multi-writer Save-Version commits are also a target for enrichment, specify that only the *checkpoint* ref walk includes trailer parsing while WIP-ref walks do not.

### [H] Finding 2: The "/api/shadow-log" endpoint reading per-path history from the shadow bare repo is architecturally under-specified — shadow refs are per-writer-per-branch, not per-file

**Category:** Coherence / Completeness
**Source:** L3 / L4 (design coherence)
**Location:** SPEC FR15, D12, §16 SCOPE (DEP-1).
**Issue:** FR15 says `/api/shadow-log?docName=X&limit=N` returns history "against `<path>`" from the shadow bare repo. The shadow bare repo stores per-writer WIP refs (`refs/wip/<branch>/<writer-id>`) — each writer has their own linear history of commits covering the whole tree. To produce a unified "history of path P" view, the server must either: (a) walk all writer refs for the current branch and merge by commit timestamp (with de-duplication, since distinct writer refs are independent linear histories), or (b) rely on the checkpoint commits (which are taken only at Save Version time, much coarser). The spec does not pick between these, and simple-git `.log({ file })` against a bare repo without specifying refs defaults to HEAD — and the shadow bare repo's HEAD is not the semantically correct ref for this query. This is a load-bearing architectural gap since FR15 is the whole differentiator (D12: "the whole point").
**Current text:** FR15: "shadow-repo.ts` already exposes the bare repo; new HTTP endpoint `/api/shadow-log?docName=X&limit=N&since=...` reads via `simpleGit` against it."
**Evidence:** `packages/server/src/shadow-repo.ts:40-49` (shadowGit factory), `:128-204` (WIP ref layout), `shadow-branch-gc.ts:32-45` (ref-namespace scheme).
**Status:** INCOHERENT / UNVERIFIABLE
**Suggested resolution:** REOPEN-DECISION (D12) — add a sub-decision specifying which ref(s) the shadow-log query walks, how multi-writer refs are merged into a single chronological view, and how the current branch is resolved. This affects `/api/shadow-log` response schema (ASK_FIRST in §16) and the DEP-1 impl scope. Without this, A2's verification plan ("wires `/api/shadow-log` endpoint") is not reachable.

### [H] Finding 3: FR7 promises enrichment "fields present" on single-path `exec("cat X.md")` that the stated data sources cannot deliver in v0

**Category:** Coherence
**Source:** L1 / L3
**Location:** FR7 ↔ FR14 ↔ D11 ↔ §14 risk row (shrunk enrichment).
**Issue:** FR7 says `exec("cat X.md")` achieves CC9 parity with `read_document` via fields including title, description, tags, catalogCategory, backlinkCount, and recent-activity history. FR14 says multi-path enrichment drops `modified` and per-path `backlinkCount`. D11 is described as "no `modified`, no per-path `backlinkCount` on multi-path output." But §9 defines `EnrichedMeta { title, description, tags[], backlinkCount, modified, catalogCategory, path }` — which *still includes* `modified`. Between FR7 (single-path includes what read_document has), FR14/D11 (multi-path drops modified/backlinkCount), and §9 `EnrichedMeta` (unconditionally includes both), there is no clear statement of what the v0 single-path shape actually is. `read_document` today does NOT surface `modified` at all (per evidence/enrichment-data-gaps.md §1, confirmed at `packages/cli/src/mcp/tools/read-document.ts:139-144` — no `fs.stat` or equivalent in the Promise.all), so "parity with read_document" is trivially achievable without `modified`, but the spec's `EnrichedMeta` type then includes a field that is never populated.
**Current text:** §9: "`EnrichedMeta { title, description, tags[], backlinkCount, modified, catalogCategory, path }`" vs FR14: "**Excluded:** `modified` (no current fs.stat plumbing)".
**Evidence:** `packages/cli/src/mcp/tools/read-document.ts:139-170`; evidence/enrichment-data-gaps.md §1.
**Status:** INCOHERENT
**Suggested resolution:** FIX — update §9's `EnrichedMeta` to remove `modified` (and note it is §15 Future Work), or split into two typed shapes `EnrichedMetaFull` vs `EnrichedMetaMulti`. Clarify FR7 to list fields explicitly so "parity with read_document" is measurable.

---

## Medium Severity

### [M] Finding 4: §16 SCOPE for the `exec` impl PR contradicts the stated exclusion of server/ work

**Category:** Coherence
**Source:** L1
**Location:** SPEC §16 Agent constraints.
**Issue:** The `exec` impl PR's SCOPE is cli-only. Its EXCLUDE says "`packages/server/` **except** the `/api/shadow-log` endpoint wiring that lands in DEP-1 — not in the `exec` PR itself." The exception phrasing is self-contradictory ("except the endpoint wiring — not in the exec PR itself"); the endpoint is in DEP-1 (the separate PR whose SCOPE explicitly includes `server/src/api-extension.ts`). Cleaner: the `exec` PR has zero `server/` SCOPE; the server edit lives entirely in DEP-1.
**Current text:** "**EXCLUDE:** `packages/server/` **except** the `/api/shadow-log` endpoint wiring that lands in DEP-1 — not in the `exec` PR itself"
**Status:** INCOHERENT
**Suggested resolution:** FIX — simplify EXCLUDE to "`packages/server/`, `packages/app/`, `packages/core/`, ..." and strike the "except" clause. DEP-1 PR scope already owns the endpoint.

### [M] Finding 5: A2 verification plan references work products that cross PR boundaries in a way the plan does not address

**Category:** Traceability
**Source:** L5 / Gate-violation
**Location:** §12 Assumptions A2; §16 DEP-1 SCOPE; §13 In Scope gate.
**Issue:** A2 says "Before V0-24 impl: confirm PR exists, extracts shared helper, wires `/api/shadow-log` endpoint, updates `read_document` in tandem." The DEP-1 §16 SCOPE lists these plus FR15 shape, and its STOP_IF says "shadow-repo read perf is >100ms per doc on typical content dirs — escalate." But there is no acceptance criteria anywhere that says how `enrichPath`'s *output schema* is verified bit-identical between DEP-1's `read_document` and `exec`'s consumption — which is precisely the CC9 parity claim. Per the Resolution completeness gate ("Acceptance criteria are verifiable — an implementer could write tests from them"), FR7 says "Enrichment fields present" but not the exact shape, field order, or null semantics.
**Status:** INCOHERENT / Gate-violation
**Suggested resolution:** FIX — add a parity acceptance criterion to FR7: a golden-output test asserting `exec("cat X.md").enrichedPaths[0]` is deep-equal to `read_document({path:"X.md"})`-derived enrichment (minus the raw content body) for a fixture file.

### [M] Finding 6: D6 (allowlist), D7 (parser), D8 (path extraction), D9 (output cap) are all INVESTIGATING — Resolution completeness gate violated for In Scope

**Category:** Gate-violation
**Source:** L6 / gate
**Location:** §10 Decision log; §13 In Scope gate.
**Issue:** The spec's §13 "In Scope" requires "All decisions that affect this item have been made (not deferred, not assumed)" and "3rd-party dependency selections are named and justified (not 'use something that does X')." Four decisions are explicitly INVESTIGATING: D6 (allowlist members), D7 (`shell-quote` vs hand-rolled vs alternatives), D8 (path-extraction strategy), D9 (output size cap). D7 in particular is the load-bearing security dependency — spec says "candidate: `shell-quote`" but §12 A2 / §16 ASK_FIRST presume shell-quote is already selected. The audit request specifically asked to verify "shell-quote confirmed" — it is *named* but not *locked* in the Decision Log.
**Current text:** D7: "INVESTIGATING — Candidates: `shell-quote`, hand-rolled, wasm-based"; §16 ASK_FIRST: "adding a new 3P dependency beyond `shell-quote`".
**Status:** INCOHERENT (gate)
**Suggested resolution:** REOPEN-DECISION — either resolve D6-D9 to LOCKED before the spec is considered complete, or explicitly move them to Q1/Q2/Q3/Q6 (which already exist as P0 Open Questions) and have the gate block closure until OQs resolve.

### [M] Finding 7: §5 User journeys and Interaction state matrix are empty — §1-§4 flag these as P0 content

**Category:** Completeness
**Source:** L5
**Location:** §5 User journeys.
**Issue:** §5 says "*(to be drafted; see USER_JOURNEYS.md if split out)*" and the interaction-state matrix has exactly one partially-filled row ("reject with allowlist hint") out of 20 cells. For a spec whose central UX claim is "agents prefer `exec` over native Bash," user journeys are load-bearing — they define what "win" looks like. Per §7 metric 1, the target is ">50% of reads/lists/searches via `exec` within 30 days," which requires journeys to be concrete enough to shape the tool description and INSTRUCTIONS.
**Status:** INCOHERENT (thin section)
**Suggested resolution:** FIX — either draft 2-3 journeys (find-and-read, grep-and-triage, list-and-open) or explicitly mark §5 as "not required at v0 draft" and justify. The interaction-state matrix should be filled since the error/empty/success cases gate FR2/FR8/FR9.

### [M] Finding 8: The "N-amplification" mitigation for multi-path backlinkCount is under-specified and contradicted across sections

**Category:** Coherence
**Source:** L1
**Location:** FR14 vs evidence/enrichment-data-gaps.md §2 vs §15 Future Work (Explored).
**Issue:** FR14 *excludes* per-path `backlinkCount` on multi-path output to avoid N-amplification. §15 Future Work (Explored) says "`backlink-index.ts:30-33` already maintains `backward: Map<string, Map<string, ...>>` — a count endpoint is a one-liner (`.get(docName)?.size ?? 0`)." If the count endpoint is a one-liner, the stated rationale for deferring per-path backlinkCount (N-amplification on a 20-entry `ls`) is weak: 20 calls against an in-memory Map are microseconds, not milliseconds. The decision becomes about endpoint shape (single doc vs batch) rather than latency. The actual bottleneck is the per-call HTTP round-trip over localhost, which a batch endpoint would resolve — and batch is already enumerated in evidence. Verified against code: `packages/server/src/backlink-index.ts:30-33` does maintain `backward: Map<string, Map<string, string | null>>` — confirming the one-liner claim.
**Current text:** FR14: "N-amplification risk — single full-array HTTP call per path"; §15: count endpoint is a "one-liner."
**Evidence:** `packages/server/src/backlink-index.ts:30-33` confirmed.
**Status:** INCOHERENT
**Suggested resolution:** NOTE / FIX — either tighten FR14's rationale (it's about batch vs per-path HTTP RTT, not about compute) or promote the one-line count endpoint into DEP-1 scope. Current framing underweights the cheap fix.

---

## Low Severity

### [L] Finding 9: Tool count in §1 ("14+") vs worldmodel enumeration (15)

**Category:** Factual
**Source:** T1
**Location:** §1 Problem statement vs evidence/worldmodel.md §1a.
**Issue:** §1 says "14+ semantic tools"; worldmodel enumerates 15. Minor imprecision — the "14+" is not technically wrong, but a reader comparing to evidence will notice.
**Status:** STALE
**Suggested resolution:** NOTE — update to "15 semantic tools" for consistency with evidence.

### [L] Finding 10: INSTRUCTIONS line-number citation slightly off

**Category:** Factual
**Source:** T1
**Location:** §8 Current state: "Current INSTRUCTIONS (line 42+)".
**Issue:** Confirmed — `server.ts:42` starts the `const INSTRUCTIONS = ` template literal; the specific "prefer read_document over native Read" line is at `:53`, "search over native Grep" at `:54`. Not wrong, just imprecise.
**Status:** CONFIRMED (with minor imprecision)
**Suggested resolution:** NOTE — optional precision fix.

### [L] Finding 11: §15 Future Work (Explored) item says "Shadow-repo history was previously listed here; now promoted in scope per D12" — parenthetical is ambiguous about what remains explored

**Category:** Completeness
**Source:** L6
**Location:** §15 Future Work (Explored) bullet 2.
**Issue:** The bullet title is "Richer `EnrichedMeta` shape: filesystem `modified` + efficient multi-path `backlinkCount`" but then says "Shadow-repo history was previously listed here; now promoted in scope per D12." A cold reader may think shadow-repo history is still partially in Future Work — it isn't (per D12 it's fully in scope for v0 via FR15).
**Status:** Low-severity wording
**Suggested resolution:** FIX — drop the parenthetical, or make the removal explicit in the changelog rather than inline in the Future Work entry.

### [L] Finding 12: NG7 about streaming is listed twice in Non-goals and Risks — minor stylistic redundancy

**Category:** Completeness
**Source:** L6
**Location:** §3 NG7; §14 risk table.
**Issue:** Not actually a duplicate — NG7 is the non-goal and §14 doesn't have a streaming entry. No issue. (Skip.)
**Status:** Dismissed on re-read.
**Suggested resolution:** none.

---

## Confirmed Claims (summary)

Verified factual claims that check out:
- **MCP SDK 1.29.0 supports `structuredContent` + `outputSchema`** — confirmed at `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:154, 257, 270`.
- **`WriterIdentity` id prefixes `human-`/`agent-`/`upstream`/`server`** — confirmed at `packages/server/src/shadow-branch-gc.ts:38` (regex), `shadow-repo.ts:208-212` (UPSTREAM_WRITER literal).
- **`backlink-index.ts` maintains `backward: Map<string, Map<string, string | null>>`** — confirmed at `packages/server/src/backlink-index.ts:30-33`. (Spec says `Map<string, Map<string, ...>>`; evidence matches.)
- **`simple-git` already a dependency** — confirmed at `packages/server/src/shadow-repo.ts:15`.
- **`runShell` uses shell, `grep`/`gitLog` use execFile** — confirmed at `packages/cli/src/bash/index.ts:109-116, 140-154, 186`.
- **`cat` path-traversal guard** — confirmed at `bash/index.ts:125-131` (`!abs.startsWith(projectDir + '/')`).
- **`read_document.ts:139-144` Promise.all parallel pattern** — confirmed.
- **15 MCP tools registered** — confirmed by `ls packages/cli/src/mcp/tools/` (14 tool files + shared + index + tests).
- **No `/api/shadow-log` endpoint today** — confirmed by `api-extension.ts:1153-1174` route map.
- **`config.mcp.tools.read_document.historyDepth` default 5** — confirmed at `packages/cli/src/config/schema.ts:37-55`.

## Unverifiable Claims

- **Shell-quote library capabilities** — audit scope didn't run T3/T4 for `shell-quote` API (subshell / redirection detection). D7 INVESTIGATING status means the spec has not pinned this either, so it's correctly marked as pending.
- **"30-day post-ship telemetry" feasibility** — spec cites this as the A1 verification; no current telemetry substrate was audited. SPEC Q9 tracks this open question.
- **D12's "hybrid" recommendation from `reports/just-bash-virtual-filesystem-analysis/` at cited line numbers** — evidence file cites REPORT.md:54, :461, :517; these were not independently re-read cold. Accepted as cited.
