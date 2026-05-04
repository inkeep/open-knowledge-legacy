import { extname } from 'node:path';

export const SUPPORTED_DOC_EXTENSIONS = ['.mdx', '.md'] as const;
export type DocExtension = (typeof SUPPORTED_DOC_EXTENSIONS)[number];

const DEFAULT_EXTENSION: DocExtension = '.md';

export function isSupportedDocFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return (SUPPORTED_DOC_EXTENSIONS as readonly string[]).includes(ext);
}

export function isSupportedAssetFile(path: string, assetExtensions: ReadonlySet<string>): boolean {
  const ext = extname(path).slice(1).toLowerCase();
  return ext.length > 0 && assetExtensions.has(ext);
}

export function stripDocExtension(path: string): string {
  const lower = path.toLowerCase();
  for (const ext of SUPPORTED_DOC_EXTENSIONS) {
    if (lower.endsWith(ext)) return path.slice(0, -ext.length);
  }
  return path;
}

function rank(ext: DocExtension): number {
  return SUPPORTED_DOC_EXTENSIONS.indexOf(ext);
}

const docExtensionByName = new Map<string, DocExtension>();

export function registerDocExtension(
  docName: string,
  ext: DocExtension,
): { effective: DocExtension; changed: boolean; shadowed: DocExtension | null } {
  const existing = docExtensionByName.get(docName);
  if (!existing) {
    docExtensionByName.set(docName, ext);
    return { effective: ext, changed: true, shadowed: null };
  }
  if (existing === ext) {
    return { effective: existing, changed: false, shadowed: null };
  }
  if (rank(ext) < rank(existing)) {
    docExtensionByName.set(docName, ext);
    return { effective: ext, changed: true, shadowed: existing };
  }
  return { effective: existing, changed: false, shadowed: ext };
}

export function getDocExtension(docName: string): DocExtension {
  return docExtensionByName.get(docName) ?? DEFAULT_EXTENSION;
}

export function forgetDocExtension(docName: string): void {
  docExtensionByName.delete(docName);
}

export function _resetDocExtensionsForTests(): void {
  docExtensionByName.clear();
}
