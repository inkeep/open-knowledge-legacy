import type { Config } from '../config/schema.ts';

export function buildInstructions(content: Config['content']): string {
  return `# Open Knowledge (OK) — collaborative markdown via MCP

**STOP** *(when \`.ok/\` exists)* — do NOT use native \`Read\`, \`Grep\`, \`Glob\`, \`Edit\`, \`Write\` on in-scope \`.md\` / \`.mdx\`. Reads: \`exec\` / \`read_document\` / \`search\` / \`grep\`. Writes: \`write_document\` / \`edit_document\` ONLY.

**Preview:** open the browser at session start if not already open. On \`attach-preview-once\` in a write response, open \`previewUrl\` one-shot.

Content dir: ${content.dir}. Path scope: \`.gitignore\` + \`.okignore\` (gitignore syntax) at the project root or any folder depth.

## Reads

\`exec("cat <path>.md")\` / \`exec("ls <dir>")\` — primary; returns contents + enrichment. Typed \`read_document\` for one doc, \`search\` for ranked retrieval (cmd-K parity), \`grep\` for every literal-string occurrence — pick by intent.

## Preview — open at session start

Claude Code Desktop: \`preview_start("open-knowledge-ui")\`. Other hosts: open-URL tool or \`open <url>\`. If a write response lacks the \`attach-preview-once\` warning, a browser is attached — do nothing. Server not running: \`open-knowledge ui\`.

## Full guidance

Detailed conventions (wiki-link authoring, frontmatter, anti-patterns) live in the installed \`open-knowledge\` Agent Skill. If missing, run \`npx @inkeep/open-knowledge init\`.

**Escape hatch.** Native \`Read\`/\`Grep\`/\`Glob\` on \`.md\` is allowed when the project has no \`.ok/\`, when no OK MCP is registered, or right after a failed OK MCP call (then prefix with \`Open Knowledge MCP unavailable:\`). Non-markdown: native tools always.
`;
}
