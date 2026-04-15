# Evidence: D1 — framework integration

**Dimension:** D1 — How a single extensible CM6 engine keyed by syntax-tree node types serves every construct
**Date:** 2026-04-14

---

## Key references

- https://codemirror.net/docs/ref/ — extension composition (T1)
- `/tmp/cm-rich-markdoc/src/` — reference of two-extension composition (T1)
- Prior report `codemirror-markdown-source-view-rendering/evidence/d1-d2-codemirror-primitives-and-guidance.md` (T1)

---

## Registry architecture sketch

A single declarative config can drive per-construct decoration:

```ts
type ConstructConfig = {
  // Detection
  nodeName?: string;                       // @lezer/markdown node to match
  nodeNamePattern?: RegExp;                // for ATXHeading1..6 etc.
  regex?: RegExp;                          // fallback to text regex (no syntax tree)

  // Decoration kind
  kind: 'line' | 'mark' | 'replace-block' | 'widget-insert';

  // Styling
  class?: string;                          // CSS class to apply
  widget?: WidgetType;                     // for replace/widget kinds

  // Behavior
  cursorReveal?: boolean;                  // skip decoration when cursor inside
  wrapBehavior?: 'inherit' | 'pre' | 'pre-wrap';  // per-construct wrap override
  atomic?: boolean;                        // contribute to EditorView.atomicRanges

  // Nesting
  depth?: (node: SyntaxNode) => number;    // compute depth for per-level class

  // Events
  onClick?: (view: EditorView, from: number, to: number) => void;
};
```

A runtime engine then dispatches construct configs to the appropriate decoration emitter:

```ts
function createConstructEngine(configs: ConstructConfig[]): Extension {
  // line/mark decorations via ViewPlugin (per Marijn's rule)
  const viewPluginConfigs = configs.filter(c => c.kind === 'line' || c.kind === 'mark');

  // replace-block decorations via StateField (per Marijn's rule — height-changing)
  const stateFieldConfigs = configs.filter(c => c.kind === 'replace-block');

  return [
    createViewPluginFor(viewPluginConfigs),
    ...stateFieldConfigs.map(createStateFieldFor),
    EditorView.theme(collectThemes(configs)),
  ];
}
```

Adding a new construct = one entry in the registry + one CSS rule.

**Confidence:** INFERRED (T3 — sketch of what's technically possible; validated by primitive-level understanding of CM6)

---

## Precedents for declarative registry

**Finding D1-1:** No surveyed OSS product ships a declarative-registry-based markdown-polish engine. Each product hand-codes per-construct logic:

- **SilverBullet:** per-file per-construct (`table.ts`, `fenced_code.ts`, `frontmatter.ts`). Each file has its own detection + decoration logic. No shared engine abstraction.
- **codemirror-rich-markdoc:** two files (`richEdit.ts` for inline marks, `renderBlock.ts` for block replace). Both hand-coded syntax-tree iteration + match logic. No framework.
- **Obsidian plugins** (`obsidian-cm6-attributes`, etc.): each plugin is standalone; no shared decoration framework.
- **`@codemirror/lang-markdown`:** publishes grammar + `parseMixed` helpers but no per-construct decoration helpers.

**Confidence:** CONFIRMED (T1 — source-verified across surveyed repos)

---

## The shared-computation / per-surface-rendering principle

Open Knowledge's CLAUDE.md §4 codifies this as an architectural precedent: "Logic that determines what to render lives in one shared module. Per-surface code only applies the result."

For a construct-polish engine:
- **Shared:** detection (syntax-tree match, regex, depth calculation) + decoration decision
- **Per-surface:** applying the decoration (CM6 `Decoration.mark` on source view vs TipTap NodeView in WYSIWYG)

**No surveyed product observed following this principle at the shared-computation level.** Each product's source-view logic is independent from its WYSIWYG render path.

---

## Line-wrapping interaction

`EditorView.lineWrapping` is an editor-wide extension. Per-construct wrap control requires `Decoration.line` with CSS `white-space: pre` override (the S2 pattern from the prior report).

Registry extension:

```ts
{ nodeName: 'FencedCode', kind: 'line', class: 'cm-no-wrap', wrapBehavior: 'pre' },
{ nodeName: 'TableRow',   kind: 'line', class: 'cm-table-row' /* wrap: inherit */ },
{ nodeName: 'Blockquote', kind: 'line', class: 'cm-blockquote' /* wrap: inherit */ },
```

CSS:

```css
.cm-no-wrap { white-space: pre !important; }
```

This decouples wrap policy from the construct registration.

**Confidence:** CONFIRMED (T1 via prior report evidence)

---

## Compartment toggle

To make the entire polish layer user-toggleable:

```ts
const polishCompartment = new Compartment();

// Initial:
polishCompartment.of(createConstructEngine(defaultConfigs));

// User toggles off:
view.dispatch({ effects: polishCompartment.reconfigure([]) });
```

Gives users a "show raw markdown" mode without rebuilding the editor.

**Confidence:** CONFIRMED (T1 via prior report — the Compartment pattern already established)

---

## ViewPlugin vs StateField split (load-bearing)

Per Marijn's rule (covered in prior report), the engine must split:

- **ViewPlugin:** inline marks, line decorations that don't change vertical structure
- **StateField:** block-replace decorations (widgets that affect document height)

The registry's `kind` field determines which path. This split is NOT optional — mixing height-changing decorations into a ViewPlugin causes layout misalignment per Marijn's guidance.

**Confidence:** CONFIRMED (T1 via prior report)

---

## Performance guidance

- Viewport-scoped iteration (`view.visibleRanges`) bounds per-frame work
- `Decoration.mark` and `Decoration.line` are O(1) per-match in CM6's RangeSet
- `StateField` re-runs on every transaction — keep detection logic fast
- Lezer syntax tree iteration is incremental; changes in one region don't re-parse everything

No maintainer-published benchmarks specifically for per-construct decoration engines at scale.

**Confidence:** INFERRED (T2)

---

## Gaps / follow-ups

- **No ecosystem precedent for declarative construct-polish engine:** novel implementation territory
- **Shared-computation principle across source + WYSIWYG:** not observed in any surveyed product; would require coordinated architectural investment
- **Performance benchmarks for registry-driven decoration at 100+ constructs active:** not published
- **Hot-swap configuration (adding/removing a construct at runtime):** Compartment pattern supports it; not observed in practice
