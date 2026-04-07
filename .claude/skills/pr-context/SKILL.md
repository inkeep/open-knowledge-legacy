---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — feat/init-spike vs main |
| **Author** | Nick Gomez |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `42f5e10e51fe8ce721e6b5389f8b06ce2f57412d` |
| **Size** | 30 commits · +6104/-0 · 56 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
3167755 [US-001] Scaffold init_spike project with Vite + React + TypeScript + Biome
7d6b1f1 [US-002] V2: Embed Hocuspocus in Vite with TipTap WYSIWYG editor
f679a69 [US-003] V1a: Measure raw markdown round-trip fidelity without fixes
43e7c27 [US-004] V7: FAIL — Yjs v14 delta protocol not viable for dual-binding
2d33194 [US-005] V3: DirectConnection agent writes via HTTP API + CLI
54345a4 [US-006] V6: Void node with React component preview
c26794d [US-007] V1b: Apply markdown round-trip fixes — zero semantic loss
8dd6812 [US-008] V4b: Source toggle — serialize-on-toggle via updateYFragment
0a1c624 [US-009] V5: Git auto-persistence pipeline (CRDT → disk → git)
df0205b [US-010] Final RESULTS.md compilation — all validations documented
298e26b fix: address post-implementation review findings
ad32782 docs: add README and update CLAUDE.md for init_spike
3f1a241 docs: add fumadocs documentation site
ab08dd1 chore: update gitignore for docs site (.next, .source)
6751db6 fixup! local-review: baseline (pre-review state)
cf05381 fixup! local-review: address findings (pass 1)
4627e4c fix: source toggle round-trip and frontmatter sync
adf298b Add research reports submodule and reference table in PROJECT.md
4a244c0 fixup! local-review: baseline (pre-review state)
c8bedbc fixup! local-review: address findings (pass 1)
7a998c6 test: add agent→editor flow e2e tests and fix duplicate Link extension
20fe750 Update pr-context skill, diff, and test doc content
c97fb00 spec: agent markdown write path + three-way merge source toggle
95b7eb4 [US-001] three-way merge on toggle-back preserves agent writes
25e5f4f [US-002] conflict detection — user wins for conflicting paragraphs
d236989 [US-003] agent markdown write endpoint (POST /api/agent-write-md)
af0232f [US-004] source mode live injection — agent writes appear in CodeMirror
a912b36 [US-005] combined A3 test and RESULTS.md update
6f37a03 docs: document agent markdown write path and three-way merge
42f5e10 fixup! local-review: baseline (pre-review state)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/pr-diff/local-review-target-branch.txt     |    1 +
 .gitignore                                         |    7 +
 .gitmodules                                        |    3 +
 PROJECT.md                                         |   50 +
 docs/.gitignore                                    |    2 +
 docs/content/agent-write-path.mdx                  |   92 +
 docs/content/architecture.mdx                      |   92 +
 docs/content/meta.json                             |    3 +
 docs/content/overview.mdx                          |   31 +
 docs/content/validations.mdx                       |   93 +
 docs/next-env.d.ts                                 |    6 +
 docs/next.config.ts                                |   10 +
 docs/package.json                                  |   28 +
 docs/postcss.config.mjs                            |    8 +
 docs/source.config.ts                              |   17 +
 docs/src/app/[[...slug]]/page.tsx                  |   37 +
 docs/src/app/global.css                            |    3 +
 docs/src/app/layout.tsx                            |   19 +
 docs/src/lib/source.ts                             |    7 +
 docs/src/mdx-components.tsx                        |    8 +
 docs/tailwind.config.ts                            |   13 +
 docs/tsconfig.json                                 |   36 +
 init_spike/CLAUDE.md                               |   66 +
 init_spike/README.md                               |  130 ++
 init_spike/RESULTS.md                              |  268 +++
 init_spike/biome.jsonc                             |   32 +
 init_spike/content/test-doc.md                     | 2308 ++++++++++++++++++++
 init_spike/content/test-fixture.md                 |   60 +
 init_spike/index.html                              |   12 +
 init_spike/package.json                            |   55 +
 init_spike/src/App.tsx                             |  115 +
 init_spike/src/editor/Callout.tsx                  |   19 +
 init_spike/src/editor/SourceEditor.tsx             |   61 +
 init_spike/src/editor/TiptapEditor.tsx             |  164 ++
 .../src/editor/extensions/JsxComponentView.tsx     |   45 +
 .../src/editor/extensions/frontmatter.test.ts      |   58 +
 init_spike/src/editor/extensions/frontmatter.ts    |   24 +
 init_spike/src/editor/extensions/jsx-component.ts  |   75 +
 init_spike/src/editor/extensions/shared.ts         |   23 +
 init_spike/src/editor/three-way-merge.ts           |  195 ++
 init_spike/src/main.tsx                            |   12 +
 init_spike/src/server/agent-flow.test.ts           |  573 +++++
 init_spike/src/server/agent-sim.ts                 |   64 +
 init_spike/src/server/hocuspocus-plugin.ts         |  139 ++
 init_spike/src/server/persistence.test.ts          |   38 +
 init_spike/src/server/persistence.ts               |  189 ++
 init_spike/src/types/diff.d.ts                     |   10 +
 init_spike/src/v1a-roundtrip-test.ts               |  126 ++
 init_spike/src/v1b-roundtrip-test.ts               |  136 ++
 init_spike/src/v7-test/delta-protocol-test.ts      |  107 +
 init_spike/src/v7-test/package-lock.json           |  147 ++
 init_spike/src/v7-test/package.json                |   15 +
 init_spike/tsconfig.json                           |   19 +
 init_spike/vite.config.ts                          |    7 +
 reports                                            |    1 +
 specs/2026-04-07-agent-markdown-writes/SPEC.md     |  245 +++
 56 files changed, 6104 insertions(+)
```

Full file list (including untracked files when present):

```
.claude/pr-diff/local-review-target-branch.txt
.gitignore
.gitmodules
PROJECT.md
docs/.gitignore
docs/content/agent-write-path.mdx
docs/content/architecture.mdx
docs/content/meta.json
docs/content/overview.mdx
docs/content/validations.mdx
docs/next-env.d.ts
docs/next.config.ts
docs/package.json
docs/postcss.config.mjs
docs/source.config.ts
docs/src/app/[[...slug]]/page.tsx
docs/src/app/global.css
docs/src/app/layout.tsx
docs/src/lib/source.ts
docs/src/mdx-components.tsx
docs/tailwind.config.ts
docs/tsconfig.json
init_spike/CLAUDE.md
init_spike/README.md
init_spike/RESULTS.md
init_spike/biome.jsonc
init_spike/content/test-doc.md
init_spike/content/test-fixture.md
init_spike/index.html
init_spike/package.json
init_spike/src/App.tsx
init_spike/src/editor/Callout.tsx
init_spike/src/editor/SourceEditor.tsx
init_spike/src/editor/TiptapEditor.tsx
init_spike/src/editor/extensions/JsxComponentView.tsx
init_spike/src/editor/extensions/frontmatter.test.ts
init_spike/src/editor/extensions/frontmatter.ts
init_spike/src/editor/extensions/jsx-component.ts
init_spike/src/editor/extensions/shared.ts
init_spike/src/editor/three-way-merge.ts
init_spike/src/main.tsx
init_spike/src/server/agent-flow.test.ts
init_spike/src/server/agent-sim.ts
init_spike/src/server/hocuspocus-plugin.ts
init_spike/src/server/persistence.test.ts
init_spike/src/server/persistence.ts
init_spike/src/types/diff.d.ts
init_spike/src/v1a-roundtrip-test.ts
init_spike/src/v1b-roundtrip-test.ts
init_spike/src/v7-test/delta-protocol-test.ts
init_spike/src/v7-test/package-lock.json
init_spike/src/v7-test/package.json
init_spike/tsconfig.json
init_spike/vite.config.ts
reports
specs/2026-04-07-agent-markdown-writes/SPEC.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~220453 bytes across ~56 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 622fa0668dce2b2259d5ff57ac23d2c703903e55 -- path/to/file.ts`
> - Full diff: read `.claude/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
