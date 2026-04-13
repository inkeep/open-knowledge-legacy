# Changelog — Enriched `exec` MCP Surface Spec

Append-only process history. Most recent first.

---

## 2026-04-13 — Spec scaffolded

- Intake complete: SCR problem framing + 5-probe stress-test (observation probe flagged weak, captured as A1).
- Personas, constraints, initial goals captured.
- Intake-batch decisions locked (user 2026-04-13):
  - **D1:** Wedge W3 (single `exec(command)` with pipes, Tier 2).
  - **D2:** Prompting posture L2 (demote semantic tools, keep registered).
  - **D3:** Accept external prior art; track as A1 with post-ship expiry.
  - **D4:** Shared `enrichPath()` factored as prerequisite PR (DEP-1).
  - **D5:** Spec scope = V0-24 only.
- SPEC.md drafted with full decision log, open questions, assumptions.
- Baseline commit stamped: 9c346cb.
- Next: dispatch `/worldmodel` for spec-specific surface + prior-art survey; investigate D6–D9 (allowlist, parser, path extraction, output cap).

## 2026-04-13 — Worldmodel returned + two evidence files appended

- Worldmodel report written to `evidence/worldmodel.md` (tool inventory, connections, 3P landscape, current state, unresolved).
- **Decision-implicating finding:** `reports/just-bash-virtual-filesystem-analysis/REPORT.md` (14-dimension internal research, all P0 dims CONFIRMED) recommends **hybrid architecture (5-6 semantic + 1 bash escape hatch = 6-7 tools)**, not exec-primary-with-semantic-demoted. Captured in `evidence/internal-prior-art-contradicts-direction.md`. Challenges D2 (L2 posture) directly; refines D1 via `structuredContent` MCP mechanism.
- **Data-gap finding:** proposed `EnrichedMeta.modified` has no current source (`gitLog` returns commit date, not fs mtime); `EnrichedMeta.backlinkCount` requires full-array HTTP call per path (N-amplification on `ls`/`grep` output). Captured in `evidence/enrichment-data-gaps.md`. A2 scope needs widening.
- **Accounting correction:** current MCP tool count is 15, not "14+"; `list_documents` is the lone unenriched tool. V0-26 Now + V0-24 without DEP-1-first would land 3 inline enrichment sites to reconcile.
- **Web channel inaccessible** during worldmodel run (WebSearch permission denied); 3P landscape rests entirely on in-repo reports. Q2 (shell-quote vs alternatives) remains open.
- Next: surface decision reopen on D2 + D1 refinement to user; update A1, A2, spec §14 risks after user call.

## 2026-04-13 — Decision batch #2 locked (cascade complete)

User calls (2026-04-13):
- **D2 revised → L2-lite** (side-by-side by use case, neither demoted). Was LOCKED L2-aggressive; revised to LOCKED L2-lite after internal-report evidence.
- **D10 LOCKED** — dual-channel enrichment: appended markdown block in `content` + `EnrichedMeta[]` in `structuredContent`.
- **D11 LOCKED** — v0 enrichment shape shrunk: no `modified`, no per-path `backlinkCount` on multi-path output. Richer shape → §15 Future Work (Explored, sketch included).

Cascade edits to SPEC.md:
- §2 G3 rewritten (L2-lite).
- §3 NG5 updated (L2-aggressive is the deprecated posture now; L3 triggers updated).
- §6 FR6 rewritten (dual-channel); FR7 tightened (single-path `cat` parity semantics); FR10 rewritten (side-by-side INSTRUCTIONS); FR14 added (shrunk multi-path shape).
- §9 Proposed solution — response shape updated; INSTRUCTIONS plan reflects L2-lite.
- §10 D2/D4 resolutions revised in place; D10, D11 added.
- §12 A1/A2 updated with verification plans reflecting new scope.
- §14 Risks — added "shrunk-enrichment insufficient for adoption"; "hybrid recommendation was right"; "structuredContent client support." Removed implicit N-amplification risk (deferred by D11).
- §15 Future Work Explored — added richer-enrichment entry with implementation sketch.
- §11 Q4 resolved (closed).

Next: continue iterate loop on D6 (allowlist), D7 (parser), D8 (path extraction), D9 (output cap); investigate Q2 (shell-quote vs alternatives) via web; read `packages/server/src/backlink-index.ts` to confirm Future Work sketch numbers.

## 2026-04-13 — Decision batch #3 locked + D12 shadow-repo promotion

User calls (2026-04-13):
- **D6 LOCKED Liberal:** `cat, ls, grep, find, head, tail, wc, sort, uniq, cut` + `awk, sed` (with flag denylist for `-i`, `-w`, `-o`, `--output-file`, `>`-family, subshells). Deny control ops except `|`.
- **D7 LOCKED `shell-quote`:** use `parse()` direction only; wrap in ~50-line `parseCommand()` validator (structural allow/deny). CVE verification (quote-direction only) happens during impl — doesn't block spec.
- **D8 LOCKED per-command + regex fallback:** extractors for `cat/ls/grep/find/head/tail/wc/sort/uniq/cut/awk/sed`; fallback regex `\b[\w./-]+\.md\b` for unknown-shape output.
- **D9 LOCKED default:** hard 16 MB (inherit `runShell`), soft 500 lines / 50 KB rendered — deliver captured + append `<truncated: N more lines>` marker.

**D12 LOCKED (promoted from Future Work):** history data source is **shadow repo**, not `git log`. User rationale: "that is the whole point" — agent-attribution visibility via `WriterIdentity` (agent vs human), per-edit-burst commits, co-authored-by trailers is the co-authoring differentiator that makes `exec` strictly-better than native bash.

Shape verified in `packages/server/src/shadow-repo.ts:20-45, :128-233`: `ShadowHandle { gitDir, workTree }`, `WriterIdentity { id, name, email }`, `commitWip(shadow, writer, contentRoot, message, branch)`, `commitUpstreamImport` for human commits, co-authored-by trailers in multi-writer bursts.

D13 LOCKED as implication: `read_document` upgraded in tandem (same shared helper, no CC9 drift).

Cascade edits:
- §6 FR7 updated (shadow-repo source), FR15 added (shape + endpoint), FR16 added (disk-only fallback to gitLog with `historySource` field).
- §10 D4 resolution revised (DEP-1 scope widens from pure-refactor to include shadow-repo plumbing), D12 + D13 added.
- §12 A2 updated (DEP-1 scope reflects D12 addition; `modified` + batch-backlinks still excluded).
- §15 Explored entry tightened (shadow-repo removed, `modified` + backlinks batch remain).
- §16 Agent constraints split into two PRs (DEP-1 and `exec` impl) with distinct SCOPE/EXCLUDE/STOP_IF/ASK_FIRST per PR. DEP-1 SCOPE now includes `packages/server/src/api-extension.ts`.
- §14 Risks updated: shrunk-enrichment risk reduced; new risks added for `/api/shadow-log` latency and git-log-vs-shadow disagreement in disk-only mode.

Iterate loop exit criteria now met: all P0 open questions resolved (Q1=D6, Q2=D7, Q3=D8, Q4=closed 2026-04-13 batch #2, Q6/Q8/Q9/Q10 are implementation-latitude DIRECTED). Ready for Step 6 (audit) after a final scope + priority checkpoint.

## 2026-04-13 — Audit + challenger returned; pure corrections applied

**Auditor findings applied silently (pure corrections, no user input needed):**
- **[HIGH #1]** FR15 claim "Co-authored-by trailers split into multi-writer attribution" was factually wrong. `commitWip` in `shadow-repo.ts:128-204` emits single-author commits; trailers only appear in `saveVersion` at `:436-448` (project-repo commits). FR15 rewritten to describe actual shadow-repo semantics (single-author commits; multi-writer attribution surfaces from chronological merging across per-writer refs). FR17 added to call out cross-ref reconstruction.
- **[HIGH #3]** §9 `EnrichedMeta` data model listed `modified` despite D11 excluding it. §9 rewritten with explicit v0 shape for multi-path vs single-path output; `modified` now only appears in §15 Future Work.
- **[MED #4]** §10 rows for D6/D7/D8/D9 still showed INVESTIGATING despite batch #3 locking them. Rows updated to LOCKED with rationale and evidence cells.
- **[MED #5]** §16 `exec` PR EXCLUDE had self-cancelling "except...not in the exec PR" wording. Simplified to clean exclusion; DEP-1 PR owns the endpoint.

**Surfaced for user judgment (auditor #2 + challenger #1/#2/#3):** see next consolidated numbered batch.

## 2026-04-13 — Decision batch #4 locked (substantial architectural revision)

User calls (2026-04-13):
- **D2 REVERSED (third revision, final) → L2-aggressive.** User direction: "demote semantic tools we need to favor the exec significantly. we want our agent TO USE openknowledge by default we should never have to tell it to do so." Internal-report hybrid recommendation consciously overridden on strategic grounds (OK = default surface thesis).
- **D14 LOCKED — Executor: just-bash + ReadWriteFs.** User: "we just call normal just bash tools with vercel." Replaces execFile-per-stage architecture. `runShell`/`runPipeline` primitives in `bash/index.ts` deleted. Pipes owned by just-bash interpreter. Host-independent; swap-ready for cloud.
- **D15 LOCKED — Allowlist tightened to Conservative-plus (overrides D6 Liberal).** Drop `awk`/`sed` (program-arg write vectors); keep `find` with explicit `-exec`/`-delete`/`-fprint`/`-fprintf`/`-ok`/`-okdir` flag denylist. Final set: `cat, ls, grep, find, head, tail, wc, sort, uniq, cut`. Addresses challenger finding #2.
- **D16 LOCKED — Hatch-only exec alternative documented + rejected.** Added to §9 as Option E. User rationale: enrichment IS the differentiator vs. native Bash. Addresses challenger finding #1.
- **D17 LOCKED — Metric 1 `>50%` target retained.** L2-aggressive makes it reachable; resolves challenger finding #3.
- **D18 LOCKED — Shadow-repo via CLI-side simple-git direct-read (no HTTP endpoint).** User: "this makes sense" after reviewing concrete walkthrough. New `packages/cli/src/content/shadow-log.ts`. DEP-1 narrows to CLI-only.
- **D4 REVISED (third time) — DEP-1 scope narrows back toward pure refactor + one new CLI helper** (no server edits). FR16 deleted. Addresses auditor finding #2 more cleanly than the original `/api/shadow-log` design.

Cascade edits to SPEC.md:
- §6: FR10 rewritten (L2-aggressive); FR16 annotated as deleted; FR17 rewritten (CLI-side simple-git); FR18 added (just-bash executor); FR19 added (bundle-weight budget).
- §9: Alternatives updated — Options C/D merged (just-bash chosen), Option E added (hatch-only rejected); system design re-annotated for just-bash.
- §10: D2, D4, D13 rows updated; D14, D15, D16, D17, D18 added.
- §12: A1 revised (strategic thesis explicit); A2 narrowed (CLI-only DEP-1).
- §14: Risks table refreshed — shadow-log endpoint latency risk → `readShadowLog` latency risk; added CLI coupling risk, bundle-weight risk, just-bash semantic-divergence risk; removed disk-only-bifurcation risk (gone per D18) and `/api/shadow-log` endpoint concerns.
- §15: YjsFileSystem added as Future Work Explored entry (sketched implementation path; triggers for promotion).
- §16: DEP-1 SCOPE narrowed to CLI-only; EXCLUDE explicitly bans `packages/server/` writes and any new HTTP endpoint; STOP_IF/ASK_FIRST rules updated. `exec` PR SCOPE expanded to include `@vercel/just-bash` + `shell-quote` dep additions and full `bash/index.ts` rewrite.

Resolution completeness gate now re-passable:
- All decisions LOCKED (no INVESTIGATING / ASSUMED remaining).
- 3P deps named: `shell-quote` (D7), `@vercel/just-bash` (D14), `simple-git` (transitively present; D18 adds to CLI direct-dep list).
- Architecture viable: each data source verified (just-bash ReadWriteFs documented in report D1-D8; simple-git proven in server; shadow-repo ref layout confirmed in `shadow-repo.ts`; shell-quote API confirmed via web).
- Integration feasibility: CLI → just-bash interpreter, CLI → simple-git → shadow repo, CLI → HTTP → `/api/backlinks` (existing). No unresolved integration.
- Acceptance criteria testable: FR1-FR19 each map to a concrete verification (allowlist-enforcement tests, pipe tests, parity tests vs read_document, latency benchmarks, bundle-size assertion).
- No dependency on Future Work: YjsFileSystem, `modified` fs.stat, custom OK commands, richer backlink endpoints all §15.

Ready for Step 8 (verify and finalize).

## 2026-04-13 — Drift sweep (final before review)

User requested one more review. Spot-check caught substantial drift from four revision rounds accumulating stale L2-lite / runShell / `/api/shadow-log` / D6-Liberal references. Applied 19 surgical corrections:

- §2 G3 → L2-aggressive; §3 NG5 reframed (L3 is NOT-NOW, not L2-aggressive).
- §5 user journeys + interaction state matrix populated (was empty).
- §6 Non-functional — runShell references removed; enrichment/latency budgets reset per D14/D18.
- §6 FR7 note — endpoint reference replaced with `readShadowLog` helper.
- §6 FR13 — note updated to reflect D9 lock (subsumed, kept for traceability).
- §8 Current state — reframed as pre-impl snapshot; noted what each section replaces.
- §9 Architecture diagram, data model, dependencies — updated to just-bash + shell-quote + simple-git; `ShadowCommit` shape spelled out; `historySource` reduced to always `"shadow-repo"`.
- §10 D6 marked SUPERSEDED by D15; D12 Implications corrected (no endpoint, no `gitLog` fallback; audit #1 correction noted inline).
- §11 Q1–Q3, Q6–Q10 marked Resolved with decision-pointer + resolution class (LOCKED / DIRECTED / DELEGATED).
- §12 A3 — reframed around just-bash; A4, A5 marked Resolved.
- §13 Goal rewritten; Requirements list updated to FR1–FR19 (was FR1–FR12); Next actions rewritten into 4 concrete steps matching D4/D14/D18.
- §14 Risks — shell-injection mitigation (execFile → just-bash in-process); adoption risk (L2-lite → L2-aggressive); large-stdout risk (D9 cap); allowlist-too-permissive risk (D15 tightened); hybrid-was-right risk reframed; large-stdout + runShell references removed.
- §13 Rollout table — L2 → L2-aggressive.

Changelog entry for audit trail. No decision changes in this sweep — all drift corrections, no semantic shifts.

## 2026-04-14 — PR #103 review round + architectural sideband (D19-D23)

Bot review + Amy/Tim session produced 5 new decisions (D19-D23) and 3 new requirements (FR20, FR21, updated FR14). No existing decisions reverted, but FR6, FR7, FR10, FR12, FR14, FR15 revised; §5 interaction-state matrix expanded to cover category-specific error messages; §9 data model rewrote the `EnrichedMeta` shape as a single nullable interface; §14 risks updated; §16 Agent Constraints for both PRs updated.

**D19 — `catalogCategory` removed.** Team (Amy + Tim) decided to retire folder-level INDEX.md frontmatter catalogs. Per-file frontmatter is source of truth; catalog is on-demand view. V0-24 impact: drop the field, skip the data fetch.

**D20 — Unified `EnrichedMeta` with nullable fields** (bot review 🟠 #2). Not a discriminated union on cardinality. Agents get one shape with `null` where data is unavailable or deliberately omitted.

**D21 — Error messages differentiated by denial category** (bot review 🟠 #1). Six categories: `unknown_command`, `write_blocked`, `shell_construct_blocked`, `path_traversal`, `output_overflow`, `security_invariant_violation`. Each carries an actionable next-step in `content` and a machine-parsable shape in `structuredContent.error`.

**D22 / FR20 — Shadow-repo layout shared via server exports** (bot review 🟠 #3). DEP-1 adds `getShadowRepoPath`, `getWipRefPattern`, `parseWriterId` to `packages/server/src/shadow-repo.ts`; CLI imports them. Eliminates CLI-side layout reimplementation.

**D23 / FR21 — Defense-in-depth backstop via post-exec mtime-scan** (bot review 🟠 #4). Not subprocess isolation (that would reintroduce the cost D14 paid to avoid). Bounded scan, <10ms typical, aborts with `security_invariant_violation` on any write.

**Minor fixes** (bot review 🟡): precise tool count (15); `/api/shadow-log` references removed from scope (D18's no-endpoint decision preserved); FR12 tool-description token budget (≤120 tokens); A1 rollback-communication plan added; §8 Current State distinguishes FR18 (just-bash swap) from D12 (gitLog→readShadowLog) as separate PRs.

**Consider items accepted** (bot review 💭): FR10 INSTRUCTIONS include WHY rationale; tool-description tiering per FR12; A1 `mcp_instructions_version` bump for rollback communication.

**Implementation status:** US-001 through US-004 committed on `implement/enriched-exec-mcp-surface` branch (deps, readShadowLog, shared enrichPath, migrate read_document/search); US-005 WIP stashed. With the spec updated, implementation will restart from clean state using the revised EnrichedMeta shape and FR20/FR21 additions.

## 2026-04-14 R2 — PR #103 second review round (bot + human reviewers)

Second-round review after commit 081abc2. Bot flagged 2 Major + 3 Minor + 3 Consider. All addressed:

**Major fixes:**
- **R2 🟠 #1 (dep direction):** D22/FR20 revised — shadow-repo layout helpers move from `packages/server/` to `packages/core/src/shadow-repo-layout.ts` (new file). Rationale: CLI has server as devDependency, not runtime — placing the shared utilities in server would create a runtime dep direction concern at publish time. Core is the neutral location (already a workspace dep of both CLI and server; no node-server-specific deps). DEP-1 scope updated accordingly: new core file, one-line import swap in server, CLI consumer.
- **R2 🟠 #2 (binary/image):** NG8 added — binary/image resources via `exec` explicitly scoped out. Text/markdown only; binary retrieval uses native `Read` or a future `resource_read` tool. Amy's PR review comment converted to durable NG entry.

**Minor fixes:**
- **R2 🟡 STOP_IF:** stale `/api/shadow-log` reference in `exec` PR STOP_IF corrected to `readShadowLog` helper + core `shadow-repo-layout`.
- **R2 🟡 ASK_FIRST:** stale `D6 Liberal` + `L2-lite` references corrected to `D15 Conservative-plus` + `L2-aggressive`.
- **R2 🟡 D8 regex:** path-extraction fallback broadened from `\b[\w./-]+\.md\b` to `\b[\w./-]+\.(md|mdx)\b` to cover `.mdx` content. Non-wiki extensions (`.txt`, `.json`) intentionally excluded.

**Consider items accepted:**
- **R2 💭 isAgent null semantics:** ShadowCommit shape comment clarifies `null` = "cannot be classified (legacy commits, external git operations outside OK); agents should treat as indeterminate."
- **R2 💭 `@vercel/just-bash` vs `just-bash`:** architecture diagram and 3P deps list standardized on `just-bash` (actual npm name; `@vercel/just-bash` never existed as a published package).
- **R2 💭 `message` vs `subject`:** kept `message` (more natural for commit payloads; spec-wide); old `GitLogEntry.subject` belongs to the deleted code path so no consistency pressure.

**Status:** spec ready for re-review. Implementation restart still pending — the 4 committed impl commits (US-001..US-004) + stashed US-005 need to be reset and redone against the fully-revised spec (new EnrichedMeta shape, FR20 core-location, NG8, FR21 mtime-scan).
