---
oq_refs: [OQ3]
decisions: [D10, D12]
sources: [packages/cli/src/commands/editors.ts:161, packages/cli/src/commands/init.ts:568, packages/cli/src/commands/init.test.ts:1219]
captured: 2026-04-24
---

# Evidence: Claude Desktop detection already exists in the codebase

**Captured:** 2026-04-24

## Finding

Claude Desktop detection is already implemented in `packages/cli/src/commands/editors.ts`:

- `EditorId = 'claude' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex'`
- `resolveClaudeDesktopConfigPath({ home })` returns the config path OR throws on unsupported platforms with: `"Claude Desktop is not available on linux. Supported: macOS, Windows."`
- `EDITOR_TARGETS['claude-desktop'].detectPath(cwd, home)` returns the parent dir of the config path (`~/Library/Application Support/Claude/` on macOS; `%APPDATA%\Claude\` on Windows).
- Test fixture at `init.test.ts:1219` — "detects Claude Desktop when its config directory exists."

## Implication for D10 (OS coverage) + D12 (reuse existing detection)

- **Linux is out of scope upstream** — Anthropic doesn't ship Claude Desktop for Linux. User's chosen option B ("macOS + Windows + Linux") expected this; in practice Linux is a no-op that would light up automatically if Anthropic ever ships a Linux build.
- **Reuse `EDITOR_TARGETS['claude-desktop'].detectPath(...)` directly.** No new detection code. The Desktop hint is emitted when that path exists.
- No-platform handling: on Linux, `resolveClaudeDesktopConfigPath` throws; the init code path already handles that with a "skipped-missing" action — the new hint code must catch the throw (not surface the error, since it's normal-state) and simply skip the hint.

## Proposed call shape in init.ts

```typescript
import { existsSync } from 'node:fs';
import { EDITOR_TARGETS } from './editors.ts';

function claudeDesktopInstalled(home: string): boolean {
  try {
    const configDir = EDITOR_TARGETS['claude-desktop'].detectPath(cwd, home);
    return existsSync(configDir);
  } catch {
    // Unsupported platform (Linux today) — no Claude Desktop.
    return false;
  }
}
```

Emit the hint line only when `claudeDesktopInstalled(home)` is true.
