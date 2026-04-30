---
"@inkeep/open-knowledge-app": patch
---

fix(cb-v2): return DOM focus to editor on PropPanel close

After the descriptor PropPanel popover closed via Escape (e.g. `/image` →
fill `src` → Escape), the next keystroke vanished — Radix's FocusScope
unmount restored focus to a stale `previouslyFocusedElement` (the gear
button or a now-detached slash-menu element) instead of the editor body.
The user had to click back into the editor before typing worked, breaking
the Notion-style "fill prop → Escape → continue typing" loop.

Override Radix's default close-time focus restore via `onCloseAutoFocus`
on `<PopoverContent>`, gated on self-closing-leaf descriptors so
containers (Callout/Accordion) keep the trigger-restore default. The
override runs synchronously inside Radix's `setTimeout(0)` close-tick,
beating the rAF-vs-setTimeout race the previous `editor.view.focus()`
in `handleOpenChange`'s rAF couldn't reliably win.
