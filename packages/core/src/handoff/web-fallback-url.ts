/**
 * Builds the https://claude.ai/new?q=... web-fallback URL for the
 * "Open in claude.ai →" secondary affordance surfaced in the disabled-row
 * tooltip when Claude Desktop is not installed (PQ6 LOCKED).
 *
 * Single `encodeURIComponent` on the prompt per I3 (encoding correctness).
 * See `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.2.
 */
export function buildClaudeAiWebUrl(prompt: string): string {
  const q = encodeURIComponent(prompt);
  return `https://claude.ai/new?q=${q}`;
}
