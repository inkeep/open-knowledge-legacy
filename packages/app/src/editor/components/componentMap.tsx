/**
 * Maps component name → React component for the descriptor registry.
 *
 * Transitional state (US-003/US-005/US-006/US-007 shipped, US-008..US-009 in flight):
 * the registry manifest is the 5-pack foundation (Callout + Image + Video +
 * Audio registered today; Accordion in US-009). Callout is a DIY renderer
 * (US-005, 7-prop GFM shape at `./Callout`). Image is a DIY renderer wrapping
 * `react-medium-image-zoom` (US-006, 8-prop shape at `./Image`). Video is a
 * DIY pure HTML5 `<video>` wrapper (US-007, 9-prop shape at `./Video` per
 * D-MF12 — no URL sniffing, no iframe emission). Audio is still the inline
 * HTML5 wrapper below — US-008 extracts it into its own module and widens
 * the prop shape per FR-4.
 *
 * Compound-component machinery (Tabs/Tab, Accordions/Accordion) was cut in
 * US-002 along with the Context Bridge Registry (precedent #27 / PRECEDENTS.md
 * #29 retracted on this branch; preserved on PR #165 at commit e56f33c3 for
 * future compound-tier revival per NG19).
 *
 * Descriptor names no longer in `componentMap` — Banner, Card, Cards, Step,
 * Steps, Tab, Tabs, Accordion (fumadocs shape), Accordions, File, Files,
 * Folder, TypeTable, InlineTOC — fall through to the `'*'` wildcard per
 * `registry/index.ts:getDescriptor`. Per-Precedent #28 the children of those
 * unregistered components stay editable (wildcard `hasChildren: true`).
 *
 * Mermaid was removed from the registry 2026-04-21.
 *
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { Callout } from './Callout.tsx';
import { Image } from './Image.tsx';
import { Video } from './Video.tsx';

function Audio(props: { src?: string; title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
      <div className="mb-1 font-medium">{props.title ?? 'Audio'}</div>
      {props.src ? (
        <audio controls src={props.src} className="w-full">
          <track kind="captions" />
        </audio>
      ) : (
        props.children
      )}
    </div>
  );
}

function UnregisteredBadgeRender(props: { children?: React.ReactNode }) {
  return <div className="prose-no-margin">{props.children}</div>;
}

// biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across the 5-pack + transitional shim imports; no single prop type covers all
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  Image,
  Video,
  Audio,
  '*': UnregisteredBadgeRender,
};
