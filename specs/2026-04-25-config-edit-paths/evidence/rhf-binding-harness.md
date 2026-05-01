---
title: "RHF + zodResolver as the Settings-pane binding harness — design + spec amendments"
description: "Rationale for adopting agents-private's react-hook-form pattern in Settings, and the FR/D-row amendments it implies for SPEC.md."
status: proposal
created: 2026-04-30
authors: [Andrew]
related:
  - ../SPEC.md (FR-3, FR-5, FR-11, FR-33, FR-37)
  - ../../../reports/config-zod-form-viability/REPORT.md (viability assessment)
  - ../../../reports/config-zod-form-viability/IMPLEMENTATION.md (file-by-file plan)
---

# RHF + zodResolver as the Settings-pane binding harness

## Status

**Proposal — pending approval to land in SPEC.md.**

User direction (2026-04-30): re-use the same Zod schema across client and server, validate on both, surface client errors in the UI and prevent saving the atomic unit if invalid; server validates because direct fs/CLI/MCP writes exist.

User direction follow-up (2026-04-30): atomic unit = **per-field auto-save** (preserves FR-3 + the VS Code Settings UX baseline).

## What's not changing

The validation topology described in FR-11 (D45) — **L1 client + L2 headless writers + L3 persistence-hook** — stays exactly as written. The same `ConfigSchema` from `@inkeep/open-knowledge-core` runs at all three layers. The persistence-hook's revert-via-`CONFIG_VALIDATION_REVERT_ORIGIN` (D58) and CC1 `'config-validation-rejected'` (FR-14b) remain the safety net for hand-edits, MCP writes, CLI writes, and any future fs writer.

This proposal touches **only the L1 surface** — specifically, how the Settings pane wires user input into `bindConfigDoc.patch()`. It does not change `bindConfigDoc`, `writeConfigPatch`, or the persistence hook.

## What's changing

The current `SettingsPane.tsx` (FR-37) hand-rolls per-control state machinery: each `StringControl` / `NumberControl` / `BooleanControl` / `EnumToggleControl` / `StringArrayControl` owns its own `useState(pending)` + `useRef(lastCommittedRef)` + commit-on-blur logic. The `aria-describedby` / `aria-invalid` wiring is hand-threaded per control. Field-level validation errors are rendered via a per-control `useState<error>`. `folders[]` is omitted entirely.

Replace this layer with [`react-hook-form`](https://github.com/react-hook-form/react-hook-form) and the [shadcn `Form` primitive](https://ui.shadcn.com/docs/forms/react-hook-form), matching the pattern agents-private uses in `agents-manage-ui` (`Form` + `FormField` + `FormControl` + `FormMessage` over `useForm` + `Controller`). Same Zod schema, same per-field auto-save UX, same L1 validation entry point — but the per-control state machinery, accessibility wiring, and array-of-objects handling come from the library instead of being hand-rolled.

The single forward feature this unlocks beyond parity is **first-class `folders[]` editing via `useFieldArray`** — the schema field that has no editing surface today.

## Decision: validation runs in the binding, not the resolver

`useForm` accepts an optional `resolver`. The agents-private pattern wires `zodResolver(schema)`. **We do not.** Instead:

- `useForm({ defaultValues: binding.current(), mode: 'onBlur' })` — no resolver.
- Each field's blur handler calls `binding.patch(buildPatch(name, getValues(name)))`.
- On `Result.err`, mirror the structured issues into `form.setError(name, { message })`.
- shadcn's `<FormMessage>` reads from `formState.errors` and renders inline.

Why resolver-less:

1. **Single L1 safeParse.** SPEC §6 FR-11 (D45) is explicit that L1 is the client-side gate inside `bindConfigDoc.patch`. A `zodResolver` would run a second `ConfigSchema.safeParse` on form values before the binding's own safeParse runs on the merged document. Two parses with the same schema against substantively the same data is a clear violation of "single safeParse run at three entry points; uniform mechanism" (FR-11 acceptance criteria). Resolver-less keeps that contract clean.
2. **`bindConfigDoc.patch` validates the *merged* document.** Cross-field constraints (e.g. `preview.baseUrl` URL + scope-as-constraint per FR-32) need the full document, not isolated field values. The binding's safeParse already operates on the merged config; the resolver would operate on form sub-trees. Same schema, different inputs — the binding is the right place.
3. **Surfacing errors via `form.setError` is one line.** No correctness loss vs. the resolver path; we just call `form.setError(firstIssuePath, { message: humanFormat(error) })` from the rejection branch.

The other axis — running the resolver as a *second* L1 for inline-while-typing feedback — is rejected for the same reason: two safeParses, same schema, no semantic gain.

## Decision: external Y.Text updates merge via `keepDirtyValues`

The current `StringControl.useEffect` reflects external Y.Text updates into the input only when `pending === lastCommittedRef.current` — i.e. the user isn't mid-edit. RHF has the same primitive built in:

```ts
binding.subscribe((next) => {
  form.reset(next, {
    keepDirtyValues: true,
    keepDirty: true,
    keepTouched: true,
  });
});
```

`keepDirtyValues: true` is RHF's contract for "remote updates land on non-dirty fields, leave dirty fields alone." This replaces the hand-rolled per-control heuristic with a per-form-field check tracked by the library. Strictly more robust than the existing approach (the existing approach is per-control-instance; if a single field had two simultaneous renderers, dirty-tracking diverges).

## Decision: `folders[]` editing via `useFieldArray`

`folders[]` is a `z.array(FolderRuleSchema)` where each `FolderRuleSchema` is `{ match: string (min 1), frontmatter: { title?, description?, tags? } }`. RHF's `useFieldArray({ control, name: 'folders' })` is the canonical primitive for this exact shape (agents-ui uses it for `signedComponents` in [`trigger-form.tsx`](https://github.com/inkeep/agents-private/blob/main/public/agents/agents-manage-ui/src/components/triggers/trigger-form.tsx)).

Per-row commit semantics:

- Each cell auto-commits on blur via `binding.patch(buildPatch(['folders'], form.getValues('folders')))` — the WHOLE array, every commit. This matches `applyFolderRulesUpsert`'s atomic full-array write semantics (FR-6b acceptance criteria: "all-or-nothing").
- Adding a new row via `append({ match: '', frontmatter: {} })` creates a row that fails `FolderRuleSchema.match.min(1)`. The row sits in error state until the user types a valid `match`; no commit until valid.
- Removing a row via `remove(i)` commits immediately — empty match isn't an issue if the index is gone.
- Reordering via `move(from, to)` commits — folder rule order matters per the spec ("Rules apply in declaration order; later matches override earlier scalars").

## Proposed amendments to SPEC.md

> **Note:** these are proposed; the wording below is what would land in `SPEC.md` under §6 and §10 if approved. The spec is currently `Status: Draft (Release-Pivot Reframe — 2026-04-28)` so amendments are in-place edits, not corrigenda.

### Amend FR-3 (auto-save with per-control commit)

Add to the **Notes** column:

> Implementation: `useForm` from `react-hook-form` v7 acts as the state harness; per-field commit fires through `binding.patch(buildPatch(name, value))` on `Controller.onBlur`. Resolver-less (per D64) — `bindConfigDoc.patch`'s safeParse remains the single L1 gate; rejection issues mirror to `form.setError(name, …)` for inline display via shadcn `<FormMessage>`.

### Amend FR-5 (local validation blocks invalid intermediate values)

Replace the **Acceptance criteria** column with:

> Field with invalid value shows inline error via shadcn `<FormMessage>` populated from `formState.errors[name]`; the error is set by mirroring `bindConfigDoc.patch`'s `Result.err.issues` into `form.setError(name, { message })` after each blur. No `binding.patch` Y.Text mutation occurs until merged-config Zod safeParse succeeds.

### Amend FR-37 (Settings pane component)

Replace **Acceptance criteria** "renders schema-driven form via the Zod walker" with:

> renders form via [shadcn `Form` primitive](https://ui.shadcn.com/docs/forms/react-hook-form) (`FormField` / `FormControl` / `FormMessage`); a `useConfigForm(binding)` hook owns the `useForm` instance + the `binding.subscribe → form.reset(next, { keepDirtyValues: true })` bridge (per D65); per-field commits flow through `binding.patch`; section list (`SECTIONS`) remains hand-written in v1 (per D66); the existing schema walker (`getLeafTypeTag`, `getEnumOptions`, `getFieldDefault`, `getFieldMeta`) stays as the introspection layer for control dispatch.

### New FR-41 (folders[] editing surface)

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-41**: Settings pane renders a `folders[]` section using RHF's `useFieldArray`. Each row is a `{match, frontmatter: {title?, description?, tags?}}` editor with add/remove/reorder. Per-row commits flow through the same `binding.patch` path as scalar fields, writing the entire `folders[]` array atomically (matching `applyFolderRulesUpsert` all-or-nothing semantics from FR-6b). | New `FoldersSection` component using `useFieldArray({ control, name: 'folders' })`; rows render `match` (text), `frontmatter.title`/`description` (text), `frontmatter.tags` (string[] via new `TagPillInput` — Badge-based pills with **Enter** / **,** / **Tab** to commit a tag and **Backspace-on-empty** to remove last; native `<input>` inside focus-ring wrapper); add row via `append({match:'', frontmatter:{}})`; remove via `remove(i)`; reorder via `move(from,to)`; commit on blur calls `binding.patch({folders: getValues('folders')})`. New rows with empty `match` fail Zod `.min(1)` and stay in error state until the user types a valid value — no commit. | Closes the schema-coverage gap: `folders[]` has no editing surface today. The atomic full-array commit matches the spec's existing `applyFolderRulesUpsert` semantics — no new transactional machinery. `TagPillInput` is a new shadcn-styled primitive at `packages/app/src/components/ui/tag-pill-input.tsx` (resolved 2026-04-30). |

### New FR-42 (RHF integration with the schema walker)

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-42**: A `useConfigForm(binding)` hook in `packages/app/src/components/settings/use-config-form.ts` owns the `useForm<Config>` instance and the Y.Text → form bridge. Returns `{form, commitField(name)}` where `commitField` calls `binding.patch(buildPatch(name, form.getValues(name)))` and mirrors `Result.err` into `form.setError(name, …)`. The existing schema walker (`getLeafTypeTag`, `getEnumOptions`, `getFieldDefault`, `getFieldMeta`) is consumed unchanged by the Controller render-prop bodies for type-driven control dispatch (string vs number vs boolean vs enum vs array). | Hook unit-tested: subscribing fires `form.reset(next, {keepDirtyValues: true})` on each `binding.subscribe` event; user-typed-but-uncommitted values survive remote updates; commit roundtrip mirrors `Result.err.issues[0]` into `formState.errors[name]`. | One file (~80 LoC). Replaces the per-control `pending`/`lastCommittedRef`/error `useState` machinery uniformly. |

### New FR-43 (dependency additions)

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | **FR-43**: Add `react-hook-form ^7.61.x` and `@hookform/resolvers ^5.x` to `packages/app/package.json`. (Note: `@hookform/resolvers` is added even though we run resolver-less per D64 — installing the canonical adapter package keeps us aligned with the agents-private pattern and lowers friction for any future schema-bound dialog that does want it.) Install [shadcn `Form`](https://ui.shadcn.com/docs/forms/react-hook-form) at `packages/app/src/components/ui/form.tsx` (verbatim from shadcn registry; sibling to the already-installed `field.tsx`). | After install: `bun run check` passes; `size-limit` budgets unaffected (~10 kB gz delta well within the 290 kB main bundle ceiling); shadcn `Form` exports (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`) available. | Resolver-package is a near-zero-LoC dependency; keeping it in the tree even though we don't engage `zodResolver` matches the agents-private dependency surface and avoids "why is this missing?" friction. |

### New decisions (§10)

| # | Status | Decision | Reason | Alternatives rejected |
|---|---|---|---|---|
| **D64** | LOCKED | Settings pane runs RHF **resolver-less**. `useForm({ defaultValues, mode: 'onBlur' })` with no `resolver: zodResolver(...)`. `bindConfigDoc.patch` is the L1 safeParse; per-field errors mirror via `form.setError`. | Two safeParses against the same schema is a redundant L1 and contradicts FR-11's "single safeParse run at three entry points" contract. Cross-field validation needs the merged document, which `binding.patch` already produces. | (a) `resolver: zodResolver(ConfigSchema)` — rejected, redundant L1 + sub-tree validation. (b) Standard-schema resolver — same rejection rationale. |
| **D65** | LOCKED | External Y.Text updates merge into form state via `form.reset(next, { keepDirtyValues: true, keepDirty: true, keepTouched: true })` from a `binding.subscribe` listener. Replaces the per-control `lastCommittedRef === pending` heuristic. | RHF's per-field dirty-tracking is more robust than per-control-instance heuristics; library-supported semantic for "remote updates land on non-dirty fields." | (a) Per-control heuristic continued — works but lossy if a field has multiple render sites. (b) Always reset, ignore dirty — would stomp user-in-progress edits. |
| **D66** | NOT NOW | Section list (`SECTIONS` in `SettingsPane.tsx`) stays **hand-written** in v1. Auto-generation from a `fieldRegistry`-extended metadata layer (label/description/section/order) is deferred. **Revisit if** a second schema-driven UI surface emerges that would justify generalizing — at that point the registry extension and walker pass both serve N=2. | (a) Agents-private also hand-writes field lists — pattern parity. (b) Auto-generation commits us to a UI metadata layer (labels, descriptions, ordering, control hints) that we'd own and version; with N=1 consumer, the abstraction is premature. (c) The schema walker's introspection primitives (`getLeafTypeTag` etc.) already cover control dispatch — the only thing hand-written is *labels and ordering*, which barely benefit from generalization. | Auto-generation now (rejected as N=1 generalization). |

## Resolved decisions (2026-04-30)

1. **Install `@hookform/resolvers` alongside `react-hook-form`.** The resolver itself remains uninstantiated per D64 (the binding's safeParse is the L1 gate); the package install matches the agents-private dep surface and removes friction for any future schema-bound dialog that wants resolver-based form-only validation. FR-43 stands as written.
2. **Tags render via a shadcn-style tag-pill input.** Each tag is a removable `<Badge>`; entry is a native `<input>` inside a focus-ring wrapper, with **Enter** / **,** / **Tab** to commit a tag and **Backspace-on-empty** to remove the last tag. New `TagPillInput` component required (~80 LoC + tests). FR-41 acceptance criteria updated below.
3. **shadcn `Form` lands via `npx shadcn@latest add form`.** Canonical registry path; tracks shadcn upstream; both repos own their copy post-install. No fork-from-agents-private.

## References

- [shadcn Form (RHF-bound)](https://ui.shadcn.com/docs/forms/react-hook-form) — the primitive being adopted.
- [shadcn Field](https://ui.shadcn.com/docs/components/radix/field) — already installed at `packages/app/src/components/ui/field.tsx`; styling primitive, not RHF-bound.
- [react-hook-form v7](https://react-hook-form.com/) — `useForm`, `Controller`, `useFieldArray`, `formState.errors`.
- [`@hookform/resolvers` v5](https://github.com/react-hook-form/resolvers) — installed but not engaged (per D64).
- agents-private patterns: `Form` primitive at `public/agents/agents-manage-ui/src/components/ui/form.tsx`; `FormFieldWrapper` at `public/agents/agents-manage-ui/src/components/form/form-field-wrapper.tsx`; `useFieldArray` example in `public/agents/agents-manage-ui/src/components/triggers/trigger-form.tsx`.
- Existing OK contracts (unchanged by this proposal): [`bind-config-doc.ts`](../../../packages/core/src/config/bind-config-doc.ts), [`field-registry.ts`](../../../packages/core/src/config/field-registry.ts), [`schema-walker.ts`](../../../packages/app/src/components/settings/schema-walker.ts).
