---
name: projectdir-couplings
description: Seven sites in `hocuspocus-plugin.ts` where PROJECT_ROOT flows through `isTestIsolated`-unaware bindings — cross-contamination under per-worker isolation. Load-bearing for D12 (single-binding approach supersedes D3/D4/D9).
type: evidence
sources:
  - packages/app/src/server/hocuspocus-plugin.ts:121,160,190,196,208,245,250,275
  - packages/server/src/backlink-index.ts:767
generated: 2026-04-22
revision: 2026-04-22 — post-audit (F1+CF1): extended from 3 sites to 7 after audit/challenger surfaced missed enumeration.
---

# projectDir couplings under test isolation

Seven call sites in `packages/app/src/server/hocuspocus-plugin.ts` consume `PROJECT_ROOT` directly or indirectly. Under per-worker Playwright, these silently cross-contaminate between workers and the developer's OK repo unless routed through a single `isTestIsolated`-aware binding (D12).

**Audit history.** Spec first landed with 3 sites enumerated (D3 BacklinkIndex, D4 persistence `getCurrentBranch`, D9 server-lock `worktreeRoot`). Audit finding F1 + challenger finding CF1 (2026-04-22) surfaced three additional sites (L245, L250, L275) at the api-extension and server-observer wiring points; one of them (L250) would cause `/api/save-version` to write real commits + `ok/v<N>` tags to the developer's OK repo during local Tier 1 / Playwright runs. D12 replaces the per-site decomposition with a single module-scope `projectRoot` binding threaded through all 7 sites.

## Full site enumeration (post-D12)

| Line | Binding | Pre-D12 status | Post-D12 |
|---|---|---|---|
| L121 | `acquireServerLock.worktreeRoot` | Hardcoded `PROJECT_ROOT` | Uses `projectRoot` (tmpdir under isolation; was D9) |
| L160 | `runDevShadowInit(projectRoot, …)` | Only ran on `!isTestIsolated` (skipped under test) | Runs always; projectRoot = tmpdir under isolation (D13 broadens error handling) |
| L190 | `contentFilter.projectDir` | Already gated `process.env.OK_TEST_CONTENT_DIR ? CONTENT_DIR : PROJECT_ROOT` (correct) | Uses `projectRoot` (no behavior change; removes inline ternary) |
| L196 | `BacklinkIndex.projectDir` | Hardcoded `PROJECT_ROOT` (D3 target) | Uses `projectRoot` |
| L208 | persistence `getCurrentBranch` | Hardcoded `PROJECT_ROOT/.git` (D4 target) | Uses `projectRoot/.git` |
| **L245** | **api-extension `getCurrentBranch`** | **Hardcoded `PROJECT_ROOT/.git` — MISSED by pre-audit enumeration** | Uses `projectRoot/.git` |
| **L250** | **api-extension `projectDir`** | **Hardcoded `PROJECT_ROOT` — MISSED; causes `/api/save-version` to write to dev's OK repo** | Uses `projectRoot` |
| **L275** | **server-observer extension `getCurrentBranch`** | **Hardcoded `PROJECT_ROOT/.git` — MISSED; causes `saveInMemoryCheckpoint` branch attribution drift** | Uses `projectRoot/.git` |

## Why these show up together

`projectDir` / "parent repo root" is a single conceptual binding that SPEC 2026-04-21-shadow-repo-single-mode collapsed to one location in persistence (L203: `isTestIsolated ? CONTENT_DIR : PROJECT_ROOT`). The remaining six sites predate that fix and weren't swept. The single-binding approach (D12) removes the per-site inline ternary pattern entirely — any future addition of a `projectRoot`-derived consumer is obviously wrong-pattern (matches the `§16 ASK_FIRST` rule).

## Worst-case impact per site (if unpatched)

- **L121:** Server-lock metadata diagnostic drift. Operator reading the lock file during triage sees the wrong worktree. Not correctness-critical.
- **L160:** Shadow repo initialized inside the developer's OK repo under isolation instead of the tmpdir — bleeds WIP refs into the real project. Pre-spec this site was skipped under `isTestIsolated`; D12 reverses + corrects the target.
- **L190:** Content-filter scans the wrong root. File discovery returns the OK repo's content, not the tmpdir's fixture files. Pre-spec already gated correctly via inline ternary; D12 removes the ternary.
- **L196:** Backlink cache path becomes `<PROJECT_ROOT>/.open-knowledge/cache/main/backlinks.json`, concurrently written by N workers → lost-update race + dirty-tree artifacts in dev's OK repo.
- **L208:** WIP refs branch under the developer's currently-checked-out branch (e.g., `feat/foo`) instead of the tmpdir's fresh `main`. Tests become environment-dependent.
- **L245:** `/api/history`, `/api/rescue` query under the wrong branch — read-side returns empty even when writes landed correctly.
- **L250:** `/api/save-version` and `/api/rollback` call `simpleGit({baseDir: projectDir})` against the dev's OK repo — creates real `ok/v<N>` tags and commits in the real working tree during test runs. **The primary correctness failure the audit surfaced.**
- **L275:** `saveInMemoryCheckpoint` (bridge-merge-content-loss recovery) writes `refs/checkpoints/*` with the wrong branch name. Rare code path, but violates the D4 invariant.
