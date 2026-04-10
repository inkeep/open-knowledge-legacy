---
type: evidence
source: GitHub issues for BitPhinix/slate-yjs
date: 2026-04-03
issues_reviewed: 50 (all issues, 20 currently open)
---

# Known Issues Evidence

## Project Status

Last commit: 2023-07-17 (nearly 3 years ago as of April 2026)
Version: @slate-yjs/core@1.0.2
20 open issues, no maintainer activity since mid-2023.

## Critical / High-Severity Open Issues

### #390: applyRemoteEvents breaks on text and inline void combination
- **Severity**: HIGH - data corruption on remote sync
- **Problem**: When a YEvent adds both text and an inline void node simultaneously,
  the Slate->Yjs translation generates an invalid insert_text operation. The insert_text
  targets a path that's no longer a text node because an insert_node for the inline void
  was applied first.
- **Impact for MDX**: MDX components as inline voids mixed with text content will hit this.
- **Workaround**: Flushing changes between edits (but breaks when Yjs updates are merged).
- **Status**: OPEN, no fix since May 2023.

### #391: applySlateOp doesn't properly adjust indices for move_node operations
- **Severity**: MEDIUM - incorrect document state after move operations
- **Problem**: When moving a node forward within the same parent, the Yjs offset
  calculation doesn't account for the deletion that happens before the insertion.
- **Impact for MDX**: Reordering MDX components or moving content between them.
- **Status**: OPEN, no fix since May 2023.

### #332: withYHistory undo removes blocks with remote changes
- **Severity**: MEDIUM - data loss during undo
- **Problem**: Undoing a locally-created block also removes remote changes made to it.
  The undo system doesn't distinguish remote vs local changes within the same block.
- **Impact for MDX**: Undoing component creation could lose collaborator's edits.
- **Status**: OPEN since April 2022.

### #386: Cannot read properties of null (reading 'parent') during flushLocalChanges
- **Severity**: HIGH - crash during normal editing
- **Problem**: Race condition where the Y.XmlText loses its parent reference during
  local change flushing.
- **Status**: OPEN since February 2023.

### #382: Content duplication in Slate-Yjs offline syncing
- **Severity**: HIGH - data integrity
- **Problem**: When using offline persistence (y-indexeddb), content duplicates on
  server restart or reconnection.
- **Status**: OPEN since January 2023.

### #379: Undo after replacing selected text with mark brings back mark incorrectly
- **Severity**: MEDIUM - undo/redo correctness
- **Problem**: Undo restores marks incorrectly and throws exceptions afterward.
- **Status**: OPEN since November 2022.

## Resolved Issues Relevant to Custom Nodes

### #417: Path doesn't match yText on 'false' attribute values (CLOSED)
- **Root cause**: Yjs strips falsy attribute values (false, "", 0) during text insertion,
  causing delta normalization mismatches.
- **Resolution**: Fixed in Yjs 13.6.14 (Yjs now preserves falsy values).
- **Impact for MDX**: MDX component props with boolean false values (e.g., `hidden: false`)
  would have triggered this bug on older Yjs versions.

### #394: Path doesn't match yText, yTarget spans multiple nodes (CLOSED)
- Related to the attribute normalization issue above.

## Patterns in Open Issues

1. **Inline void nodes are problematic** (#390, #401, #348) - Multiple issues around
   inline elements that are void or have mixed content.

2. **Offline/reconnection data integrity** (#382, #420, #385) - Content duplication
   when reconnecting or restarting servers.

3. **Undo/redo with collaboration** (#332, #379) - The undo system doesn't properly
   handle the boundary between local and remote changes.

4. **Position resolution bugs** (#299, #348, #401) - RelativePosition and
   AbsolutePosition conversion has edge cases with inline elements.

## Abandonment Risk

The repository has had no maintainer commits since July 2023. 20 issues remain open,
some with confirmed bugs and no responses. This represents a significant risk for
production use.
