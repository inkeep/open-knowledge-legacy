# Changelog

## 2026-04-10 — Session 1: Initial spec creation

**Context:** This spec was spun off from the block-editor-ux spec session after discovering that main had merged PR #37 (table support with a custom ProseMirror Plugin slash command) while PR #23 (typed-component-nodes) was still open with a `@tiptap/suggestion`-based slash command. Two conflicting architectures blocking the downstream work.

**Process:**
1. Audited the divergence between main and PR #23's slash command implementations
2. Ran `/research` and `/analyze` on the two architectures (documented in prior session)
3. User confirmed "greenfield, both flexible — pick what's best"
4. Recommended: migrate main to `@tiptap/suggestion` with pluggable items sources
5. Committed block-editor-ux spec to its worktree
6. Created this spec in a new worktree based on origin/main

**Decisions locked:**
- D1: Foundation = `@tiptap/suggestion` (ecosystem standard)
- D2: Item sources = `addOptions` config array (standard TipTap pattern)
- D3: Category taxonomy = open string (flexibility for downstream)
- D4: Category labels = extension option passed as menu prop
- D5: Keyboard handling = in `render()` closure (NOT `forwardRef` + `useImperativeHandle` due to React Compiler constraints)
- D6: Trigger rules = `startOfLine: false` + `allowedPrefixes: [' ', '\n']` (reproduces main's current regex)
- D7: Preserve all 10 existing formatting items exactly
- D8: Add optional `description` field to `SlashCommandItem` (for PR #23 subtext)
- D9: Add optional `range` parameter to `command` signature (for PR #23 insertion)

**Scope:** Single-phase refactor. Three files in `packages/app/src/editor/`. Zero user-visible behavior change. Unblocks PR #23 rebase and block-editor-ux spec's "+" button.

**Evidence files:**
- `evidence/slash-command-architecture-analysis.md` — multi-angle analysis of Suggestion vs custom Plugin, code comparison, counter-argument evaluation

**Next step:** Implementation via `/ship` or direct edits. Expected PR size: ~200 lines changed. Target: main.
