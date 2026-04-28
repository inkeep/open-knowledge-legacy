/**
 * Maps component name → React component for the descriptor registry.
 *
 * Final 5-pack state (US-003/US-005/US-006/US-007/US-008/US-009 shipped):
 * the registry manifest is the complete 5-pack foundation (Callout + Image +
 * Video + Audio + Accordion registered). Callout is a DIY renderer (US-005,
 * 7-prop GFM shape at `./Callout`). Image is a DIY renderer wrapping
 * `react-medium-image-zoom` (US-006, 8-prop shape at `./Image`). Video is a
 * DIY pure HTML5 `<video>` wrapper (US-007, 9-prop shape at `./Video` per
 * D-MF12 — no URL sniffing, no iframe emission). Audio is a DIY pure HTML5
 * `<audio>` wrapper (US-008, 7-prop shape at `./Audio` — extracted from the
 * pre-US-008 inline function; widened per FR-4; `hasChildren: true` for
 * `<source>` / `<track>` passthrough). Accordion is a DIY standalone HTML5
 * `<details>`/`<summary>` wrapper (US-009, 6-prop shape at `./Accordion` per
 * D-MF14/D-MF16 — no `variant`, no `<Accordions>` parent wrapper;
 * cross-browser exclusive grouping via HTML5 `<details name>`).
 *
 * Compound-component machinery (Tabs/Tab, Accordions/Accordion) was cut in
 * US-002 along with the Context Bridge Registry (precedent #29 retracted on
 * this branch; preserved on PR #165 at commit e56f33c3 for future
 * compound-tier revival per NG19).
 *
 * Descriptor names no longer in `componentMap` — Banner, Card, Cards, Step,
 * Steps, Tab, Tabs, Accordions (fumadocs compound parent), File, Files,
 * Folder, TypeTable, InlineTOC — fall through to the `'*'` wildcard per
 * `registry/index.ts:getDescriptor`. Per-Precedent #30 the children of those
 * unregistered components stay editable (wildcard `hasChildren: true`).
 *
 * Mermaid was removed from the registry 2026-04-21.
 *
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { Accordion } from './Accordion.tsx';
import { Audio } from './Audio.tsx';
import { Callout } from './Callout.tsx';
import { Image } from './Image.tsx';
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
  '*': UnregisteredBadgeRender,
};
