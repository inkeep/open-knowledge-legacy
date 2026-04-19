# Backlog — extracted via 3-probe audit

## Extraction method
- Walk-through: each element of the target state → what's uncertain or assumed
- Tensions: conflicting constraints between dimensions
- Negative space: what's conspicuously absent

Every candidate listed without filtering. Priority assigned in triage below. No middle tier (P0 or P2 only).

---

## Walk-through candidates

### Auto-sync loop
- Q1 [Technical, P0] **Auto-commit cadence:** on L1 flush (2-10s), on L2 flush (30s idle), both, or configurable?
- Q2 [Technical, P0] **Auto-commit grain:** one commit per file changed, one commit per batch, or accumulate?
- Q3 [Product, P0] **Auto-commit message format:** literal file list ("Updated X, Y"), count ("3 files updated"), AI-generated, or user-configurable template?
- Q4 [Technical, P0] **Auto-push trigger:** after every auto-commit, on timer, or only after Save Version?
- Q5 [Technical, P0] **Auto-fetch cadence:** 120s default — revisit against research (GitKraken 60s, GH Desktop 3600s, VS Code 180s).
- Q6 [Technical, P0] **Auto-pull merge strategy:** merge, rebase, or fast-forward-only-then-merge?
- Q7 [Product, P2] **Auto-pull timing:** only when user is idle, or anytime, or on user request only?
- Q8 [Technical, P0] **Auto-push persistent-failure behavior:** infinite retry, back off, surface error, disable sync?

### Dual-write L2
- Q9 [Technical, P0] **Atomicity:** shadow commit + parent commit — atomic together or sequential? What if one fails?
- Q10 [Technical, P0] **Recovery state:** if shadow commit succeeds but parent fails (e.g., parent working tree dirty from external stage), how do we recover on next cycle?
- Q11 [Technical, P0] **Drift detection:** how do we know shadow and parent are in sync? Do we need a check or is it inherent from same-source-same-content?
- Q12 [Technical, P0] **Parent-commit file scope:** use `contentRoot` (same as shadow), or whole working tree?
- Q13 [Technical, P0] **Parent-commit message:** same as shadow's or different (shadow has writer-id prefix; parent likely shouldn't)?
- Q14 [Technical, P2] **Parent-commit author:** use user's git config `user.name/.email`, fall back to defaults, or our internal writer identity?

### Save Version enhancement
- Q15 [Product, P0] **Message prompt:** dialog prompts user for message, auto-generates, or both (pre-fill with auto + allow edit)?
- Q16 [Product, P0] **Default message template:** "Save version: <date>"? AI-generated summary? File list?
- Q17 [Technical, P0] **Tag format:** `ok/v<N>` sequential, `ok/<date>`, `save-version/<N>`, something else?
- Q18 [Technical, P0] **Tag collision:** if two users hit Save Version concurrently (different local clones), tag names can collide. Lock-step sequence? Include user prefix?
- Q19 [Technical, P0] **Save Version triggers immediate push vs. next cycle:** inline (blocking) push, or fire-and-forget?
- Q20 [Technical, P2] **Save Version on detached HEAD:** block with error, or allow with warning?

### Credentials / GIT_ASKPASS
- Q21 [Technical, P0] **GIT_ASKPASS implementation:** standalone binary bundled with CLI, node script, or inline script invoked via shell?
- Q22 [Technical, P0] **Distribution:** shipped with `@inkeep/open-knowledge` npm package? Where is it located on disk at runtime?
- Q23 [Technical, P0] **Locked keychain (macOS):** behavior when Keychain requires user unlock mid-sync.
- Q24 [Technical, P0] **No stored token for remote:** user opened a repo whose remote we have no credentials for — what happens?
- Q25 [Technical, P0] **Host resolution:** how does `GIT_ASKPASS` know which host to query keyring for? (Env var from simple-git? Parse from prompt?)
- Q26 [Technical, P2] **Multi-account same host:** user has two github.com tokens — which does GIT_ASKPASS use? (Out-of-scope for v1 per clone spec NG.)

### Sync state machine
- Q27 [Technical, P0] **States:** dormant, synced, syncing, ahead, behind, conflict, offline, auth-error, unknown-error — correct set?
- Q28 [Technical, P0] **Transitions:** what triggers each? (Event-driven transition table.)
- Q29 [Technical, P0] **Persistence across restart:** does the engine remember "I was in conflict" on restart, or re-evaluate from disk state?
- Q30 [Technical, P0] **Who owns the state:** server (single source of truth) with editor + CLI as observers?

### Conflict resolution
- Q31 [Technical, P0] **Where does conflict state live:** in-memory SyncEngine only, or persisted to `<contentDir>/.open-knowledge/conflicts.json`?
- Q32 [Product, P0] **"Keep mine" semantics:** abort merge + keep local, OR commit local + override remote (force-push-with-lease — NG1 says never force)?
- Q33 [Product, P0] **"Keep theirs" semantics:** reset to remote + preserve local in rescue buffer?
- Q34 [Product, P0] **Partial resolution:** user resolves some files mine, some theirs, some via manual merge — is this allowed?
- Q35 [Technical, P0] **File additions collision:** both sides added same-named file — how handled?
- Q36 [Technical, P0] **Deletion collision:** remote deleted file that user edited — conflict flow?
- Q37 [Technical, P0] **CRDT vs. git merge:** can we use our CRDT character-level merge for cases where git's line-level produces conflicts? Or always defer to git?
- Q38 [Product, P0] **Large conflict count:** what if 50 files conflict — UI pagination/search/batch-select?

### UI components
- Q39 [Product, P0] **SyncStatusBadge placement:** between presence and save-version in header, or elsewhere?
- Q40 [Product, P0] **Banner dismissal:** does conflict banner stay until all conflicts resolved? After resolution until next sync succeeds?
- Q41 [Product, P0] **Conflict resolver form factor:** side sheet, full-page panel, modal, inline?
- Q42 [Technical, P0] **`mergeControls: true` customization:** can we style the accept/reject UI, or is it CodeMirror's stock?
- Q43 [Technical, P2] **Large file performance:** 3-way merge on 10K-line file — acceptable?

### Config
- Q44 [Technical, P0] **Config keys finalized:** sync.enabled, intervalSeconds, autoCommit, autoPush, autoPull, commitMessage — any missing or incorrect?
- Q45 [Technical, P0] **Workspace override:** can a repo's `.open-knowledge/config.yml` disable sync or change interval?
- Q46 [Technical, P2] **Per-branch config:** can user set different sync behavior per branch?

### CLI commands
- Q47 [Product, P0] **`open-knowledge sync` semantics:** one-shot (commit + pull + push then exit), or "trigger sync on running server"?
- Q48 [Technical, P0] **Server-required commands:** do push/pull require running server, or work standalone?
- Q49 [Technical, P2] **Output format:** plain text vs JSON vs both (with `--json` flag)?
- Q50 [Technical, P2] **Exit codes on failure:** stable taxonomy for CI scripting?

### CC1 broadcast channel
- Q51 [Technical, P0] **Channel name:** `sync-status` correct? Pattern consistency with `files`, `backlinks`, `graph`.
- Q52 [Technical, P0] **Subscribers:** editor + CLI + MCP? Who needs realtime?
- Q53 [Technical, P0] **Rate limiting:** emit on every state transition, or debounce?

### Server endpoints
- Q54 [Technical, P0] **Endpoint list:** `/api/sync/status`, `/api/sync/trigger`, `/api/sync/conflicts`, `/api/sync/resolve-conflict` — correct set?
- Q55 [Technical, P0] **Sync/trigger semantics:** synchronous (wait until done) or async (fire and return)?
- Q56 [Technical, P0] **Security:** same localhost + Origin check as clone spec's local-op endpoints, or separate?
- Q57 [Technical, P0] **Authentication:** who can call these (anyone on localhost, specific auth token)?

---

## Tensions

- T1 [Cross-cutting, P0] **Auto-push frequency vs. remote history noise.** Frequent pushes create "Updated X every 30s" commits. Should we accept Obsidian-Git-style noise, squash before push, or use a WIP branch?
- T2 [Product, P0] **Save Version vs. auto-commit semantics.** If auto-commit creates parent commits continuously and Save Version also creates one, what's the mental model? Is Save Version a "named checkpoint in a stream of auto-saves" or something stronger?
- T3 [Technical, P0] **Developer escape hatch vs. auto-commit.** Developer wants to `git rebase -i` to clean up history; our auto-commits are ongoing. Do we pause auto-sync during external git ops (HEAD watcher signal)?
- T4 [Technical, P2] **CRDT vs. git merge capability.** CRDT three-way merge at character level is more capable than git's line merge; can we use it for pull-time conflicts? (Complexity risk.)
- T5 [Product, P0] **Trust gate vs. auto-sync.** Should auto-sync be blocked when `trustPending === true`? (Untrusted cloned repo shouldn't auto-push anything.)
- T6 [Product, P0] **Protected branches vs. always-push.** User's branch has GitHub branch protection; auto-push fails. UX: disable auto-push? Prompt for side branch? Surface guidance?
- T7 [Technical, P0] **Multi-user concurrent edits on same branch.** Alice + Bob both editing main. Push races, merge chains, conflict cascades. What's our guarantee?
- T8 [Technical, P2] **CLI manual push vs. auto-sync race.** Dev runs `git push` externally while auto-sync is in flight. HEAD watcher coordinates post-facto but not during.

---

## Negative space (absences)

- A1 [Technical, P0] **Binary files:** auto-commit includes them? Conflict on binaries?
- A2 [Technical, P0] **.gitignore interaction:** parent git's .gitignore vs. OK's content filter.
- A3 [Technical, P2] **Submodules:** unlikely but possible.
- A4 [Technical, P2] **Very large repos:** fetch/push performance.
- A5 [Technical, P0] **Force-pushed remote:** origin rewrote history; auto-pull fails or needs recovery flow.
- A6 [Technical, P0] **Unborn HEAD:** fresh repo with .git/ but no commits.
- A7 [Product, P2] **Network quality signals:** "slow connection" indicators.
- A8 [Technical, P2] **Browser tab close during sync:** server continues? Pauses?
- A9 [Technical, P0] **MCP surface:** do agents get sync access?
- A10 [Technical, P2] **Observability / metrics:** new `/api/metrics/sync` endpoint?
- A11 [Product, P0] **Rollback vs. sync:** Timeline rollback creates a commit — does it get pushed? (Likely yes — it's a commit like any other.)
- A12 [Product, P2] **AI-generated commit messages:** table-stakes in commercial editors per research.
- A13 [Technical, P0] **Interaction with HEAD-drift check on startup:** clone spec's drift check records external HEAD moves; does our sync engine coordinate with it?
- A14 [Technical, P0] **Auto-sync during long-running external git operations:** user runs `git rebase -i` that takes 30s; our sync loop fires mid-rebase.

---

## Priority triage (to user for confirmation)

### P0 — Must resolve in this spec (In Scope)

**Decision gating (resolve first):**
- Q1-Q4 auto-commit cadence/grain/message/push — gates all downstream cadence questions
- Q9-Q13 dual-write atomicity/recovery/scope — gates the core pipeline change
- Q27-Q30 state machine — gates UI signals and CC1 payload
- Q31-Q37 conflict resolution strategy — gates UI design
- Q32-Q33 "Keep mine/theirs" semantics — gates conflict UX copy

**1-way door (needs explicit confirmation):**
- T1 auto-push noise strategy (if we pick WIP-branch, hard to revert)
- T5 trust gate blocks auto-sync
- T6 protected branches UX
- NG1 never-force-push (already locked but reaffirm)

**Cross-cutting:**
- T3 developer escape hatch during auto-sync
- T7 multi-user concurrent edits
- A5 force-pushed remote recovery
- A6 unborn HEAD / fresh repo
- A13 coordinate with clone spec's HEAD-drift check
- A14 sync during long external ops

**UI / UX (P1 persona critical):**
- Q15-Q20 Save Version UX + tag model
- Q38-Q42 conflict resolver form + banner lifecycle
- Q43 large file performance (could be P2 if we set doc-size limits)

**Security / credentials:**
- Q21-Q25 GIT_ASKPASS implementation + no-token / locked-keychain cases

**Configuration:**
- Q44-Q45 config schema + workspace override

**Server + CLI contract:**
- Q47-Q48 CLI command semantics
- Q51-Q57 CC1 channel + endpoint contract + security

**Others:**
- Q5-Q8 fetch/pull strategy + failure backoff
- T2 Save Version vs. auto-commit mental model
- A1 binaries
- A2 .gitignore interaction
- A9 MCP surface
- A11 rollback → push behavior

### P2 — Future work (deferred)

- Q7 auto-pull timing precision (user idle detection)
- Q14 parent-commit author (default to git config; refine later)
- Q20 Save Version on detached HEAD (edge case)
- Q26 multi-account same host (already clone-spec NG)
- Q43 large file 3-way merge performance
- Q46 per-branch config
- Q49-Q50 CLI output format details
- T4 CRDT vs. git merge capability (complexity risk; v1 defers to git)
- T8 CLI manual push vs. auto-sync race
- A3 submodules
- A4 very large repos
- A7 network quality signals
- A8 browser tab close
- A10 metrics endpoint
- A12 AI-generated commit messages (research shows table-stakes; but punt to v2)

---

## Decision ordering

Proposed sequence for the iterative loop:

1. **Mental model first (T2, Q1-Q4, Q15-Q19):** resolve auto-commit vs. Save Version semantics. This anchors everything else.
2. **Core pipeline (Q9-Q13, A13):** dual-write atomicity + coordinate with HEAD-drift check.
3. **Credentials (Q21-Q25):** GIT_ASKPASS implementation + edge cases.
4. **State machine (Q27-Q30, Q51-Q53):** states + transitions + CC1 shape.
5. **Conflict model (Q31-Q38, Q32-Q33):** where conflicts live + resolution semantics.
6. **UI (Q15-Q20 finalized, Q38-Q42):** Save Version + conflict resolver + badge.
7. **Edge cases (T1, T5, T6, T7, A5, A6, A14, A1, A2, A9, A11):** security boundaries + corner cases.
8. **Contract finalization (Q44-Q48, Q54-Q57):** config + endpoints + CLI.

Priority promote/demote: all dismissed items are P2 by default; user confirmation below will adjust.
