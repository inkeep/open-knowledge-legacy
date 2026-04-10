# Evidence: Builder.io and Plasmic's Manual Registration — What They Learned

**Dimension:** D6 — Manual registration vs auto-extract
**Date:** 2026-04-03
**Sources:** Builder.io docs and GitHub, Plasmic docs and forum, Builder.io community ideas

---

## Key files / pages referenced

- [Builder.io registration options](https://www.builder.io/c/docs/register-components-options) — registration API
- [Builder.io input types](https://www.builder.io/c/docs/custom-components-input-types) — available types
- [Builder.io showIf](https://www.builder.io/c/docs/showif-with-registered-components) — conditional visibility
- [Builder.io auto-create idea](https://ideas.builder.io/ideas/PROD-I-55) — community request for auto-extract
- [Plasmic registering components](https://docs.plasmic.app/learn/registering-code-components/) — registration docs
- [Plasmic code components ref](https://docs.plasmic.app/learn/code-components-ref/) — full API
- [Plasmic custom controls](https://docs.plasmic.app/learn/custom-controls/) — custom control UI
- [Plasmic forum: auto-register](https://forum.plasmic.app/t/how-to-automatically-register-components-with-typescript-types/636)
- [Plasmic forum: improving registration](https://forum.plasmic.app/t/improving-component-registration-process/4563)

---

## Findings

### Finding: Builder.io chose manual registration deliberately — the schema IS the product contract
**Confidence:** CONFIRMED
**Evidence:** [Builder.io docs](https://www.builder.io/c/docs/register-components-options), [ideas board](https://ideas.builder.io/ideas/PROD-I-55)

Builder.io's `registerComponent()` requires developers to explicitly define inputs:

```javascript
Builder.registerComponent(MyComponent, {
  name: 'MyComponent',
  inputs: [
    { name: 'title', type: 'text', defaultValue: 'Hello' },
    { name: 'variant', type: 'enum', enum: ['primary', 'secondary'] },
    { name: 'content', type: 'richText' },
    { name: 'image', type: 'file', allowedFileTypes: ['jpeg', 'png'] },
    { name: 'items', type: 'list', subFields: [
      { name: 'label', type: 'text' },
      { name: 'url', type: 'url' },
    ]},
  ],
});
```

The community has requested auto-extraction from TypeScript types (idea PROD-I-55: "Tool to create builder inputs based on Component") — it remains an open feature request. Builder.io has not implemented it.

**Why manual:** Builder.io treats the registration schema as the API contract between developers and content editors. The schema defines:
1. WHICH props are visible (not all component props)
2. HOW each prop appears (the control type — a TypeScript `string` tells you nothing about whether it's a URL, a color, rich text, or a file path)
3. WHAT the editorial experience should be (labels, descriptions, defaults, conditional visibility)

Auto-extraction would produce a technically accurate but editorially useless panel.

### Finding: Plasmic's manual approach enables the most sophisticated control system
**Confidence:** CONFIRMED
**Evidence:** [Plasmic API ref](https://docs.plasmic.app/learn/code-components-ref/), [custom controls](https://docs.plasmic.app/learn/custom-controls/)

Plasmic supports ~25+ control types including capabilities no auto-extraction can infer:

- **`hidden` callback:** `(props, ctx) => boolean` — conditional prop visibility. "Show `target` only when `href` is set."
- **`type: "custom"`** — render ANY React component as the control UI
- **`type: "dynamic"`** — control type changes based on context
- **`type: "slot"`** — dedicated slot/children drop zone
- **`type: "eventHandler"`** — event binding UI
- **`type: "dataSelector"`** — data binding from context
- **`defaultValueHint`** — show a placeholder without actually setting the value
- **`validator`** — custom validation function
- **`externalProp`/`internalProp`** — codegen visibility control

The forum thread "How to automatically register components with TypeScript types?" shows users have requested auto-extract. Plasmic's response acknowledges the desire but explains that manual metadata "helps Plasmic understand them better, and makes them easier to use for Studio users."

### Finding: Builder.io's `showIf` enables conditional prop visibility — critical for content editors
**Confidence:** CONFIRMED
**Evidence:** [Builder.io showIf docs](https://www.builder.io/c/docs/showif-with-registered-components)

```javascript
{
  name: 'advancedOptions',
  type: 'object',
  showIf: (options) => options.get('enableAdvanced') === true,
  subFields: [...]
}
```

`showIf` evaluates a JavaScript expression to determine whether an input appears. This handles:
- Discriminated unions: show `href` only when `variant === "link"`
- Progressive disclosure: show advanced options only when toggled
- Context-dependent fields: show different options based on data source

Auto-extraction from TypeScript CANNOT produce this — it requires understanding editorial intent, not just type structure.

### Finding: Manual registration gives explicit control over the "editor DX" layer
**Confidence:** CONFIRMED
**Evidence:** Both Builder.io and Plasmic documentation patterns

Advantages manual registration provides that auto-extract does not:

1. **Prop curation:** Only 5 of 20 component props may be relevant to content editors. Manual registration lets developers choose which props appear.

2. **Semantic control types:** TypeScript `string` doesn't distinguish between a URL, color, file path, rich text, or code snippet. Manual registration maps each to the right editor widget.

3. **Nested object editing:** `{ author: { name: string; avatar: string } }` auto-extracts as JSON. Manual registration can render it as a nested form with proper labels.

4. **Conditional visibility:** `showIf`/`hidden` callbacks — show/hide fields based on other field values. Impossible to auto-extract from types.

5. **Custom controls:** Completely custom React components as the editing UI. A color picker, a font selector, a data source browser — these are editorial concerns, not type concerns.

6. **Slot/children definition:** Explicit slot definitions with default content, accepted component types, and drop zone positioning.

7. **Labels and descriptions:** Human-readable labels and descriptions for non-developer editors. TypeScript prop names like `isCompactVariant` need editorial aliases.

8. **Validation rules:** Beyond type checking — min/max values, regex patterns, custom validators.

### Finding: The hybrid model (Webstudio) captures most benefits of both approaches
**Confidence:** INFERRED
**Evidence:** Webstudio source code analysis, comparison with Builder.io/Plasmic

Webstudio's two-layer model (auto-extract + `.ws.ts` override) provides:
- ✅ Zero-config for simple props (boolean, string, enum)
- ✅ Override mechanism for semantic upgrades (string → file picker)
- ✅ Content model for children/slots
- ❌ No conditional visibility (showIf/hidden)
- ❌ No custom controls
- ❌ Complex types silently dropped

Builder.io/Plasmic's manual model provides:
- ✅ Full control over editorial experience
- ✅ Conditional visibility
- ✅ Custom controls
- ✅ Nested object/array editing
- ❌ Requires explicit registration for every component
- ❌ Schema can drift from TypeScript types
- ❌ Higher maintenance burden

**For a knowledge base editor:** The hybrid model is correct. Auto-extract for the 80% case (primitives, enums), mandatory override mechanism for the 20% (URLs, file pickers, rich text, conditional visibility).

### Finding: Builder.io's community explicitly requested auto-extraction — it's a recognized gap
**Confidence:** CONFIRMED
**Evidence:** [PROD-I-55](https://ideas.builder.io/ideas/PROD-I-55)

The feature idea: "Automatically extract all component prop types (React project) and convert them to valid builder inputs, potentially as a CLI app." This validates that manual-only registration is seen as a maintenance burden even by Builder.io's own users.

---

## Gaps / follow-ups

- Builder.io's internal perspective on why they haven't implemented auto-extract (team bandwidth? deliberate choice?)
- Framer's approach — manual `addPropertyControls()` with ~22 types
- How schema drift (TypeScript interface changes but manual schema doesn't update) is handled in practice
