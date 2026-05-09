export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg'] as const;

export const ALLOWED_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const;

export const ALLOWED_PDF_MIME_TYPES = ['application/pdf'] as const;

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
]);

export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv']);

export const PDF_EXTENSIONS: ReadonlySet<string> = new Set(['pdf']);

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
]);

export const FILE_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'doc',
  'xls',
  'ppt',
  'zip',
  '7z',
  'tar',
  'gz',
  'rar',
  'csv',
  'tsv',
  'rtf',
  'json',
  'yaml',
  'yml',
  'xml',
  'txt',
  'pages',
  'numbers',
  'key',
  'odt',
  'ods',
  'odp',
  'epub',
  'mobi',
]);

export const EXECUTABLE_BLOCKLIST_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe',
  'bat',
  'cmd',
  'ps1',
  'com',
  'msi',
  'vbs',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'sh',
  'command',
  'csh',
  'ksh',
  'bash',
  'zsh',
  'fish',
  'desktop',
  'action',
  'workflow',
  'html',
  'htm',
  'svg',
  'xml',
  'mhtml',
  'svgz',
  'dmg',
  'pkg',
  'mpkg',
  'scpt',
  'applescript',
  'terminal',
  'prefpane',
  'webloc',
  'inetloc',
  'fileloc',
  'jar',
  'appimage',
  'deb',
  'rpm',
  'msix',
  'appx',
  'ipa',
  'apk',
  'pif',
  'scr',
  'lnk',
  'url',
]);

export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'apng',
  'heic',
  'heif',
  'tiff',
  'bmp',
  'ico',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'mpeg',
  'mpg',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
  'zip',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'txt',
  'rtf',
  'json',
]);

export const INLINE_RENDERABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'apng',
  'heic',
  'heif',
  'tiff',
  'bmp',
  'ico',
  'svg',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
]);

export type EmitFormat = 'wikiembed' | 'markdown-image';
export type DedupMode = 'off' | 'same-dir';
export type DedupUIMode = 'silent' | 'toast' | 'confirm';

export const DEFAULT_ATTACHMENT_FOLDER_PATH = './';

export const DEFAULT_EMIT_FORMAT: EmitFormat = 'wikiembed';

export const DEFAULT_DEDUP_MODE: DedupMode = 'same-dir';

export const DEFAULT_DEDUP_UI: DedupUIMode = 'toast';

export const WIKI_EMBED_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
  'docx',
  'xlsx',
  'pptx',
  'doc',
  'xls',
  'ppt',
  'zip',
  '7z',
  'tar',
  'gz',
  'rar',
  'csv',
  'tsv',
  'rtf',
  'json',
  'yaml',
  'yml',
  'xml',
  'txt',
  'pages',
  'numbers',
  'key',
  'odt',
  'ods',
  'odp',
  'epub',
  'mobi',
]);

export type InlineAssetMediaKind = 'image' | 'video';

const SIDEBAR_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const;
const SIDEBAR_VIDEO_EXTENSIONS = ['mp4'] as const;

function assertSubset(
  name: string,
  extensions: readonly string[],
  canonical: ReadonlySet<string>,
): void {
  for (const ext of extensions) {
    if (!canonical.has(ext)) {
      throw new Error(`${name}: ${ext} is not present in canonical upload constants`);
    }
  }
}

assertSubset('SIDEBAR_IMAGE_ASSET_EXTENSIONS', SIDEBAR_IMAGE_EXTENSIONS, IMAGE_EXTENSIONS);
assertSubset('SIDEBAR_VIDEO_ASSET_EXTENSIONS', SIDEBAR_VIDEO_EXTENSIONS, VIDEO_EXTENSIONS);
assertSubset('FILE_ATTACHMENT_EXTENSIONS', [...FILE_ATTACHMENT_EXTENSIONS], WIKI_EMBED_EXTENSIONS);

export const SIDEBAR_IMAGE_ASSET_EXTENSIONS: ReadonlySet<string> = new Set(
  SIDEBAR_IMAGE_EXTENSIONS,
);
export const SIDEBAR_VIDEO_ASSET_EXTENSIONS: ReadonlySet<string> = new Set(
  SIDEBAR_VIDEO_EXTENSIONS,
);
export const SIDEBAR_RENDERABLE_ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  ...SIDEBAR_IMAGE_EXTENSIONS,
  ...SIDEBAR_VIDEO_EXTENSIONS,
]);

assertSubset(
  'SIDEBAR_RENDERABLE_ASSET_EXTENSIONS',
  [...SIDEBAR_RENDERABLE_ASSET_EXTENSIONS],
  INLINE_RENDERABLE_EXTENSIONS,
);

export function mediaKindForSidebarAssetExtension(ext: string): InlineAssetMediaKind | null {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  if (SIDEBAR_IMAGE_ASSET_EXTENSIONS.has(normalized)) return 'image';
  if (SIDEBAR_VIDEO_ASSET_EXTENSIONS.has(normalized)) return 'video';
  return null;
}
