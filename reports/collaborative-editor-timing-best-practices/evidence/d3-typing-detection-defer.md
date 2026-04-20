# Evidence: Typing Detection and Defer Windows

**Dimension:** D3 — Typing detection and defer windows
**Date:** 2026-04-16
**Sources:** CodeMirror 6/ProseMirror/TipTap source code, IME handling specs, VS Code settings

---

## Editor internal timing values

| Editor | Typing Debounce | IME Composition Delay | Notes |
|--------|----------------|----------------------|-------|
| CodeMirror 6 | 0ms (synchronous per tx) | 20ms (compositionend) | No internal typing debounce |
| ProseMirror | 0ms (synchronous per tx) | 50ms (compositionend finish) | 200ms scheduleDOMUpdate fallback |
| TipTap | 0ms (inherits PM) | Inherits PM | BubbleMenu resize: 100ms |
| Slate.js | 0ms (microtask batch) | — | Operations batched within single event-loop tick |
| Draft.js | 0ms (React synthetic) | Blocks during composition | No configurable debounce |

## VS Code typing-related debounces

| Setting | Default | Purpose |
|---------|---------|---------|
| editor.quickSuggestionsDelay | 10ms | Autocomplete trigger delay |
| editor.hover.delay | 300ms | Hover information delay |
| editor.cursorBlinking | 530ms on/off | Cursor blink rate |

## IME composition timing

| Browser | compositionend behavior | Safety margin |
|---------|------------------------|---------------|
| Firefox | Fires 10-20ms before Enter keydown | 50ms buffer |
| CodeMirror 6 | 20ms setTimeout defer | Cross-browser |
| ProseMirror | 50ms setTimeout defer | Cross-browser |

## "User is typing" detection

| System | Mechanism | Timeout |
|--------|-----------|---------|
| Liveblocks | WebSocket presence throttle | 100ms default |
| Figma | Cursor update throttle | ~50ms (30 FPS) |
| Yjs Awareness | State change broadcast | Immediate (30s heartbeat) |

## Recommended debounce by use case (industry consensus)

| Use Case | Value | Source |
|----------|-------|--------|
| Inline validation | 250ms | Industry pattern |
| Search autocomplete | 300-500ms | RxJS debounceTime convention |
| Auto-save / complex ops | 750-1000ms | Industry pattern |
| Persistence to backend | 2000ms | Hocuspocus default |
| "User stopped typing" | 300ms | Average IKI at 50 WPM is 240ms |

Sources: CodeMirror view/src/input.ts, ProseMirror reference docs, VS Code IntelliSense docs, Liveblocks docs
