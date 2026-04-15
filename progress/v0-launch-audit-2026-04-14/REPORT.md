# V0 Launch Audit — 2026-04-14

**Window audited:** 2026-04-12 00:00 → 2026-04-14 (last ~48h)
**Source of truth:** `projects/v0-launch/PROJECT.md` (26 stories, 7 owners)
**Method:** 7 parallel per-owner audits (see `per-owner/`) + global 48h activity sweep
**Scope of verification:** claim-vs-reality per story, plus material deviations from spec (scope-cuts and scope-adds)

---

## Executive summary

**Verdict: Strong 48h, but Now-phase critical path has 3 silent-start risks that could delay launch.**

- **9 stories confirmed shipped** (7 claimed + 2 newly shipped in-window). Miles's V0-16 Timeline+Rollback landed today at 09:23 (PR #39, 120 files / +5128 LOC) — the single biggest delivery of the window.
- **2 stories in-progress** with spec clarity gaps (V0-14 Miles unblocked, V0-26 Tim claimed "underway" but showing zero impl on 2 of 3 workstreams).
- **3 Now-phase remaining stories are unstarted with no public signal:** V0-3 (Mike, backlinks push consumer), V0-7 (Sarah, onboarding), V0-10 (Dima, quick switcher). V0-3 blocks the user-visible payoff of Andrew's V0-2 CC1 primitive.
- **Material deviations identified:** 6 scope-cuts (4 launch-risk, 2 accepted), 7 scope-adds (4 architectural groundwork, 3 informal UX polish not tracked in PROJECT.md).
- **PROJECT.md drift:** 4 status lines do not match reality as of this snapshot (biggest: V0-16 still says "In progress" but shipped 5h before this report; TQ5 says "Starting now" with zero activity).

**Launch-readiness read:** the shipped substrate is solid (server-lock, CC1 primitive, graph view, Timeline, outline panel, image paste, enriched MCP). What could still delay V0 is the gap between *primitives landing* and *user-visible value*: V0-2's real-time sidebar is pointless without V0-3's consumer; V0-9's outline ships without scroll-position tracking; V0-7 onboarding hasn't started.

---

## 48h activity snapshot

| Metric | Value |
|---|---|
| Commits merged to main | ~125 (plus ~60 Nick work-branch commits) |
| PRs merged | 31 |
| PRs opened (still open) | 3 (#119, #107, #105) |
| PRs closed unmerged | 5 (#75, #91, #93, #97, #108) |
| Contributors (merged authors) | amikofalvy (Andrew), mike-inkeep, miles-kt-inkeep, tim-inkeep, dimaMachina (Dima), nick-inkeep, sarah-inkeep + 1 Claude bot commit |
| V0-N-tagged story PRs merged | 5 (#76 V0-8, #88 V0-4, #111/#103 V0-24, #112 V0-6, #39 V0-16) |
| V0 planning doc churn | PROJECT.md updated 4× in window |

**Merged-PR density by author in window:**
- Andrew: 13 PRs (platform infra + cross-cutting polish + PROJECT.md dashboard updates)
- Dima: 6 PRs (V0-4 + dependency hygiene + tsd tweaks)
- Nick: 4 PRs (markdown engine migration + R23 guard + post-migration hardening + suggestion refactor)
- Mike: 3 PRs (#76 graph, #115 internal links, #123 Unicode slugs, #85 backlink raw scanner)
- Sarah: 3 PRs (#100 code editor polish, #110 docked panel, #116 resize/collapse)
- Miles: 2 PRs (#39 Timeline, #122 history tools)
- Tim: 2 PRs (#103 V0-24 spec, #111 V0-24 impl)

---

## Per-owner summary

Pointers to full artifacts in `per-owner/`. Headline per owner:

### Andrew (`per-owner/andrew.md`) — 2 shipped, 0 in-prog, 1 remaining
Tight scope discipline on his 3 stories. **V0-1** (PR #99) and **V0-2 server primitive** (PR #106) both shipped clean with all acceptance criteria covered. **V0-20** (desktop) correctly deferred to Later. **Informal scope-adds:** 5+ cross-cutting polish PRs not in PROJECT.md (Cmd/Ctrl+click tooltip #117, reveal-active-file #113, image-inline serialization fix, CLI init clarity #109, CLI update scaffold #119 OPEN, changeset-bot unblock #118, codemirror dedup #124, persistence no-op skip #121). See scope-adds section.

### Miles (`per-owner/miles.md`) — 1 shipped today, 0 in-prog, 2 remaining
**V0-16 Timeline+Rollback shipped today** at 09:23 (PR #39, 5128 insertions). Clean delivery with 3 architectural scope-adds (TQ8 mode-state enum, TQ10 typed origins, TQ11 activity-map schema) all justified as forward groundwork. **V0-14 undo unblocked** by 2026-04-13 Observer A decoupling — ready to start. **V0-17** not started (Next phase). **NEW since audit ran:** PR #122 "feat: add history tools" merged at 15:18 — 11 files, empty PR body, likely V0-16 follow-up MCP/API polish (see Scope-adds).

### Mike (`per-owner/mike.md`) — 2 shipped, 0 in-prog, 6 remaining
**V0-8 Graph view** (PR #76) and **V0-12 Unicode slugs** (PR #123) shipped cleanly. **V0-3 is the biggest silent-start risk** — Now-phase consumer of V0-2, unblocked but zero commits/branches. **V0-12 has one deferred decision (PQ9):** core slug algorithm shipped, but the vault-rewrite migration strategy (options a/b/c for existing docs with broken anchors) is still unchosen — needs pre-launch decision or it becomes a data-migration hazard. **Scope-add flagged:** PR #115 "internal markdown links as first-class KB links" — expands V0-8 beyond wiki-link syntax, low-risk parity improvement.

### Tim (`per-owner/tim.md`) — 1 shipped, 1 in-progress (stale claim), 0 remaining
**V0-24 enriched exec MCP** fully shipped via #103 (spec) + #111 (impl) 2026-04-13. **V0-26 is a status-claim/reality gap:** PROJECT.md (updated 2026-04-13 by Nick) declares 3 workstreams "underway" but audit finds **0% progress on workstreams 1 & 2** (`list_documents` enrichment, harness integration) and **~30% on workstream 3** (file-ops MCP wrappers — backend done in V0-4 but MCP surface not written). No spec exists yet.

### Dima (`per-owner/dima.md`) — 2 shipped, 0 in-prog, 5 remaining
**V0-4 file ops** (PR #88) and **V0-9 outline panel** (PR #110 + #116) shipped. **Two meaningful scope-cuts:** V0-4 deferred Move/Duplicate/Create-folder to post-v0 (spec bullets that were in V0 scope, now out) and confirmation UX lightened from spec; V0-9 shipped without IntersectionObserver scroll-position tracking and uses 2s polling instead of CC1 push (undermines V0-2 payoff). **Ownership attribution drift:** V0-9's two shipping PRs authored by sarah-inkeep, not Dima, despite PROJECT.md assigning him as lead. 5 remaining stories (V0-10, V0-18, V0-19, V0-22, V0-23) show no silent-starts. **Other:** Dima has open PR #107 (knip dep cleanup, 40+ "rm" commits) which is dependency hygiene, not V0-tracked.

### Sarah (`per-owner/sarah.md`) — 1 shipped, 0 in-prog, 1 remaining (blocking)
**V0-6 image paste** (PR #112) shipped with one PQ4 spec deviation: storage uses sibling-co-located assets instead of per-doc subfolder (spec said the latter). This is a reconciliation-needed deviation — either update spec or relocate assets pre-launch. **V0-7 onboarding: not started, zero activity, on critical path** — blocks V0-22 tabs and is a direct user-visibility gap at launch. **Cross-cutting:** Sarah also shipped #100 code editor polish and authored the docked-panel pattern PRs (#110, #116) that Dima's V0-9 credits — collab pattern is working, but V0-7 needs formal hand-off from Andrew's platform primitives to Sarah's UI.

### Nick (`per-owner/nick.md`) — no formal V0 assignment; heavy editor-internals activity
**58+ commits in window.** 3 major merged PRs: #83 (marked→remark migration), #95 (R23 guard hardening), #101 (post-migration hardening + I8-I11 test pyramid). **Material deviation:** PROJECT.md says TQ5 (Observer A character-level refactor) is "Starting now" but audit finds zero commits to `observers.ts:206-249`. Miles's V0-14 undo was decoupled from TQ5 on 2026-04-13, so this is no longer blocking, but PROJECT.md line is stale. **Scope-add:** test pyramid I8-I11 (guard completeness + structural crash resistance) exceeds declared TQ6 scope — valuable hardening. **Active work branch:** Observer A origin-aware diff spec (US-001..US-007 commit tags, unmerged) — pre-launch research, not V0-blocking.

---

## Material scope deviations

This section aggregates the specific scope-cut and scope-add findings across all owners — the user explicitly asked for these to be surfaced and contextualized.

### Scope cuts (things deferred that were plausibly in V0 scope)

**Launch-risk (need a call):**

1. **V0-9 outline: scroll-position tracking deferred, polling instead of push** — Dima's V0-9 ships with 2s polling instead of CC1 push subscription and without IntersectionObserver-based active-heading detection. Both undermine the payoff of Andrew's V0-2 CC1 primitive. Spec wanted push; shipped polling. Either post-launch follow-up or pre-launch patch.
2. **V0-4 move/duplicate/create-folder deferred post-v0** — Dima's V0-4 spec listed these as in-scope file operations; delivery ships rename+delete only. For a "files you can operate on" V0, missing folder creation is user-visible absence.
3. **V0-4 confirmation UX lightened from spec** — spec required structured confirmation; delivery uses lighter UX. Ambiguous whether intentional or cut for time.
4. **V0-12 vault-rewrite migration strategy (PQ9) undecided** — Mike's V0-12 shipped the slug algorithm, but the migration path for existing docs with now-broken heading anchors (options a/b/c per PROJECT.md) is still open. Ship-blocker if vaults with legacy slugs exist; not-a-blocker if launch population starts fresh.

**Accepted (documented deferrals, noted for record):**

5. **V0-6 image storage location: sibling-co-located, not per-doc subfolder (PQ4)** — Sarah's V0-6 ships one spec-option; the other was on the table. Needs spec reconciliation (update spec to match shipped behavior, or plan follow-up).
6. **TQ5 Observer A char-level refactor** — PROJECT.md says "Starting now"; reality is 0 commits. After 2026-04-13 decoupling, it's no longer V0-14 blocking, so this is a *drift in the status doc* rather than a real scope cut. See "Drift" section.

### Scope adds (improvements beyond V0 scope — contextualized)

**Architectural groundwork (beyond story scope but justified):**

1. **V0-16 TQ8/TQ10/TQ11 (Miles)** — Mode-state enum (`editorMode: 'wysiwyg'|'source'|'diff'` replacing boolean), typed origins schema, activity-map per-writer attribution. All documented in PR #39 body, justified as forward-enabling for V0-14 undo. Low risk.
2. **V0-26 infrastructure via PR #74 (Tim)** — Enriched-read-tools infrastructure landed but doesn't itself satisfy V0-26 workstream acceptance. Foundation-laying ahead of spec.
3. **I8-I11 test pyramid (Nick)** — Guard completeness + structural crash resistance invariants exceed TQ6 scope. Pure hardening.
4. **V0-8 internal markdown links as first-class KB links (Mike, PR #115)** — Originally wiki-link-only story; PR extends parity to standard markdown links. Low-risk scope expansion.

**Informal UX polish (not tracked in PROJECT.md — worth surfacing):**

5. **Andrew's cross-cutting polish PRs** — 5+ small PRs that don't map to any V0-N: Cmd/Ctrl+click tooltip on link chips (#117), "Reveal active file in sidebar" (#113), image-inline serialization fix, codemirror dedup (#124), persistence no-op skip (#121), changeset-bot unblock (#118). These are "while-we-were-here" quality improvements. Worth noting because they consume platform-owner capacity that PROJECT.md doesn't account for.
6. **PR #119 OPEN — CLI update/upgrade command (Andrew)** — Scaffolding for `open-knowledge update` with package-manager detection. Not tracked as a V0-N story, but clearly launch-prep ("ready for day 1"). Should be added to PROJECT.md or explicitly called out as scope-add.
7. **PR #122 — Miles's "history tools" (merged post-V0-16, 11 files, empty PR body)** — Merged 5h after PR #39. Likely V0-16 follow-up MCP/API surface for timeline/history queries; not visible in V0-16 spec acceptance criteria. Needs 1-sentence disposition (V0-16 polish? new tool surface? V0-26 overlap?).

### Unknown / needs owner input

- **Tim V0-26 workstream definitions** — PROJECT.md's three-workstream claim lacks a spec. Is this already descoped, or Tim's backlog, or genuinely in flight with private branches? Audit couldn't distinguish.

---

## Drift from PROJECT.md (status lines that no longer match reality)

| PROJECT.md claim | Reality |
|---|---|
| V0-16 "In progress — PR #39 open, 17 review comments, needs rebase" | **Shipped** (PR #39 merged 2026-04-14 09:23) |
| TQ5 "Starting now" (Nick) | Zero commits in 48h; decoupled from V0-14 so no longer blocking but claim is stale |
| V0-26 "underway (3 workstreams: list_documents, harness, file-ops)" | 0% workstreams 1-2; ~30% workstream 3 |
| V0-9 "Dima leads" | Delivery PRs (#110, #116) authored by Sarah; likely effective co-authorship not reflected |

---

## Now-phase launch blockers (ranked)

1. **V0-7 onboarding (Sarah)** — not started, no branch, no PR. Direct user-visibility gap at launch. Blocks V0-22 tabs downstream.
2. **V0-3 BacklinksPanel push consumer (Mike)** — not started. Without this, V0-2's CC1 primitive delivers no user-visible real-time behavior. This is the "show the work" blocker.
3. **V0-12 migration decision (Mike, PQ9)** — needs a decision, not code. Blocks safe rollout for vaults with legacy slug content.
4. **V0-9 polling-vs-push + active-heading detection (Dima)** — ships, but the user-visible "real-time" story is diminished. Decide: post-launch patch or fix before ship.
5. **V0-14 undo (Miles)** — unblocked today by V0-16; needs to start. Core-journey feature (Cmd+Z in a collab editor). If slipped to post-launch, document it explicitly.
6. **V0-26 (Tim)** — ambiguous status. Either fix the PROJECT.md claim or stand up a spec + start work; right now it's unfalsifiable.
7. **V0-10 quick switcher (Dima)** — not started. Accelerates navigation; absent at launch is noticeable but not a blocker.

---

## Recommended PROJECT.md patches (list only — not applied)

1. V0-16: change "In progress" → "Shipped — PR #39 merged 2026-04-14". Move to Shipped section.
2. V0-14: change "Wires after V0-16 scaffold removal (TQ13)" → "Unblocked; starting". Note Observer A decoupling.
3. TQ5: either remove "Starting now" claim or reframe as "Deferred — independent track, no longer V0-blocking".
4. V0-26: replace "underway" with status matched to reality. List which workstreams have started vs are backlog. Add spec link placeholder.
5. V0-9: add footnote on scope-cut (polling, no IntersectionObserver). Credit Sarah as co-author of shipping PRs.
6. V0-4: add footnote on deferred move/duplicate/create-folder + confirmation-UX delta.
7. V0-6: reconcile PQ4 storage-location decision — update spec or plan relocation.
8. V0-12: make PQ9 migration-strategy decision a pre-launch item.
9. Add informal scope-adds as a new section: "Unscoped in-window polish" listing Andrew's 5+ cross-cutting PRs + PR #119 CLI update + PR #122 history tools, so PROJECT.md reflects where capacity actually went.

---

## Appendix A — 48h PR manifest (merged)

**V0-story PRs:**
- #39 V0-16 Timeline+Rollback (Miles, 2026-04-14)
- #76 V0-8 Graph view (Mike, 2026-04-13)
- #88 V0-4 File ops delete/rename (Dima, 2026-04-13)
- #99 V0-1 spec (Andrew, 2026-04-13)
- #103 V0-24 spec (Tim, 2026-04-13)
- #106 V0-2 spec + server primitive (Andrew, 2026-04-13)
- #111 V0-24 impl (Tim, 2026-04-13)
- #112 V0-6 image paste (Andrew author, Sarah spec, 2026-04-13)
- #123 V0-12 Unicode slug fix (Mike, 2026-04-14)

**Scope-adjacent / cross-cutting:**
- #83 marked→remark migration (Nick)
- #85 backlink raw scanner + react dedupe (Mike)
- #95 R23 guard hardening (Nick)
- #100 code editor polish (Sarah)
- #101 post-migration hardening + I8-I11 (Nick)
- #110 docked panel ux (Sarah → V0-9)
- #115 internal markdown links as first-class KB links (Mike → V0-8 scope-add)
- #116 panel resize/collapse (Sarah → V0-9)
- #117 Cmd/Ctrl+click tooltip (Andrew, informal polish)
- #121 persistence no-op skip (Andrew, fix)
- #122 history tools (Miles, V0-16 follow-up scope-add)
- #124 codemirror dedup (Andrew, fix)

**Infrastructure / housekeeping:**
- #87 Bun CLI update (Dima)
- #89 lint unblock (Andrew)
- #92 types (Andrew)
- #94 @tiptap/pm/model (Dima)
- #96 ws/wss scheme (Andrew)
- #98 remark-mdx recovery (Andrew)
- #102 delete docs/bun.lock (Dima)
- #104 jsdiff vulnerability (Dima)
- #109 CLI init clarity (Andrew)
- #113 reveal active file (Andrew)
- #114 remove dead catalog-gen (Andrew)
- #118 changeset-bot unblock (Andrew)
- #120 v0-launch status dashboard (Andrew)

**Open PRs (in window):**
- #119 CLI update/upgrade scaffolding (Andrew) — scope-add, launch-prep
- #107 knip dep cleanup (Dima) — hygiene
- #105 tolerant MDX parsing (Mike, draft) — superseded by Nick's work?

---

## Appendix B — Verification methodology

1. Phase 1 exploration mapped PROJECT.md surface area (one file, 26 stories).
2. 7 parallel Explore subagents ran per-owner audits with identical structure:
   - Read owner's PROJECT.md section + referenced specs in `specs/`
   - Cross-ref every referenced PR via `gh pr view --json`
   - Check silent-starts on "remaining" stories via branch + PR search
   - Compare PR diff/body to spec acceptance criteria → classify scope-cut / scope-add / match / unknown
3. Main thread ran global `git log --all --since=...` + `gh pr list --search="updated:>=..."` to catch unowned and cross-cutting work.
4. Per-owner artifacts: `per-owner/{andrew,miles,mike,tim,dima,sarah,nick}.md`.
5. Spot-check: 3 shipped stories verified against gh merge state (V0-1 #99 ✅, V0-2 #106 ✅, V0-16 #39 ✅).

Known limitations:
- Miles's agent attempted to write directly but was blocked; artifact transcribed from agent output.
- Not every spec under `specs/` was read by every agent — scope-cut claims are evidence-cited but not exhaustively verified.
- Nick's work-branch activity (Observer A origin-aware diff) is pre-launch R&D, not in V0 scope, and only summarized.
