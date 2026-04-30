---
title: "Eval Group D — `appearance.*` (NEW per D20)"
description: "Per-field config-architecture verdict for the `appearance.theme` and `appearance.editorModeDefault` fields proposed by D20. Both fields are NEW additions to ConfigSchema; today they live exclusively in localStorage. Output applies the framework, traces existing read/write sites, and outlines the localStorage-to-config migration."
date: 2026-04-28
group: D
fields:
  - appearance.theme
  - appearance.editorModeDefault
status: NEW (not yet in schema)
---

## Summary

Group: `appearance.*` (NEW section per D20)
Fields evaluated: 2
Verdict counts:

- keep_config: 2
- env_only: 0
- both_config_and_env: 0
- drop: 0
- wire_engine_features: 0

Recommended schema diff:

- ADD `appearance: z.object({ theme, editorModeDefault }).default({})` between `content` and `github` (alphabetical placement keeps the schema tidy; SPEC §11 D20 doesn't bind ordering).
- ADD per-field `.meta({ defaultScope: 'user' })` so D25's `inspectConfig` algorithm picks `~/.open-knowledge/config.yml` when neither workspace nor local has set the field.
- Neither field gets `.meta({ agentSettable: true })` — D26 keeps the agent allowlist to 5 content/MCP-tuning paths, and `appearance.*` is explicitly user-pref territory ("identity / network / UX-preference / system-tuning fields are user-only" — D26).

## Confidence labels

CONFIRMED on every claim with a `file:line` cite below. INFERRED claims are tagged inline.

---

## Per-field verdicts

### Field: `appearance.theme`

```yaml
field: "appearance.theme"
type: "z.enum(['light', 'dark', 'system']).default('system')"
default: "'system'"

current_state:
  schema_defined: no  # NEW per D20
  read_sites:
    # localStorage today; will move to config.yml after D20 lands
    - "packages/app/src/main.tsx:107"             # ThemeProvider storageKey="ok-theme-v1"
    - "packages/app/src/components/ThemeToggle.tsx:20"  # const { theme, setTheme } = useTheme()
    - "packages/app/src/components/GraphLegend.tsx:49"  # const { resolvedTheme } = useTheme()
    - "packages/app/src/components/DiffView.tsx:49"      # const { resolvedTheme } = useTheme()
    - "packages/app/src/components/FileTree.tsx:389"     # const { resolvedTheme } = useTheme()
    - "packages/app/src/components/GraphView.tsx:511"    # const { resolvedTheme } = useTheme()
    - "packages/app/src/components/TimelinePanel.tsx:444" # const { resolvedTheme } = useTheme()
    - "packages/app/src/components/ui/sonner.tsx:12"     # const { theme = 'system' } = useTheme()
    - "packages/app/src/editor/SourceEditor.tsx:115"     # const { resolvedTheme } = useTheme()
  wired: n/a (new field)
  notes: |
    Today the value is owned end-to-end by `next-themes` ThemeProvider via
    `storageKey="ok-theme-v1"` (`main.tsx:107`). FOUC mitigation is implicit —
    next-themes injects a synchronous inline script that reads localStorage
    before paint (`<meta name="color-scheme" content="light dark" />` at
    `index.html:5` is the only OK-authored hint). UI surface: `ThemeToggle`
    (`ThemeToggle.tsx:19`) is the only writer; consumers above only read
    `theme` / `resolvedTheme`. No env override, no CLI flag, no HTTP route.

evaluation:
  ninety_percent_test: |
    Yes — theme is the canonical UX preference users tune. Light/dark/system
    is one of the highest-frequency settings tweaks across editor-class apps.
    P32 (90%-tune test) is satisfied.
  team_shared_use_case: |
    Yes — workspace-scope is plausible: a team brand-defaults to dark mode for
    its docs project, or a tutorial repo pins `theme: 'light'` so screenshots
    match. D20's section-name rationale ("`appearance` not `userPrefs` because
    per D25 these can be written at any scope") explicitly endorses workspace.
  per_machine_use_case: |
    Yes — a user prefers system theme on their laptop but pins dark on a
    desktop with brighter ambient light. `.local.yml` (D27) is the natural
    home for that override. No well-known env name (`THEME` / `OK_THEME`
    aren't standardized); env-only would be wrong per P15.
  secret_or_credential: no
  array_or_record: no  # plain enum

verdict: keep_config
rationale: |
  Decision tree §III: not a secret (skip 1), not vestigial — it's a NEW field
  D20 creates (skip 2), not array/record (skip 3), but a scalar that 90%+ of
  users WILL tune (P32, fail step 4's "leave at default" branch), AND has a
  real team-shared workspace use case (step 5 → CONFIG). VS Code's exact
  precedent (`workbench.colorTheme`) confirms the shape. D20's localStorage-
  becomes-cache strategy preserves the FOUC-free first paint while making
  config.yml authoritative.

if_keeping_in_config:
  default_scope: user
  scope_tolerance:
    user: ✅       # natural home — personal preference following user across projects
    workspace: 👍  # team brand default; tutorial-repo light-mode pin
    local: 👍      # per-machine override (D27 ladder; e.g. dark on desktop, system on laptop)
    env: —        # no well-known env name; per P32 don't introduce one for a UX preference
```

---

### Field: `appearance.editorModeDefault`

```yaml
field: "appearance.editorModeDefault"
type: "z.enum(['wysiwyg', 'source']).default('wysiwyg')"
default: "'wysiwyg'"

current_state:
  schema_defined: no  # NEW per D20
  read_sites:
    # localStorage today; will move to config.yml after D20 lands
    - "packages/app/src/editor/use-editor-mode.ts:18"      # STORAGE_KEY = 'ok-editor-mode-v1'
    - "packages/app/src/editor/use-editor-mode.ts:50-63"   # readPersistedMode(): localStorage.getItem
    - "packages/app/src/editor/use-editor-mode.ts:71-78"   # readInitialMode(): window.__OK_EDITOR_MODE__ → storage
    - "packages/app/src/editor/use-editor-mode.ts:84-95"   # persistMode(): localStorage.setItem
    - "packages/app/src/editor/use-editor-mode.ts:102-110" # useEditorMode(): hook
    - "packages/app/src/components/EditorPane.tsx:47"      # const [persistedMode, setPersistedMode] = useEditorMode()
    - "packages/app/src/components/EditorPane.tsx:148-154" # handleModeChange persists on user toggle
    - "packages/app/index.html:22"                         # FOUC inline script reads ok-editor-mode-v1
  wired: n/a (new field)
  notes: |
    Architecture is more elaborate than `theme` because the team built
    bespoke FOUC machinery (`packages/app/index.html:22` reads the persisted
    mode synchronously, hangs it on `window.__OK_EDITOR_MODE__`, hook reads
    it once in `useState` initializer at `use-editor-mode.ts:71-78`). Spec
    `specs/2026-04-21-editor-mode-persistence/SPEC.md` §7.2 documents the
    contract. The hook deliberately does NOT listen for cross-window changes
    (`use-editor-mode.ts:99-100`: "spontaneous mode flip on tab-focus
    surprises the user"); D20's CC1 'config' approach inherits that
    constraint — see migration note 4 below. EditorPane's `handleModeChange`
    is the only writer (`EditorPane.tsx:148-154`); session-only flips (e.g.
    raw-MDX nav) deliberately do NOT call `setPersistedMode`.

evaluation:
  ninety_percent_test: |
    Borderline-positive. Theme is universal; editor-mode default is more of a
    power-user / contributor preference (toggle is per-doc, not per-app, so
    most users live with the default). D20 nonetheless includes it because
    (a) it's already user-tunable persistent state in the same shape as
    theme and (b) Source-mode-by-default users today rely on the localStorage
    persistence — losing it would regress that flow. Schema-simplicity (P32)
    counsels caution but the existing wired persistence + per-user persistent
    intent makes it a real config field, not a speculative knob.
  team_shared_use_case: |
    Yes (plausible) — a docs/markdown-engineering team can pin Source-mode
    default at workspace level so contributors land in raw markdown. Aligns
    with D20's `appearance` naming rationale (any scope, not user-only).
  per_machine_use_case: |
    Plausible — small-screen laptop prefers Source (less chrome); large
    desktop prefers WYSIWYG. Marginal but a valid `.local.yml` candidate.
    No env name; same reasoning as theme — UX preferences don't merit env.
  secret_or_credential: no
  array_or_record: no  # plain enum

verdict: keep_config
rationale: |
  Decision tree §III: same path as `appearance.theme` — not a secret, not
  vestigial (NEW), not array/record, not "90%+ leave at default" because
  the existing persistence proves users do change it; team-shared use case
  exists (step 5 → CONFIG). Note: this field's name is `editorModeDefault`
  (not `editorMode`) — the "default" suffix signals it's the seed for new
  doc tabs, not a lock — per-doc transient flips remain session-only as
  today (per the hook's existing semantics at `use-editor-mode.ts:99-100`).

if_keeping_in_config:
  default_scope: user
  scope_tolerance:
    user: ✅       # personal preference across projects
    workspace: 👍  # docs-team default; markdown-engineering pin
    local: 👍      # per-machine screen-size preference
    env: —        # no well-known env name; UX preference, not deployment
```

---

## Code paths to change

### Existing localStorage handlers (read sites that migrate to config-backed sources)

| File:line | Today | After D20 |
|---|---|---|
| `packages/app/src/main.tsx:107` | `<ThemeProvider storageKey="ok-theme-v1">` | Either keep `next-themes`'s storageKey as a derived cache and reconcile with config on mount, OR replace `<ThemeProvider>` with a thin OK wrapper that reads from `useConfigQuery('appearance.theme')` and writes via `applyConfigPatch`. INFERRED preference: keep `next-themes` (its FOUC + class-toggling logic is load-bearing) and treat localStorage as the cache; reconcile in a top-level effect. |
| `packages/app/src/components/ThemeToggle.tsx:19-50` | `useTheme()` from `next-themes` | Wrap `setTheme` so it ALSO calls `applyConfigPatch({patch:{appearance:{theme}}})`. Avoid changing the read path so the 9 `useTheme()` consumers (GraphLegend, DiffView, FileTree, GraphView, TimelinePanel, sonner, SourceEditor, plus tests) keep working unchanged. |
| `packages/app/src/editor/use-editor-mode.ts:18-110` | localStorage owner end-to-end | Hook becomes a thin adapter: read from `useConfigQuery('appearance.editorModeDefault')` for cold-load mode, fall back to `window.__OK_EDITOR_MODE__` for first paint, fall back to `localStorage` for the gap between FOUC and React mount. Writer (`persistMode`) calls `applyConfigPatch` AND localStorage (write-through cache for FOUC). |
| `packages/app/src/components/EditorPane.tsx:47-153` | `useEditorMode()` only | Unchanged signature — the hook abstracts the new layering. `handleModeChange` continues to call `setPersistedMode`. |

### FOUC script (first-paint reader; KEEP localStorage read here, write-through cache)

| File:line | Role | Change |
|---|---|---|
| `packages/app/index.html:22` | Synchronous pre-React script reading `ok-editor-mode-v1` | UNCHANGED. The whole point of D20's "localStorage as derived cache" is to keep this synchronous fast-path intact so first paint stays flash-free. The cache is populated by the React app's reconcile-with-config step on every mount + every CC1 'config' refresh. |
| `packages/app/index.html:5` | `<meta name="color-scheme" content="light dark" />` | UNCHANGED. `next-themes` handles the theme FOUC inline-script injection, which reads `localStorage.getItem('ok-theme-v1')` synchronously. As long as we keep the cache populated, the dark-mode-no-flash UX stays. |

### React context provider (the reconciler — NEW work)

NEW reconciliation effect needed somewhere near the top of the React tree (likely a sibling of `ThemeProvider` in `main.tsx` or a small effect inside `App`):

```ts
// On mount + on every CC1 'config' tick:
const cfgTheme = useConfigQuery('appearance.theme');
const { setTheme } = useTheme();
useEffect(() => {
  if (cfgTheme && cfgTheme !== currentTheme) {
    setTheme(cfgTheme);  // next-themes auto-writes localStorage on setTheme
  }
}, [cfgTheme]);
```

The same shape applies to `appearance.editorModeDefault` — reconcile inside the `useEditorMode` hook on first mount + on CC1 'config' (FR-14, SPEC §6).

### CC1 'config' channel client-side routing

Per FR-14 (SPEC line 147), `cc1Broadcaster.signal('config')` is the cross-window sync mechanism. The Modal already plans to invalidate its config query on this channel (SPEC §9 dataflow). For `appearance.*` we additionally need:

- `SystemDocSubscriber` adds a `'config'` handler that triggers the React-Query invalidation (`useConfigQuery` will re-fetch).
- The reconciliation effects above pick up the new value and call `setTheme` / `setPersistedMode`, which writes through to localStorage.

INFERRED: this routing is a generic "any open surface refreshes" plumbing; `appearance.*` consumes it without extra wiring beyond the new reconcile effects.

---

## Recommended Zod schema addition (verbatim)

Insert between `content` and `github` in `packages/cli/src/config/schema.ts:34`:

```ts
  appearance: z
    .object({
      /** UI color theme. `'system'` follows OS dark/light preference. */
      theme: z
        .enum(['light', 'dark', 'system'])
        .default('system')
        .meta({ defaultScope: 'user' }),
      /** Default editor mode for newly-opened documents. Per-doc flips remain session-only. */
      editorModeDefault: z
        .enum(['wysiwyg', 'source'])
        .default('wysiwyg')
        .meta({ defaultScope: 'user' }),
    })
    .default({
      theme: 'system',
      editorModeDefault: 'wysiwyg',
    }),
```

Notes on the shape:

- Both leaves use `.meta({ defaultScope: 'user' })` per D25's per-field-metadata convention. INFERRED: D25 specifies the metadata key as `defaultScope` (not e.g. `scope`); cross-check with whatever Group A (e.g. `content.*`) lands first and align if Group A picks a different key — this is the first cross-group consistency point.
- `.default({})` on the outer object follows the existing pattern (every sibling section in `schema.ts:23-127` uses object-level + leaf-level defaults).
- No `.meta({ agentSettable: true })` on either leaf — D26 confines the agent allowlist to 5 content/MCP-tuning paths, and `appearance.*` is explicitly excluded ("UX-preference fields are user-only and agent-driven mistakes there have higher blast radius" — D26).
- Both enums use the same string-literal set as the runtime today (`use-editor-mode.ts:22` `EDITOR_MODE_VALUES = ['wysiwyg', 'source']`; `next-themes` themes `'light' | 'dark' | 'system'` — `ThemeToggle.tsx:13-17`). Zero migration risk for existing persisted values: any value already in localStorage parses cleanly under the new enum.

---

## Migration plan (concrete steps + file:line references)

### Step 1 — Schema addition (mechanical, ~10 LoC)

- Add the Zod block above to `packages/cli/src/config/schema.ts:34`.
- Re-run `bun run check` — passes if walker (D19) handles enums correctly. If `inputSchema` narrowing for MCP needs an explicit exclusion of `appearance.*`, add it to the agent-settable filter (D26 implementation).

### Step 2 — Server-side reconciler (loader + applyConfigPatch already in scope)

- No new server work specific to `appearance.*` — it inherits `applyConfigPatch` (FR-9), `GET /api/config` (FR-13), CC1 'config' broadcast (FR-14), and file-watcher invalidation (FR-15) for free.
- INFERRED: D27's `'local'` scope for `.local.yml` also inherits — `appearance.*` fields with `defaultScope: 'user'` still WRITE to user-global by default but READ from the most-specific-set scope per D25.

### Step 3 — Client read path (theme)

- File: `packages/app/src/main.tsx:99-122`. Add a small `<AppearanceReconciler>` component (or inline effect) that runs after `ThemeProvider` mounts:
  1. `useConfigQuery('appearance.theme')` → returns the resolved value (or default `'system'`).
  2. On change, call `setTheme(value)` from `next-themes`. Next-themes writes through to `localStorage.ok-theme-v1` automatically.
- All 9 existing `useTheme()` read sites (GraphLegend.tsx:49, DiffView.tsx:49, FileTree.tsx:389, GraphView.tsx:511, TimelinePanel.tsx:444, sonner.tsx:12, SourceEditor.tsx:115, ThemeToggle.tsx:20, plus the GraphLegend test) remain unchanged.

### Step 4 — Client read path (editor mode)

- File: `packages/app/src/editor/use-editor-mode.ts:71-110`. Modify `readInitialMode` to additionally accept a config-resolved value (passed from `useEditorMode`'s React-Query lookup), with precedence: `configValue ?? window.__OK_EDITOR_MODE__ ?? localStorage ?? 'wysiwyg'`.
- Add a `useEffect` inside `useEditorMode` that listens for CC1 'config' (via `useConfigQuery('appearance.editorModeDefault')`) and updates session state when the value differs AND the user has not had a session-only flip in flight. INFERRED: the existing comment at `use-editor-mode.ts:99-100` ("Open tabs/windows do NOT update each other live") is intentional UX; D20 needs an explicit decision to either preserve that (apply config only to new docs) or change it. SPEC D20's "Multi-window theme sync becomes free via CC1" suggests THEME syncs but is silent on editor-mode; recommend preserving the existing per-tab independence for editor mode and applying config-driven changes only to NEW doc opens — this matches the `editorModeDefault` semantic in the field name.

### Step 5 — Client write path

- File: `packages/app/src/components/ThemeToggle.tsx:19-50`. Inside the existing `setTheme` callback (line 20), additionally call `applyConfigPatch({patch:{appearance:{theme: nextValue}}})`. INFERRED: write client-side via the existing `POST /api/config/patch` (FR-12); the response's CC1 broadcast triggers the reconciler in Step 3 in all OTHER open windows — this window has already updated optimistically via `setTheme`.
- File: `packages/app/src/editor/use-editor-mode.ts:84-95`. `persistMode` becomes a hybrid: localStorage write (existing — keeps FOUC cache hot) + `applyConfigPatch` call. INFERRED: order matters — write localStorage FIRST (instant, never fails for the FOUC cache) and `applyConfigPatch` SECOND (async; if it fails, the local session still persists per the existing graceful-degradation pattern). Document the divergence: localStorage cache MAY drift from config briefly on offline / server-down.

### Step 6 — FOUC contract (no changes needed)

- File: `packages/app/index.html:22`. UNCHANGED. The inline script keeps reading `localStorage.getItem('ok-editor-mode-v1')` for first-paint mode selection. The cache is kept fresh by Steps 4 + 5 above.
- next-themes' equivalent FOUC inline-script (auto-injected by `<ThemeProvider storageKey="ok-theme-v1">` at `main.tsx:107`) is also unchanged for the same reason.

### Step 7 — Silent migration on first toggle (per D20)

- D20 specifies "silent migration on next theme/mode toggle" — i.e. existing `ok-theme-v1` / `ok-editor-mode-v1` localStorage values are NOT promoted to `config.yml` on first run. They remain in localStorage as the cache; only when the user TOGGLES does the next write also land in config. Until then, the runtime resolution falls back to schema default (`'system'` / `'wysiwyg'`).
- INFERRED: this is intentional simplicity — no migration job, no first-launch banner, no risk of writing user-global config without intent. Documented contract: "your existing preference persists in this browser/tab until you change it; once you do, it follows you across windows + machines via config.yml." Recommend surfacing this in the spec's UX language section (SPEC §11 D20's "implications" cell currently doesn't mention this — would tighten UX expectations).

### Step 8 — Verification (in-scope tests)

- Update `packages/app/src/editor/use-editor-mode.test.ts:182-290` (already asserts the storage key) — ADD a test for the config-precedence path: when `appearance.editorModeDefault` is set in mocked config, the hook prefers it over localStorage.
- Add an integration test under `packages/app/tests/integration/` that walks: open Settings Modal → toggle theme → assert localStorage updated AND `applyConfigPatch` called AND CC1 'config' broadcast fired. INFERRED placement; SPEC's existing test plan doesn't enumerate per-section coverage.

---

## Open follow-ups for spec author

1. **CC1 'config' semantics for `editorModeDefault`** — D20 says "Multi-window theme sync becomes free via CC1." Theme is universally good to sync live; editor mode has a deliberate per-tab-independence design (`use-editor-mode.ts:99-100`). Resolve: apply config-driven change only to NEW doc opens (recommended), or live-flip every open editor (matches the spec's plain reading but contradicts the existing UX rule). This is one sentence in §11 D20's "implications" cell.

2. **Migration UX language** — D20 says "silent migration on next theme/mode toggle." Confirm: (a) no first-run banner, (b) localStorage value is the cache, schema default is the disk default, user toggle is the promotion event. Recommend tightening D20's prose to make this explicit so reviewers don't read "silent migration" as "auto-promote on first launch."

3. **Settings UI ordering** — INFERRED placement: `appearance` near top of Modal (above `content` / `sync` / `server`) since users tune it most. SPEC §11 D24 (Modal layout) doesn't bind ordering. Worth a one-line recommendation in §11 D24's implications cell, or punt to FR-1 implementer.
