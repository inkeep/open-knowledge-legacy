# Serialize Round-trip Probe: mdast-util-mdx-jsx

Tests what normalization mdast-util-mdx-jsx's serializer applies when
reconstructing JSX from structured attributes + children (no source positions).

Generated: 2026-04-14T15:28:17.850Z

---

## Case 1: Inline children, double-quoted attr

**Original source:**
```mdx
<Callout type="info">Hello world</Callout>
```

**Reconstructed output:**
```mdx
<Callout type="info">Hello world</Callout>
```

**Match:** IDENTICAL

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxTextElement",
  "name": "Callout",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "type",
      "value": "info"
    }
  ],
  "childrenTypes": [
    "text"
  ],
  "childrenCount": 1
}
```

---

## Case 2: Inline children, single-quoted attr

**Original source:**
```mdx
<Callout type='info'>Hello world</Callout>
```

**Reconstructed output:**
```mdx
<Callout type="info">Hello world</Callout>
```

**Match:** DIFFERS

**Differences:**
  pos 14: original=' reconstructed="
  pos 19: original=' reconstructed="

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxTextElement",
  "name": "Callout",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "type",
      "value": "info"
    }
  ],
  "childrenTypes": [
    "text"
  ],
  "childrenCount": 1
}
```

---

## Case 3: Expression attribute, self-closing

**Original source:**
```mdx
<Chart data={values} />
```

**Reconstructed output:**
```mdx
<Chart data={values} />
```

**Match:** IDENTICAL

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Chart",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "data",
      "value": {
        "type": "mdxJsxAttributeValueExpression",
        "value": "values",
        "data": {
          "estree": {
            "type": "Program",
            "start": 13,
            "end": 19,
            "body": [
              {
                "type": "ExpressionStatement",
                "expression": {
                  "type": "Identifier",
                  "start": 13,
                  "end": 19,
                  "loc": {
                    "start": {
                      "line": 1,
                      "column": 13,
                      "offset": 13
                    },
                    "end": {
                      "line": 1,
                      "column": 19,
                      "offset": 19
                    }
                  },
                  "name": "values",
                  "range": [
                    13,
                    19
                  ]
                },
                "start": 13,
                "end": 19,
                "loc": {
                  "start": {
                    "line": 1,
                    "column": 13,
                    "offset": 13
                  },
                  "end": {
                    "line": 1,
                    "column": 19,
                    "offset": 19
                  }
                },
                "range": [
                  13,
                  19
                ]
              }
            ],
            "sourceType": "module",
            "comments": [],
            "loc": {
              "start": {
                "line": 1,
                "column": 13,
                "offset": 13
              },
              "end": {
                "line": 1,
                "column": 19,
                "offset": 19
              }
            },
            "range": [
              13,
              19
            ]
          }
        }
      }
    }
  ],
  "childrenTypes": [],
  "childrenCount": 0
}
```

---

## Case 4: Boolean attribute, self-closing

**Original source:**
```mdx
<Icon disabled />
```

**Reconstructed output:**
```mdx
<Icon disabled />
```

**Match:** IDENTICAL

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Icon",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "disabled",
      "value": null
    }
  ],
  "childrenTypes": [],
  "childrenCount": 0
}
```

---

## Case 5: Block children with markdown formatting

**Original source:**
```mdx
<Callout type="warning">

**Bold** and *italic* text.

</Callout>
```

**Reconstructed output:**
```mdx
<Callout type="warning">
  **Bold** and *italic* text.
</Callout>
```

**Match:** DIFFERS

**Differences:**
  pos 25: original=\n reconstructed=SPC
  pos 26: original=* reconstructed=SPC
  pos 28: original=B reconstructed=*
  pos 29: original=o reconstructed=B
  pos 30: original=l reconstructed=o

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Callout",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "type",
      "value": "warning"
    }
  ],
  "childrenTypes": [
    "paragraph"
  ],
  "childrenCount": 1
}
```

---

## Case 6: Nested JSX elements

**Original source:**
```mdx
<Steps>
<Step title="First">

Do this.

</Step>
<Step title="Second">

Then this.

</Step>
</Steps>
```

**Reconstructed output:**
```mdx
<Steps>
  <Step title="First">
    Do this.
  </Step>

  <Step title="Second">
    Then this.
  </Step>
</Steps>
```

**Match:** DIFFERS

**Differences:**
  pos 8: original=< reconstructed=SPC
  pos 9: original=S reconstructed=SPC
  pos 10: original=t reconstructed=<
  pos 11: original=e reconstructed=S
  pos 12: original=p reconstructed=t
  length: original=99 reconstructed=112

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Steps",
  "attributes": [],
  "childrenTypes": [
    "mdxJsxFlowElement",
    "mdxJsxFlowElement"
  ],
  "childrenCount": 2
}
```

---

## Case 7: Multiple attrs including boolean, block children with heading

**Original source:**
```mdx
<Card href="https://example.com" external>

# Card Title

Some content.

</Card>
```

**Reconstructed output:**
```mdx
<Card href="https://example.com" external>
  # Card Title

  Some content.
</Card>
```

**Match:** DIFFERS

**Differences:**
  pos 43: original=\n reconstructed=SPC
  pos 44: original=# reconstructed=SPC
  pos 45: original=SPC reconstructed=#
  pos 46: original=C reconstructed=SPC
  pos 47: original=a reconstructed=C
  length: original=80 reconstructed=82

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Card",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "href",
      "value": "https://example.com"
    },
    {
      "type": "mdxJsxAttribute",
      "name": "external",
      "value": null
    }
  ],
  "childrenTypes": [
    "heading",
    "paragraph"
  ],
  "childrenCount": 2
}
```

---

## Case 8: Expression attrs with number and array

**Original source:**
```mdx
<Component count={42} items={[1,2,3]} />
```

**Reconstructed output:**
```mdx
<Component count={42} items={[1,2,3]} />
```

**Match:** IDENTICAL

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Component",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "count",
      "value": {
        "type": "mdxJsxAttributeValueExpression",
        "value": "42",
        "data": {
          "estree": {
            "type": "Program",
            "start": 18,
            "end": 20,
            "body": [
              {
                "type": "ExpressionStatement",
                "expression": {
                  "type": "Literal",
                  "start": 18,
                  "end": 20,
                  "loc": {
                    "start": {
                      "line": 1,
                      "column": 18,
                      "offset": 18
                    },
                    "end": {
                      "line": 1,
                      "column": 20,
                      "offset": 20
                    }
                  },
                  "value": 42,
                  "raw": "42",
                  "range": [
                    18,
                    20
                  ]
                },
                "start": 18,
                "end": 20,
                "loc": {
                  "start": {
                    "line": 1,
                    "column": 18,
                    "offset": 18
                  },
                  "end": {
                    "line": 1,
                    "column": 20,
                    "offset": 20
                  }
                },
                "range": [
                  18,
                  20
                ]
              }
            ],
            "sourceType": "module",
            "comments": [],
            "loc": {
              "start": {
                "line": 1,
                "column": 18,
                "offset": 18
              },
              "end": {
                "line": 1,
                "column": 20,
                "offset": 20
              }
            },
            "range": [
              18,
              20
            ]
          }
        }
      }
    },
    {
      "type": "mdxJsxAttribute",
      "name": "items",
      "value": {
        "type": "mdxJsxAttributeValueExpression",
        "value": "[1,2,3]",
        "data": {
          "estree": {
            "type": "Program",
            "start": 29,
            "end": 36,
            "body": [
              {
                "type": "ExpressionStatement",
                "expression": {
                  "type": "ArrayExpression",
                  "start": 29,
                  "end": 36,
                  "loc": {
                    "start": {
                      "line": 1,
                      "column": 29,
                      "offset": 29
                    },
                    "end": {
                      "line": 1,
                      "column": 36,
                      "offset": 36
                    }
                  },
                  "elements": [
                    {
                      "type": "Literal",
                      "start": 30,
                      "end": 31,
                      "loc": {
                        "start": {
                          "line": 1,
                          "column": 30,
                          "offset": 30
                        },
                        "end": {
                          "line": 1,
                          "column": 31,
                          "offset": 31
                        }
                      },
                      "value": 1,
                      "raw": "1",
                      "range": [
                        30,
                        31
                      ]
                    },
                    {
                      "type": "Literal",
                      "start": 32,
                      "end": 33,
                      "loc": {
                        "start": {
                          "line": 1,
                          "column": 32,
                          "offset": 32
                        },
                        "end": {
                          "line": 1,
                          "column": 33,
                          "offset": 33
                        }
                      },
                      "value": 2,
                      "raw": "2",
                      "range": [
                        32,
                        33
                      ]
                    },
                    {
                      "type": "Literal",
                      "start": 34,
                      "end": 35,
                      "loc": {
                        "start": {
                          "line": 1,
                          "column": 34,
                          "offset": 34
                        },
                        "end": {
                          "line": 1,
                          "column": 35,
                          "offset": 35
                        }
                      },
                      "value": 3,
                      "raw": "3",
                      "range": [
                        34,
                        35
                      ]
                    }
                  ],
                  "range": [
                    29,
                    36
                  ]
                },
                "start": 29,
                "end": 36,
                "loc": {
                  "start": {
                    "line": 1,
                    "column": 29,
                    "offset": 29
                  },
                  "end": {
                    "line": 1,
                    "column": 36,
                    "offset": 36
                  }
                },
                "range": [
                  29,
                  36
                ]
              }
            ],
            "sourceType": "module",
            "comments": [],
            "loc": {
              "start": {
                "line": 1,
                "column": 29,
                "offset": 29
              },
              "end": {
                "line": 1,
                "column": 36,
                "offset": 36
              }
            },
            "range": [
              29,
              36
            ]
          }
        }
      }
    }
  ],
  "childrenTypes": [],
  "childrenCount": 0
}
```

---

## Case 9: Dotted component name

**Original source:**
```mdx
<Docs.Link href="/api" />
```

**Reconstructed output:**
```mdx
<Docs.Link href="/api" />
```

**Match:** IDENTICAL

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Docs.Link",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "href",
      "value": "/api"
    }
  ],
  "childrenTypes": [],
  "childrenCount": 0
}
```

---

## Case 10: Self-closing with no children

**Original source:**
```mdx
<Callout type="info" />

```

**Reconstructed output:**
```mdx
<Callout type="info" />
```

**Match:** DIFFERS

**Differences:**
  pos 23: original=\n reconstructed=<EOF>
  length: original=24 reconstructed=23

**Idempotent (double round-trip):** YES

**Extracted mdast structure:**
```json
{
  "type": "mdxJsxFlowElement",
  "name": "Callout",
  "attributes": [
    {
      "type": "mdxJsxAttribute",
      "name": "type",
      "value": "info"
    }
  ],
  "childrenTypes": [],
  "childrenCount": 0
}
```

---

## Summary

| Metric | Count |
|--------|-------|
| Total cases | 10 |
| IDENTICAL | 5 |
| DIFFERS | 5 |
| Idempotent | 10 |
| Errors | 0 |

## Key Observations

### Normalization behaviors discovered:

- **Quote normalization:** 1 case(s) where quote style changed (serializer defaults to double quotes)
- **Whitespace normalization:** 4 case(s) where whitespace changed
- **Idempotence:** All non-error cases are idempotent (double round-trip = single round-trip)

### Implications for Component Blocks v2:

1. **Quote normalization is lossy but harmless.** Single quotes (`'info'`) are normalized to double quotes (`"info"`) on serialize. The parsed mdast stores the *value* only, not the quote character. This is an irreducible gap -- the serializer defaults to `"` and the `quoteSmart` option only switches when it reduces bytes. Acceptable for Component Blocks since the semantic value is preserved.

2. **Block children indentation is added by the serializer.** The serializer adds 2-space indentation to flow children inside JSX elements (Cases 5, 6, 7). Original source uses `\n\n` blank-line separation between opening tag and content; the serializer uses `\n` + 2-space indent with no blank lines. This means `<Callout>\n\n**Bold**\n\n</Callout>` becomes `<Callout>\n  **Bold**\n</Callout>`. This is semantic-preserving (re-parse produces identical mdast) but source-form-lossy.

3. **Nested JSX elements get indented.** Case 6 shows `<Steps>` children (`<Step>`) gain 2-space indentation, and their own children gain 4-space. The serializer calls `containerFlow()` which applies `createIndent(depth)`. Original source had no indentation. Again, semantic-preserving but source-form-lossy.

4. **Trailing newline normalization.** Case 10 shows trailing `\n` after a self-closing element is stripped. Minor -- remark-stringify controls the final newline.

5. **All cases are idempotent.** Once the serializer has normalized a JSX element, re-parsing and re-serializing produces identical output. This means `serialize(reconstruct(parse(X)))` is a stable fixed point. Component Blocks v2 can rely on this: the first serialize normalizes, subsequent round-trips are stable.

6. **Self-closing elements are correctly inferred.** When a named element has 0 children, the serializer produces self-closing `<Foo />` syntax. No explicit `selfClosing` flag is needed on the mdast node -- empty children array is sufficient.

7. **Expression attributes preserve their source text.** `{values}`, `{42}`, `{[1,2,3]}` all round-trip identically via the `value` string on the expression node. The estree AST is carried along but the serializer uses `value` (the source text), not the AST.

8. **Boolean attributes preserve.** `disabled` (value: null) round-trips as `disabled` with no value. No normalization.

9. **Dotted names preserve.** `Docs.Link` round-trips identically. The name is stored as a single string.
