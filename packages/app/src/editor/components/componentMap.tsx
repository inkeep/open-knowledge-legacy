/**
 * Maps component name → React component for the descriptor registry.
 *
 * 16 fumadocs-ui components imported directly (D12 fidelity priority).
 * Mermaid + Audio are placeholder stubs until shadcn wrappers are built.
 * '*' maps to UnregisteredBadgeRender for the wildcard fallback.
 */
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Banner } from 'fumadocs-ui/components/banner';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';

function MermaidPlaceholder(props: { chart?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-fd-muted/50 p-4 text-sm text-fd-muted-foreground">
      <div className="mb-1 font-medium">Mermaid Diagram</div>
      {props.chart ? <pre className="overflow-x-auto text-xs">{props.chart}</pre> : props.children}
    </div>
  );
}

function AudioPlaceholder(props: { src?: string; title?: string; children?: React.ReactNode }) {
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
  Tabs,
  Tab,
  Accordions,
  Accordion,
  Files,
  Folder,
  File,
  ImageZoom,
  Banner,
  TypeTable,
  InlineTOC,
  Mermaid: MermaidPlaceholder,
  Audio: AudioPlaceholder,
  '*': UnregisteredBadgeRender,
};
