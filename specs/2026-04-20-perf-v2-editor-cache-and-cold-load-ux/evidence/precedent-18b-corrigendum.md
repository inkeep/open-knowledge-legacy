---
title: "Precedent #18(b) Corrigendum — TipTap Editor Destroyed on Activity Hidden"
description: "The CLAUDE.md precedent #18(b) claim 'navigation between already-pooled items becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive' is partially false for TipTap. useEditor.scheduleDestroy(1ms) destroys the editor on Activity hidden cleanup. Corrigendum text + application instructions."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: scheduled_for_v2_sprint_commit_1
target: CLAUDE.md §Architectural precedents #18(b)
applies_to: V2 impl sprint first commit (Phase 3.2 preamble per revised D6)
---

# Precedent #18(b) Corrigendum

**Per V2 perf spec D6 REVISED (LOCKED):** this corrigendum lands as the FIRST commit of the V2 impl sprint (Phase 3.2 preamble), NOT a standalone commit on `perf/investigation` beforehand. User directive 2026-04-20 prefers atomic end-to-end delivery over pre-ship staging. Documentation correction travels with the architectural fix it motivates.

## The partially-false claim in CLAUDE.md

Current precedent #18(b) text (verbatim from CLAUDE.md):

> **(b) Hybrid Activity-for-warm + Suspense-gated-cold.** For each pooled subscription, render one React subtree wrapped in `<Activity mode={isActive ? 'visible' : 'hidden'}>`. **Navigation between already-pooled items becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive.** First-visit to an unpooled item (or revisit to a pooled-but-not-Activity-mounted one) goes through `<Suspense fallback>` gated on `use(subscriptionPromise(key))`. `startTransition` around the navigation state-update keeps the previously-revealed subtree visible through the suspending re-render (SPEC G2 content-continuity). TipTap closed `ueberdosis/tiptap#5761` with maintainer @janthurau confirming editor hot-swap is unsupported, which rules out "one editor, swap the ydoc" and motivates per-Activity-entry editor+provider+ydoc triples.

**The bold claim is partially false** for TipTap editors specifically.

## Why it's partially false (HIGH confidence)

**Empirical + source-read verification:**

- `evidence/tiptap-large-doc-patterns.md` §Q1 reads `@tiptap/react`'s `useEditor` hook: `useEditor.scheduleDestroy(1ms)` is called on component unmount cleanup. TipTap's own React binding destroys the editor instance 1 ms after React unmount, not on-demand at cache eviction time.
- `specs/2026-04-19-perf-diagnostic-toolkit/evidence/s2-diagnosis.md` §Warm-switch attribution directly measures that "warm-switch" (nav between pooled docs) re-runs the full editor construction cost — confirming the Editor instance is NOT preserved across Activity hidden.
- `evidence/cold-mount-profile.md` §How to reproduce measured 4× `editor-mount` calls per visit to PROJECT.md, consistent with StrictMode × 2 Activity entries. If precedent #18(b) were fully true, the `editor-mount` mark would fire ONCE per docName lifetime. It doesn't.

**CodeMirror side is different.** CM6's `EditorView.destroy()` is NOT called by y-codemirror.next on unmount. The React binding at `packages/app/src/editor/SourceEditor.tsx` could call destroy explicitly — need to check current behavior — but the library doesn't auto-destroy like TipTap does. H1 probe `evidence/h1-cm6-reparent-probe.md` established that reparent-without-destroy is feasible for CM6 (12/12 tests pass).

**DOM scroll state is also different.** `<Activity mode="hidden">` actually unmounts the hidden DOM subtree. Scroll position (`scrollTop` DOM property) does NOT survive unless the container owns its own scroll with save/restore semantics. Precedent #18(c) already documents this via `ScrollPreservingContainer`.

## Corrected understanding

What actually survives an `<Activity>` visibility flip:
- React state in the visible subtree (precedent #18(b) is right about this)
- Non-editor DOM within the Activity entry, if the container owns the scroll and does save/restore
- Y.js observers and CRDT update handlers (per precedent #18(c) — they do NOT pause in hidden mode)

What does NOT survive (what precedent #18(b) got wrong):
- TipTap editor instance (destroyed by `useEditor.scheduleDestroy(1ms)`)
- ProseMirror view state (gone with the editor)
- Editor-specific undo history (reconstructed from Y.UndoManager on re-mount; but cursor position + in-flight composition state lost)
- DOM scroll within the editor's scrollable container (unless explicitly save/restored)

## Corrigendum text (per CLAUDE.md corrigendum protocol)

Per CLAUDE.md's "Post-ship corrigendum annotations on shipped specs" section, the corrigendum is appended to the same line with `<br>_[...]_`. Apply to every occurrence in CLAUDE.md (grep for the exact phrasing):

```
... Navigation between already-pooled items becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive.<br>_[Corrected 2026-04-20 post-ship: For TipTap editors specifically, `useEditor.scheduleDestroy(1ms)` destroys the editor instance on Activity unmount — editor state (cursor, undo history, in-flight composition, PM view state) does NOT survive the visibility flip without module-level editor cache via `Editor.mount()`/`unmount()` APIs or raw `editor.view.dom` reparenting. CodeMirror + DOM scroll state survive as documented when containers own their scroll. Authoritative fix + full V2 cache pattern in `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/`.]_ First-visit to an unpooled item ...
```

Same text on subsequent occurrences in the same doc can shorten to "same correction as the breadcrumb at line N above" plus the pointer, per CLAUDE.md corrigendum protocol.

## Grep to find every occurrence before applying

```bash
grep -n "Navigation between already-pooled items becomes a visibility flip" CLAUDE.md
```

Expected: 1–2 hits (precedent #18(b) body + possibly a STOP rule cross-reference).

## Ship protocol

Per V2 perf spec D6 REVISED LOCKED:

1. Branch: V2 impl sprint branch (created by the AI coding agent at sprint kickoff from baseline `23e86ca9`)
2. First commit of the sprint: `docs(CLAUDE): precedent #18(b) corrigendum + new WARN rule`
   - Apply the corrigendum text from §"Corrigendum text" above to every occurrence of the target phrase in CLAUDE.md
   - Also add the new WARN rule from V2 perf spec §13 CLAUDE.md mods (editor instance may outlive React subtree)
3. Run `bun run check` — documentation-only change; clean pass expected
4. Sprint commit 2+: V2 feature work per 5-phase topology (see SPEC.md §9)
5. Reference this evidence file in the commit body

## Validation post-apply

After the commit lands, `CLAUDE.md §18(b)` should render as:

> ... Navigation between already-pooled items becomes a visibility flip — scroll position, cursor, editor undo history, and any other subtree state survive.
> _[Corrected 2026-04-20 post-ship: For TipTap editors specifically, ..., full V2 cache pattern in `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/`.]_
> First-visit to an unpooled item ...

(Rendered with `<br>` producing a line break; italicized bracketed annotation with the pointer.)
