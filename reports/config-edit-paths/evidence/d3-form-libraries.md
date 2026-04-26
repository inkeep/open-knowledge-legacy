# Evidence: D3 — Form library pick

**Dimension:** D3 — Form library pick (RJSF / JSON Forms / react-formgen / uniforms)
**Date:** 2026-04-25
**Sources:** library official docs + GitHub repos, npm package pages, comparison articles, react-formgen source (local OSS clone)

---

## Test schema (used as the concrete benchmark across all four libraries)

OK's actual config schema reduced to its shape characteristics:
- Nested objects with defaults
- Optional fields (`sync.enabled?: boolean` — tri-state)
- Arrays of objects (`folders: FolderRule[]`)
- Regex-validated strings (`server.host`, `FolderRule.match`)
- Min/max-bounded numbers
- `z.string().url().optional()`
- `.strict()` objects

---

## Key files / pages referenced

- [react-jsonschema-form GitHub](https://github.com/rjsf-team/react-jsonschema-form) — 15.8k stars, v6.5.1, 10 official themes
- [RJSF arrays docs](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/arrays/) — built-in move-up/move-down/add/remove
- [RJSF themes](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/themes/) — full theme list
- [@rjsf/shadcn npm](https://www.npmjs.com/package/@rjsf/shadcn) — Tailwind-applied
- [JSON Forms GitHub](https://github.com/eclipsesource/jsonforms) — 2.7k stars, v3.7.0
- [JSON Forms rules docs](https://jsonforms.io/docs/uischema/rules/) — `failWhenUndefined` for tri-state
- [JSON Forms vs RJSF comparison (dev.to)](https://dev.to/yanggmtl/schema-driven-forms-in-react-comparing-rjsf-json-forms-uniforms-formio-and-formitiva-2fg2)
- [uniforms GitHub](https://github.com/vazco/uniforms) — 2.1k stars, multiple bridges
- [uniforms-bridge-zod npm](https://www.npmjs.com/package/uniforms-bridge-zod) — v4.0.0 stable
- [uniforms.tools](https://uniforms.tools/) — homepage / theme list
- [react-formgen GitHub](https://github.com/m6io/react-formgen) — local at `~/.claude/oss-repos/react-formgen/`
- `~/.claude/oss-repos/react-formgen/packages/zod/src/utils/*.ts` — Zod walker source

---

## Findings

### Library: react-jsonschema-form (RJSF)

| Capability | Finding |
|---|---|
| Schema input | **JSON Schema only.** [CONFIRMED] No native Zod adapter. Zod consumed via `z.toJSONSchema(schema)`. |
| Coverage of test schema | Most types render out-of-the-box. Zod regex translates to `pattern: '...'` and validates via Ajv. `FolderRule.match` and `server.host` regex preserved. [INFERRED, based on JSON Schema feature parity] |
| Tri-state booleans | **No first-class undefined.** [INFERRED] JSON Schema booleans are bivalent; an `optional` boolean ends up as `{type: 'boolean'}` with no required entry. The `BooleanField` renders a checkbox/select; "unset" needs custom widget (typically a 3-option dropdown via `enum: [true, false, null]`). |
| Array-of-objects | **Out-of-the-box add/remove/reorder via move-up/move-down buttons.** [CONFIRMED, RJSF docs/usage/arrays] No drag-and-drop; via custom `ArrayFieldTemplate` if needed. `orderable`, `addable`, `removable` toggle via `ui:options`. |
| Defaults | Inline via JSON Schema `default` keyword. `formData` shows the default unless explicitly set otherwise. [CONFIRMED] |
| Regex error display | Built-in via Ajv; error renders below field. Custom messages via `ajv-errors` plugin. |
| Theme integration | **10 official themes** [CONFIRMED]: `@rjsf/mui` (MUI v7), `@rjsf/chakra-ui` (v3), `@rjsf/antd`, `@rjsf/react-bootstrap`, core (Bootstrap 3), `@rjsf/daisyui`, `@rjsf/fluentui-rc`, `@rjsf/mantine`, `@rjsf/semantic-ui`, **`@rjsf/shadcn`** (requires `@rjsf/core >= 6`, applies via Tailwind). Community `m6io/rjsf-tailwind` exists. |
| Bundle size | core+utils+validator-ajv8: ~80–120 KB gzipped, plus theme. [INFERRED — Ajv8 alone is ~30 KB gz] |
| Maintenance | **15.8k stars, last commit Apr 18 2026 (v6.5.1), 176 open issues, 504K weekly downloads** [CONFIRMED]. Most active in field. |
| Re-render cost | "Tighter coupling of business logic to UI components" cited as a re-render hotspot at scale. [CONFIRMED, dev.to comparison] |
| Read-only mode | `readonly` prop on Form, also per-field via `ui:readonly`. [CONFIRMED] |

---

### Library: JSON Forms (eclipsesource)

| Capability | Finding |
|---|---|
| Schema input | **JSON Schema only**, plus a separate UI Schema for layout/rules. [CONFIRMED] No Zod adapter; same `z.toJSONSchema()` bridge cost as RJSF. |
| Coverage of test schema | All types renderable; conditional `enable/disable` is a first-class Rule with `condition` + `effect`. |
| Tri-state booleans | **First-class** [CONFIRMED, jsonforms.io/docs/uischema/rules]: rule conditions distinguish `undefined` from `false` — *"If the scope resolves to undefined, the JSON schema will successfully validate and the condition will be applied,"* overridable via `failWhenUndefined: true`. The most explicit tri-state semantics in this set. |
| Array-of-objects | Renderers exist; details on add/remove/reorder UX not surfaced in docs probe. Vanilla + Material renderer sets. |
| Defaults | Via JSON Schema `default`. Shown inline. [INFERRED] |
| Regex error display | Validation result delivered via `onChange({data, errors})`; renderer-dependent error display. |
| Theme integration | **5 official renderer sets** [CONFIRMED]: React Vanilla, React Material, Angular Material, Vue Vanilla, Vue Vuetify. **No official Tailwind or shadcn.** Custom renderers possible. |
| Bundle size | `@jsonforms/core` + `@jsonforms/react` + a renderer set; Material renderer pulls MUI. ~100–150 KB gzipped for Material; vanilla smaller. [INFERRED] |
| Maintenance | **2.7k stars, v3.7.0 (Nov 2025), 135 open issues** [CONFIRMED]. Steady; Eclipse Source–backed enterprise tool. |
| Re-render cost | "Optimized for performance, especially with large forms, minimizing unnecessary re-renders" via cleaner data/UI separation. [CONFIRMED, comparison articles] |
| Read-only mode | `readonly` prop on JsonForms component. [CONFIRMED] |

---

### Library: react-formgen

| Capability | Finding |
|---|---|
| Schema input | **Three packages: `@react-formgen/json-schema`, `@react-formgen/yup`, `@react-formgen/zod`** [CONFIRMED, repo README]. Zod package is direct input — no JSON Schema bridge. |
| Zod version targeting | **`zod/v4/core` imports throughout** [CONFIRMED, source at `packages/zod/src/utils/*.ts`]. Peer dep `zod ^3.25.61`. Targets the v4 internal API (`_zod.def`). |
| Coverage of test schema | The `unwrapSchema` walker handles `optional`, `nullable`, `default`, `prefault`, `readonly`, `nonoptional` wrappers. `RenderTemplate` switches on `def.type` for `string`, `number`, `boolean`, `bigint`, `date`, `object`, `array`, `enum`, `union`, `tuple`. **`object` and `array` covered** — `FolderRule[]` would render. `min_size` array check honored when generating initial data. [CONFIRMED, source]. **Not covered:** `record`, `intersection`, `discriminatedUnion`, `lazy`, `pipe`, `transform` — `RenderTemplate` logs `console.error` and returns `null` for unknown types. The OK test schema avoids these, so it should fully render. |
| Tri-state booleans | **`isOptional()` returns `true` for `optional` wrapper; `generateInitialData` returns `undefined` for optional booleans without defaults** [CONFIRMED, `isOptional.ts`, `generateInitialData.ts`]. The library structurally distinguishes "unset" from `false` — unique among the four. Whether the user-supplied `BooleanTemplate` actually renders that as a third UI state is up to the consumer. |
| Array-of-objects | `useArrayTemplate` hook + user-supplied `ArrayTemplate`. [CONFIRMED, README mermaid] No built-in add/remove/reorder UI — **headless**, you write it. `min_size` Zod check pre-fills `Array(minSize).fill(...)`. |
| Defaults | `getDefaultValue()` recurses through wrappers to find `.default()` and calls the function form if present [CONFIRMED, `getDefaultValue.ts`]. Inline default rendering. |
| Regex error display | Errors live as `z.$ZodIssue[]`; `useErrorsAtPath(path)` returns issues at a specific JSON path. [CONFIRMED, `index.ts`]. UI display is up to the consumer's templates. |
| Theme integration | **Headless** [CONFIRMED, README]. No imposed UI. **Templates are required props** — `Templates` type forces a template for every type (`StringTemplate`, `NumberTemplate`, `BooleanTemplate`, `BigIntTemplate`, `DateTemplate`, `ArrayTemplate`, `ObjectTemplate`, `UnionTemplate`, `TupleTemplate`, `EnumTemplate`). **Direct shadcn/Tailwind-friendly** — no theme migration; just shadcn `<Input>`/`<Select>` inside template components. |
| Bundle size | Minimal core — Zustand state + walker. Zod itself is the heavyweight. [INFERRED] Likely smallest of the four for runtime cost. |
| Maintenance | **69 stars, 1 open issue, 83 commits, version `0.0.0-alpha.27`** [CONFIRMED, GitHub + package.json]. Single-maintainer (`m6io`); also authors `rjsf-tailwind`. **Alpha** — pre-1.0 and pre-stable-version. **Highest project risk in the set.** |
| Read-only mode | `readonly` prop on Form, threaded into FormProvider. [CONFIRMED, types.ts] |

---

### Library: uniforms

| Capability | Finding |
|---|---|
| Schema input | **Multiple bridges**: JSON Schema, SimpleSchema/SimpleSchema2, GraphQL, **Zod** (`uniforms-bridge-zod`) [CONFIRMED, vazco repo]. Custom bridge via thin wrapper. |
| Zod bridge state | **`uniforms-bridge-zod` v4.0.0** stable, last published ~3 months ago per npm [CONFIRMED]. Zod v3 + v4 supported. |
| Coverage of test schema | Bridges generate JSON Schema-equivalent metadata. Object nesting + arrays + optional + defaults supported. Regex via Zod's regex check. |
| Tri-state booleans | **No documentation surfaced** for distinguishing `undefined` vs `false`. [INFERRED — likely bivalent like RJSF, since uniforms's Bool field is a checkbox]. Workaround: `z.enum(['auto', 'on', 'off'])` instead of optional boolean. |
| Array-of-objects | `ListField` + `ListItemField` + `ListAddField` / `ListDelField` are built-in fields. [CONFIRMED]. Add/delete UX is automatic; reordering not built-in. |
| Defaults | `defaultValue` per field [CONFIRMED, uniforms.tools example]. Honored on initial render. |
| Regex error display | Validation through the bridge's validator (Zod's own validator for the Zod bridge). Error component per theme. |
| Theme integration | **6 official themes** [CONFIRMED]: AntD, Bootstrap4, Bootstrap5, MUI, Semantic UI, Plain HTML. **No official Tailwind or shadcn.** "Plain HTML" is the unstyled escape hatch — could be wrapped with shadcn manually. |
| Bundle size | uniforms core + bridge + theme: ~50–100 KB gzipped depending on theme. [INFERRED] |
| Maintenance | **2.1k stars, 25 open issues, 1737 commits, MIT, Vazco-maintained** [CONFIRMED]. Steady but lower velocity than RJSF. |
| Re-render cost | Cited alongside RJSF as struggling at scale per dev.to comparison; "performs well for small forms but struggle at scale." [CONFIRMED] |
| Read-only mode | `readOnly` prop on AutoForm/QuickForm. [CONFIRMED] |

---

## Test-schema coverage matrix (cross-library)

| Test-schema feature | RJSF | JSON Forms | react-formgen (zod) | uniforms (zod) |
|---|---|---|---|---|
| Nested objects (`content`, `mcp.tools.read_document`) | ✓ | ✓ | ✓ | ✓ |
| Optional fields with defaults (`pushIntervalSeconds.default(60)`) | ✓ via JSON Schema `default` | ✓ | ✓ recursive `getDefaultValue` | ✓ |
| Array-of-objects (`folders: FolderRule[]`) | ✓ built-in move/add/remove | partial — renderer-dependent | requires-custom — headless ArrayTemplate | ✓ ListField add/del, no reorder |
| Regex strings (`server.host`, `FolderRule.match`) | ✓ via JSON Schema `pattern` | ✓ | ✓ via Zod check | ✓ via Zod check |
| Tri-state boolean (`sync.enabled?: boolean`) | requires-custom (3-value enum) | ✓ first-class via `failWhenUndefined` | ✓ structural via `isOptional` | requires-custom |
| Conditional enable/disable | ✓ via `oneOf`/`dependencies` + `ui:disabled` | ✓ first-class Rules (HIDE/SHOW/DISABLE/ENABLE) | requires-custom (consumer template logic) | partial (via custom field) |
| Direct Zod input | ✗ requires `z.toJSONSchema()` | ✗ requires bridge | ✓ native | ✓ via uniforms-bridge-zod |
| Read-only "view config" mode | ✓ | ✓ | ✓ | ✓ |
| shadcn/Tailwind theme | ✓ `@rjsf/shadcn` (v6+) | ✗ no official | ✓ trivially (headless) | ✗ no official |

---

## Cross-cutting observations

- **The Zod-direct path is exactly two libraries: react-formgen and uniforms-bridge-zod.** RJSF and JSON Forms both require a one-way Zod→JSON-Schema bridge. Zod 4's `z.toJSONSchema()` makes that bridge cheap, but it loses Zod-only refinements (custom messages, `.refine()`, branded types).
- **"Headless" vs "batteries-included" is the cleanest axis** of differentiation — RJSF, JSON Forms, uniforms ship pre-styled themes; react-formgen ships zero UI and forces you to write every template. RJSF's `@rjsf/shadcn` is the only batteries-included competitor with first-class shadcn support.
- **Tri-state boolean handling diverges sharply.** JSON Forms is the only one with explicit `failWhenUndefined` semantics in its rules engine. react-formgen distinguishes structurally via `isOptional`, but UI rendering is consumer-owned. RJSF and uniforms collapse `undefined` and `false` at the widget level.
- **Maintenance signal varies by ~250x.** RJSF: 15.8k stars, 504K weekly downloads, active v6 in flight. JSON Forms: 2.7k stars, enterprise-backed, slower cadence. uniforms: 2.1k stars, steady. react-formgen: 69 stars, alpha, single-maintainer — **highest project risk by orders of magnitude**.
- **Performance trait reported in comparison articles**: JSON Forms cited as best-optimized for large-form re-renders due to data/UI separation; RJSF and uniforms cited as struggling at scale. For a ~30-field config UI that's not load-bearing.
- **react-formgen's Zod-v4 internal-API dependency** (`zod/v4/core`, `_zod.def`) is sharp coupling — any Zod 4.x bump that changes that surface area breaks the library. Uniforms's Zod bridge sits at the public Zod API level.
- **JSON Forms' UI Schema dual-document model** is the most expressive for laying out a settings UI (group fields, tabs, conditional sections) but requires authoring + maintaining a second schema alongside the data schema. The other three derive layout from the data schema directly.

---

## Negative searches

- **Searched:** "react-formgen Tailwind shadcn theme example"; sources: GitHub repo, website → result: not surfaced; the "headless" stance means there is no official theme — consumers wire shadcn directly
- **Searched:** "uniforms shadcn theme adapter community"; sources: npm, GitHub → result: not found; "Plain HTML" theme is the escape hatch
- **Searched:** "JSON Forms shadcn renderer"; sources: jsonforms.io, GitHub → result: not found; would require custom renderer set

---

## Gaps / follow-ups

- Empirical bundle-size measurement for each library at minimal-config + theme — sizes here are INFERRED from package internals
- Whether `@rjsf/shadcn` is feature-complete vs core (per-package READMEs vary)
- React 19 / React Compiler compatibility for each library — none surfaced; likely all work but unverified
