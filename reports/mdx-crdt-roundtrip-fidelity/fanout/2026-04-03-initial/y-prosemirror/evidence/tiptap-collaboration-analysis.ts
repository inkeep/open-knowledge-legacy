// SOURCE: tiptap v3 (main branch as of 2026-04-03)
// packages/extension-collaboration/src/collaboration.ts

// KEY FINDING: TipTap's @tiptap/extension-collaboration is a THIN WRAPPER
// around y-prosemirror. It does NOT add any mapping logic of its own.

// The actual Yjs binding comes from @tiptap/y-tiptap (v3.0.2), which is
// TipTap's maintained fork of y-prosemirror v1.x (NOT v2).

// What @tiptap/extension-collaboration adds:
// 1. Undo/Redo command integration (lines 123-157)
//    - Wraps y-prosemirror's undo/redo in TipTap commands
// 2. Keyboard shortcuts (Mod-z, Mod-y, Shift-Mod-z) (lines 161-167)
// 3. Content validation filter plugin (lines 225-255)
//    - Validates Y.js transactions against ProseMirror schema
//    - Emits 'contentError' event on schema violations
// 4. UndoManager lifecycle hack (lines 177-209)
//    - Workaround for https://github.com/yjs/y-prosemirror/issues/114
//    - Preserves UndoManager state across view recreation

// @tiptap/extension-collaboration-caret:
// - Pure wrapper around y-prosemirror's yCursorPlugin
// - Adds TipTap-style cursor builder and selection builder
// - Manages awareness state lifecycle

// ARCHITECTURE:
//   TipTap Editor
//     └─ @tiptap/extension-collaboration
//         └─ @tiptap/y-tiptap (fork of y-prosemirror v1.x)
//             └─ yjs (v13.x)
//                 └─ Y.XmlFragment / Y.XmlElement / Y.XmlText mapping

// There is NO separate "@tiptap/y-tiptap" repo -- it's a maintained fork
// published as an npm package. It uses the v1 XmlElement-based mapping,
// NOT the v2 delta-based mapping.

// IMPLICATION FOR OUR PROJECT:
// If we use TipTap, we get the v1 mapping via @tiptap/y-tiptap.
// If we use ProseMirror directly, we could use either v1.3.7 (stable)
// or v2.0.0 (pre-release, delta-based).
// Milkdown uses ProseMirror under the hood and could use either.
