---
name: audit-findings
description: Cold-reader audit findings for the .ok/ rename + .okignore spec
type: meta
date: 2026-04-30
sources:
  - SPEC.md
  - evidence/
auditor: general-purpose-subagent (cold-reader)
---

## Executive summary

- **Verdict: needs work.** Two high-severity factual errors in load-bearing claims (FR3 + adopt-detection topology; FR5 site count) and one structural omission (an undocumented `.git/open-knowledge` literal in `fs-traced.ts:43` that must rename in lockstep with the shadow repo or telemetry classifier silently mis-buckets every shadow-repo write post-rename).
- **Adopt detection is mis-described.** The spec repeatedly asserts `state-manifest.ts` checks BOTH `.open-knowledge/` AND `.git/open-knowledge/` (FR3 acceptance criteria, §8 Current state, §10 D1 Implications, §14 Risks). The code says the opposite: `detectProjectShape()` (state-manifest.ts:83-88) signals adoption ONLY from `existsSync(shadowRepoDir)`. The lockDir param is intentionally unused (line 84-85: `void opts.lockDir;`). The function docstring (lines 60-82) is explicit that `.open-knowledge/` is NOT a reliable signal because `acquireServerLock` and `initContent` create it during boot. FR3's acceptance criteria as written ("confirms fresh-init triggers when both absent and adoption triggers when either is present") would describe a non-existent code path; implementing to that criteria would re-introduce the lockDir-misclassification bug that D14 (cited in the docstring) explicitly fixed on 2026-04-27.
- **Server-src literal-site count is wrong.** Spec FR5 + §8 + §11 Q8 say "16 hardcoded server-src `.open-knowledge` literal sites." Actual count: `git grep -E "'\.open-knowledge'" -- packages/server/src/*.ts` excluding `*.test.ts` returns **9 line-hits across 8 files** (api-extension, backlink-index, conflict-storage, managed-rename-journal, server-factory, skill-install, sync-engine, upload-streaming). The evidence channel itself (_code_channel.md §1.B) lists ~16 entries but ~half are jsdoc/comment lines, not literal-string sites. FR5's success gate is misframed: "git grep `'\.open-knowledge'` returns zero in source files" is well-defined, but the "16 sites" anchor an implementer would use to plan the diff is wrong by ~2x.
- **Missing rename target in fs-traced classifier.** `packages/server/src/fs-traced.ts:43` contains a literal `${sep}.git${sep}open-knowledge${sep}` shadow-repo classifier — not just lines 49,51 as FR5 + D6 + §9 cite. Renaming the shadow repo to `.git/ok/` without updating line 43 silently breaks the `'shadow-repo'` cardinality bucket — every shadow write would fall through the classifier ladder and re-bucket as `'git'` (since `${sep}.git${sep}` still matches at line 46) until someone notices Tempo dashboards lost their shadow-repo split. Telemetry-classifier coverage is a STOP-rule concern (cardinality discipline) per CLAUDE.md.
- **`preview.baseUrl` precedent is mis-cited.** FR8 + NG3 + §9 reference the precedent at `core/src/config/errors.ts` for `preview.baseUrl` rejection. `errors.ts:186` is the agent-settable error string, not the `preview.baseUrl` rejection site. The actual `preview.baseUrl` validation lives at `schema.ts` via Zod URL validation (errors.test.ts:114, schema-jsonschema.test.ts:55-60); there is no source-located YAML rejection error string for `preview.baseUrl` in errors.ts at the cited line. Either the precedent path is wrong or the rejection mechanism for `content.{include,exclude}` has no exact precedent — the spec should not promise "same precedent as `preview.baseUrl`" without verifying the precedent matches the desired UX (source-located error pointing at `.okignore`).
- **Otherwise structurally sound.** D1-D9 LOCKED with traceable rationale; FR1-FR15 mostly verifiable; alternatives §9 considered; risks §14 reasonable. Audit lenses L4 (evidence-synthesis fidelity) and L7 (inline source attribution) catch the four issues above; L1/L5/L6 pass; L3 surfaces minor ambiguities (below).

## High severity

### [H] Finding 1: FR3 misdescribes adopt-detection logic; will cause regression if implemented as written

**Category:** FACTUAL (Track T1 — own codebase)
**Source:** L4 (evidence-synthesis fidelity); T1 verification
**Location:** §6 FR3, §8 Current state bullet 4, §10 D1 Implications, §11 Q11 cross-ref, §14 second risk row
**Issue:** Multiple sites in the spec assert `state-manifest.ts` checks BOTH `.open-knowledge/` AND `.git/open-knowledge/` for adopt-detection. Verified against code at `packages/server/src/state-manifest.ts:83-88`:

```ts
export function detectProjectShape(opts: { lockDir: string; shadowRepoDir: string }): ProjectShape {
  // lockDir intentionally unused — see docstring above.
  void opts.lockDir;
  if (existsSync(opts.shadowRepoDir)) return 'adopt';
  return 'fresh';
}
```

The docstring (lines 60-82) is explicit:
> **Adoption is signaled ONLY by the shadow repo** at `<projectRoot>/.git/open-knowledge/`. The `<contentDir>/.open-knowledge/` directory is NOT a reliable signal — it can exist for reasons that don't imply pre-version-field durable state... If we treated lockDir-existence as adoption, every fresh project would be misclassified as adopted and stamp schema-0 instead of the current schema. The shadow repo is durable, version-relevant state... Note: the original spec text in §6.2 listed both signals; this implementation narrows to the shadow repo per **D14's calibration after the user's smoke test surfaced the lockDir-misclassification bug (2026-04-27)**.

**Current text (§6 FR3):** "Adopt-detection logic in `state-manifest.ts` is updated to check both `.ok/` AND `.git/ok/` … `state-manifest.test.ts` (or equivalent) confirms fresh-init triggers when both absent and adoption triggers when **either is present** … Otherwise renamed-but-otherwise-existing projects get treated as fresh-init."

**Evidence:** state-manifest.ts:62-77 (docstring explicit on the narrowing); state-manifest.ts:83-88 (implementation); the docstring's reference to D14 + the 2026-04-27 smoke-test bug.

**Status:** CONTRADICTED.

**Impact on the rename:** The actual at-risk surface is **only** `.git/open-knowledge/` → `.git/ok/`. Updating just the shadow-repo path keyword in `state-manifest.ts` (the jsdoc + the path passed via `shadowRepoDir`) is correct and sufficient. Implementing FR3 as written ("either is present") would *re-introduce* the lockDir-misclassification bug and require a follow-up fix. The acceptance criteria as worded would also pass for an implementation that introduces a bug, since `state-manifest.test.ts` could be made to satisfy it.

### [H] Finding 2: Server-src literal-site count overstated by ~2x; FR5 success gate anchored on wrong number

**Category:** FACTUAL (Track T1)
**Source:** L4; T1 verification
**Location:** §6 FR5, §8 Current state bullet 5, §11 Q8 (resolved → D6), §10 D6 row
**Issue:** Spec asserts "16 hardcoded server-src `.open-knowledge` literal sites" multiple times. Actual `git grep -n -E "'\.open-knowledge'" -- 'packages/server/src/*.ts'` excluding `*.test.ts` returns **9 line-hits across 8 files**: api-extension.ts:5198, backlink-index.ts:767, conflict-storage.ts:50, managed-rename-journal.ts:30, server-factory.ts:279, skill-install.ts:86, sync-engine.ts:224, upload-streaming.ts:87 (+ one second hit in one of these). The "~16" count in evidence/_code_channel.md §1.B mixes literal-string sites with jsdoc/comment occurrences. Comments don't fail typecheck; they're a separate sweep.

**Current text (§6 FR5):** "all 16 hardcoded server-src `.open-knowledge` literal sites are routed through `OK_DIR` (Q8b → D6 systematic pass)"

**Evidence:** `git grep -n -E "'\.open-knowledge'" -- 'packages/server/src/' ':!packages/server/src/*.test.ts'` → 9 hits.

**Status:** CONTRADICTED (count overstated).

**Impact:** Mostly cosmetic — the success gate `git grep returns zero in source files` is well-defined regardless of the wrong number. But the "16 sites" anchor will mislead an implementer planning the diff size and the systematic pass commit. Recommend either dropping the count or stating "~9 literal sites + jsdoc/comment sites" with the gate doing the work.

### [H] Finding 3: `fs-traced.ts:43` shadow-repo classifier is a third literal site, not surfaced anywhere in spec

**Category:** FACTUAL (Track T1)
**Source:** L4; pre-mortem scan; T1 verification
**Location:** §6 FR5, §10 D6 row, §9 System-design "Observability" bullet
**Issue:** FR5 says "Telemetry classifier in `fs-traced.ts:49,51` derives the path-segment string from OK_DIR or an internal alias." But `fs-traced.ts:43` contains a separate classifier line for the shadow repo:

```ts
if (p.includes(`${sep}.git${sep}open-knowledge${sep}`) || p.includes('shadow-repo')) {
  return 'shadow-repo';
}
```

This line uses the literal `open-knowledge` (without the leading dot, since the segment already includes `.git/`). It is the ONLY classifier that buckets shadow-repo writes. None of the spec — D1 (shadow rename), FR2 (`.git/open-knowledge/` → `.git/ok/`), FR5 (telemetry classifier), or D6 (OK_DIR consistency pass) — surfaces this site as an explicit rename target. The OK_DIR constant is `.open-knowledge` and would not directly cover `.git/open-knowledge/` (a different path segment); the rename also doesn't have a constant for `'open-knowledge'` (no leading dot).

**Evidence:** `git grep -n -E '(open-knowledge|\.git/open-knowledge)' -- 'packages/server/src/fs-traced.ts'` → lines 29 (jsdoc example), 30 (jsdoc example), 43 (classifier), 49, 51.

**Status:** CONTRADICTED / INCOHERENT (omission contradicts spec's claim of comprehensive coverage in FR2 + FR5).

**Impact:** If implementer renames `.git/open-knowledge/` → `.git/ok/` without updating fs-traced.ts:43, every shadow-repo write post-rename will fall through to the next ladder rung (line 46: `${sep}.git${sep}`) and bucket as `'git'`. Tempo dashboards keyed on `fs.path.role = 'shadow-repo'` will silently go empty. Cardinality blow-up risk if shadow-repo writes were a high-volume bucket. Detection is post-merge / runtime-only — the grep gate `git grep -E '\.git/open-knowledge'` would catch the line 43 site (substring match), but the fix would be reactive, not prescribed.

### [H] Finding 4: `preview.baseUrl` precedent does not exist at the cited mechanism

**Category:** FACTUAL (Track T1)
**Source:** L7 (inline source attribution); T1 verification
**Location:** §3 NG3, §6 FR8, §6 FR10 (errors string), §9 "Error messages" bullet
**Issue:** Spec asserts "Same precedent as `preview.baseUrl` at user scope" (NG3, FR8) and references `core/src/config/errors.ts:186` as the precedent error-string site. errors.ts:186 is actually the literal `Agent-settable paths: content.include, content.exclude, folders[],` — the `NOT_AGENT_SETTABLE` error string, not a `preview.baseUrl`-rejection mechanism. Searching for `preview.baseUrl` in `packages/core/src/config/` only surfaces it in:
- `schema.ts:27` (a comment that *also* references "the existing `preview.baseUrl` precedent" — circular reference)
- `errors.test.ts:114` (assertion: `'preview.baseUrl: Invalid URL'` — a Zod URL validation error message, NOT a YAML key-rejection error)
- `field-registry.test.ts:143-155` (project-strict field test)
- `schema-jsonschema.test.ts:55-60` (URL validation tests)

There is no source-located error message in errors.ts for "this YAML key is rejected; use a different mechanism instead" matching the desired `content.{include,exclude}` rejection UX (FR8 acceptance criteria: "schema rejects them with a source-located error" + §9 "source-located error pointing at the line in `config.yml` plus a one-line directive").

**Evidence:** `grep -rn "preview.baseUrl" packages/core/src/config/` (4 hits, none of which are an error-string template); `errors.ts:175-194` shows the surrounding error formatting with no preview-specific case.

**Status:** UNVERIFIABLE / CONTRADICTED (the precedent as cited does not match the implementation site).

**Impact:** FR8's acceptance criteria — "schema rejects them with a source-located error; field-registry test asserts removal; YAML loader points users to `.okignore` in error message" — promises a UX (source location + redirect message) that has no in-codebase precedent to copy. Implementer either (a) uses Zod's default error path, which is NOT source-located in YAML and NOT redirectable, (b) builds a new mechanism, or (c) removes the keys without a friendly migration message. The spec should either point at the actual precedent (if one exists for source-located YAML rejection), or mark this as new-mechanism work with its own FR.

## Medium severity

### [M] Finding 5: Cross-cutting concerns not enumerated in §10 (Type=X column under-used)

**Category:** COHERENCE (L1)
**Source:** L1 / cross-cutting threading scan
**Location:** §10 Decision Log
**Issue:** Of D1-D9, only D3 is tagged Type=X (cross-cutting). But several decisions thread cross-cutting concerns:
- **Telemetry naming** (cardinality classifier in fs-traced.ts) — touched by D6 and unaddressed FR5 gap (Finding 3) — should appear as cross-cutting.
- **Schema/JSON-schema published artifact** (Q19 — `dist/schemas/v0/config.{project,user}.schema.json` regenerates) — cross-cutting (server, cli, mcp clients consume the published JSON schema).
- **Error envelope / message UX** (Q17 errors.ts:186 + FR8 + FR10 + Finding 4) — the migration error message is consumer-facing across CLI, MCP, and Settings pane.

The spec's CLAUDE.md guidance (§10 protocol) says cross-cutting concerns get an explicit Type=X tag for §16 Agent Constraints derivation. The current decision log misses this on at least three threads.

**Status:** INCOHERENT (under-use of structural type-tagging).

### [M] Finding 6: §3 NG2 "Auto-migrator on startup" is in tension with §10 D3 wording but the spec passes silently

**Category:** COHERENCE (L1)
**Source:** L1
**Location:** §3 NG2 vs. §13 deployment row "Worktree `.git/open-knowledge/` shadow repos"
**Issue:** NG2 forecloses migrators. §13 deployment table row 2 says "existing shadow repo at `.git/open-knowledge/` becomes orphan (harmless directory in `.git/`); user can `rm -rf .git/open-knowledge` after pulling the rename PR." This is the *correct* hard-cutover behavior — but it materially changes what "adopt detection" means after rename. Pre-rename, the existing `.git/open-knowledge/` shadow at adopt-time means "this project pre-dates the manifest scheme." Post-rename, the same directory is orphan cruft and the new `.git/ok/` is a *fresh* path that will write a current-schema manifest on first boot. So every dogfood-team project goes through "adopt-as-fresh" detection, never "adopt-as-pre-versioned." That's fine for pre-release, but the spec doesn't note the schema-versioning consequence — every dogfood project's `state.json` gets re-stamped with the current schema, losing the "predates manifest scheme" signal.

**Status:** INCOHERENT (silently re-stamps schema-0 → current). Surface in §13 or §14 risks.

### [M] Finding 7: `.changeset/init-gitignore-consolidation.md` (Q18) — implementer needs explicit conflict criteria

**Category:** RESOLUTION-COMPLETENESS GATE
**Source:** §6 + §11 Q18
**Location:** §11 Q18, §14 last risk row
**Issue:** Q18 is marked DELEGATED to "verify at implementation start; fold if needed." But the verification criterion isn't named. An implementer sees `.changeset/init-gitignore-consolidation.md` describes a prior consolidation; how do they decide "fold" vs "ship in parallel"? The DELEGATED resolution gives no decision rule. (This is true under the spec's own gate: "Acceptance criteria are verifiable.")

**Status:** UNVERIFIABLE (resolution criterion not named).

### [M] Finding 8: FR15 acceptance criterion ("indexes the exact same files post-rename") under-specifies what happens for non-default content.* configs

**Category:** RESOLUTION-COMPLETENESS GATE
**Source:** §6 FR15
**Location:** §6 FR15
**Issue:** FR15 says "An OK project with **only `.gitignore` + no custom `content.*` keys** indexes the exact same files post-rename as pre-rename." This passes for the dogfood shape. But there are tests in the codebase (per evidence/_code_channel.md §9) with custom `includePatterns: ['**/*.md', '**/*.log']` etc. The spec doesn't define equivalence for the *non-default* case post-rename, where `content.include` is removed — projects with custom include patterns *will* index a different set of files (`.log` files no longer included, since `isSupportedDocFile()` rejects them). Spec frames this as Q14 "DELEGATED to implementation" but doesn't name the post-rename behavior contract for users who relied on `content.include` to widen extensions. NG3 forecloses retaining the keys, but the user-impact statement ("a project with custom `content.include = ['*.log']` will no longer index `.log` files; this is intentional") is missing.

**Status:** AMBIGUOUS (acceptance criterion well-defined for default case only; non-default case behavior should be explicit since it's a user-visible change).

## Low severity / minor

### [L] Finding 9: §8 mention of `'state.json'` location in `.open-knowledge/` is inconsistent with `'state-manifest.ts'` docstring's tone

§8 lists `state.json` as one of the files held under `.open-knowledge/`, but state-manifest.ts:38 says the filename is "relative to the lock dir (`<contentDir>/.open-knowledge/`)" — slight phrasing drift. Not load-bearing.

### [L] Finding 10: §10 D9 cites `content-filter.ts:39-62` for `BUILTIN_SKIP_DIRS`; line range correct but the constant name is referenced explicitly

Confirmed lines 39-62 contain the Set. No issue; just calling out it's verifiable. (Minor: section headers in the source say `Build output:`, `VCS:` etc. — consistent with the spec's enumeration.)

### [L] Finding 11: Set-config allowlist count discrepancy

§6 FR10 + §9 say "allowlist drops to 3 paths." Set-config.ts:5-9 lists 5 paths today (`content.include`, `content.exclude`, `folders[]`, `mcp.tools.read_document.historyDepth`, `mcp.tools.search.maxResults`). Removing the two `content.*` keys leaves **3 paths** — correct. ✓

### [L] Finding 12: Settings pane file lines 81-103 verified

Checked SettingsPane.tsx:81-103: matches spec's claim of three fields (`dir` L88, `include` L93, `exclude` L98). ✓

### [L] Finding 13: `OK_DIR` constant location verified

Confirmed `packages/core/src/constants/ok-dir.ts:2` contains `export const OK_DIR = '.open-knowledge';` ✓

### [L] Finding 14: PRECEDENTS.md #25 hardcoding verified

Confirmed line 133 hardcodes `<projectRoot>/.git/open-knowledge/`. FR13 update is mechanical and locatable. ✓

### [L] Finding 15: `ignore` lib version verified

Confirmed `packages/server/package.json:37` shows `"ignore": "^5.3.2"` — matches spec Q13 resolution. ✓

### [L] Finding 16: §14 "Server-src OK_DIR inconsistency tempts a scope expansion" is now stale

§14 third-from-last risk row reads as if Q8 might still escalate scope. But Q8 resolved → D6 LOCKED systematic pass. The risk row anticipates scope expansion that has already been accepted; rewrite as "PR scope is enlarged by D6's systematic pass; mitigation: split commits."

## Factual spot-check log

| # | Citation | Outcome |
|---|---|---|
| 1 | `content-filter.ts:198-222` is the 4-step ordered logic | CONFIRMED — matches `isExcluded` body, lines 198-222 |
| 2 | `server-factory.ts:279` is the literal lockDir construction | CONFIRMED — `const lockDir = resolve(contentDir, '.open-knowledge');` |
| 3 | `OK_DIR` at `packages/core/src/constants/ok-dir.ts:2` | CONFIRMED — exact match |
| 4 | Settings pane fields at `SettingsPane.tsx:81-103` (three fields: dir, include, exclude) | CONFIRMED — matches L88/L93/L98 |
| 5 | Adopt-detection check uses `state-manifest.ts:17` (and FR3 implies BOTH `.open-knowledge/` AND `.git/open-knowledge/`) | **CONTRADICTED** — `detectProjectShape()` at L83-88 uses ONLY `shadowRepoDir`; `lockDir` is intentionally `void`-discarded (Finding 1) |
| 6 | PRECEDENTS.md #25 hardcodes `.git/open-knowledge/` | CONFIRMED — line 133 |
| 7 | `ignore` lib version `^5.3.2` in `packages/server/package.json:37` | CONFIRMED |
| 8 | `BUILTIN_SKIP_DIRS` at `content-filter.ts:39-62` (23 dirs) | CONFIRMED — set spans those lines (counted ~21 entries; close enough) |
| 9 | "16 hardcoded server-src `.open-knowledge` literal sites" | **CONTRADICTED** — 9 line-hits across 8 files in production source (Finding 2) |
| 10 | `fs-traced.ts:49,51` is the only telemetry classifier site | **CONTRADICTED** — line 43 is also a literal site for shadow-repo classification (Finding 3) |
| 11 | `preview.baseUrl` precedent at `errors.ts:186` | **CONTRADICTED** — line 186 is the agent-settable paths string, not a YAML-rejection precedent (Finding 4) |
| 12 | `init.test.ts:205-231` drift-guard for committed `.gitignore` | CONFIRMED — describe block "committed .open-knowledge/.gitignore matches scaffold output" |
| 13 | `errors.ts:186` literal text `"Agent-settable paths: content.include, content.exclude, folders[],"` | CONFIRMED |
| 14 | `OK_GITIGNORE_CONTENT` constant at `cli/src/content/init.ts:199-216` | CONFIRMED |
| 15 | Set-config allowlist would drop from 5 → 3 paths after removing `content.{include,exclude}` | CONFIRMED |
| 16 | `'openknowledge-service'` writer-ID literal sites (NG8) — `persistence.ts:467,478`, `shadow-repo.ts:467`, `contributor-tracker.ts:16` | PARTIAL — `persistence.ts:446,478` is the actual line range; `446` is a comment, not the cited 467. shadow-repo.ts has writer-ID at line 467; not cross-checked exhaustively. Minor — cite range is approximately right. |

## Pre-mortem

**Top-1 most-likely-wrong assumption: FR3's adopt-detection contract.**

If I had to bet on one assumption that could sink this implementation, it's the FR3 "check both `.ok/` AND `.git/ok/`" contract. The reasoning:

1. The spec wrote it in three places (§6 FR3, §8 bullet 4, §10 D1 Implications, §14 risk #2) — high cognitive lock-in.
2. The repo just shipped a fix on 2026-04-27 that explicitly **narrows** adopt-detection to the shadow repo only because the broader check caused dogfood-team misclassification (D14, per state-manifest.ts:79-81).
3. An implementer reading FR3 will write code that fails to honor D14's narrowing — adding the `.ok/` existence back into the detection branch — and the spec's acceptance criteria will *pass* the broken behavior because the test will be written to satisfy the spec's wording.
4. This re-introduces a known bug under a new directory name. Pre-release tolerance, but visibly broken on first day for every dogfood project.

**Second-place candidate:** Finding 4 — `preview.baseUrl` precedent doesn't actually exist for source-located YAML rejection. Implementer either lands shipping a Zod default error (poor UX, no migration message) or builds a new mechanism nobody asked for. Lower probability of sinking the spec because the FR is salvageable as "remove the keys; surface a deprecation notice somewhere," but a meaningfully degraded UX is the realistic outcome.

**Third:** Finding 3 — `fs-traced.ts:43` rename omission. Lower-impact (telemetry, not user-visible), but this is exactly the kind of post-merge surprise that the cardinality discipline STOP rule in CLAUDE.md is meant to catch ahead of time.

## Confirmed claims (summary)

- Citation accuracy: 12 of 16 spot-checked citations CONFIRMED at exact line/file. 4 CONTRADICTED (above). 1 PARTIAL.
- 1-way doors: D1-D9 all marked LOCKED with "No (still pre-release)" in 1-way-door column — consistent rationale (pre-release license).
- Coverage of write surfaces: Settings pane, MCP set_config, YAML loader all enumerated. Field registry test + errors string update both surfaced (Q16, Q17). Published JSON schemas surfaced (Q19).
- Risk register: 8 risks × 4 columns; mitigations named for all; ownership empty (acceptable for internal-refactor pre-release).
- Decision velocity: 5 P0 decisions resolved + 9 DELEGATED items + 9 NG entries — appropriate calibration for the scope.
- Scope hypothesis (§13): cleanly separated from Future Work (§15 Identified: CLI bin rename).

## Unverifiable claims

- **3,762 line-hits across 347 tracked files** (§8 Key constraints, §11 metric). Plausible order of magnitude; not re-counted in this audit. Acceptance gate (`git grep` returns zero) is well-defined regardless.
- **"~52 line-hits across docs/"** (§8). Not re-counted; spec acceptance gate is the grep, not the count.
- **CRLF behavior in `node-ignore.add(string)`** (A1 evidence). Marked HIGH-confidence in spec, but evidence/_web_channel.md "Probe 1" calls it UNRESOLVED in upstream docs. The `parseGitignorePatterns` upstream normalization is what makes A1 safe — A1's confidence label is downstream of OK's defensive normalization, not upstream library guarantees. Minor; does not affect spec correctness.
