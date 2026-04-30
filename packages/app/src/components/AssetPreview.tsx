import { FileImage, FileVideo } from 'lucide-react';

interface AssetPreviewProps {
  assetPath: string;
  mediaKind: 'image' | 'video';
}

function assetUrl(assetPath: string): string {
  return `/api/asset?path=${encodeURIComponent(assetPath)}`;
}

export function AssetPreview({ assetPath, mediaKind }: AssetPreviewProps) {
  const src = assetUrl(assetPath);
  const fileName = assetPath.split('/').pop() ?? assetPath;

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        {mediaKind === 'video' ? (
          <FileVideo className="size-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <FileImage className="size-4 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h1 className="truncate font-medium text-sm">{fileName}</h1>
          <p className="truncate text-muted-foreground text-xs">{assetPath}</p>
        </div>
      </header>
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
