---
name: Current CLI output patterns
description: How the CLI currently formats terminal output — all plain text, no colors
type: evidence
sources:
  - packages/cli/src/commands/start.ts
  - packages/cli/src/commands/mcp.ts
  - packages/cli/src/mcp/server.ts
  - packages/cli/src/mcp/tools.ts
  - packages/cli/src/cli.ts
---

## Startup banner (start.ts:125-137)
```
  open-knowledge v0.0.1

  Local:   http://localhost:3000
  Network: http://0.0.0.0:3000

  Press Ctrl+C to stop
```
Plain console.log with 2-space indent. No colors, no box, no styling.

## Error output (start.ts:28-38)
```typescript
console.error(`\n  Error: Content directory not found: ${contentDir}\n`);
// Then conditional help text also via console.error
```

## Shutdown (start.ts:57)
```typescript
console.log('\nShutting down...');
```

## Static asset serving (start.ts:73)
```typescript
console.log(`[start] Serving static assets from ${assetDir}`);
```

## MCP diagnostics (mcp/server.ts:17-18, tools.ts:17-19)
```typescript
function log(msg: string): void {
  process.stderr.write(`[mcp] ${msg}\n`);
}
```
Correctly routed to stderr. Tool operations logged with prefix.

## Commander setup (cli.ts)
- `--log-level <level>` flag exists (default: 'info') but is NOT wired to anything
- `--cwd <path>` works

## Patterns
- All logs use `[module-name]` bracket prefix convention
- 2-space indentation for startup banner
- Empty lines for visual separation
- No structured error formatting beyond indentation
- No color awareness whatsoever
