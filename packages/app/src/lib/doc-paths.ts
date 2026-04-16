export function normalizeDocNameInput(value: string): string {
  return value
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\.mdx?$/i, '');
}

export function docNameToMarkdownPath(docName: string): string {
  const normalized = normalizeDocNameInput(docName);
  return normalized ? `${normalized}.md` : 'untitled.md';
}

export function docNameToDialogSeed(docName: string): {
  initialDir: string;
  suggestedName: string;
} {
  const normalized = normalizeDocNameInput(docName);
  const slash = normalized.lastIndexOf('/');
  return {
    initialDir: slash > 0 ? normalized.slice(0, slash) : '',
    suggestedName: `${slash >= 0 ? normalized.slice(slash + 1) : normalized || 'untitled'}.md`,
  };
}
