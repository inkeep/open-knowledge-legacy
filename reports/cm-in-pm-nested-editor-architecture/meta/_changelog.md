# Changelog

## 2026-04-15 — Initial report landed

Landed via session-log restore (commit `ab2f8f06`) after the original
subagent-authored report was lost during a session. REPORT.md (1048 lines)
+ three evidence files:

- `codebase-current-state.md` — SourceEditor / y-codemirror.next current
  wiring; shared Compartment patterns; `createNestedCMExtensions` factory seam.
- `prior-art-survey.md` — ProseMirror CodeMirror tutorial (canonical
  pattern), Outline block-code-block pattern, Notion-style embedded-editor
  precedents.
- `y-codemirror-nested-binding.md` — dual-observer conflict analysis:
  y-codemirror.next + y-prosemirror binding the same Y.XmlText with
  independent origin guards → race between the two sync plugins.

Primary recommendation (HIGH confidence): direct PM transaction dispatch
from the nested CM, NOT y-codemirror.next. CM → PM tr.replaceWith/delete →
y-prosemirror → CRDT. Single-owner Y type. Unified PM history for undo.
Per-instance theme Compartment. ~350 LoC factored via `createNestedCMExtensions`
reuse from `SourceEditor.tsx`.

## 2026-04-14 → 2026-04-19 — Adoption in Component Blocks v2

Cited by `specs/2026-04-14-component-blocks-v2/SPEC.md` §9.14 (FR-30..FR-35)
and §2209 D13 LOCKED as the authoritative architectural reference for
`rawMdxFallback` embedded CodeMirror. Established as AGENTS.md
**Precedent #24 — Direct PM dispatch for nested editors**.

Implementation shipped in PR #165:

- `packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx` — NodeView + CM mount
- `packages/app/src/editor/extensions/nested-cm-extensions.ts` — shared factory
- `packages/app/src/editor/extensions/raw-mdx-fallback.ts` — extension binding

No behavioral deltas from the report's recommendation.
