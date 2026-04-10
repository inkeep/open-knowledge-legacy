---
name: Ink render lifecycle for one-shot banner
description: How Ink renders once and releases the terminal — unmount pattern, Static, lazy loading
type: evidence
sources:
  - github.com/vadimdemedes/ink readme
---

## One-shot render pattern

Ink stays alive only while there's active event loop work (timers, promises, useInput). If the component tree has no async work, **the app renders once and exits immediately**.

For explicit control:
```typescript
const { unmount } = render(<Banner />);
// Banner renders to terminal
unmount(); // Release terminal control
// Back to normal console.log output
```

## render() return value
- `rerender(tree)` — update component tree
- `unmount()` — stop rendering, release terminal
- `waitUntilExit()` — pause until app terminates
- `waitUntilRenderFlush()` — wait for render completion
- `cleanup()` — clean up resources
- `clear()` — clear terminal output

## <Static> component
Renders content that persists (not re-rendered). Takes `items` array + `children(item)` render function. Useful for log-like output within an Ink app.

## stdout/stderr hooks
- `useStdout()` — write to stdout
- `useStderr()` — write to stderr
Each has `write(data)` for direct stream access.

## Architecture for open-knowledge CLI

### Recommended pattern: render → unmount → console
1. `start` command: dynamically import Ink → render `<StartupBanner />` → unmount() → server runs with picocolors-colored console.log
2. `mcp` command: never imports Ink → uses picocolors for stderr diagnostics only

### Why dynamic import matters
tsdown bundles to a single file. If Ink is statically imported, it loads even for `mcp` command (wasted ~100ms + potential stdout pollution). Dynamic import inside start action avoids this:
```typescript
// In start command action:
const { render } = await import('ink');
```

### --no-color propagation
picocolors and chalk both read NO_COLOR at import time. Set env var before any imports:
```typescript
// cli.ts — very first lines, before any imports that use colors
if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
}
```
Since Ink is dynamically imported after Commander parses, chalk will see NO_COLOR by the time it loads.
