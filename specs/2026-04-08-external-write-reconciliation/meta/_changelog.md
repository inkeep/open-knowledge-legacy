# Changelog

## 2026-04-08 — Initial draft

- Wrote SPEC.md covering the external-write reconciliation protocol and shadow-repo architecture.
- Candidate comparison in `evidence/design-reasoning.md` (A/B/C/D, with A chosen).
- Driven by the "what happens when a user runs `git pull` inside a Fumadocs repo with openknowledge installed" question — the spike's current persistence pipeline is data-destroying and host-polluting in integrated mode.
- 23 decisions locked/directed (§10), 20 open questions tracked (§11), 6-phase rollout plan (~13–20 days).
- Status: Draft — awaiting review before implementation.

## 2026-04-08 — Design revision: shadow as attribution journal

- **Major architectural change:** Shadow repo reframed from "the history layer" to "attribution journal." Project repo (renamed from host/parent repo) holds durable commit history via Save Version commits.
- **D1 revised:** Shadow is ephemeral acceleration for per-writer WIP attribution, not the durable history layer.
- **D24 added (LOCKED):** Save Version creates real commits on the project repo with co-authored-by trailers.
- **D25 added (LOCKED):** Checkpoint refs in shadow store full content tree snapshots (Option 1), surviving project-repo rewrites.
- **D26 added:** Shadow corruption is graceful degradation (low impact, not medium).
- **G1 reframed:** "Only user-triggered Save Version commits" replace "zero trace."
- **G3a, G3b added:** Save Version semantics and shadow corruption resilience.
- **FR21-23 added:** Save Version project-repo commits, checkpoint refs with tree snapshots, WIP ref reset.
- **Terminology:** "host repo" / "parent repo" → "project repo" throughout.
- **Future work:** "Export history to parent repo" is now default behavior, not an afterthought.
- Status: Draft → Finalizing.

## 2026-04-08 — Shadow location moved to .git/openknowledge/

- **D1 revised:** Shadow location changed from `.openknowledge/history.git` (project root) to `.git/openknowledge/history.git` (nested inside project `.git/`). Based on `reports/git-directory-nesting-shadow-repo/` research confirming safety.
- **D19 revised:** No `.gitignore` modification needed in integrated mode. Shadow is invisible to git transport/clone/push and untouched by git maintenance.
- **FR1 revised:** Init creates `.git/openknowledge/history.git`. Falls back to `.openknowledge/history.git` in standalone mode.
- **FR14 revised:** `.gitignore` modification only needed in standalone mode.
- **G1 revised:** Shadow lives inside `.git/`; no working-tree footprint at all.
- **G8 revised:** Integrated vs standalone distinguished by shadow location.
- **Init code sample** (§9.2): Updated with `resolveGitDir` pattern and correct `--unset core.bare` sequence.
- **Architecture diagram** updated to show shadow nested inside `.git/`.
- **Q2 resolved:** Conflict-marker regex now covers all three git styles (merge, diff3, zdiff3) by adding `|||||||` detection.
- All path references throughout spec updated.
