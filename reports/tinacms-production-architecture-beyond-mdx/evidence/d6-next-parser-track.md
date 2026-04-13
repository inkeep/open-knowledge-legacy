Dimension: D6 — "Next" Parser Track (no-MDX path)
Date: 2026-04-13
Sources: TinaCMS monorepo (packages/@tinacms/mdx/src/next/), PR #3055, issue #2881, field schema type definitions

## Key Files Referenced

- `packages/@tinacms/mdx/src/next/parse/markdown.ts` — mdast-util-from-markdown + GFM entrypoint
- `packages/@tinacms/mdx/src/next/parse/post-processing.ts` — AST post-processing (shortcode extraction, fallback handling)
- `packages/@tinacms/mdx/src/next/shortcodes/` — custom micromark extension for shortcode delimiters
- `packages/@tinacms/mdx/src/next/stringify/to-markdown.ts` — next-path serializer with skipEscaping
- `packages/@tinacms/mdx/src/parse.ts` — runtime dispatch (field.parser.type → next vs legacy)
- `packages/@tinacms/schema-tools/src/types/SchemaTypes.ts` — parser union type definition

## Findings

### Runtime dispatch mechanism [Confidence: HIGH]

The parser is selected at runtime via `field.parser.type`. The union type is `"mdx" | "markdown" | "slatejson"`. When `parser.type` is `"markdown"`, the "next" parser path is used; `"mdx"` routes to the legacy remark-mdx pipeline. Default for `.md` collections (non-MDX) is `"markdown"` (the next parser), making it the default path for most content.

### Next parser replaces remark-mdx entirely [Confidence: HIGH]

The next parser uses `mdast-util-from-markdown` with GFM syntax extension (tables, autolinks, strikethrough, task lists) plus a custom shortcode micromark extension. It does NOT load remark-mdx, remark-parse, or any MDX-aware unified plugins. This is a fundamentally different parsing pipeline, not a configuration variant of the legacy one.

### Zero-error degradation for expressions and ESM [Confidence: HIGH]

In the next parser, JSX expressions (`{props.title}`), imports (`import X from 'y'`), and exports (`export const meta = {}`) are treated as plain text. They pass through the parser without error and appear as literal text content in the AST. Contrast with the legacy MDX parser where any of these constructs triggers an acorn parse error that converts the entire document into `invalid_markdown`.

This is the core motivation: the legacy parser uses acorn (a full JavaScript parser) to validate JSX expressions, and any syntax it cannot parse causes whole-document failure. The next parser sidesteps this entirely by not attempting JS expression parsing.

### Custom shortcode micromark extension [Confidence: HIGH]

The next parser includes a purpose-built micromark extension that handles Hugo, WordPress, and Markdoc shortcode delimiters:
- Hugo: `{{< shortcode >}}` and `{{% shortcode %}}`
- WordPress: `[shortcode]` (with heuristics to avoid false positives on markdown links)
- Generic: configurable delimiter patterns

This was the primary motivator for PR #3055 / issue #2881 — Hugo shortcodes embedded in markdown content were being fed to acorn by the legacy MDX parser, which crashed entire collections during indexing.

### skipEscaping in next stringify [Confidence: HIGH]

The next-path serializer (`to-markdown.ts`) includes a `skipEscaping` option that prevents markdown escape characters from being inserted around shortcode delimiters. Without this, round-tripping shortcodes through serialize would mangle the delimiter characters (e.g., `\{\{< foo >\}\}` instead of `{{< foo >}}`).

### Reuse of legacy remarkToSlate [Confidence: HIGH]

The next parser reuses the legacy `remarkToSlate` transformer for converting mdast to Plate/Slate AST, but passes `skipMDXProcess: true` to bypass all MDX-specific AST transformations. This means the Plate editor receives a standard markdown AST with shortcodes as custom nodes, rather than an MDX AST with JSX/expression nodes.

### Unknown JSX component fallback [Confidence: HIGH]

In both parser paths, unregistered JSX components (components not defined in the collection's `templates`) fall back to `html` nodes that preserve the source text. The next parser adds an additional `shouldFallback` check for closing-tag mismatches — when a closing tag doesn't match the expected component, it falls back to html rather than throwing.

### Known limitations documented via FIXME tests [Confidence: MODERATE]

The test suite includes FIXME-annotated tests that document known limitations:
- HTML children inside shortcode blocks are not fully supported
- Duplicate shortcode patterns (same name, different delimiters) can produce ambiguous results
- Nested shortcodes have limited support

### Timeline and adoption [Confidence: HIGH]

PR #3055 introduced the next parser. It was initially opt-in (collections had to explicitly set `parser.type: "markdown"`), then later became the default for non-MDX collections. The `"mdx"` parser type remains the default for `.mdx` file collections.

## Negative Searches

- No evidence of the next parser supporting JSX expression evaluation — expressions are deliberately treated as opaque text
- No evidence of a migration path from legacy MDX parser output to next parser output — they produce different AST shapes for the same input when expressions/ESM are present
- No evidence of the next parser being used for `.mdx` file collections — it is strictly for `.md` content

## Gaps

- Exact version where "next" became default for .md collections not pinpointed (described as v1.3.5 era based on changelog proximity, not confirmed)
- Performance comparison between next and legacy parser paths not found in benchmarks or documentation
- How the next parser handles MDX-in-markdown (fenced code blocks containing JSX) — likely passes through as code, but not explicitly tested
