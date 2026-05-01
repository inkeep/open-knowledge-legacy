import { Accordion } from './Accordion.tsx';
import { Audio } from './Audio.tsx';
import { Callout } from './Callout.tsx';
import { Image } from './Image.tsx';
import { MathView } from './Math.tsx';
import { Video } from './Video.tsx';

function UnregisteredBadgeRender(props: { children?: React.ReactNode }) {
  return <div className="prose-no-margin">{props.children}</div>;
}

export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout,
  img: Image,
  video: Video,
  audio: Audio,
  Accordion,
  Math: MathView,
  '*': UnregisteredBadgeRender,
};
