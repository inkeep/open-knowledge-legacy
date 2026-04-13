---
name: dependency-activity-assessment
date: 2026-04-12
sources:
  - GitHub API (stars, commits, issues, contributors)
  - npm registry (weekly downloads, versions, deps)
  - discuss.prosemirror.net (Marijn endorsement)
---

# Evidence: Dependency Activity Assessment

**Dimension:** Package health / maintenance / bus factor for all removed and added dependencies
**Date:** 2026-04-12
**Method:** 5 parallel subagent assessments covering 14 packages total

---

## Removed packages (4)

| Package | Stars | Weekly DL | Last commit | Open issues | Bus factor | Health |
|---|---:|---:|---|---:|---|---|
| `@tiptap/markdown@3.22.3` | 36.2k (monorepo) | 920k | 2026-04-08 | ~33 markdown-tagged | Company (Ueberdosis) | Actively published; #7258 still open; ~33 open markdown issues (~4% of repo total for 1 of 40 extensions) |
| `marked@18.0.0` | 36.7k | 34.8M | 2026-04-07 | 7 | ~2 (UziTech dominant) | Huge user base; zero-dep; thin bus factor; 98% CommonMark (self-reported); 3 historical ReDoS advisories |
| `@tiptap/extension-list@3.22.3` | 36.2k (monorepo) | 4.87M | 2026-04-08 | — | Company | Healthy; now bundles TaskList/TaskItem subpath exports |
| `@tiptap/extension-task-list@3.22.3` | 36.2k (monorepo) | 970k | 2026-04-08 | — | Company | **Functionally redundant** — @tiptap/extension-list bundles task-list; not imported in our code |

## Added packages — Tier 1 (ecosystem backbone)

| Package | Stars | Weekly DL | Last commit | Open issues | Bus factor | Health |
|---|---:|---:|---|---:|---|---|
| `unified` | 4,969 | 29.8M | 2025-02-04 | 0 | Wormer | Industry anchor |
| `remark-parse` | 8,826 (monorepo) | 27.6M | 2026-02-24 | 1 | Wormer | Stable |
| `remark-stringify` | 8,826 (monorepo) | 18.0M | 2026-02-24 | 1 | Wormer | Stable |
| `remark-gfm` | 1,174 | 17.8M | 2025-02-10 | 2 | Wormer | Stable |
| `remark-frontmatter` | 317 | 2.78M | 2023-10-02 | 0 | Wormer | Done (no issues, no commits needed) |
| `remark-directive` | 398 | 1.95M | 2025-02-27 | 3 | Wormer | Active |
| `mdast-util-to-markdown` | 138 | 26.1M | 2025-02-10 | 2 | Wormer | Stealth-giant; anchor tenant |
| `remark-mdx` (mdx-js/mdx) | 19.4k | 5.87M | 2026-03-11 | 10 | Wormer + Vercel | Healthy; #2533 fixed Sep 2024 |

**Ecosystem synthesis:** ~130M cumulative weekly downloads. Used by Next.js, Astro, Docusaurus, Gatsby, Prettier, Storybook, Fumadocs. Bus factor concentrated in Titus Wormer — real risk but mitigated by small+stable codebases (19-149 KB unpacked) and the CommonMark spec not churning. "Finished software" signal, not abandonment.

## Added packages — Tier 2 (critical seams, higher risk)

### @handlewithcare/remark-prosemirror@0.1.5 — THE CRITICAL BRIDGE

| Dimension | Value |
|---|---|
| Stars | 29 |
| Weekly DL | 16.8k |
| Last commit | 2024-12-14 (~16 months stale) |
| Total commits | 26 |
| Open issues / PRs | 1 / **1 (PR #3 — "fix: Empty text nodes" — open 4 months, unreviewed)** |
| Bus factor | **1** (Shane Friedman, solo) |
| Maintainer background | ex-NYT Oak collaborative editor Tech Lead; authored @nytimes/react-prosemirror; founded Handle with Care Collective |
| Marijn endorsement | **Yes** — positive reply on discuss.prosemirror.net announcement thread |
| Production users | moment.dev (cited on forum thread) |
| Dependencies | 10 runtime (all unified/mdast ecosystem) + `prosemirror-model` peer |
| Unpacked size | 44 KB |

**Assessment:** High-competence solo project gone dormant. Bus factor 1, 16 months without a commit, the only open PR fixing the only open issue has been sitting 4 months. Effectively we're adopting on a fork-on-demand basis. **Mitigation:** pin exact version, apply PR #3 fix via bun patch upfront.

### prosemirror-flat-list@0.5.8 — unified list backbone

| Dimension | Value |
|---|---|
| Stars | 69 |
| Weekly DL | 18.4k |
| Last commit | 2025-10-29 (active) |
| Total commits | 384 |
| Open issues / PRs | 1 (from 2023) / 0 |
| Bus factor | 1 (Chao Cao @ocavue) — Remirror org member, ProseKit author, tsdown author (3.8k stars) |
| Sponsor | Reflect (reflect.app) |
| Production users | Remirror, ProseKit, Reflect |
| Dependencies | 7 (all prosemirror-* core, already in our tree) |
| Unpacked size | 434 KB |

**Assessment:** Materially healthier than remark-prosemirror. Active releases, 384 commits, engaged maintainer, paying sponsor, real downstream users. Still pre-1.0 / solo. Tab/Shift-Tab accessibility mitigation is on us (OQ1).

## Comparative verdict

| Dimension | Removed stack | Added Tier 1 | Added Tier 2 |
|---|---|---|---|
| Ecosystem DL | ~36M (marked 35M + TipTap 7M) | ~130M | ~35k |
| Backing | Commercial (Ueberdosis, UziTech) | Wormer (solo but ubiquitous) + Vercel | Solo (Shane Friedman) + Solo (@ocavue, sponsored by Reflect) |
| Risk profile | Troubled-but-alive (fidelity bugs, patch maintenance) | Rock-solid ("finished software" at industry scale) | Higher-risk (dormant bridge seam + pre-1.0 list library) |
| Fork difficulty if needed | ~1300 LOC @tiptap/markdown + marked@18 | N/A (never need to) | ~550 LOC (remark-prosemirror) or ~434 KB (flat-list) |

**Bottom line:** Tier 1 (8 of 10 packages) is unambiguously lower-risk than what we're removing. Tier 2 (2 of 10) is higher-risk but bounded: remark-prosemirror is the single seam to watch, mitigated by pin + PR #3 patch + probe validation + forkability.
