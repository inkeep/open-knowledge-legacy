# Audit Findings

**Artifact:** `specs/2026-04-16-post-ship-docs-polish/SPEC.md`
**Audit date:** 2026-04-16
**Baseline commit asserted:** `fa0050a4` (verified: worktree HEAD matches)
**Total findings:** 13 (2 High, 4 Medium, 5 Low, 2 Nit)

---

## Findings summary

| ID | Severity | Category | Location | Issue |
|---|---|---|---|---|
| F1 | High | COHERENCE | §4 R9 + §6 M2 vs §5.1 | R9/M2 acceptance criterion mandates "zero hits for I1-I10" in AGENTS.md, but the design in §5.1 deliberately retains "I1-I10" references at lines 530 and 778 to document the test-file split. Criterion is impossible to meet. |
| F2 | High | FACTUAL | evidence/i11-provenance.md:60-66 | Claims "all three live references are updated to I1-I11" after edits, but actual updated AGENTS.md contains 2 live "I1-I10" strings at lines 530 and 778 (intentionally, per §5.1 design). Evidence contradicts the deliverable. |
| F3 | Medium | FACTUAL | §4 R5 (line 74) | Spec demands weekly.yml:29 read exactly `"11 active invariants (I1-I11)"` but actual reads `"All 11 active invariants (I1-I11)"`. Acceptance text doesn't match the shipped text verbatim. |
| F4 | Medium | COHERENCE | §4 R4 (line 73) | AC for R4 says "AGENTS.md:778 mentions both locations." The current footnote at line 778 mentions I1-I10's path and I11's path, but the AC's phrasing is vague — "both locations" is undefined without §5.1 context. |
| F5 | Medium | FACTUAL | evidence/deliverables-verification.md:43 + health README "fire-site map" | Claim "5 in-file + 1 (ypsMismatch inside y-prosemirror patch) = 6" is underspecified. Patch has 2 semantic fire paths (createNodeFromYElement + createTextNodesFromYText) emitting block++/inline++ across 6 physical `++` statements (doubled CJS/ESM). Depending on counting convention, total is 5+2=7 or 5+1=6 or 5+4=9. |
| F6 | Medium | FACTUAL | §3 Scope (lines 52-53) | Claims health README "~300 lines" and perf README "~470 lines". Actual: 372 lines (24% over) and 529 lines (13% over). Not load-bearing but size estimates understate. |
| F7 | Low | FACTUAL | §1 header (line 7) | "1 PR (3 commits, ~800 LOC docs-only)". Actual: 906 LOC (372 + 529 + 5 AGENTS.md insertions). ~13% under. |
| F8 | Low | COHERENCE | §9 D8 rationale | "`.changeset/config.json` marks the three fixed-versioned packages" — config.json uses `"fixed"` (not `"linked"`). The §12 changelog entry says "fixed-linked packages" which conflates the two concepts. Mild terminological imprecision. |
| F9 | Low | FACTUAL | §5.1 line 98 | "Five edits (already applied in worktree)". Technically correct but `git diff --stat` shows 8 line changes in AGENTS.md (4 paired +/- diffs = 8 altered lines). The underlying logical-edit count of 4 in AGENTS.md + 1 in weekly.yml = 5 is correct but "five edits" could mislead on pure line count. |
| F10 | Low | COHERENCE | §4 R6 AC | AC says counter descriptions "match `packages/core/src/metrics/parse-health.ts` and fire sites match `parse-with-fallback.ts`". Verified — but README's fire-site table §Write paths lists `ypsMismatch.block`/`.inline` WITHOUT line numbers (unlike parseFallback which has `parse-with-fallback.ts:81, 324`), creating inconsistency in the table. |
| F11 | Low | COHERENCE | §10 OQ1 | "Currently no `tests/README.md` exists." Unverified (no evidence file checks this). Minor — grep reveals no such file, but OQ1 treats absence as given without citing. |
| F12 | Nit | CLARITY | §1 Situation (line 17) | The sentence enumerating downstream effects is ~75 words; a careful reader has to parse three comma-separated consequences without visual break. Not wrong, just dense. |
| F13 | Nit | CLARITY | §7 R4 row | "Our I11 row cites the tolerant-parsing spec's §M4/§D2 directly" — the deliverable's I11 row (AGENTS.md:776) cites "§M4 / §D2" with spaces. Not exactly the same casing, but not load-bearing. |

---

## High Severity

### [H] F1: R9/M2 acceptance criteria are impossible to meet under the §5.1 design

**Category:** COHERENCE
**Source:** L1 (cross-section consistency)
**Location:** §4 R9 (line 78), §6 M2 (line 164), §5.1 design (lines 100, 103)

**Issue:** §4 R9 states the acceptance criterion as: *"Grep for `I1-I10|I1–I10` shows zero hits in `AGENTS.md`."* §6 M2 restates this as a target: *"Grep `grep -n 'I1-I10\\|I1–I10' AGENTS.md` returns no hits. Target: Zero matches."*

But §5.1 edit #1 (line 100) explicitly keeps "I1-I10" in the fidelity tier row ("I1-I10 + handler PBTs"), and edit #4 (line 103) keeps "I1-I10" in the footnote ("I1-I10 live in `invariant-i{1..10}.test.ts`"). The design **deliberately** retains two "I1-I10" references to document the test-file split between I1-I10 (in `packages/app/tests/fidelity/`) and I11 (in `packages/core/src/markdown/`).

**Verification:** `grep -n 'I1-I10\|I1–I10' AGENTS.md` on the post-edit file returns two matches (lines 530 and 778). R9 and M2 cannot both pass and §5.1 be implemented as designed.

**Evidence:**
```
530:| Fidelity    | PBT invariants (I1-I11) + 6 handler-specific PBTs + ... | ... (I1-I10 + handler PBTs); ... (I11) | ...
778: PBT invariants I1-I10 live in `packages/app/tests/fidelity/invariant-i{1..10}.test.ts`. I11 lives at ...
```

**Status:** INCOHERENT

**Suggested resolution:** Rewrite R9 and M2 to target only the *stale* context of I1-I10 (e.g., "no `I1-I10 active` or `(I1-I10) + handler PBTs` text"). The intent is to ensure no context-free I1-I10 survives that would imply I11 is not active — but two context-bearing uses of "I1-I10" (as a path label in the split documentation) are correct and intended.

---

### [H] F2: Evidence file i11-provenance.md:60-66 claims a post-edit grep result that is not achievable under the committed design

**Category:** FACTUAL
**Source:** L4 (evidence-synthesis fidelity)
**Location:** `evidence/i11-provenance.md` lines 60-66

**Issue:** i11-provenance.md states:

> At baseline `fa0050a4`, grep `I1-I10|I1–I10` across the repo returns:
> - `AGENTS.md:530` — fidelity tier table row ("(I1-I10)")
> - `AGENTS.md:762` — section header
> - `.github/workflows/weekly.yml:29` — CI comment
>
> All other matches are in frozen spec documents or archival progress/ files (not live docs). After this PR's edits, **all three live references are updated to "I1-I11"**.

This is factually wrong. The actual committed edits retain "I1-I10" references at AGENTS.md:530 and :778 (the latter is new footnote text). Only the semantic "all active invariants are I1-I10" claims were updated; the two split-documentation uses of "I1-I10" survive.

**Verification:**
- `git show fa0050a4:AGENTS.md | grep -n 'I1-I10'` → 2 hits at lines 530 and 762.
- Post-edit worktree AGENTS.md → `grep -n 'I1-I10'` at lines 530 and 778.

Both edited lines keep "I1-I10" because the split-location documentation deliberately references the 10-file original set.

**Status:** CONTRADICTED

**Suggested resolution:** Rewrite evidence file §Grep verification to state: "Two of the three live 'I1-I10' references were updated (AGENTS.md:762 and weekly.yml:29). The remaining AGENTS.md:530 occurrence and new AGENTS.md:778 footnote deliberately retain 'I1-I10' as a path-qualifier to document the I1-I10 / I11 test-file split per §5.1 design."

---

## Medium Severity

### [M] F3: R5 acceptance criterion does not match shipped text verbatim

**Category:** FACTUAL
**Source:** T1 (codebase)
**Location:** §4 R5 (line 74) vs `.github/workflows/weekly.yml:29`

**Issue:** R5 says acceptance is met when weekly.yml:29 `"Reads '11 active invariants (I1-I11)'"`. The actual post-edit text at weekly.yml:29 is:

```
  # 30s to 90s. All 11 active invariants (I1-I11) plus the 6 new US-014 PBTs
```

The phrase "11 active invariants (I1-I11)" is present as a substring, but prefixed with "All " (a carry-over from the baseline text `"All 10 active invariants"`). A strict string-matching interpretation of R5 would fail; a substring interpretation passes.

**Status:** INCOHERENT (acceptance criterion ambiguity)

**Suggested resolution:** Update R5 to: "Contains the substring `'11 active invariants (I1-I11)'`" or rewrite the shipped comment to exact match. Substring is more defensible — the intent is semantic, not literal.

---

### [M] F4: R4 acceptance criterion is vague — "both locations" is not self-defining

**Category:** COHERENCE
**Source:** L1
**Location:** §4 R4 (line 73)

**Issue:** R4 AC: *"AGENTS.md:778 mentions both locations."* Without reading §5.1, a reader (or a future implementer verifying) does not know what "both locations" refers to. The intent is "both I1-I10's `packages/app/tests/fidelity/` path and I11's `packages/core/src/markdown/` path", but this is unstated in R4.

**Status:** INCOHERENT

**Suggested resolution:** Rewrite R4 AC: "AGENTS.md:778 cites both `packages/app/tests/fidelity/invariant-i{1..10}.test.ts` (I1-I10) and `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (I11)."

---

### [M] F5: Fire-site count "6" is under-defined

**Category:** FACTUAL
**Source:** T1 (codebase), L4
**Location:** `evidence/deliverables-verification.md:43`, `packages/core/tests/health/README.md` line 66 ("The fire-site map is load-bearing")

**Issue:** The evidence says "5 in-file + 1 (ypsMismatch inside y-prosemirror patch) = 6". Verification:

- `parse-with-fallback.ts` has 5 physical increment calls: lines 49, 71, 81, 123, 324. ✓
- `y-prosemirror@1.3.7.patch` has **2 semantic fire paths** (one at `createNodeFromYElement`, one at `createTextNodesFromYText`) → **6 physical `++` statements** (3 in CJS dist + 3 in ESM src, each duplicated because Bun patches both builds).

The "1" in "5 + 1 = 6" collapses two semantic ypsMismatch paths and ignores the CJS/ESM doubling. Different counting conventions yield 5+1=6 (semantic, ypsMismatch = 1 subsystem), 5+2=7 (semantic fire paths), 5+4=9 (dedup CJS/ESM physical sites), or 5+6=11 (raw `++` count). The spec §5.2 and README both say "6" without defining the convention.

**Status:** INCOHERENT (ambiguous counting convention)

**Suggested resolution:** Either define the convention in the README (e.g., "one entry per distinct subsystem and per logical JSON log-event path"), or enumerate the y-prosemirror fire paths explicitly. The README already lists parseFallback fire sites by location; applying the same treatment to ypsMismatch (2 paths, one per function the patch modifies) would be more honest.

---

### [M] F6: Size claims understate deliverable length

**Category:** FACTUAL
**Source:** T1 (direct file read)
**Location:** §3 Scope (lines 52-53), §5.2 (line 108), §5.3 (line 128)

**Issue:** Spec claims:
- `packages/core/tests/health/README.md` "~300 lines"; actual 372 lines (+24%).
- `packages/core/tests/perf/README.md` "~470 lines"; actual 529 lines (+13%).

This propagates into §1 "~800 LOC docs-only" — actual 906 LOC (372 + 529 + 5 AGENTS.md deltas = 906; weekly.yml is 1 changed line; +13%).

Not load-bearing for correctness, but a reader cross-checking expects numbers within ~5%.

**Status:** STALE (the work expanded relative to when the estimates were taken)

**Suggested resolution:** Update §1 to "~900 LOC" and §5.2/§5.3 to "~370" and "~530" respectively. Or drop the size qualifier — line count isn't a contractually meaningful number here.

---

## Low Severity

### [L] F7: "~800 LOC" header is stale

**Category:** FACTUAL
**Location:** §1 line 7

See F6. Actual: 906 LOC. Minor; spec frontmatter data.

**Status:** STALE

**Suggested resolution:** Update to "~900 LOC" or remove.

---

### [L] F8: D8 calls `.changeset` packages "fixed-linked" — config uses "fixed"

**Category:** FACTUAL
**Source:** T1 (`.changeset/config.json`)
**Location:** `meta/_changelog.md` line 21 — "D8 (skip changeset)" and §9 D8 rationale

**Issue:** `.changeset/config.json` has `"fixed": [[...]]` and empty `"linked": []`. These are distinct changeset concepts: `fixed` forces identical versions; `linked` only links some-not-all. The changelog says "`.changeset/config.json` marks the three fixed-versioned packages" — which is correct — but conflates with "fixed-linked" in at least one phrasing.

**Status:** INCOHERENT (minor terminological imprecision)

**Suggested resolution:** Drop the "linked" framing where it appears; use "fixed-versioned" consistently.

---

### [L] F9: "Five edits" phrasing misleads on raw line count

**Category:** CLARITY
**Location:** §5.1 line 98

**Issue:** "Five edits (already applied in worktree):" — logically correct (4 in AGENTS.md + 1 in weekly.yml = 5 logical edit locations). But `git diff --stat` shows 5 insertions + 5 deletions across AGENTS.md + weekly.yml = 10 raw line changes (actually 4 paired +/- diffs in AGENTS.md = 8 lines + 2 lines in weekly.yml = 10, or counting as "5 logical edits to 5 lines", etc.). Ambiguous phrasing.

**Status:** UNVERIFIABLE (the meaning of "edit" is underdefined)

**Suggested resolution:** Say "Five line-replacements" or "Five edit locations."

---

### [L] F10: README ypsMismatch fire-site table omits line numbers

**Category:** COHERENCE
**Location:** `packages/core/tests/health/README.md` §Write paths (lines 55-60)

**Issue:** Table lists `parseFallback.blockLevel` at `parse-with-fallback.ts:81, 324` and `parseFallback.wholeDoc` at `parse-with-fallback.ts:49, 71, 123` — with explicit line numbers. But `ypsMismatch.block` and `ypsMismatch.inline` rows cite "`globalThis.__okYpsCounters.block++`" / "`.inline++`" without patch line numbers. Inconsistent treatment makes the table harder to audit.

**Status:** INCOHERENT

**Suggested resolution:** Add patch file + line numbers: e.g., "`patches/y-prosemirror@1.3.7.patch` lines 21, 46, 69, 97 (CJS + ESM doubled; semantic fire paths at `createNodeFromYElement` and `createTextNodesFromYText`)."

---

### [L] F11: OQ1 asserts "no `tests/README.md` exists" without citation

**Category:** COHERENCE (missing evidence for a factual claim)
**Location:** §10 OQ1

**Issue:** OQ1 says *"Currently no `tests/README.md` exists."* This is verifiable (Glob `packages/core/tests/README.md` returns no match), but the spec doesn't cite this. A future reader re-opening the question should have a pointer to the verification path.

**Status:** UNVERIFIABLE without investigation

**Suggested resolution:** Cite: "Verified `ls packages/core/tests/README.md` at baseline `fa0050a4` — no such file exists."

---

## Nit

### [Nit] F12: §1 Situation enumeration is dense

**Location:** §1 line 17

The 75-word sentence enumerating downstream effects of the mislabel could be a bulleted list. Not wrong, just unusual prose density for a structured spec.

---

### [Nit] F13: Casing mismatch on §M4/§D2 citation

**Location:** §7 R4 row (line 178) vs AGENTS.md:776

Deliverable AGENTS.md:776 says "§M4 / §D2" (with spaces around `/`). Spec R4 row phrases it as "§M4/§D2" (no spaces). Neither is wrong; slight formatting inconsistency.

---

## Confirmed Claims (summary)

The following claims were spot-checked and verified:

**Codebase facts (T1):**
- Baseline commit `fa0050a4` matches worktree HEAD. ✓
- `AGENTS.md:530` post-edit contains `(I1-I11)` + `autolink-void-html-guard.precision.test.ts` path. ✓
- `AGENTS.md:762` post-edit reads `### Fidelity invariants (I1-I11 active)` exactly. ✓
- `AGENTS.md:776` post-edit contains "R23 guard precision" + shipped test path + tolerant-parsing spec reference. ✓
- `AGENTS.md:778` post-edit mentions both the I1-I10 path and the I11 path. ✓
- `packages/core/package.json:4` has `"private": true`. ✓
- `CLAUDE.md` is a symlink to `AGENTS.md`. ✓
- Increment fire sites at `parse-with-fallback.ts` lines 49, 71, 81, 123, 324 — all five verified. ✓
- Log event names at those lines (`mdx-whole-doc-fallback`, `mdx-block-fallback`) match README claim. ✓
- `WARMUP_ITERS = 10` at `markdown-bench.test.ts:49`. ✓
- `MEASURED_ITERS = 10` at `markdown-bench.test.ts:50`. ✓
- `PERF_BLOCK_COUNTS = [100, 1000, 5000, 10000, 20000]` at `fixtures/index.ts`. ✓
- Threshold formula pinned at `regression-gate.ts:7-9` — text matches README quote verbatim. ✓
- `ParseHealthMetrics` interface at `parse-health.ts:50-53`. ✓
- `ypsCounters()` helper at `parse-health.ts:42-48`. ✓
- `getParseHealth()` at `parse-health.ts:83-89`. ✓
- `resetParseHealth()` at `parse-health.ts:91-97`. ✓
- Turbo tasks `test:health:unit`, `test:health`, `test:perf:bench`, `test:perf:regression:unit`, `test:perf:regression` all match README quotes. ✓

**Worked-example math (T1):**
- Example 1 (serializeMs @ 100 blocks): 2×0.15=0.30, 0.10×2.29=0.229, max=0.30. Baseline numbers match. ✓
- Example 2 (parseMs @ 10K blocks): 2×16.05=32.10, 0.10×1275.24=127.52, max=127.52. Baseline numbers match. ✓

**Tolerant-parsing spec citations (T1):**
- Line 24, 100, 129, 155, 216, 581, 771 all contain I11 references consistent with evidence's claims. ✓
- "rawMdxFallback coverage" does not appear anywhere in tolerant-parsing SPEC.md (verified via grep). ✓

**Cross-spec references (T1):**
- `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61` has the NG4 line cited. ✓
- Sister `meta/_changelog.md:75` contains the "CLAUDE.md staleness as docs-update follow-up" text cited by D4. ✓
- `specs/2026-04-14-component-blocks-v2/SPEC.md:250` claims I14 as rawMdxFallback byte-identity (supports D2 rationale). ✓
- `meta/audit-findings.md:132-148` (sister spec) flags CLAUDE.md staleness (supports evidence i11-provenance.md §Root cause). ✓

**Gate status (T1):**
- `bun run check` → 13/13 turbo tasks pass. ✓ (confirmed during audit)

**Dependency / infra facts (T1):**
- `.changeset/config.json` has `"fixed": [[...]]` with the three listed packages. ✓
- `patches/y-prosemirror@1.3.7.patch` exists and contains the `globalThis.__okYpsCounters` bridge. ✓

---

## Unverifiable Claims

None material. The spec is self-contained; all load-bearing claims were checkable against source.

---

## Meta observations

1. **The spec is unusually accurate given its post-hoc authoring.** For a retroactively-scoped spec, nearly every file:line citation holds up. The failures are narrow: F1/F2 where the acceptance criterion and evidence both overlook a deliberate design choice (split I1-I10 / I11 documentation); F3/F4/F5 where prose is imprecise about what exactly is being asserted.

2. **The I1-I10 retention is the critical ambiguity.** F1 and F2 are the same underlying issue surfaced in two places (SPEC + evidence). A single rewrite of R9/M2 + a matching evidence-file correction resolves both.

3. **Spec is ready for finalize after addressing F1/F2.** All other findings are nits or minor imprecision that don't affect whether the spec is implementable or correct. The committed deliverables themselves are high-quality; the SPEC's text needs a tightening pass to match what was actually shipped.

4. **No scope leakage detected.** In-scope items are all achievable with the committed work; out-of-scope items (NG1-NG5) have defensible rationales in D2-D5.

5. **No baseline drift detected.** Worktree HEAD = `fa0050a4` = asserted baseline. The file state the spec describes is the file state observed.
