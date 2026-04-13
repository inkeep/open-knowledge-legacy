# Changelog — day-0-editor-completeness

## 2026-04-12

- **Created** project from gap analysis session. Audited 47 Obsidian/Notion-class features against open-knowledge codebase. Found 12 existing, 5 partial, 30 missing.
- Input is rich — user provided infrastructure-layer decomposition (Layers 0-5) mapping features to their dependency chains.
- Existing shaped work that relates: `stories/init-and-project-switching/` (draft PR #75), `stories/managed-rename-inbound-rewrite/`, `stories/backlinks-push-over-awareness/`, `specs/2026-04-11-sidebar-realtime-updates/` (draft), `specs/2026-04-11-electron-desktop-app/`.

### Phase 1 — Outcomes enumerated
- **Frame-check analysis** (`/analyze` ultrathink) resolved three framing questions: (1) primary beneficiary = end-user writer with AI agent as shared-surface consumer, (2) no scope ceiling — shape all stories then phase, (3) Electron wraps React app unchanged, no special coordination. User confirmed frame.
- Six outcomes enumerated that pass the "when we're done" quality gate: organize KB, real-time sidebar, onboarding, navigation, structure/relationships, editor basics.
- Four items carved OUT of scope as separate bets: full-text search, user-facing version history UI, Electron-specific features, multi-project switching (Part B of init-and-project-switching).

### Phase 2 — Stories refined
- 7 stories decomposed from 6 outcomes: S1 (real-time sidebar), S2a (file ops bundle), S2b (rename+backlink), S3 (onboarding), S4 (Cmd+K + recents), S5 (surface graph APIs), S6a (find/replace), S6b (sort + word count).
- Each story at project-grade: multi-dimensional value with intersection reasoning, constraints, lateral and forward connections.
- Extraction probes surfaced 5 new items: TQ4 (keyboard shortcut scheme), PQ7 (new folder — Decided to bundle into S2a), PQ8 (duplicate — Decided to bundle into S2a), TQ5 (UI layout for 4 panels in S5), XQ3 (multi-user collab semantics for file ops).

### Phase 3 — Cross-story synthesis
- Now (6wk): S1, S2a, S3 — dependency-first + risk-first + customer-journey-first, walking skeleton stands alone
- Next (6-8wk): S2b, S5, S4 — value-first, highest-ROI remaining
- Later: S6a, S6b — promote on user feedback signal
- 5 rabbit holes identified. 5 pre-mortem failure modes with mitigations.
- All 11 items in Items table resolved: 10 Decided/Assumed with verification plans, 2 remaining Open (TQ4 keyboard scheme, TQ5 ED-6 panel layout) are spec-level concerns appropriate to defer.

### Rationalization pass
- Renamed story IDs from S1-S6b to **ED-1 through ED-7** to avoid collision with root `PROJECT.md`'s S1-S10 (Phase 1 stories).
- Split `stories/init-and-project-switching/` — Part A (onboarding) owned by this project as ED-4; Part B (project switching) stays standalone as sibling bet.
- Updated root `STORIES.md` header to mark Phase 1 as largely shipped and point to this project as Phase 2.
- Added split notice to `stories/init-and-project-switching/STORY.md` recording the ownership change.
