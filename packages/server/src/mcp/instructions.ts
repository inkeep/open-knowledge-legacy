/**
 * MCP `instructions` handshake string — emitted on `initialize`.
 *
 * Front-loads the STOP rule on native `Read`/`Grep`/`Glob`/`Edit`/`Write`
 * against in-scope `.md`/`.mdx` plus the preview-attach contract; the
 * remaining behavioral guidance (wiki-link authoring, frontmatter rules,
 * folder-first organization, anti-patterns) lives in the user-global
 * `open-knowledge` Agent Skill that ships with the CLI. Tool descriptions
 * reach clients via `tools/list`, not via this string.
 *
 * Compressed to ≤ ~1,500 bytes so it fits under Claude Code's 2 KB
 * per-server cap without truncation.
 */
import type { Config } from '../config/schema.ts';

/**
 * Build the MCP `instructions` payload from the project's loaded content config.
 *
 * Takes only `Config['content']` (not the whole `Config`) — the rendered
 * string interpolates the active content root and include/exclude globs and
 * needs nothing else from the config tree. Narrowing the parameter keeps the
 * function reusable from any caller that already has the content subtree
 * resolved without forcing them to materialize an entire `Config`.
 */
export function buildInstructions(content: Config['content']): string {
  const includeLine = content.include.map((p) => `\`${p}\``).join(', ');
  const excludeLine =
    content.exclude.length > 0 ? content.exclude.map((p) => `\`${p}\``).join(', ') : '(none)';

  return `# Open Knowledge (OK) — collaborative markdown via MCP

**STOP — native tools on in-scope \`.md\` / \`.mdx\`.** Do NOT use host-native \`Read\`, \`Grep\`, \`Glob\`, \`Edit\`, \`Write\` on markdown inside the content dir. Reads: \`exec\` / \`read_document\` / \`search\`. Writes: \`write_document\` / \`edit_document\` ONLY.

**Preview:** open the browser at session start if not already open. On \`attach-preview-once\` in a write response, open \`previewUrl\` one-shot.

Content dir: ${content.dir}. Include: ${includeLine}. Exclude: ${excludeLine}.

## Reads

\`exec("cat <path>.md")\` / \`exec("ls <dir>")\` / \`exec("grep -rn <term> <dir>")\` — primary; returns contents + enrichment. Typed \`read_document\` / \`search\` when you need \`structuredContent\`.

## Preview — open at session start

Claude Code Desktop: \`preview_start("open-knowledge-ui")\`. Other hosts: open-URL tool or \`open <url>\`. If a write response lacks the \`attach-preview-once\` warning, a browser is attached — do nothing. Server not running: \`open-knowledge ui\`.

## Full guidance

Detailed conventions (wiki-link authoring, frontmatter, anti-patterns) live in the installed \`open-knowledge\` Agent Skill. If missing, run \`npx @inkeep/open-knowledge init\`.

**Escape hatch.** Native \`Read\`/\`Grep\`/\`Glob\` on \`.md\` is allowed ONLY when no OK MCP is registered, or immediately after an OK MCP call failed — then begin your sentence with \`Open Knowledge MCP unavailable:\`. Non-markdown: native tools always.
`;
}
