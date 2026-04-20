# Perf baselines — changelog

Descriptive snapshots, not CI gates (see `specs/2026-04-19-perf-diagnostic-toolkit/SPEC.md` §6 D3 LOCKED and architectural precedent #20).

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
