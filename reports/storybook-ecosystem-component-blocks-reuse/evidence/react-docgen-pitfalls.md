# Evidence: react-docgen-typescript Pitfalls (D2)

**Dimension:** D2 — react-docgen-typescript pitfalls, extraction limits, community complaints
**Date:** 2026-04-14
**Sources:** storybookjs/storybook GitHub, styleguidist/react-docgen-typescript GitHub, npm registry, Storybook docs

---

## Key files / pages referenced

- https://github.com/styleguidist/react-docgen-typescript — react-docgen-typescript source
- https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0 — Storybook maintainer gist on react-docgen limitations
- https://github.com/storybookjs/storybook/discussions/25686 — SB8 react-docgen default QA discussion
- https://storybook.js.org/docs/configure/integration/typescript — TypeScript integration docs
- https://github.com/storybookjs/storybook/pull/23825 — react-docgen 6.0 upgrade PR

---

## Findings

### Finding: Two docgen tools exist with fundamentally different trade-offs

**Confidence:** CONFIRMED
**Evidence:** Storybook docs + maintainer gist

| Characteristic | react-docgen | react-docgen-typescript |
|---|---|---|
| Type resolution | Own AST parser (no tsc) | Full TypeScript compiler |
| Cross-file imports | FAILS silently | Resolves correctly |
| Performance | ~50ms per file | ~400-900ms per file |
| Enum extraction | Heuristic (split on `\|`) | `shouldExtractLiteralValuesFromEnum` |
| `forwardRef` | Partial (known gaps) | Mostly works |
| Generic `<T>` | Cannot resolve | Cannot resolve (static) |
| Storybook default | SB8+ default | SB7 and earlier default |

Storybook 8 switched to react-docgen for ~50% faster startup. The maintainer gist (shilman) confirms this was a deliberate accuracy-for-speed tradeoff.

### Finding: Omit/Pick/Exclude drop inherited props

**Confidence:** CONFIRMED
**Evidence:** https://github.com/storybookjs/storybook/issues/14798

When a component extends `ComponentProps<'button'>` with `Pick` or `Omit`, react-docgen-typescript may fail to generate ANY argTypes. The utility types strip the props from the extraction pipeline because the tool resolves them at the type-alias level, not the instantiated type level.

Workaround: ensure the tsconfig `include` path covers the source file containing the extended type. No automatic resolution exists.

**Implications:** Our `build-registry.ts` must handle this gracefully — if extraction yields an empty prop set for a component that clearly has props, we should log a diagnostic rather than silently registering an empty PropDef array.

### Finding: Path alias resolution requires matching tsconfig

**Confidence:** CONFIRMED
**Evidence:** Community issues + gist

`react-docgen-typescript` uses `ts.createProgram()` with a tsconfig. Path aliases (`@/components/Button`) must resolve in that tsconfig or the import chain breaks, causing silent prop extraction failure. The `exports` field in package.json also causes issues when `moduleResolution` is not set to `bundler` or `node16`.

### Finding: `shouldExtractLiteralValuesFromEnum` was OFF by default until PR #11070

**Confidence:** CONFIRMED
**Evidence:** https://github.com/storybookjs/storybook/pull/11070

String union types like `'primary' | 'secondary'` were extracted as opaque type descriptions, not as discrete option lists. The fix added a fallback parser that splits the raw type string on `|` and JSON-parses each token — enum inference is a **heuristic re-parse of a string**, not a type-system query.

Our `build-registry.ts` already sets `shouldExtractLiteralValuesFromEnum: true`. This is the correct choice.

### Finding: `skipChildrenPropWithoutDoc` silently hides children

**Confidence:** CONFIRMED
**Evidence:** Storybook docs + community discussion

When `skipChildrenPropWithoutDoc: true` (the default in many configurations), `children: ReactNode` is omitted from the props table if there is no JSDoc comment on it. This is arguably correct behavior for Controls (children is better handled as slot/content), but it is silent and confusing.

### Finding: Performance is ~400-900ms per file with react-docgen-typescript

**Confidence:** CONFIRMED
**Evidence:** https://github.com/storybookjs/storybook/issues/28269

Upgrading to SB 8.1+ with react-docgen-typescript caused fast-refresh times to jump from milliseconds to multiple seconds on empty projects. Root cause: `react-docgen-typescript` invokes the full TypeScript compiler per file.

**Implications:** Prop extraction must NOT run at editor runtime. We need a pre-compiled prop manifest built at component registration time (our `build-registry.ts` approach is correct — build-time extraction, not runtime).

### Finding: `propFilter` is the primary workaround for noisy extraction

**Confidence:** CONFIRMED
**Evidence:** Storybook docs + community patterns

Common filter patterns:
```typescript
propFilter: (prop) => {
  // Hide HTML element props inherited from ComponentProps<'div'>
  if (prop.parent) return !prop.parent.fileName.includes('node_modules');
  return true;
}
```

Without filtering, a `<Button>` extending `HTMLButtonElement` shows 100+ props from the DOM interface. Our spec can learn from this — when extracting from TypeScript, filter to own-file props by default, with an explicit `includeInherited` opt-in.

### Finding: Ranked community complaints (12 most common)

**Confidence:** CONFIRMED
**Evidence:** GitHub issues search across storybookjs/storybook

| Rank | Complaint | Impact |
|---|---|---|
| 1 | Cross-file types not resolved (react-docgen) | Props table empty |
| 2 | forwardRef breaks extraction | Props table empty or partial |
| 3 | Omit/Pick drops inherited props | Missing controls |
| 4 | Enum values not shown as options | Text input instead of dropdown |
| 5 | Performance with react-docgen-typescript | Multi-second HMR |
| 6 | Generic `<T>` unresolvable | Props show `T` not concrete type |
| 7 | `children: ReactNode` shows JSON editor | Broken UI |
| 8 | Path aliases not resolved | Silent extraction failure |
| 9 | `as const` objects not detected as enums | Manual options required |
| 10 | Boolean\|string unions show toggle only | Loses string option |
| 11 | Readonly<Props> drops descriptions | Empty description column |
| 12 | Date control returns UNIX timestamp | Type mismatch at runtime |

---

## Negative searches

* Searched for "react-docgen standalone controls library" → No package generates a standalone UI from docgen output
* Searched for alternative prop extraction tools → No viable alternatives besides react-docgen and react-docgen-typescript for React components

---

## Gaps / follow-ups

* How does Webstudio's auto-generation from TypeScript types compare? Custom tool or react-docgen-typescript?
* Should our `build-registry.ts` emit diagnostics for known extraction failure patterns (Omit/Pick, forwardRef, generics)?
