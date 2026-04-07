---
title: Verified package versions for spike stack
type: evidence
sources:
  - npm registry (verified 2026-04-07)
verified: 2026-04-07
---

# Verified Package Versions

## TipTap v3
| Package | Version | Purpose |
|---|---|---|
| @tiptap/core | 3.22.2 | Core editor |
| @tiptap/react | 3.22.2 | React bindings + node views |
| @tiptap/pm | 3.22.2 | ProseMirror peer deps |
| @tiptap/starter-kit | 3.20.3 | Headings, lists, code blocks, bold, italic, blockquotes |
| @tiptap/extension-link | 3.21.0 | Link extension |
| @tiptap/extension-table | 3.20.5 | Table support |
| @tiptap/extension-collaboration | 3.20.3 | Yjs collaboration binding |
| @tiptap/extension-collaboration-cursor | 3.20.3 | Cursor presence |
| @tiptap/y-tiptap | 3.0.2 | TipTap-specific y-prosemirror fork |
| @tiptap/markdown | 3.22.1 | Bidirectional markdown (uses marked) |

## Hocuspocus
| Package | Version |
|---|---|
| @hocuspocus/server | 3.4.4 |
| @hocuspocus/provider | 3.4.4 |

## Yjs + CodeMirror
| Package | Version | Notes |
|---|---|---|
| yjs | 13.6.30 | |
| y-codemirror.next | 0.3.5 | For CodeMirror 6 |

**CodeMirror caveat:** CM packages don't declare peerDependencies — duplicate @codemirror/view installs silently break Yjs sync (instanceof checks fail). Enforce single copy via overrides/resolutions.

## Git
| Package | Version |
|---|---|
| simple-git | 3.35.2 |

## Key findings
- TipTap v3 uses @tiptap/y-tiptap (NOT y-prosemirror directly) — resolved the v2 peer dep conflicts
- @hocuspocus/provider feeds Y.Doc into @tiptap/extension-collaboration; no separate ProseMirror binding needed
- Hocuspocus v2+ NOT compatible with generic y-websocket providers (custom multiplexing protocol)
