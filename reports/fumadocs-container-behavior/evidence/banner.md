# Banner — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/banner.js`

## Architecture

Client component (`'use client'`). Uses `useState`, `useEffect`, `localStorage`.

## Children handling

```js
export function Banner({ id, variant = 'normal', changeLayout = true, height = '3rem', rainbowColors, ...props }) {
    const [open, setOpen] = useState(true);
    // ...
    return (_jsxs("div", {
      id: id,
      ...props,
      // styled div with children
      children: [
        // changeLayout style injection
        // globalKey script/style injection
        // rainbow background
        props.children,  // <-- PASSES CHILDREN THROUGH
        // close button
      ]
    }));
}
```

**Pure pass-through for children.** No filtering, no type checking.

## In-Editor Concerns

1. `localStorage` usage for dismissal state — works in browser ✅
2. `dangerouslySetInnerHTML` for script injection (banner.js:25-26) — sets `document.documentElement.classList` ⚠️
3. Injects `<style>` elements with `:root { --fd-banner-height: ... }` — may conflict with our layout ⚠️
4. `sticky top-0 z-40` positioning — in an editor context, this would stick to the editor scroll container ⚠️
5. Uses `fd-secondary` and `fd-background` color tokens — unstyled without fumadocs CSS

## In-Editor Behavior Prediction

**Prediction: WORKS but with visual side effects** ⚠️

- Renders correctly as a div with children
- The `sticky` positioning + z-index may cause layout issues in the editor
- The injected `<style>` and `<script>` elements are DOM side effects that persist even after component unmount (if using dangerouslySetInnerHTML)
- Close button works (pure useState)

## Recommendation for editor

Banner is a PAGE-LEVEL component, not a content component. It shouldn't appear in document content at all — it's a layout element. Consider excluding from the editor component palette or rendering as a static preview with a note.

## Confidence: HIGH
