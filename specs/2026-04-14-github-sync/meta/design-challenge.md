# Design Challenge Findings

**Artifact:** specs/2026-04-14-github-sync/SPEC.md
**Challenge date:** 2026-04-15
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H] Finding 1: WIP auto-commit noise will poison shared branch history on origin

**Category:** DESIGN
**Source:** DC1 (Simpler alternative) + DC2 (Stakeholder gap — developer persona P2, team workflows)
**Location:** §6 FR22 (dual-write at L2), §6 FR24 (auto-push), §10 D20 (auto-sync aggressiveness), §10 D25 (WIP auto-save message), §13 Risks ("Auto-commits produce git log noise on origin")
**Issue:** The spec commits to the user's branch on every L2 flush (~30s idle debounce), then pushes to origin every ~120s. This produces 2-4 `"WIP auto-save 2026-04-15T10:32:00.000Z"` commits per push cycle — potentially dozens per hour of active editing — directly on the shared remote branch (e.g., `origin/main`). The spec acknowledges this as a MEDIUM-likelihood, MEDIUM-impact risk and accepts it for v1 citing Obsidian-Git precedent.

**Current design:** "Auto-commit message matches shadow verbatim: `WIP auto-save ${ISO timestamp}`" (D25). "Accept for v1 (Obsidian-Git precedent); F8 Future Work if user complaints" (Risk register).

**Alternative:** The Obsidian-Git precedent is weaker than presented. Obsidian-Git defaults to 10-minute commit intervals (not 30s) and the Obsidian community extensively documents complaints about git log pollution — it is one of the most common pain points in forum threads, subreddit discussions, and GitHub issues. More importantly, Obsidian-Git's primary use case is personal vaults (single-user), not shared team branches. The spec's primary persona (P1: non-dev at a B2B SaaS company) is editing a *shared team repo*, which amplifies the noise problem:

- `git log` becomes unusable for developer teammates (P2) — real commits buried under WIP noise
- `git blame` points to "WIP auto-save" instead of meaningful context
- CI/CD triggers on every push (GitHub Actions charges per-minute; webhooks fire)
- PR diffs and review history become polluted if the team uses feature branches

A credibly simpler alternative exists: **commit to a local staging ref (e.g., `refs/ok-wip/<branch>`) and squash into a single commit before each push**. The push would produce one commit per sync cycle ("Auto-save: 3 files changed") instead of N. This preserves the fine-grained local history (shadow repo already has that) while keeping the remote branch clean. The squash is ~10 LOC on top of the existing `commitWip` plumbing (it already composes tree hashes and creates commits with arbitrary parents).

A second alternative (even simpler): **only commit to parent git on Save Version (user-initiated), and let L2 dual-write only go to shadow**. Auto-push still pushes whatever is on the branch. This produces zero auto-commit noise — users get "cloud sync" semantics for their intentional saves only. The shadow repo preserves the continuous backup story.

**Trade-off:**
- *Squash-before-push:* Adds ~50-100 LOC complexity. Loses per-keystroke granularity on remote (but shadow retains it). Team sees clean, meaningful history. CI/CD fires less often. P2 developers trust the tool.
- *Save-Version-only parent commits:* Simplest. No remote noise at all. But non-devs (P1) must remember to Save Version for changes to reach origin, which contradicts the "invisible cloud sync" promise of G5.
- *Current design (accepted noise):* Simplest implementation but creates a real problem for the stated primary use case (team repos). The "revisit if user complaints surface" mitigation means shipping a known-bad experience and waiting for churn signal.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether squash-before-push (one commit per push cycle) achieves G5's "automatic" promise while respecting G6's "developers' existing git workflows remain unaffected." The spec already has the plumbing concepts needed — `commitWip` with configurable refs + tree hash computation. This is architecturally lightweight and avoids the most common complaint from the prior art the spec itself cites.

---

### [H] Finding 2: Race condition window between L2 dual-write and sync-engine push is under-specified

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — SRE perspective, distributed-systems failure modes)
**Location:** §6 FR22 (dual-write), §6 FR24 (auto-push), §6 FR25 (rejected-push recovery), §9 Architecture overview, §9 Failure modes
**Issue:** The spec describes two independent async processes writing to the same parent git branch:

1. **L2 dual-write** (`commitToWipRef()` in persistence.ts): commits to `refs/heads/<branch>` on the ~30s idle debounce.
2. **Sync engine** (FR21-FR25): fetches, merges, and pushes on the ~120s interval.

These processes interact through the same parent git ref but the spec doesn't specify mutual exclusion. Several concrete race scenarios are under-specified:

**Race A — Sync push during L2 commit:** If the sync engine starts a push while `commitToWipRef()` is mid-flight (between `write-tree` and `update-ref`), the push reads a stale ref. The push succeeds with an older tree; the `update-ref` then advances the local ref past what was pushed. Next cycle, the sync engine sees "ahead 1" and pushes again — benign but creates an extra remote commit.

**Race B — Sync merge during L2 commit:** More dangerous. Sync engine does `git merge origin/<branch>` which advances `refs/heads/<branch>`. Meanwhile, L2's `commitToWipRef` is building a commit whose parent was the *pre-merge* ref. The `update-ref` at the end of `commitToWipRef` rewrites the branch ref to point to the new commit — whose parent is the pre-merge state. This effectively *undoes the merge* by orphaning the merge commit. The content from the remote is lost locally until the next fetch+merge cycle, at which point it conflicts.

**Race C — User `git commit` during sync cycle:** A developer (P2) stages and commits from CLI while the sync engine is mid-push or mid-merge. The HEAD watcher detects the change (via `.git/HEAD` or `.git/index.lock`), fires BatchBegin, which flushes L1/L2. But L2 flush and sync engine push are not coordinated — the flush might commit content that includes partial merge state.

**Current design:** "Dual-write drift bounded to 1 interval (shadow-first, parent-retry)" (§6 NFR Reliability) and "If parent commit fails, retry on next cycle (bounded drift: at most one interval)" (FR22). The failure modes table lists "Dual-write partial failure" but not concurrent-access races between the dual-write and the sync engine.

**Alternative:** Serialize all parent-git mutations through a single async queue (similar to how `commitInFlight` + `pendingAfterCommit` already serializes shadow commits in persistence.ts). The sync engine and L2 dual-write should share a `parentGitMutex` — any operation that reads-then-writes the parent branch ref must hold exclusive access. This is a small addition (~30 LOC mutex wrapper) that eliminates an entire class of race conditions.

Investigation of `persistence.ts` confirmed: the existing `commitInFlight` pattern serializes shadow commits but does NOT extend to parent git. The `saveVersion()` function in `shadow-repo.ts` also has no locking against concurrent `commitWip()` calls — it independently reads and writes WIP refs. Adding a second git target (parent) to this uncoordinated access amplifies the risk.

**Trade-off:** A parent-git mutex adds a small serialization cost (operations wait for each other instead of running concurrently). Given that individual git plumbing operations complete in <100ms and the sync interval is 120s, this cost is negligible. The alternative — debugging race-condition-induced merge loss in production — is substantially more expensive.

**Status:** CHALLENGED
**Suggested resolution:** Add a `parentGitMutex` requirement to FR22 and FR21b. All parent-git mutations (L2 dual-write commit, sync fetch+merge, sync push, Save Version parent commit, rollback parent commit) must serialize through a single queue. Document this as a concrete FR or add it to D26's implications. The spec's existing `commitInFlight` pattern for shadow is the right template — extend it to parent.

---

## Medium Severity

### [M] Finding 3: Unified-mode-only conflict resolution omits spatial context non-devs need

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — P1 non-developer UX)
**Location:** §10 D27 (conflict resolver: unified-mode DiffView + mergeControls), §6 FR27 (conflict resolver UI), evidence/codemirror-merge-controls-fitness.md
**Issue:** D27 locks to unified mode with per-hunk accept/reject. The evidence file confirms `mergeControls` is unified-view-specific and per-chunk granularity only. For the P1 persona (non-developer knowledge worker), unified mode diffs present changes as inline deletions and insertions within a single document — a format that requires understanding diff notation (red strikethrough = removed, green highlight = added) to parse.

The evidence file's own finding notes: "For non-dev conflict resolution where hunks may contain mixed desirable/undesirable content, per-chunk is potentially too coarse. Users would need to manually edit before accepting." The file also shows no 3-way merge support — base is not visible alongside ours/theirs.

**Current design:** "unified-mode DiffView + custom mergeControls render function... providing styled [Keep mine]/[Keep theirs] buttons per hunk. Per-chunk granularity." (D27)

**Alternative:** The [Keep my version] / [Keep team's version] per-file buttons (FR27) are the right abstraction for P1 — they don't require understanding diffs at all. But [Resolve manually] drops P1 into the same unified diff view that requires diff literacy. For the non-dev primary persona, "Resolve manually" effectively means "ask a developer for help," which contradicts G5's promise of collaborating "without ever typing a git command."

Consider: (a) making [Resolve manually] a P2-targeted escape hatch with explicit framing ("This requires reviewing individual changes — you may want to ask a teammate"), or (b) adding a simpler "compare versions" side-by-side view (using the existing DiffView split mode, read-only) before the merge controls view, so non-devs can see the two complete versions and choose a whole-file resolution with more context. The existing DiffView already supports split mode for timeline preview.

**Trade-off:** Adding explicit P1/P2 differentiation to the conflict resolver is low-cost (conditional copy/framing) and prevents P1 abandonment at the conflict resolution step. The risk of the current design is that P1 users facing a conflict click [Resolve manually], see an unfamiliar diff view, and either make incorrect resolutions or abandon editing entirely.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine D27's UX for the P1 persona specifically. Consider whether [Resolve manually] needs guardrails, an intermediate "compare versions" step, or explicit developer-targeted framing. The per-file [Keep mine]/[Keep theirs] is the non-dev path; [Resolve manually] should be clearly positioned as an advanced option.

---

### [M] Finding 4: sync.intervalSeconds=120s default creates a 2-4 minute round-trip that may surprise "cloud sync" users

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — P1 expectations vs. actual behavior)
**Location:** §6 FR21 (remote detection + interval), §6 FR23 (background fetch), §7 M5 (sync round-trip latency target), §5 J5 (happy-path collaboration)
**Issue:** The spec targets "cloud sync" semantics for P1 (§1 Resolution: "Continuous auto-sync layer modeled on Linear/Figma/Notion"). But Linear/Figma/Notion sync in <5 seconds — they use WebSocket/real-time channels, not interval polling. The spec's architecture produces a round-trip of:

- L1 save: 2-10s debounce
- L2 commit: 30s idle debounce
- Sync push: up to 120s interval (102-138s with jitter)

Total worst-case: user edits → ~160s before the change reaches origin. Best-case (edit just before L2 flush, flush just before sync interval): ~5s. M5 targets "<3 minutes p50" which confirms this is expected.

For the P1 persona who expects Linear/Notion "cloud sync" behavior, a 2-3 minute delay before teammates see changes (and before the user's changes are "safe" on the remote) is a meaningful expectation gap. The status badge showing "Synced" after each push cycle may mask the delay — P1 sees "Synced" and assumes it means "teammates can see my changes now," but there's a multi-minute pipeline before changes actually reach origin.

**Current design:** "sync.intervalSeconds: 120" (FR21, FR34). "Last synced 2 min ago" in badge popover (FR35).

**Alternative:** The 120s default is reasonable for minimizing server/API load and git operations, and the spec correctly applies jitter. But the gap between "cloud sync" framing and actual behavior could be closed with: (a) a shorter default (e.g., 30-60s) for the push cycle specifically (fetch can stay at 120s since inbound changes are less urgent), or (b) more transparent UX framing — "Changes saved locally, syncing to GitHub in ~2 min" instead of "Synced" badge that implies real-time.

The spec's own research notes that Syncthing uses 60s and GitHub Desktop uses 60s+30s jitter. SiYuan uses 30s for its primary sync interval. 120s is on the conservative end of the surveyed range.

**Trade-off:** A shorter push interval (e.g., 30-60s) increases GitHub API/network load proportionally but closes the expectation gap. Alternatively, keeping 120s but adjusting the UX copy to set accurate expectations is zero-cost and honest. The risk of the current design is user confusion, not data loss — but confusion erodes trust in the "cloud sync" promise.

**Status:** CHALLENGED
**Suggested resolution:** Consider whether the 120s default should be shorter for the push-specifically path (decouple push interval from fetch interval), or whether the badge UX needs more transparent timing language. The "Synced" badge state implies real-time; "Saved to GitHub 2 min ago" would be more accurate. This is a product-level judgment call on expectation-setting vs. API load.

---

### [M] Finding 5: Shadow-parallel principle creates coupling pressure without clear architectural boundary

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** §14 "Shadow-parallel architectural principle," §14 Future Work F10-F13, FR21b/FR21c/FR27 shadow-parallel annotations
**Issue:** The spec introduces a new architectural principle: "before introducing any new persistent state, scheduler mechanic, error handling, or UI primitive for parent-git, first ask: Does shadow already do this?" This principle is annotated throughout the FRs (FR21b "shadow-parallel: matches shadow L2's existing pattern," FR21c "shadow-parallel pattern: `last-known-head` is the precedent," FR27 "shadow-parallel: same ConflictResolver UI for both").

While reuse is generally good, this principle creates coupling pressure between two subsystems with fundamentally different purposes:
- **Shadow repo:** Internal attribution journal. Local-only. Never pushed. Per-writer granularity. Server-owned identity.
- **Parent git:** User-visible collaboration surface. Pushed to remote. Shared branch. User identity. External consumers (CI/CD, teammates, GitHub UI).

These subsystems have different failure modes (shadow is Class 5 local-only; parent has all 5 classes including network), different identity models (D29), different ref models (evidence/shadow-pipeline-reusability.md confirms parent is "flatter"), and different privacy expectations (shadow is internal; parent is shared).

The principle's 3-question test is sound in isolation, but as documented it reads as "shadow is the template; parent conforms." This risks:
- Importing shadow's limitations to parent (e.g., no per-ref locking, no concurrent-access protection — see Finding 2)
- Making it harder to optimize parent-git operations independently (e.g., parent might benefit from batched commits that shadow doesn't need)
- Future Work items F10-F13 propose making shadow more like parent (adding persistence, conflict UI, error classification, pause/resume) — but the principle says parent should look like shadow, creating a circular dependency

**Current design:** "Shadow-parallel architectural principle (new precedent)... before introducing any new persistent state, scheduler mechanic, error handling, or UI primitive for parent-git, first ask: (1) Does shadow already do this? → reuse its primitive directly."

**Alternative:** The reuse insight from evidence/shadow-pipeline-reusability.md is correct and valuable — `commitWip()` taking a `GitHandle` is elegant. But the *principle* should be "shared primitives serve both targets" rather than "shadow is the template." The `GitHandle` abstraction already captures this — it's not "shadow with a different target," it's "a git target that both shadow and parent instantiate." Frame the principle as: "Extract shared primitives when shadow and parent need the same operation; diverge explicitly when their requirements differ (identity, locking, remote ops, failure handling)."

**Trade-off:** Reframing is editorial, not architectural. The code path (shared `GitHandle`, shared `commitWip`) stays the same. What changes is implementer guidance: instead of "does shadow do this?", ask "does a shared primitive serve both?" This avoids importing shadow's local-only assumptions to a network-facing subsystem.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether the shadow-parallel principle's framing creates an implicit hierarchy (shadow = template, parent = follower) that could mislead implementers. Consider reframing as a shared-primitive principle rather than a shadow-first principle. The concrete code reuse (GitHandle, commitWip parameterization) is sound regardless.

---

## Low Severity

### [L] Finding 6: Trust gate removal is justified but the "future revisit triggers" may be too narrow

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — security engineer perspective)
**Location:** §10 D9 (WITHDRAWN), §13 "Trust gate consideration (rejected)"
**Issue:** The trust gate removal is well-reasoned. Investigation confirms the config schema has zero code-execution power (verified: Zod schema contains only bounded integers, validated strings with strict regex, and glob pattern arrays; YAML parsing uses no custom tags or constructors; no `eval`/`spawn`/`require` in config-driven paths). The precedent check is accurate (non-dev tools universally lack trust gates). The decision is sound for current state.

However, the "future revisit triggers" list three conditions, all focused on config schema evolution. A security engineer would note two additional vectors that don't involve config changes:

1. **MCP tool expansion.** The spec adds new MCP-accessible endpoints (`/api/sync/trigger`, `/api/sync/resolve-conflict`) that can modify parent git state. If MCP tools are exposed to untrusted agents (cloned repo contains agent instructions that trigger sync operations), the attack surface is the tool, not the config. This is mitigated by the existing `127.0.0.1` bind + Origin check (FR18), but the trust gate's revisit triggers don't mention MCP tool surface area growth.

2. **Content-as-code.** If Open Knowledge ever supports executable content (MDX with live components, Remotion-style code blocks, custom plugins that process markdown), the cloned content itself becomes an execution vector. The config is inert, but the content may not always be.

**Current design:** "Future revisit triggers: (1) config grows execution surfaces; (2) concrete threat model for agent-write amplification; (3) users explicitly request review-before-editing."

**Alternative:** Add two more triggers: (4) MCP tool surface grows to include operations with side effects beyond the local content directory (e.g., network requests, file system access outside contentDir); (5) content rendering gains code execution capability (plugins, custom components, embedded scripts).

**Trade-off:** This is a documentation addition only. No code or architecture change. The existing security posture is correct for current state.

**Status:** CHALLENGED
**Suggested resolution:** Expand the "future revisit triggers" list in §13 to include MCP tool surface area growth and content-as-code execution vectors. Both are more likely vectors for a trust gate than config schema evolution.

---

### [L] Finding 7: Protected-branch happy-path-only (D22) may create a P1 dead end with no recovery path

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap — P1 non-developer experience)
**Location:** §10 D22 (protected branches: sync disabled), §3 NG3, §5 J10 (protected-branch refusal journey)
**Issue:** When a P1 non-developer hits a protected branch on a team repo, the spec's J10 journey ends with: "Can't sync to `main` — it's a protected branch. To contribute, use git CLI to create a branch and open a pull request. [Learn more]." Sync is disabled permanently (`sync.enabled=false` persisted to workspace config).

For P1, this is a dead end: they cannot use git CLI (by persona definition), and the recovery requires developer intervention to either (a) remove branch protection, (b) set up a non-protected branch, or (c) help P1 use git CLI. The "Learn more" link doesn't help a non-developer. The spec acknowledges this via NG3 ("Revisit if: significant customer demand for protected-branch workflows").

**Current design:** "auto sync with origin main on or off. Nothing in between." (D22 rationale citing Nick direction)

**Alternative:** This is correctly scoped for v1 — the alternative (auto-create-user-branches + auto-PR) is substantial scope. The challenge is not the decision but the *recovery UX*. The toast message could be more actionable: instead of "use git CLI," suggest "Ask a teammate to set up a branch for you, or ask them to adjust branch protection settings for this project. [Need help? Share this with a teammate]" with a copyable summary. This acknowledges P1's actual capability without pretending they can use CLI.

**Trade-off:** Copy change only. No architectural impact.

**Status:** CHALLENGED
**Suggested resolution:** Revise J10's error copy to be P1-appropriate — acknowledge that CLI is not in their toolbox and provide a shareable message they can send to a developer teammate. The current copy assumes CLI fluency from a persona defined as CLI-illiterate.

---

## Confirmed Design Choices (summary)

### DC1 (Simpler alternative) — confirmed:
- **Dual-write via GitHandle abstraction** (D26 + evidence/shadow-pipeline-reusability.md): The shared `GitHandle` type with `commitWip` parameterization is the right reuse pattern. A separate sync subsystem would duplicate ~90% of the commit pipeline. Confirmed sound.
- **CLI-canonical auth via subprocess relays** (D17): Single auth implementation in CLI, relayed via `/api/local-op/auth/*`. Simpler than maintaining parallel auth in both CLI and server HTTP. Confirmed sound.
- **v1 without token refresh** (D28): GitHub `gho_` tokens don't expire; non-GitHub forges get re-auth toast (functional, not silent). The evidence file confirms refresh is ~150 LOC Future Work and Git 2.45+ adoption is insufficient for macOS osxkeychain persistence. Correct deferral.
- **Credential helper subcommand** (D28/FR19): `open-knowledge auth git-credential` implementing git's credential-helper protocol is the right pattern — works for all hosts, not just GitHub; no global git config modification; composable with GCM/git-credential-oauth for users who need refresh now. Confirmed sound.

### DC2 (Stakeholder gap) — confirmed:
- **FR18 local-op endpoint security** (127.0.0.1 bind + Origin + path traversal + protocol allowlist + concurrency=1 + timeout + argv-only spawn): Defense-in-depth is thorough and matches standard patterns for local automation endpoints. Confirmed sound.
- **FR31 error classification** (5-class taxonomy with typed retryability): Well-structured. The Temporal-inspired retryable/non-retryable distinction is a genuine advance over prior art (no surveyed git client implements this). Confirmed sound.
- **CC1 sync-status broadcast** (FR30): Extends existing pattern correctly. Pure signal, client re-fetches. No new architectural concepts. Confirmed sound.

### DC3 (Framing validity) — confirmed:
- **Problem statement:** The two sides of the wall (getting content in, getting content out) are genuinely interconnected, not merely co-occurring. Removing Side A (clone) without Side B (sync) produces a product that can onboard users but can't deliver their work to teammates — half a collaboration tool. Removing Side B without Side A requires terminal fluency to even start — no path for P1. The Complication's dimensions are load-bearing. Confirmed valid.
- **Merge rationale:** Merging the two precursor specs was justified. Credential flow, trust gate, subprocess relays, and error handling are genuinely shared surfaces. Separate specs would have produced incoherent cross-references. Confirmed sound.
