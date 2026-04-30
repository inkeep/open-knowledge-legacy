---
name: architectural_pivot_hocuspocus
description: Architectural pivot from HTTP-centric `applyConfigPatch` to Hocuspocus Y.Text-as-transport for config files — captures what the existing spec's decisions become under the new direction
type: evidence
date: 2026-04-28
sources:
  - "session: 2026-04-28 release-pivot intake"
  - "specs/2026-04-25-config-edit-paths/SPEC.md (existing decisions D1-D38, FR-1 through FR-28)"
  - "packages/server/src/server-observers.ts (markdown-bridge boundary)"
  - "packages/server/src/cc1-broadcast.ts (system-doc gate)"
  - "packages/server/src/content-filter.ts (doc admission)"
  - "packages/cli/src/auth/token-store.ts (auth.yml is for secrets only)"
  - "packages/app/src/server/api-config-handler.ts (existing /api/config is dev-port-probe, unrelated)"
---

# Architectural pivot — Hocuspocus as config transport

## The pivot in one sentence

Drop the HTTP `POST /api/config/patch` endpoint and `applyConfigPatch` server primitive; admit `config.yml` (workspace + user-global) as Y.Text-only Hocuspocus docs; let the Modal Settings UI bind to those docs over the existing collab WS; let MCP tools and CLI write the file directly with imported schema validation.

## Why the existing spec went HTTP-first

The existing spec (D1–D38, FR-1 through FR-28) treats config edits as a backend concern with three frontend consumers. `applyConfigPatch` lives server-side; consumers (Modal in Electron, Modal in browser, MCP, CLI) each marshal a patch payload and POST it. That gave us a clean validation boundary, structured error envelopes (D14, D30), PATCH dialect (D31), two-validator pattern (D32), and ETag concurrency (D33).

The cost: ~50 routes refactored to a unified `ApiError` envelope, a new file watcher emitting CC1 'config' broadcasts, a new HTTP route gated by `checkLocalOpSecurity`, and roughly the entire mutation/error/concurrency machinery reinvented for config when the editor pipeline already has equivalents.

## What the existing NG2 actually ruled out

NG2 reads:
> Routing config edits through the CRDT layer. Config is per-machine local state, not collaborative content. The Y.Doc bridge is for content; config has different semantics (no merge, no awareness, no presence).

The phrase "the Y.Doc bridge" is doing the load-bearing work. The bridge is `packages/server/src/server-observers.ts` — the markdown-specific Y.XmlFragment ↔ Y.Text observer pair using `@tiptap/y-tiptap`'s `yXmlFragmentToProseMirrorRootNode` and `updateYFragment`. It is not engaged for docs that don't have a Y.XmlFragment binding.

A Y.Text-only doc:
- never engages the bridge (no XmlFragment to sync to)
- can suppress awareness/presence rendering (awareness state still exists at the WS layer; the editor just doesn't render it)
- has implicit CRDT merge on Y.Text writes — acceptable for per-machine config where concurrent same-field writes are vanishingly rare

So NG2's reasoning is salvageable. Reframed in Step 3 as:
> NG2 (revised): NEVER engage the markdown observer bridge for config docs; NEVER render awareness/presence in the Settings UI. The Y.Text transport layer of Hocuspocus is in scope; the markdown CRDT semantics are not.

## Architecture under the pivot

```
                                config.yml on disk (canonical)
                                         ↑↓
File watcher  ────→  Hocuspocus Y.Doc('<path>/config.yml') with Y.Text only
                                                   ↑↓ (collab WS)
                                       Modal Settings UI (Electron OR browser)
                                       imports ConfigSchema from @inkeep/open-knowledge-core
                                       parses Y.Text → yaml.parseDocument → schema.parse → form state
                                       Zod walker renders form
                                       field commit → mutate AST → re-serialize → Y.Text replace
                                       client-side validation blocks invalid commits
                                       Y.Text observer → re-render on any external change

MCP set_config tool (stdio process)
        ↓ atomic fs write of validated YAML
        ↓
File watcher detects → Y.Text update → all open Modals refresh

CLI ok config validate / migrate
        ↓ atomic fs write
        ↓
File watcher → Y.Text update → live UIs refresh

Server boot's loadConfig()
        ↓ one-shot fs read at boot, unchanged
```

The "config API" reduces to:
1. `ConfigSchema` exported from `@inkeep/open-knowledge-core` (not server)
2. A Zod walker in `packages/app` that walks the schema and renders form fields
3. A persistence-time validation hook server-side (defense-in-depth)
4. Two doc-admission entries (workspace config.yml, user-global config.yml as synthetic doc)
5. A bridge-bypass mechanism for non-markdown docs

There is no backend service to design.

## Existing decisions — fate map

| Decision | Status | Reason |
|---|---|---|
| **D1** Storage stays YAML on disk; yaml@2 Document layer | KEEPS | Same |
| **D2** Zod schema is single source of truth | KEEPS — and gets *more* central | Schema is now the wire contract |
| **D3** Single MCP `set_config` upsert tool | KEEPS | MCP tool count unchanged |
| **D4** Custom shadcn form walking Zod | KEEPS — and now does authoritative validation | |
| **D5** All writers funnel through `applyConfigPatch` | RESHAPES | `applyConfigPatch` becomes a frontend lib (`bindConfigDoc(provider)`-equivalent) + atomic-write helpers used by MCP/CLI/seed |
| **D6** CC1 'config' channel | DROPS | Y.Text observer IS the channel |
| **D7** Modal UI shape: shadcn Dialog | KEEPS | |
| **D8** Auto-save with per-control commit | KEEPS | |
| **D9** Per-field reset to default | KEEPS | |
| **D10** Block writes while invalid | KEEPS — now authoritative, not defense-in-depth | |
| **D11** Scope: workspace + user-global both via Modal | KEEPS | |
| **D12** Bundle Tier 1 (SchemaStore + magic-comment + `ok config validate`) | KEEPS | Independent track, ships orthogonally |
| **D13** CLI command name `ok config validate` | KEEPS | |
| **D14** Error shape contract `ApiError` discriminated union | SHRINKS or DROPS | No HTTP/MCP envelopes to carry; CLI errors stay; in-process functions return `Result<T, E>` |
| **D15** `runConfigValidation()` lives in server | RELOCATES to `@inkeep/open-knowledge-core` | Schema lives there now |
| **D16** Settings entry hidden in Electron Navigator window | KEEPS | |
| **D17** HTTP endpoints behind `checkLocalOpSecurity` | DROPS | No endpoints |
| **D18** New file watcher for config.yml | KEEPS — but its job is "update Y.Text," same path as content files | |
| **D19** Zod walker uses `_zod` introspection | KEEPS | |
| **D20** `appearance.{theme, editorModeDefault}` in config.yml | KEEPS — confirmed user-config by user | |
| **D21** Settings entry points (4) | KEEPS | |
| **D22** Settings UI surfaces Install in Claude Desktop | KEEPS | |
| **D23** Config-edit handlers EXEMPT from `extractAgentIdentity` | RESHAPES | No HTTP handlers; the equivalent is "MCP tools that write config don't carry agent identity into the file" |
| **D24** Settings Modal long-form layout | KEEPS | |
| **D25** Per-field `defaultScope` Zod metadata | EVOLVES | Becomes `scope: 'user' \| 'workspace' \| 'either'` constraint, not just inference hint. Walker + loader enforce. |
| **D26** Agent-settable allowlist via `.meta({agentSettable})` | KEEPS | MCP tool reads this metadata before fs write |
| **D27** Defer `.local.yml` to Future Work | KEEPS | Still no field needs a 3rd tier |
| **D28** (skipped) | — | — |
| **D29** Schema cleanup — drop 10 fields, add 2 | KEEPS | Independent of transport choice |
| **D30** Single canonical `ApiError` envelope across ~50 routes | DROPS | No new HTTP routes; existing routes are out of scope for this spec now |
| **D31** RFC 7396 PATCH dialect | DROPS | No PATCH wire format |
| **D32** Two-validator pattern (patch + merged doc) | SHRINKS | Single `safeParse` of merged doc before Y.Text replace; no patch-payload validation since the patch IS the merged doc |
| **D33** ETag/If-Match concurrency control | DROPS | Replaced by CRDT semantics + persistence-time validation; per-machine context makes lost-update vanishingly rare |
| **D34** `z.looseObject` for forward-compat | KEEPS | Same forgiveness rationale |
| **D35** `Result<T, E>` at function boundary | KEEPS | Now an in-process function ergonomics call |
| **D36** Source-located error messages | KEEPS | Loader + Modal both benefit |
| **D37** `ok config migrate` codemod | KEEPS | CLI subcommand |
| **D38** `applyFolderRulesUpsert` HTTP+MCP+helper | SHRINKS | Folder upsert is "mutate AST, re-serialize, Y.Text replace" — the always-array shape stays for the MCP tool, but the HTTP route drops |

## New decisions emerging from the pivot

(These will be formalized as D39+ in Step 5; listed here for worldmodel + framing input.)

- **D39 (proposed):** Admit `<contentDir>/.open-knowledge/config.yml` as a Y.Text-only Hocuspocus doc with synthetic name; bypass content filter for this well-known path.
- **D40 (proposed):** Admit `~/.open-knowledge/config.yml` as a synthetic Y.Doc `__user__/config.yml` per server instance; cross-process fan-out via per-instance file watcher (atomic tmp+rename gives convergence).
- **D41 (proposed):** Per-doc bridge bypass — markdown observer bridge runs only for `.md`/`.mdx` admitted content, never for system or config docs.
- **D42 (proposed):** Persistence-time validation hook for config docs — pre-write `yaml.parse + ConfigSchema.safeParse`; on failure, reject persistence + revert Y.Text to last-known-good (defense-in-depth against buggy clients).
- **D43 (proposed):** Scope-as-constraint Zod metadata — `scope: 'user' | 'workspace' | 'either'`, default `'either'` for unspecified fields. Walker disables fields in illegal scope tabs; loader rejects fields placed at illegal scope with source-located error.
- **D44 (proposed):** `ConfigSchema` migrates from `@inkeep/open-knowledge-server` to `@inkeep/open-knowledge-core` so it's reachable in client bundles. Validation imports collapse to one path.

## What this changes for personas

- **P1 Electron user:** Modal binds to Hocuspocus via the existing utility-process IPC bridge → WS connection. Same as binding to a markdown doc. Identical UX.
- **P2 Web/`ok ui` user:** Modal binds to Hocuspocus directly over WS. **No HTTP layer needed for browser parity.** This was the load-bearing question that drove the pivot — the answer is "browser already speaks Hocuspocus, reuse it."
- **P3 IDE-savvy developer:** Unchanged — Tier 1 (SchemaStore + magic-comment + `ok config validate`) ships orthogonally.
- **P4 AI agent (MCP client):** MCP `set_config` tool writes fs directly with imported schema validation. No HTTP round-trip. Live UIs refresh via file watcher → Y.Text → Modal observer.
- **P5 CI / automation:** Unchanged — `ok config validate` reads file + Zod safeParse; no transport.

## What still needs investigation (Step 2 worldmodel scope)

The architectural pivot raises specific technical questions that the existing evidence files don't cover:

1. **Hocuspocus doc admission for non-markdown paths.** Current `ContentFilter` rejects `.open-knowledge/` paths and non-markdown extensions. What's the cleanest admission mechanism for system-config docs? Look at `__system__` doc precedent.
2. **Bridge bypass per-doc.** The observer bridge in `server-observers.ts` runs on every doc. How is it currently gated? Can per-doc opt-out be added cleanly, or is the simpler move "only run for `.md`/`.mdx` admitted paths"?
3. **Persistence-time validation hooks.** Hocuspocus persistence callback exists; can it reject a write atomically and revert Y.Text?
4. **Cross-process fan-out for user-global config.** Multiple `ok start` instances on the same machine all watching `~/.open-knowledge/config.yml`. Atomic tmp+rename + chokidar should suffice; verify no edge cases around watch-during-rename.
5. **`ConfigSchema` migration to `@inkeep/open-knowledge-core`.** Does anything in the schema or its deps prevent browser-bundle compatibility? Are there server-only types or imports?
6. **CRDT merge semantics for Y.Text-as-YAML.** Quantify: under what concurrent-write patterns does CRDT produce invalid YAML? Is persistence-time validation a sufficient safety net?
7. **Awareness suppression.** How are awareness presence pills currently rendered? Is there a per-doc suppression mechanism, or is the pill rendering opt-in at the Modal level?

These are the worldmodel inputs for Step 2.

## What this means for the spec direction

The spec evolves from:
> "Three CRUD surfaces over config.yml, all backed by one shared `applyConfigPatch` write primitive in `@inkeep/open-knowledge-server`."

to:
> "Two CRUD surfaces over config.yml — Modal Settings UI bound to Hocuspocus Y.Text docs, and a small TypeScript library (`@inkeep/open-knowledge-core`) carrying the schema + validation helpers used by Modal, MCP tools, and CLI. No backend service for config; the schema IS the contract."

Tier 1 (CLI + IDE intellisense) ships unchanged.

The simplification budget: roughly 60–75% of the existing decision/requirement surface collapses or shrinks. The remaining decisions are about the new transport (Hocuspocus admission, bridge bypass, persistence hook, scope-as-constraint metadata, schema package relocation).
