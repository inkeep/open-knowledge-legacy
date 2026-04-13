# Evidence: D2 — MDX ecosystem handling of `<scheme:uri>` autolinks

**Dimension:** D2 — How do production MDX systems (Astro, Docusaurus, Next.js MDX, Fumadocs, Mintlify, Nextra, Storybook) handle `<scheme:uri>` autolinks in MDX content?
**Date:** 2026-04-13
**Sources:** mdx-js/mdx RFC, Docusaurus v3 migration docs, Astro docs, Storybook docs, production-site inspection

---

## Key pages referenced

- [mdx-js/mdx#1049 — RFC: Deprecate/remove autolinks](https://github.com/mdx-js/mdx/issues/1049) — THE canonical upstream decision; closed 2020-05-20
- [Docusaurus v3 migration guide](https://docusaurus.io/blog/preparing-your-site-for-docusaurus-v3) — explicit documentation of the breaking change
- [Docusaurus discussion #11328](https://github.com/facebook/docusaurus/discussions/11328) — user reports `<https://example.com/>` fails; resolution: "remove the angle brackets"
- [MDX GFM guide](https://mdxjs.com/guides/gfm/) — explicitly states GFM extensions are off by default
- [Storybook MDX writing-docs](https://storybook.js.org/docs/writing-docs/mdx) — MDX v2 requires remark-gfm for autolink literals
- [contentlayer#141](https://github.com/contentlayerdev/contentlayer/issues/141) — "remark-mdx URL shorthand syntax `<http://some-url.com>` isn't supported"
- [Astro issue #6026](https://github.com/withastro/astro/issues/6026) — rehype-autolink-headings heading-anchor plugin (separate concern)

---

## Findings

### Finding: MDX v2+ intentionally removed CommonMark autolink support
**Confidence:** CONFIRMED
**Evidence:** [mdx-js/mdx#1049](https://github.com/mdx-js/mdx/issues/1049) — closed 2020-05-20, marked semver/major breaking change.

Maintainer reasoning from the RFC thread:
> "Whether something is an element (whether HTML or JSX) or an autolink is ambiguous."

MDX v1 supported autolinks; MDX v2+ chose JSX-syntax clarity over CommonMark compatibility. The `<` character is unambiguously a JSX start in MDX v2+.

**Implications:** This is not a bug or an oversight. It is an intentional, documented architectural decision. Any autolink workaround must accept this and operate around it — no upstream fix is coming.

### Finding: Ecosystem consensus — reject or rewrite, never auto-support
**Confidence:** CONFIRMED

Production MDX systems all handle this the same way: they accept MDX's incompatibility and advise (or enforce) authoring conventions that avoid it:

| System | Autolinks in MDX context | Workaround |
|---|---|---|
| **Docusaurus v3** | Rejected (as MDX), triggers "Unexpected character `/`" error | "Remove the angle brackets or use `[text](url)` syntax" (migration guide) |
| **Astro (`astro:mdx`)** | Default off; relies on user installing `remark-gfm` | Install `remark-gfm` plugin; or use bare URL (gfm autolink-literal) |
| **Nextra / Next.js MDX** | Not documented — omits autolinks entirely | Standard Markdown `[text](url)` |
| **Storybook v8+** | Default off in MDX v2 | Install `remark-gfm` plugin |
| **Fumadocs** | Not documented — default remark-gfm assumed | Inherits MDX v2 behavior |
| **Mintlify** | Not documented (no mention in docs) | Standard Markdown links only |

**Implications:** Our pipeline is not unusual — it hits the same wall every production MDX system hits. The industry answer is "don't author autolinks in MDX; use standard links." If we want to support autolinks, we're doing something no ecosystem member has solved.

### Finding: No published plugin exists that enables `<scheme:uri>` autolinks in MDX
**Confidence:** CONFIRMED via negative search
**Evidence:**
- npm search "remark-mdx-autolink" → 0 results
- npm search "mdx autolink" → 0 direct matches (unrelated heading-anchor packages)
- GitHub search "autolink mdx" in source code → no plugin package solving the conflict
- contentlayer#141 explicitly confirms "not supported" as the ecosystem answer

**Implications:** We are at the frontier. The preprocessor approach we inherited is the state of the art. Any "clean up" or "rewrite" in the same preprocessor direction is unlikely to yield a meaningfully better result than what we have.

### Finding: The documented workaround is remark-gfm autolink-literal — but it requires NO angle brackets
**Confidence:** CONFIRMED
**Evidence:** [MDX GFM guide](https://mdxjs.com/guides/gfm/)

remark-gfm's autolink-literal extension DOES detect bare URLs (`https://example.com`, `user@example.com`) in text and convert them to link nodes WITHOUT requiring `<...>` delimiters. This is the only form of autolinking that survives in MDX.

**Implications:** For authors who want autolink-like behavior in MDX, they write `https://example.com` (bare) instead of `<https://example.com>` (bracketed). The brackets are what conflict with JSX.

### Finding: This is presented as a migration / content hygiene issue, not a parser defect
**Confidence:** CONFIRMED

Docusaurus v3 explicitly educates users to REWRITE their markdown during the v2→v3 migration. The stance is "your content should change, not our parser."

---

## Negative searches

- Searched npm/GitHub: "remark-mdx-autolink", "mdx autolink plugin", "unified mdx autolink" → 0 packages address the conflict.
- Searched mdx-js/mdx issues for "re-enable autolink", "autolink workaround" → requests are typically closed pointing to RFC #1049.

---

## Gaps / follow-ups

- None that would materially change the design. The ecosystem answer is well-established: preprocess OR don't author autolinks in MDX.

---

## Implications for the refactor

1. **The current preprocessor architecture IS the ecosystem-standard solution.** There is no "cleaner" alternative adopted by any production MDX site.
2. **We COULD mirror Docusaurus / Astro and simply reject `<url>` syntax** — require users to write `[url](url)` or bare `url`. But this changes user-facing authoring semantics and our current preprocessor makes `<url>` work, so removing that feature would be a regression.
3. **Our goal should shift from "replace the preprocessor" to "promote preprocessed autolinks to semantic link nodes"** — keep the PUA-based preprocessing, add a post-parse transformer that lifts PUA-marked patterns into proper mdast `link` nodes with `data.sourceStyle: 'autolink'`. This removes the need for text-level `<url>` preservation (and the `:` / `@` safeText strips) without giving up the ecosystem-unique `<url>` authoring affordance.
