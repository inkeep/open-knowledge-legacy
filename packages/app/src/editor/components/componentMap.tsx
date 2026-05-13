import { Accordion } from './Accordion.tsx';
import { Audio } from './Audio.tsx';
import { Callout } from './Callout.tsx';
import { Embed } from './Embed.tsx';
import { File } from './File.tsx';
import { Image } from './Image.tsx';
import { MathView } from './Math.tsx';
import { MermaidView } from './Mermaid.tsx';
import { Pdf } from './Pdf.tsx';
import { Tab } from './Tab.tsx';
import { Tabs } from './Tabs.tsx';
import { Video } from './Video.tsx';

function UnregisteredBadgeRender(props: { children?: React.ReactNode }) {
  return <div className="prose-no-margin">{props.children}</div>;
}

// biome-ignore lint/suspicious/noExplicitAny: Component props are heterogeneous across the canonical pack + transitional shim imports; no single prop type covers all
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  img: Image,
  video: Video,
  audio: Audio,
  Pdf,
  File,
  Embed,
  Accordion,
  Tabs,
  Tab,
  Math: MathView,
  MermaidFence: MermaidView,
  '*': UnregisteredBadgeRender,
};
