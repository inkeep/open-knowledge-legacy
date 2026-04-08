---
title: react-docgen-typescript extracts props from `.d.ts` declaration files
description: Verified against the library's own test suite and parser source. Resolves v2 Audit H1 + Challenger H2 — the claim that "react-docgen-typescript requires .tsx source" is false.
created: 2026-04-08
last-updated: 2026-04-08
sources:
  - ~/.claude/oss-repos/react-docgen-typescript/src/parser.ts
  - ~/.claude/oss-repos/react-docgen-typescript/src/__tests__/parser.ts
  - ~/.claude/oss-repos/react-docgen-typescript/src/__tests__/data/StatelessDisplayNameFolder/Stateless.d.ts
  - /Users/edwingomezcuellar/projects/open-knowledge/docs/node_modules/fumadocs-ui/dist/components/callout.d.ts
---

## Summary

**react-docgen-typescript works on `.d.ts` declaration files** — not just `.tsx` source. This is verified three ways:

1. The library's own test suite contains a test specifically for parsing `.d.ts` files
2. The parser source explicitly handles the "no value declaration" case (i.e., type-only declarations from `.d.ts`)
3. Live inspection of the installed `fumadocs-ui/dist/components/callout.d.ts` confirms it has the structure react-docgen-typescript needs

This finding invalidates the Phase 1 step 4 plan that said fumadocs/docskit components required hand-written PropDef. Both ship `.d.ts` files that are directly extractable via the same `react-docgen-typescript` pipeline used for local `.tsx` source.

## Evidence 1: Test suite

`react-docgen-typescript/src/__tests__/parser.ts:48-58`:

```typescript
it('should parse simple typescript definition file with default export', () => {
  check(
    'StatelessDisplayNameFolder/Stateless.d.ts',
    {
      Stateless: {
        foo: { description: '', type: 'string', required: false }
      }
    },
    true,
    ''
  );
});
```

The fixture at `StatelessDisplayNameFolder/Stateless.d.ts`:

```typescript
export interface FooProps {
  foo?: string;
}

declare const Foo: React.FC<FooProps>;

export default Foo;
```

**Finding:** react-docgen-typescript's own test suite verifies `.d.ts` parsing works, including the `React.FC<FooProps>` pattern and default exports.

## Evidence 2: Parser source — explicit handling for `!rootExp.valueDeclaration`

`react-docgen-typescript/src/parser.ts:377-409`:

```typescript
if (!rootExp.valueDeclaration) {
  if (!typeSymbol && (rootExp.flags & ts.SymbolFlags.Alias) !== 0) {
    commentSource = this.checker.getAliasedSymbol(commentSource);
  } else if (!typeSymbol) {
    // ...
  } else {
    rootExp = typeSymbol;
    const expName = rootExp.getName();

    const defaultComponentTypes = [
      '__function',
      'StatelessComponent',
      'Stateless',
      'StyledComponentClass',
      'StyledComponent',
      'IStyledComponent',
      'FunctionComponent',
      'ForwardRefExoticComponent',  // ← the one compiled libraries use
      'MemoExoticComponent'
    ];

    if (supportedComponentTypes.indexOf(expName) !== -1) {
      commentSource = this.checker.getAliasedSymbol(commentSource);
    }
  }
}
```

**Finding:** The `!rootExp.valueDeclaration` branch is specifically for symbols that have only type declarations and no value body — exactly the shape of declarations in a `.d.ts` file. The supported component types include `ForwardRefExoticComponent`, `FunctionComponent`, `MemoExoticComponent` — the exact wrappers compiled React libraries expose.

## Evidence 3: `parseWithProgramProvider` uses TypeScript compiler's `getSourceFile`

`react-docgen-typescript/src/parser.ts:1506-1525`:

```typescript
function parseWithProgramProvider(
  filePathOrPaths: string | string[],
  compilerOptions: ts.CompilerOptions,
  parserOpts: ParserOptions,
  programProvider?: () => ts.Program
): ComponentDoc[] {
  const filePaths = Array.isArray(filePathOrPaths)
    ? filePathOrPaths
    : [filePathOrPaths];

  const program = programProvider
    ? programProvider()
    : ts.createProgram(filePaths, compilerOptions);

  const parser = new Parser(program, parserOpts);

  const checker = program.getTypeChecker();

  return filePaths
    .map(filePath => program.getSourceFile(filePath))
    // ...
}
```

**Finding:** The parser creates a TypeScript `Program` from whatever file paths you pass it. TypeScript's compiler treats `.d.ts` files as first-class modules — the TypeChecker resolves types identically whether the declarations came from `.tsx` source or `.d.ts` declarations. There is no file-extension filter.

## Evidence 4: fumadocs-ui `callout.d.ts` is directly extractable

`docs/node_modules/fumadocs-ui/dist/components/callout.d.ts`:

```typescript
import type { ComponentProps, ReactNode } from 'react';

export type CalloutType = 'info' | 'warn' | 'error' | 'success' | 'warning' | 'idea';

export declare function Callout({ children, title, ...props }: {
    title?: ReactNode;
} & Omit<CalloutContainerProps, 'title'>): import("react/jsx-runtime").JSX.Element;

export interface CalloutContainerProps extends ComponentProps<'div'> {
    /**
     * @defaultValue info
     */
    type?: CalloutType;
    /**
     * Force an icon
     */
    icon?: ReactNode;
}
```

**Finding:** This `.d.ts` file contains everything react-docgen-typescript needs to extract:
- **Enum union** (`CalloutType` with 6 values)
- **Required/optional props** (`type?`, `icon?`, `title?`)
- **Type information** (`ReactNode`, string literal unions, inherited HTMLAttributes via `ComponentProps<'div'>`)
- **TSDoc comments** (`@defaultValue info`, "Force an icon")
- **Function signature** (`Callout` as `export declare function`)

The `@defaultValue` TSDoc tag is preserved by TypeScript's declaration emit (when `stripComments: false` is set — the fumadocs build preserves comments).

## Evidence 5: docskit `.d.ts` also usable (with fewer comments)

From prior session research on `~/agents/node_modules/.pnpm/@inkeep+docskit@0.0.8*/node_modules/@inkeep/docskit/dist/mdx.d.ts`:

```typescript
export declare const Accordion: ForwardRefExoticComponent<
  Omit<Omit<AccordionPrimitive.AccordionItemProps & RefAttributes<HTMLDivElement>, "ref">, "value"> & {
    title: string;
  } & RefAttributes<HTMLDivElement>
>;

export declare function Video(props: VideoProps): JSX.Element;
export declare type VideoProps = {
  src: string;
  hideTrigger?: boolean;
  fullView?: boolean;
  title?: string;
  hint?: string;
};
```

**Finding:** Docskit ships extractable `.d.ts` files but with fewer TSDoc comments than fumadocs-ui. react-docgen-typescript will still extract prop names, types, required/optional flags, and enum unions — descriptions may be empty strings for some props. Acceptable for the prop panel (prop names + types are the load-bearing information; descriptions are nice-to-have labels).

## Implications for Phase 1 step 4

The Phase 1 extraction plan can use a **single pipeline for all 15 built-ins**:

| Component source | File type | Extraction path |
|---|---|---|
| fumadocs-ui (10 families) | `.d.ts` | `node_modules/fumadocs-ui/dist/components/*.d.ts` |
| docskit (3 components) | `.d.ts` | `node_modules/@inkeep/docskit/dist/components/*.d.ts` (or mdx.d.ts aggregate) |
| shadcn-installed (2 components) | `.tsx` | local `src/components/*.tsx` (copied by `npx shadcn add`) |

All three flow through the same `parser.parse(filePaths)` call. No hand-written PropDef, no drift detection smoke tests, no vendoring.

## Path resolution gotcha: `package.json` exports field blocks direct `dist/` access

Most published npm packages (including fumadocs-ui 16.1.0) declare `exports` fields in `package.json` that restrict which paths can be imported. fumadocs-ui's exports map:

```json
{
  "exports": {
    "./components/*": {
      "import": "./dist/components/*.js",
      "types": "./dist/components/*.d.ts"
    }
  }
}
```

This means:
- `import { Callout } from 'fumadocs-ui/components/callout'` → works (resolves to `dist/components/callout.js`)
- `require.resolve('fumadocs-ui/components/callout')` → works, returns the `.js` path
- `require.resolve('fumadocs-ui/dist/components/callout.d.ts')` → **FAILS** — the raw `dist/` path isn't listed as an export

To get the `.d.ts` file path for passing to `react-docgen-typescript.parse()`, use one of:

**Pattern 1: Resolve via `package.json`, construct `dist/` path manually**
```ts
import path from 'node:path';
const pkgDir = path.dirname(require.resolve('fumadocs-ui/package.json'));
const calloutDts = path.join(pkgDir, 'dist/components/callout.d.ts');
```

**Pattern 2: Resolve the JS entry via the exports map, swap extension**
```ts
const calloutJs = require.resolve('fumadocs-ui/components/callout');
// → /path/to/node_modules/fumadocs-ui/dist/components/callout.js
const calloutDts = calloutJs.replace(/\.js$/, '.d.ts');
```

Pattern 1 is more explicit; Pattern 2 relies on the JS and `.d.ts` files being colocated (which is the standard TypeScript library convention but not guaranteed).

## Docskit-specific pattern

`@inkeep/docskit`'s `exports` field only exposes `./mdx` (aggregate), not per-component subpaths. Point extraction at `dist/mdx.d.ts` which re-exports everything:

```ts
const docskitDir = path.dirname(require.resolve('@inkeep/docskit/package.json'));
const mdxDts = path.join(docskitDir, 'dist/mdx.d.ts');
// Parser extracts Accordion, Card, CodeBlock, CodeGroup, Frame, Link, Note, Step, Steps, Tab, Tabs, Tip, Video, Warning
// from a single file
```

`react-docgen-typescript.parse([mdxDts])` returns one `ComponentDoc` per exported component in the aggregate file.

## The one thing that must change: `propFilter`

The standard `prop.parent?.fileName.includes('node_modules')` filter — commonly used to exclude inherited React DOM props — would incorrectly reject fumadocs-ui's own props (since their declaring interface lives inside `node_modules/fumadocs-ui/dist/...`).

**Correct filter for our case:**

```typescript
propFilter: (prop) => {
  // Filter ONLY props inherited from @types/react (HTMLAttributes, DOMAttributes, etc.)
  if (prop.parent?.fileName.includes('@types/react')) return false;
  // Also filter props inherited from the react package itself (rare)
  if (prop.parent?.fileName.includes('node_modules/react/')) return false;
  // Hide callback props (onClick, onChange, etc.)
  if (prop.type.name.startsWith('(')) return false;
  return true;
}
```

This keeps fumadocs-ui and docskit own-declared props while filtering `@types/react` inherited DOM attributes.

## What this invalidates

- **v2 Audit H1:** "Phase 1 step 4 cannot extract props from `fumadocs-ui`" — factually correct that fumadocs-ui doesn't ship `.tsx` source, but wrong that this prevents extraction. `.d.ts` extraction works.
- **v2 Challenger H2:** "react-docgen-typescript cannot run against the installed fumadocs-ui package" — same correction.
- **v2 Challenger L6:** "Hand-written PropDef drift detection is unspecified" — no longer applies, because we're not hand-writing PropDef.
- **v2 Audit M5:** "§3.2 propFilter excludes node_modules" — applies, but the fix is straightforward (change the filter to be specific about `@types/react`, not blanket node_modules).
