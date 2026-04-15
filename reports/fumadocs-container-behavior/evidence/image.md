# ImageZoom — fumadocs-ui v16.1.0 Source Analysis

**Source file:** `node_modules/fumadocs-ui/dist/components/image-zoom.js`

## Architecture

Client component (`'use client'`). Wraps `react-medium-image-zoom` with fumadocs-core `Image`.

```js
import { Image } from 'fumadocs-core/framework';
import './image-zoom.css';
import Zoom from 'react-medium-image-zoom';

export function ImageZoom({ zoomInProps, children, rmiz, ...props }) {
    return (_jsx(Zoom, {
      zoomMargin: 20,
      wrapElement: "span",
      ...rmiz,
      zoomImg: { src: getImageSrc(props.src), sizes: undefined, ...zoomInProps },
      children: children ?? (_jsx(Image, { sizes: "...", ...props }))
    }));
}
```

## Dependencies

1. **`fumadocs-core/framework` `Image` component** — resolves via `FrameworkContext`. If `FrameworkProvider` is not set up, `Image` defaults to `<img>` (the framework default).
2. **`react-medium-image-zoom`** — standalone React zoom library, no framework deps.
3. **`./image-zoom.css`** — separate CSS file for zoom overlay styling.

## In-Editor Behavior Prediction

**Prediction: WORKS with caveats** ⚠️

1. If `children` is provided, `Image` from framework is not used — zoom wraps whatever children are passed ✅
2. If `children` is NOT provided, falls back to `Image` from `fumadocs-core/framework`. Without `FrameworkProvider`, this will try to use a default that may throw ⚠️
3. `react-medium-image-zoom` works in any React context ✅
4. Needs `image-zoom.css` imported for overlay styling ⚠️

## Recommendation

For editor use, either:
- Ensure `children` is always provided (e.g., `<ImageZoom><img src="..." /></ImageZoom>`)
- Or set up a minimal `FrameworkProvider` with `Image` mapped to plain `<img>`

## Confidence: HIGH
