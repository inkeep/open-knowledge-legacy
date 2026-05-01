
import type { ImgHTMLAttributes } from 'react';
import Zoom from 'react-medium-image-zoom';

interface ImageProps {
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  title?: string;
  loading?: 'eager' | 'lazy';
  srcset?: string;
  sizes?: string;
  decoding?: 'sync' | 'async' | 'auto';
  fetchpriority?: 'high' | 'low' | 'auto';
  crossorigin?: '' | 'anonymous' | 'use-credentials';
  referrerpolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
}

function resolveLoading(loading: 'eager' | 'lazy' | undefined): 'eager' | 'lazy' {
  return loading ?? 'lazy';
}

function BareImg(props: ImageProps) {
  return (
    <img
      src={props.src}
      alt={props.alt ?? ''}
      width={props.width}
      height={props.height}
      title={props.title}
      loading={resolveLoading(props.loading)}
      srcSet={props.srcset}
      sizes={props.sizes}
      decoding={props.decoding}
      fetchPriority={props.fetchpriority}
      crossOrigin={props.crossorigin}
      referrerPolicy={props.referrerpolicy}
    />
  );
}

export function Image(props: ImageProps) {
  return (
    <Zoom wrapElement="span" zoomMargin={20} zoomImg={{ sizes: undefined }}>
      <BareImg {...props} />
    </Zoom>
  );
}
