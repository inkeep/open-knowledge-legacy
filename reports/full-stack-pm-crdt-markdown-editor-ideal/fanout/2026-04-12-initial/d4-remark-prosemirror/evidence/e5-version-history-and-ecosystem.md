# E5: Version History, Breaking Changes & Ecosystem

**Sources:** GitHub commit history, npm registry, ProseMirror Discuss thread, GitHub dependents

## Version History

| Version | Date | Changes | Breaking? |
|---|---|---|---|
| 0.1.0 | 2024-12-18 | Initial release. Had @swc/cli in runtime deps (bug). No peerDep on prosemirror-model. | N/A |
| 0.1.1 | 2024-12-18 | Cleaned deps, moved SWC to devDeps. Fixed cast through unknown. | No |
| 0.1.2 | 2024-12-18 | Removed unnecessary options param type. | No |
| 0.1.3 | 2025-01-03 | Added `prosemirror-model: ^1.24.0` as peerDependency. Fixed non-root assertion. | Semi (new peerDep) |
| 0.1.4 | 2025-01-03 | Updated yarn.lock. | No |
| 0.1.5 | 2025-01-03 | Root node: `create` instead of `createAndFill`. | Behavior change |

**No breaking changes** in the semver sense (all 0.1.x). The 0.1.3 peerDependency addition is the most significant change.

**No CHANGELOG file, no git tags, no GitHub releases.** Version history reconstructed from commit messages and npm publish dates.

**Total commits:** 26 (as of 2025-05-09)

## Commit Timeline

```
2024-12-14  Initial commit / Init flake / Init package
2024-12-15  First draft of remark-prosemirror plugin
2024-12-17  Clean up, add mdast utils, build script, mark support, lint
2024-12-18  Docs, tests, CI workflow, dependency cleanup → v0.1.0, v0.1.1, v0.1.2
2025-01-03  peerDep, assertion fix, root node fix → v0.1.3, v0.1.4, v0.1.5
2025-01-15  PR #1: README fix (process not parse)
2025-01-27  Add readme trailer
2025-05-09  CI workflow for PRs (most recent commit)
```

**11 months without commits** (2025-05-09 to present).

## Open Issues & PRs

| # | Type | Title | Author | Date | Status |
|---|---|---|---|---|---|
| #1 | PR | README: Use process(), not parse() | vangberg | 2025-01-15 | Merged (2025-05-09) |
| #2 | Issue | keep empty lines | acorduan | 2025-09-27 | Open (self-resolved via htmlHandlers) |
| #3 | PR | fix: 'Empty text nodes are not allowed' and preserve whitespaces | acorduan | 2025-12-21 | Open (unreviewed) |

PR #3 has been open for ~4 months with no review response. This signals low maintenance bandwidth.

## GitHub Dependents (9 repos)

| Repo | Stars | Relationship |
|---|---|---|
| handlewithcarecollective/react-prosemirror | 358 | Same org (ex-@nytimes) |
| handlewithcarecollective/prosemirror-suggest-changes | 52 | Same org |
| handlewithcarecollective/handlewithcare.dev | — | Same org (company site) |
| saffron-health/react-prosemirror | — | Fork/consumer |
| mmounirf/tiptap-dev-kit | — | TipTap development kit |
| fork-archive-hub/prosemirror-suggest-changes | — | Fork |
| vangberg/skrift | 2 | Personal project (PR #1 author) |

**External production consumers:** Effectively 2 — mmounirf/tiptap-dev-kit and vangberg/skrift. The rest are same-org or forks.

**Primary production user:** moment.dev (confirmed by smoores in ProseMirror Discuss thread, not visible as GitHub dependent).

## npm Download Stats

~56,584 monthly downloads (from GitHub agent research). Previous report stated ~16k weekly, which aligns (~64k/month).

npm reports **0 dependents** in its dependency graph (likely because moment.dev is private and the other consumers are small).

## Author Background

**Shane Friedman (smoores-dev / smoores-hwc)**
- Previously at New York Times, led development of `@nytimes/react-prosemirror`
- Now at Handle with Care Collective (`handlewithcare.dev`)
- Created this library for moment.dev
- Also maintains: `@handlewithcare/react-prosemirror` (v3.0.0), `prosemirror-suggest-changes`, `react-codemirror`

## ProseMirror Discuss Thread Context

Thread: "New markdown library: remark-prosemirror" (2024-12-18)

**smoores** (original post):
> "We developed this for projects at @handlewithcarecollective that needed to convert back and forth between ProseMirror and Markdown (most notably moment.dev)."
> "The lack of syntax tree [in markdown-it] makes extending it to cover the use cases I needed feel challenging and clunky."

**Marijn** (ProseMirror creator):
> Acknowledged the library fills a genuine gap. Noted he'd considered replacing markdown-it but viewed it as "too much of a breaking change."

## What to Expect for 1.0

No roadmap published. Given:
- 11 months since last commit
- Unreviewed PR (#3) for 4+ months
- Pre-1.0 version (0.1.x)
- Small codebase (~650 lines total)
- No CHANGELOG discipline

**Assessment:** 1.0 is not imminent. The library appears to be in "works for us at moment.dev" maintenance mode. This is not necessarily a risk — the API surface is small and stable, and forking is trivial.

## Related Ecosystem

### Alternatives

| Library | Approach | Status |
|---|---|---|
| `prosemirror-markdown` | markdown-it → PM (official) | Mature, 800k+ weekly downloads |
| `prosemirror-remark` (marekdedic) | remark + prosemirror-unified | Similar approach, different implementation |
| `milkdown` | Full editor built on remark + PM | Complete editor framework |
| `@tiptap/pm` + `@tiptap/markdown` | TipTap's markdown integration | What we currently use |

### Key differentiator

remark-prosemirror is the **thinnest** of these — it's a handler dispatch system, not an editor framework. It provides:
1. A type-safe handler registration mechanism
2. Mark hydration (flat PM marks → nested mdast tree)
3. Link reference resolution
4. HTML → hast → PM pipeline

Everything else (schema, handlers, editor integration) is the consumer's responsibility.
