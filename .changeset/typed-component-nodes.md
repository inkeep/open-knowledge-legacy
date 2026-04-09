---
"@inkeep/open-knowledge": minor
---

Typed component nodes — prop panels + inline rich-text children (Layers 2-3).

Transforms the editor's opaque JSX string void nodes into structured, visually-editable component blocks with auto-generated prop panels (Layer 2) and inline rich-text children editing with character-level CRDT merge (Layer 3). Ships 15 built-in component families (21 entries) from fumadocs-ui, `@inkeep/docskit`, and shadcn-installed sources via a registry-driven architecture. On-disk format switches from fenced `jsx-component` code blocks to raw JSX (valid MDX, fumadocs-compatible).

Key internal changes:

- **Factory pattern** — `createJsxComponentExtensions(manifest)` produces `jsxComponentEditable` and `jsxComponentVoid` TipTap extensions. Centralized in `packages/core/src/extensions/shared.ts`.
- **Registry** — `packages/core/src/generated/components.ts` is a committed, auto-generated PropDef manifest. Run `bun run build-registry` to regenerate. `bun run drift-check` guards against stale generations.
- **JSX parser** — acorn + acorn-jsx (~23KB, 6x smaller than @babel/parser).
- **Isolating component boundary** — `jsxComponentEditable` sets `isolating: true` so backspace at the start of children doesn't delete the component wrapper.
- **Internal API cleanup** — the legacy `fenceFor` and `JsxComponent` exports have been removed from `@inkeep/open-knowledge-core`'s public API. Both were workspace-internal (no external consumers) and are replaced by the factory. This is NOT a breaking change in the semver sense — `@inkeep/open-knowledge-core` is a private workspace package, and the only published package (`@inkeep/open-knowledge`) continues to expose its user-facing CLI surface unchanged.
