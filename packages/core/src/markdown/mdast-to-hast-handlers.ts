/**
 * mdast → hast handlers for custom node types (outbound clipboard HTML).
 *
 * Scaffolding at US-003: the four custom mdast node types (`wikiLink`,
 * `rawMdxFallback`, `mdxJsxFlowElement`, `mdxJsxTextElement`) are NOT yet
 * promoted from `{type:'html',value}` passthrough — that happens in US-004,
 * US-005, and US-006. As a result, the promoted-type handlers are added in
 * US-007 once there are real mdast nodes of those types to handle.
 *
 * The `customNodeHandlers` record stays at `{}` for US-003 to document the
 * shape and the registration point without claiming behavior the upstream
 * types don't yet support. Consuming code can merge this record into
 * `remarkRehype`'s `handlers` option; until US-007 populates it, the
 * pipeline's default mdast→hast transforms handle every known type.
 */

import type { Handlers } from 'mdast-util-to-hast';

/**
 * Registered mdast → hast handlers for custom node types.
 *
 * Populated in US-007 with entries for `wikiLink`, `rawMdxFallback`,
 * `mdxJsxFlowElement`, and `mdxJsxTextElement`. Empty at scaffold time.
 */
export const customNodeHandlers: Handlers = {};
