import {
  type ParsedYouTubeUrl,
  parseYouTubeUrl,
  toDesktopAssetHref,
} from '@inkeep/open-knowledge-core';
import type { CSSProperties } from 'react';
import LiteYouTubeEmbed from 'react-lite-youtube-embed';
import 'react-lite-youtube-embed/dist/LiteYouTubeEmbed.css';

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

function buildYouTubeParams(props: VideoProps, yt: ParsedYouTubeUrl): string | undefined {
  const parts: string[] = [];
  if (yt.startSeconds !== null) parts.push(`start=${yt.startSeconds}`);
  if (props.controls === false) parts.push('controls=0');
  if (props.loop === true) parts.push('loop=1', `playlist=${yt.id}`);
  if (props.playsinline === true) parts.push('playsinline=1');
  return parts.length > 0 ? parts.join('&') : undefined;
}

function buildYouTubeWrapperStyle(props: VideoProps): CSSProperties | undefined {
  if (props.width === undefined) return undefined;
  return { width: props.width };
}

function buildYouTubeLiteStyle(props: VideoProps): CSSProperties | undefined {
  if (props.width === undefined || props.height === undefined) return undefined;
  return { aspectRatio: `${props.width} / ${props.height}` };
}

export function Video(props: VideoProps) {
  const yt = props.src !== undefined ? parseYouTubeUrl(props.src) : null;
  if (yt !== null) {
    const eagerIframe = props.autoplay === true && props.muted === true;
    const explicitWidth = props.width !== undefined;
    const explicitAspect = explicitWidth && props.height !== undefined;
    return (
      <div className="ok-video ok-video-youtube" style={buildYouTubeWrapperStyle(props)}>
        <LiteYouTubeEmbed
          id={yt.id}
          title={props.title ?? 'YouTube video player'}
          cookie={!yt.noCookie}
          params={buildYouTubeParams(props, yt)}
          muted={props.muted === true}
          autoplay={props.autoplay === true}
          alwaysLoadIframe={eagerIframe}
          thumbnail={props.poster !== undefined ? toDesktopAssetHref(props.poster) : undefined}
          aspectWidth={explicitAspect ? Number(props.width) : undefined}
          aspectHeight={explicitAspect ? Number(props.height) : undefined}
          style={buildYouTubeLiteStyle(props)}
        />
      </div>
    );
  }
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
