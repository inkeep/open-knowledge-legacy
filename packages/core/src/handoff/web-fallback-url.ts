/**
 * Builds the https://claude.ai/new?q=... web-fallback URL for the "Open in
 * claude.ai →" secondary affordance shown when Claude Desktop isn't
 * installed.
 */
export function buildClaudeAiWebUrl(prompt: string): string {
  const q = encodeURIComponent(prompt);
  return `https://claude.ai/new?q=${q}`;
}
