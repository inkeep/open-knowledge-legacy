export function buildClaudeAiWebUrl(prompt: string): string {
  const q = encodeURIComponent(prompt);
  return `https://claude.ai/new?q=${q}`;
}
