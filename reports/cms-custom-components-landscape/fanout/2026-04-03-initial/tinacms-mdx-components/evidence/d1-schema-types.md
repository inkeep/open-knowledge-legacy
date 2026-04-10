---
dimension: D1
title: TinaCMS Schema Type Definitions for MDX Component Registration
sources:
  - path: packages/@tinacms/schema-tools/src/types/index.ts
    lines: "352-406, 466-508, 513-546"
    description: Core type definitions for RichTextField, Template, TinaField, and Field union
  - path: packages/@tinacms/schema-tools/src/types/index.ts
    lines: "212-221"
    description: BaseField interface shared by all field types
  - path: packages/@tinacms/schema-tools/src/types/index.ts
    lines: "223-334"
    description: Primitive field types (string, number, boolean, datetime, image, reference, password)
---

## TinaField Type (line 507-508)

```typescript
export type TinaField<WithNamespace extends boolean = false> =
  Field<WithNamespace> & MaybeNamespace<WithNamespace>;
```

## Field Union (line 494-505)

```typescript
type Field<WithNamespace extends boolean = false> = (
  | StringField
  | NumberField
  | BooleanField
  | DateTimeField
  | ImageField
  | ReferenceField
  | RichTextField<WithNamespace>
  | ObjectField<WithNamespace>
  | PasswordField
) & MaybeNamespace<WithNamespace>;
```

## Template Type (line 513-546)

```typescript
export type Template<WithNamespace extends boolean = false> = {
  label?: string | boolean;
  name: string;
  nameOverride?: string;
  ui?: {
    itemProps?(item: Record<string, any>): {
      key?: string;
      label?: string | boolean;
    };
    defaultItem?: DefaultItem<Record<string, any>>;
    previewSrc?: string;
  };
  fields: Field<WithNamespace>[];
} & MaybeNamespace<WithNamespace>;
```

## RichTextField Type (line 352-380)

```typescript
export type RichTextField<WithNamespace extends boolean = false> = (
  | FieldGeneric<RichTextAst, undefined>
  | FieldGeneric<RichTextAst, false>
) &
  BaseField &
  SearchableTextField & {
    type: 'rich-text';
    isBody?: boolean;
    toolbarOverride?: ToolbarOverrideType[];  // @deprecated
    templates?: RichTextTemplate<WithNamespace>[];
    overrides?: {
      toolbar?: ToolbarOverrideType[];
      showFloatingToolbar?: boolean;
    };
    parser?: Parser;  // 'mdx' | 'markdown' | 'slatejson'
  };
```

## RichTextTemplate Type (line 381-406)

```typescript
export type RichTextTemplate<WithNamespace extends boolean = false> =
  Template<WithNamespace> & {
    inline?: boolean;
    match?: {
      start: string;
      end: string;
      name?: string;
    };
  };
```

## BaseField (line 212-221)

```typescript
export interface BaseField {
  label?: string | boolean;
  required?: boolean;
  indexed?: boolean;
  name: string;
  nameOverride?: string;
  description?: string;
  searchable?: boolean;
  uid?: boolean;
}
```

## ObjectField (line 466-492) — Dual-mode: fields OR templates

```typescript
export type ObjectField<WithNamespace extends boolean = false> = ... &
  BaseField & {
    openFormOnCreate?: boolean;
  } & (
    | {
        type: 'object';
        fields: Field<WithNamespace>[];
        templates?: undefined;
      }
    | {
        type: 'object';
        fields?: undefined;
        templates: Template<WithNamespace>[];
        templateKey?: string;
      }
  );
```
