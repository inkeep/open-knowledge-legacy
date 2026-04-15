# Changelog

## 2026-04-14 — Session 1: Intake + scaffold

- Problem framed in SCR format (Situation/Complication/Resolution)
- 5-probe stress test passed (demand real, status quo concrete, narrowest wedge identified, observation via research, future-fit confirmed as more essential)
- 3 personas identified: non-dev primary, developer secondary, AI agents tertiary
- Initial constraints captured (one-server-per-contentDir, shadow modes, simple-git locked, credential infra from clone spec)
- SPEC.md drafted with §1–§9 populated + §14 Future Work + §16 References
- Evidence harvested from this session's worldmodel run into `evidence/shadow-pipeline-reusability.md`
- Baseline commit stamped: e59f87a (clean working tree; last 7 commits unrelated to git/CRDT domain — graph, managed rename, dead links, suggest links, source-view polish)
- Prior research consumed: `reports/git-lifecycle-push-pull-merge-patterns/REPORT.md` (873 lines; D8 sync-button decomposition, Theme 7 failure-mode gradient, sync-engine prior art table), `reports/auto-persistence-version-history-patterns/REPORT.md`, `reports/git-library-for-knowledge-platform/REPORT.md`
- Parent spec: `specs/2026-04-14-clone-from-github/SPEC.md` approved 2026-04-14 with 19 locked decisions; this spec extends
- Key architectural insight landed: shadow pipeline is the sync pipeline; parent-git sync = dual-write + remote ops layer, not a parallel subsystem

## 2026-04-14 — Session 1: Batch 1 decisions (D1-D5) — mental model

- **D1 LOCKED:** Auto-sync aggressiveness = aggressive but batched. Auto-commit on L2 flush (30s idle, same as shadow). Auto-push on 120s interval (batches multi-commits). Auto-pull on interval when behind + no conflicts.
- **D2 LOCKED:** Save Version stays as named parent commit + tag + shadow checkpoint, but UI demoted to secondary (menu item) — auto-sync is primary flow.
- **D3 LOCKED:** Protected branches → disable sync for that repo + toast. Happy path only; no alternative workflows (no auto-create user branches, no PR creation). Tightest scope per Nick.
- **D4 LOCKED:** Conflict resolver = side sheet (consistent with Timeline pattern).
- **D5 LOCKED:** Auto-sync NOT gated by trust gate in v1. Trust gate (clone spec D9) protects agent-write attack surface; sync pushes user-authored edits to the repo's own origin — lower-risk. Revisit if threat model evolves.
- Trust gate concept explained in §13 Risks.
- SPEC.md §7 FRs updated (FR7, FR7a added), §10 Decision Log populated, §13 Risks populated (R1-R5 + trust gate context).

## 2026-04-15 — Session 1: Batch 2 decisions (D6-D9) — commit format, dual-write, conflict UX, credential flow

- Nick pushed back on over-engineering and divergence. Investigation before locking.
- **D6 LOCKED (HIGH):** Auto-commit message matches shadow exactly: `"WIP auto-save ${ISO timestamp}"`. Zero divergence.
- **D7 LOCKED (HIGH):** Dual-write at L2 — shadow-first, parent-second, parent-retry on failure. Investigation: write-only-to-parent would break per-writer attribution via HEAD watcher → `commitUpstreamImport` → `UPSTREAM_WRITER`. Dual-write is the minimum-divergence path; same plumbing, two targets.
- **D8 LOCKED approach (MEDIUM ⚠):** Conflict resolver = side sheet + per-file [Keep mine] [Keep theirs] [Resolve manually] + DiffView extension with `@codemirror/merge mergeControls: true`. Approach locked; `mergeControls` fitness verification pending (OSS research direction 2).
- **D9 LOCKED approach (MEDIUM ⚠):** Credential flow via `open-knowledge auth git-credential` subcommand (implements git credential-helper protocol, reads `@napi-rs/keyring`). Matches clone-spec Tier A pattern; resolves clone-spec's Tier B/C silent gap. Token refresh strategy pending OSS research (direction 1 — GCM + git-credential-oauth patterns).
- Investigation findings: Miles is NOT building interactive merge UI (DiffView PR #39 is read-only). Clone spec Tier B/C credential handoff was silent (gap). Shadow L2 commit message is timestamp-only at `persistence.ts:183`.
- Trust gate (D5) advisory finding carried forward: current config schema has no code-execution power; trust gate is defensive for future config growth, not load-bearing for today's threats. Flag for clone spec refinement.
- Uncertainty table added to §10 (INVESTIGATE flags for D8 `mergeControls` fitness + D9 token refresh).
