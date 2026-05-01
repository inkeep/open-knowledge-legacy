export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg'] as const;

export const ALLOWED_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const;

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

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
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
]);
