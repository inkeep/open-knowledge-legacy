---
name: zod-v4-catalogs-registries
description: Zod v4's catalogs/registries metadata system — how it works, whether it solves the .default()/.optional() metadata-propagation gap, and concrete patterns for per-field scope-as-constraint declarations
type: research
date: 2026-04-28
sources:
  - https://zod.dev/metadata
  - https://zod.dev/json-schema
  - https://zod.dev/v4
  - https://github.com/colinhacks/zod/issues/4145
  - https://github.com/asteasolutions/zod-to-openapi
  - https://heyapi.dev/openapi-ts/plugins/zod
  - https://www.speakeasy.com/openapi/frameworks/zod
  - node_modules/zod/src/v4/core/registries.ts
  - node_modules/zod/src/v4/core/util.ts
  - node_modules/zod/src/v4/core/to-json-schema.ts
  - node_modules/zod/src/v4/core/json-schema-processors.ts
  - node_modules/zod/src/v4/classic/schemas.ts
  - node_modules/zod/src/v4/classic/tests/registries.test.ts
  - node_modules/zod/src/v4/classic/tests/to-json-schema.test.ts
  - node_modules/zod/src/v4/classic/tests/describe-meta-checks.test.ts
---

# Zod v4 Catalogs / Registries — Metadata System Investigation

**Purpose:** Decide whether Zod v4's `z.registry()` API solves the `.default()` / `.optional()` / `.nullable()` metadata-propagation gap that blocks declaring per-field `scope` / `agentSettable` constraints inline. Determine the concrete code shape and the JSON Schema export interaction.

## TL;DR

1. **Registries do NOT solve the propagation problem on their own.** `.default()` / `.optional()` / `.nullable()` create new schema instances that have neither `_zod.parent` set nor inherited registry entries. Naive `registry.get(wrapper)` returns `undefined`. Empirically verified on Zod 4.3.6 (the version pinned per spec D19).
2. **A 6-line walker that descends `_zod.def.innerType` solves it.** Combined with `.register(reg, meta)` (which preserves the schema instance) before any wrappers, the walker reliably finds field metadata regardless of how deep `.default().optional().nullable()` goes.
3. **`z.toJSONSchema()` already does this for us.** Wrapper processors recurse into `def.innerType` and the metadata is merged via `Object.assign(result.schema, meta)`. SchemaStore export with `target: 'draft-07'` works with `.meta()` AND with custom registries via `{ metadata: registry }`.
4. **Recommended shape:**
   ```typescript
   export const fieldRegistry = z.registry<FieldMeta>();
   const port = z.number().register(fieldRegistry, { scope: 'workspace', agentSettable: true }).default(5173);
   getFieldMeta(port); // walks innerType → finds it
   ```
5. **No version pinning concerns.** All behavior is consistent in 4.3.6 source. Registries are GA in Zod v4.

## Key Findings

- **Finding 1 — `_zod.parent` chain ≠ `_zod.def.innerType` chain.** Zod has TWO traversal paths: `parent` (set by `.meta()` clones, used by registry inheritance) and `def.innerType` (set by wrapper factories, used by validation/JSON-Schema processors). Registry's `.get()` walks `parent` only — not `innerType`. This is the reason wrapping breaks lookup.
- **Finding 2 — `.register()` returns the same instance; `.meta()` returns a clone.** Use `.register()` when you intend to wrap further.
- **Finding 3 — `toJSONSchema` is the high-leverage consumer.** It picks up both inline `.meta()` and custom-registry metadata (via `{ metadata: registry }` option) and correctly traverses wrappers internally. No additional work needed for SchemaStore export beyond passing the registry.
- **Finding 4 — TypeScript inference is strong.** `z.registry<MetaShape>()` enforces the meta shape on `.add()`/`.register()`. A second generic `z.registry<Meta, ZodSubType>()` constrains schemas. `z.$output` / `z.$input` symbols let metadata fields reference inferred types.
- **Finding 5 — `.describe(s)` is sugar for `.meta({ description: s })` against `z.globalRegistry`.** Custom registries do NOT receive `.describe()` writes.

## Detailed Findings

### Dimension 1: Registry API surface

`z.registry<Meta>()` returns a `$ZodRegistry` instance backed by a `WeakMap<Schema, Meta>` and a separate `Map<string, Schema>` for `id`-indexed lookup. Five operations: `add`, `get`, `has`, `remove`, `clear`. Schemas expose `.register(registry, meta)` as inline syntactic sugar.

```typescript
const fieldRegistry = z.registry<{ scope: string; agentSettable: boolean }>();

// Method 1: imperative add
fieldRegistry.add(z.string(), { scope: 'user', agentSettable: true });

// Method 2: chainable .register() — returns SAME schema instance (not a clone)
const port = z.number().register(fieldRegistry, { scope: 'workspace', agentSettable: true });

fieldRegistry.get(port);   // => { scope: 'workspace', agentSettable: true }

// Subtype constraint (rejects non-string at compile time)
const stringOnly = z.registry<{...}, z.ZodString>();
```

`z.globalRegistry` is a singleton attached to `globalThis.__zod_globalRegistry` (CJS/ESM-safe). `.meta(m)` is shorthand for clone-and-add-to-global. The `GlobalMeta` interface includes `id`, `title`, `description`, `deprecated`, `[k: string]: unknown` and is extensible via TypeScript declaration merging.

**Recommendation for our config schema:** Use a CUSTOM registry (not `z.globalRegistry`) for `scope`/`agentSettable`/`defaultScope`. Avoids cross-monorepo ID-collision class of bug ([colinhacks/zod#4145](https://github.com/colinhacks/zod/issues/4145)) and keeps `z.globalRegistry` clean for orthogonal description/title metadata.

### Dimension 2: Does the registry solve `.default()` propagation?

**No, not on its own.** `.default(x)` (and `.optional()` / `.nullable()`) construct a new wrapper schema (`new $ZodDefault({ type: 'default', innerType: T, ... })`) without setting `_zod.parent`. The registry's `.get()` walks `_zod.parent` for inheritance; since `parent` is undefined on the wrapper, the lookup returns `undefined` even if the inner schema is registered.

**Source proof** — `util.ts:485-489`:

```typescript
export function clone<T extends schemas.$ZodType>(inst: T, def?: T["_zod"]["def"], params?: { parent: boolean }): T {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent) cl._zod.parent = inst;  // parent set ONLY here
  return cl as any;
}
```

But the wrapper factories (`classic/schemas.ts:1843`) construct **new** instances directly, NOT via `clone(inst, def, { parent: true })`:

```typescript
export function optional<T extends core.SomeType>(innerType: T): ZodOptional<T> {
  return new core.$ZodOptional({ type: "optional", innerType, ... }) as any;
}
```

**Empirical proof on Zod 4.3.6 (this codebase):**

```
const inner = z.string();
fieldRegistry.add(inner, { scope: 'user', agentSettable: true });
const wrapped = inner.default('localhost');

fieldRegistry.get(inner);   // => { scope: 'user', agentSettable: true }
fieldRegistry.get(wrapped); // => undefined  ← THE GAP

wrapped._zod.parent;                    // => undefined
wrapped._zod.def.innerType === inner;   // => true   ← but registry doesn't walk this
```

There is also a documented test confirming this — `registries.test.ts:140-146`:

```typescript
test(".meta metadata does not bubble up", () => {
  const a1 = z.string().meta({ name: "hello" });
  const a2 = a1.optional();
  expect(a1.meta()).toEqual({ name: "hello" });
  expect(a2.meta()).toEqual(undefined);
});
```

**The fix — a walker:**

```typescript
export function getFieldMeta<M>(reg: z.core.$ZodRegistry<M>, schema: any): M | undefined {
  let cur = schema;
  while (cur) {
    const meta = reg.get(cur);
    if (meta !== undefined) return meta;
    if (cur._zod?.def?.innerType) cur = cur._zod.def.innerType;
    else break;
  }
  return undefined;
}
```

Single-innerType wrappers covered (per `json-schema-processors.ts:479-563`): `optional`, `nullable`, `default`, `prefault`, `nonoptional`, `readonly`, `catch`, `promise`. Multi-input wrappers (`pipe`/`union`/`intersection`/`array`/`object`/`record`) need different handling — but for per-field scalar metadata on `z.object().shape`, those don't apply.

**Empirical (verified):**

```
const chained = inner.default('localhost').optional().nullable();
findRegistryMeta(fieldRegistry, chained);
// => { scope: 'user', agentSettable: true }    ← walker finds it
```

**Order matters:** `.register(reg, meta)` first, THEN wrappers. `z.number().register(reg, meta).default(5173)` works. `z.number().default(5173).register(reg, meta)` registers the *wrapper* — the leaf has nothing.

### Dimension 3: JSON Schema export interaction

`z.toJSONSchema()` already handles wrapper traversal correctly. Inner-leaf metadata flows through to the output JSON Schema for both inline `.meta()` and custom-registry metadata. Custom keys like `scope` and `agentSettable` are emitted verbatim.

**Mechanism** — every schema goes through `process()` in `to-json-schema.ts`. Wrapper processors call `process(def.innerType, ctx, params)` recursively. After processing:

```typescript
// to-json-schema.ts:197-199
const meta = ctx.metadataRegistry.get(schema);
if (meta) Object.assign(result.schema, meta);
```

`ctx.metadataRegistry` defaults to `z.globalRegistry`, but `z.toJSONSchema(schema, { metadata: customRegistry })` overrides it.

**Empirical (Zod 4.3.6):**

```typescript
z.toJSONSchema(z.string().meta({ scope: 'user' }).default('x'), { target: 'draft-7' })
// => {
//   "$schema": "http://json-schema.org/draft-07/schema#",
//   "default": "x",
//   "type": "string",
//   "scope": "user"        ← custom key flows through
// }

const reg2 = z.registry<{ id: string; description: string }>();
const inner = z.string();
reg2.add(inner, { id: "myField", description: "field desc" });
z.toJSONSchema(inner.default("hello"), { metadata: reg2 })
// => {
//   "$ref": "#/$defs/myField",
//   "default": "hello",
//   "$defs": { "myField": { "type": "string", "id": "myField", "description": "field desc" } }
// }
```

**Implications for SchemaStore export:**
- Pass `{ target: 'draft-07', metadata: ourFieldRegistry }` and inner-leaf metadata is emitted.
- For SchemaStore-clean output (no `scope`/`agentSettable`), keep custom keys ONLY in the field registry, and pass `z.globalRegistry` (or omit `metadata`) when exporting.
- JSON Schema draft-07 ignores unknown keywords by default — keys passing through is usually safe.

### Dimension 4: Concrete pattern for our use case

```typescript
// packages/cli/src/config/field-registry.ts (new file)
import { z } from 'zod';

export type FieldScope = 'user' | 'workspace' | 'either';
export interface FieldMeta {
  scope: FieldScope;
  agentSettable: boolean;
  defaultScope?: 'user' | 'workspace';   // only meaningful when scope === 'either'
}

export const fieldRegistry = z.registry<FieldMeta>();

/** Walks .default()/.optional()/.nullable()/etc. wrappers to find leaf metadata. */
export function getFieldMeta(schema: z.ZodTypeAny): FieldMeta | undefined {
  let cur: any = schema;
  while (cur) {
    const meta = fieldRegistry.get(cur);
    if (meta !== undefined) return meta;
    if (cur._zod?.def?.innerType) cur = cur._zod.def.innerType;
    else break;
  }
  return undefined;
}
```

```typescript
// packages/cli/src/config/schema.ts
import { fieldRegistry } from './field-registry.js';

export const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535)
    .register(fieldRegistry, { scope: 'workspace', agentSettable: true })
    .default(5173),

  host: z.string()
    .register(fieldRegistry, { scope: 'either', agentSettable: false, defaultScope: 'user' })
    .default('localhost')
    .optional(),

  apiKey: z.string()
    .register(fieldRegistry, { scope: 'user', agentSettable: false }),
});
```

```typescript
// Iterating fields:
for (const [key, fieldSchema] of Object.entries(ConfigSchema.shape)) {
  const meta = getFieldMeta(fieldSchema);
  // dispatch to user-config writer or workspace-config writer based on meta.scope
}
```

Type ergonomics: `fieldRegistry.add(schema, { ...wrong shape })` is a TS error. `fieldRegistry.get(schema)` returns `FieldMeta | undefined`.

### Dimension 5: `.describe()` vs `.meta()` and form-rendering

`.describe(s)` is `.meta({ description: s })` against `z.globalRegistry`. For form-rendering descriptions, `.describe()` is idiomatic and most discoverable. It does NOT write to custom registries.

```typescript
const a = z.string().describe('hello');
z.globalRegistry.get(a);   // => { description: 'hello' }
a.description;             // => 'hello'  (instance accessor)

const myReg = z.registry<{ description: string }>();
myReg.get(a);              // => undefined   (only globalRegistry)
```

`.meta()` chains DO inherit (via `_zod.parent`):
```typescript
const A = z.string().meta({ a: true });
const B = A.meta({ b: true });
const C = B.describe("hello");
C.meta();   // => { a: true, b: true, description: "hello" }
```

**Recommendation:** Use `.describe()` for human-readable field descriptions; use `.register(fieldRegistry, ...)` for `scope`/`agentSettable`/`defaultScope`. They coexist on the same field.

### Dimension 6: Limitations & gotchas

1. **`.meta()` does not propagate through wrappers via `.meta()` lookup.** Documented and intended. Workaround: walker.
2. **`.register()` returns same instance; `.meta()` returns a clone.** Mixing them — e.g., `.meta(...).register(reg, ...)` — registers the *clone*, not the original. **Best practice: `.register()` first, then any wrappers.**
3. **Re-registering the same `id` to a different schema silently overwrites `_idmap`.** But `toJSONSchema` throws on duplicate ids in the same conversion.
4. **Global registry singleton spans the whole monorepo.** Not an issue for our single-CLI-process case; would be for polyrepo + multi-spec.
5. **`pipe` / `union` / `intersection` need different walker logic.** Single-innerType walker won't find leaves inside these. Document as a STOP rule if these constructs appear in the config schema.
6. **`toJSONSchema` emits unknown keys verbatim.** If consumers reject `scope`/`agentSettable`, post-process or use a separate registry for export.
7. **`.refine()` strips metadata via clone.** Same root cause as wrappers. Not investigated whether walker descends through `.refine()` — needs separate test.

### Dimension 7: Third-party precedents

| Library | Pattern | Source |
|---|---|---|
| `zod-to-openapi` (asteasolutions) v8+ | Native `.meta()` consumption + custom `.openapi()` extension method | [GitHub](https://github.com/asteasolutions/zod-to-openapi) |
| Hey API `@hey-api/openapi-ts` Zod plugin | `.register(z.globalRegistry, ...)` + custom-metadata-fn hook | [heyapi.dev](https://heyapi.dev/openapi-ts/plugins/zod) |
| Speakeasy OpenAPI from Zod v4 | `.meta()`-driven OpenAPI doc generation | [speakeasy.com](https://www.speakeasy.com/openapi/frameworks/zod) |
| `zod-openapi` (separate npm package) | Metadata-driven, Zod v4 native | [npm](https://www.npmjs.com/package/zod-openapi) |

Pattern: every library either uses `z.globalRegistry` directly or defines a per-library namespaced extension that registers in a custom registry. For domain-specific metadata like ours, custom registry is more idiomatic. TanStack Form does NOT (as of 2026-04) consume Zod v4 registry metadata for form rendering — we'd build the bridge ourselves (which `getFieldMeta` already does).

## Recommendations for the spec

1. **Adopt the registry + walker pattern.** ~30 lines in a new `field-registry.ts`.
2. **Order: `.register()` first, then wrappers.** Document as canonical declaration order.
3. **`.describe()` for form descriptions, `.register()` for `scope`/`agentSettable`.** Clean separation.
4. **Custom registry, NOT `z.globalRegistry`.** Keeps SchemaStore JSON clean. Pass it to `toJSONSchema` only for internal scope-routing JSON; pass nothing (default global) when exporting SchemaStore.
5. **Document the limitation:** union/pipe/intersection branches need per-branch registration.
6. **No version pinning concerns at 4.3.6.** All evidence verified against the version in this codebase.

## Sources

- [Metadata and registries | Zod](https://zod.dev/metadata)
- [JSON Schema | Zod](https://zod.dev/json-schema)
- [Release notes v4 | Zod](https://zod.dev/v4)
- [v4: `.meta()` global registry conflicts · Issue #4145](https://github.com/colinhacks/zod/issues/4145)
- [zod-to-openapi (asteasolutions)](https://github.com/asteasolutions/zod-to-openapi)
- [Hey API Zod v4 plugin](https://heyapi.dev/openapi-ts/plugins/zod)
- [Speakeasy: How To Generate an OpenAPI Document With Zod v4](https://www.speakeasy.com/openapi/frameworks/zod)

Local source (Zod 4.3.6, this codebase):
- `node_modules/zod/src/v4/core/registries.ts`
- `node_modules/zod/src/v4/core/util.ts:485-489`
- `node_modules/zod/src/v4/core/to-json-schema.ts:166-215`
- `node_modules/zod/src/v4/core/json-schema-processors.ts:479-563`
- `node_modules/zod/src/v4/classic/schemas.ts:1843-1932`
- `node_modules/zod/src/v4/classic/tests/registries.test.ts`
- `node_modules/zod/src/v4/classic/tests/to-json-schema.test.ts:2392-2570`
- `node_modules/zod/src/v4/classic/tests/describe-meta-checks.test.ts`
