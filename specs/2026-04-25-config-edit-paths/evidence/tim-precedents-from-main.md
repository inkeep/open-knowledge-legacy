---
sources:
  - packages/app/src/components/HelpPopover.tsx (main HEAD 6ecff6ef)
  - packages/app/src/components/CommandPalette.tsx
  - packages/app/src/components/InstallInClaudeDesktopDialog.tsx
  - packages/app/src/App.tsx (InstallInClaudeDesktopTrigger)
  - packages/desktop/src/main/menu.ts
  - packages/desktop/src/main/ipc/install-skill.ts
  - packages/desktop/src/main/ipc/seed.ts
  - specs/2026-04-24-skill-dual-track-install/SPEC.md
  - reports/agent-skills-zip-distribution-ux/REPORT.md
  - reports/config-driven-folder-frontmatter/REPORT.md
date: 2026-04-25
purpose: Capture the integration patterns @tim-inkeep established in PRs #297, #315, #318 that our spec mirrors. Lock the references so implementation doesn't have to re-grep them.
---

# Evidence: @tim-inkeep precedents from main HEAD

Three of Tim's recent merged PRs established patterns we adopt verbatim. Documented here so the implementation phase doesn't have to re-discover them.

## Pattern 1: Shared dialog launched from multiple entry points (PR #318)

`InstallInClaudeDesktopDialog` is a shared React Electron+web dialog (`packages/app/src/components/InstallInClaudeDesktopDialog.tsx`). It is opened from FOUR entry points using two different mechanisms.

### Mechanism A: Direct `useState` (HelpPopover entry)

`HelpPopover.tsx:23,56-58,87`:

```tsx
const [installDialogOpen, setInstallDialogOpen] = useState(false);
const [popoverOpen, setPopoverOpen] = useState(false);
// ... inside Popover:
<a onClick={() => {
  setPopoverOpen(false);
  setInstallDialogOpen(true);
}} ... />
// ... outside Popover (siblings):
<InstallInClaudeDesktopDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
```

Direct state binding works for entry points that share a parent component tree.

### Mechanism B: URL hash navigation (CommandPalette + menu + future docs links)

`CommandPalette.tsx:156-162`:

```tsx
<CommandItem
  onSelect={() => {
    setOpen(false);
    window.location.hash = '#install-claude-desktop';
  }}
  data-testid="command-palette-install-claude-desktop"
>
  <Download />
  <span>Install for Claude Chat & Cowork (Desktop App)…</span>
</CommandItem>
```

`App.tsx:67-73` (the receiver):

```tsx
/** Mounts InstallInClaudeDesktopDialog at the App root and opens it when
 *  window.location.hash === '#install-claude-desktop'. This is the minimum
 *  viable trigger for Ship 1e — docs and future in-app CTAs link to the hash.
 *  The hash clears when the dialog closes so it reopens only if the user
 *  navigates back to it. */
function InstallInClaudeDesktopTrigger() { /* ... */ }
```

URL hash is the cross-component dialog-trigger pattern. Same hash-routing infrastructure as OK's existing `#/<docName>` navigation.

### Mechanism C: Electron menu callback (menu.ts)

`menu.ts:87-92` (interface), `:271-272` (Help submenu entry):

```ts
export interface MenuDeps {
  // ...
  /** Ship 1g — Help → Install in Claude Desktop… click handler. Navigates
   *  the focused window's URL hash to '#install-claude-desktop' so App.tsx's
   *  InstallInClaudeDesktopTrigger opens the dialog. Optional because the
   *  menu renders even in contexts that don't wire it (unit tests). */
  openInstallSkillDialog?(): void;
}

// In Help submenu:
{
  label: 'Install for Claude Chat & Cowork (Desktop App)…',
  click: () => deps.openInstallSkillDialog?.(),
}
```

`MenuDeps` interface has optional callbacks; menu items invoke them. The callback (in `index.ts`) ultimately mutates `mainWindow.webContents.executeJavaScript("window.location.hash = '#install-claude-desktop'")` or sends `ok:menu-action`. Either way: hash change → Trigger → dialog opens.

## Pattern 2: Per-feature IPC files (PR #318 + #319)

`packages/desktop/src/main/ipc/` directory contains one file per feature:

- `install-skill.ts` — handlers for skill ZIP build + Claude Desktop launch (#318)
- `seed.ts` — handlers for seed dialog plan/apply (#319 introduces, #297 has it via different path)

Convention: a feature with main-process work gets its own `ipc/<feature>.ts` file. The file exports `register(ipcMain, deps)` (or similar) called from `index.ts`.

**For our Settings spec:** likely NOT needed — Settings is purely renderer-side; calls `applyConfigPatch` over HTTP. The only main-process touch is the menu callback. We can skip a dedicated `ipc/settings.ts` file and just wire the menu callback inline in `index.ts`. If Settings later grows main-process work (e.g., reading Electron app version for an "About" tab), then create `ipc/settings.ts` then.

## Pattern 3: Additive write-handler response shape (PR #315)

`packages/server/src/api-extension.ts` (per PR #315 diff): write handlers (`/api/agent-write`, `/api/agent-patch`, etc.) gained an additional structured response field `action: "attach-preview-once"` to deliver the new preview-attach contract. The change is additive — older callers parsing the existing `{ok: true, ...}` envelope are unaffected; new callers consume the new field.

**Implication for Q1:** the additive precedent is established. Our `errors[]` (multi-error array) follows the same evolution pattern — new field on new endpoints, existing routes unchanged.

## Pattern 4: Tim's intent for Install was "inside Settings"

`specs/2026-04-24-skill-dual-track-install/SPEC.md:87`:

> "FR10 — Settings panel row on both Electron + web app triggers the dialog. In `packages/app/src/components/Settings*.tsx` (or equivalent), a row labeled 'Install in Claude Desktop' opens the dialog."

`specs/2026-04-24-skill-dual-track-install/SPEC.md:185` (D13):

> "Install-dialog placement: Settings panel row (primary) + one-shot first-run toast (Electron only, for discoverability)."

**The current Help submenu + HelpPopover + CommandPalette entries from PR #318 are interim** — Tim shipped them because the Settings panel didn't exist yet. His spec explicitly anchors the dialog at "Settings panel row" once it exists.

**Implication for our scope:** the Settings UI should expose an Install in Claude Desktop row (in an "Integrations" section or similar). Reuses the existing `<InstallInClaudeDesktopDialog>` component. Cheap to add. Fulfills Tim's D13 destination intent.

## Pattern 5: Tim built `folders` (PR #297)

`reports/config-driven-folder-frontmatter/REPORT.md` is the design rationale for the entire `folders` feature in `ConfigSchema`. The order-matters merge semantics in `packages/cli/src/content/folder-rules.ts:1-18` ("scalars: last matching rule wins; tags: concat in declaration order, dedup first-occurrence") originate from this report.

**Implication for Q6:** our replace-array recommendation is consistent with Tim's order-matters semantics — array order = rule order. The drag-handle reorder UX surfaces the order semantic to users who would otherwise be surprised. Cite Tim's report as the design lineage in our spec.

## Things Tim's work does NOT touch

- `ConfigSchema` Zod definition itself (`packages/cli/src/config/schema.ts`) — unchanged from when our spec was scaffolded
- `applyConfigPatch` shared write primitive — doesn't exist
- `/api/config/*` HTTP routes — don't exist
- CC1 `'config'` channel — not yet emitted
- File watcher for `.open-knowledge/config.yml` — not yet wired
- MCP `set_config` / `get_config` tools — not registered
- `ok config validate` CLI subcommand — not added
- `dist/config-schema.json` build step — not added
- Magic comment in `CONFIG_YML_CONTENT` template (`packages/cli/src/content/init.ts:5`) — schema-reference comment present in prose, no `# yaml-language-server:` directive

All of the above are net-new in our spec. Zero collision surface beyond the route-list ordering in `api-extension.ts` (mechanical merge with Tim's open PR #319 either way).
