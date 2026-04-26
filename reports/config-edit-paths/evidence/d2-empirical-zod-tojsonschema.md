# Evidence: D2 — Empirical `z.toJSONSchema()` test (follow-up)

**Dimension:** D2 — Schema source-of-truth direction (empirical sub-finding)
**Date:** 2026-04-25
**Method:** Direct execution of a TypeScript test script via Bun against the Zod version installed in OK's `packages/cli/node_modules` (`zod ^4.3.6`). Test script at `/tmp/zod-empirical-test.ts`; raw output preserved at `/tmp/zod-test-output.txt`.
**Purpose:** Resolve the D2 UNCERTAIN finding on `.brand()` behavior and verify the broader emit-coverage matrix from the original D2 evidence file.

---

## Test environment

- Zod: `^4.3.6` (resolved from `packages/cli/node_modules/zod/package.json`)
- Runtime: Bun 1.3.11
- Working directory: `packages/cli/`
- Script: 23 test cases covering primitives, refinements, wrappers, brands, transforms, pipes, defaults (input vs output mode), discriminated unions, lazy/recursive, and draft-07 vs draft-2020-12 targets

---

## Headline findings (corrections + new observations)

### Correction 1: `.brand()` does NOT throw under `z.toJSONSchema()` — it silently passes through as the underlying type

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.string().brand<'DocName'>()`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "string"
}
```

This was UNCERTAIN in the original D2 evidence file. The Zod v4 docs list `.brand()` under "transforms and `.pipe()`" as unrepresentable, but the actual runtime behavior is **silent pass-through** — the brand metadata is dropped, the underlying type is emitted as if the brand didn't exist. The `unrepresentable: 'any'` option does NOT change this — the output is identical.

**Implications:**
- Greenfield code can safely use `.brand()` for nominal typing without breaking the JSON Schema export
- The brand information is lost in the JSON Schema artifact (consumers cannot distinguish `DocName` from `string`)
- Tooling that relies on the brand for runtime invariants (e.g., a Zod-direct form library — D3) preserves the brand; tooling routed through JSON Schema (RJSF, JSON Forms, monaco-yaml schema, IDE intellisense) does not

---

### Correction 2: `.refine()` does NOT throw — also silent pass-through

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.string().refine((s) => s.length > 0, { message: 'must not be empty' })`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "string"
}
```

The original D2 evidence (synthesizing from docs) said `.refine()` "throws by default." Empirical behavior is **silent pass-through** — the predicate and message are simply dropped. Same as `.brand()`. The `unrepresentable: 'any'` option has no effect (output identical).

**Implications:**
- Custom validation predicates that aren't expressible in JSON Schema are silently lost on emit
- Downstream JSON Schema consumers see only the underlying type — they will accept inputs that the Zod schema would reject
- For runtime safety, the Zod schema (not the JSON Schema export) must remain the validator on the write path

---

### Confirmation: `.transform()` DOES throw

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.string().transform((s) => s.toUpperCase())`

```
THREW: Transforms cannot be represented in JSON Schema
```

This matches the docs and the original D2 evidence. Transforms are the only construct in the test set that hard-throws by default.

---

### New finding: `z.number().int()` emits implicit safe-integer bounds when no `.min/.max` is set

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.number().int()` (without explicit bounds) inside an object with `.default(0)`

```json
{
  "type": "integer",
  "minimum": -9007199254740991,
  "maximum": 9007199254740991,
  "default": 0
}
```

`-9007199254740991` is `Number.MIN_SAFE_INTEGER`; `9007199254740991` is `Number.MAX_SAFE_INTEGER`. Every `z.number().int()` gets these bounds emitted regardless of whether the schema author specified them. This was not surfaced in the original D2 evidence (synthesized from docs).

**Implications:**
- Downstream consumers (form libraries, IDE intellisense) see explicit bounds even when the schema is "any int"
- The bounds are accurate (JS can't represent integers outside this range losslessly), but may surprise consumers who expect `{type: "integer"}` only
- No way to disable in observed configurations

---

### Confirmation: `.default()` mode behavior matches docs (`io: "input"` vs `"output"`)

**Confidence:** CONFIRMED (empirical)
**Test cases:** `z.object({ port: z.number().int().default(0) })` under both modes

**Output mode (default):** field appears in `required[]`:
```json
{
  "properties": { "port": { "default": 0, ... } },
  "required": ["port"],
  "additionalProperties": false
}
```

**Input mode (`io: 'input'`):** field NOT in `required[]`:
```json
{
  "properties": { "port": { "default": 0, ... } }
}
```

In input mode, `additionalProperties: false` is also suppressed (matches the D2 evidence finding).

**Implications:**
- For form-UI rendering (where form sees post-default values): `io: 'output'` is correct
- For write-back validation (where raw user input may omit defaulted fields): `io: 'input'` is correct
- Mode pick is load-bearing for any schema with defaults — incorrect choice silently produces wrong-shape JSON Schema

---

### Confirmation: `.pipe()` emits the right side only

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.string().pipe(z.string().max(10))`

```json
{
  "type": "string",
  "maxLength": 10
}
```

The pipe's left side is dropped; only the post-pipe schema is emitted. For a pipe chain that includes a `.transform()`, the same `Transforms cannot be represented` throw applies.

---

### Correction 3: `z.nullable()` emits `anyOf`, not `oneOf`

**Confidence:** CONFIRMED (empirical)
**Test case:** `z.nullable(z.string())`

```json
{
  "anyOf": [
    { "type": "string" },
    { "type": "null" }
  ]
}
```

The original D2 evidence (paraphrasing the docs) said `z.nullable(T)` emits `oneOf: [T, {type:"null"}]`. Actual emit uses `anyOf`. Functionally equivalent for nullable types (the variants are mutually disjoint), but downstream tooling that distinguishes `oneOf` from `anyOf` will see `anyOf`.

---

### Confirmation: `z.discriminatedUnion()` emits clean `oneOf` with `const` discriminators

**Confidence:** CONFIRMED (empirical)

```json
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "const": "a" },
        "value": { "type": "string" }
      },
      "required": ["kind", "value"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "const": "b" },
        "count": { "type": "number" }
      },
      "required": ["kind", "count"],
      "additionalProperties": false
    }
  ]
}
```

Clean. Form libraries that key off `oneOf` + `const` for tag-based variant rendering get exactly the shape they expect.

---

### Confirmation: `z.lazy()` recursive emits root-relative `$ref: "#"`

**Confidence:** CONFIRMED (empirical)
**Test case:** Recursive `Tree = { value: string; children?: Tree[] }`

```json
{
  "type": "object",
  "properties": {
    "value": { "type": "string" },
    "children": {
      "type": "array",
      "items": { "$ref": "#" }
    }
  },
  "required": ["value"],
  "additionalProperties": false
}
```

Recursion is encoded as a root-relative `$ref`. Default `cycles: 'ref'` is at work.

---

### Confirmation: Object policies emit as documented

**Confidence:** CONFIRMED (empirical)

| Zod construct | `additionalProperties` |
|---|---|
| `z.object()` (default) | `false` |
| `z.strictObject()` | `false` (same as default) |
| `z.looseObject()` | `{}` (allows any extras) |

In input mode (not tested per-construct here, but implied by the `.default()` test): `additionalProperties: false` is suppressed.

---

### Confirmation: Draft target switches `$schema` URI; field set is otherwise nearly identical for this corpus

**Confidence:** CONFIRMED (empirical)
**Test cases:** Same `z.object({ port: z.number().int().default(0) })` under `target: 'draft-07'` vs default 2020-12

Identical bodies (`type`, `properties`, `required`, `additionalProperties`, `default`, `minimum`, `maximum`); only `$schema` URI differs:
- draft-07: `"http://json-schema.org/draft-07/schema#"`
- draft-2020-12 (default): `"https://json-schema.org/draft/2020-12/schema"`

For the OK config schema's actual constructs (no `$dynamicRef`, no `unevaluatedProperties`, no draft-2020-12-only features), the artifact is portable across both targets — pinning `target: 'draft-07'` is functionally cheap and unlocks SchemaStore + RJSF default + parts of YAML LSP.

---

## Updated coverage matrix (with empirical corrections)

| Zod construct | Behavior under `z.toJSONSchema()` | Original D2 claim | Empirical |
|---|---|---|---|
| `.brand<>()` | Silent pass-through as underlying type | UNCERTAIN — docs ambiguous | **Pass-through CONFIRMED** |
| `.refine()` | Silent pass-through, predicate dropped | "Throws by default" | **Pass-through (correction)** |
| `.transform()` | Throws "Transforms cannot be represented" | Throws | Throws CONFIRMED |
| `.pipe()` | Emits right side; throws if right contains transform | (unstated) | Right side only CONFIRMED |
| `.default()` (output mode) | In `required[]`; default in `properties[k]` | required + default | CONFIRMED |
| `.default()` (input mode) | NOT in `required[]`; default in `properties[k]`; `additionalProperties: false` suppressed | not required + default | CONFIRMED |
| `.optional()` | NOT in `required[]`; otherwise emit underlying | not required | CONFIRMED |
| `z.number().int()` (no bounds) | Emits implicit safe-integer bounds | (unstated) | **Implicit bounds CONFIRMED (new)** |
| `z.nullable(T)` | `anyOf: [T, {type:"null"}]` | `oneOf: [...]` | **`anyOf` (correction)** |
| `z.discriminatedUnion` | `oneOf` with `const` discriminators | `oneOf` | CONFIRMED |
| `z.lazy()` recursive | `$ref: "#"` (root-relative) | `$defs`+`$ref` | Root-relative `$ref` CONFIRMED (default `cycles: 'ref'`) |
| `z.object()` | `additionalProperties: false` | strict | CONFIRMED |
| `z.strictObject()` | `additionalProperties: false` | strict | CONFIRMED |
| `z.looseObject()` | `additionalProperties: {}` | omitted | CONFIRMED |
| `z.string().regex()` | `pattern: '...'` | pattern preserved | CONFIRMED |
| `z.string().url()` | `format: "uri"` | URI format | CONFIRMED |
| `target: 'draft-07'` | `$schema: "http://json-schema.org/draft-07/schema#"` | draft-07 supported | CONFIRMED, same body |

---

## Implications for the report

**D2 finding refinements:**
- The "Zod's superset over JSON Schema is not round-trippable" framing remains correct; what's revised is that the loss happens **silently** for `.brand()` and `.refine()`, not via thrown errors as the original evidence suggested. Only `.transform()` (and pipes containing transforms) hard-throws.
- This is significant for downstream tooling: a developer who validates input via Zod `.refine()` and assumes the same predicate runs in a form library that consumes the JSON Schema export will be surprised — the predicate is silently dropped.

**For OK's actual schema** (per `packages/cli/src/config/schema.ts`):
- No `.brand()`, `.refine()`, or `.transform()` use today — emit is fully lossless
- Heavy `.default()` use across `content`, `sync`, `server`, `persistence`, `mcp` — the `io: 'input' | 'output'` mode pick is load-bearing
- Multiple `.regex()` validators (`server.host`, `FolderRule.match`) — emit cleanly as `pattern`
- `min(1)`, `min(0)`, `max(65535)` numeric bounds — emit cleanly

**Mode-pick guidance** (factual, not prescriptive): for a form-UI render where the form should display defaults pre-filled, `io: 'output'` matches the field-required semantics. For validation of user-submitted patches that may omit defaulted fields, `io: 'input'` matches the "default applies if absent" semantics.

---

## Sources

- Empirical test script: `/tmp/zod-empirical-test.ts` (23 test cases)
- Raw output: `/tmp/zod-test-output.txt`
- Zod version probed: `^4.3.6` (resolved from `packages/cli/node_modules/zod/package.json`)
- [Zod v4 JSON Schema docs](https://zod.dev/json-schema) — for cross-reference
