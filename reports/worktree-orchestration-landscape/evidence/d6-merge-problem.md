# Evidence: The Merge Problem for Sequential/Parallel Agents

**Dimension:** D6 — The merge problem specifically
**Date:** 2026-03-30
**Sources:** Git documentation, prior research, synthesized analysis

---

## Key pages referenced

- https://git-scm.com/docs/git-merge-tree — pre-flight conflict detection
- https://git-scm.com/book/en/v2/Git-Tools-Rerere — recorded resolutions
- https://github.com/lesfurets/git-octopus — continuous merge workflow at scale
- Prior research: coding-agent-workspace-lifecycle report (2026-03-27)

---

## Findings

### Finding: Sequential stories with evolving integration branch — ordered merge is simplest
**Confidence:** INFERRED
**Evidence:** Synthesis from git documentation and LesFurets workflow

When N agents work on N stories sequentially (story 1 finishes before story 2 starts), each branching from an evolving integration branch:

**Optimal pattern:**
1. Story 1 branches from `integration`
2. Story 1 completes → merge story-1 into `integration`
3. Story 2 branches from updated `integration` (includes story-1 code)
4. Story 2 completes → merge story-2 into `integration`
5. Repeat

**Why this works:**
- Each story sees all prior stories' code before starting
- Conflicts are minimized because the base is always up-to-date
- Merge is always forward-only (no divergent histories)
- Story 2's agent can reference story 1's code directly

**Why this is simple but slow:**
- Stories are fully serialized — no parallelism
- If story 2 doesn't touch any files from story 1, the serialization is wasted

**Implications:** This is the "safe default" — correct by construction, but sacrifices all parallelism.

### Finding: Parallel stories — conflict detection before merge is essential
**Confidence:** CONFIRMED
**Evidence:** git merge-tree documentation + industry patterns

When N stories execute in parallel (all branching from the same base):

**Pre-flight conflict matrix using `git merge-tree`:**
```bash
# Check all pairs for conflicts
for i in "${!BRANCHES[@]}"; do
  for j in $(seq $((i+1)) $((${#BRANCHES[@]}-1))); do
    git merge-tree -q "${BRANCHES[$i]}" "${BRANCHES[$j]}"
    # exit 0 = clean, exit 1 = conflicts
  done
done
```

This produces an NxN conflict matrix showing which branch pairs conflict. From this:
- Non-conflicting branches can be merged in any order (or via octopus)
- Conflicting pairs must be resolved — either by re-ordering, by agent retry, or by human escalation

**Cost:** O(N^2) merge-tree operations, each O(files) in time. For 10 branches and 10K files, this is fast (seconds).

**Implications:** Pre-flight conflict detection is cheap and should be standard. The conflict matrix informs merge ordering and parallelism opportunities.

### Finding: Optimal merge ordering based on conflict matrix
**Confidence:** INFERRED
**Evidence:** Synthesis from git mechanics and graph theory

Given the conflict matrix, the optimal merge sequence is a topological sort where:
1. Non-conflicting branches form independent groups
2. Within a non-conflicting group, merge all at once (or in any order)
3. Between conflicting groups, merge the most independent group first
4. After each group merge, re-check remaining branches against the updated integration branch

This is equivalent to graph coloring on the conflict graph:
- Nodes = branches
- Edges = conflicts
- Colors = merge phases
- Branches of the same color can be merged in parallel

**Implications:** This algorithm is straightforward to implement. The git merge-tree checks are the bottleneck, and they're fast.

### Finding: Should story 2 see story 1's code before starting?
**Confidence:** INFERRED
**Evidence:** Tradeoff analysis

**If yes (sequential, rebased):**
- Pro: Story 2 can build on story 1's APIs, types, patterns
- Pro: Fewer merge conflicts
- Con: Full serialization — story 2 waits for story 1

**If no (parallel, independent):**
- Pro: Maximum parallelism — both stories execute simultaneously
- Pro: If stories touch different areas, no issue
- Con: If stories touch shared interfaces, both may create incompatible implementations
- Con: Merge conflicts must be resolved after the fact

**Hybrid approach (most practical):**
- For stories with declared dependencies (story 2 depends on story 1's API), use sequential
- For stories with no declared dependencies, use parallel
- Use pre-flight conflict detection to validate the parallel assumption
- If conflict detected, either: re-sequence, or let both complete and resolve at merge

**Implications:** The "right" answer depends on dependency information. An orchestrator that knows story dependencies can choose the optimal execution mode.

### Finding: Conflict resolution delegation — agent retry vs human escalation
**Confidence:** INFERRED
**Evidence:** Synthesis from Devin, Composio, and git merge patterns

When conflicts arise between parallel agent branches, three resolution strategies:

**1. Agent retry with updated base:**
- Merge the non-conflicting branch first
- Rebase or re-create the conflicting branch from the updated integration
- Re-run the agent with the new base
- Pro: Fully automated. Con: Agent may produce different output on retry.

**2. Agent-assisted resolution:**
- Present the merge conflict to the agent (like Composio does)
- Agent resolves conflicts within its context
- Pro: Agent has domain knowledge. Con: Agent may not understand the OTHER branch's intent.

**3. Human escalation:**
- Notify human of conflict
- Human resolves manually or directs the agent
- Pro: Highest quality resolution. Con: Blocks automation.

**Implications:** Strategy #1 (retry with updated base) is the most automatable and maps naturally to the engine retry pattern. Strategy #2 is a good fallback. Strategy #3 is the safety net.

### Finding: `git merge-tree --stdin` enables efficient batch conflict checks
**Confidence:** CONFIRMED
**Evidence:** https://git-scm.com/docs/git-merge-tree

```
If --stdin is passed, there is an extra section at the beginning, a NUL character
at the end, and then all the sections repeat for each line of input.
```

This allows piping multiple branch pairs into a single `git merge-tree` invocation, avoiding the overhead of spawning one process per pair.

**Implications:** For an orchestrator checking an NxN conflict matrix, `--stdin` mode is the efficient path. Single process, all pairs checked.

### Finding: The merge problem is largely unsolved across the industry
**Confidence:** CONFIRMED
**Evidence:** Prior research (coding-agent-workspace-lifecycle, 2026-03-27)

```
Merge conflict resolution is largely unsolved. The industry consensus is:
prevent conflicts through isolation (separate branches/worktrees), not resolve
them after the fact. Devin's MultiDevin has a "manager merges workers" pattern.
Composio does pre-execution dependency analysis. Everyone else falls back to
human escalation for non-trivial conflicts.
```

**Implications:** Any system that provides even basic automated merge sequencing with conflict detection would be ahead of the current state of the art.

---

## Gaps / follow-ups

- GitHub merge queue batching algorithm (how it handles N PRs in sequence)
- GitLab merge trains (pipeline-aware sequential merge)
- Whether LLMs can effectively resolve git merge conflicts (emerging research)
