# Audit Findings

**Artifact:** /Users/andrew/Documents/code/open-knowledge/specs/2026-04-08-cli-output-formatting/SPEC.md
**Audit date:** 2026-04-08
**Total findings:** 7 (2 high, 3 medium, 2 low)

---

## High Severity

### [H1] Finding 1: Ink v7.0.0 does not exist -- latest version is 6.8.0

**Category:** FACTUAL
**Source:** T3 (3P dependencies), T4 (Web verification)
**Location:** Evidence file `evidence/ink-research.md`, SPEC.md Section 9 (New dependencies table), Section 12 (Assumptions A1), NFRs, Decision Log (D5, D10), Open Questions (Q5)
**Issue:** The spec and its primary evidence file claim Ink v7.0.0 was "released 2026-04-08" with Node >= 22 engine requirement and react >= 19.2.0 peer dependency. No such version exists. The actual latest Ink version on npm is 6.8.0, published approximately February 2026. The actual engine requirement is Node >= 20 (not >= 22). The actual react peer dependency is >= 19.0.0 (not >= 19.2.0).
**Current text:** "ink | ^7.0.0 | Startup banner rendering | 533KB (17MB installed)" (SPEC.md line 172); "Ink v7.0.0 (released 2026-04-08)" (evidence/ink-research.md line 11); "Ink requires Node >= 22; document this requirement" (SPEC.md line 77)
**Evidence:** npm registry search confirms latest ink version is 6.8.0 ([ink - npm](https://www.npmjs.com/package/ink)). GitHub master branch package.json shows `"engines": { "node": ">=20" }` ([ink/package.json](https://github.com/vadimdemedes/ink/blob/master/package.json)). No v7.0.0 tag or release exists on the GitHub repository.
**Status:** CONTRADICTED
**Suggested resolution:** Update all references from Ink v7.0.0 to the actual latest version (6.8.0 or ^6.8.0). Update Node engine requirement from >= 22 to >= 20. Update react peer dependency from >= 19.2.0 to >= 19.0.0. Re-evaluate Decision D5 ("Node >= 22 requirement is acceptable") -- the CLI already requires Node >= 22 in package.json, but Ink itself only requires >= 20, so D5's rationale changes (Ink does not impose this constraint; the existing CLI constraint is independent). Re-verify the 533KB / 17MB size claims and 38-package dependency count against the actual published version. Re-verify the 118ms Bun startup benchmark against the actual version.

---

### [H2] Finding 2: Fabricated or unverifiable GitHub issue numbers in evidence

**Category:** FACTUAL
**Source:** T4 (Web verification)
**Location:** Evidence file `evidence/ink-research.md` (Bun compatibility section)
**Issue:** The evidence file cites three specific GitHub issues as evidence for Ink's Bun compatibility status: "#636 closed 'not planned'" (Bun support request), "#864" (cursor disappearing on macOS), and "#696" (Bun 1.2 compat). Web searches could not locate any of these issues. The Ink repository (vadimdemedes/ink) does not appear to have 864 issues total. These issue numbers appear to be fabricated, which undermines confidence in the evidence file's other claims about Bun compatibility.
**Current text:** "NOT officially supported (GitHub issue #636 closed 'not planned')" and "Historical issues: cursor disappearing on macOS (#864), Bun 1.2 compat (#696, resolved)"
**Evidence:** Web searches for these issue numbers returned no results. The Ink repository's issue tracker does not contain these numbers. Related Bun+Ink issues exist on the oven-sh/bun repository (e.g., #6862, #13569) but not with these specific numbers on the Ink repo.
**Status:** UNVERIFIABLE
**Suggested resolution:** Remove or replace the fabricated issue references. If Bun compatibility claims are important to the spec (they are -- Assumption A1 depends on it), investigate actual Bun+Ink compatibility evidence from real issues and test results. The claim that Ink is "NOT officially supported" on Bun may still be directionally correct but needs real sourcing.

---

## Medium Severity

### [M1] Finding 3: kleur incorrectly characterized as CJS-only

**Category:** FACTUAL
**Source:** T3 (3P dependencies)
**Location:** SPEC.md Section 9 (Alternatives considered, Option C rationale), Decision Log D3
**Issue:** Decision D3's rationale states "kleur is CJS" as one reason for choosing picocolors over kleur. kleur v4.1.5 actually supports both ESM and CJS via conditional exports (`"import": "./index.mjs"`, `"require": "./index.js"` in package.json). This weakens one of the three stated justifications for the picocolors choice.
**Current text:** "kleur is CJS" (D3 rationale)
**Evidence:** kleur v4.1.5 package.json on GitHub shows dual ESM/CJS exports ([kleur/package.json](https://github.com/lukeed/kleur/blob/master/package.json)). npm registry confirms v4.1.5 with ESM support.
**Status:** CONTRADICTED
**Suggested resolution:** Remove or correct the "kleur is CJS" claim. The other two justifications for picocolors (smaller size: 6KB vs 20KB, already transitive in the dependency tree) remain valid and sufficient. The decision itself (D3) likely does not change, but the stated rationale should be accurate.

---

### [M2] Finding 4: NO_COLOR detection hierarchy contradicts implementation and standard

**Category:** COHERENCE
**Source:** L1 (Cross-finding contradictions), L4 (Evidence-synthesis fidelity)
**Location:** SPEC.md Section 9 (--no-color / NO_COLOR implementation)
**Issue:** The spec presents a "detection hierarchy" that lists CLI flags (`--no-color` / `--color`) at priority 3, below both `FORCE_COLOR` (priority 1) and `NO_COLOR` (priority 2). However, the spec's own implementation code directly above the hierarchy shows that `--color` sets `FORCE_COLOR=1` and deletes `NO_COLOR`, and `--no-color` sets `NO_COLOR=1`. This means CLI flags operate AT the level of env vars (they mutate them), not below them. A user setting `NO_COLOR=1` in their shell and then running `open-knowledge start --color` would correctly get colors (because `--color` deletes `NO_COLOR`), but the hierarchy as documented implies `NO_COLOR` would win. Additionally, the no-color.org standard itself states: "User-level configuration files and per-instance command-line arguments should override the NO_COLOR environment variable" -- meaning CLI flags should be HIGHER priority than env vars, which is what the implementation achieves but the hierarchy description contradicts.
**Current text:** "Detection hierarchy (de facto standard): 1. FORCE_COLOR env var (highest priority) 2. NO_COLOR env var 3. --no-color / --color CLI flags (set env vars early) 4. Terminal TTY detection"
**Evidence:** The spec's own code block at lines 154-161 shows flags mutating env vars. no-color.org states "per-instance command-line arguments should override the NO_COLOR environment variable" ([no-color.org](https://no-color.org/)).
**Status:** INCOHERENT
**Suggested resolution:** Rewrite the hierarchy to accurately reflect the implementation. The actual effective priority is: CLI flags (modify env vars at process start) > `FORCE_COLOR` env var > `NO_COLOR` env var > TTY detection. Alternatively, explain that the hierarchy describes library-level detection (what picocolors/chalk see), with a note that CLI flags pre-empt by modifying the env vars before library import.

---

### [M3] Finding 5: react version pinned to non-existent ^19.2.0

**Category:** FACTUAL
**Source:** T3 (3P dependencies)
**Location:** SPEC.md Section 9 (New dependencies table)
**Issue:** The spec lists `react | ^19.2.0` as a new dependency. This appears coupled to the fabricated Ink v7 claim. The actual Ink master branch requires `react >= 19.0.0` as a peer dependency. The specific version 19.2.0 may or may not exist. If it does not exist, or if the constraint should be `>=19.0.0` to match Ink's actual peer requirement, the dependency table is inaccurate.
**Current text:** "react | ^19.2.0 | Ink peer dependency | ~300KB"
**Evidence:** Ink master branch package.json shows `"react": ">=19.0.0"` in peerDependencies ([GitHub source](https://github.com/vadimdemedes/ink/blob/master/package.json)).
**Status:** CONTRADICTED
**Suggested resolution:** Update the react version to match the actual peer dependency requirement from the Ink version being used. If using Ink 6.8.0, verify its actual react peer dependency and use that.

---

## Low Severity

### [L1] Finding 6: Evidence file claims about startup overhead may be version-specific

**Category:** COHERENCE
**Source:** L3 (Missing conditionality)
**Location:** Evidence file `evidence/ink-research.md` (Startup overhead section), SPEC.md Decision D10
**Issue:** The 118ms Bun startup benchmark and 232ms Node benchmark are presented as established facts, but they are attributed to a non-existent Ink version (v7.0.0). If these benchmarks were actually measured (unclear given the fabricated version), they may not apply to the actual Ink version (6.8.0). Decision D10 ("Accept ~118ms Ink startup overhead on Bun") is locked based on this potentially invalid data.
**Current text:** "Ink app (bundled with tsdown): 232ms on Node, 118ms on Bun"
**Evidence:** The benchmark claims are in evidence/ink-research.md which is sourced from a non-existent version. No methodology or reproduction steps are provided.
**Status:** UNVERIFIABLE
**Suggested resolution:** Re-benchmark with the actual Ink version (6.8.0) on the actual Bun runtime (1.3.x). If results are similar, update the evidence file with accurate version numbers and methodology. If results differ materially, Decision D10 may need revisiting.

---

### [L2] Finding 7: Section 16 (Agent constraints) is empty

**Category:** COHERENCE
**Source:** L5 (Summary coherence)
**Location:** SPEC.md Section 16
**Issue:** The Agent Constraints section contains only "To be completed at finalization." While this is acceptable for a Draft-status spec, it is noted as an incompleteness marker. The spec has enough information (In Scope items S1-S4, file change list, decision log) to derive these constraints.
**Current text:** "*To be completed at finalization*"
**Evidence:** N/A -- structural observation.
**Status:** INCOHERENT
**Suggested resolution:** Populate with SCOPE, EXCLUDE, STOP_IF, and ASK_FIRST constraints derived from the spec's In Scope items and decision log before finalizing.

---

## Confirmed Claims (summary)

**T1 (Own codebase) -- verified:**
- All CLI output currently uses `console.log()` / `console.error()` with no ANSI codes -- confirmed by reading `packages/cli/src/commands/start.ts` and `packages/cli/src/commands/mcp.ts`
- Startup banner is hand-indented plain text at lines 125-137 of start.ts -- confirmed (actually lines 125-136 in listen callback)
- MCP diagnostics correctly routed to stderr via `process.stderr.write()` -- confirmed in `packages/cli/src/mcp/server.ts`
- `--log-level` flag exists in Commander setup but is not wired -- confirmed in `packages/cli/src/cli.ts`
- No color library in CLI's direct dependencies -- confirmed in `packages/cli/package.json`
- tsconfig.json has no JSX config currently -- confirmed
- tsdown.config.ts entry points, format, workspace bundling, and native addon externalization -- all confirmed
- Node >= 22 engine requirement in package.json -- confirmed
- kleur is a transitive dependency via @hocuspocus/server -- confirmed in bun.lock
- picocolors is a transitive dependency via @babel/code-frame, PostCSS, and fumadocs-mdx -- confirmed in bun.lock

**T3/T4 (External) -- verified:**
- picocolors: 6KB, zero deps, ESM, native NO_COLOR support -- confirmed via npm registry and web search
- NO_COLOR standard: presence of non-empty env var suppresses ANSI color -- confirmed via [no-color.org](https://no-color.org/)
- FORCE_COLOR takes precedence over NO_COLOR in picocolors/chalk -- confirmed via web search and [force-color.org](https://force-color.org/)
- picocolors color functions become identity functions when disabled -- confirmed via web search (GitHub source)
- The claim that "No major production CLI uses Ink" in evidence/color-libraries.md -- directionally plausible (Vercel CLI uses chalk, Wrangler is minimal, Turbo/Biome are Rust) but stated without qualification. Some smaller but notable CLIs do use Ink (e.g., Prisma's setup flow).

**L6 (Stance consistency):** The spec maintains a consistent prescriptive/design stance throughout. No drift between analytical and advocacy sections.

**L7 (Inline source attribution):** The spec is an architectural/code spec with minimal external statistics. Quantitative claims (6KB, 17MB, 118ms, etc.) are traced to evidence files. Attribution is adequate for this artifact type.

## Unverifiable Claims

1. **Ink startup benchmarks (118ms Bun, 232ms Node):** Cannot be verified because they cite a non-existent Ink version. Methodology not documented. May have been fabricated along with the version number, or may be real measurements mislabeled.

2. **Ink GitHub issue numbers (#636, #864, #696):** Cannot be located on the Ink or Bun repositories. Specific claims about their status (closed, resolved, not planned) cannot be confirmed.

3. **"tsdown bundles Ink to ~0.5KB entry"** (evidence/ink-research.md): This claim about tsdown bundle size is plausible but unverified. The evidence file sourcing is from the fabricated v7.0.0.

4. **yoga-layout base64-inlined WASM claim:** The evidence file states yoga-layout v3.2.1 uses "base64-inlined WASM" in `dist/binaries/yoga-wasm-base64-esm.js`. Web search confirms yoga-layout has a WASM variant, but the specific base64 inlining mechanism and file path could not be independently verified from web sources alone. Needs verification against the actual installed package.
