/**
 * Maps component name → React component for the descriptor registry.
 *
 * Fumadocs LEAF imports (Callout, Card, Cards, File, Files, Folder,
 * ImageZoom, Step, Steps, Banner, TypeTable) are transitional — they
 * keep the editor renderable while the 5-pack DIY replacements land in
 * US-005..US-009 per `specs/2026-04-23-cb-v2-md-foundation/SPEC.md`.
 * Compound-component machinery (Tabs/Tab, Accordions/Accordion) was cut
 * in US-002 along with the Context Bridge Registry (Precedent #27 /
 * PRECEDENTS.md #29 retracted on this branch; preserved on PR #165 at
 * commit e56f33c3 for future compound-tier revival per NG19).
 *
 * `Audio` is a minimal HTML5 `<audio controls>` wrapper — functional
 * playback via the browser-native media element. VR14 envisioned a
 * shadcn-styled player; the research + follow-up work item live at
 * `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`
 * (current lean: AI Elements AudioPlayer on `media-chrome`).
 *
 * Mermaid was removed from the registry 2026-04-21. Content names no
 * longer in `componentMap` (Tabs/Tab/Accordions/Accordion/InlineTOC
 * after US-002) fall through to the `'*'` wildcard per
 * `registry/index.ts:getDescriptor`, which renders user content verbatim
 * under Precedent #28 (all user content visible).
 *
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { Banner } from 'fumadocs-ui/components/banner';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';

function Audio(props: { src?: string; title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-fd-muted/50 p-4 text-sm text-fd-muted-foreground">
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

// biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across 18+ built-ins; no single prop type covers all
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  Card,
  Cards,
  Steps,
  Step,
  Files,
  Folder,
  File,
  ImageZoom,
  Banner,
  TypeTable,
  Audio,
  '*': UnregisteredBadgeRender,
};
