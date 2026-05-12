# Changelog — typed-ipc-migration story

## 2026-04-28 — Story scaffolded

- Initiated via `/stories` skill from a fresh `/worldmodel` topology of typed IPC in the desktop package.
- Source context:
  - Worldmodel covered: code channel (full `/explore`), web channel (3 probes on Electron typed-IPC libraries), reports/CATALOGUE scan, user sources (SPEC.md, PRECEDENTS.md, packages/desktop/README.md).
  - PR #270 articulates the migration as future work; trigger threshold ("6th channel") in PR body is superseded by in-source comment in `packages/desktop/src/shared/ipc-channels.ts:13–15` (">20 channels, currently 21, past the trigger").
  - PR #345 (in-flight, by amikofalvy) adds 3 more channels through current pattern.
- Tagged FU-3 from `specs/2026-04-11-electron-desktop-app/SPEC.md` §1.
- Greenfield posture (per Nick's user memory) — no deferred tech debt, prefer clean cuts.
- Scope coherence check: passes 2-3 sentence test ("Migrate desktop's hand-rolled typed IPC to a library-backed solution to retire the triplicated `OkDesktopBridge` contract and the regex drift catchers"). Single atomic story.

## 2026-04-28 — User direction captured (4-question batch)

- Library decision: DEFERRED to /spec, with candidate list seeded for comparison (TQ1).
- Why-now framing: combined trigger-tripped + active-friction + DX/foundation framing — captured in SCR Complication's three pressures.
- Cleanup scope: full sweep — README + latent channels + drift-catcher granularity all in scope (TQ5/TQ6/TQ7 all locked).
- Renderer shape: DELEGATED to /spec (TQ2).

## 2026-04-28 — Validation pass

- Resolution gate caught three P0 Open items: TQ3 (PR #345 sequencing), TQ8 (teardown semantics), XQ1 (Andrew coordination).
- Converted: TQ3 → Parked with revisit trigger at /spec scoping; TQ8 → Parked with revisit trigger during /spec library evaluation; XQ1 → Decided (Directed) with action to loop Andrew at /spec kickoff.
- Implementer's veto simulation: a /spec consumer can take this seed, see the three deferred decisions (TQ1 library, TQ2 renderer shape, TQ3 sequencing) clearly named, and start investigating without re-deriving the problem framing or the in-scope cleanup boundary.

