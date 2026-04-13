## 2026-04-13

### Changes
- **Created spec:** `markdown-mdx-tolerant-parsing`
  - Scope: define the product and technical contract for tolerant loading of malformed or ambiguous MDX-like content
- **Created evidence:** `evidence/current-parser-behavior.md`
  - Captures the global `remark-mdx` parse path, current `<50ms` recovery seam, current `PROJECT.md` regressions, and persistence blank-load behavior
- **Created evidence:** `evidence/product-file-model.md`
  - Captures the repo’s stated “one editor for .md and .mdx”, Markdown-canonical storage, and bring-your-own-files/product-direction constraints
- **Drafted SPEC.md**
  - Added initial problem statement, goals, scope hypothesis, candidate solution families, decision log, open questions, and risks

### Pending (carried forward)
- Decide the desired degraded behavior for malformed/ambiguous MDX-like regions
- Decide whether `.md` and `.mdx` must continue sharing one parse contract
- Choose the implementation family for tolerant loading
