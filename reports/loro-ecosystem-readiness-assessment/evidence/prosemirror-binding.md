# Evidence: ProseMirror Binding (loro-prosemirror)

**Dimension:** D2 — ProseMirror binding quality and readiness
**Date:** 2026-04-07
**Sources:** github.com/loro-dev/loro-prosemirror, npm, Socket.dev, ProseKit docs

---

## Key files / pages referenced

- https://github.com/loro-dev/loro-prosemirror — Repository (138 stars, 16 forks, 93 commits)
- https://github.com/loro-dev/loro-prosemirror/releases — Release history
- https://github.com/loro-dev/loro-prosemirror/issues — Open issues (7)
- https://github.com/loro-dev/loro-prosemirror/blob/main/src/sync-plugin.ts — Sync plugin source
- https://www.mintlify.com/prosekit/prosekit/extensions/loro — ProseKit integration

---

## Findings

### Finding: loro-prosemirror is pre-1.0 (v0.4.3) with active development
**Confidence:** CONFIRMED
**Evidence:** GitHub releases page

Release timeline:
- v0.4.3 (Feb 19, 2026) — changed module type to 'module'
- v0.4.2 (Nov 30, 2025) — removed attributes in loro map, updated loro-crdt to v1.10.2
- v0.4.1 (Nov 25, 2025) — exported additional types
- v0.4.0 (Nov 24, 2025) — introduced CursorEphemeralStore
- v0.3.7 (Nov 10, 2025) — prevent operations on destroyed views
- v0.3.6 (Oct 30, 2025) — ignore out-of-bounds positions
- v0.3.4 (Oct 29, 2025) — BREAKING: upgrade to loro v0.13.0 API, major feature additions

The v0.3.4 release was the most significant, introducing custom ContainerID support, automatic ProseMirror schema-based Loro text styling, editor history visualization, and undo/redo as ProseMirror commands.

**Implications:** Active development but still pre-1.0. Breaking changes have occurred (v0.3.4). The API is stabilizing but not guaranteed stable.

### Finding: Provides three core plugins matching y-prosemirror's surface area
**Confidence:** CONFIRMED
**Evidence:** GitHub README, source code analysis

Exports:
- `LoroSyncPlugin` — bidirectional sync between Loro and ProseMirror
- `LoroUndoPlugin` — collaborative undo/redo
- `LoroEphemeralCursorPlugin` — cursor/presence sync (using EphemeralStore)
- `CursorEphemeralStore` — ephemeral state storage
- `undo` / `redo` — command functions

This mirrors y-prosemirror's plugin surface (ySyncPlugin, yUndoPlugin, yCursorPlugin).

### Finding: Sync plugin uses full document replacement strategy
**Confidence:** CONFIRMED
**Evidence:** Source code analysis of sync-plugin.ts

The LoroSyncPlugin architecture:
1. **PM→Loro**: Local edits trigger "doc-changed" transactions, calling `updateLoroToPmState()` to propagate ProseMirror changes into Loro
2. **Loro→PM**: Remote changes arrive via `doc.subscribe()`, calling `updateNodeOnLoroEvent()` which creates nodes from Loro objects via `createNodeFromLoroObj()` and replaces the entire document using `new Slice(Fragment.from(node), 0, 0)`
3. **Schema handling**: `configLoroTextStyle(props.doc, editorState.schema)` configures Loro text styles based on ProseMirror schema at init
4. **Cursor sync**: Converts between ProseMirror selections and Loro cursors

The full document replacement approach for Loro→PM updates is simpler but may cause performance issues on very large documents. y-prosemirror uses incremental updates.

### Finding: Multi-instance support via Container IDs
**Confidence:** CONFIRMED
**Evidence:** GitHub README

```typescript
const map = doc.getMap("<unique-id>");
LoroSyncPlugin({ doc, containerId: map.id });
```

Multiple ProseMirror editors can sync to the same Loro document using different Container IDs. This is important for apps that have multiple editor instances (e.g., title + body).

### Finding: Open issues indicate stability concerns
**Confidence:** CONFIRMED
**Evidence:** GitHub issues (7 open as of April 2026)

Notable issues:
- #77: "content wipe when docChanged transaction fires before init()" — data loss bug (Mar 28, 2026)
- #75: "addEphemeral races with auto-created TimerlessEphemeralStore" — race condition (Mar 18, 2026)
- #59: "Cursor is visible in multiple editor instances" — display bug
- #28: "Type error for loro doc" — TypeScript type issue (Apr 2025, still open)

The content wipe bug (#77) is particularly concerning for production use.

### Finding: Atom node support is not explicitly documented or tested
**Confidence:** UNCERTAIN
**Evidence:** No specific documentation or issues about atom nodes

The source code handles structured data through LoroMap<LoroNodeContainerType> and creates nodes from Loro objects, suggesting atom nodes would be represented as Loro objects. But there is no explicit documentation of atom node support, no test cases visible, and no issues filed about atom node behavior.

**Implications:** Atom node support likely works through the generic node creation path but has not been specifically validated. This is a risk for editors that rely on atom nodes (mentions, embeds, widgets).

### Finding: ProseKit provides a higher-level integration
**Confidence:** CONFIRMED
**Evidence:** ProseKit docs (mintlify.com/prosekit)

ProseKit offers a `defineLoro()` extension that wraps loro-prosemirror with:
- User presence visualization with customizable colors
- Built-in snapshot export/import for persistence
- Time travel / history navigation
- Binary update export for network sync

This is a moderate abstraction — not a full managed service, but more than raw loro-prosemirror.

### Finding: Single maintainer
**Confidence:** CONFIRMED
**Evidence:** Socket.dev analysis

"1 open source maintainer collaborating on the project" — this is a bus factor concern for production adoption.

---

## Gaps / follow-ups

- No load testing data for large documents with many concurrent editors
- Atom node behavior needs explicit testing
- No TipTap extension exists (would need custom integration)
- Document switching behavior (destroy/recreate vs rebind) not documented
