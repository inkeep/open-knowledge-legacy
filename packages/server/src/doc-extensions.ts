import { extname } from 'node:path';

export const SUPPORTED_DOC_EXTENSIONS = ['.mdx', '.md'] as const;
type DocExtension = (typeof SUPPORTED_DOC_EXTENSIONS)[number];

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

function canonicalize(ext: string): DocExtension | null {
  const lower = ext.toLowerCase();
  if (lower === '.mdx') return '.mdx';
  if (lower === '.md') return '.md';
  return null;
}

function rank(ext: DocExtension): number {
  return SUPPORTED_DOC_EXTENSIONS.indexOf(ext);
}

const docExtensionByName = new Map<string, string>();

export function registerDocExtension(
  docName: string,
  observedExt: string,
): { effective: string; changed: boolean; shadowed: string | null } {
  const canonical = canonicalize(observedExt);
  if (!canonical) {
    throw new Error(`registerDocExtension: unsupported extension "${observedExt}"`);
  }
  const existing = docExtensionByName.get(docName);
  if (!existing) {
    docExtensionByName.set(docName, observedExt);
    return { effective: observedExt, changed: true, shadowed: null };
  }
  const existingCanonical = canonicalize(existing);
  if (!existingCanonical) {
    docExtensionByName.set(docName, observedExt);
    return { effective: observedExt, changed: true, shadowed: existing };
  }
  if (existingCanonical === canonical) {
    return { effective: existing, changed: false, shadowed: null };
  }
  if (rank(canonical) < rank(existingCanonical)) {
    docExtensionByName.set(docName, observedExt);
    return { effective: observedExt, changed: true, shadowed: existing };
  }
  return { effective: existing, changed: false, shadowed: observedExt };
}

export function getDocExtension(docName: string): string {
  return docExtensionByName.get(docName) ?? DEFAULT_EXTENSION;
}

export function forgetDocExtension(docName: string): void {
  docExtensionByName.delete(docName);
}

export function _resetDocExtensionsForTests(): void {
  docExtensionByName.clear();
}
