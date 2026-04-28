# Audit Findings

**Artifact:** `specs/2026-04-28-ok-shell-job-runner/SPEC.md`
**Audit date:** 2026-04-28 (re-audit, supersedes earlier in-context pass)
**Total findings:** 25 (5 high, 12 medium, 8 low)

This audit ran the unified protocol: intake (SPEC + meta + 3 source reports + empty `evidence/` directory), reader pass, claim extraction, 7 coherence lenses, and factual tracks T1 (own codebase via Explore subagent at baseline `54443690`), T3 (3P claims via cross-referenced reports), T5 (external claims via cross-referenced reports). A prior audit-findings.md (from 2026-04-28 inline pass) was overwritten — its "verified" claim that *OK already uses SQLite via Hocuspocus* was a false-positive that this audit corrects (see H1). Useful findings from that pass on quote attribution and excluded endpoints are folded in.

The headline issue is **H1 — OK does not currently use SQLite**. The SPEC's choice of SQLite for job-state persistence may still be correct, but it is asserted throughout (D3, D18, D23, A1, §8, NFRs) as reusing an "existing dependency." Codebase verification shows OK persists CRDT state via `simple-git` + on-disk markdown; no `better-sqlite3`, `bun:sqlite`, `@hocuspocus/extension-sqlite`, or any SQL package appears in `packages/server/package.json` or imports. This is decision-implicating: it changes whether D3 is "no new dependency" or "new dependency, justified."

Findings are ordered High → Medium → Low; within a tier, by SPEC.md location.

---

## High Severity

### [H1] SPEC asserts SQLite is an existing OK dependency; codebase shows it is not

**Category:** FACTUAL
**Source:** T1 (own codebase) + L4 (evidence-synthesis fidelity)
**Location:** §6 FR5 (line 114), §8 Current state (line 172), §10 D3 (line 415), §10 D18 (line 430), §10 D23 (line 435), §12 A1 (line 457), §14 (line 495 SQLite WAL mitigation)
**Issue:** The SPEC repeatedly characterizes SQLite as "OK's existing dependency story" or claims OK "already uses SQLite via Hocuspocus." This is factually wrong — OK's persistence is git-based.
**Current text:**
- §8: *"OK has SQLite via Hocuspocus (existing dependency, already used for CRDT state at `<projectRoot>/.git/open-knowledge/`)."*
- D3: *"SQLite is OK's existing dependency story."* + *"OK already uses SQLite via Hocuspocus persistence at `<projectRoot>/.git/open-knowledge/`"* (Evidence column).
- A1 (HIGH confidence): *"OK already uses SQLite via Hocuspocus; no new dependency."*

**Evidence:**
- `packages/server/package.json` deps: `@hocuspocus/server`, `simple-git`, `chokidar`, `yjs`, `pino`, `ws`, `yaml`, `zod`, OTel packages — no `better-sqlite3`, `bun:sqlite` import, `sql.js`, or `@hocuspocus/extension-sqlite`.
- `packages/server/src/persistence.ts` and `shadow-repo.test.ts:37-49` confirm `<projectRoot>/.git/open-knowledge/` is a **git bare repository** (created via `simple-git`), not a SQL database file.
- Repo-wide grep for `sqlite|SQLite` returned only `packages/desktop/scripts/target-fuses.mjs` (Electron Cookies SQLite store, unrelated to OK persistence).
- The previous in-context audit "verified" the SQLite claim by citing AGENTS.md "mentions Hocuspocus persistence; <projectRoot>/.git/open-knowledge/ shadow repo" — that confused Hocuspocus's git-backed persistence with a SQL database. This audit corrects that.

**Status:** CONTRADICTED
**Suggested resolution:** Two options, user must pick:
1. **Keep SQLite, reframe D3 as a new dependency.** Cite Bun's built-in `bun:sqlite` (no compile, no extra dep payload), justify with the same "single-process, file-backed, no infra" reasoning. Update §8 to acknowledge no current SQL footprint. Re-evaluate A1 (see M2). Update §10 D3 evidence column.
2. **Reconsider the substrate entirely.** Plausible alternatives given the actual stack: a JSON-file-per-run state directory under `.open-knowledge/jobs/runs/`, the existing git shadow repo as a write target, or a single append-only JSONL file. SPEC §15 references promoting `jobs.db` to Postgres "in the same backend" — that path makes sense if "the same backend" is the future Postgres index (parity work item #1, not yet adopted), but is incoherent if the SPEC author was assuming a current Hocuspocus SQLite.

This is decision-implicating and surfaces a 1-way-door choice. The user must explicitly confirm the SQLite-as-new-dependency posture before D3/D18/D23 can be considered LOCKED.

---

### [H2] §13 In Scope "Next actions" is stale — lists already-resolved P0 questions as remaining

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §13 (line 470-471) vs §11 Open Questions table (lines 442-451) and §10 D17/D18/D19/D20/D21/D22/D24
**Issue:** §13 instructs the reader to "Resolve remaining P0 open questions: Q1, Q4, Q5, Q6, Q7, Q10" — but the Open Questions table marks every one of those as "Resolved 2026-04-28" via D17/D18/D19/D20/D21/D22, and Q2 is also resolved by D24. After applying the audit-implicating D23/D24 to the table, no P0 questions remain unresolved.
**Current text:** *"Resolve remaining P0 open questions: Q1 (cron-entry indirection), Q4 (worker-crash detection mechanism), Q5 (`--dry-run` mode), Q6 (`schedule:` informational only), Q7 (cwd-only stream isolation), Q10 (env-var inclusion in installed scheduler config). Q2, Q8, Q9 deferrable to implementation; Q3 resolved."*
**Evidence:** §11 entries Q1/Q2/Q4/Q5/Q6/Q7/Q10 all carry `Status: Resolved 2026-04-28` and link to LOCKED decisions in §10.
**Status:** INCOHERENT
**Suggested resolution:** Replace the bullet with a statement that all P0 questions are resolved; only Q8 (P2 deferred) and Q9 (P2 UX detail) remain. Update §13 Next Actions to focus on implementation, tests, and docs — those are the actual remaining steps.

---

### [H3] §6 NFR worker-startup target ("≤ 300ms ... matches GBrain Minions' 753ms goal") mischaracterizes the source

**Category:** FACTUAL
**Source:** T5 (external claim) + L4 (evidence-synthesis fidelity)
**Location:** §6 Non-functional requirements (line 135)
**Issue:** The SPEC frames 753ms as a GBrain "goal" the OK target "matches"; the cited source describes 753ms as the *measured production spawn time* (vs. >10s gateway timeout for sub-agents) and presents it as evidence Minions are categorically faster, not as an aspiration. Also, ≤300ms is *better than* 753ms, so "matches" is internally contradictory.
**Current text:** *"Worker startup ≤ 300ms cold (matches GBrain Minions' 753ms goal but OK has less infra to load)."*
**Evidence:** `reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md` lists *"Spawn: **753ms** vs >10,000ms (gateway timeout)"* under "Metrics on production deployment" — measured, not target.
**Status:** CONTRADICTED
**Suggested resolution:** Reword: *"Worker startup ≤ 300ms cold. GBrain Minions measure ~753ms in production at 45k pages — OK targets <½ that because the runner has no Postgres engine, no resolver, no skills layer to initialize. If OK's measured cold-start exceeds 500ms, treat it as a regression."* Or drop the comparison entirely; OK's target is OK's target.

---

### [H4] §6 FR13 specifies `withSpanSync` for an inherently asynchronous spawn-and-wait operation

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 FR13 (line 122), §9 Observability (line 304), §12 A4 (line 460)
**Issue:** FR13 says each run wraps the `cmd` invocation in an OTel span via `withSpanSync`. But FR4 specifies `node:child_process.spawn` + `AbortSignal` timeout + capturing stdout/stderr until exit — fundamentally async. `withSpanSync` (verified at `packages/server/src/telemetry.ts:181-202`) ends the span synchronously when the callback returns. If the runner returns immediately after spawn, the span ends before the child exits, and the `job.exit_code` / `job.retry_count` attributes can't be set correctly because they don't exist yet at span-close time.
**Current text:** *"FR13: Each run wraps the `cmd` invocation in an OTel span via `withSpanSync`. Span attributes: `job.name`, `job.schedule`, `job.exit_code`, `job.retry_count`."*
**Evidence:** `packages/server/src/telemetry.ts:181-202` — `withSpanSync<T>(name, options, fn): T` is synchronous. The async helper is `withSpan` (referenced in `CLAUDE.md` Observability section). FR4 explicitly describes async spawn semantics.
**Status:** INCOHERENT
**Suggested resolution:** Change FR13 + A4 to specify `withSpan` (async) — the wait-for-exit + attribute-setting path needs the async wrapper so the span ends after the child exits. If a synchronous outer span is also desired (cmd-resolution + state-write), wrap the *synchronous* parts in `withSpanSync` and the *async* parts in `withSpan`. Document the split in §9 Observability.

---

### [H5] §1 Problem statement says "nine target hosts" but lists ten

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions) + Phase 2 reader pass
**Location:** §1 (line 17)
**Issue:** The sentence says *"Across nine target hosts (Claude Code, Cursor, Codex, Windsurf, Copilot CLI, Continue, Aider, Claude Desktop, Cowork, Claude.ai web)"* — that parenthetical lists **ten** hosts. The problem statement is the load-bearing framing the rest of the spec rests on; "nine" vs "ten" is small in absolute terms but signals the scope hasn't been re-counted after edits, and the specific count appears nowhere else as cross-check.
**Current text:** *"Across nine target hosts (Claude Code, Cursor, Codex, Windsurf, Copilot CLI, Continue, Aider, Claude Desktop, Cowork, Claude.ai web)..."*
**Status:** INCOHERENT
**Suggested resolution:** Either change "nine" to "ten" or trim the list to nine. The architecture report consistently says "9 target hosts" so the textual list likely picked up an extra entry — probably "Continue" or "Claude.ai web" was added after the count was set. Cross-reference `reports/agent-host-hooks-cross-host/` (cited in §10 D1's links) to confirm the canonical list.

---

## Medium Severity

### [M1] Inconsistent count of existing graph-health HTTP endpoints (4 vs 5 vs 6)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions); subsumes prior-audit Findings A2, A3, A4, A5
**Location:** §1 Complication (line 19), §1 Resolution (line 24), §3 NG5 (line 45), §6 FR17 (line 126), §8 Current state (line 167), §10 D13 (line 425)
**Issue:** The number of "existing graph-health endpoints" oscillates throughout:
- §1 Complication: *"5 endpoints"*
- §1 Resolution: *"5 existing graph-health HTTP endpoints"*
- §3 NG5: *"v1 `ok lint` wraps only the 5 existing graph-health endpoints"*
- §6 FR17: *"the 4 existing graph-health endpoints"* — lists 4 routes (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/forward-links`) and explicitly **excludes** `/api/backlinks`, `/api/backlink-counts`, `/api/link-graph`
- §8 Current state: lists **6** routes (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/backlinks`, `/api/forward-links`, `/api/link-graph`)
- §10 D13: prose says *"5 existing graph-health endpoints"* but list shows 4 (`(dead-links, orphans, hubs, forward-links)`)
**Evidence:** `packages/server/src/api-extension.ts:5537-5543` registers 6 handlers: `handleDeadLinks`, `handleOrphans`, `handleHubs`, `handleBacklinks`, `handleForwardLinks`, `handleLinkGraph`. (A 7th endpoint `/api/backlink-counts` may also exist per the prior audit — verify; if so, the corpus has 7 total.)
**Status:** INCOHERENT
**Suggested resolution:** Pick one canonical phrasing and apply throughout. Recommended: *"OK exposes **6** graph-health HTTP endpoints today; v1 `ok lint` wraps **4** of them (`/api/dead-links`, `/api/orphans`, `/api/hubs`, `/api/forward-links`) plus content-scan-derived redlinks. `/api/backlinks` and `/api/link-graph` are per-doc / aggregate-graph queries, not corpus-lint sources, and remain accessible via the existing `get_backlinks` / `get_forward_links` MCP tools."* Update §1, §3 NG5, §10 D13 accordingly.

---

### [M2] §12 A1 confidence label (HIGH) doesn't survive the SQLite-not-already-a-dep correction

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment), follows from H1
**Location:** §12 A1 (line 457)
**Issue:** A1 is labeled HIGH confidence and the verification plan is *"OK already uses SQLite via Hocuspocus; no new dependency."* That premise is false (see H1). After correction, the assumption becomes *"Bun's built-in SQLite OR `better-sqlite3` is suitable for v1 throughput,"* which is a different claim with different verification needs (pick the package, decide bundling story, smoke-test in CI).
**Current text:** *"A1 | SQLite (via Bun's built-in or `better-sqlite3`) is suitable for v1 job-state load (~10s of jobs/day). | HIGH | OK already uses SQLite via Hocuspocus; no new dependency. ..."*
**Status:** INCOHERENT (cascading from H1)
**Suggested resolution:** After resolving H1, restate A1 as: *"Bun's built-in `bun:sqlite` (preferred — no compile step, ships with Bun runtime) is suitable for ~10s jobs/day. Verification: ship a smoke test that opens db, inserts 1000 rows, queries, asserts <50ms total."* Confidence MEDIUM until verification, HIGH after.

---

### [M3] §12 A2 + §12 A5 reference outdated/wrong NG numbers and an already-resolved question

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions); subsumes prior-audit Finding A1 partially
**Location:** §12 A2 (line 458), §12 A5 (line 461)
**Issue:**
- A2 says *"Q3 resolution determines. If we ship the example, friction is low."* But Q3 is resolved (line 444): the answer is "yes, ship the example." A2's verification plan is therefore satisfied — the assumption is now confirmed, not Active.
- A5 says *"If they do, that's a v2 trigger (NG3)."* — but NG3 in §3 is *"OK does not assume a `wiki/`..."* (KB-shape neutrality). The Postgres / DAG / supervisor non-goal is **NG4**.
**Current text:**
- A2: *"Users on Persona P1... will accept writing a bash script... OR we'll ship the example. | MEDIUM | Q3 resolution determines."*
- A5: *"Users do NOT need parent-child DAGs / fan-out in v1. | MEDIUM | If they do, that's a v2 trigger (NG3)."*
**Status:** INCOHERENT
**Suggested resolution:**
- A2: Mark Confirmed (status=Confirmed 2026-04-28; resolution: shipped via D13/FR22). Or remove from Active.
- A5: Change `NG3` to `NG4`.

---

### [M4] §1 claims "Minions: 21+ cron jobs" — evidence supports "20+ recurring jobs"; "21" is unsourced

**Category:** FACTUAL
**Source:** T5 (external claim) + L4 (evidence-synthesis fidelity)
**Location:** §1 Complication (line 19)
**Issue:** The number "21+" is presented as a GBrain production fact. The cited evidence says "20+ recurring jobs" verbatim. The architecture report rounded to "21" without primary-source backing in any fetched evidence file. The SPEC inherits the unverified number. The prior in-context audit "verified" this against an "agenticbrew.ai ref" — that reference was not in the audit's three cross-check sources and could not be re-verified here.
**Current text:** *"GBrain's production-validated answer (Minions: 21+ cron jobs, 17,888 → 45,000 page deployments, $0/job for deterministic work, 100% durability) ..."*
**Evidence:** `reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md:37`: *"At Garry's deployment scale (**20+ recurring jobs**, autonomous cron) the saving is structurally important."* No "21" appears in the durability or precedent evidence files.
**Status:** UNVERIFIABLE
**Suggested resolution:** Change "21+" → "20+" to match the evidence, or cite the primary source for "21" directly if known to the spec author.

---

### [M5] §1 "17,888 → 45,000 page deployments" implies growth in one deployment; sources describe two snapshots

**Category:** FACTUAL
**Source:** T5 (external claim)
**Location:** §1 Complication (line 19)
**Issue:** The "17,888 → 45,000" framing reads as growth within a single GBrain deployment. The two numbers come from different reports and likely different timeframes:
- 17,888: `gbrain-vs-openknowledge-parity/REPORT.md:119` — *"GBrain claims production at 17,888 pages on Supabase Postgres."*
- 45,000: `gbrain-durability-jobs.md` — *"45,000-page Supabase brain."*
Plausibly the same deployment grew from one to the other, but the evidence files don't state that connection. The "→" arrow narrativizes a transition the citations don't substantiate.
**Current text:** *"GBrain's production-validated answer (Minions: 21+ cron jobs, 17,888 → 45,000 page deployments, ...)"*
**Status:** UNVERIFIABLE
**Suggested resolution:** Pick the most recent / most-frequently-cited number and use it alone (e.g., "production-validated at 45,000 pages"), or explicitly mark the growth claim as inferred ("[inferred from sources spanning multiple weeks; verify]"). Either is fine; the current "→" is misleading.

---

### [M6] §10 D22 claims a "dual-gate" but folds one gate into the install command

**Category:** COHERENCE
**Source:** L1 + L4 (evidence-synthesis fidelity)
**Location:** §10 D22 (line 433-434), §6 FR2 (line 111)
**Issue:** D22 states *"the user's explicit `launchctl load` ... step is the second, irreplaceable gate"* — but its substantive change is to *bake `OK_ALLOW_SHELL_JOBS=1` into the generated scheduler config*, eliminating the user's need to set it themselves. With D22 in effect, the per-host `launchctl load` is the only deliberate user action. Calling that "the second of two" is verbal sleight-of-hand: the original two gates were "explicitly set env var" + "explicitly load scheduler." D22 collapses them to "explicitly load scheduler."
**Current text:** *"The dual-gate principle is preserved because the install command does NOT auto-load — the user's explicit `launchctl load` / `systemctl --user enable` step is the second, irreplaceable gate."*
**Evidence:** FR2 says *"If `OK_ALLOW_SHELL_JOBS=1` is not set in the worker process env, `ok schedule run` exits non-zero."* If `install` writes the env var into the scheduler config, then post-install the env var is *automatically present* whenever the scheduler invokes the runner — the env-gate is a no-op for users who ran `install`. Only direct manual `ok schedule run --once` invocation outside the scheduler retains the env-var gate.
**Status:** INCOHERENT
**Suggested resolution:** Honest framing: *"Single explicit-action gate post-install: `launchctl load`. The env-var gate (FR2) protects users who run `ok schedule run --once` directly without going through `install` — it does NOT protect users post-install, since the env var is then in the scheduler config. Document this trade-off in install command output."* This is a real architectural trade-off; it's defensible, but D22's current self-description over-claims preservation of the original design.

---

### [M7] §13 Non-goals references the right NG numbers, but A5 still names NG3 wrongly (cross-cut with M3)

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions); subsumes prior-audit Finding A1 in §15
**Location:** §13 (line 466), §12 A5 (line 461), §15 Future Work Explored (line 506)
**Issue:** §13 correctly maps NG3 to KB-shape neutrality and NG4 to Postgres/DAGs/supervisors. §15 Explored bullet 1 also correctly says `(NG4)`. But A5 still uses NG3 to label the Postgres/DAGs trigger. The same numeric label (NG3) is being used for two different concepts in two places.
The prior audit also flagged §15 Explored as having stale NG numbering (`NG3`, `NG6`); confirming both have since been corrected (`NG4`, `NG8`) in §15 — only A5 remains stale.
**Status:** INCOHERENT
**Suggested resolution:** See M3 — A5 should reference NG4. After fix, all `NG3` references should land on KB-shape neutrality.

---

### [M8] Residual `wiki/` references remain after the de-wiki-fy pass (FR12 prose, P2 user journey, M3 metric)

**Category:** COHERENCE
**Source:** L6 (stance consistency) + Phase 2 reader pass
**Location:** §5 P2 step 5 (line 88), §6 FR12 (line 121), §7 M3 instrumentation (line 162)
**Issue:** The changelog records a 2026-04-28 de-wiki-fy refactor whose stated goal was "KB-shape-neutral terminology throughout." Three sites still use wiki-coupled language:
- §5 P2 step 5: *"failure escalates to `wiki/job-reports/failures.md`."* Conflicts with FR12 (`.open-knowledge/jobs/failures.md`) AND with G6 (KB-shape neutrality).
- §6 FR12 notes column: *"The wiki may also surface this via a future lint check."* Should be "the KB" or "the user's content tree."
- §7 M3 instrumentation: *"cross-reference job-run timestamps with git-log on the wiki."* Same — should be "on the KB" or "on the content tree."
**Status:** INCOHERENT
**Suggested resolution:** Replace each instance with KB-neutral phrasing. P2 step 5 should reference `.open-knowledge/jobs/failures.md` (matches FR12).

---

### [M9] §13 In Scope references FR1-FR22 but the spec now defines FR1-FR23

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §13 (line 467)
**Issue:** §13 says *"Requirements with acceptance criteria: §6 FR1-FR22 + NFRs."* But §6 now includes FR23 (Lint-scope disclosure in output, line 132) which appears to have been added post-audit per the design challenge. §13 must reflect the complete FR range.
**Status:** INCOHERENT
**Suggested resolution:** Update §13 to "FR1-FR23." Also update §13 Next Actions implementation list to mention the lint-scope-disclosure surface as a deliverable.

---

### [M10] §10 D24 was added to resolve Q2; §13 still says "Q2 ... deferrable to implementation"

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §13 Next Actions (line 471), §10 D24 (line 436), §11 Q2 (line 443)
**Issue:** D24 LOCKED resolves Q2 by introducing the `ok schedule install-examples` sub-command. §11 Q2 row reflects this (Status: Resolved 2026-04-28). §13 Next Actions still tells the reader Q2 is deferrable.
**Status:** INCOHERENT
**Suggested resolution:** Remove "Q2" from the deferrable list in §13. Update §13 implementation bullet to mention `ok schedule install-examples` (D24) as a deliverable.

---

### [M11] FR4 + FR21 imply Hocuspocus must be running for `ok lint`, but G3's "Free, no credentials" elides this

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §2 G3 (line 34), §5 P1 step 5 (line 81 — "Hocuspocus not running, exit code 2"), §9 internal flow step 2 (line 374)
**Issue:** G3 promises the deterministic side is "**Free, no credentials, no per-run cost.** They write **two lines** of config (`cmd: ok lint`, `schedule:`) and one `ok schedule install` command." But `ok lint` calls HTTP endpoints exposed by Hocuspocus (`/api/dead-links` etc.), which means Hocuspocus must be running. P1's failure mode at step 5 confirms this dependency. The "two lines + one command" promise quietly assumes the user already has `open-knowledge start` running as a background service. On macOS / Linux this requires its own scheduler entry (or daemon); on machines used episodically (the Persona P1 "personal laptop" case) the server doesn't run when the user is away — the very window the cron is supposed to fire in.
**Status:** INCOHERENT (under-specified user journey)
**Suggested resolution:** Pick one (this is a 1-way-door choice that needs spec-time resolution):
  (a) `ok lint` auto-starts Hocuspocus if not running and shuts it down after (auto-start mode).
  (b) `ok schedule install` also installs Hocuspocus as a launch agent / systemd service (and documents this prominently).
  (c) `ok lint` operates in offline mode for deterministic checks by reading on-disk markdown directly, bypassing Hocuspocus (decouples lint from server lifecycle entirely; aligns with "OK is substrate" stance).
Without picking, the "two-line setup" promise breaks for laptop users (the largest Persona slice).

---

### [M12] §6 NFR "Single-job state-write ≤ 10ms" assumes a write engine the spec hasn't specified concretely

**Category:** COHERENCE
**Source:** L3 (missing conditionality)
**Location:** §6 Non-functional requirements (line 135), §10 D23 (line 435)
**Issue:** NFR specifies state-write ≤ 10ms. D23 specifies WAL + `synchronous=NORMAL` + `busy_timeout=5000ms`. These are SQLite-specific. If H1 redirects the substrate to JSON-files or git-shadow, the 10ms figure is unmoored. WAL `synchronous=NORMAL` typically yields ~1-3ms commits on local SSD, but only if SQLite is the chosen substrate.
**Status:** UNVERIFIABLE (cascading from H1)
**Suggested resolution:** After H1 is resolved, re-derive the 10ms target against the chosen substrate. If SQLite remains, leave as-is. If JSON-files, re-target to whatever `fsync` cost is on local SSD.

---

## Low Severity

### [L1] §10 D3 evidence column points at a path that is a git repo, not a SQLite location

**Category:** FACTUAL
**Source:** T1 (own codebase), follows from H1
**Location:** §10 D3 (line 415)
**Issue:** Evidence column says *"OK already uses SQLite via Hocuspocus persistence at `<projectRoot>/.git/open-knowledge/`"* — that path is the **shadow git bare repository**, not a SQLite database file. Cleanup that follows from fixing H1.
**Status:** STALE
**Suggested resolution:** After H1 is resolved, remove or rewrite this evidence-column claim (replace with a source-correct statement about where OK persists state).

---

### [L2] FR13 "precedent #cardinality-discipline" is not how OK precedents are numbered

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §6 FR13 (line 122)
**Issue:** FR13 references *"precedent #cardinality-discipline"* — but `PRECEDENTS.md` enumerates precedents by **integer**: #1 through #27. There is no named "#cardinality-discipline." The cardinality-discipline rule lives in `CLAUDE.md` STOP rules ("Don't emit unbounded-cardinality span/metric attributes") — it's a STOP rule, not a numbered precedent.
**Status:** UNVERIFIABLE
**Suggested resolution:** Replace with a CLAUDE.md STOP-rule reference: *"Conforms to existing OK telemetry conventions (see `CLAUDE.md` STOP rule on unbounded-cardinality attributes; reuse `normalizeFsPath`/`classifyFsPath` from `fs-traced.ts`)."* Or, if the spec's intent is to reference a specific numbered precedent, name the integer. (Precedent #25 — writer-ID taxonomy — is referenced correctly elsewhere in the spec.)

---

### [L3] Architecture diagram and "Worker mid-run" matrix imply a long-lived worker but design is per-cron-fire

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §5 Interaction state matrix (line 102), §9 Architecture overview (line 207-231) and key-principle text (line 233)
**Issue:** §9 explicitly states *"OK does not run a long-lived daemon in v1. Each cron firing invokes `ok schedule run --once`..."* But the §5 matrix has a row for *"Worker mid-run"* describing logs streamed to a file — implying a worker the user can observe in flight. For per-cron-fire single-process invocations, there is no separate "worker mid-run" surface; the streaming semantics are about whatever process the cron just spawned.
**Status:** INCOHERENT
**Suggested resolution:** Re-label the matrix row to "Run mid-execution" or "Single-fire process mid-run." Optionally clarify in §9 that mid-run observability is "tail the per-run log file at `.open-knowledge/jobs/<job-name>-<run-id>.log`" rather than a worker-state query.

---

### [L4] §6 FR3 says `{prompt}` "inlines as a single argument" — quoting / size semantics for multi-line prompts not specified

**Category:** COHERENCE
**Source:** Phase 2 reader pass
**Location:** §6 FR3 (line 112)
**Issue:** FR3 says `{prompt}` substitutes the contents of `prompt_file` and inlines as a single argument. Prompt files are typically multi-line markdown. The argv mechanism passes a literal string with embedded newlines, which is fine for `node:child_process.spawn` (no shell expansion — preserved per FR4). But agent CLIs vary: some expect quoting, some require `--prompt-file=` semantics, some have argv size limits. macOS / Linux argv cumulative ceiling is ~256KB; a large prompt + env block can exceed it.
**Status:** UNVERIFIABLE (under-specified)
**Suggested resolution:** Add a note to FR3 or §9 documenting: (a) `{prompt}` works for multi-line because spawn uses argv not shell, (b) recommended pattern is `{prompt_file}` for prompts >10KB, (c) the macOS / Linux argv size limit is the runner's effective cap. Optional: a `prompt_max_bytes` validation check.

---

### [L5] §10 D11 path-traversal guard semantics conflict with absolute-path substitution in FR3

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** §6 FR3 (line 112), §10 D11 (line 423)
**Issue:** FR3 says `{prompt_file}` resolves to the absolute path. D11 says paths must "resolve within the project root" — which presumably means paths whose `realpath()` is inside the project. The text doesn't say what happens when an agent CLI is invoked with `cwd:` set elsewhere (FR4 says `cwd` defaults to project root but is configurable). Edge case: `cwd: ../other-project` with `prompt_file: prompts/foo.md` resolves to `../other-project/prompts/foo.md` — does D11 accept or reject?
**Status:** UNVERIFIABLE (under-specified)
**Suggested resolution:** Spell out D11's semantics: *"Both `cwd` and `prompt_file` resolve to absolute paths and must satisfy `realpath(p).startsWith(realpath(projectRoot))` after resolution. Symlinks are resolved before the check."* Mirror the existing OK symlink-escape rule (`CLAUDE.md` Symlinks section).

---

### [L6] §15 Future Work "parity work item #1 — hybrid retrieval" is not verifiable from the audit's source set

**Category:** FACTUAL
**Source:** T5 (external claim)
**Location:** §15 Explored bullet 1 (line 506), §3 NG4 (line 44)
**Issue:** Both lines say the trigger to revisit Postgres/DAGs is OK adopting Postgres "(parity work item #1, hybrid retrieval)." The phrase is plausible — `gbrain-vs-openknowledge-parity/REPORT.md` is the canonical 1P parity audit and likely enumerates work items by rank — but that report wasn't in the audit's three cross-checked sources. The architecture report only confirms work item **#5** = shell-job runner; it doesn't enumerate item #1 by name.
**Status:** UNVERIFIABLE (within audit scope)
**Suggested resolution:** Spec author either confirms item #1 = hybrid retrieval from `gbrain-vs-openknowledge-parity/REPORT.md`, or rewords to "when OK adopts a Postgres index (see parity audit work-item ranking)."

---

### [L7] `evidence/` directory is empty; spec relies entirely on outside-spec reports

**Category:** COHERENCE
**Source:** L7 (inline source attribution) + Phase 1 intake
**Location:** Whole-spec — `specs/2026-04-28-ok-shell-job-runner/evidence/` is empty
**Issue:** All factual citations (precedent paths, GBrain claims, `withSpanSync` location) point at reports outside the spec's own evidence directory. That's not strictly wrong — `references/artifact-strategy.md` allows reuse — but it means the spec lacks a frozen-in-time evidence basis. If `reports/ok-integrated-knowledge-lint-architecture/` is later updated or moved, the spec's grounding is silently broken. Most adjacent specs (e.g., `2026-04-21-agent-write-summaries/`) have populated evidence dirs.
**Status:** UNVERIFIABLE (process observation)
**Suggested resolution:** Optional but recommended: copy/extract load-bearing GBrain claims (the four evidence quotes that anchor §1, §10 D1, D2, D4, D8, D10) into `evidence/_init_worldmodel.md` or `evidence/gbrain-claims.md` so the spec's grounding survives report churn. At minimum, add one evidence file capturing the SQLite-vs-git-persistence reality (cited above) so H1 has a canonical answer rather than re-derivation.

---

### [L8] Karpathy quote attribution wording diverges slightly from the original gist

**Category:** FACTUAL
**Source:** T5 (external claim); preserved from prior in-context audit (Finding "Approximate paraphrase")
**Location:** §1 Complication (line 19)
**Issue:** The SPEC presents *"Karpathy's framing — 'humans abandon their knowledge bases because the maintenance burden grows faster than the value; LLMs don't get bored'"* as a direct quote. The actual gist (per `reports/open-knowledge-prior-art-eight-sources/evidence/d8-karpathy-gist.md`) reads *"Humans abandon wikis because the maintenance burden grows faster than the value."* The substitution of "wikis" → "knowledge bases" was deliberate (KB-neutral framing per the changelog) but the spec presents it as a quote.
**Status:** STALE (paraphrase masquerading as quotation)
**Suggested resolution:** Either restore the exact wording (Karpathy used "wikis"; can be parenthesized: *"wikis (KB-shape-neutral framing applies equally)"*), OR convert to clear paraphrase formatting without quote-marks: *"Karpathy's framing — knowledge bases rot because maintenance outpaces value, but LLMs don't get bored — only holds if..."*

---

## Confirmed Claims (summary)

The following spec claims were spot-checked against primary sources and verified:

- **HTTP API endpoints** (§8): all 6 routes exist in `packages/server/src/api-extension.ts:5537-5543` (`handleDeadLinks`, `handleOrphans`, `handleHubs`, `handleBacklinks`, `handleForwardLinks`, `handleLinkGraph`).
- **MCP tool registry** (§8): `consolidate`, `ingest`, `research`, `get_dead_links`, `get_orphans`, `get_hubs`, `get_backlinks`, `get_forward_links` all registered in `packages/cli/src/mcp/tools/index.ts`.
- **`hints[]` channel** (§8) at `api-extension.ts:1626-1648` — line numbers exact; current shape is `Array<{ type: 'orphan'; parentCandidates: string[]; message: string }>` (single hint type).
- **`applyAgentMarkdownWrite`** at `agent-sessions.ts:92-107` — line numbers exact.
- **Zod for config validation** (D9, §8) — `packages/cli/src/config/schema.ts` confirmed.
- **OTel `withSpanSync` and `getMeter`** — both exist in `packages/server/src/telemetry.ts` (signature constraint surfaced in H4).
- **Writer-ID taxonomy precedent #25** — exactly the 5 categories listed (`agent-<connId>`, `principal-<UUID>`, `file-system`, `git-upstream`, `openknowledge-service`) per `PRECEDENTS.md:132-142`.
- **`research --headless` mode** — exists at `packages/cli/src/mcp/tools/research.ts:36-43` (1-line drift from claimed 35-43; trivial).
- **`live-derived-index.ts`** and **`installUserSkill`** — both exist as cited.
- **`Bun + Node 24` runtime** — `package.json` engines: `"bun": ">=1.3.13", "node": ">=24"`.
- **`@modelcontextprotocol/sdk` import** — present in `packages/cli/src/mcp/server.ts:20-22`; sampling capability not yet wired (consistent with NG7).
- **`config.yml` location** — `.open-knowledge/config.yml` confirmed via `packages/cli/src/config/paths.ts:26-28`.
- **No existing `automation` block** in config schema — confirmed; this is genuinely a new extension.
- **`OK_*` env-var pattern** — multiple precedents (`OK_TEST_CONTENT_DIR`, `OK_DEBUG_POSITION_SLICE`, `OK_TELEMETRY_VERBOSE`).
- **OK CLI bin names** — `package.json` `bin`: `open-knowledge` and `ok` both pointing at `dist/cli.mjs`.
- **GBrain Minions production claims** — `$0/job`, `100%` durability, `45,000-page Supabase brain`, `753ms` spawn, `>10s` sub-agent timeout, off-by-default `GBRAIN_ALLOW_SHELL_JOBS=1` env gate, MCP-boundary CLI-only submission, exponential backoff, idempotency keys — all CONFIRMED in `reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`.
- **Convergent industry pattern** (most Karpathy-style implementations don't schedule LLM-required checks; deterministic side runs autonomously on cron) — CONFIRMED in `reports/ok-integrated-knowledge-lint-architecture/evidence/precedent-shell-job-runners.md`.
- **All cross-referenced reports exist** — verified by the prior in-context audit and re-confirmed: `reports/ok-integrated-knowledge-lint-architecture/`, `reports/gbrain-vs-openknowledge-parity/`, `reports/knowledge-linting-karpathy-workflow/`, `reports/agent-host-hooks-cross-host/`, `reports/consolidate-and-overnight-patterns/`.
- **Decision rationale fields populated** — all D1-D24 have rationale + evidence columns; spot-checks of D3 (rationale invalidated by H1; rationale fix proposed), D13, D17 confirm rationale-source alignment.
- **Resolution status assigned** — all D1-D24 are LOCKED or DIRECTED; no INVESTIGATING / ASSUMED items.

---

## Unverifiable Claims

- **"21+ cron jobs" in GBrain production** — see M4. Evidence supports "20+"; "21" is sourced only from the architecture report's restatement and a prior-audit "agenticbrew.ai ref" not in the current source set.
- **"17,888 → 45,000 page deployments" growth** — see M5. Two valid snapshots; the "→" growth narrative is not directly cited.
- **"parity work item #1 — hybrid retrieval"** — see L6. Could not verify within the three cross-checked reports; the canonical parity audit (`gbrain-vs-openknowledge-parity/REPORT.md`) was not in the audit's source-material set.
- **`precedent #cardinality-discipline`** — see L2. No such named precedent in `PRECEDENTS.md`.
