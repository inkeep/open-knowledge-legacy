# Proposal: Comment-Discipline Guidance for the `eng` Skill Pack

**Status:** draft — suggestions for upstream `inkeep-team-skills`, not a
self-approve. Shared from this repo because the friction is repo-observable.

## Context

PR #293 (`feat/vite-plugin-createspec-dedup`) landed with a source file
(`packages/app/src/server/hocuspocus-plugin.ts`) carrying ~275 lines of
comments that referenced SPEC paths, decision numbers (D5, D8, D9), non-goal
tags (NG2), audit finding IDs (DC-M4, DC-L7), and dated audit-trail
narratives ("D8 amendment (2026-04-23, post-implementation)"). A reviewer
flagged it with: _"I expect that these types of comments should be kept to a
minimum."_

The in-PR cleanup (commit `b89f1f56`) trimmed 275 → 98 comment lines in that
one file. A follow-on sweep of the wider codebase found the same pattern in
~140 other source files — 269 raw occurrences of the `SPEC D# / SPEC § /
LOCKED / DIRECTED / DC-* / NG# / specs/2026-*` regex.

This isn't per-author drift. It's systemic — the `eng/` skills (spec →
ship → implement → review-local → pr) produce decisions, and the iteration
prompt keeps those decisions in the agent's context window across every
implementation turn. With no counter-pressure, the agent naturally ports
decision references into the source it writes, because they feel like
"what I know about this code."

## The issue surface

All three skills surveyed sit on the "create" side of the bloat, not the
"prevent" side.

### `skills/spec/SKILL.md`

The spec skill explicitly creates durable artifacts named `D#`, `NG#`,
`LOCKED`, `DIRECTED`, `DELEGATED`, `LOCKED`, `NOT NOW`, and is the origin
of the vocabulary that later shows up in code comments. That's correct —
the vocabulary is the right thing for a spec. But the skill never tells
downstream phases "this vocabulary stays in the spec; don't echo it to
code." The `references/artifact-strategy.md` pointer keeps
decisions in `SPEC.md` and `meta/_changelog.md`, but nothing fences that
scope against the implementer.

### `skills/implement/templates/implement-prompt.template.md`

This is the most load-bearing friction point. The template:

1. **Injects SPEC.md verbatim** into every iteration's prompt (line 45,
   "SPEC.md … are injected at the end of this prompt"). The agent sees the
   full decision-numbered context on every turn.
2. **Tells the agent to focus on** "Non-goals (what NOT to build)" and
   "Settled decisions with rationale" (lines 48, 51). Those nouns — the
   `NG#` list and the `D#` block — are literally the ones ending up
   pasted into comments.
3. **Says nothing about comment discipline.** No "explain the technical
   reason, not the spec paragraph." No "PR body, not source." No exempt
   list for load-bearing invariants. The vocabulary enters the agent's
   context but has no exit path that isn't code.

The template does say (step 6): `Commit implementation changes only (source
code, tests, configs) with message format: [story-id] description`. That
suggests the spec reference belongs at the commit level — but it never
names source comments as a non-venue.

### `skills/ship/SKILL.md`

Ship orchestrates spec → implement → qa → docs → review-local → pr. By the
time review-local runs, the bloated comments have already landed. Ship
could nudge the implementer's iteration prompt to include anti-bloat
guidance, but currently doesn't — it only names which skills to load in
which order.

### `skills/review-local/SKILL.md`

Review-local's 17 domain reviewers might catch the bloat, but none of the
shipped reviewer prompts appear to target this specific failure mode
(comment-as-spec-citation). A human catches it on second-pass cloud
review — or not, as PR #293 demonstrated.

## Proposed changes

Ordered by expected impact. All are additive; none break existing
workflows.

### 1. `skills/implement/templates/implement-prompt.template.md` — add a comment-discipline section (both Variants A and B)

**Location:** insert as a new subsection after step 3 ("Implement"), before
step 4 ("Verify quality"). Same text in both variants.

**Suggested text:**

```markdown
**Comment discipline.** Comments should explain the non-obvious *why* —
constraints, invariants, workarounds, surprising behavior. Well-named
identifiers explain the *what*; don't duplicate them.

Do NOT cite the spec process in source comments:
- No SPEC paths (`specs/2026-04-21-*/SPEC.md §6.4`, `Governing spec: …`)
- No decision numbers (`D5`, `D12`, `LOCKED`, `DIRECTED`, `NOT NOW`)
- No non-goal / requirement tags (`NG2`, `FR-8`, `AC9`, `US-007`, `MQ1`)
- No audit finding IDs (`DC-M4`, `Review M5`, `Mutation H`, `audit M6`)
- No dated audit narratives (`post-ship amendment`, `2026-04-21 revised`)

The spec and PR body carry that context with version history. When
substance would be useful (a race condition, a workaround for a specific
library bug, a cross-file invariant), write the substance without the
citation. Reserve "STOP:" / "WARN:" comments for load-bearing contracts
that a future reader would stub their toe on.

External standards with stable numbering (`CommonMark §2.4`, `RFC 3986`,
upstream bug links like `electron/electron#32600`) are fine — they don't
rot.
```

**Why here:** the agent sees this instruction *after* reviewing spec.json
and *before* writing code, in the same turn where the temptation to port
decision vocabulary is highest. Pre-code discipline beats post-code cleanup
every time.

### 2. `skills/spec/SKILL.md` — add a one-line bidirectional boundary

**Location:** in the "Settled decisions" bullet of the "Do" block (around
line 133–141 of the current SKILL.md).

**Suggested change:**

Existing:
> - Initialize these living sections (in the same doc by default):
>   - Settled decisions with their rationale (LOCKED / DIRECTED / DELEGATED)

Proposed addition:
> - Initialize these living sections (in the same doc by default):
>   - Settled decisions with their rationale (LOCKED / DIRECTED / DELEGATED).
>     **The `D#` / `LOCKED` / `DIRECTED` vocabulary lives in the spec, not
>     in source code.** When downstream implementation needs to reference
>     a decision, cite it in the PR body or commit message — never in
>     comments next to the code. See the comment-discipline section of the
>     implementation prompt template.

**Why:** the spec phase is where the vocabulary is minted. One sentence
declaring "this is spec-scope, not code-scope" is a low-friction brake
that travels with the person writing the spec and reappears every time
they re-read the skill.

### 3. `skills/ship/SKILL.md` — mention the discipline in the Phase 3 handoff

**Location:** in the Phase 3 section where ship invokes `/implement` (ship
SKILL.md currently has a table at ~line 225 routing inline-vs-file spec).

**Suggested change:**

Add a sentence to the phase description reminding the orchestrator that
the implementation prompt must include comment-discipline guidance. The
actual text lives in the `implement` template (change #1); ship just
needs to verify the guidance appears in the crafted prompt.

Wording (one line):

> **Phase 3 check:** the crafted `implement-prompt.md` must include the
> comment-discipline subsection before handing off. A reviewer-flagged
> class of regression is SPEC/D#/NG#/DC-# citations leaking into source;
> the template owns the guidance, ship confirms it's present.

**Why:** ship is the single orchestrator that sees every `/implement`
invocation. A one-line audit step here catches regressions in the template
itself if it's ever refactored.

### 4. `skills/review-local/SKILL.md` — add a lightweight reviewer

**Location:** in the domain-reviewer registry (the "17 domain-specific
reviewers" list).

**Suggested addition:** a `comment-hygiene` reviewer with the trigger
condition:

> Scans the diff for comments containing `SPEC D\d`, `SPEC §`, `LOCKED`,
> `DIRECTED`, `DC-[A-Z]\d`, `per NG\d`, `specs/\d{4}-`, `post-ship
> amendment`, `US-\d{3}`, `FR-\d+`, `AC\d+`. Reports each hit with the
> suggestion: "Consider moving this to the PR body. Keep the substance,
> drop the citation."

**Why:** catches drift when the implement template changes or a PR
bypasses the normal workflow (hotfix, direct push, etc.). Cheap to run —
it's pure regex on the diff.

## Non-goals

- **Don't try to codify STOP-rule exemptions in the template.** The exempt
  list (STOP rules, cross-file contracts, external spec numbering) is
  repo-specific; the template should point at the local `AGENTS.md` /
  `CLAUDE.md` rather than enumerate. This PR adds the exempt list to this
  repo's `AGENTS.md` under §"Comment discipline (code comments, not
  docs)" — other repos that adopt the skill would write their own.
- **Don't automate cleanup.** Retroactive rewriting of existing bloat by
  an agent is high-risk (judgment calls on what's load-bearing). A human
  or human-supervised agent does that on a file-by-file basis. The skill
  guidance prevents future bloat; it doesn't delete existing bloat.
- **Don't change the spec artifact shape.** `D#`, `LOCKED`, `NG#`, etc.
  are correct vocabulary *inside* SPEC.md. The issue is egress, not the
  vocabulary itself.

## Adoption path

This repo can unilaterally adopt change #1 by wrapping the `/implement`
invocation — but that's a hack. The cleaner path is upstream PRs against
`inkeep-team-skills` with this proposal as the design doc. If the
upstream maintainers decline, the repo-level `AGENTS.md` guidance (also
landed in this PR) is a reasonable stopgap, since it's what Claude
Code's `claude-md` injection + the spec/ship skills already pick up via
context.

## References

- PR #293: commit `b89f1f56` "style(app): trim excess comments in
  hocuspocus-plugin.ts" — the canonical example of the cleanup applied
  within-PR.
- Reviewer feedback that initiated this work: "I expect that these types
  of comments should be kept to a minimum."
- Repo sweep grep (for reproducibility):
  `grep -rn "SPEC D[0-9]\|SPEC §\|LOCKED\|DC-[A-Z][0-9]\|per NG[0-9]\|specs/2026-" packages/ --include="*.ts" --include="*.tsx" | wc -l`
  → 269 occurrences across 148 files at the time of this proposal.
- Upstream skill files examined:
  - `skills/spec/SKILL.md` (the artifact-creating phase)
  - `skills/implement/templates/implement-prompt.template.md` (the
    iteration prompt that injects SPEC.md)
  - `skills/ship/SKILL.md` (the orchestrator)
