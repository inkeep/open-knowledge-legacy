/**
 * Maps component name → React component for the descriptor registry.
 *
 * Transitional state (US-003/US-005 shipped, US-006..US-009 in flight):
 * the registry manifest is narrowed to the 5-pack foundation (Callout + Image
 * + Audio registered today; Video in US-007, Accordion in US-009). Callout
 * is now a DIY renderer (US-005 landed the 7-prop GFM shape at `./Callout`);
 * Image still routes through fumadocs-ui's ImageZoom as a deploy-safe bridge
 * until US-006 lands the DIY `react-medium-image-zoom` component. Audio is
 * the existing inline HTML5 wrapper — US-008 extracts it into its own module
 * and widens the prop shape per FR-4. Once US-006/US-008 ship their DIY
 * components, `fumadocs-ui` gets dropped from `packages/app/package.json`
 * and this file's imports become zero.
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
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Callout } from './Callout.tsx';

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
  // US-003 renames the ImageZoom descriptor to Image. The renderer still points
  // at fumadocs-ui's ImageZoom until US-006 lands the DIY
  // `react-medium-image-zoom` implementation keyed on `Image`.
  Image: ImageZoom,
  Audio,
  '*': UnregisteredBadgeRender,
};
