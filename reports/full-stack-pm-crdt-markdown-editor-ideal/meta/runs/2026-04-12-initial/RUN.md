---
run-id: 2026-04-12-initial
status: Active
owner: orchestrator
started: 2026-04-12
---

# Run Context

## Purpose

Gather evidence to synthesize the architecturally-ideal full-stack configuration for a greenfield ProseMirror-based CRDT markdown editor with MDX support. Validate a proposed PM schema against every library in the stack.

## Dimension assignments (delegated via fanout subprocesses)

Each subprocess is a nested `claude -p /research --headless` focused on a single dimension cluster:

- **D1 — ProseMirror core + TipTap** — one subprocess
- **D2 — CRDT/collab (yjs, hocuspocus, y-prosemirror, y-codemirror.next)** — one subprocess
- **D3 — unified/remark/micromark pipeline** — one subprocess
- **D4 — @handlewithcare/remark-prosemirror** — one subprocess
- **D5 — CodeMirror source editor** — one subprocess (smaller scope)
- **D6 — Reference architectures (Milkdown, BlockNote, Plate)** — one subprocess

D7 (schema synthesis) and D8 (version/maturity) are cross-cutting — handled by orchestrator after fanout.

## Source anchors

- installed `node_modules/@tiptap/*`, `node_modules/prosemirror-*`, `node_modules/yjs`, `node_modules/y-prosemirror` (transitively via @tiptap/y-tiptap), etc.
- Previously-cloned OSS repos in `~/.claude/oss-repos/` if present
- Published docs: prosemirror.net, tiptap.dev, unifiedjs.com, mdxjs.com, discuss.prosemirror.net
- GitHub issues + READMEs

## Canonical sources (orchestrator-authoritative)

- **prosemirror.net** for schema + model semantics
- **tiptap.dev** for TipTap extension conventions
- **mdast spec** at `github.com/syntax-tree/mdast` for markdown AST
- **mdxjs.com/packages/remark-mdx** for MDX node types
- **discuss.prosemirror.net** for idiomatic patterns

## Delta rubric

None yet — first pass.

## Findings channel

Workers return structured Markdown findings per `references/subagent-orchestration.md` output contract. Orchestrator consolidates into `evidence/<dimension>.md`.
