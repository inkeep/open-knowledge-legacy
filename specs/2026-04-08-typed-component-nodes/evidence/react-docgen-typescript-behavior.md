---
title: react-docgen-typescript Actual Behavior
description: Verified output format, ReactNode detection, union extraction, children filtering, and propFilter mechanics from source + live test.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: `children` is FILTERED OUT by default
**Confidence:** CONFIRMED (source: react-docgen-typescript/buildFilter.ts:12-19)

Default `skipChildrenPropWithoutDoc` is truthy. If `children` has no JSDoc comment, it's excluded from output. **Must set `skipChildrenPropWithoutDoc: false`** in parser options to include it.

## Finding 2: ReactNode detection requires checking two forms
**Confidence:** CONFIRMED (live test + source analysis)

| Import pattern | `type.name` value |
|---|---|
| `import React from 'react'` + `React.ReactNode` | `"ReactNode"` |
| `import { ReactNode } from 'react'` + `ReactNode` | `"ReactNode"` |
| No React import (JSX transform) + `React.ReactNode` | `"React.ReactNode"` |

Detection code must check: `type.name.endsWith("ReactNode")` or both strings.

## Finding 3: Union extraction with shouldExtractLiteralValuesFromEnum
**Confidence:** CONFIRMED

With `shouldExtractLiteralValuesFromEnum: true`:
```json
{ "name": "enum", "raw": "\"warning\" | \"error\" | \"info\"", "value": [{"value": "\"warning\""}, ...] }
```
Note: string literals are double-escaped: `"\"warning\""`.

**WARNING:** Do NOT use `shouldExtractValuesFromUnion: true` globally — it explodes ReactNode into 11 useless union members.

## Finding 4: All three component patterns supported
**Confidence:** CONFIRMED (live test)

`function Component(props)`, `const Component: React.FC<Props>`, `React.forwardRef<>()` — all produce correct output. forwardRef adds `ref` and `key` from `@types/react` (filterable via `prop.parent?.fileName`).

## Finding 5: PropItem shape
**Confidence:** CONFIRMED (source: parser.ts)

```typescript
interface PropItem {
  name: string;
  required: boolean;
  type: { name: string; value?: any; raw?: string };
  description: string;
  defaultValue: { value: any } | null;
  parent?: { name: string; fileName: string };
}
```

## Recommended parser configuration
```typescript
withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,  // "warning"|"error" → dropdown values
  shouldRemoveUndefinedFromOptional: true,   // Clean optional types
  skipChildrenPropWithoutDoc: false,         // CRITICAL: include children
  propFilter: (prop) => {
    if (prop.parent?.fileName.includes('node_modules')) return false;
    if (prop.type.name.startsWith('(')) return false; // callbacks
    return true;
  },
})
```
