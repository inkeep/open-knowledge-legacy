---
title: Composition Fixture
description: Exercises every construct from SPEC §4 for polish engine testing
tags: [test, fixture]
---

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

This is a paragraph with *emphasis*, **strong text**, ~~strikethrough~~, and `inline code` mixed together. Here's a [regular link](https://example.com) and an ![image](https://example.com/img.png "alt text").

> This is a blockquote at depth 1.
> It continues across multiple lines to test wrapping.
>
> > This is a nested blockquote at depth 2.
> > The border should be visually distinct from depth 1.
> >
> > > Depth 3 — maximum visual differentiation per spec.
> > > Further nesting inherits depth 3 styling.

---

***

___

| Header A | Header B | Header C | Header D |
|----------|----------|----------|----------|
| Cell 1A | Cell 1B | Cell 1C | Cell 1D |
| Cell 2A with a much longer content that will definitely wrap when the viewport is narrow enough to trigger line wrapping behavior | Cell 2B | Cell 2C | Cell 2D |
| Cell 3A | Cell 3B | Cell 3C | Cell 3D |

```typescript
function example() {
  const x = 1;
  const y = 2;
  return x + y;
}
```

```bash
echo "Hello, world!"
ls -la /tmp
```

```
No language specified — plain code block.
  Indented line for preserve-source-indent testing.
    Deeper indentation.
```

- Bullet item 1
- Bullet item 2 with a long line that will wrap to test the hanging indent alignment behavior in the polish engine
  - Nested bullet item 2a
  - Nested bullet item 2b
    - Third level nesting

1. Ordered item 1
2. Ordered item 2
3. Ordered item 3

- [ ] Unchecked task
- [x] Checked task
- [ ] Another unchecked task

This paragraph has a [reference-style link][existing-ref] and a [broken reference][missing-ref].

[existing-ref]: https://example.com "Existing reference definition"

<div class="custom-component" id="test-html" data-attribute="value">
  <span>HTML block content</span>
  <p>Multi-line HTML with attributes for syntax highlighting</p>
</div>

[[Some Wiki Page]]
[[Another Wiki Link]]

> Blockquote containing a fenced code block:
>
> ```python
> def nested_code():
>     return "This tests nested construct composition"
> ```
>
> And ~~strikethrough inside blockquote~~ for nested inline testing.

The end of the composition fixture.
