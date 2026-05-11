import { toDesktopAssetHref } from '@inkeep/open-knowledge-core';

interface VideoProps {
  src?: string;
  controls?: boolean;
  autoplay?: boolean;
  poster?: string;
  width?: number | string;
  height?: number | string;
  title?: string;
  muted?: boolean;
  loop?: boolean;
  playsinline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
}

function resolveControls(controls: boolean | undefined): boolean {
  return controls !== false;
}

export function Video(props: VideoProps) {
  return (
    <video
      className="ok-video"
      src={props.src === undefined ? undefined : toDesktopAssetHref(props.src)}
      title={props.title}
      controls={resolveControls(props.controls)}
      autoPlay={props.autoplay}
      muted={props.muted}
      loop={props.loop}
      playsInline={props.playsinline}
      poster={props.poster === undefined ? undefined : toDesktopAssetHref(props.poster)}
      preload={props.preload}
      width={props.width}
      height={props.height}
    />
  );
}
