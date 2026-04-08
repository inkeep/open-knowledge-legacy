# @inkeep/open-knowledge-core

Shared extensions, types, constants, and pure utility functions used by both server and app packages. **No React or Node.js server dependencies** — browser + Node compatible.

## Commands

```bash
bun test           # Run unit tests (54 tests)
bunx tsc --noEmit  # Typecheck
```

## Architecture

Single source of truth for the TipTap document schema:

- `extensions/shared.ts` — sharedExtensions array (JsxComponent, StarterKit, Table, Image, TaskList)
- `extensions/frontmatter.ts` — strip/prepend frontmatter for markdown round-trip
- `extensions/jsx-component.ts` — JsxComponent TipTap extension (schema + markdown, no React NodeView)
- `extensions/jsx-tokenizer.ts` — JSX block tokenizer for marked (versions A/B/C)

## Key Constraints

- **No React** — the app package extends JsxComponent with `addNodeView()` for the React NodeView
- **No server deps** — no @hocuspocus/server, @parcel/watcher, ws, simple-git
- `sharedExtensions` MUST stay in sync between core, server, and app — drift causes silent data corruption

## Key Files

- `src/extensions/shared.ts` — THE schema source of truth
- `src/types/awareness.ts` — AwarenessState, AwarenessUser, ActivityEntry
- `src/types/identity.ts` — Identity interface
- `src/constants/activity.ts` — Flash timing constants (FLASH_DURATION_MS, etc.) + eviction utils
- `src/utils/identity.ts` — getIdentity, generateRandomName, generateRandomColor
- `src/index.ts` — barrel export of all public API
