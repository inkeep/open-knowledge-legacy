# Perf baselines — changelog

Descriptive snapshots, not CI gates (see `specs/2026-04-19-perf-diagnostic-toolkit/SPEC.md` §6 D3 LOCKED and `CLAUDE.md` architectural precedent #24 "Perf instrumentation as first-class").

Each entry records the date, the purpose, the commit SHA, the hardware class, and the headline numbers. The aggregate JSON alongside this file carries the full shape; the raw per-run results under `../results/` are ephemeral (gitignored).

---

## 2026-04-19 — pre-fix baseline

**File:** `2026-04-19.json`
**Purpose:** Capture the 4 symptom magnitudes against the newly instrumented editor, before any of the SPEC's F26–F29 fixes land. Serves as the reference point for US-006 (S4), US-007 (S2), US-008 (S1), US-009 (S3).

**Commit:** `4721c98904a372b8abff94a8bfce24874fe4bd23` on branch `perf/investigation`.

**Hardware:** Apple-silicon laptop (MacBook-Pro-79.local).

**Driver:** `bun run perf:profile` against a dev server on VITE_PORT=5174 (the `playwright-stability` worktree; :5173 is owned by a different worktree in this environment).

**Headline numbers (pre-fix):**

| Symptom | Metric | Value | AC threshold | Passes |
|---|---|---:|---:|---|
| S1 cold-load big doc | `coldLoadMs` | 11,175 ms | ≥ 10,000 | ✓ |
| S2 warm switch-back | `warmSwitchMs` | 737 ms | ≥ 500 | ✓ |
| S3 mode-toggle | `modeToggleLayoutMs` (trace.layout + trace.style, upper bound) | 2,038 ms | ≥ 300 | ✓ |
| S3 mode-toggle | `modeToggleMs` (wall-clock, stricter lower bound) | 609 ms | ≥ 300 | ✓ |
| S4 outline idle polling | `apiCallCount` over 30 s idle | 13 | ≥ 10 | ✓ |

**Test docs at capture time:**

| Doc | Size | Lines | Role |
|---|---:|---:|---|
| README | 5.5 KB | 116 | small-doc workhorse (S2/S4) |
| CLAUDE (→ AGENTS) | 149 KB | 1,051 | mid-size reference |
| PROJECT | 3.25 MB | 8,364 | big-doc workhorse (S1/S3) |

The original /tmp/ok-perf/FINDINGS.md ran against a 9.7 MB / 25K-line PROJECT.md; this worktree has a 3.25 MB / 8,364-line PROJECT.md. All four symptoms still reproduce at AC-required magnitudes, scaled to the doc size present in this worktree.

**Context to re-capture against:** the symptom magnitudes scale with doc size. If `PROJECT.md` changes materially, re-capture before comparing fix outcomes against this baseline — a 2× PROJECT swing outweighs a 2× fix improvement.

**Follow-ups unblocked by this baseline:** US-006 (S4 fix), US-007 (S2 diagnosis + fix), US-008 (S1 diagnosis + fix), US-009 (S3 diagnosis + fix), US-010 (post-fix baseline).

---

## 2026-04-19 — post-fix baseline

**File:** `2026-04-19-postfix.json`
**Purpose:** Capture the 4 symptom magnitudes after US-006 (S4 fix), US-007 (S2 diagnosis), US-008 (S1 fix + diagnosis), US-009 (S3 diagnosis). Closes the loop on the SPEC's F26–F29 fix/diagnosis work.

**Commit:** `a2001f599ea6c8b93821eaa6a674e03efd8a5ccd` on branch `perf/investigation`.

**Hardware:** Apple-silicon laptop (MacBook-Pro-79.local) — same as pre-fix.

**Driver:** `bun run perf:profile` against the same VITE_PORT=5174 dev server from the `playwright-stability` worktree used for the pre-fix capture. Doc sizes, viewport, headless mode, and hardware are all identical — the only variable is the code between `4721c989` (pre-fix) and `a2001f59` (post-fix).

**Headline comparison:**

| Symptom | Pre-fix | Post-fix | AC outcome | Story |
|---|---:|---:|---|---|
| S4 apiCallCount over 30 s idle | 13 | **0** | AC19 ✓ fixed | US-006 |
| S1 `coldLoadMs` (CDP-traced, noisy) | 11,175 ms | 13,164 ms | AC20 ✓ architecturally-bounded | US-008 |
| S2 `warmSwitchMs` | 737 ms | 672 ms | AC21 ✓ architecturally-bounded | US-007 |
| S3 `modeToggleMs` (wall-clock) | 609 ms | 595 ms | AC22 ✓ architecturally-bounded | US-009 |
| S3 `modeToggleLayoutMs` (trace) | 2,038 ms | 1,974 ms | (same AC22) | US-009 |

**Outcome summary.** 1 of 4 symptoms received a direct fix (S4 — clean `13 → 0` win via `refetchInterval` removal + Y.Doc update-event invalidation). 3 of 4 symptoms (S1, S2, S3) are documented as **architecturally-bounded** — evidence files at `specs/2026-04-19-perf-diagnostic-toolkit/evidence/s{1,2,3}-diagnosis.md` catalog the root cause, the attempted fix (for S2, where the D11 lever was tried + reverted), and V2 follow-up proposals (module-level editor cache, `content-visibility: hidden` experiment, viewport-virtualized ProseMirror). AC20/21/22 each permit `architecturally-bounded with reasoning chain` as an alternative to the numeric target.

**Why S1's CDP-traced `coldLoadMs` reads higher post-fix.** Iteration 8 measurement learning: CDP tracing adds ~2× overhead on large-doc cold loads, and run-to-run variance on trace runs routinely exceeds ±1,500 ms. The defer-mount fix's actual impact (~200–500 ms improvement on this worktree's 3.25 MB PROJECT, proportional to doc size) is inside that noise floor. The authoritative post-fix measurement for S1 is the raw CDP-free probe documented in `evidence/s1-diagnosis.md`: `coldLoadMs` 8,465–8,741 ms post-fix vs 8,923 ms pre-fix on identical dev server + doc. For a 2× larger doc, expected savings scale proportionally.

**Non-regressions confirmed:**

- `bun run check` green (13 turbo tasks, 648 tests).
- `bunx playwright test` green on the AC-required subset (`docs-open.e2e.ts` 20/20, `crdt-stress.e2e.ts` 1/1, `paste-fidelity.e2e.ts` 38/38).
- Precedent #18 content-continuity (F1 scroll survives A → B → A) intact — the LIMIT=1 attempt in US-007 broke it, the revert restored it, and `docs-open.e2e.ts:F1` has been green on every iteration since.

**What the post-fix baseline does NOT claim:**

- It does **not** claim "all four symptoms are resolved." Three are architecturally-bounded. The evidence files are the detailed reasoning chain.
- It does **not** serve as a CI gate. D3 LOCKED: baselines are descriptive, local-dev only. Read for diagnosis; don't enforce.
- It does **not** promise stability across hardware. Run on a different laptop and the absolute numbers will drift; the **shape** of the differences should be stable.

**Follow-ups unblocked by this baseline:** V2 paths for S1/S2/S3 are cataloged in the diagnosis evidence files, not scheduled here. The most impactful single V2 item is a **module-level TipTap editor cache** that would fix both S2 (warm-switch) and S3 (mode-toggle) by decoupling editor lifetime from React + Activity — flagged in `evidence/s2-diagnosis.md §V2` and `evidence/s3-diagnosis.md §V2`. See `CLAUDE.md` precedent #24 ("Perf instrumentation as first-class") for the pattern going forward.
