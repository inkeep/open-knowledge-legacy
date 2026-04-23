---
"@inkeep/open-knowledge": patch
---

fix(cli): `ok start` banner URL now tracks the port `ok ui` actually bound.

Post-D-033 the auto-spawned `ok ui` defaults to port 0 (kernel-allocated), but the banner had hardcoded `http://localhost:3000` on the spawn branch. Users running `bun run packages/cli/dist/cli.mjs start` saw the banner URL, got connection-refused, and no documents loaded.

`bootStartServer` now polls `ui.lock` after spawn and exposes `resolvedUiPort` on `BootedStartServer`; the banner uses that, falling back to the API URL on timeout. `bun run dev` is unaffected (Vite serves everything same-origin on one port).
