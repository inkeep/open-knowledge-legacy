import type { InlineAssetMediaKind } from '@inkeep/open-knowledge-core';
import { LoadingImage } from '@/components/ui/loading-image';
import { Pdf } from '@/editor/components/Pdf';

interface AssetPreviewProps {
  assetPath: string;
  mediaKind: InlineAssetMediaKind | null;
}

function assetUrl(assetPath: string): string {
  return `/api/asset?path=${encodeURIComponent(assetPath)}`;
}

export function AssetPreview({ assetPath, mediaKind }: AssetPreviewProps) {
  const src = assetUrl(assetPath);
  const fileName = assetPath.split('/').pop() ?? assetPath;
  const extension = fileName.includes('.')
    ? (fileName.split('.').pop()?.toUpperCase() ?? 'FILE')
    : 'FILE';

  if (mediaKind === 'pdf') {
    return (
      <main className="flex h-full min-h-0 flex-col bg-background" aria-label={fileName}>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Pdf src={src} title={fileName} fillContainer />
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-background" aria-label={fileName}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {mediaKind === 'image' ? (
          <LoadingImage
            src={src}
            alt={fileName}
            draggable={false}
            slotClassName="max-h-full max-w-full"
            className="max-h-full max-w-full object-contain"
          />
        ) : mediaKind === 'video' ? (
          // biome-ignore lint/a11y/useMediaCaption: local preview files do not have sidecar captions.
          <video src={src} controls className="max-h-full max-w-full" />
        ) : mediaKind === 'audio' ? (
          // biome-ignore lint/a11y/useMediaCaption: local preview files do not have sidecar captions.
          <audio src={src} controls className="w-full max-w-md" />
        ) : (
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-md border bg-muted font-medium text-muted-foreground text-sm">
              {extension}
            </div>
            <div className="max-w-full break-words font-medium text-sm">{fileName}</div>
            <a
              href={src}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Open file
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
