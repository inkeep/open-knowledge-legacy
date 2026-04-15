# Fumadocs Container Behavior in TipTap WYSIWYG Editor

**Date:** 2026-04-14
**Context:** Component Blocks v2 spec (§9.7 JsxComponentView rendering)
**fumadocs-ui version:** 16.1.0 (pinned)
**Scope:** P0 container components (Tabs, Accordion, Steps, Cards, Files) + leaf components (Callout, Banner, ImageZoom, TypeTable, InlineTOC)

---

## §1 Executive Summary

**The answer is: fumadocs container components will render structurally correctly inside our TipTap WYSIWYG editor with NodeViewWrapper divs. They will NOT crash. But they will be completely unstyled.**

All five P0 container components (Tabs, Accordion, Steps, Cards, Files) pass children through without type-filtering. None use `React.Children.map`, `React.Children.toArray`, or component-type identity checks. The underlying Radix primitives (Tabs, Accordion, Collapsible) use React context for state management, not DOM position introspection — NodeViewWrapper divs are transparent to context propagation. Steps and Cards are pure divs with `{children}` passthrough. Files uses Radix Collapsible, also context-based.

**The real problem is CSS, not React.** Our editor imports zero fumadocs CSS. No `fumadocs-ui/style.css`, no `fumadocs-ui/css/preset.css`, no `--color-fd-*` variables. Every fumadocs component uses Tailwind classes referencing the `fd-*` color namespace (`bg-fd-card`, `text-fd-card-foreground`, `border-fd-border`). Without these CSS variables defined, components render with transparent/missing colors — structurally correct but visually invisible or broken.

**Interactive behavior works in-editor for free.** Tab switching (Radix Tabs context + `forceMount: true` + CSS `data-[state=inactive]:hidden`), accordion expand/collapse (Radix Accordion context), folder toggle (Radix Collapsible) — all driven by React context, all functional through NodeViewWrapper. The `forceMount: true` on TabsContent means all tabs are always in DOM, hidden via CSS — which is actually ideal for editor use (all content visible to ProseMirror, tab visibility toggled by interacting with triggers).

**Recommended path:** Import `fumadocs-ui/css/default.css` (34-line color token file) plus cherry-pick the `fd-steps`/`fd-step`/`prose-no-margin` utilities from `preset.css` into our `globals.css`. Map `--color-fd-*` variables to our existing shadcn design tokens. ~50 lines of CSS. No JavaScript changes needed for container rendering correctness.

**Confidence: HIGH** — based on direct source reading of all P0 component implementations, Radix UI context propagation model, and verified `FrameworkProvider` graceful degradation.

---

## §2 Per-Container Component Table

| Component | Filters children? | Mechanism | Expected in-editor behavior | Evidence | Confidence |
|-----------|-------------------|-----------|----------------------------|----------|------------|
| **Tabs** | NO | `{children}` via `TabsContext.Provider`. Radix Tabs underneath. `forceMount: true` on panels. | **WORKS.** Tab switching functional. All panels in DOM. `useCollectionIndex()` uses React render order, transparent to DOM wrappers. | `evidence/tabs.md` | HIGH |
| **Accordion** | NO | `...props` spread to `AccordionPrimitive.Root`. Each `Accordion` creates `AccordionPrimitive.Item` via context. | **WORKS.** Expand/collapse functional. Context-based value management. Minor: `divide-y` border on Root applies to NodeViewWrapper divs (cosmetic). | `evidence/accordion.md` | HIGH |
| **Steps** | NO | Pure `<div className="fd-steps">{children}</div>`. Zero JS logic. | **WORKS.** CSS counter styling via `fd-step::before`. No direct-child selectors. `position: absolute` relative to `fd-steps` (position: relative). | `evidence/steps.md` | HIGH |
| **Cards** | NO | Pure `<div className="grid grid-cols-2">{children}</div>`. | **WORKS.** CSS grid applies to NodeViewWrapper divs (they become grid items). Minor: `@max-lg:col-span-full` on Card needs to be on grid item (NodeViewWrapper). | `evidence/cards.md` | HIGH |
| **Files** | NO | Pure `<div>{children}</div>`. `Folder` uses Radix Collapsible (context-based). | **WORKS.** Folder expand/collapse functional. | `evidence/files.md` | HIGH |

### Critical architectural finding

All five containers use one of two patterns:
1. **Pure div passthrough** (Steps, Cards, Files container) — zero filtering, zero context
2. **Radix primitive + React context** (Tabs via `@radix-ui/react-tabs`, Accordion via `@radix-ui/react-accordion`, Folder via `@radix-ui/react-collapsible`) — context propagates through any DOM wrapper

**Neither pattern breaks with NodeViewWrapper divs.** This is because:
- Radix UI v1.x uses React context for parent-child communication, NOT DOM queries (unlike older Radix or Headless UI which sometimes use `querySelectorAll`)
- ProseMirror NodeViewWrapper renders as a `<div>` — it's a transparent React component that just adds DOM structure
- `NodeViewContent` renders ProseMirror's content DOM, which React components inside receive via normal React children

---

## §3 Per-Leaf Component Table

| Component | Context deps? | Framework deps? | Expected in-editor behavior | Evidence | Confidence |
|-----------|--------------|-----------------|----------------------------|----------|------------|
| **Callout** | None | None | **WORKS** structurally. Unstyled (needs `--color-fd-*` vars). | `evidence/callout.md` | HIGH |
| **Banner** | None | None | **WORKS** but has side effects: `<style>` injection to `:root`, `sticky` positioning. Not appropriate as document content. | `evidence/banner.md` | HIGH |
| **ImageZoom** | None | `fumadocs-core/framework` Image — **gracefully degrades to `<img>`** without FrameworkProvider | **WORKS.** `react-medium-image-zoom` is standalone. Needs `image-zoom.css`. | `evidence/image.md` | HIGH |
| **TypeTable** | None | `fumadocs-core/link` Link — **gracefully degrades to `<a>`** without FrameworkProvider | **WORKS.** Data-driven from `type` prop. Radix Collapsible for per-row expand. | `evidence/type-table.md` | HIGH |
| **InlineTOC** | None | None | **WORKS** structurally. Uses Radix Collapsible. Needs `items` prop (array of `{url, title, depth}`). | Source: `inline-toc.js` | HIGH |
| **Card** (with href) | None | `fumadocs-core/link` Link — **gracefully degrades to `<a>`** | **WORKS.** `Link` component checks for `FrameworkProvider`; if absent, renders `<a href={...}>`. No crash. | `evidence/cards.md` | HIGH |

### FrameworkProvider non-issue (verified)

Initial concern: `fumadocs-core/link` and `fumadocs-core/framework` `Image` might crash without `FrameworkProvider`. **Verified: they do NOT crash.** Source at `node_modules/fumadocs-core/dist/chunk-K4WNLOVQ.js`:

```js
function Link(props) {
  const { Link: Link2 } = use(FrameworkContext);
  if (!Link2) {
    const { href, prefetch: _, ...rest } = props;
    return jsx("a", { href, ...rest });  // graceful fallback
  }
  return jsx(Link2, { ...props });
}

function Image(props) {
  const { Image: Image2 } = use(FrameworkContext);
  if (!Image2) {
    const { src, alt, priority, ...rest } = props;
    return jsx("img", { alt, src, fetchPriority: priority ? "high" : "auto", ...rest });  // graceful fallback
  }
}
```

Only `useRouter()`, `usePathname()`, `useParams()` throw when called without provider. These are routing hooks, not used by any P0 content component.

---

## §4 pr23-rebase Status

**Location:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/pr23-rebase/`

### What exists

- **`JsxComponentView.tsx`** — Registry-driven NodeView rendering ALL components identically: `<Component {...primitiveProps}><NodeViewContent /></Component>` wrapped in `ComponentErrorBoundary`. No container-specific handling.
- **`JsxComponentVoidView.tsx`** — Unregistered fallback (raw JSX display).
- **`componentMap.ts`** — Imports all fumadocs P0 components directly from `fumadocs-ui/components/*`. Also includes `@inkeep/docskit/mdx` (CodeGroup, Frame, Video) and local wrappers (Mermaid, Audio).
- **`ComponentToolbar.tsx`** — Name badge (purple monospace chip).
- **`PropPanel.tsx`** + **`PropPanel.test.ts`** — Prop editing panel.
- **`UnregisteredFallback.tsx`** — Raw JSX display for unknown components.

### What does NOT exist

1. **No container-specific handling** — no tab-switching logic, no accordion toggle interception, no special rendering modes.
2. **No context provider shims** — no `FrameworkProvider`, no extra Radix providers.
3. **No fumadocs CSS imports** — `globals.css` has zero fumadocs references.
4. **No tests for container rendering** — `ComponentToolbar.test.ts` and `PropPanel.test.ts` exist; no tests verifying that Tabs/Accordion/Steps actually render correctly inside the editor.
5. **No "editor mode" variants** — components are rendered as-is from fumadocs-ui.

### Architectural pattern (confirmed matches spec §9.7)

```
NodeViewWrapper (.jsx-component-wrapper)
├── button (toolbar click → setNodeSelection)
│   └── ComponentToolbar (name badge)
├── ComponentErrorBoundary
│   └── <Component {...primitiveProps}>
│       └── <NodeViewContent> (PM children placeholder)
└── PropPanel (shown when selected, mousedown isolated)
```

This is a **one-size-fits-all** approach. For container components, the PM node tree creates nested NodeViews:

```
<Tabs items={[...]}>                  ← JsxComponentView for Tabs
  <NodeViewContent>                   ← PM children area
    <NodeViewWrapper>                 ← JsxComponentView for Tab 1
      <Tab value="tab-1">
        <NodeViewContent>             ← Tab 1 content
          ...prose blocks...
        </NodeViewContent>
      </Tab>
    </NodeViewWrapper>
    <NodeViewWrapper>                 ← JsxComponentView for Tab 2
      <Tab value="tab-2">
        <NodeViewContent>
          ...prose blocks...
        </NodeViewContent>
      </Tab>
    </NodeViewWrapper>
  </NodeViewContent>
</Tabs>
```

**This nesting is correct.** `Tab` components inside `NodeViewWrapper` still receive `TabsContext` through the React tree because context propagates through any intermediate DOM nodes.

---

## §5 CSS State

### Current: ZERO fumadocs CSS in the editor

**Verified locations with no fumadocs CSS:**
- `packages/app/src/globals.css` — no imports, no `fd-` prefixed variables
- `packages/app/src/main.tsx` — imports only `./globals.css`
- pr23-rebase `globals.css` — also zero fumadocs references

### What fumadocs-ui ships

| File | Lines | Purpose | Import risk |
|------|-------|---------|-------------|
| `fumadocs-ui/style.css` | 3296 | Pre-compiled Tailwind v4 monolithic bundle | **HIGH** — sets body bg/color, resets all border-color, full utility compilation |
| `fumadocs-ui/css/preset.css` | 312 | Tailwind v4 preset (for `@import` in TW4 projects) | **MEDIUM** — conflicts with our `@custom-variant dark` and base resets |
| `fumadocs-ui/css/default.css` | 34 | Color token declarations only (transparent defaults + static callout colors) | **LOW** — pure variables, no base overrides |
| `fumadocs-ui/css/{theme}.css` | varies | Theme variants (catppuccin, dusk, ocean, etc.) | **LOW** — pure variable overrides |

### What components need

| CSS requirement | Components using it | Source |
|----------------|-------------------|--------|
| `--color-fd-card`, `--color-fd-card-foreground` | Tabs, Accordion, Cards, Files, Callout, TypeTable, InlineTOC | Background + text color |
| `--color-fd-secondary`, `--color-fd-secondary-foreground` | Tabs, Steps (`fd-step::before`) | Tab list bg, step number bg |
| `--color-fd-muted`, `--color-fd-muted-foreground` | Cards, Callout, TypeTable, InlineTOC | Muted text, description |
| `--color-fd-accent`, `--color-fd-accent-foreground` | Files, TypeTable | Hover states |
| `--color-fd-border` | Accordion, Cards, Files, InlineTOC | Border color |
| `--color-fd-primary` | Tabs (active indicator) | Tab trigger active state |
| `--color-fd-background` | Tabs (TabsContent bg), Banner | Content panel bg |
| `--color-fd-info`, `--color-fd-warning`, etc. | Callout (5 types) | Callout accent color |
| `--animate-fd-accordion-down/up` | Accordion | Expand/collapse animation |
| `--animate-fd-collapsible-down/up` | Files (Folder), TypeTable, InlineTOC | Expand/collapse animation |
| `fd-steps` / `fd-step` @utility | Steps | Counter numbering, vertical line, step circles |
| `prose-no-margin` @utility | Callout, Accordion, TypeTable | First/last child margin reset |
| `fd-scroll-container` @utility | TypeTable | Custom scrollbar |

### Recommended CSS integration

**Cherry-pick approach** (~80 lines added to `globals.css`):

1. **Map fd tokens to existing shadcn tokens** (zero new visual design):
```css
:root {
  --color-fd-background: var(--background);
  --color-fd-foreground: var(--foreground);
  --color-fd-card: var(--card);
  --color-fd-card-foreground: var(--card-foreground);
  --color-fd-muted: var(--muted);
  --color-fd-muted-foreground: var(--muted-foreground);
  --color-fd-border: var(--border);
  --color-fd-primary: var(--primary);
  --color-fd-primary-foreground: var(--primary-foreground);
  --color-fd-secondary: var(--secondary);
  --color-fd-secondary-foreground: var(--secondary-foreground);
  --color-fd-accent: var(--accent);
  --color-fd-accent-foreground: var(--accent-foreground);
  --color-fd-ring: var(--ring);
}
```

2. **Static callout/diff colors** from `default.css`:
```css
:root {
  --color-fd-info: oklch(62.3% 0.214 259.815);
  --color-fd-warning: oklch(76.9% 0.188 70.08);
  --color-fd-error: oklch(63.7% 0.237 25.331);
  --color-fd-success: oklch(72.3% 0.219 149.579);
  --color-fd-idea: oklch(70.5% 0.209 60.849);
}
```

3. **Cherry-picked utilities** from `preset.css`:
```css
/* Steps counter styling */
.fd-steps {
  counter-reset: step;
  position: relative;
  padding-left: 1.5rem;
  margin-left: 0.5rem;
  border-left: 1px solid var(--color-fd-border);
}
@media (min-width: 640px) {
  .fd-steps { margin-left: 1rem; padding-left: 1.75rem; }
}
.fd-step::before {
  background-color: var(--color-fd-secondary);
  color: var(--color-fd-secondary-foreground);
  content: counter(step);
  counter-increment: step;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  width: 2rem;
  height: 2rem;
  position: absolute;
  left: -1rem;
  border-radius: 9999px;
}

/* Margin reset for content-bearing wrappers */
.prose-no-margin > :first-child { margin-top: 0; }
.prose-no-margin > :last-child { margin-bottom: 0; }
```

4. **Keyframes** from `preset.css`:
```css
@keyframes fd-accordion-down {
  from { height: 0; opacity: 0.5; }
  to { height: var(--radix-accordion-content-height); }
}
@keyframes fd-accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; opacity: 0.5; }
}
@keyframes fd-collapsible-down {
  from { height: 0; opacity: 0; }
  to { height: var(--radix-collapsible-content-height); }
}
@keyframes fd-collapsible-up {
  from { height: var(--radix-collapsible-content-height); }
  to { height: 0; opacity: 0; }
}
```

5. **Tell Tailwind to scan fumadocs sources** for utility class generation:
```css
/* At top of globals.css, alongside existing @source directives */
@source "../../node_modules/fumadocs-ui/dist/**/*.js";
```
Or equivalently, in a Tailwind v4 config section. This ensures classes like `bg-fd-card`, `text-fd-card-foreground`, `rounded-xl`, `divide-y` etc. used by fumadocs components are included in the compiled output.

---

## §6 Options Ranked

### Option E — Editor-local CSS token mapping + Tailwind source scan (RECOMMENDED)

**What:** Map `--color-fd-*` to existing shadcn tokens. Add `@source` directive for fumadocs dist. Cherry-pick Steps utilities and keyframes. No component code changes.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **HIGH** — components render with real fumadocs styles, interactive behavior (tab switching, accordion toggle) works out of the box |
| Implementation cost | **~80 LoC** CSS in `globals.css` + `@source` directive |
| Risk | **LOW** — no JS changes, additive CSS only, zero impact on existing components |
| Architectural cleanliness | **HIGH** — follows precedent of dual-theming (our app already has shadcn CSS variables) |

### Option A — Accept unstyled + source-mode fallback

**What:** Render fumadocs components as-is without CSS. Users see raw structure. Rely on source mode for authored view.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **LOW** — components look broken (transparent backgrounds, missing borders, invisible step numbers) |
| Implementation cost | **0 LoC** |
| Risk | **NONE** |
| Architectural cleanliness | **LOW** — ships broken UI (violates architectural precedent #7) |

### Option D — "Editor mode" with all-visible rendering

**What:** Detect editor context; force Tabs to show all panels, Accordion to expand all items.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **MEDIUM** — correct visually, but loses interactive affordances |
| Implementation cost | **~200 LoC** — wrapper components per container type |
| Risk | **LOW** |
| Architectural cleanliness | **MEDIUM** — adds maintenance surface for container wrappers |

**Note:** This option is UNNECESSARY for P0. Tabs already use `forceMount: true` with CSS hiding — if we simply don't import the `data-[state=inactive]:hidden` CSS class, all tabs show simultaneously. Accordion uses Radix's animated content — without the hiding CSS, all items show expanded. The "all visible" behavior comes for free by NOT importing the hiding CSS.

### Option F — Context-provider bridging

**What:** Wrap the editor root in `FrameworkProvider` with stubs for `Link`, `Image`, `usePathname`, etc.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **MINIMAL GAIN** — `Link` and `Image` already gracefully degrade without provider |
| Implementation cost | **~15 LoC** — but sets a precedent for provider bloat |
| Risk | **LOW** |
| Architectural cleanliness | **LOW** — adds a framework provider for a non-framework app |

**Verdict:** Not needed. Verified that `Link` → `<a>` and `Image` → `<img>` fallbacks work without any provider.

### Option B — NodeViewWrapper shape adjustment

**What:** Use `as="Fragment"` or custom DOM output on NodeViewWrapper.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **MINIMAL GAIN** — containers don't filter by child type, so wrappers don't break anything |
| Implementation cost | **~20 LoC** per NodeView |
| Risk | **MEDIUM** — removing NodeViewWrapper div may break ProseMirror's node DOM management |
| Architectural cleanliness | **LOW** — fights the framework |

**Verdict:** Not needed. No component filters children by type.

### Option C — Editor-aware component shims

**What:** Wrap fumadocs components with adapters that strip/rearrange children.

| Dimension | Assessment |
|-----------|-----------|
| UX quality | **N/A** — no children-filtering problem exists to solve |
| Implementation cost | **N/A** |
| Risk | **N/A** |
| Architectural cleanliness | **N/A** |

**Verdict:** Solution to a non-existent problem. Fumadocs containers don't filter children.

---

## §7 Recommended Spec Amendment

Add to SPEC.md, either in §9.7 after the NodeView code block, or as a new §9.7a:

```markdown
### §9.7a Fumadocs Component CSS Integration

fumadocs-ui v16.1.0 components use Tailwind utility classes referencing the `fd-*` CSS
variable namespace (`bg-fd-card`, `text-fd-card-foreground`, `animate-fd-accordion-down`).
These variables are NOT included in our editor's CSS by default.

**Required additions to `packages/app/src/globals.css`:**

1. **Token bridge** (~15 LoC): map `--color-fd-*` to existing shadcn design tokens:
   `--color-fd-card: var(--card)`, `--color-fd-border: var(--border)`, etc.
   No new visual design — pure aliasing. Dark mode inherits from shadcn's `.dark` overrides.

2. **Static semantic colors** (~5 LoC): callout accent colors
   (`--color-fd-info`, `--color-fd-warning`, `--color-fd-error`, `--color-fd-success`,
   `--color-fd-idea`) copied from `fumadocs-ui/css/default.css`.

3. **Steps utility classes** (~20 LoC): `fd-steps` and `fd-step` CSS counter styling
   cherry-picked from `fumadocs-ui/css/preset.css:260-280`.

4. **Animation keyframes** (~20 LoC): `fd-accordion-down/up` and `fd-collapsible-down/up`
   from `preset.css` — required for Accordion and Files (Folder) expand/collapse.

5. **Tailwind source scan** (1 LoC): `@source` directive telling Tailwind v4 to scan
   fumadocs-ui dist for utility classes: `@source "../../node_modules/fumadocs-ui/dist/**/*.js";`

6. **prose-no-margin utility** (~3 LoC): margin reset used by Callout, Accordion,
   TypeTable content areas.

**NOT imported:** `fumadocs-ui/style.css` (3296-line monolithic bundle that resets body
colors and all border-color — conflicts with our design system). NOT imported:
`fumadocs-ui/css/preset.css` (conflicts with our `@custom-variant dark` declaration).

**Container component interactive behavior:** Works out of the box. Radix Tabs, Accordion,
and Collapsible use React context for state — NodeViewWrapper divs are transparent.
Tab switching, accordion expand/collapse, folder toggle all functional in the editor.
No editor-mode wrappers, no context shims needed.

**FrameworkProvider not required.** `fumadocs-core/link` `Link` and `fumadocs-core/framework`
`Image` gracefully degrade to `<a>` and `<img>` respectively when no `FrameworkProvider`
wraps the component tree. Only routing hooks (`usePathname`, `useRouter`, `useParams`)
throw — and no P0 content component calls them.
```

---

## §8 What This Research Did NOT Cover

1. **Actual browser rendering verification.** All predictions are based on source code analysis. No component was rendered in the actual editor with the actual CSS. Browser DevTools verification is needed to confirm CSS variable resolution and interactive behavior.

2. **Performance impact of rendering fumadocs components inside ProseMirror.** Radix UI components create React context providers per-instance — a document with 20 Tabs components creates 20 TabsContext providers. Performance at scale not measured.

3. **`@source` directive interaction with Vite's CSS processing.** The `@source "../../node_modules/fumadocs-ui/dist/**/*.js"` directive needs verification under our Vite dev server's Tailwind processing pipeline. May need path adjustment or explicit Tailwind v4 content configuration.

4. **Cross-tab persistence (Tabs `groupId` feature).** Fumadocs Tabs support `groupId` for synchronized tab selection across instances (same tab value in all groups with the same ID). This uses `localStorage`/`sessionStorage`. Behavior inside the editor (where documents are transient) not investigated.

5. **Drag-and-drop interactions.** Dragging a Tab out of its Tabs parent, or an Accordion item out of its Accordions container, may produce structurally invalid documents. The spec notes this as NG8 (not P0).

6. **`@inkeep/docskit/mdx` components (CodeGroup, Frame, Video).** These are imported in `componentMap.ts` but are from a different package, not fumadocs-ui. Not analyzed.

7. **Dark mode token mapping.** The shadcn `.dark` class overrides CSS variables — these would flow through the `--color-fd-*: var(--card)` aliases. Not visually verified for color correctness.

8. **`image-zoom.css` content.** The ImageZoom component imports a separate CSS file for the zoom overlay. Not checked whether our editor includes it or needs to.

---

## Evidence Files

| File | Contents |
|------|----------|
| `evidence/tabs.md` | Tabs/Tab/TabsContent source analysis, Radix context model, `forceMount: true` behavior |
| `evidence/accordion.md` | Accordions/Accordion source analysis, Radix Accordion context model |
| `evidence/steps.md` | Steps/Step source analysis (8 lines total, pure CSS) |
| `evidence/cards.md` | Cards/Card source analysis, `fumadocs-core/link` dependency |
| `evidence/files.md` | Files/File/Folder source analysis, Radix Collapsible |
| `evidence/callout.md` | Callout source analysis, CSS variable deps |
| `evidence/banner.md` | Banner source analysis, side effects warning |
| `evidence/image.md` | ImageZoom source analysis, framework graceful degradation |
| `evidence/type-table.md` | TypeTable source analysis |
| `evidence/css-state.md` | Full CSS gap analysis — what ships, what we import, what's needed |
| `evidence/pr23-rebase-status.md` | pr23-rebase worktree implementation status |

## Cross-references

- `reports/fumadocs-full-pipeline/REPORT.md` — confirms components are "ordinary React components with TypeScript interfaces" that can be rendered directly
- `reports/fumadocs-stack-reusability-deep-analysis/REPORT.md` — confirms "no global context provider required by any content component"; recommends pattern-copying ~400 lines vs importing full package (CSS integration is a lighter alternative)
- `reports/storybook-ecosystem-component-blocks-reuse/` — validates PropDef extraction approach; notes compound component context injection as "universal failure mode" in visual editors (not applicable here — fumadocs uses context correctly)
- `reports/obsidian-vs-fumadocs-component-inventory/REPORT.md` — component inventory confirms P0 scope
