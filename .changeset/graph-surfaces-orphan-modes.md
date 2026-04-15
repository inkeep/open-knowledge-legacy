---
"@inkeep/open-knowledge": minor
---

Finish the fullscreen graph surfaces by adding `Orphans` and `Hubs` views inside `GraphPanel`, with a visible orphan-mode toggle for `No Incoming`, `No Outgoing`, and `Both`.

The `get_orphans` MCP tool and the backing server API now share the same three-mode orphan contract, so agents can query disconnected pages by graph lens instead of only the default fully-disconnected view.
