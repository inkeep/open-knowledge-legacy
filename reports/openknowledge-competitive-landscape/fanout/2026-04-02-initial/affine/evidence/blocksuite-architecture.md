---
title: "BlockSuite Architecture: CRDT-Native Document Model"
type: technical-analysis
sources:
  - url: https://block-suite.com/blog/document-centric.html
    title: "Building Document-Centric, CRDT-Native Editors"
  - url: https://block-suite.com/blog/crdt-native-data-flow.html
    title: "CRDT-Native Data Flow in BlockSuite"
  - url: https://block-suite.com/guide/overview.html
    title: "BlockSuite Framework Overview"
  - url: https://block-suite.com/guide/block-schema.html
    title: "Block Schema Documentation"
  - url: https://block-suite.com/guide/data-synchronization.html
    title: "Data Synchronization Guide"
  - url: https://blocksuite.io/guide/store.html
    title: "@blocksuite/store Documentation"
  - url: https://github.com/toeverything/blocksuite
    title: "BlockSuite GitHub Repository"
date_collected: 2026-04-02
---

# BlockSuite Architecture: CRDT-Native Document Model

## Core Philosophy: Document-Centric vs. Editor-Centric

BlockSuite fundamentally shifts from editor-centric to **document-centric** design. Rather than treating editors as autonomous components managing their own state, BlockSuite maintains a persistent document layer that exists independently of UI components. This is a deliberate departure from ProseMirror and Slate, which center design around editor component hierarchies with embedded state management.

Key insight: documents function as an autonomous data layer completely decoupled from editor instances. Multiple editors can attach to the same document, or one editor can render multiple documents. When editors unmount, the document persists, preserving operation history and enabling seamless undo/redo across editor lifecycles.

## Yjs as Single Source of Truth

All state changes are recorded on a persistent `Y.Doc` object that serves as the single source of truth. This is described as "precisely a representation of the document-centric approach" since all modifications are compulsively tracked on one continuously existing document.

What Yjs provides to BlockSuite:
- **Binary serialization** comparable to protobuf format
- **Incremental updates** to partial documents
- **Granular event notifications** when tree nodes update (potentially replacing virtual DOM needs)
- **Conflict-free merging** in collaborative scenarios without requiring operation ordering

## CRDT-Native Data Flow

The reactive architecture follows this pipeline:

1. **YModel Modification**: When any update occurs (local editing, undo/redo, or remote collaboration), the system first modifies the underlying YBlock structure
2. **Y.Event Generation**: Yjs generates `Y.Event` data structures containing all incremental state changes
3. **Block Model Synchronization**: Framework uses Y.Events to update block tree model nodes (block models derive state from CRDT layer)
4. **Slot Event Propagation**: Slot events notify UI components for targeted component refresh

Critical property: Application code remains completely agnostic about update sources. Local edits, history operations, and remote changes traverse **identical code paths**. No additional modifications enable real-time multi-user editing.

## State Types

BlockSuite distinguishes between:
- **Persistent State** (block tree): Managed through CRDT with full history
- **Ephemeral State** (cursor awareness, UI metadata): Unidirectional update flows without historical overhead

## Block Model System

Documents are organized as trees of blocks. Each block connects to nodes in this tree structure, with some using `Y.Text` for rich text content. BlockSuite splits content into flat inline editor instances, each managing a linear text sequence with delta-equivalent formatting (rather than nesting complex rich text editors).

### Schema Definition

Blocks are defined via `defineBlockSchema` with:
- `flavour`: unique identifier
- `props`: data attributes (primitives, objects, arrays; `internal.Text()` for Y.Text)
- Role-based nesting: root (one per doc) -> hub (multiple children) -> content (leaf nodes)
- Parent/child validation rules with glob pattern support

### Data Types

- Primitives: strings, numbers, booleans, objects
- `internal.Text()`: Represents Y.Text from Yjs (collaborative rich text)
- No undefined/null values permitted in props

## Package Architecture

**Headless Framework:**
- `@blocksuite/store`: Data layer built on Yjs for collaborative document state modeling
- `@blocksuite/inline`: Minimal rich text components for split inline editors
- `@blocksuite/block-std`: Framework-agnostic block modeling (structure, events, selection, clipboard)

**Component Layer:**
- `@blocksuite/blocks`: Default block implementations
- `@blocksuite/presets`: Plug-and-play editors (PageEditor, EdgelessEditor) and UI fragments

## Data Persistence

"The document data stored on the server is no longer JSON, but always a binary representation of CRDT (similar to protobuf or RSC payload)."

The fundamental principle: `ui = f(data)` rather than `ui = f(data)(state)`.

Documents connect to providers (IndexedDB, WebSocket, etc.) for persistence and sync. Multiple providers can be connected simultaneously. Snapshot API exists for JSON-based export/import.

## Framework Characteristics

- All components are **native web components** (framework-agnostic)
- Uses Lit by default because web component tree IS the DOM tree
- Supports canvas-based rendering interleaved with DOM content
- "Fragments" concept: UI components operating on document state without being editor-embedded
- Explicitly rejects proprietary vendor lock-in
