---
title: "Evidence: MDAST-to-Plate Core Switch Statement"
source: "@tinacms/mdx/src/parse/remarkToPlate.ts lines 44-137"
type: source-code
---

# MDAST-to-Plate Core Switch Statement

The `content()` function in `remarkToSlate()` is the central dispatch for converting MDAST block-level nodes to Plate nodes. Key observations:

1. `mdxJsxFlowElement` routes to `mdxJsxElement()` which requires template lookup
2. `mdxFlowExpression` and `mdxjsEsm` **throw errors** -- these are explicitly unsupported
3. `html` is preserved as an opaque string

```typescript
// @tinacms/mdx/src/parse/remarkToPlate.ts lines 44-137
const content = (content: Md.Content): Plate.BlockElement => {
    switch (content.type) {
      case 'table': { /* ... table mapping ... */ }
      case 'blockquote': { /* ... unwraps to inline ... */ }
      case 'heading': return heading(content);
      case 'code': return parseCode(content);
      case 'paragraph': return paragraph(content);
      case 'mdxJsxFlowElement':
        return mdxJsxElement(content, field, imageCallback);
      case 'thematicBreak': { /* hr */ }
      case 'listItem': { /* li > lic */ }
      case 'list': return list(content);
      case 'html': return html(content);
      // @ts-ignore
      case 'mdxFlowExpression':
      // @ts-ignore
      case 'mdxjsEsm':
        throw new RichTextParseError(
          `Unexpected expression ${content.value}.`,
          content.position
        );
      case 'leafDirective': { /* shortcode */ }
      case 'containerDirective': { /* shortcode */ }
      default:
        throw new RichTextParseError(
          `Content: ${content.type} is not yet supported`,
          content.position
        );
    }
  };
```
