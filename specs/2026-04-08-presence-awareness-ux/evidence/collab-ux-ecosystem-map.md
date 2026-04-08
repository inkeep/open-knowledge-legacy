---
title: Collaboration UX Ecosystem Map
type: prior-art-survey
sources:
  - reports/multiplayer-editor-networking-topology/
  - reports/source-of-truth-persistence-collaboration/
  - reports/ai-coding-agent-tool-surfaces/
  - reports/yjs-constrained-observer-sync/
  - reports/visual-editor-interaction-patterns/
  - web search (2025-2026)
---

# Collaboration UX Ecosystem Map

## Prior art: AI as collaborator in production editors

| Product | AI edit UX | Presence model | Approach |
|---|---|---|---|
| Cursor IDE | Separate tab/pane for agent work | No AI cursor in editor | Isolation |
| GitHub Copilot | Ghost text (dimmed inline suggestion) | Suggestion engine, not collaborator | Suggestion |
| Notion AI | Inline streaming + "Nosy" character | No cursor; modal inline insertion | Streaming |
| Google Docs/Gemini | Side panel or draft suggestion | Tool, not collaborator | Isolation |
| Figma AI | MCP-based canvas agents (2026) | No "AI cursor" yet | Emerging |
| Liveblocks AI Copilots | Diff overlay with accept/reject | REST-based ephemeral presence (setPresence API) | Diff review |
| Replit | Agent works in isolated copies | Task isolation | Isolation |

**Key finding:** No production editor shows AI as a first-class real-time collaborator with a cursor. Liveblocks is closest with REST-based presence + diff overlay. Industry consensus: isolation over transparent merge.

## Liveblocks AI Copilots details

- Four form factors: AiToolbar (selection-scoped), AiChat (sidebar), Live Cursors for AI, Comments with AI mentions
- AI does NOT type character-by-character — outputs complete document, diffing engine computes changes
- setPresence() REST API: ephemeral presence with TTL, broadcasts to all connected users
- Framework Agents (private beta): webhook-based room participation
- Accept/reject UX: read-only diff overlay, private to requesting user

## TipTap collaboration ecosystem

- @tiptap/extension-collaboration-cursor: render function receives user attrs, returns DOM. Full customization.
- TipTap Cloud vs OSS: cursor/presence is fully OSS via Hocuspocus self-hosting
- 2026 roadmap: "AI Toolkit" + "Server AI Toolkit" for agent document access
- Tiptap Edit format: small precise edits without full document replacement
- Tiptap Shorthand: token-efficient encoding reducing costs 80%

## y-codemirror.next awareness

- CSS classes: .cm-ySelection, .cm-ySelectionCaret, .cm-ySelectionCaretDot, .cm-ySelectionInfo
- YRemoteCaretWidget: span with zero-width space + dot + info label
- Default color: #30bced, selection alpha: 33
- All decorations rebuilt on every update (not incrementally mapped)
- State shape: reads state.user.color and state.user.name from awareness

## Yjs awareness protocol

- Events: 'update' (heartbeat), 'change' (state add/update/remove)
- 30s timeout for remote clients; local state auto-renews every 15s
- Schemaless JSON state: any key-value data
- One awareness per provider/Y.Doc pair

## Decoration patterns

### ProseMirror (flash-then-fade):
Plugin with DecorationSet state → Decoration.inline on detect → setTimeout removal → CSS transition

### CodeMirror 6 (flash-then-fade):
StateEffect.define → StateField with DecorationSet → Decoration.mark/line → setTimeout removal

## NPM packages for collaboration UX

- No standalone OSS React components for presence avatars in Yjs ecosystem
- Liveblocks react-ui: AvatarStack, Cursors (closed SaaS)
- Velt: 25+ collab components (closed SaaS)
- @manuscripts/track-changes-plugin: ProseMirror insertions/deletions
- tiptap-track-change-extension: TipTap wrapper
- @tiptap/extension-tracked-changes: official, with SnapshotCompare
- prosemirror-changeset: diff computation (not visual)
- No origin-based attribution package exists — must build custom

## PADLOCK study (CHI 2024)

- 13/14 participants failed to identify concurrent conflict results
- All 14 chose isolation when offered
- Estimated conflict frequency for our use case: low (agent processing window 5-30s)
