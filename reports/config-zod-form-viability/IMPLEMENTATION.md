---
title: "Config Settings RHF migration — implementation plan"
description: "File-by-file engineering plan to port Settings pane onto react-hook-form + shadcn Form, paired with first-class folders[] editing via useFieldArray."
status: proposal
created: 2026-04-30
authors: [Andrew]
related:
  - REPORT.md (viability)
  - ../../specs/2026-04-25-config-edit-paths/evidence/rhf-binding-harness.md (design + spec amendments)
  - ../../specs/2026-04-25-config-edit-paths/SPEC.md (FR-3, FR-5, FR-11, FR-37, proposed FR-41/42/43, D64/65/66)
---

# Config Settings RHF migration — implementation plan

## Scope and shape

One feature branch, conceptually two PRs (or one larger PR with logical commits): the **harness swap** and the **`folders[]` editor**. Either can ship independently of the other if the spec amendment lands first.

Net delta target: **~+250 LoC, –200 LoC**, after deletes. Net additions are mostly `FoldersSection` (new) and `useConfigForm` (new); deletes are the per-control state machinery currently in `SettingsPane.tsx`.

No changes to `bindConfigDoc`, `writeConfigPatch`, the persistence hook, the schema, or the field registry.

## PR 1 — RHF harness swap (Settings pane parity refactor)

### Phase 1.1 — Dependencies + shadcn `Form` primitive

| Action | File | LoC | Notes |
|---|---|---|---|
| Add deps | `packages/app/package.json` | +2 | `"react-hook-form": "^7.61.1"`, `"@hookform/resolvers": "^5.0.0"` |
| Install shadcn Form | `packages/app/src/components/ui/form.tsx` (NEW) | +180 | `npx shadcn@latest add form` (sibling to existing `field.tsx`). Exports `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`. Verbatim from shadcn registry. |
| Verify | — | — | `bun install`, `bun run check` (typecheck + biome + tests). Confirm size-limit budgets unaffected. |

### Phase 1.2 — `useConfigForm(binding)` hook (FR-42)

New file: `packages/app/src/components/settings/use-config-form.ts` (~80 LoC).

```ts
export interface UseConfigForm {
  form: UseFormReturn<Config>;
  commitField: (name: FieldPath<Config>) => boolean;
}

export function useConfigForm(binding: ConfigBinding): UseConfigForm {
  const form = useForm<Config>({
    defaultValues: binding.current(),
    mode: 'onBlur',
    // intentionally NO resolver — D64
  });

  // Y.Text → form bridge with dirty-preservation
  useEffect(() => {
    return binding.subscribe((next) => {
      form.reset(next, {
        keepDirtyValues: true,
        keepDirty: true,
        keepTouched: true,
      });
    });
  }, [binding, form]);

  const commitField = useCallback((name: FieldPath<Config>): boolean => {
    const value = form.getValues(name);
    const path = name.split('.') as readonly string[];
    const patch = buildPatch(path, value) as ConfigPatch;
    const result = binding.patch(patch);
    if (!result.ok) {
      const issue = pickFirstIssueForPath(result.error, name);
      form.setError(name, { message: humanFormat(result.error), type: issue?.code ?? 'patch-rejected' });
      return false;
    }
    form.clearErrors(name);
    return true;
  }, [binding, form]);

  return { form, commitField };
}

function pickFirstIssueForPath(error: ConfigValidationError, name: string) {
  if (!isKnownConfigError(error) || error.code !== 'SCHEMA_INVALID') return undefined;
  return error.issues.find((i) => i.path.map(String).join('.') === name) ?? error.issues[0];
}
```

Tests: `use-config-form.test.ts` — unit-tested with a fake `ConfigBinding`:

- Initial form values match `binding.current()`.
- `binding.subscribe` callback triggers `form.reset(next, { keepDirtyValues: true })`.
- Dirty field survives remote update; non-dirty field updates.
- `commitField` on valid value → `binding.patch` called with deep-partial patch shape; returns `true`.
- `commitField` on invalid value → `form.setError` populated with humanFormat message; returns `false`.

### Phase 1.3 — Rebuild `SettingsField` with Controller + shadcn FormField

Edit `packages/app/src/components/settings/SettingsPane.tsx`:

- **Delete:**
  - `StringControl` (~50 LoC), `NumberControl` (~50 LoC), `BooleanControl` (~25 LoC), `EnumToggleControl` (~45 LoC), `StringArrayControl` (~50 LoC) — replaced by Controller render-prop bodies inside `FormField`.
  - `valuesEqual` helper (RHF's `formState.dirtyFields` equivalent).
  - `firstIssuePath` (replaced by inline issue→form.setError mirror).
  - `humanFormatFirstIssue` (move into `useConfigForm` — already done in Phase 1.2).
  - `flashSaved` / `SavedIndicator` — kept; orthogonal to the harness.
- **Replace:** `SettingsForm` to call `useConfigForm` and render `<Form {...form}>` wrapper. `SettingsField` becomes a render-prop body inside `FormField`.

```tsx
function SettingsForm({ scope, binding, flashedPath }: SettingsFormProps) {
  const { form, commitField } = useConfigForm(binding);

  return (
    <Form {...form}>
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        {SECTIONS.map((section) => {
          const visibleFields = section.fields.filter((f) => isFieldVisibleAtScope(f.path, scope));
          if (visibleFields.length === 0) return null;
          return (
            <SettingsSection key={section.id} section={section}>
              {visibleFields.map((field) => (
                <SettingsField
                  key={field.path.join('.')}
                  field={field}
                  scope={scope}
                  form={form}
                  commitField={commitField}
                  isFlashed={flashedPath === field.path.join('.')}
                />
              ))}
            </SettingsSection>
          );
        })}
        <IntegrationsSection />
      </div>
    </Form>
  );
}

function SettingsField({ field, scope, form, commitField, isFlashed }: SettingsFieldProps) {
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;
  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const name = field.path.join('.') as FieldPath<Config>;

  // readonly-by-scope branch — same logic as today
  if (meta && (
    (meta.scope === 'workspace' && scope !== 'workspace') ||
    (meta.scope === 'user'      && scope !== 'user')
  )) {
    return <ReadonlyByScopeNotice ... />;
  }

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field: ctl }) => (
        <FormItem className={isFlashed ? 'animate-settings-flash' : ''}>
          <FormLabel>{field.label}</FormLabel>
          {field.description && <FormDescription>{field.description}</FormDescription>}
          <FormControl>
            {renderControl({ typeTag, enumOptions, ctl, commitField, name, field })}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function renderControl({ typeTag, enumOptions, ctl, commitField, name, field }) {
  if (typeTag === 'boolean') {
    return <Switch checked={!!ctl.value} onCheckedChange={(v) => { ctl.onChange(v); commitField(name); }} />;
  }
  if (typeTag === 'enum' && enumOptions) {
    if (field.control === 'enum-toggle' || enumOptions.length <= 4) {
      return <ToggleGroup type="single" value={ctl.value ?? ''} onValueChange={(v) => { if (v) { ctl.onChange(v); commitField(name); } }}>...</ToggleGroup>;
    }
  }
  if (typeTag === 'number' || typeTag === 'int') {
    return <Input type="number" {...ctl} value={ctl.value ?? ''}
                  onChange={(e) => ctl.onChange(e.target.value === '' ? null : Number(e.target.value))}
                  onBlur={() => { ctl.onBlur(); commitField(name); }} />;
  }
  if (typeTag === 'array') {
    return <StringArrayInput value={ctl.value ?? []}
                             onChange={(v) => ctl.onChange(v)}
                             onBlur={() => { ctl.onBlur(); commitField(name); }} />;
  }
  return <Input {...ctl} value={ctl.value ?? ''}
                onBlur={() => { ctl.onBlur(); commitField(name); }} />;
}
```

`StringArrayInput` is a thin newline-join textarea component (~30 LoC) — extracted from the deleted `StringArrayControl`, no behavior change.

Tests:

- Existing Settings pane integration tests should pass unchanged (URL-level UX is unchanged).
- New unit test: `settings-pane-rhf.test.tsx` — render with mocked binding, type into a field, blur, assert `binding.patch` called with deep-partial patch.
- New integration test: simulate Y.Text remote update mid-edit, assert dirty field preserved (`form.reset({keepDirtyValues:true})` is the RHF idiom; verify behaviorally).

### Phase 1.4 — Modified-at-scope indicator + reset-to-default

Both decorations stay; rewire them to read from RHF instead of bespoke state:

- **Modified indicator:** today computed via `valuesEqual(currentValue, defaultValue)`. With RHF, use `form.formState.dirtyFields` keyed by `name` for "user has touched this since last `reset`," OR keep the existing default-value compare via `getValues(name)` vs `getFieldDefault(leafSchema)`. The current "differs from default" semantic is what users expect (matches VS Code) — keep it; just read via `form.getValues(name)`.
- **Reset-to-default button:** today clears via `commit(null)` when no default, else `commit(defaultValue)`. Becomes:
  ```ts
  const reset = () => {
    const dv = getFieldDefault(leafSchema);
    form.setValue(name, dv === undefined ? null : dv, { shouldDirty: false });
    commitField(name);
  };
  ```

Net: `valuesEqual` deleted (~25 LoC), `reset` simplified (~10 LoC).

### Phase 1.5 — L3 rejection flash

Existing `subscribeToConfigValidationRejected` listener stays. Two changes:

- Replace the per-control `setError(...)` indirection with `form.setError(firstIssuePath, { message: humanFormat(event.error) })`.
- Replace `setFlashedPath` + 600ms timer with `form.setFocus(firstIssuePath)` (RHF API) plus the same `data-flash` CSS class on the `<FormItem>` for the visual flash. The CSS animation continues to fire via `animate-settings-flash`.

### Phase 1.6 — Cleanup

Remove unused imports: `useState` and `useRef` references in deleted controls; the stale `humanFormat` import (moved into `useConfigForm`); unused `ConfigBinding` direct references in `SettingsPane` (the binding is now consumed exclusively via `useConfigForm`).

Run `bun run check` + Playwright `test:e2e` (settings flow if present).

## PR 2 — `folders[]` section (FR-41)

### Phase 2.1 — Append `folders` to `SECTIONS`

Edit `SettingsPane.tsx`:

```tsx
{
  id: 'folders',
  title: 'Folders',
  description: 'Default frontmatter applied to documents matching glob patterns. Order matters: later rules override earlier ones.',
  fields: [],          // populated dynamically by FoldersSection
  custom: 'folders',   // new SectionDef discriminator
},
```

### Phase 2.2 — `TagPillInput` primitive

New file: `packages/app/src/components/ui/tag-pill-input.tsx` (~80 LoC).

Hand-rolled shadcn-styled primitive composing the already-installed `Badge` + a native `<input>` inside a focus-ring wrapper. Not an upstream shadcn component (no canonical pill-input in the shadcn registry), so we own it.

```tsx
'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TagPillInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
}

export function TagPillInput({
  value,
  onChange,
  onBlur,
  placeholder = 'Add tag…',
  id,
  disabled,
  ...aria
}: TagPillInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.includes(tag)) { setDraft(''); return; }
    onChange([...value, tag]);
    setDraft('');
  };

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div
      data-slot="tag-pill-input"
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
        disabled && 'opacity-60 pointer-events-none',
      )}
    >
      {value.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1 pl-2 pr-1">
          <span>{tag}</span>
          <button
            type="button"
            className="rounded-sm hover:bg-background/40 p-0.5"
            onClick={() => removeAt(i)}
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
            if (draft.trim()) {
              e.preventDefault();
              addTag(draft);
            }
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            e.preventDefault();
            removeAt(value.length - 1);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addTag(draft);
          onBlur?.();
        }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 bg-transparent text-sm outline-none min-w-[8ch]"
        disabled={disabled}
        {...aria}
      />
    </div>
  );
}
```

Tests: `tag-pill-input.test.tsx`:

- Type `react,redux,form` → comma-trigger creates 3 pills.
- Enter on a non-empty draft creates a pill.
- Tab on a non-empty draft creates a pill AND moves focus (verify `e.preventDefault` only fires when there's a draft to commit; empty Tab keeps default focus-shift).
- Backspace on empty draft removes the last pill; Backspace with draft text deletes characters as normal.
- Duplicate tag is silently dropped (no double-pill).
- onBlur with stale draft text auto-commits the draft tag.
- ARIA: `aria-invalid=true` propagates onto the inner `<input>`; the wrapper carries `data-slot` for styling.

Accessibility notes: the inner `<input>` is the focusable target and accepts the `id` from `<FormControl>`'s slot, so `<FormLabel htmlFor={…}>` resolves correctly. Pills have a per-tag `aria-label="Remove <tag>"` on the close button.

### Phase 2.3 — `FoldersSection` component

New file: `packages/app/src/components/settings/FoldersSection.tsx` (~150 LoC).

```tsx
export function FoldersSection({ form, commitField }: { form: UseFormReturn<Config>; commitField: (name: FieldPath<Config>) => boolean }) {
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'folders' });

  const commitFolders = () => commitField('folders' as FieldPath<Config>);

  return (
    <section aria-labelledby="settings-folders-title" className="space-y-3">
      <header>
        <h2 id="settings-folders-title">Folders</h2>
        <p>Default frontmatter applied to documents matching glob patterns. Order matters: later rules override earlier ones.</p>
      </header>

      <ol className="space-y-3">
        {fields.map((field, i) => (
          <li key={field.id} className="rounded-md border p-3 space-y-2">
            <div className="flex gap-2">
              <FormField control={form.control} name={`folders.${i}.match`}
                render={({ field: ctl }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Glob pattern</FormLabel>
                    <FormControl>
                      <Input {...ctl}
                             placeholder="specs/**"
                             onBlur={() => { ctl.onBlur(); commitFolders(); }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button variant="ghost" size="icon" aria-label="Move up"   disabled={i === 0}              onClick={() => { move(i, i - 1); commitFolders(); }}><ArrowUp/></Button>
              <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === fields.length-1} onClick={() => { move(i, i + 1); commitFolders(); }}><ArrowDown/></Button>
              <Button variant="ghost" size="icon" aria-label="Remove"   onClick={() => { remove(i); commitFolders(); }}><Trash2/></Button>
            </div>

            <FormField control={form.control} name={`folders.${i}.frontmatter.title`}
              render={({ field: ctl }) => (
                <FormItem>
                  <FormLabel>Title (optional)</FormLabel>
                  <FormControl><Input {...ctl} value={ctl.value ?? ''} onBlur={() => { ctl.onBlur(); commitFolders(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name={`folders.${i}.frontmatter.description`}
              render={({ field: ctl }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Input {...ctl} value={ctl.value ?? ''} onBlur={() => { ctl.onBlur(); commitFolders(); }} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name={`folders.${i}.frontmatter.tags`}
              render={({ field: ctl }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <TagPillInput value={ctl.value ?? []}
                                  onChange={(v) => { ctl.onChange(v); commitFolders(); }}
                                  onBlur={() => { ctl.onBlur(); commitFolders(); }}
                                  placeholder="Add tag…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </li>
        ))}
      </ol>

      <Button variant="outline" onClick={() => append({ match: '', frontmatter: {} })}>
        <Plus/> Add folder rule
      </Button>
    </section>
  );
}
```

Render path in `SettingsForm`: when `section.custom === 'folders'`, render `<FoldersSection form={form} commitField={commitField} />` instead of mapping `SettingsField`.

### Phase 2.4 — Tests

- Unit (`folders-section.test.tsx`): append → row appears with empty match → commit fails (Zod min(1)) → typing valid match commits via binding.patch with FULL `folders[]` array.
- Unit: remove → row disappears → commit fires with array minus that index.
- Unit: move → rows reorder → commit fires with reordered array.
- Unit: typing tags → comma/Enter creates pills, Backspace-on-empty removes last; onChange fires `commitField('folders')` with the updated `frontmatter.tags` array.
- Integration (`settings-folders-e2e.test.tsx` or extend an existing settings e2e): full add/edit/reorder/remove flow against a real ConfigBinding fed by an in-memory Y.Doc.

### Phase 2.5 — Spec acceptance criteria

- New row with empty `match` blocks commit (Zod `.min(1)` runs in `bindConfigDoc.patch.safeParse`; rejection message renders inline via `<FormMessage>`).
- Adding two rows then editing the second commits twice (two array values, atomic each time — matches FR-6b's "all-or-nothing" via `writeConfigPatch.safeParse(merged)`).
- Reordering commits — folder rule order matters per spec ("Rules apply in declaration order; later matches override earlier scalars").
- External edit (CLI: `ok config validate` + hand-edit, or another tab via MCP) updates the rendered `folders[]` list while preserving any in-progress dirty cell on the local tab.

## Sequencing

| Step | What | Why |
|---|---|---|
| 1 | Land spec amendment ([`evidence/rhf-binding-harness.md`](../../specs/2026-04-25-config-edit-paths/evidence/rhf-binding-harness.md) — FR-3/FR-5/FR-37 amended, FR-41/42/43 added, D64/65/66 added) | All implementation work is anchored to spec FRs; landing the amendment first prevents implementation drift. |
| 2 | PR 1 — RHF harness swap | Pure refactor; behavioral parity with current Settings pane. Smaller, lower-risk; can ship independently. |
| 3 | PR 2 — `folders[]` section | New feature on top of the harness; depends on PR 1. |
| 4 | Optional follow-up — pill-input for `frontmatter.tags` | UX polish; orthogonal to the schema and binding. Park if not asked for. |

## Risk register

| Risk | Mitigation |
|---|---|
| `keepDirtyValues` race with rapid remote updates while typing | New integration test exercising rapid-update mid-edit; the same risk exists today in `lastCommittedRef` pattern, so this is parity, not regression. |
| Zod v4 + RHF type friction (`@hookform/resolvers#813`) | We run resolver-less per D64; `useForm<Config>` typing works without the resolver. If type friction shows up in `useFieldArray<Config, 'folders'>`, fall back to `useFieldArray<{folders: FolderRule[]}, 'folders'>` with a localized type widening. |
| shadcn `Form` install drift from agents-private | Use `npx shadcn@latest add form` from the official registry. If the registry version diverges from what agents-private shipped, copy verbatim from agents-private. Decision: registry first; copy if drift. |
| Bundle-size regression | `bun run size` after PR 1; budget headroom is ~60 kB gz for the main bundle. RHF + resolvers is ~10 kB gz. Within budget. |
| Existing Playwright settings tests fail on selector drift | Audit `data-testid="settings-pane"` and per-field selectors before merge; preserve existing `data-field=...`, `data-modified`, `data-scope`, `data-field-error` attributes on the new `<FormItem>` wrappers. |

## Estimated LoC delta

| Bucket | Adds | Removes | Net |
|---|---|---|---|
| `package.json` deps (`react-hook-form` + `@hookform/resolvers`) | +3 | 0 | +3 |
| `ui/form.tsx` (shadcn install) | +180 | 0 | +180 |
| `ui/tag-pill-input.tsx` (new primitive) | +80 | 0 | +80 |
| `use-config-form.ts` (new hook) | +80 | 0 | +80 |
| `SettingsPane.tsx` (rebuild Field/FieldControl) | +120 | –250 | –130 |
| `FoldersSection.tsx` (new) | +150 | 0 | +150 |
| `StringArrayInput.tsx` (extracted from old `StringArrayControl`, used for `content.include`/`exclude`) | +30 | 0 | +30 |
| Tests (use-config-form + folders-section + tag-pill-input) | +250 | 0 | +250 |
| **Total** | **+893** | **–250** | **+643** |

Larger than the back-of-envelope estimate from REPORT.md (~250 LoC delta) because the shadcn `Form` primitive is ~180 LoC by itself (one-time install), the `TagPillInput` is a ~80 LoC bespoke primitive, and tests carry their own surface (~250 LoC). Code-only delta excluding shadcn install + tests is **~+463** / **–250** = **+213 LoC**, which is moderately above the original sketch — the delta is exactly the resolved-decision additions (resolver dep stays installed, tag-pill input replaces newline-textarea).

## Out of scope (Future Work, parked)

- Fully auto-generated form from `fieldRegistry` metadata — D66 NOT NOW.
- Per-section Save buttons — D-equivalent NOT NOW (FR-3 confirmed per-field auto-save 2026-04-30).
- Global form-level validation summary panel ("3 issues to fix") — overkill for per-field surface.
- Drag-to-reorder for `folders[]` (vs. up/down arrows) — nice-to-have; up/down arrows ship in v1 to limit interaction surface.
- Tag autocomplete in `TagPillInput` (suggest from already-used tags across folder rules) — UX polish; ship the typed-entry pill input first, observe usage, layer suggestions if asked.
