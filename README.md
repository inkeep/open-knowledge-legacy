# Open Knowledge

Bun monorepo -- CRDT collaboration editor with bidirectional observer sync, packaged as `@inkeep/open-knowledge` CLI.

## Monorepo structure

| Package | Name | Description |
|---------|------|-------------|
| `packages/core` | `@inkeep/open-knowledge-core` | Shared extensions, types, registry, utils (browser + Node) |
| `packages/server` | `@inkeep/open-knowledge-server` | Hocuspocus CRDT server library (persistence, file-watcher, agent sessions, HTTP API) |
| `packages/cli` | `@inkeep/open-knowledge` | Published CLI + MCP stdio server |
| `packages/app` | (private) | React editor frontend (TipTap WYSIWYG + CodeMirror source mode) |
| `docs/` | (private) | Next.js docs site (Fumadocs) |

## Quick start

```bash
bun install
cd packages/app && bun run dev
```

This starts the Vite dev server with embedded Hocuspocus on port 5173.

## Quality gates

```bash
bun run check       # Full gate: typecheck + lint + test (all packages via turbo)
bun run check:fast  # Typecheck + lint only (skips tests)
bun run format      # Auto-fix lint + format + imports (biome)
```

## Build

```bash
bun run build            # Build all packages via turbo
bun run build-registry   # Regenerate component manifest from built-ins + .d.ts extraction
bun run drift-check      # Verify generated components.ts matches built-ins (CI gate)
```

## Editor architecture

```
Y.Doc
+-- Y.XmlFragment('default')  <-- TipTap binds here
+-- Y.Text('source')          <-- CodeMirror binds here via y-codemirror.next
+-- Y.Map('metadata')         <-- frontmatter cache
+-- Y.Map('activity')         <-- agent write attribution side-channel

Observer A: XmlFragment -> Text (incremental diff)
Observer B: Text -> XmlFragment (parse + updateYFragment)
```

## Component registry

21 built-in component entries across 15 families (Callout, Tabs, Card, Steps, Accordion, ImageZoom, Files, TypeTable, Banner, InlineTOC, Video, Frame, CodeGroup, Mermaid, Audio). Props auto-extracted from TypeScript declarations via react-docgen-typescript.

```bash
bun run build-registry   # Regenerate packages/core/src/generated/components.ts
```

## CLI usage

```bash
npx @inkeep/open-knowledge start   # Start server + editor
npx @inkeep/open-knowledge mcp     # Start MCP stdio server
```

## Testing

```bash
bun run test                            # Unit tests across workspace
cd packages/app && bunx playwright test # E2E tests (requires dev server)
```

## Further reading

- [AGENTS.md](AGENTS.md) -- Detailed conventions for AI coding agents
- [ARCHITECTURE.md](ARCHITECTURE.md) -- System design and data flow
- [STORIES.md](STORIES.md) -- User stories and workstream status

## License

See [LICENSE](LICENSE) for details.
