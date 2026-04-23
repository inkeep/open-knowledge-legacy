# Evidence D1: Open Knowledge config.yml architecture & extension points

**Dimension:** 1P — config.yml schema, loader, precedence, path-match primitives
**Date:** 2026-04-16
**Sources:** Open Knowledge monorepo (main branch as of 2026-04-16)

---

## Key files / pages referenced

- `packages/cli/src/config/schema.ts:1-67` — Zod schema, single source of truth for config shape
- `packages/cli/src/config/loader.ts:1-94` — hierarchical YAML loader (user → workspace)
- `packages/cli/src/constants.ts` — `OK_DIR`, `CONFIG_FILENAME` constants (`.open-knowledge/config.yml`)
- `packages/server/src/content-filter.ts:1-290` — the only 1P consumer of `content.include` / `content.exclude`; wraps both `picomatch` (include globs) and `ignore` (gitignore-compatible exclude rules)
- `packages/cli/src/utils/frontmatter.ts:1-70` — shared `parseFrontmatter<Schema>()` helper already used elsewhere in the CLI; accepts a Zod schema for typed validation
- `.open-knowledge/config.yml` (workspace file, currently all defaults commented out)

---

## Findings

### Finding: Config schema is a Zod object with nested sub-blocks, defaults per field
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/config/schema.ts:1-67`

```ts
export const ConfigSchema = z.object({
  content: z
    .object({
      dir: z.string().default('.'),
      include: z.array(z.string()).min(1).default(['**/*.md', '**/*.mdx']),
      exclude: z.array(z.string()).default([]),
    })
    .default({ dir: '.', include: ['**/*.md', '**/*.mdx'], exclude: [] }),
  server: z.object({ port: …, host: …, openOnAgentEdit: z.boolean().default(false) })…,
  persistence: z.object({ debounceMs: …, maxDebounceMs: … })…,
  preview: z.object({ baseUrl: z.url().optional() })…,
  mcp: z.object({ tools: z.object({ read_document: …, search: … })… })…,
});
export type Config = z.infer<typeof ConfigSchema>;
```

**Implications for folder-frontmatter spec:**
- The schema already models *per-feature top-level blocks* (`content`, `server`, `persistence`, `preview`, `mcp`). A new top-level block (e.g. `folders` or `frontmatter`) is the natural extension shape.
- Every sub-block uses `.default({...})` — adding a new block is non-breaking if every new field has a default or is `.optional()`.
- The `Config` type is derived via `z.infer` — downstream consumers pick up new fields automatically.

---

### Finding: Loader precedence is user → workspace, deep-merge, arrays replace
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/config/loader.ts:28-94`

```ts
// Deep merge two objects. Leaf values in `override` replace `base`.
// Arrays are replaced, not concatenated.
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (isObject(overrideVal) && isObject(baseVal)) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result;
}

export function loadConfig(cwd?) {
  // Layer 1: ~/.open-knowledge/config.yml (user)
  // Layer 2: ./.open-knowledge/config.yml (workspace)  ← overrides user
  // Validate via Zod (applies defaults).
}
```

Documented precedence chain (CLAUDE.md §Package: cli):
> `CLI flags > ENV > workspace > user > Zod defaults`

**Implications:**
- Any `folders:` / `frontmatter:` block would inherit the same merge discipline for free: workspace overrides user, objects deep-merge, **arrays replace**.
- Array-replace is important: if we model folder rules as an array (`folders: [{match, defaults}, ...]`), a workspace config completely supersedes a user-level list — there's no "append user + workspace." If per-item merging is desired the schema must key rules (by `name` or `match`) and collapse by key at load time.

---

### Finding: Path-matching primitives already in the dependency graph
**Confidence:** CONFIRMED
**Evidence:** `packages/server/src/content-filter.ts:12-13, 58`

```ts
import ignore, { type Ignore } from 'ignore';
import picomatch from 'picomatch';
// …
const isIncluded = picomatch(includePatterns, { dot: true });
```

Two path-matching primitives are battle-tested in 1P code:

1. **`picomatch`** — used for `content.include` globs. Standard glob syntax (`**/*.md`, `{a,b}`, `*`). `{ dot: true }` option includes dotfiles.
2. **`ignore`** — used for `content.exclude` + `.gitignore` unification. Gitignore-compatible syntax (negation via `!`, directory-trailing-slash, nested `.gitignore` walk).

**Implications:**
- A `folders.match` field (glob) could reuse `picomatch` directly — no new dependency.
- If we want gitignore-style precedence semantics (later rules override earlier, negation), `ignore` is already available.
- `ContentFilter` has precedent for a **4-step ordered rule evaluation** (gitignore → include → sibling-asset → else). Folder-frontmatter rules could follow the same ordered-first-match or most-specific-match pattern.

---

### Finding: ENV + CLI flag layer override the workspace file
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/cli.ts` (per CLAUDE.md §Config system: `CLI flags > ENV > workspace > user > Zod defaults`); loader.ts:9 comments confirm "ENV and CLI flag overrides are applied in cli.ts after loading."

**Implications:**
- A spec can decide whether folder-frontmatter rules should be ENV/CLI-overridable. Likely answer: NO for the rule list itself (too large for env), but YES for toggles like `--no-folder-frontmatter` if escape-hatching is worthwhile.

---

### Finding: The workspace config file is commented-defaults and human-readable by design
**Confidence:** CONFIRMED
**Evidence:** `.open-knowledge/config.yml` workspace file (current state — all defaults commented out with inline schema reference)

```yaml
# Open Knowledge — workspace configuration
# Schema reference: packages/cli/src/config/schema.ts
# content:
#   dir: .
#   include:
#     - "**/*.md"
#   exclude: []
# persistence:
#   debounceMs: 2000
#   maxDebounceMs: 10000
```

**Implications:**
- The `init` scaffold ships a commented-defaults file — a `folders:` block should follow the same pattern (commented example showing schema shape).
- There's an implicit doc-comment convention: each block has a comment block explaining precedence and semantics. Folder-frontmatter spec should include the same.

---

### Finding: Shared `parseFrontmatter<Schema>()` helper supports Zod validation
**Confidence:** CONFIRMED
**Evidence:** `packages/cli/src/utils/frontmatter.ts:44-63`

```ts
export function parseFrontmatter<S extends ZodType = ZodType<Record<string, unknown>>>(
  content: string,
  schema?: S,
): Resolve<output<S>> | null { … }
```

**Implications:**
- A folder-frontmatter defaults block can be validated against the same Zod schema used for per-file frontmatter — shared validation surface.
- Bigger architectural question for the spec: does OK ship a **canonical frontmatter schema** at all (per the existing `frontmatter-schema-conventions` report), or stay loose? That decision affects whether folder defaults can be strongly typed.

---

## Negative searches (for NOT FOUND)

- Searched for existing "folder metadata" code in `packages/server/src/**` and `packages/cli/src/**` (`folder|directory|category.*metadata`) — no prior 1P implementation. The only related code is `hub-candidates.ts` (soft-nudge for orphaned docs; does NOT read folder metadata).
- Searched for prior ADRs or design notes under `specs/` referencing folder-frontmatter or folder-level config — none found as of 2026-04-16.
- D19 reference in `packages/cli/src/mcp/tools/read-document.ts:15` (`Folder-catalog context is intentionally absent — folder INDEX.md frontmatter was deprecated in D19`) — the SPEC line itself was not located in `specs/2026-04-10-wiki-links-backlinks/SPEC.md` (search returned no `D19` match in that file). Likely refers to a deleted draft decision; the *current* mechanism for folder context is `findHubCandidates()` (hub-file detection, not folder frontmatter).

---

## Gaps / follow-ups

- If the spec wants a **shared schema** between folder-defaults and per-file frontmatter, someone must first decide the canonical frontmatter schema (open question today — `frontmatter-schema-conventions-for-agent-readable-docs` report has a proposed minimal viable schema but it's unimplemented).
- `ContentFilter` is in `packages/server/`; config schema is in `packages/cli/`. A folder-frontmatter consumer on the server side would need to import the config type (already works via workspace deps) — no blocker.
