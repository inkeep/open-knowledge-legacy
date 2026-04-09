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
| **PR** | Local review — worktree-typed-component-nodes vs main |
| **Author** | Nick Gomez |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `3271adb0d67d65312ed7a03a17900866b44233a1` |
| **Size** | 34 commits · +6787/-739 · 54 files |
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
d453ebb spec: finalize typed-component-nodes — built-ins only, .d.ts extraction
4219eb8 Merge remote-tracking branch 'origin/main' into worktree-typed-component-nodes
6f6e183 spec: integrate post-PR-#8 local-only observer model
12f49c9 Merge branch 'main' of https://github.com/inkeep/open-knowledge into worktree-typed-component-nodes
3f4d7b1 working favicon
0a14ba3 chore: upgrade CLI package from zod 3 to zod 4 (#11)
513d060 docs: add Bun module resolution file extensions research report
1ec2e23 chore: update changeset config for monorepo workspaces
3725319 spec(typed-component-nodes): adapt to post-PR-#10 monorepo restructure
e04f916 add shadcn skills (#14)
c798a95 fix: clear error message when content directory is missing
9a3b08b fix: resolve all biome lint warnings across packages
278832b ignore worktrees
36d2073 [US-001] Wire jsxTokenizerB into JsxComponent for raw JSX serialization
802ce47 [US-002] Install registry dependencies, create types, and BUILT_INS manifest
15a928f [US-003] Add Mermaid and Audio shadcn components
ad11c67 [US-004] Create build-registry dev script and generate components.ts manifest
ebe958f [US-005] Create jsx-component-factory and per-built-in extraction tests
7fccb7c [US-006] Centralize factory call in shared.ts (R12 schema-construction refactor)
4e9107e [US-007] Add acorn JSX parser and wire into factory parseMarkdown
86babef [US-008] Structured-attribute renderMarkdown with round-trip tests
5789732 [US-009] Create componentMap, PropPanel, and ComponentToolbar
487d3cb [US-010] Registry-driven JsxComponentView, split void view, delete Callout stub
ebeb2d7 [US-011] Add slash commands for component insertion from manifest
7dd2c7c [US-012] Enable inline rich-text children (Layer 3) with marked.lexer + renderChild
837d02b [US-013] Unregistered component fallback + collision preserve-and-render policy
9e9669d [US-014] Agent-discoverable manifest, AGENTS.md, CLAUDE.md, CI drift check
6d1b9a0 [US-015] E2E test suite, test-fixture.md with 15 built-ins, real corpus fixtures
8edda05 docs: update docs for typed-component-nodes (Layers 2-3 shipped)
9f17264 fixup! local-review: baseline (pre-review state)
8bd35bb fixup! local-review: address findings (pass 1)
b6ec247 fix: use cross-runtime __ownDir instead of Bun-only import.meta.dir
740f6c2 fix: remove BUILT_INS from barrel exports to fix Vite browser bundle
3271adb fixup! local-review: baseline (pre-review state)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/skills/pr-context/SKILL.md                 | 380 ----------
 ARCHITECTURE.md                                    |   8 +-
 CLAUDE.md                                          |  18 +-
 docs/content/architecture.mdx                      |  17 +-
 package.json                                       |   4 +-
 packages/app/components.json                       |  17 +
 packages/app/content/test-fixture.md               | 151 ++--
 packages/app/package.json                          |   3 +
 packages/app/playwright.config.ts                  |  26 +
 packages/app/src/components/ui/audio.tsx           |  26 +
 packages/app/src/components/ui/mermaid.tsx         |  31 +
 packages/app/src/editor/Callout.tsx                |  26 -
 .../src/editor/components/ComponentToolbar.test.ts |  17 +
 .../app/src/editor/components/ComponentToolbar.tsx |  65 ++
 .../app/src/editor/components/PropPanel.test.ts    | 179 +++++
 packages/app/src/editor/components/PropPanel.tsx   | 290 ++++++++
 .../app/src/editor/components/SlashCommandMenu.tsx | 156 ++++
 .../src/editor/components/UnregisteredFallback.tsx |  48 ++
 packages/app/src/editor/components/componentMap.ts |  44 ++
 .../app/src/editor/extensions/JsxComponentView.tsx | 112 ++-
 .../src/editor/extensions/JsxComponentVoidView.tsx |  17 +
 .../app/src/editor/extensions/jsx-component.ts     |  18 +-
 packages/app/src/editor/extensions/shared.ts       |  19 +-
 .../src/editor/extensions/slash-commands.test.ts   |  77 ++
 .../app/src/editor/extensions/slash-commands.tsx   | 162 +++++
 packages/app/tests/e2e/concurrent-editing.e2e.ts   |  51 ++
 packages/app/tests/e2e/fixtures/mixed-corpus.md    |  51 ++
 packages/app/tests/e2e/real-corpus.e2e.ts          |  97 +++
 packages/app/tests/e2e/typed-components.e2e.ts     |  79 ++
 packages/core/AGENTS.md                            |  33 +
 packages/core/package.json                         |   9 +
 packages/core/scripts/build-registry.ts            | 135 ++++
 packages/core/src/extensions/jsx-component.test.ts | 797 +++++++++++++++++++--
 packages/core/src/extensions/jsx-component.ts      |  32 +-
 packages/core/src/extensions/shared.test.ts        |  80 +++
 packages/core/src/extensions/shared.ts             |  21 +-
 packages/core/src/generated/components.test.ts     | 177 +++++
 packages/core/src/generated/components.ts          | 460 ++++++++++++
 packages/core/src/index.ts                         |  10 +-
 packages/core/src/registry/built-ins.ts            | 194 +++++
 packages/core/src/registry/index.ts                |  11 +
 .../core/src/registry/jsx-component-factory.ts     | 391 ++++++++++
 packages/core/src/registry/jsx-parser.test.ts      | 126 ++++
 packages/core/src/registry/jsx-parser.ts           | 115 +++
 packages/core/src/registry/registry.test.ts        |  99 +++
 packages/core/src/registry/types.ts                |  45 ++
 specs/2026-04-08-typed-component-nodes/SPEC.md     | 568 +++++++++++----
 .../evidence/component-inventory-and-gaps.md       |  27 +-
 .../react-docgen-typescript-dts-extraction.md      | 267 +++++++
 .../meta/_changelog.md                             | 232 ++++++
 .../meta/audit-findings-v2.md                      | 422 +++++++++++
 .../meta/audit-monorepo-restructure.md             | 412 +++++++++++
 .../meta/design-challenge-v2.md                    | 389 ++++++++++
 .../meta/post-merge-audit.md                       | 285 ++++++++
 54 files changed, 6787 insertions(+), 739 deletions(-)
```

Full file list (including untracked files when present):

```
.claude/skills/pr-context/SKILL.md
ARCHITECTURE.md
CLAUDE.md
docs/content/architecture.mdx
package.json
packages/app/components.json
packages/app/content/test-fixture.md
packages/app/package.json
packages/app/playwright.config.ts
packages/app/src/components/ui/audio.tsx
packages/app/src/components/ui/mermaid.tsx
packages/app/src/editor/Callout.tsx
packages/app/src/editor/components/ComponentToolbar.test.ts
packages/app/src/editor/components/ComponentToolbar.tsx
packages/app/src/editor/components/PropPanel.test.ts
packages/app/src/editor/components/PropPanel.tsx
packages/app/src/editor/components/SlashCommandMenu.tsx
packages/app/src/editor/components/UnregisteredFallback.tsx
packages/app/src/editor/components/componentMap.ts
packages/app/src/editor/extensions/JsxComponentView.tsx
packages/app/src/editor/extensions/JsxComponentVoidView.tsx
packages/app/src/editor/extensions/jsx-component.ts
packages/app/src/editor/extensions/shared.ts
packages/app/src/editor/extensions/slash-commands.test.ts
packages/app/src/editor/extensions/slash-commands.tsx
packages/app/tests/e2e/concurrent-editing.e2e.ts
packages/app/tests/e2e/fixtures/mixed-corpus.md
packages/app/tests/e2e/real-corpus.e2e.ts
packages/app/tests/e2e/typed-components.e2e.ts
packages/core/AGENTS.md
packages/core/package.json
packages/core/scripts/build-registry.ts
packages/core/src/extensions/jsx-component.test.ts
packages/core/src/extensions/jsx-component.ts
packages/core/src/extensions/shared.test.ts
packages/core/src/extensions/shared.ts
packages/core/src/generated/components.test.ts
packages/core/src/generated/components.ts
packages/core/src/index.ts
packages/core/src/registry/built-ins.ts
packages/core/src/registry/index.ts
packages/core/src/registry/jsx-component-factory.ts
packages/core/src/registry/jsx-parser.test.ts
packages/core/src/registry/jsx-parser.ts
packages/core/src/registry/registry.test.ts
packages/core/src/registry/types.ts
specs/2026-04-08-typed-component-nodes/SPEC.md
specs/2026-04-08-typed-component-nodes/evidence/component-inventory-and-gaps.md
specs/2026-04-08-typed-component-nodes/evidence/react-docgen-typescript-dts-extraction.md
specs/2026-04-08-typed-component-nodes/meta/_changelog.md
specs/2026-04-08-typed-component-nodes/meta/audit-findings-v2.md
specs/2026-04-08-typed-component-nodes/meta/audit-monorepo-restructure.md
specs/2026-04-08-typed-component-nodes/meta/design-challenge-v2.md
specs/2026-04-08-typed-component-nodes/meta/post-merge-audit.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~484031 bytes across ~54 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 8971f7c8a0e872a2e459055bfb8d14e982565977 -- path/to/file.ts`
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
