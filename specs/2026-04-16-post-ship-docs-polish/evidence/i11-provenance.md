---
name: i11-provenance
description: Evidence that I11 = R23 guard precision PBT (not rawMdxFallback coverage), sourced from tolerant-parsing spec + shipped implementation.
type: factual
sources:
  - specs/2026-04-13-mdx-tolerant-parsing/SPEC.md
  - packages/core/src/markdown/autolink-void-html-guard.precision.test.ts
  - AGENTS.md (baseline fa0050a4)
  - .github/workflows/weekly.yml
---

# I11 provenance

## Canonical definition source: tolerant-parsing spec

`specs/2026-04-13-mdx-tolerant-parsing/SPEC.md` is the origin of the "I11" label. Four citations, all consistent:

| Line | Text |
|---|---|
| 24 | "I9/I11 PBT at 10K stress found and fixed 5 bugs in the guard itself." |
| 100 | "I9/I11 PBT must pass at 10K stress." |
| 129 | "M4: **I11 guard precision PBT** passes at 10K runs." |
| 155 | "Proven complete by I9 PBT at 10K and **precise by I11 PBT**." |
| 216 | "301 lines, proven by I9/I11 PBT at 10K stress" |
| 581 | "D2 — Retain R23 guard unchanged — Locked. Agnostic mode doesn't alter `<` behavior. **Guard proven by I9/I11 PBT**." |
| 771 | "STOP rule: If I9 or I11 PBT fails at 1K runs post-swap, STOP and investigate guard interaction." |

**Canonical I11 name:** "guard precision PBT" — the sibling of I9 (guard completeness).

## Shipped implementation

File: `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts`.

Property tested (summarized from file): after `protectFromMdx(mdx)`, valid MDX patterns (self-closing tags, paired tags, tags with attrs/URLs/expressions, multi-line JSX) survive unchanged — no false-positive PUA replacements. Fast-check PBT over `selfClosingJsx`, `pairedJsx`, `multiLineSelfClosing` arbitraries plus 11 hardcoded valid MDX patterns.

NUM_RUNS default 1K; 10K under `STRESS_FIDELITY=1`.

Matches the tolerant-parsing spec's I11 definition exactly.

## The stale AGENTS.md row (pre-this-spec)

`AGENTS.md:776` at baseline `fa0050a4` read:

> `| I11 | rawMdxFallback coverage | Pending — introduced by the tolerant-parsing spec (`specs/2026-04-13-mdx-tolerant-parsing/`); activates when that spec merges |`

This misrepresents I11. The tolerant-parsing spec does NOT define I11 as "rawMdxFallback coverage" anywhere. The `rawMdxFallback` node is a separate construct from R23 guard precision. rawMdxFallback activation is covered (by construction) by I8/I9/I10 crash-resistance PBTs; byte-identity of rawMdxFallback serialization is claimed by component-blocks-v2 as I14.

## Root cause of the mislabel

Phase 4 `/docs` subprocess of the markdown-pipeline-engineering-health ship (commit `6b6eda7` on the now-merged branch) wrote the AGENTS.md I11 row based on an incorrect reading of the spec's NG4 note (`specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61`), which itself referenced I11 with "rawMdxFallback coverage" framing that was always inaccurate. The sister spec's audit findings (`meta/audit-findings.md:132-148`) explicitly flagged AGENTS.md staleness as docs-update follow-up.

## Correct row

```markdown
| I11 | R23 guard precision | After `protectFromMdx`, valid MDX (self-closing, paired, attrs/URLs/expressions) survives unchanged — no false-positive PUA replacements. Complements I9 (completeness). PBT at `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` (1K runs default, 10K under `STRESS_FIDELITY=1`). Originates in `specs/2026-04-13-mdx-tolerant-parsing/` §M4 / §D2 and ships with the R23 guard family. |
```

## Grep verification

At baseline `fa0050a4` (pre-edit), grep `I1-I10|I1–I10` across the repo returned three live-doc matches:

- `AGENTS.md:530` — fidelity tier table row ("(I1-I10)")
- `AGENTS.md:762` — section header ("I1-I10 active, I11 pending")
- `.github/workflows/weekly.yml:29` — CI comment ("10 active invariants (I1-I10)")

All other matches are in frozen spec documents or archival `progress/` files (not live docs).

**After this PR's edits, only the stale semantic claims are rewritten. Two `I1-I10` tokens remain by deliberate design:**

- `AGENTS.md:530` — retained as location descriptor: `… (I1-I10 + handler PBTs); … (I11) …`. The row now lists both test-file locations and explicitly names I11 — the `I1-I10` token names the collective test-file set at `packages/app/tests/fidelity/`, not a claim that those are the only active invariants.
- `AGENTS.md:778` — new footnote: `PBT invariants I1-I10 live in packages/app/tests/fidelity/invariant-i{1..10}.test.ts. I11 lives at packages/core/src/markdown/autolink-void-html-guard.precision.test.ts …`. Same rationale — the `I1-I10` token is a path qualifier, not an active-set claim.
- `AGENTS.md:762` — section header rewritten: `### Fidelity invariants (I1-I11 active)`.
- `.github/workflows/weekly.yml:29` — rewritten to acknowledge both the elevated-sample I1-I10 coverage via `test:fidelity` AND that I11 is colocated with the R23 guard in the core unit suite and not re-run at elevated depth by this job.

**Stale-text audit (post-edit):** `grep -nE 'I1-I10 active|I11 pending' AGENTS.md` returns no hits. The two remaining `I1-I10` tokens appear only in location-descriptor contexts that also name `I11` on the same line or block.
