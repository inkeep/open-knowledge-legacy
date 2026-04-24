# Phase 4 — Docs verification sweep

**Scope:** Since this PR's deliverables ARE documentation, Phase 4 is a
verification check: do the changes touch any OTHER doc surface that also
needs updating? Proportionality rule: only recommend updates that are
load-bearing (a future reader would be misled without them).

**Baseline commit audited:** worktree HEAD (4 commits ahead of
`origin/main`): `fdc2cc93`, `4ee486ae`, `7e8c7ed1`, `53c5c910`.

---

## Surfaces checked

| # | Surface | Method | Result |
|---|---------|--------|--------|
| 1 | `docs/` Fumadocs site | `grep -r "parse-health|perf framework|I11|rawMdxFallback"` across `docs/content` | No update needed |
| 2 | Sister specs — stale "rawMdxFallback coverage" framing | `grep -rn "rawMdxFallback coverage" specs/` | No update needed (corrigendum already placed at §NG4 in sister spec) |
| 3 | Other `AGENTS.md` / `CLAUDE.md` files in-tree | Glob + grep for I11 / fidelity invariants | No update needed |
| 4 | `packages/core/README.md` or `packages/core/tests/README.md` indices | Glob | No update needed (neither file exists; per §10 OQ1, creating an index README is out of scope) |
| 5 | Project-level CHANGELOG / release notes | Glob + `.changeset/` listing | No update needed (D8 skip changeset is locked) |
| 6 | Cross-linking between the two new READMEs + related docs | Direct reads of `perf/README.md` §Related and `health/README.md` §Cross-references | **One small update recommended** — symmetry fix |

---

## Per-surface detail

### 1. `docs/` Fumadocs site — no update needed

Searched `docs/content/` for any mention of `parse-health`, `perf framework`,
`perf regression`, `perf baseline`, `I11`, `rawMdxFallback`, `guard precision`.
Only hit: `docs/content/internals/architecture.mdx:46` uses the generic phrase
"Markdown round-trip fidelity" without naming any invariant ID.

User-facing docs do not surface internal test-suite IDs. This is correct
editorial taste — `I11` is contributor vocabulary, not end-user vocabulary —
and matches the editorial stance in the `/docs` skill ("progressive disclosure:
document what matters, where it matters"). No update needed.

### 2. Sister specs — "rawMdxFallback coverage" framing — no additional corrigenda needed

Grep for the exact phrase `"rawMdxFallback coverage"` returns hits only in:

- `specs/2026-04-16-markdown-pipeline-engineering-health/SPEC.md:61` — already
  carries the corrigendum annotation (commit `53c5c910`).
- `specs/2026-04-16-post-ship-docs-polish/**` — our own spec + evidence, which
  are the authoritative fix.

The canonical source of I11 — `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md` —
was audited (7 citations at lines 24, 100, 129, 155, 216, 581, 771). Every
citation names I11 as "guard precision PBT" or pairs I9/I11 as completeness +
precision siblings. The tolerant-parsing spec has never used "rawMdxFallback
coverage" framing. **No corrigendum needed in the source-of-truth spec.**

`specs/2026-04-14-component-blocks-v2/SPEC.md` references "I1-I11" only as a
range (lines 229, 240, 244, 2191, 2285). The range is now semantically accurate
(since I11 shipped as the R23 guard precision PBT). No update needed.

### 3. Other `AGENTS.md` / `CLAUDE.md` files — no update needed

Repo glob found:

- `AGENTS.md` (root) — fixed in this PR.
- `CLAUDE.md` (root) — symlink to `AGENTS.md` (verified via `ls -la`). Single
  source of truth. No separate action required.
- `.open-knowledge/AGENTS.md` — contains no I11 / fidelity-invariant references
  (grep returned no matches).
- `node_modules/**/CLAUDE.md`, `node_modules/**/AGENTS.md` — third-party, out
  of scope.
- `.claude/skills/**/AGENTS.md` — skill bundles, no invariant references.

### 4. Index READMEs at `packages/core/` or `packages/core/tests/` — no update needed

Neither file exists. Per SPEC §10 OQ1, creating them is explicitly out of
scope for this PR (new index READMEs inflate footprint without load-bearing
value). The existing near-neighbor README
(`packages/core/src/markdown/fixtures/perf/README.md`) already points to
`packages/core/tests/perf/markdown-bench.test.ts` by path (line 4), which
transitively leads readers to the new `tests/perf/README.md` sitting beside it.
No update needed there either — the fixture corpus README documents the
corpus, not the authoring framework, and that separation is correct.

### 5. CHANGELOG / release notes — no update needed

- No project-level `CHANGELOG.md` exists (changesets-based workflow;
  `.changeset/config.json` controls generation).
- SPEC §9 D8 ("skip changeset") is **locked** because this PR has zero code
  change to any published package.
- `.changeset/` directory contents (verified) are per-feature files, none
  needing a docs-polish entry.

No update needed.

### 6. Cross-linking between the two new READMEs — one small symmetry fix recommended

**Asymmetry found.** The perf README cross-references the health README
**twice**:

- `packages/core/tests/perf/README.md:42` — "Parse-health gate (sibling
  subsystem): `packages/core/tests/health/README.md` — fallback-path counters +
  CI gate."
- `packages/core/tests/perf/README.md:527` — same, in §Related.

The health README's §Cross-references (lines 357-372) does NOT reference the
sibling perf README. Line 372 does name I11 under "Related PBT invariants",
but that's a test-coverage pointer, not a sibling-subsystem pointer.

**Load-bearing rationale.** A contributor arriving at `health/README.md` who
wants to understand the perf analogue (same subsystem shape: counter + baseline +
gate + `STRESS_*` elevation) has no link to follow. The perf README already
treats health as a sibling; restoring symmetry costs one line and unblocks
lateral discovery.

**Proportionality.** This is a ≤1-line addition in the §Cross-references
section of an already-shipped README. Not a re-write. Fits the "bugfix-class
scope" proportionality discipline from this PR.

#### Exact file:line proposal

**File:** `packages/core/tests/health/README.md`
**Location:** §Cross-references, after line 371 (after the "Spec §R19" entry),
before line 372 ("Related PBT invariants").
**Insert:**

```markdown
- **Sibling subsystem — perf regression gate:** `packages/core/tests/perf/README.md` — same shape (counter/baseline/gate), different signal
```

Alternative placement (after line 372, treating it as a "related subsystem"
footer) is equally defensible. Either works.

**Non-load-bearing alternative** — if the ship maintainer prefers to leave
`health/README.md` untouched post-commit, the asymmetry is inert (no reader
is misled; the link from perf→health is enough for bidirectional discovery
via sibling-hop). This is the kind of polish that `/ship` can safely skip —
it's recommended, not required.

---

## Other observations (not updates)

- `evidence/i11-provenance.md` has been verified against the shipped
  `AGENTS.md:783` text — the "Correct row" block matches the committed row
  byte-for-byte (except whitespace wrapping). No update.
- `audit-findings.md` F5 (fire-site count convention ambiguity) is a **spec
  narrative** issue, not a deliverable issue. The `health/README.md` text at
  lines 66-75 documents each fire site correctly and with correct file:line
  citations. F5 is an audit-of-the-spec finding, not a
  documentation-surface defect. No action here.
- The AGENTS.md invariant table row I11 (line 783) names the test file path,
  the 1K/10K sample counts, and the originating spec §M4/§D2. This is
  sufficient for a future reader to independently verify the row. No
  additional doc surface is needed to support it.

---

## Recommendation

**One optional line addition** (surface 6). Everything else is clean.

If the optional addition is accepted, it will be a single-line edit to
`packages/core/tests/health/README.md` under the existing §Cross-references
list. No new files, no prose re-write, no spec update.

If the optional addition is skipped, Phase 4 is still clean — the
asymmetry is mild and the perf→health direction already documents the
sibling relationship.

**Verdict:** Phase 4 is clean to proceed to Phase 5 (with or without the
optional edit).
