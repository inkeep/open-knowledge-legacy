---
title: Product File Model
description: Extracts the repo’s stated product/file-model contract relevant to markdown and MDX parsing behavior.
created: 2026-04-13
last-updated: 2026-04-13
---

## Findings

### Finding 1: The product direction is one editor for both `.md` and `.mdx`

**Confidence:** CONFIRMED

[`PROJECT.md`](../../../PROJECT.md) states:

- TQ3: “ONE WYSIWYG editor handles BOTH `.md` and `.mdx`.”
- S1: “One WYSIWYG editor ... handles both `.md` and `.mdx` files.”

[`ARCHITECTURE.md`](../../../ARCHITECTURE.md) similarly describes S1 as rich editing of `.md/.mdx`.

### Finding 2: The product is explicitly meant for user-owned Markdown files

**Confidence:** CONFIRMED

[`PROJECT.md`](../../../PROJECT.md) frames the product as:

- “a folder of `.md` files + Claude Code” replacement
- Markdown files in git as the substrate
- bring-your-own-agent and bring-your-own-files posture

[`ARCHITECTURE.md`](../../../ARCHITECTURE.md) describes the white-space bet as markdown-canonical, git-backed, open format, and portable.

### Finding 3: Storage fidelity promises favor tolerant handling over hard rejection

**Confidence:** CONFIRMED

[`AGENTS.md`](../../../AGENTS.md) states:

- “Storage never sanitizes; render-time layers do.”
- “Raw HTML, backslash escapes, and all literal characters pass through the storage layer unchanged.”

This is not a direct statement about malformed MDX, but it is strong evidence that the product posture is “preserve user-authored source” rather than “reject prose that conflicts with a strict grammar.”

### Finding 4: The markdown migration explicitly chose global `remark-mdx` to unlock MDX support

**Confidence:** CONFIRMED

[`specs/2026-04-12-remark-prosemirror-migration/SPEC.md`](../../2026-04-12-remark-prosemirror-migration/SPEC.md) locked:

- global `remark-mdx` in the main parse pipeline
- MDX as an explicit sprint goal
- no acceptance of `old: pass / new: fail` regressions introduced by the new parser

That spec already identified some MDX-everywhere regressions (`<https://...>`, `<br>`). The current `{ noServer: true }` and `1:1s` failures are in the same family.

## Implications

- Extension-gated `.md` vs `.mdx` parsing is not just an implementation choice; it changes the current product direction.
- “Strict MDX everywhere” is also in tension with the file-ownership and storage-fidelity posture.
- The design space should therefore center on tolerant Markdown-canonical loading while preserving supported MDX, not on choosing one extreme or the other.
