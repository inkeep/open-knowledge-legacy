# Audit: T1 (typed-component-nodes) Carry-Forward Findings

**Audit date:** 2026-04-14
**Source:** T1 SPEC (1042L) + rebased implementation on `pr23-rebase` branch + evidence dir (12 files) + meta/ (8 audits)
**Target:** `specs/2026-04-14-component-blocks-v2/SPEC.md` (662L; baseline 699a27e)
**Total findings:** 21 (12 KEEP, 5 DISCUSS, 7 ALREADY CAPTURED clusters, 6 OBSOLETE clusters)

Audit prioritized KEEP/DISCUSS for actionability. Confidence calibrated by reading both source SPEC and target SPEC fully, plus implementation files in `../pr23-rebase/packages/`.

---

## KEEP — carry forward to Component Blocks v2 SPEC

### [KEEP-1] Add `description` and `searchTerms` to the descriptor schema

**Source:** `packages/core/src/registry/built-ins.ts:44-235` (21 entries, each with `description` + `searchTerms`); `types.ts:58-65` (`ComponentMeta.description`, `ComponentMeta.searchTerms`); `packages/core/scripts/build-registry.ts:118-135` (description auto-extracted from upstream TSDoc with hand-maintained fallback, truncated to first line).
**Insight:** T1's descriptor carries two fields our SPEC does not name:
- `description: string` — one-line component summary for slash menu + agent discovery (MCP)
- `searchTerms: string[]` — aliases (e.g., Callout → `['note', 'warning', 'tip', 'info', 'alert']`)

The build-registry script implements a clever two-source resolution: prefer upstream `doc.description` (from fumadocs-ui TSDoc) and fall back to the hand-maintained `entry.description`. Takes the first line only, so multi-line TSDoc is handled gracefully.
**Why still applies:** Our SPEC's §9.2 `JsxComponentDescriptor` lists `icon`, `category`, `displayName` but omits both fields. `searchTerms` is critical for slash-command fuzzy matching (`/note` → Callout). `description` is what P4 (MCP-consuming agents) reads to decide when to use a component. Our FR-14 mentions "category grouping" but not these supplementary fields; our P4 persona explicitly wants "typed, stable, programmatically-queryable registry" — without `description` agents have only the name to go on.
**Recommended addition:** §9.2 descriptor — add `description?: string` + `searchTerms?: string[]`. Port the description-first-line + upstream-TSDoc-preferred logic into our `build-registry.ts` verbatim (the salvage map §9.9 already marks it "verbatim").

---

### [KEEP-2] PropDef as discriminated union (not flat interface)

**Source:** `packages/core/src/registry/types.ts:11-50` — T1 evolved `PropDef` from a flat interface with optional `enumValues` to a discriminated union (`PropDefString | PropDefBoolean | PropDefNumber | PropDefEnum | PropDefReactNode`). This makes `{ type: 'enum' }` without `enumValues` unrepresentable at the type level.
**Insight:** Illegal states like `{ type: 'enum', enumValues: undefined }` are compile-time errors. Each variant narrows `defaultValue` to the correct primitive type (`PropDefString.defaultValue?: string` vs `PropDefNumber.defaultValue?: number`). Also: `PropDefReactNode` has no `defaultValue` field at all, encoding the structural truth that ReactNode is a content hole, not a prop value.
**Why still applies:** Our SPEC §9.2 references `PropDef[]` without defining it inline. The PR-23 rebased type is the production-hardened shape — nothing in post-#136 invalidates it. Our FR-11/FR-12 "auto-generated controls" depend on exhaustive narrowing (the switch on `prop.type` in PropPanel.tsx:91-123 is only type-safe under the union form).
**Recommended addition:** §9.2 or §13 — inline the discriminated-union PropDef from `types.ts:11-50` verbatim. Note the decision: "discriminated union, not flat interface — illegal states unrepresentable."

---

### [KEEP-3] Descriptor schema `props: PropDef[]` semantics match our descriptor pattern, but rename/extend as T1 did

**Source:** `packages/core/src/registry/types.ts:53-66` (`ComponentMeta`); T1 §3.1 Layer A.
**Insight:** T1's `ComponentMeta` is essentially our `JsxComponentDescriptor` minus `isInline`/`hasChildren`/`Component`. The rebased types can be adapted 1:1 (our §9.9 salvage map already marks types.ts as `✅ adapt`). However, our SPEC does not explicitly define the split between "what core can know" (metadata, no React) and "what app adds" (the React `Component`). T1's 3-way registry split (Layer A core types, Layer B generated cache, Layer C app React map) is still correct post-#136 — it's solved by our MDXEditor descriptor pattern but the core/app boundary still needs enforcement.
**Why still applies:** Our SPEC §13 In Scope lists `packages/core/src/registry/*` but doesn't say the React `Component` field must be injected from app-side (since core is React-free per CLAUDE.md). The descriptor pattern as currently written in §9.2 has `Component: React.ComponentType<any>` — that cannot live in core. Either (a) split descriptor into `CoreDescriptor` (in core, no Component) + runtime merge with a separate `componentMap` in app, OR (b) core only exports types + metadata, and the full `JsxComponentDescriptor` lives in app.
**Recommended addition:** §9.2 or §13 — call out the core/app split explicitly. Port T1's `packages/app/src/editor/components/componentMap.ts` pattern (name → React impl, app-only) as the runtime lookup. State that `JsxComponentDescriptor.Component` only lives in the app-side merged registry.

---

### [KEEP-4] `propFilter` rules for react-docgen-typescript (critical correctness)

**Source:** `packages/core/scripts/build-registry.ts:18-27`:
```ts
propFilter: (prop) => {
  if (prop.parent?.fileName.includes('@types/react')) return false;
  if (prop.parent?.fileName.includes('node_modules/react/')) return false;
  if (prop.type.name.startsWith('(')) return false;
  return true;
}
```
Plus `shouldExtractLiteralValuesFromEnum: true`, `shouldRemoveUndefinedFromOptional: true`, `skipChildrenPropWithoutDoc: false`.
**Insight:** These three filter rules encode non-obvious correctness:
1. **`@types/react`** filter only (not blanket `node_modules`) — fumadocs-ui's OWN props live under `node_modules/fumadocs-ui/dist/*.d.ts`; a blanket filter drops them all. This is the single most load-bearing line in T1's build script.
2. **`node_modules/react/`** filter — react's own types (as opposed to `@types/react`) add DOM props that are noise.
3. **`startsWith('(')`** — catches callback signatures like `(e: Event) => void`; callback props have no sensible UI control.

`shouldExtractLiteralValuesFromEnum: true` is what makes `"warning" | "error" | "info"` come out as `enumValues: ['warning', 'error', 'info']` rather than `type: 'string'`.
`skipChildrenPropWithoutDoc: false` is load-bearing — r-d-ts defaults to skipping undocumented `children`, and we rely on detecting `children: ReactNode` structurally.
**Why still applies:** Our SPEC §13 names `packages/core/scripts/build-registry.ts` and Assumptions A1 mentions MdxJsxAttribute readability, but there's no specification of the r-d-ts parser config. First-try implementations without these rules will produce empty prop lists for all 16 fumadocs components. Evidence file `react-docgen-typescript-behavior.md` (A1 calibration) documents this trap explicitly.
**Recommended addition:** §9 new subsection or §13 — inline the propFilter rules as a required implementation detail. One-sentence call-out: "BLANKET `node_modules` FILTER DROPS fumadocs-ui PROPS — filter only `@types/react` and `node_modules/react/`."

---

### [KEEP-5] `resolveDts()` helper pattern for package.json `exports` restrictions

**Source:** `packages/core/src/registry/built-ins.ts:14-28` — T1's shipped pattern for getting `.d.ts` paths out of published packages whose `exports` maps block direct `dist/` imports:
```ts
function resolveDts(packageName: string, relativePath: string): string {
  const pkgDir = path.dirname(require.resolve(`${packageName}/package.json`));
  return path.join(pkgDir, relativePath);
}
```
**Insight:** Modern published packages (including fumadocs-ui) use `exports` fields that restrict direct subpath access. `require.resolve('fumadocs-ui/dist/components/callout.d.ts')` fails; `require.resolve('fumadocs-ui/components/callout')` works but returns the JS entry, not the .d.ts. The workaround: always resolve to `package.json` (always in exports) and construct the `dist/` path relative to the package dir.
**Why still applies:** Our SPEC §13 lists `scripts/build-registry.ts` as in-scope but doesn't warn about this trap. Implementing without this helper will fail on day one with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The T1 spec §4 Phase 1 Step 2 (source line 604-618) has 15 lines of prose explaining this — we should keep the one-sentence takeaway and the helper.
**Recommended addition:** §9.9 or §13 — either port the `resolveDts` helper verbatim (it's 3 lines + a comment) or one-line gotcha: "Use `path.dirname(require.resolve(pkg/package.json))` + `path.join` — direct dist/ resolve fails on exports-restricted packages."

---

### [KEEP-6] Preserve-unknown-attributes collision policy (§3.8 of T1) — still relevant under descriptor dispatch

**Source:** T1 SPEC §3.8 (lines 473-495); implementation at `jsx-component-factory.ts:230-263`:
```ts
const declaredProps = new Set(componentMeta.props.map((p) => p.name));
// split props into knownProps + unknownProps
// serialize _unknownAttrs as JSON, merge back on renderMarkdown
```
Plus collision test scenario RT08 (T1 SPEC line 880): content has `<Card title="GitHub" icon="brand/GitHub" href="/github" color="#F05032" external>` (agents-docs shape) — fumadocs Card has no `color`/`external` → must preserve via unknown-attrs and round-trip byte-identically.
**Insight:** A user's custom `<Card>` may semantically differ from a built-in `<Card>`. Under our descriptor dispatch pattern (§9.2 `getDescriptor(name) ?? wildcard`), name-match wins — we render with built-in Card but the user's extra attributes exist in their source. Two possible behaviors:
- **γ-pristine path:** No edit → sourceRaw serializes → extra attrs byte-identical. GOOD.
- **γ-dirty path:** Edit → reconstruct from `attributes` mdast → if we only reconstruct from descriptor's PropDef[], **unknown attrs are silently dropped.**

T1's fix: `_unknownAttrs` JSON-encoded carrier attr on the node. Under γ, we could instead read them from the `attributes` attr (which we already preserve per FR-3 / FR-5 reconstructAttrs).
**Why still applies:** Our SPEC §5 user-journey for custom registration assumes exact name match with the user's own component. The collision case (user Card ≠ fumadocs Card) is not explicitly addressed. Our §9.2 wildcard registration assumes "any name not in registry → wildcard" — but name collisions where semantics differ are a silent-data-loss risk on the dirty path.
**Recommended addition:** §6 FR-5 or new subsection under §9.4 — explicitly: "On γ-dirty reconstruction, emit ALL attributes from `pmNode.attrs.attributes` (the mdast shape preserved at parse) + any descriptor-mapped structured attrs. Attrs not in descriptor's PropDef are preserved verbatim." Add a test to M-series: "edit children of Card with unknown `color` attr → save → `color` still present."

Confidence: this is a real hazard. Probe §8 of our SPEC mentions `attributes: node.attributes, // preserve mdast shape for serialize` — the attr exists. But §9.4 `reconstructAttrs` description only says "for each PropDef attr on the node, emit MdxJsxAttribute" — this narrows to declared props only. Bug hazard.

---

### [KEEP-7] `markUserTyping` needs Y.Doc argument (post-PR-#128)

**Source:** `packages/app/src/editor/extensions/JsxComponentView.tsx:125`:
```ts
markUserTyping(getYDoc(editor));
```
plus `import { getYDoc } from '@/editor/utils/get-ydoc'`.
**Insight:** Post-PR-#128, `markUserTyping` takes a Y.Doc argument (typing-defer state is per-doc via WeakMap, not global). This is a concrete API detail the PropPanel must respect. T1's rebase branch has already migrated to this signature — visible in JsxComponentView.tsx:125,205 and PropPanel.tsx's `markTyping` prop.
**Why still applies:** Our SPEC FR-13 says "also call `markUserTyping(getYDoc(editor))`" — good, already current. But §9.7 NodeView code block shows `markTyping={...}` without making the Y.Doc plumbing explicit. A future implementer reading §9.7 alone may write `markUserTyping()` (no-arg) and break the per-doc typing-defer. Also: `getYDoc(editor)` is a utility at `@/editor/utils/get-ydoc` — either exists on main post-#128 or needs to be written.
**Recommended addition:** §9.7 NodeView code block — expand `markTyping={...}` to `markTyping={() => markUserTyping(getYDoc(editor))}`. Verify `getYDoc` utility exists post-#128 (if not, add to §13 scope).

---

### [KEEP-8] `priority: 60` for editable (before 59 void) resolves registration ordering — relevant to our single-node widening

**Source:** `jsx-component-factory.ts:151,375` — T1 gave `jsxComponentEditable` priority 60 and `jsxComponentVoid` priority 59 explicitly with a comment: "Below editable so it doesn't intercept registered components."
**Insight:** Under the two-node design, priority routing was load-bearing. Under our single-node widening (§D1 LOCKED), this specific hazard is gone. HOWEVER: the deeper principle — **extension ordering is semantically significant for TipTap markdown-tokenizer registration** — applies to our design too. Our SPEC §14 Risks mentions "changes to `sharedExtensions` ordering (R10 snapshot orders matter)" — acknowledged in ASK_FIRST but not as an implementation detail.

Our setup: single `jsxComponent` widened extension, single `jsxInline` (extended from #136), `rawMdxFallback` from #105. #136 established the ordering; we extend. Relevant: if our `.extend()` on jsxInline changes the TipTap registration order, schema-snapshot drifts.
**Why still applies:** Narrow call-out, but valuable for implementers. The lesson from T1 is "think about priority when two extensions share a tokenizer/name"; for us the analog is "think about `.extend()` vs fresh `Node.create` for jsxInline — extend preserves registration order, a wholesale replace does not."
**Recommended addition:** §6 FR-4 or §9 — one-sentence note: "Use `.extend({ addAttributes, addNodeView })` on jsxInline, not wholesale replace, to preserve R10 snapshot ordering."

---

### [KEEP-9] `isolating: true` boundary tests (QA-017) for widened jsxComponent — test harness template

**Source:** `packages/core/src/registry/jsx-component-isolating.test.ts` (274 lines). Tests five boundary invariants:
1. Schema has `isolating: true`
2. `joinBackward` from start of first child is blocked by boundary
3. Selecting all text inside children + Backspace preserves the component (deleteSelection succeeds, wrapper persists)
4. `joinBackward` on an empty paragraph inside component is STILL blocked
5. `joinForward` at end of last child is blocked
6. `deleteSelection` spanning into the component from outside is clamped

These are command-path tests (no DOM, no TipTap Editor instance) — direct PM `chainCommands(deleteSelection, joinBackward)` application on a schema built from `sharedExtensions`.
**Insight:** Without `isolating: true`, ProseMirror's resolution of the "block+" schema constraint when the last child is removed is to delete the parent. This matches a real bug (QA-017). T1 hardened the fix with 6 direct PM-command tests, not Playwright.
**Why still applies:** Our SPEC §6 FR-3 mandates `isolating: true` on widened jsxComponent — but no test coverage is called out for boundary semantics. Our M-series metrics (M1-M8) cover Layer 2/3 rendering, byte-identity, and observer origin-matrix but NOT isolating-boundary safety. Under our widening, an implementer could accidentally omit `isolating: true` (it's a ProseMirror attr, easy to drop during `.extend()` merges).
**Recommended addition:** §7 M-series — add M9: "isolating-boundary safety: 6 PM-command tests covering joinBackward, joinForward, deleteSelection across the widened jsxComponent boundary." Port `jsx-component-isolating.test.ts` near-verbatim; the rebased version is compatible with our widened schema (only the `_childrenString` attr name would change to match our attr scheme).

Confidence: HIGH. This test file is gold — it's the only thing in T1's rebase that mechanically guards against schema-induced content-deletion bugs.

---

### [KEEP-10] ComponentErrorBoundary per-node isolation

**Source:** `packages/app/src/editor/extensions/JsxComponentView.tsx:23-62` — class-component error boundary wrapping the rendered third-party component:
```tsx
class ComponentErrorBoundary extends Component<
  { componentName: string; children: ReactNode }, { error: Error | null }
> {
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error, info) { console.error(`[JsxComponentView] <${this.props.componentName}> crashed...`); }
  render() { if (this.state.error) return <ErrorBox>...</ErrorBox>; return this.props.children; }
}
```
Used as `<ComponentErrorBoundary componentName={componentName}>{RenderedComponent ? <RenderedComponent .../> : <fallback />}</ComponentErrorBoundary>`.
**Insight:** A third-party component (fumadocs Mermaid with invalid chart source, TypeTable with malformed props, user's custom component with a bug) crashing in a WYSIWYG render would take down the whole editor without this boundary. T1's boundary isolates each component instance — crash one, the others keep rendering, the user sees a bordered red error box specific to that instance.
**Why still applies:** This is a product-experience floor, not a polish item. Custom components (our §D10 IN-SCOPE) amplify the risk — users will ship components with bugs. Our SPEC has no mention of render-error isolation. FR-9/FR-10 describe NodeView composition but not the error boundary wrapper.
**Recommended addition:** §6 new FR or §9.7/§9.8 NodeView code — add `<ComponentErrorBoundary>` around the `<Component {...primitiveProps}>` call. Port verbatim from JsxComponentView.tsx:23-62 (React Compiler compatible, class component is fine).

---

### [KEEP-11] Click-to-select pattern for widened (non-atom) block: `setNodeSelection(getPos())`

**Source:** `JsxComponentView.tsx:148-177`:
```tsx
<button type="button" contentEditable={false} ...
  onClick={() => {
    const pos = getPos();
    if (typeof pos === 'number' && editor) {
      editor.commands.setNodeSelection(pos);
    }
  }}>
  <ComponentToolbar componentName={componentName} />
</button>
```
Comment: "For non-atom nodes (content: 'block+'), ProseMirror doesn't auto-create NodeSelection from clicks on contentEditable=false regions — we need to do it programmatically."
**Insight:** This is a non-obvious PM detail. Atom nodes get NodeSelection on click automatically; block-container nodes (our widened jsxComponent with `content: 'block*'`) do not. Without this click handler, clicking the component toolbar/badge doesn't select the node → PropPanel mount-on-selected never triggers → users can't open PropPanel by clicking. Our Block UX Phase 2 depends on NodeSelection for Esc/arrow navigation (FR-18). If clicking doesn't produce a NodeSelection, the keyboard-nav state machine can't start.
**Why still applies:** Our SPEC §6 FR-9 says "Click-to-open PropPanel" but no implementation detail on how selection is induced. §9.7 NodeView code has `{!isChildOfComponent && <ComponentToolbar onOpenProps={...} />}` — the `onOpenProps` prop is abstract; the concrete mechanism is `setNodeSelection(getPos())`. Under SideMenu (§9.10) the drag handle induces selection, but for direct-click on the component badge we need this pattern.
**Recommended addition:** §9.7 NodeView code block — show the click handler explicitly: `onClick={() => editor.commands.setNodeSelection(getPos())}`. One-line note under FR-9: "Non-atom block nodes require explicit `setNodeSelection(getPos())` for click-to-select."

---

### [KEEP-12] PropPanel `onMouseDown` stopPropagation for ProseMirror event isolation

**Source:** `JsxComponentView.tsx:70-91` (`PropPanelWrapper`):
```tsx
<div contentEditable={false} style={...}
  onMouseDown={(e) => e.stopPropagation()}>
  <PropPanel ... />
</div>
```
Comment: "Without this, clicking inside the PropPanel (e.g., a text input) causes PM to deselect the node → selected becomes false → panel unmounts mid-interaction."
**Insight:** This is the exact pattern the ProseMirror docs recommend for clickable controls inside node views. Without it, every text input click in the prop panel deselects the node, unmounting the panel (because `{selected && <PropPanel />}`) mid-interaction. The user types one character, loses focus, has to click back in.
**Why still applies:** Our SPEC has no mention of this. FR-11/FR-12 describe PropPanel UX abstractly; the `selected && <PropPanel />` mount pattern is implicit. Our §9.7/§9.8 code blocks omit the wrapper. First-try implementers will ship a broken PropPanel — the bug is extremely easy to produce and hard to debug ("PropPanel flickers when I click the input").
**Recommended addition:** §9.7/§9.8 NodeView code blocks — wrap PropPanel in `<div contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>`. One-line note: "ProseMirror docs pattern for clickable controls in node views — prevents node deselection on control click."

---

## DISCUSS — needs user judgment

### [DISCUSS-1] Should built-ins include `searchTerms` out-of-the-box, or defer to user customization?

**Source:** T1's `built-ins.ts` has `searchTerms` for every component (`Callout: ['note', 'warning', 'tip', 'info', 'alert']`). These are hand-maintained aliases for slash-command fuzzy search.
**Question:** Worth the maintenance cost for built-ins? Do we trust the T1 curator's taste here?
**Options:**
- **A.** Port all searchTerms verbatim from `built-ins.ts`. Pro: `/warning` → Callout works out of the box. Con: new built-in upgrades need searchTerms hand-added (caught by drift CI but still manual).
- **B.** Drop searchTerms for P0 built-ins; users add them via `.open-knowledge/components.ts` if needed. Pro: no curation responsibility. Con: `/warning` returns nothing until user adds it. Degrades built-ins UX to custom-component UX.
- **C.** Port only high-leverage aliases (Callout, Card, Steps). Pro: covers the 80%. Con: arbitrary curation.
**Recommendation:** **A** — port verbatim. T1's curation is already sensible (Callout → note/warning/tip/info/alert matches Obsidian+fumadocs conventions). Zero maintenance cost — it's `.ts` data. Medium confidence; user may disagree on curation taste.

---

### [DISCUSS-2] Should the wildcard descriptor render a "name badge" differently depending on whether children exist?

**Source:** Our §9.7/§9.8 wildcard path renders `<UnregisteredBadge name={...} />` (block) or `<InlineBadge name={...} />` (inline). T1's `UnregisteredFallback.tsx` renders a 2-part component: gray header "Unregistered component: <TagName>" + `<pre>` showing the raw JSX content.
**Question:** Do we want T1's "show the raw JSX" behavior, or our cleaner "badge + editable children" behavior?
**Options:**
- **A.** Our current spec: clean badge + editable markdown children. Closer to Notion/Plate's pattern. More "editable-first." Loses the raw-JSX visibility (user can't tell what attrs the parent has without going to source mode).
- **B.** T1-style: show raw JSX + attrs in a collapsible header, children editable below. More "inspectable." Heavier visual footprint.
- **C.** Hybrid: clean badge by default; Ctrl+click (or toolbar button) to inspect raw JSX.
**Recommendation:** **A** (our current) — consistent with our "best product experience" framing and matches the competitive prior art. Note the tradeoff explicitly in §5 user journeys so we know to reconsider if users ask "why can't I see the props of this unknown component?" High confidence that A is right for P0; DISCUSS because user explicitly flagged §3.8 as potentially-missing.

---

### [DISCUSS-3] `_unknownAttrs` carrier attr vs pure mdast `attributes` preservation

**Source:** T1 stores unknown attrs as `_unknownAttrs: JSON.stringify({...})` on the PM node (factory:261-263). Our SPEC preserves `attributes: node.attributes` (mdast shape) directly on the node. Under dirty-path reconstruction, T1's path deterministically round-trips all unknown attrs; our path depends on `reconstructAttrs` implementation detail.
**Question:** Use the T1 carrier + reconstruction merge, or fully mdast-based preservation?
**Options:**
- **A.** T1's `_unknownAttrs` carrier — explicit, JSON-encoded, survives any reconstruction. Extra attr on schema.
- **B.** Pure mdast `attributes` preservation (our current §9.3/§9.4) — simpler schema; requires `reconstructAttrs` to be correct and to merge descriptor-mapped attrs with preserved `attributes` union.
- **C.** Both: `attributes` is the primary mdast shape, `_unknownAttrs` is a computed derivative for debugging.
**Recommendation:** **B** with a specific clarification in §9.4: `reconstructAttrs` must merge descriptor-mapped structured attrs ON TOP of the preserved `attributes` union (descriptor attrs win for keys present in PropDef; all other attrs pass through from `attributes`). Close to T1 RT08 semantics. Medium-high confidence.

---

### [DISCUSS-4] Should PropPanel default props come from PropDef `defaultValue`?

**Source:** `component-items.ts:48-66` — T1's `getDefaultProps(meta)` logic:
```ts
if (prop.defaultValue !== undefined) defaults[prop.name] = prop.defaultValue;
else if (prop.type === 'enum' && prop.enumValues.length > 0) defaults[prop.name] = prop.enumValues[0];
else if (prop.type === 'boolean') defaults[prop.name] = false;
else if (prop.type === 'number') defaults[prop.name] = 0;
else defaults[prop.name] = '';
```
Used when slash-inserting a component — initial props come from PropDef defaults.
**Question:** Adopt T1's fallback ladder (defaultValue → first enum → false/0/empty)? Or always let users type from scratch?
**Options:**
- **A.** T1's ladder — slash-inserted Callout arrives with `type: 'warning'` (or whatever fumadocs declares default). User sees a rendered callout immediately.
- **B.** No defaults — slash-inserted component has no attrs set, renders empty/broken until user fills in required props.
- **C.** Only enum required-prop defaults (first enumValue); leave string/number/boolean unset.
**Recommendation:** **A** — matches Notion/Webstudio behavior; users expect "insert Callout → see a Callout." T1's implementation is ~15 LoC; negligible cost. High confidence.
**Recommended addition:** §6 new FR (between FR-16 and FR-17): "Slash-insert sets default attrs per PropDef `defaultValue` with fallback ladder (enum→first value, boolean→false, number→0, string→'')."

---

### [DISCUSS-5] Drop the T1 jsx-parser (acorn+acorn-jsx) entirely or keep for any niche case?

**Source:** `packages/core/src/registry/jsx-parser.ts` (118L) + `jsx-parser.test.ts` (185L).
**Question:** Under our design, `remark-mdx` agnostic mode (#136's R1) provides structured `MdxJsxAttribute[]` directly. acorn-jsx is not needed for parse. But a niche case: the user's `.open-knowledge/components.ts` auto-prop-extraction (§13 "extended to scan `.open-knowledge/components.ts` for custom props") uses react-docgen-typescript on `.tsx`, not acorn on JSX-in-markdown. Is there any remaining use for acorn?
**Options:**
- **A.** Delete all acorn-related code and deps. Smaller install, cleaner. Our spec already marks `jsx-component-factory.ts` as DELETE (salvage map §9.9).
- **B.** Keep acorn-jsx for edge cases (e.g., parsing `jsxExpressionAttribute` strings that come through agnostic mode as raw).
**Recommendation:** **A** — delete. D5 (expression attrs: JSON.parse simple literals; raw-string passthrough for complex) already covers agnostic-mode expression attrs without acorn. High confidence.
**Recommended addition:** §9.9 salvage map — explicit "DELETE" for `jsx-parser.ts`, `jsx-parser.test.ts`, `packages/core/dependencies: acorn`, `acorn-jsx`. One-line rationale: "agnostic mode + D5 covers expression attrs structurally; acorn is redundant."

---

## ALREADY CAPTURED — summary

Grouped by T1 section, showing where our SPEC already covers the concern.

- **T1 §3.1 Layer A/B/C registry split** → Our §13 scope and §9.9 salvage map cover core/generated/app separation. Our descriptor-over-factory pattern (D1 LOCKED) is strictly cleaner than T1's factory-produces-two-extensions.
- **T1 §3.2 react-docgen-typescript dev script** → Our §13 scope lists `packages/core/scripts/build-registry.ts`; our §14 risks covers CI drift check.
- **T1 §3.3 factory attrs + parent-chain invariant** → Our D1 LOCKED single-node supersedes the factory. Parent-chain invariant (schema in core, NodeView-only in app) is implicit in our §13 In Scope boundary.
- **T1 §3.5 raw JSX on disk** → Already the post-#83 reality; our FR-5 γ pattern preserves byte-identity for pristine (stronger guarantee).
- **T1 §3.6 markUserTyping protocol + scope narrowing** → Our FR-13 explicitly references `markUserTyping(getYDoc(editor))`; our A8 acknowledges origin enumeration.
- **T1 §3.7 slash commands by category** → Our FR-14 covers it; our salvage map §9.9 marks `component-items.ts` verbatim.
- **T1 §3.9 JsxComponentView evolution** → Our §9.7 descriptor-dispatch NodeView supersedes T1's registry-lookup pattern with cleaner wildcard fallback.
- **T1 §4 Phase 0-4 implementation order** → Our §13 Next Actions (7 steps) reorganizes around γ pattern and Block UX.
- **T1 §7 test scenarios** → Our M1-M8 covers most; KEEP-9 adds the isolating-boundary gap.
- **T1 §10 assumptions A1-A8** → Our A1-A12 supersede with post-#136 specificity (A4 shipped, A10 verified against R10, A12 covers .mdx).

---

## OBSOLETE — summary

Grouped by supersession source.

- **PR #83 (remark-prosemirror migration) supersedes:** T1 D1 `markdownTokenizer` field + `jsxBlock` token + marked tokenizer integration + D11/D12 Version-B tag-counting tokenizer + `jsxStart`/`jsxTokenizerA-C` + Phase 0 Step 1 "wire jsxTokenizerB into JsxComponent" + evidence files `raw-jsx-tokenizer-proof.md` + R7/R10 tokenizer regex risks.
- **PR #136 (MDX tolerant parsing) supersedes:** T1 D7 acorn+acorn-jsx JSX parser (replaced by agnostic mode + D5 passthrough) + T1 R5 bundle-size concern + evidence files `jsx-parser-comparison.md` + OQ7 parser selection + R1 "mitigated by agnostic mode" (shipped).
- **PR #126 (.mdx first-class) supersedes:** T1 assumption about single-extension pipeline; our A12 confirms shipped support.
- **PR #128 (Observer A origin-aware) supersedes:** T1 OS08 `applyUserDelta` line-matching concern (scope narrowed), R11 mis-target risk (scope narrowed), A7 unverified (replaced by our A9 DMP merge).
- **PR #51 (pluggable slash-command) supersedes:** T1 §4 Phase 2 step 12 "add slash commands" → our FR-14 + §9.9 salvage map covers it.
- **Our D1 (single-node widening) supersedes:** T1 D8 two-node split (`jsxComponentEditable` + `jsxComponentVoid`) + D14 priority-routing for unregistered fallback + factory's dual-extension return + `packages/core/src/registry/jsx-component-factory.ts` (our §9.9 marks as DELETE) + T1 registry.test.ts's dual-extension assertions (only the markdown-hook tests still apply).
- **Our D6 (γ dirty-tracking hybrid serialization) supersedes:** T1's Phase 0 cycle-1 byte-identity drama (R10, A8, OS06, OS07 — mitigated structurally by γ) + T1's `_childrenString` carrier attr (γ uses `sourceRaw` + `sourceDirty` instead).
- **Our single-schema-union supersedes:** T1 §3.3 parent-chain `.extend()` invariant (our widening approach uses `.extend()` app-side only for addNodeView, which is always-safe per TipTap conventions).
- **Our §D9-D10 (custom components IN) supersedes:** T1 §6 Future Work "custom component discovery — dual track" (promoted to P0) + §3.8 "21 reserved names" framing (under custom-registration, built-in names are no longer "reserved" — they're just the default descriptors that user config can override).
- **T1 §4 Phase 1 Step 0 "9 schema construction sites"** → scope collapses under our design: we don't change `sharedExtensions` composition (just widen jsxComponent + extend jsxInline). The 9 sites still exist but all call `getSchema(sharedExtensions)` as before; the schema contents change but the call pattern doesn't. The R12 refactor is no longer required.

---

**Summary of actionable KEEP items:**

| # | Addition | Location | Size |
|---|---|---|---|
| KEEP-1 | `description` + `searchTerms` in descriptor | §9.2 | +2 field specs |
| KEEP-2 | Discriminated-union `PropDef` | §9.2 or §13 | ~50L type definitions |
| KEEP-3 | Core/app descriptor split (Component lives in app) | §9.2 or §13 | 1 paragraph |
| KEEP-4 | react-docgen-typescript `propFilter` rules | §13 or §9 | 1 code block + caveat |
| KEEP-5 | `resolveDts` helper pattern | §9.9 or §13 | 3-line helper + 1-line gotcha |
| KEEP-6 | Unknown-attr preservation on dirty path | §6 FR-5 or §9.4 | 1 paragraph + M-test |
| KEEP-7 | `markUserTyping(getYDoc(editor))` full signature | §9.7/§9.8 | 1-line code clarification |
| KEEP-8 | `.extend()` preserves registration order | §6 FR-4 or §9 | 1 sentence |
| KEEP-9 | Isolating-boundary M9 test (port T1 test file) | §7 M-series + §13 | ~150L test |
| KEEP-10 | `ComponentErrorBoundary` per-instance | §9.7 / §9.8 + §6 FR | ~40L + 1 FR |
| KEEP-11 | `setNodeSelection(getPos())` click handler | §9.7 | 1-line code addition |
| KEEP-12 | PropPanel `onMouseDown` stopPropagation wrapper | §9.7/§9.8 | 1 wrapper component + 1-line note |

**Summary of DISCUSS items:** 5 genuine judgment calls, recommendations lean consistent with our "best product experience" framing (A, A, B, A, A).
