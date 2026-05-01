---
title: "Config WYSIWYG via react-hook-form + zodResolver — viability"
description: "Assessment of porting the inkeep/agents-private RHF + zodResolver + shadcn-Form pattern onto Open Knowledge's Hocuspocus-bound Settings pane."
status: provisional
created: 2026-04-30
authors: [Andrew]
tags: [config, settings, forms, zod, react-hook-form, shadcn]
sources:
  - packages/app/src/components/settings/SettingsPane.tsx
  - packages/app/src/components/settings/schema-walker.ts
  - packages/core/src/config/schema.ts
  - packages/core/src/config/field-registry.ts
  - packages/core/src/config/bind-config-doc.ts
  - specs/2026-04-25-config-edit-paths/SPEC.md
  - "agents-private: public/agents/agents-manage-ui/src/components/projects/form/project-form.tsx"
  - "agents-private: public/agents/agents-manage-ui/src/components/form/generic-input.tsx"
  - "agents-private: public/agents/agents-manage-ui/src/components/form/form-field-wrapper.tsx"
  - "agents-private: public/agents/agents-manage-ui/src/components/ui/form.tsx"
  - "agents-private: public/agents/agents-manage-ui/src/components/triggers/trigger-form.tsx"
---

# Config WYSIWYG via react-hook-form + zodResolver — viability

## Question (decoded)

> *"The special WYSIWYG editor for `config.yaml` should use a similar approach to what we do in the agents repo with zodResolver and react-hook-form generation from a zod schema. Explore the concept and its viability in our platform. Stay with shadcn (agents-ui uses custom form components) per [Form](https://ui.shadcn.com/docs/forms/react-hook-form) + [Field](https://ui.shadcn.com/docs/components/radix/field)."*

Two axes are conflated in the ask, and they're worth separating:

- **Axis A — Binding harness.** Replace OK's hand-rolled per-control pending/commit/error machinery in [`SettingsPane.tsx`](../../packages/app/src/components/settings/SettingsPane.tsx) with `useForm({ resolver: zodResolver(ConfigSchema) })`.
- **Axis B — Auto-generation.** Walk `ConfigSchema` once and render the form structurally, instead of the hand-listed `SECTIONS` array currently in `SettingsPane.tsx:81`.

Adopting A doesn't require B. Agents-ui itself stops at A — every form there is hand-written field-by-field with `<GenericInput control={form.control} name="…" />`. The "generation from a zod schema" phrasing in the ask points at B, which is a bigger lift sitting on top of A.

## TL;DR

- **Axis A is viable** and a net simplification. The schema is already Zod v4 (`packages/core/src/config/schema.ts`); agents-private runs the same Zod major (`zod: ^4.3.6` in [agents-manage-ui/package.json](https://github.com/inkeep/agents-private/blob/main/public/agents/agents-manage-ui/package.json)) on `react-hook-form: ^7.61.1` + `@hookform/resolvers` v5 with the standard-schema-aware `zodResolver`. The `field.tsx` shadcn primitive is already installed in `packages/app/src/components/ui/field.tsx`; the missing piece is `form.tsx` (the RHF-bound `Form`/`FormField`/`FormControl`/`FormMessage` wrapper agents-ui pulls in via [shadcn](https://ui.shadcn.com/docs/forms/react-hook-form#set-up-the-form)).
- **The CRDT integration cost is small but real.** The whole point of the [config-edit-paths spec](../../specs/2026-04-25-config-edit-paths/SPEC.md) is that `config.yml` lives in a Hocuspocus Y.Text doc, not request/response. RHF expects to own form state; OK's source of truth is `binding.current()`. The bridge is one-line — `form.reset(config, { keepDirtyValues: true })` from a Y.Text observer — and the dirty-value preservation matches the existing "don't stomp user-in-progress edits" logic that `StringControl` already implements by hand.
- **Axis B is feasible but should be deferred.** The custom schema walker (`packages/app/src/components/settings/schema-walker.ts`) and the `fieldRegistry` already carry 80% of what's needed (`getLeafTypeTag`, `getEnumOptions`, `getFieldDefault`, `scope`, `agentSettable`). Extending `fieldRegistry` with `label` / `description` / `section` and walking it would replace the hand-written `SECTIONS` array — but agents-ui doesn't do this, and the ROI vs. surface-area-of-divergence-from-agents-ui argues for hand-written field lists in v1.
- **The unique win we should chase is `useFieldArray` for `folders[]`.** Today's pane doesn't render `folders[]` at all (`SECTIONS` omits it); textarea-newline-join — the trick `StringControl` plays for `content.include` / `content.exclude` — does not generalize to an array of `{ match, frontmatter: { title, description, tags[] } }` objects. RHF's `useFieldArray` is the canonical pattern for this exact shape (agents-ui uses it for `signedComponents` in [`trigger-form.tsx`](https://github.com/inkeep/agents-private/blob/main/public/agents/agents-manage-ui/src/components/triggers/trigger-form.tsx)). This is the strongest *forward* motivation for adopting RHF, not a parity-with-agents argument.

**Recommendation:** Adopt Axis A as a focused refactor of `SettingsPane.tsx` paired with first-class `folders[]` support via `useFieldArray`. Keep the section list hand-written. Defer Axis B until we have ≥3 schema-driven views (Settings + something else) so we're not generalizing from N=1.

## What the agents-private pattern actually looks like

Concrete shape, distilled from `agents-manage-ui`:

```tsx
// project-form.tsx (representative)
const form = useForm<ProjectFormData>({
  resolver: zodResolver(projectSchema),
  defaultValues: initialData ?? defaultValues,
});

const onSubmit = form.handleSubmit(async (data) => {
  const res = await updateProjectAction(tenantId, projectId, serializeData(data));
  if (!res.success) toast.error(res.error);
  else { toast.success('Updated'); onSuccess?.(data.id); }
});

return (
  <Form {...form}>
    <form onSubmit={onSubmit} className="space-y-8">
      <GenericInput control={form.control} name="name" label="Name" isRequired />
      <GenericInput control={form.control} name="id" label="Id" disabled={!!projectId} />
      <GenericTextarea control={form.control} name="description" label="Description" />
      <ProjectModelsSection control={form.control} disabled={readOnly} />
      <Button type="submit" disabled={isSubmitting}>Update project</Button>
    </form>
  </Form>
);
```

Three layers, all pulled in:

1. **Form primitive** at `src/components/ui/form.tsx` — a 1:1 copy of [shadcn's RHF-bound Form](https://ui.shadcn.com/docs/forms/react-hook-form) (`FormProvider`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField()`). Same `aria-describedby`/`aria-invalid` wiring shadcn ships.
2. **`FormFieldWrapper`** at `src/components/form/form-field-wrapper.tsx` — thin adapter that takes `control`/`name`/`label` and renders `FormField` → `FormItem` → `FormLabel` → `children(field)` → `FormDescription` → `FormMessage`. Pure boilerplate compaction.
3. **Generic field components** (`GenericInput`, `GenericTextarea`, `GenericSelect`, `GenericKeyValueInput`, …) wrap `FormFieldWrapper` and slot in the right `FormControl` body (Input, Textarea, Select, etc.) plus type-specific transforms (e.g. `(v) => v === '' ? null : Number(v)` for numeric inputs).

Nested-array editing (e.g. webhook `signedComponents` in `trigger-form.tsx`) uses RHF's `useFieldArray`:

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'signedComponents' });
fields.map((f, i) => (
  <GenericSelect control={control} name={`signedComponents.${i}.source`} label="Source" />
  <GenericInput control={control} name={`signedComponents.${i}.key`} label="Key" />
  <Button onClick={() => remove(i)}>Remove</Button>
));
<Button onClick={() => append({ source: 'header', key: '', required: true })}>Add</Button>
```

Validation is **submit-shaped** — `form.handleSubmit(asyncServerAction)`. There is no per-field auto-save in agents-ui; RHF's onSubmit handler dispatches a server action and uses `toast.error(res.error)` for failures. zodResolver populates `formState.errors` per-field, and `FormMessage` reads from `useFormField().error` to render inline messages.

## What OK's Settings pane looks like today

The current `SettingsPane.tsx` is structurally a different beast — it's not bad, just *different*:

| Concern | agents-ui (RHF) | OK Settings pane |
|---|---|---|
| State owner | RHF (`form.control`) | Each control's `useState` + `useRef(lastCommitted)` |
| Commit timing | `form.handleSubmit` on submit | Auto-save per-control on `blur`/`Enter` |
| Validation | `zodResolver(schema)` per-field via `formState.errors` | `binding.patch()` runs `ConfigSchema.safeParse(merged)` (L1) — return value carries `Result.err` with structured issues; control's `useState<error>` renders `<p role="alert">` |
| Source of truth | `defaultValues` + form state | Y.Text on a Hocuspocus doc → `binding.current()` |
| External-update merge | n/a (no live updates) | Y.Text observer fires → `setState(prev => …)` re-render → controls' "if pending matches lastCommittedRef, take new value" pattern |
| Field types covered | Whatever the form lists | `boolean`, `enum`, `number`, `int`, `string`, `string[]` (newline-join textarea) |
| Array of objects | `useFieldArray` | **Not handled** — `folders[]` is absent from `SECTIONS` |
| Accessibility | shadcn `FormControl`'s aria-* wiring | Hand-wired `aria-describedby`/`aria-invalid` per control |
| Reset-to-default | n/a | RotateCcw button per field; clears via `binding.patch(null-as-clear)` |
| Modified-at-scope indicator | n/a | Computed from `valuesEqual(currentValue, defaultValue)` |
| L3 rejection (server revert) | n/a | `subscribeToConfigValidationRejected` → toast + 600 ms field flash |

The `bindConfigDoc` API (in `packages/core/src/config/bind-config-doc.ts`) is the load-bearing piece. It does **single-shot full-config validation** before mutating Y.Text:

```ts
patch(patch: ConfigPatch): Result<{effective, appliedPaths}, ConfigValidationError>
```

The patch input is a deep-partial; the binding round-trips through yaml@2 Document, runs `ConfigSchema.safeParse(merged)` (L1), and only then atomically replaces Y.Text content. Validation operates on the *merged effective config*, not on isolated field values — this is non-negotiable because cross-field constraints (e.g. `preview.baseUrl` URL + `scope: 'workspace'` registry constraint per FR-32) need the full document.

The schema walker at `packages/app/src/components/settings/schema-walker.ts` already exposes:

- `resolveLeafSchema(ConfigSchema, path)` — descend by path, returning the leaf Zod type.
- `getLeafTypeTag(schema)` — strips `.default()`/`.optional()`/`.nullable()` wrappers, returns `'boolean'|'enum'|'number'|'int'|'string'|'array'|...`.
- `getEnumOptions(schema)` — `['light','dark','system']` style.
- `getFieldDefault(schema)` — pulls from any wrapped `ZodDefault`.
- `getFieldMeta(schema)` (from `packages/core/src/config/field-registry.ts`) — `{scope, agentSettable, defaultScope?}`, the bedrock of the "this field can only be set per-project / globally" UI.

These primitives already exist; they survive *whatever* we choose for the binding harness.

## Mapping the agents pattern onto OK

### Required adapters

**1. Bridging Y.Text → form state.**

```ts
function useConfigForm(binding: ConfigBinding) {
  const form = useForm<Config>({
    resolver: zodResolver(ConfigSchema),
    defaultValues: binding.current(),
    mode: 'onBlur',                  // commit timing — per-blur, not per-submit
  });

  useEffect(() => {
    const unsub = binding.subscribe((next) => {
      form.reset(next, {
        keepDirtyValues: true,       // user-in-progress edits survive remote updates
        keepDirty: true,
        keepTouched: true,
      });
    });
    return unsub;
  }, [binding, form]);

  return form;
}
```

`keepDirtyValues: true` is the RHF idiom for "remote updates land on non-dirty fields, leave dirty fields alone." It maps cleanly onto OK's existing `lastCommittedRef === pending` heuristic and is more robust (RHF's dirty-tracking is per-field, not per-control-instance).

**2. Bridging form state → patch.** Each blur/change handler calls `binding.patch(buildPatch(name, getValues(name)))`. `buildPatch` already exists in `schema-walker.ts:28`. The commit collapses cleanly:

```ts
<FormField
  control={form.control}
  name="mcp.tools.search.maxResults"
  render={({ field }) => (
    <FormItem>
      <FormLabel>search max results</FormLabel>
      <FormControl>
        <Input
          type="number"
          {...field}
          onBlur={() => {
            const patch = buildPatch(['mcp','tools','search','maxResults'], field.value);
            const result = binding.patch(patch);
            if (!result.ok) form.setError(field.name, { message: humanFormat(result.error) });
          }}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**3. Bridging L1 errors → `formState.errors`.** Two options:

- **A.** Let zodResolver run on every blur (`mode: 'onBlur'` is enough). RHF populates `formState.errors[path]`. `FormMessage` renders. Validation runs against the FORM values — but at every blur the form values *are* the merged config (because we initialized from `binding.current()`), so this is correct. We *also* call `binding.patch` to commit; if the patch returns a structured error, mirror it into `form.setError`.
- **B.** Skip RHF validation entirely (`resolver: undefined`); rely solely on `binding.patch` for validation, surface its `ConfigValidationError` issues via `form.setError`. This keeps the L1/L2/L3 layering canonical (one Zod safeParse, in `bindConfigDoc`).

**B is the better fit** — it preserves the spec's three-layer story (validation runs in the binding, not in the resolver). The only thing zodResolver buys us is `formState.errors` autopopulation, which we replicate by calling `form.setError` from `binding.patch` rejections. (Cost: ~5 LoC.)

**4. L3 rejection → field flash.** Already wired via `subscribeToConfigValidationRejected`. The first issue path can be passed to `form.setError(path, {message})` and `setFocus(path)` to highlight the offending field. The 600 ms animate-flash class stays attached to the rendered `<FormItem>` via `data-flash` attribute.

### What goes away

- `StringControl` / `NumberControl` / `BooleanControl` / `EnumToggleControl` / `StringArrayControl` — replaced by `Controller`-rendered field bodies.
- The `useState(pending)` + `lastCommittedRef` logic in each control.
- The hand-wired `aria-describedby`/`aria-invalid` per control (shadcn `FormControl` does it).
- The valuesEqual / firstIssuePath helpers (RHF's `formState.dirtyFields` / `formState.errors` already give these).

### What stays

- `bindConfigDoc` and the L1/L3 validation contract — untouched.
- `fieldRegistry` + `getFieldMeta` — used by Settings pane for scope visibility.
- The hand-listed `SECTIONS` array — until we have a second consumer that justifies auto-generation.
- `IntegrationsSection` and the modified-at-scope indicator — standalone, unchanged.

### What we add

- Dependencies: `react-hook-form` (~9 kB gzip), `@hookform/resolvers` (~1 kB gzip). Bundle-size ceiling is 290 kB gz for the main app bundle (`packages/app/package.json:size-limit`); 10 kB is well within margin.
- One file: `packages/app/src/components/ui/form.tsx` (the [shadcn Form primitive](https://ui.shadcn.com/docs/forms/react-hook-form) — straight install, no fork).
- One file: `packages/app/src/components/settings/SettingsForm.tsx` (the rebuilt form using Form/FormField/FormControl).
- `useFieldArray`-driven editing for `folders[]` — adds a new section to `SECTIONS` and a hand-rolled `FoldersSection` component.

## Viability assessment

### Pros

- **CRDT semantics map cleanly.** `keepDirtyValues: true` on `form.reset` is exactly the "merge external updates without stomping user-in-progress edits" semantic OK already implements by hand. Cleaner, library-supported, less surface for bugs.
- **First-class `folders[]` editing.** `useFieldArray` solves the gap that the current pane has by omission. This is the single biggest forward feature.
- **Accessibility correctness.** `FormField` → `FormControl` → `FormMessage` shadcn wiring auto-generates `aria-describedby`/`aria-invalid`/`role="alert"` correctly. Today's hand-wiring is correct but bespoke; one upstream fix in shadcn (or one pattern divergence introduced under deadline) and it drifts.
- **Pattern parity with agents-ui.** Engineers context-switching between repos see one form pattern, not two. Skill-form, mcp-server-form, project-form all read the same way.
- **Bundle-size impact is small.** RHF + resolvers is ~10 kB gz; the bundle has 60+ kB headroom.
- **Zod v4 + RHF is supported.** `@hookform/resolvers` v5 added Zod v4 standard-schema support — see [resolvers v5 release](https://github.com/react-hook-form/resolvers/releases) and the [zodResolver entry point](https://github.com/react-hook-form/resolvers#zod). Auto-detection between v3/v4. (Type friction has been reported on certain v4 inferred-output combinations — see [resolvers#813](https://github.com/react-hook-form/resolvers/issues/813) — but is not a runtime blocker.)

### Cons / friction

- **The "validation by zodResolver" path conflicts with the L1/L3 spec.** SPEC §11 (FR-11) is specific about *one* Zod safeParse running in `bindConfigDoc.patch`, with L2 (`writeConfigPatch`) and L3 (persistence hook) as the headless and server-side mirrors. If we let zodResolver also run, that's a second L1, on form-value sub-trees rather than the merged document. We should either run RHF resolver-less and surface errors from `binding.patch.error` (the cleaner path), or accept the duplication knowing the resolver runs on the same `ConfigSchema` against the same merged values. **Conscious decision required.**
- **Auto-save vs. submit-shape.** The existing UX is *per-field auto-save with a checkmark flash* — VS Code Settings UI semantics, codified in FR-3 of the config-edit-paths spec. Agents-ui is strictly submit-shaped. We're not adopting agents-ui's commit pattern, only its binding harness. New engineers reading our code expecting agents-ui semantics will need a comment.
- **`form.reset(next, { keepDirtyValues: true })` race-condition surface.** If the user blurs field A (commit fires → CRDT roundtrip → observer fires → `form.reset`) WHILE typing in field B, RHF needs the dirty-tracking to correctly mark B as still-dirty before reset lands. RHF's tracking is synchronous against `defaultValues`; reset takes the new defaults, so B remains dirty against the *new* default and is preserved. Works, but the existing hand-rolled pattern's tradeoffs are at least visible at the call site. Worth a focused integration test (multi-tab Y.Text update with one tab actively typing).
- **`form.handleSubmit` is no longer the orchestration entry point.** Agents-ui submits whole forms; we'd be using RHF as a state container with bespoke per-field commit logic. The mental model is "RHF for state and validation; CRDT for transport," which is correct but unfamiliar relative to the agents-ui template.
- **Type friction on Zod v4 inferred outputs.** Already reported: with `transform()` chains or non-trivial `.default(... )` interactions, RHF's `useForm<z.infer<typeof schema>>` may need explicit input/output type generics. Our schema is transform-free (per the FR-18 CI test that asserts JSON Schema and `ConfigSchema.parse()` accept/reject the same fixtures), so we should be fine, but watchpoint for follow-on schema growth.
- **Auto-generation (Axis B) is tempting and shouldn't be done now.** The current `fieldRegistry` carries `scope`/`agentSettable` only. To generate the `SECTIONS` shape we'd need `label`, `description`, `section`, `controlHint`, ordering. That's a clean addition to the registry but it commits us to a `fieldRegistry`-driven UI metadata layer we don't have parallel evidence for. Worth waiting for a second UI surface.

### Open questions

- **Do we want zodResolver running, or rely solely on `binding.patch.error`?** Argues for resolver-less + `form.setError` for the cleaner three-layer story. Either works.
- **Folder rule editor UX.** `folders[]` ordering matters (the spec is explicit: "Rules apply in declaration order; later matches override earlier scalars"). `useFieldArray` supports `move(from, to)`, so drag-to-reorder is built-in — but the underlying `binding.patch` writes the entire array via `writeConfigPatch`. This is the right behavior (atomic full-array replace), but worth being explicit in code comments / tests.
- **Should we install [shadcn `auto-form`](https://shadcn-extension.vercel.app/) or the new shadcn `field.tsx`-based generator?** Probably no — it commits us to Axis B prematurely. The installed `field.tsx` is fine as a styling primitive; the RHF binding goes through `form.tsx`'s `FormField`/`FormControl` instead. Keep these two layers separate.
- **Does an auto-save-shaped RHF deviation from agents-ui patterns cause confusion?** Potentially. The first time someone copy-pastes a `form.handleSubmit(serverAction)` block from agents-ui and wires it into Settings, they'll get an undefined-behavior moment. A short comment at the top of `SettingsForm.tsx` explaining "RHF state harness, per-field auto-save via `binding.patch`" should suffice.

## Migration shape

If we go ahead, the smallest sensible scope:

1. **Install deps + shadcn Form primitive.** Add `react-hook-form` + `@hookform/resolvers` to `packages/app`. Run shadcn add for `form` (or copy [the shadcn Form source](https://ui.shadcn.com/docs/forms/react-hook-form#install-the-form-component) verbatim — it's the file agents-ui pulled in).
2. **Build `useConfigForm(binding)` hook** in `packages/app/src/components/settings/use-config-form.ts`. Wraps `useForm` + `binding.subscribe` + the `keepDirtyValues` reset bridge. Returns the form instance plus a `commitField(name)` helper that calls `binding.patch(buildPatch(name, getValues(name)))` and mirrors errors via `form.setError`.
3. **Rewrite `SettingsField` / `FieldControl` to use `Controller`.** Hand-write `Controller`s for `boolean | enum | number | string | string[]` — same dispatch as today, but rendered inside `FormField` + `FormControl`. Keep the modified-at-scope indicator and reset-to-default button as wrapping decorations.
4. **Add `folders[]` section using `useFieldArray`.** This is genuinely new functionality; it's the spec-promised completion of the schema coverage (folders is a documented schema field with no editing surface today).
5. **Delete the old per-control state machinery.** `StringControl`/`NumberControl`/etc. go away.
6. **Tests.** Integration: simulate Y.Text remote update mid-edit, assert dirty field preserved. Unit: assert `form.setError` flow on `binding.patch` rejection. Existing L1/L3 tests stay valid.

Total estimate: ~250 LoC delta net (+RHF wiring, –per-control machinery), one new section. The `folders[]` editor is the largest single chunk and the highest-value forward feature.

## Decision-relevant extracts from existing artifacts

- [`SettingsPane.tsx:81–187`](../../packages/app/src/components/settings/SettingsPane.tsx) — the hand-listed `SECTIONS`. Note the omission of `folders[]`.
- [`schema-walker.ts:28–141`](../../packages/app/src/components/settings/schema-walker.ts) — the schema introspection primitives we'd reuse unchanged.
- [`bind-config-doc.ts:178–346`](../../packages/core/src/config/bind-config-doc.ts) — `ConfigBinding.patch` + Y.Text observer wiring. The "subscribe → react" pattern that `useConfigForm` would consume.
- [`field-registry.ts`](../../packages/core/src/config/field-registry.ts) — Zod v4 wrapper-descent caveat. Same caveat affects any future "auto-generate from schema" pass; the walker is shared.
- [`specs/2026-04-25-config-edit-paths/SPEC.md` §6 FR-3, FR-5, FR-11, FR-33](../../specs/2026-04-25-config-edit-paths/SPEC.md) — auto-save-per-control commit, three-layer validation, `bindConfigDoc` API.

## External references

- [shadcn Form (RHF-bound)](https://ui.shadcn.com/docs/forms/react-hook-form) — the primitive agents-ui's `form.tsx` is a near-verbatim copy of.
- [shadcn Field primitive](https://ui.shadcn.com/docs/components/radix/field) — already installed at `packages/app/src/components/ui/field.tsx`.
- [react-hook-form/resolvers `zodResolver`](https://github.com/react-hook-form/resolvers#zod) — Zod v4 support added in resolvers v5; standard-schema-aware.
- [resolvers#813 — Zod v4 type-friction issue](https://github.com/react-hook-form/resolvers/issues/813) — open type-friction with certain v4 inferred outputs; not a runtime blocker.
- [agents-ui form patterns (private repo)](https://github.com/inkeep/agents-private/tree/main/public/agents/agents-manage-ui/src/components/form) — `GenericInput`, `GenericTextarea`, `GenericSelect`, `FormFieldWrapper`.
- [agents-ui `useFieldArray` example: trigger-form.tsx](https://github.com/inkeep/agents-private/blob/main/public/agents/agents-manage-ui/src/components/triggers/trigger-form.tsx) — nested-array editing pattern relevant to our `folders[]` need.
