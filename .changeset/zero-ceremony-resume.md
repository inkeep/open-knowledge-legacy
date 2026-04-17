---
"@inkeep/open-knowledge": minor
---

feat: Zero-Ceremony Resume — dual-process lifecycle + MCP auto-spawn

Behavior changes operators should know about:

- **`ok mcp` auto-spawns `ok start` by default.** When `ok mcp` starts with no
  live `server.lock`, it detach-spawns the current `@inkeep/open-knowledge`
  binary with `start` as a sibling process (re-exec via `process.execPath` —
  not `npx`, so the sibling is pinned to the same version the MCP client is
  running). Opt out via the `OK_MCP_AUTOSTART=0` env var or
  `mcp.autoStart: false` config. A pre-existing live lock is always connected
  regardless of the opt-out (opt-out only suppresses the spawn path).
- **`server.port` default changed from `3000` to `0`.** `ok start` now asks
  the kernel for a free port by default; the resolved port is written to
  `server.lock` for MCP discovery. To keep the old behavior, set
  `server.port: 3000` in `.open-knowledge/config.yml` or pass `--port 3000`.
- **New `ok ui` command.** The React editor now runs in its own sibling
  process (default port 3000; respects `PORT` env / `--port`). `ok start`
  auto-spawns it when `ui.lock` is absent. A `GET /api/config` endpoint on
  `ok ui` bootstraps the React app's HocuspocusProvider with the live
  collab URL read from `server.lock`.
- **New utility commands:** `ok status`, `ok stop`, `ok clean`.
- **`ok init` defaults changed.** Non-TTY invocations now write MCP config
  for every detected editor (Claude, Cursor, VS Code, Windsurf) — previously
  only Claude. TTY pre-selects all detected editors. `--editor <all|claude|...>`
  preserved.
- **`.claude/launch.json` scaffolding updated.** Entry now launches
  `@inkeep/open-knowledge ui` (not `start`) with `autoPort: true`. Existing
  entries from earlier versions are detected as stale and flagged with a
  WARN pointing at `ok init --force`.

See `docs/content/internals/lifecycle.mdx` and `docs/content/guides/mcp-integration.mdx`
for the full lifecycle reference.
