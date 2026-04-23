---
name: projectdir-couplings
description: Nine consumer call-sites in `hocuspocus-plugin.ts` where PROJECT_ROOT flows through `isTestIsolated`-unaware bindings — cross-contamination under per-worker isolation. Load-bearing for D12 (single-binding approach supersedes D3/D4/D9).
type: evidence
sources:
  - packages/app/src/server/hocuspocus-plugin.ts:136,175,207,213,220,225,262,267,292 (post-D12 line numbers)
  - packages/server/src/backlink-index.ts:767
generated: 2026-04-22
revision: 2026-04-23 — post-local-review pass 2: added persistence `projectDir` at L220 (was implicit in original D12 enumeration but not listed). Count raised from 7 consumer sites named in prose to 9.
---

# projectDir couplings under test isolation

Nine consumer call sites in `packages/app/src/server/hocuspocus-plugin.ts` consume `projectRoot` (post-D12) directly or indirectly. Under per-worker Playwright, any missed site silently cross-contaminates between workers and the developer's OK repo unless routed through a single `isTestIsolated`-aware binding (D12). The single binding is: `const projectRoot = isTestIsolated ? CONTENT_DIR : PROJECT_ROOT`; any new consumer must thread this binding rather than deriving from `PROJECT_ROOT` directly.

**Audit history.** Spec first landed with 3 sites enumerated (D3 BacklinkIndex, D4 persistence `getCurrentBranch`, D9 server-lock `worktreeRoot`). Audit finding F1 + challenger finding CF1 (2026-04-22) surfaced three additional sites (L245→L262, L250→L267, L275→L292 in current line numbers) at the api-extension and server-observer wiring points; one of them (api-extension `projectDir`, the L267 site in current code) would cause `/api/save-version` to write real commits + `ok/v<N>` tags to the developer's OK repo during local Tier 1 / Playwright runs. D12 replaces the per-site decomposition with a single module-scope `projectRoot` binding. Local review pass 2 (2026-04-23) surfaced that persistence's own `projectDir: projectRoot` at L220 was implicitly threaded by D12 but not called out as a distinct consumer in evidence or the `AGENTS.md` STOP rule — it IS a separate consumer from `getCurrentBranch` at L225.

## Full site enumeration (post-D12, current code)

Line numbers are post-D12 in the current file. The eight consumer sites + the one intermediate derivation follow.

> **Line numbers are point-in-time snapshots from this PR's HEAD** (`957f60a4` plus the post-PR-#292 cleanup pass). Line numbers in `hocuspocus-plugin.ts` will drift as the file evolves; the `projectRoot` binding identity (and the AGENTS.md STOP rule that names it) is the durable contract, not these line numbers. To re-verify the enumeration after future changes, run `grep -nE 'projectRoot|PROJECT_ROOT' packages/app/src/server/hocuspocus-plugin.ts` and reconcile.


| Line | Binding | Pre-D12 status | Post-D12 |
|---|---|---|---|
| L123 | `CONTENT_ROOT = relative(projectRoot, CONTENT_DIR)` | Derivation (intermediate, not a consumer per se) | Derived from projectRoot so `CONTENT_ROOT === ''` under isolation |
| L136 | `acquireServerLock.worktreeRoot` | Hardcoded `PROJECT_ROOT` | Uses `projectRoot` (tmpdir under isolation; was D9) |
| L175 | `runDevShadowInit(projectRoot, …)` | Only ran on `!isTestIsolated` (skipped under test) | Runs always; projectRoot = tmpdir under isolation (D13 broadens error handling) |
| L207 | `contentFilter.projectDir` | Already gated `process.env.OK_TEST_CONTENT_DIR ? CONTENT_DIR : PROJECT_ROOT` (correct) | Uses `projectRoot` (no behavior change; removes inline ternary) |
| L213 | `BacklinkIndex.projectDir` | Hardcoded `PROJECT_ROOT` (D3 target) | Uses `projectRoot` |
| **L220** | **persistence `projectDir`** | **Hardcoded `PROJECT_ROOT` — implicit in D12 threading but not enumerated** | Uses `projectRoot` |
| L225 | persistence `getCurrentBranch` | Hardcoded `PROJECT_ROOT/.git` (D4 target) | Uses `projectRoot/.git` |
| **L262** | **api-extension `getCurrentBranch`** | **Hardcoded `PROJECT_ROOT/.git` — surfaced by audit F1** | Uses `projectRoot/.git` |
| **L267** | **api-extension `projectDir`** | **Hardcoded `PROJECT_ROOT` — surfaced by audit F1; causes `/api/save-version` to write to dev's OK repo** | Uses `projectRoot` |
| **L292** | **server-observer extension `getCurrentBranch`** | **Hardcoded `PROJECT_ROOT/.git` — surfaced by audit F1; causes `saveInMemoryCheckpoint` branch attribution drift** | Uses `projectRoot/.git` |

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
