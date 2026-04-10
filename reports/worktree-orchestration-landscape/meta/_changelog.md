# Changelog

## 2026-04-03 — Add Sandcastle worktree patterns
**Update type:** Additive
**Why this pass happened:** Comparative analysis of OpenBolts vs Sandcastle revealed Sandcastle implements several worktree lifecycle patterns not covered in the original report.

### Scope (delta only)
- D2: Added Sandcastle to tool comparison table and detailed findings
- D3: Added reflink-aware copy (`cp --reflink=auto`) as mitigation for disk usage / node_modules duplication
- New evidence file: `evidence/d2-sandcastle-worktree-patterns.md`

### What changed (current-state)
- REPORT.md — sections touched: D2 tool table (added Sandcastle row), D2 key patterns (added point 5 with Sandcastle details), D3 performance mitigations (added reflink pattern), frontmatter (updatedAt, subjects), References (added evidence file + external source)
- Evidence — added: `evidence/d2-sandcastle-worktree-patterns.md`

### Notes on confidence
- All findings CONFIRMED from source code at `/tmp/sandcastle-research/` (cloned from mattpocock/sandcastle)
- Sandcastle is the most complete worktree lifecycle implementation found in the landscape — it fills gaps the original report identified (dirty preservation, stale pruning, node_modules duplication)

### Open questions / gaps
- Reflink performance benchmarks not captured (how much faster in practice?)
- Sandcastle's N-branch merge is delegated to a "merge agent" in template code, not handled by the framework

## 2026-04-03 — Ecosystem survey of worktree lifecycle patterns
**Update type:** Additive
**Why this pass happened:** Needed broader ecosystem evidence beyond Sandcastle for 6 worktree lifecycle patterns (dependency setup, dirty preservation, collision detection, stale GC, signal handling, dynamic prompt context).

### Scope (delta only)
- D3b: New section — worktree lifecycle patterns ecosystem survey (6 patterns, maturity assessment)
- D3: Expanded dependency mitigation from reflink-only to 4-layer approach (package manager, worktree config, filesystem, build cache)
- New evidence file: `evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md`

### What changed (current-state)
- REPORT.md — sections touched: D3 performance mitigations (expanded from 1 line to 4-layer approach), new D3b section (ecosystem survey table + key findings), References (added evidence + 4 external sources)
- Evidence — added: `evidence/d3-d6-worktree-lifecycle-patterns-ecosystem.md`

### Notes on confidence
- pnpm global store finding CONFIRMED from official March 2026 guide
- Claude Code data loss bugs CONFIRMED from 3 open GitHub issues (#26725, #38287, #27753)
- Agent Situations CONFIRMED from source repo (CC0 licensed)
- Signal handling patterns CONFIRMED from Temporal, K8s, Inngest official docs

### Open questions / gaps
- No agent-orchestration-specific signal handling library exists — everyone rolls their own
- Agent Situations is CC0 but has limited adoption; unclear if the pattern scales
- pnpm global store requires pnpm — Bun-based projects need a different approach
