/**
 * Maps component name → React component for the descriptor registry.
 *
 * 6-pack state (Callout + Image + Video + Audio + Accordion + Math). Callout
 * is a DIY renderer (7-prop GFM shape at `./Callout`). Image wraps
 * `react-medium-image-zoom` (12-prop HTML-native shape at `./Image`). Video
 * is a pure HTML5 `<video>` wrapper (11-prop shape at `./Video`). Audio is a
 * pure HTML5 `<audio>` wrapper (7-prop shape at `./Audio` with `<source>` /
 * `<track>` passthrough). Accordion is a standalone HTML5 `<details>` /
 * `<summary>` wrapper (6-prop shape at `./Accordion` with cross-browser
 * exclusive grouping via HTML5 `<details name>`). Math is a KaTeX block
 * renderer (LaTeX `formula` source at `./Math`, KaTeX JS lazy-imported on
 * first mount; CSS eager from main.tsx).
 *
 * Compound-component machinery (Tabs/Tab, Accordions/Accordion) is preserved
 * on PR #165 branch for future compound-tier revival per NG19; not in scope
 * here.
 *
 * Descriptor names no longer in `componentMap` — Banner, Card, Cards, Step,
 * Steps, Tab, Tabs, Accordions, File, Files, Folder, TypeTable, InlineTOC —
 * fall through to the `'*'` wildcard. Children of unregistered components
 * stay editable (wildcard `hasChildren: true`).
 *
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { Accordion } from './Accordion.tsx';
import { Audio } from './Audio.tsx';
import { Callout } from './Callout.tsx';
import { Image } from './Image.tsx';
import { MathView } from './Math.tsx';
import { Video } from './Video.tsx';

function UnregisteredBadgeRender(props: { children?: React.ReactNode }) {
  return <div className="prose-no-margin">{props.children}</div>;
}

// biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across the 5-pack + transitional shim imports; no single prop type covers all
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  // Lowercase media canonicals — descriptor names are HTML-tag-spelled
  // (`img` / `video` / `audio`); React component file names stay PascalCase
  // per React convention. The split lives only at this registration boundary.
  img: Image,
  video: Video,
  audio: Audio,
  Accordion,
  Math: MathView,
  '*': UnregisteredBadgeRender,
};
