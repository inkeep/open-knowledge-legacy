---
"@inkeep/open-knowledge-desktop": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
"@inkeep/open-knowledge": minor
---

feat(desktop): Electron desktop M1 — native macOS app with persistent Navigator launcher, per-project editor windows, and attach-to-existing-server.

New private package `@inkeep/open-knowledge-desktop` launches Open Knowledge as a native macOS Electron app (dev loop only — signing, notarization, DMG, auto-update, URL scheme, keyring, MCP wiring, CLI-on-PATH menu are M2–M7). `bun run dev --filter=@inkeep/open-knowledge-desktop` opens a Navigator window with three cards (Clone from GitHub, Open folder on disk, Start fresh) + Recent list; every project pick spawns a new editor window per D3/D24 revised (no switch-in-place).

Process model: one BrowserWindow ↔ one `utilityProcess.fork` ↔ one `createServer` ↔ one `contentDir` (D6), with a second branch that attaches to a live same-host `server.lock` instead of colliding — so a running `npx open-knowledge start` CLI and the desktop app cooperate on the same project. Typed IPC channel map (D14), hand-rolled preload bridge with contextBridge listener wrappers (D38 + electron/electron#33328), `utilityProcess.fork` with `windowLifecycleBound: true` (D39), macOS poll-based parent-death detection (D49), `shell.openExternal` scheme allowlist (D47), sandbox-compatible CommonJS preload.

Server + core refactors that landed alongside:

- `@inkeep/open-knowledge-server` exports `bootServer(opts)` — the shared wrapper that composes `createServer()` + HTTP listener + server-lock port-write + optional `ok ui` sibling + idle-shutdown. CLI's `ok start` is now a thin wrapper over it; Electron's utility process calls it with `{ attachUiSibling: false, idleShutdownMs: null }`. Also emits permissive CORS headers for `/api/*` so cross-origin renderer fetches (Electron dev server → utility process) work.
- `@inkeep/open-knowledge-core` gains `OK_DIR` (moved from CLI) and the canonical `OkDesktopBridge` interface.
- `@inkeep/open-knowledge-app` ships `NavigatorApp.tsx` (Electron-only launcher), `WorkspaceSwitcher.tsx`, `CommandPalette.tsx` (Cmd+K), and `desktop-fetch.ts` — a renderer-side `/api/*` fetch rewriter that targets `window.okDesktop.config.apiOrigin` when present. `useCollabUrl` short-circuits on the same bridge config in Electron.
- `@inkeep/open-knowledge` (CLI) is unchanged externally; internally `bootStartServer` delegates to `bootServer`.

Web and CLI distributions are unaffected — `window.okDesktop` is undefined outside Electron, and every desktop-specific surface is gated on it.

Full spec + decision log (D1–D52): `specs/2026-04-11-electron-desktop-app/SPEC.md`.
