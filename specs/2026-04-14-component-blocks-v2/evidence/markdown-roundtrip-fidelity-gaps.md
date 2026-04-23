---
title: "Markdown round-trip fidelity gaps on document load (pre-existing)"
status: evidence — findings + fix strategy, NOT in PR #165 scope
createdAt: 2026-04-22
summary: >
  Opening an existing markdown file in the browser editor can produce disk
  diffs even when the user performs no edits. Three independent
  normalization classes have been identified. The root cause is the
  Observer B → Observer A round-trip that fires on initial document load.
  Behavior predates PR #165 (originally reported in Slack before PR #165
  was authored); this evidence captures the reproduction methodology, the
  three normalization classes, root cause, and fix-option assessment so a
  follow-up workstream can pick the problem up with full context.
---

# Markdown round-trip fidelity gaps on document load

## Problem statement

A user opens an existing markdown file in the browser editor (no edits,
no clicks). After the persistence debounce fires, `git status` shows
the file as modified. The diff contains whitespace, escape, and
ordered-list-number changes that the user did not make.

Internal Slack report (pre-dating PR #165):

> There is an old strange issue where files opened in the browser
> appear formatted or escaped in git, even when I haven't changed
> their content. I think it might be TipTap.

## Reproduction methodology (2026-04-22)

Tested against the PR #165 worktree (commit `ce962e94`) on the app dev
server (port 6006). File under test: `PRECEDENTS.md` at repo root
(124 lines, 15,874 bytes on disk).

```bash
# 1. snapshot disk
md5 PRECEDENTS.md                                 # eec931c59deb22f608fba324ae9672df

# 2. open in browser (NO click, NO edit)
agent-browser open http://localhost:6006/#/PRECEDENTS.md
sleep 4                                           # wait for persistence debounce

# 3. check disk
git diff --stat PRECEDENTS.md                     # 21 lines changed, 12 insertions, 9 deletions
```

No user interaction was performed between steps 2 and 3. The file on
disk changed as a side effect of opening it.

## The three normalization classes

### Class 1: Ordered-list renumbering of non-sequential items

**Symptom:**

```
-24. **Direct PM dispatch for nested editors.** Embedded editor...
+15. **Direct PM dispatch for nested editors.** Embedded editor...
```

Precedent #24 in `PRECEDENTS.md` is deliberately placed out of numeric
sequence (in section `## CRDT bridge & schema (precedents 9–14, 24)`,
the last item jumps from `14.` to `24.` so numbers stay stable across
the rest of the document — see PRECEDENTS.md's own contract in its
header: "Numbers are stable — code comments across the codebase cite
them as `precedent #N` (~50 sites)").

**Root cause.** `mdast-util-to-markdown`'s ordered-list serializer
defaults to sequential renumbering: given a list with first-item
`start: 9`, items are emitted as `9. 10. 11. 12. 13. 14. 15.` (one per
child, counting from `start`). The `ordered: { start: number }` on
each individual item in the mdast isn't consulted — the writer uses
`start + index` math. When the source markdown has `9. 10. 11. 12. 13.
14. 24.` (non-sequential because of the section grouping), the parse
retains the literal `14.` and `24.` start numbers on separate mdast
nodes BUT they're siblings in one mdast `list` node with `start: 9`.
Serialize emits sequential numbers.

**Workaround available today.** Separate the out-of-sequence item with
a blank line + HTML comment or a different block so it parses as a
second list with its own `start`. Ugly.

**Proper fix.** Override the `listItem` handler in
`to-markdown-handlers.ts` to consult each item's own `position`-derived
original number, rather than using the default `start + index` math.
Or teach the post-parse walker to annotate per-item `data.startNumber`
for the serializer to consume. Medium complexity.

### Class 2: Over-cautious backslash escape injection

**Symptoms:**

```
-~50 sites
+\~50 sites

-`ACTIVITY_MOUNT_LIMIT` decoupled from `MAX_POOL`
+`ACTIVITY\_MOUNT\_LIMIT` decoupled from `MAX\_POOL`
```

**Root cause.** `mdast-util-to-markdown`'s text serializer checks each
character in prose against an `unsafe` pattern list:

- `~` is in the unsafe list when GFM strikethrough is active (to
  prevent accidental `~~strike~~` mis-parse) — even a single `~`
  surrounded by non-`~` characters gets escaped defensively.
- `_` is in the unsafe list (to prevent accidental `_emphasis_`
  mis-parse) — even underscores inside `<code>` spans or adjacent to
  alphanumerics that can't open emphasis get escaped.

The serializer doesn't attempt context-aware disambiguation (e.g.,
"inside backticks, no emphasis possible, so no escape needed for
`_`"). It errs on the side of escaping more often than strictly
necessary.

**Proper fix.** Custom `unsafe` pattern list that excludes underscores
inside inline code spans + excludes single tildes not adjacent to
another tilde. Requires a `stringifyEntities`-like helper or a
post-processing pass. Medium complexity. Risk: over-narrow the escape
list and we introduce real parse-breakage on edge cases.

### Class 3: Blank-line canonicalization inside list items

**Symptom:**

```
-21. **Ancestor-priority for auto-revealing tree-state derivations.** When ... :
-    ```
-    expandedPaths = ancestors(activeTarget) ∪ (userExpanded \ userCollapsed)
+20. **Ancestor-priority for auto-revealing tree-state derivations.** When ... :
+
+    ```
+    expandedPaths = ancestors(activeTarget) ∪ (userExpanded \ userCollapsed)
```

A blank line was inserted between the list item's opening paragraph
and its indented code fence.

**Root cause.** `mdast-util-to-markdown`'s `join` function (controls
spacing between sibling nodes) emits a blank line between any two
block-level children inside a `listItem`. The parser preserves the
original no-blank-line form in mdast (position data shows the two
blocks were adjacent) but the stringifier's `join` always emits the
canonical form with a separator blank line. This is the same
mechanism that canonicalizes `<Foo>\ntext\n</Foo>` → `<Foo>\n\ntext
\n\n</Foo>` for MDX block elements (that specific case was addressed
in PR #165 commit `ce962e94` via a different pathway — the
`SourceDirtyObserver` fix).

**Proper fix.** Override the `join` function or the list-item
serializer to preserve original inter-child spacing when
position data shows the children were adjacent in the source.
Medium-large complexity.

## Why opening a file writes to disk (the load-time trigger)

The pipeline on document load:

1. HTTP request loads doc → server reads `PRECEDENTS.md` bytes from
   disk → populates `Y.Text`.
2. Client `HocuspocusProvider` syncs Y.Text.
3. **Observer B (Y.Text → XmlFragment)** fires because Y.Text got
   populated. It parses the markdown and writes to XmlFragment.
4. **Observer A (XmlFragment → Y.Text)** fires because XmlFragment got
   populated. It re-serializes via `mdast-util-to-markdown` and writes
   the canonical form back to Y.Text.
5. Persistence debounce (~2s) fires → writes Y.Text to disk.

Step 4 is where normalization happens. Once Y.Text holds the
normalized form, persistence pushes it to disk unconditionally.

The key architectural question: **should Observer A fire on the
initial bridge-population transaction, or only on user-originated
XmlFragment changes?** Per Precedent #14 ("Cross-CRDT sync is
single-writer, server-side"), Observer A runs server-side. Per
Precedent #1 ("Typed transaction origins"), we can distinguish
initial-population transactions from user-edit transactions by origin.

## Fix options (ranked by scope)

### Option A — Suppress Observer A on initial bridge-population

Smallest, most targeted. Make Observer A check the transaction
origin; skip if origin is the initial bridge population (a new
`INITIAL_LOAD_ORIGIN` added to the origin-guard truth table in
CLAUDE.md §"Origin-guard truth table"). The XmlFragment still gets
populated, the user still sees the rendered content, but Y.Text is
NOT overwritten by the serialized form — so persistence doesn't fire
the normalization writeback.

**Trade-off.** If the user then edits and saves, the normalized
canonical form IS still what lands on disk (because the user's
transaction goes through the full bridge). This option only
eliminates the "open-and-don't-edit" case, which is the case the user
is most surprised by (Dima's original complaint).

**Estimated scope.** ~40 LoC in `packages/server/src/server-observers.ts`
+ origin definition + test in `tests/integration/`. Adjacent to
precedent #14 work.

### Option B — Fix Class 1 (ordered-list renumbering)

Medium. Custom `listItem` handler preserving original `start` per
item. Would require tracking `data.startNumber` through parse + passing
it through to the serializer. See `to-markdown-handlers.ts` for the
analogous pattern already used for other fidelity-aware overrides.

**Estimated scope.** ~60-100 LoC in `packages/core/src/markdown/`
+ fidelity fixture test.

### Option C — Fix Class 2 (escape injection)

Medium. Custom `unsafe` pattern list + context-aware escape
suppression inside inline code spans. Brittle: easy to narrow too
aggressively and introduce real parse breakage.

**Estimated scope.** ~40-80 LoC + fidelity fixture corpus extension
covering edge cases.

### Option D — Fix Class 3 (list-item blank-line join)

Medium-large. Override `join` function or list-item serializer.
Interacts with other block-inside-list cases (nested lists, blockquote
inside list, etc.).

**Estimated scope.** ~80-150 LoC + fidelity fixture corpus extension.

## Recommendation

Ship **Option A** in a follow-up PR first. It's the smallest
intervention and addresses the most surprising user-visible symptom
("I opened a file and git shows changes"). The remaining three
normalization classes (B, C, D) are real but less user-surprising
(they only appear on save, which is at least a user-initiated action)
and can be tackled in a dedicated markdown-fidelity workstream with
its own PBT fixture coverage.

## Pre-existing provenance

The Slack report quoted above predates PR #165's branch creation.
Behavior on `main` (before PR #165 merged) is identical to behavior on
the PR branch (verified by tracing: PR #165 does NOT touch
`server-observers.ts`, `persistence.ts`, or the mdast-to-markdown
serializer in `to-markdown-handlers.ts` in any way that would affect
the initial-load round-trip).

**PR #165 does not introduce, exacerbate, or mitigate this behavior.**
It is orthogonal to the typed-component-nodes + on-blur upgrade scope
and belongs in a separate spec.
