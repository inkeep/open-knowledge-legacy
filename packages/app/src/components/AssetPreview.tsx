import type { InlineAssetMediaKind } from '@inkeep/open-knowledge-core';

interface AssetPreviewProps {
  assetPath: string;
  mediaKind: InlineAssetMediaKind;
}

function assetUrl(assetPath: string): string {
  return `/api/asset?path=${encodeURIComponent(assetPath)}`;
}

export function AssetPreview({ assetPath, mediaKind }: AssetPreviewProps) {
  const src = assetUrl(assetPath);
  const fileName = assetPath.split('/').pop() ?? assetPath;

  return (
    <main className="flex h-full min-h-0 flex-col bg-background" aria-label={fileName}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {mediaKind === 'image' ? (
          <img
            src={src}
            alt={fileName}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          // biome-ignore lint/a11y/useMediaCaption: local preview files do not have sidecar captions.
          <video src={src} controls className="max-h-full max-w-full" />
        )}
      </div>
    </main>
  );
}
