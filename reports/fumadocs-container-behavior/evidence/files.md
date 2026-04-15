# Files — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/files.js`

## Full Source

```js
'use client';
import { cva } from 'class-variance-authority';
import { File as FileIcon, Folder as FolderIcon, FolderOpen } from '../icons.js';
import { useState } from 'react';
import { cn } from '../utils/cn.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.js';

const itemVariants = cva('flex flex-row items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-fd-accent hover:text-fd-accent-foreground [&_svg]:size-4');

export function Files({ className, ...props }) {
    return (_jsx("div", {
      className: cn('not-prose rounded-md border bg-fd-card p-2', className),
      ...props,
      children: props.children
    }));
}

export function File({ name, icon = _jsx(FileIcon, {}), className, ...rest }) {
    return (_jsxs("div", {
      className: cn(itemVariants({ className })),
      ...rest,
      children: [icon, name]
    }));
}

export function Folder({ name, defaultOpen = false, ...props }) {
    const [open, setOpen] = useState(defaultOpen);
    return (_jsxs(Collapsible, {
      open: open,
      onOpenChange: setOpen,
      ...props,
      children: [
        _jsxs(CollapsibleTrigger, {
          className: cn(itemVariants({ className: 'w-full' })),
          children: [open ? _jsx(FolderOpen, {}) : _jsx(FolderIcon, {}), name]
        }),
        _jsx(CollapsibleContent, {
          children: _jsx("div", {
            className: "ms-2 flex flex-col border-l ps-2",
            children: props.children  // <-- Folder children here
          })
        })
      ]
    }));
}
```

## Children handling

**Zero filtering across all three components.**

- `Files` — pure `{children}` pass-through in a styled div
- `File` — leaf component; `name` prop + icon, no children
- `Folder` — uses `@radix-ui/react-collapsible` (via fumadocs `./ui/collapsible.js`) for expand/collapse. Children passed into CollapsibleContent > div.

### Radix Collapsible
`Folder` uses Radix Collapsible which is context-based, not DOM-position-based. NodeViewWrapper divs are transparent.

## In-Editor Behavior Prediction

```
<Files>
  <NodeViewWrapper>
    <Folder name="src" defaultOpen>
      <NodeViewWrapper>
        <File name="index.ts" />
      </NodeViewWrapper>
    </Folder>
  </NodeViewWrapper>
  <NodeViewWrapper>
    <File name="package.json" />
  </NodeViewWrapper>
</Files>
```

**Prediction: WORKS** ✅

1. `Files` is just a div with `{children}` ✅
2. `File` is a leaf — no children concerns ✅
3. `Folder` uses Radix Collapsible (context-based) — NodeViewWrapper is transparent ✅
4. Expand/collapse toggle should work in the editor ✅

**Caveats:**
- `Folder`'s nested structure (`border-l ps-2` for indentation) applies to the div wrapping children, not to NodeViewWrapper. The visual nesting should still look correct since NodeViewWrapper is inside the Folder, and File/Folder children are inside NodeViewWrapper.
- Icons from `../icons.js` — need to verify these ship as inline SVG, not as image imports.

## Confidence: HIGH

Simplest container after Steps. Pure pass-through + Radix Collapsible. No filtering risks.
