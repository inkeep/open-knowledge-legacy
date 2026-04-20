# CLAIMS addendum — 2026-04-19 contradiction resolution

**Context:** Exec Summary #13 of the parent REPORT.md flagged a contradiction between parent Finding #1 (stated `stryker-mutator-bun-runner@0.4.0` uses `coverageAnalysis: "off"`) and [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) (plugin author advertised "Smart coverage analysis with perTest coverage support"). This addendum documents the resolution via direct source-read.

## Resolution method

1. `git clone --depth 1 https://github.com/menoncello/stryker-mutator-bun-runner`
2. `npm pack stryker-mutator-bun-runner@0.4.0 && tar -xzf` → extracted published tarball
3. Compared main-branch source against published tarball source
4. Grep for `coverageAnalysis | perTest | mutantCoverage | __stryker__ | reportMutant` across both trees
5. Read `src/coverage/CoverageHookGenerator.ts` (116 LOC), `src/coverage/TestFilter.ts` (101 LOC), and `src/BunTestRunner.ts` (301 LOC) in the 0.4.0 tarball; read `src/bun-test-runner.ts` and `src/mutation/mutation-activator.ts` in the main-branch clone

## Claims resolved

| Claim | Status | Evidence |
|---|---|---|
| The published `stryker-mutator-bun-runner@0.4.0` implements `coverageAnalysis: "perTest"` | CONFIRMED | `src/coverage/` module ships in the tarball; `CoverageHookGenerator` emits `globalThis.__stryker__.mutantCoverage.{static,perTest}` initialization + a `test`/`it` wrapper that sets `currentTestId`; `TestFilter.getTestsForMutant(mutant, mutantCoverage)` reads `mutantCoverage.perTest[testId][mutantId]`; `BunTestRunner.mutantRun` calls the filter + passes the regex to Bun's `--test-name-pattern`; `BunTestRunner` guards coverage setup on `options.coverageAnalysis !== 'off'` |
| The plugin's README advertises perTest as the recommended config | CONFIRMED | `README.md` quick-start `stryker.config.json` uses `"coverageAnalysis": "perTest"`; features list includes "Coverage Analysis — Smart test filtering with perTest coverage" and "90% Less Test Runs with perTest coverage analysis" |
| Parent Finding #1's "coverageAnalysis: 'off'" characterization is incorrect | CONFIRMED | Contradicted by direct source-read of 0.4.0 `BunTestRunner.ts` lines 109, 116, 201–205, 244. Parent initial pass reached the incorrect conclusion without a tarball inspection |
| The main-branch v1.0.0 rewrite is a stub | CONFIRMED | `src/mutation/mutation-activator.ts` lines 39–53 contain `// TODO: Implement mutation activation` and use `_mutation: unknown` unused-prefix convention; `src/bun-test-runner.ts` imports `CoverageAnalyzer` from `./coverage/index.js` but no `coverage/` directory exists in the source tree |
| Installing via npm gets the functional 0.4.0; installing from GitHub main gets the stub | CONFIRMED | `npm pack stryker-mutator-bun-runner@0.4.0` yields the full tarball (v0.4.0, coverage module present); `git clone` of the GitHub repo shows `package.json` version `1.0.0` with the incomplete implementation |

## Knock-on effects on the parent report

1. Exec Summary #1 edited — now cites `perTest` implementation
2. Exec Summary #13 rewritten — from "contradiction exists" to "resolved; 0.4.0 implements perTest via 4-file coverage module"
3. §I.1 Community option paragraph rewritten — cites source-read evidence file; adds caveat on main-branch stub
4. §I.3 native-lever list updated — replaces "community bun runner is contested" with "community bun runner 0.4.0 also supports it (confirmed via source-read)"
5. §I.6 tradeoff matrix "Per-mutant wall clock" row corrected — replaces "perTest status disputed" with "perTest confirmed via 0.4.0 source-read"
6. §I.6 concluding paragraph rewritten — reframed around the 1.0.0-rewrite-regression-risk instead of the now-resolved perTest question

## Gaps / remaining follow-ups

- The "2–3× vs Node" process-pool performance claim is still maintainer-self-report; an empirical benchmark on a parser-shaped suite would close it
- The plugin's ecosystem stability profile is still a concern independent of perTest support (no GitHub Releases, 1 maintainer, active architectural rewrite on main with incomplete implementation)
- Whether `@stryker-mutator/core` upstream absorbs the plugin via [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424) would change the risk profile; currently open

## Evidence file

[evidence/stryker-bun-runner-source-read.md](../../evidence/stryker-bun-runner-source-read.md) in the parent report directory
