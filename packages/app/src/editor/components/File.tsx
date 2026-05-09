import { FileUp } from 'lucide-react';

interface FileProps {
  src?: string;
  name?: string;
  size?: string;
  title?: string;
}

export function basenameFromUrl(src: string | undefined): string {
  if (!src) return '';
  let pathname: string;
  let protocol: string | null = null;
  try {
    const url = new URL(src, 'https://placeholder.local');
    protocol = url.protocol;
    pathname = url.pathname;
  } catch {
    const before = src.split('?')[0] ?? src;
    pathname = before;
  }
  if (protocol === 'data:' || protocol === 'blob:') return '';
  const segments = pathname.split('/');
  const last = segments[segments.length - 1] ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function File(props: FileProps) {
  const displayName = props.name?.trim() || basenameFromUrl(props.src) || 'Untitled file';
  const sizeText = props.size?.trim() ? props.size : null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (props.src) {
      window.open(props.src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a
      href={props.src || undefined}
      title={props.title}
      className="ok-file-attachment"
      target="_blank"
      rel="noopener noreferrer"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={handleClick}
    >
      <FileUp className="ok-file-icon" aria-hidden="true" />
      <span className="ok-file-name">{displayName}</span>
      {sizeText ? <span className="ok-file-size">{sizeText}</span> : null}
    </a>
  );
}
