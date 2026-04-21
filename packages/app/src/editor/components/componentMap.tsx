/**
 * Maps component name → React component for the descriptor registry.
 *
 * LEAF components (no compound-context dependency) use direct fumadocs-ui
 * imports — full D12 fidelity. COMPOUND components (Tabs/Tab,
 * Accordions/Accordion) use editor-local wrappers because fumadocs compounds
 * rely on React Context via Radix's createContextScope which doesn't cross
 * TipTap's NodeView portal boundaries. See compound-wrappers.tsx for the
 * evidence trace and rationale.
 *
 * `Audio` is a minimal HTML5 `<audio controls>` wrapper — functional playback
 * via the browser-native media element. VR14 envisioned a shadcn-styled
 * player; the research + follow-up work item live at
 * `specs/2026-04-14-component-blocks-v2/evidence/mermaid-audio-rendering-deferred.md`
 * (current lean: AI Elements AudioPlayer on `media-chrome`).
 *
 * Mermaid was removed from the registry 2026-04-21 — the prior placeholder
 * rendered no SVG and was tech debt under the greenfield directive. Existing
 * `<Mermaid />` user content auto-converts to `rawMdxFallback` (nested CM
 * source editor) via `JsxComponentView`'s wildcard-handling path.
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
import { EditorAccordion, EditorAccordions, EditorTab, EditorTabs } from './compound-wrappers';
import { InlineTOCView } from './InlineTOCView';

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
  Tabs: EditorTabs,
  Tab: EditorTab,
  Accordions: EditorAccordions,
  Accordion: EditorAccordion,
  Files,
  Folder,
  File,
  ImageZoom,
  Banner,
  TypeTable,
  InlineTOC: InlineTOCView,
  Audio,
  '*': UnregisteredBadgeRender,
};
