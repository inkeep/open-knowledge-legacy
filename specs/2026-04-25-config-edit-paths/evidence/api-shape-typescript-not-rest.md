---
name: api_shape_typescript_not_rest
description: Refines the architectural pivot — "API" here is a TypeScript-function contract on the frontend that writes over the collab WS, not a REST endpoint. /typescript-api-design discipline applies in Step 5.
type: evidence
date: 2026-04-28
sources:
  - "session: 2026-04-28 release-pivot intake (user message: 'for something like appearance settings which have a button, I guess there is still an API, but it is not a rest API, but rather a /typescript-api-design on the front end which writes over the collab server wire')"
  - "evidence/architectural-pivot-hocuspocus.md (sibling file — transport pivot)"
---

# API shape — TypeScript contract, not REST endpoint

## The user's framing

> "for something like appearance settings which have a button, I guess there is still an API, but it is not a rest API, but rather a /typescript-api-design on the front end which writes over the collab server wire"

This refines the prior architectural pivot. **Dropping the HTTP layer doesn't dissolve "the config API" — it relocates it.** The contract still exists; it lives on the frontend as a TypeScript function surface that writes via Y.Text over the existing collab WS.

## What the API surface looks like

Two callsite shapes, sharing one schema and one validation core:

### Shape A — UI consumer (Modal walker, theme toggle button, any in-app control)

```ts
// from @inkeep/open-knowledge-core (browser-compatible; bundled in app)
import { type HocuspocusProvider } from '@hocuspocus/provider';
import { type Config, type ConfigSchema } from './schema';

export interface ConfigBinding {
  /** Current parsed + validated config from the bound Y.Text doc. */
  current(): Config;

  /**
   * Apply a deep-partial patch.
   * - Walks Y.Text → yaml.parseDocument → schema.parse → mutate via yaml@2 setIn → re-serialize → Y.Text replace
   * - Validates merged document client-side; rejects invalid patches with structured ConfigValidationError
   * - Y.Text replace transmits over the collab WS; Hocuspocus persistence-hook revalidates server-side
   */
  patch(patch: DeepPartial<Config>): Result<{ effective: Config; appliedPaths: string[] }, ConfigValidationError>;

  /** Subscribe to external + local updates (Y.Text observer). */
  subscribe(listener: (config: Config) => void): Unsubscribe;
}

/**
 * Bind a Hocuspocus provider to a config doc.
 * scope determines which doc name is bound (workspace vs synthetic __user__/config.yml).
 */
export function bindConfigDoc(provider: HocuspocusProvider, scope: 'workspace' | 'user'): ConfigBinding;
```

The theme toggle in the editor header becomes:

```tsx
const userBinding = useConfigBinding('user');
const onToggleTheme = () => {
  const next = userBinding.current().appearance?.theme === 'dark' ? 'light' : 'dark';
  const result = userBinding.patch({ appearance: { theme: next } });
  if (!result.ok) toast(result.error.humanFormat());
};
```

The Modal Settings UI's Zod walker calls `binding.patch(...)` on every field commit.

### Shape B — Headless writer (MCP `set_config` tool, CLI `ok config migrate`, `seed/apply.ts`)

```ts
// from @inkeep/open-knowledge-core (works in Node + browser)
export interface WriteConfigPatchOptions {
  cwd: string;
  scope: 'workspace' | 'user';
  patch: DeepPartial<Config>;
}

/**
 * Atomic fs write of a config patch.
 * - Reads file → yaml.parseDocument → mutate via yaml@2 setIn → re-serialize
 * - Validates merged document; rejects invalid patches
 * - Atomic tmp+rename
 * - Server's file watcher detects → Hocuspocus Y.Text updates → live UIs refresh
 */
export function writeConfigPatch(
  opts: WriteConfigPatchOptions
): Result<{ effective: Config; appliedPaths: string[] }, ConfigValidationError>;
```

MCP and CLI use Shape B because they may run without a server (no `ok start`); they don't need a WS connection. The fs round-trip + file watcher closes the loop.

## Why two shapes, not one

A single shape collapses to either:
- **All-via-WS:** MCP and CLI must connect to a Hocuspocus server. Breaks `ok config validate` in CI (no server). Breaks `ok config migrate` against a stopped project. Breaks an MCP client editing config when `mcp.autoStart` is off.
- **All-via-fs:** UI consumers must trigger fs writes from the browser. Browser sandbox doesn't allow this. Electron renderer would need an IPC tunnel that defeats the point of the Hocuspocus integration.

Two shapes serving two contexts is the honest design. They share:
- The same `ConfigSchema` and validation core
- The same `Result<T, E>` envelope
- The same `ConfigValidationError` type
- The same yaml@2 round-trip code (extracted into a shared helper)

The difference is purely transport: one writes to Y.Text via the collab WS; the other writes to fs directly.

## What "the API" means in this spec

The deliverable surface for this spec, in API-design terms:

1. **`ConfigBinding`** — one interface, browser-compatible, used by Modal + chrome controls (theme toggle, anywhere)
2. **`writeConfigPatch`** — one function, Node-compatible, used by MCP / CLI / seed
3. **`ConfigSchema`** — one Zod schema with `scope: 'user' | 'workspace' | 'either'` per-field metadata, exported from `@inkeep/open-knowledge-core`
4. **`ConfigValidationError`** — one error type with `humanFormat()`, source-located issues, paths
5. **MCP tools** — `set_config` / `get_config` / `set_folder_rule`, each thin wrappers around `writeConfigPatch`

That's the public API. There is no HTTP, no envelope-on-the-wire, no REST endpoint to design.

## /typescript-api-design — applicable in Step 5

The eng:typescript-api-design skill explicitly covers:
- React props, hook APIs, exported library functions
- Schema-first design with Zod
- Discriminated unions, error handling, evolvability
- PATCH/mutation shape, idempotency
- SDK generation

All directly applicable to the surface above. **Invoke `/typescript-api-design` in Step 5 when formalizing the public contract** — specifically:
- The `ConfigBinding` interface shape (subscribe semantics, patch return type, error envelope)
- The `writeConfigPatch` function signature (input shape, Result discriminated union)
- The `ConfigSchema` Zod metadata API (`scope`, `agentSettable`, `defaultValue`, etc.)
- The patch shape (deep-partial vs. RFC 7396 dialect — does deep-partial-with-undefined-as-clear suffice in TypeScript-only land?)

## What this resolves

This refinement closes a small ambiguity in `evidence/architectural-pivot-hocuspocus.md`. That file used "schema-as-contract" loosely; this file makes it precise:

- The **schema** is the validation source of truth (Zod, walked at build time + runtime)
- The **API** is the TypeScript function surface (`ConfigBinding` + `writeConfigPatch`)
- The **transport** is split: Y.Text-over-WS for UI; fs-direct for headless

Three layers, each with its own design principles. Step 3 frames the spec around this; Step 5 invokes /typescript-api-design to lock the contract.

## Implication for existing-spec decisions

| Decision | Refinement |
|---|---|
| **D5** (shared `applyConfigPatch`) | The "shared write primitive" is actually two: `ConfigBinding.patch` (UI) + `writeConfigPatch` (headless). They share the validation core (yaml@2 round-trip + Zod safeParse). Keep D5 in spirit; rename in §9. |
| **D14** (`ApiError` discriminated union) | Becomes `ConfigValidationError` — TypeScript discriminated union, no wire-format concern. Forward-compat tail variant still applies for future error codes. |
| **D31** (RFC 7396 PATCH dialect) | Reframes as TypeScript deep-partial semantics. The `null`-as-clear convention from RFC 7396 still works in deep-partial form (`{ field: null }` clears). No `Content-Type: application/merge-patch+json` header — there's no HTTP. |
| **D32** (two-validator pattern) | Collapses to one validator (merged-doc safeParse). Patch-payload validation drops because the patch is consumed in-process by code that already knows the schema. Persistence-time hook server-side is the second layer (defense-in-depth). |
| **D35** (`Result<T, E>`) | Now **the** contract surface. Both `ConfigBinding.patch` and `writeConfigPatch` return `Result<T, ConfigValidationError>`. |

## What this confirms

The user's architectural intuition is consistent and load-bearing:

1. The "config API" is a frontend TypeScript contract, not a backend service.
2. Hocuspocus is the transport for UI writers; fs is the transport for headless writers.
3. The schema is the contract; validation is uniform.
4. /typescript-api-design discipline (not REST API design) governs the surface.

Step 3's reframe of the SPEC.md problem statement, goals, and proposed solution should reflect this triple-layer model: schema (contract) / API (TypeScript surface) / transport (Y.Text-WS or fs).
