# Iframe embedding in MDX content for the Open Knowledge editor

**Date:** 2026-04-28
**Status:** Research complete — recommendation locked
**Branch context:** `cb-v2-md-foundation` (PR #310) just shipped lowercase canonical `img` / `video` / `audio` descriptors. This report decides how iframe joins them.

---

## Executive summary

**Register `iframe` as the 6th lowercase canonical descriptor.** Add `'iframe'` to `LOWERCASE_JSX_CANONICAL_TAGS` in `packages/core/src/markdown/autolink-void-html-guard.ts` and ship a corresponding `Iframe.tsx` renderer + `built-ins.ts` registration.

This decision is the lowest-friction option on every dimension we examined:

- **MDX parse path** — `remark-mdx` already parses `<iframe ... />` to `mdxJsxFlowElement` exactly the way it parses `<img />`. The parser makes no lowercase-vs-uppercase distinction. Adding iframe is one regex line + one descriptor entry.
- **Security model** — every major embed provider (YouTube, Loom, Vimeo, Spotify, Figma, CodeSandbox, StackBlitz) ships their copy-paste snippets without `sandbox` set. OK's render-side `mdast-to-html.ts` URL-scheme sanitizer already strips dangerous `src` schemes for iframe. No new defense is needed; expose `sandbox` as an advanced PropDef.
- **OSS docs-editor convention** — Mintlify, Fumadocs, Docusaurus, Nextra all expect raw lowercase `<iframe>` in MDX. Astro's per-provider component approach is more sophisticated but expensive to maintain; only Notion's Iframely-proxied approach moves further, and it requires cloud infrastructure OK doesn't have.
- **React intrinsic types** — `IframeHTMLAttributes` exposes 11 active props. The 1P precedent already established (lowercase descriptor names → camelCase translation at the JSX boundary) cleanly extends to iframe's `srcDoc` / `referrerPolicy` / `allowFullScreen`.
- **Embed providers** — all major providers work with self-closing JSX `<iframe ... />`. None require children. URL-sniffing is consistent across providers (scope deferred — see "Out of scope").
- **Autolink-eats-src bug** in `showcase/03-video.mdx:87` is the symptomatic confirmation that this design is needed. The bug is fully explained by iframe's absence from `LOWERCASE_JSX_CANONICAL_TAGS`; the proposed fix resolves it as a side effect.

The headline implementation cost is **~200 LoC** including descriptor, renderer, registry hookup, PUA-guard exemption, and tests. This is comparable to what `<video>` cost and reuses every primitive.

The dominant risk is paired-form `<iframe>...</iframe>` (which YouTube's own copy-paste snippet uses) staying autolink-corrupted under the proposed fix. Mitigation discussed in §6 — for v1 we ship self-closing-only and educate via showcase; the paired-form carve-out is a clean follow-up that doesn't require revisiting this decision.

---

## Why now (context)

The `cb-v2-md-foundation` branch just shipped three lowercase canonical media descriptors (`img`, `video`, `audio`) in `packages/core/src/registry/built-ins.ts`. Their PUA exemption lives in `LOWERCASE_JSX_CANONICAL_TAGS` (`autolink-void-html-guard.ts:88`).

`showcase/03-video.mdx` mentions iframe in its prose as the "Mintlify escape hatch for YouTube" — but the actual `<iframe ... />` block at lines 84-92 is broken in the working tree: the `src` attribute reads `src="[https://www.youtube.com/embed/...](https://www.youtube.com/embed/...)"`. That's CommonMark inline-link syntax inside an HTML attribute string. The browser rejects it.

The corruption surfaces a structural question that has to be answered before the branch lands: **what is OK's contract for iframe?** Four options were on the table:

1. Raw HTML passthrough (no descriptor, leave the autolink bug open)
2. Lowercase canonical descriptor (the recommendation)
3. Capitalized `<Embed>` wrapper component
4. URL-sniffing with provider allowlist

This research evaluated all four against six dimensions of the system. Option 2 is uniquely consistent with everything already shipped on `cb-v2-md-foundation`.

---

## Research rubric

| # | Dimension | Why it matters | Confidence |
|---|-----------|----------------|-----------|
| D1 | MDX parse path & PUA guard interaction | Settles whether `remark-mdx` even claims `<iframe>` correctly, and what the PUA guard has to learn | CONFIRMED |
| D2 | Security model (sandbox / allow / CSP) | Determines what the descriptor's defaults should be and whether new sanitizer logic is required | CONFIRMED |
| D3 | OSS docs-editor patterns | Calibrates the recommendation against what authors expect from comparable tools | CONFIRMED |
| D4 | React intrinsic types | Binds the descriptor PropDef shape to actual TypeScript surface | CONFIRMED |
| D5 | Embed provider URL shapes & requirements | Sanity-checks that the chosen primitive supports real-world usage | CONFIRMED |
| D6 | Autolink-eats-src bug trace | Diagnoses the visible bug on the branch and links it to the design decision | CONFIRMED |

Per-dimension evidence files: [`evidence/mdx-parse-path.md`](evidence/mdx-parse-path.md), [`evidence/security-model.md`](evidence/security-model.md), [`evidence/oss-editors.md`](evidence/oss-editors.md), [`evidence/react-types.md`](evidence/react-types.md), [`evidence/embed-providers.md`](evidence/embed-providers.md), [`evidence/autolink-bug.md`](evidence/autolink-bug.md).

---

## D1: MDX parse path & PUA guard interaction

### Findings

1. **`remark-mdx` makes NO lowercase-vs-uppercase distinction.** A raw `<iframe ... />` parsed without the PUA guard becomes `mdxJsxFlowElement` with `name: "iframe"` and an `attributes` array — structurally identical to `<Callout>` or `<MyComponent>`. The "lowercase = HTML, uppercase = component" distinction is OK's policy convention, encoded in `autolink-void-html-guard.ts`, not a parser behavior.
2. **Adding `'iframe'` to `LOWERCASE_JSX_CANONICAL_TAGS` is the structural fix.** Two carve-out sites in the guard (`:214-216` first pass, `:285-288` catch-all) both consult this Set; appending iframe satisfies both.
3. **Both carve-outs require self-closing JSX form** (`/>`). Bare `<iframe>...</iframe>` (HTML void-style paired form) stays PUA-guarded as plaintext — same as bare `<img>` does today.
4. **Boolean attrs (`allowFullScreen`) parse as `value: null`; semicolons inside string attrs (`allow="autoplay; encrypted-media"`) parse cleanly.** The existing `emitMdxJsx` serializer in `serialize-helpers.ts` already handles both. No new serialization work.
5. **`frameBorder` (camelCase) parses as the literal attribute name.** remark-mdx is case-sensitive on attribute names — what authors type byte-for-byte. The OK precedent (lowercase descriptor names → camelCase at the React JSX boundary) extends cleanly.
6. **No carve-out exists for paired close tags.** `</iframe>` falls under `HTML_CLOSE_TAG_RE` and gets PUA-guarded. Combined with finding 3, this means OK's supported authoring form is self-closing JSX `<iframe ... />`, not the YouTube-copy-paste paired form.

### Implication

Routing iframe to `mdxJsxFlowElement` is a one-line PUA-guard exemption + one descriptor registration. The hard part is **not** in the parse path. It's in the autolink-eats-src cascade described in D6 — and that cascade also resolves with the same one-line fix.

---

## D2: Security model

### Findings

1. **`sandbox` taxonomy is 14 tokens.** Empty `sandbox=""` applies all restrictions; absent `sandbox` attribute applies none. Authors mix-and-match `allow-*` tokens.
2. **`allow-scripts` + `allow-same-origin` voids the sandbox.** A document with both can `parent.frameElement.removeAttribute('sandbox')` from inside, taking effect on next navigation. This is the most common authoring mistake — and YouTube's own embed snippet implies this combination via `allow-same-origin`.
3. **`allow` and `sandbox` are different mechanisms.** `sandbox` restricts capabilities (default-deny); `allow` delegates Permissions Policy features. Real-world iframes mix both. There is no one-size-fits-all default.
4. **CSP `frame-ancestors` is the embedded page's defense, not the embedder's.** OK as embedder cares about `frame-src` in OK's own deployed CSP — a server/deployment concern, not a content-format concern.
5. **OK's render-side sanitizer already strips `javascript:` and other dangerous schemes from iframe `src`.** `packages/core/src/markdown/mdast-to-html.ts:74-101` lists `iframe` alongside `img`, `video`, `audio` etc. for URL-scheme rejection. The defense is already present — it just isn't invoked today because no descriptor maps to `<iframe>` in `HTML_PRIMITIVE_TAGS`.
6. **Today, an `<iframe>` JSX element renders as `<pre class="mdx-component">` source-code text** in the read-side renderer (the fallback for any element not in `HTML_PRIMITIVE_TAGS`). Adding iframe to that set activates the existing sanitizer chain for free.
7. **Industry default is no sandbox.** YouTube, Loom, Vimeo, Spotify, Figma, StackBlitz all ship their copy-paste snippets without `sandbox`. CodeSandbox is the only exception and ships a sandbox configuration that voids itself per finding 2.
8. **Sandbox-by-default would break every major embed.** Setting `sandbox="allow-scripts"` breaks YouTube (needs `allow-same-origin`); setting `sandbox="allow-scripts allow-same-origin"` is sandboxing-in-name-only.

### Recommendation

- **No default `sandbox`.** Matches every major provider snippet and the prevailing docs-platform pattern. Authors who want hardening opt in via the descriptor's PropPanel.
- **Expose `sandbox` as an advanced PropDef** with a doc note about the `allow-scripts + allow-same-origin` footgun.
- **Render path is already defended.** Adding iframe to `HTML_PRIMITIVE_TAGS` activates `rehypeSanitizeUrls` for it.
- **No URL allowlist at the descriptor level.** This is a deployment / CSP `frame-src` concern. Adding an allowlist locks the editor to a closed set of providers (currently anti-goal — OK is local-first / file-based / no cloud).

---

## D3: OSS docs-editor patterns

### Convergence table

| Platform | iframe surface | Companion wrapper | URL-sniffing | Sandbox default |
|----------|----------------|-------------------|--------------|-----------------|
| **Mintlify** | Raw `<iframe>` (paired-form, JSX-style attrs) | `<Frame caption="...">` | None | None |
| **Fumadocs** | Raw `<iframe>` via MDX raw-HTML | None | None | None |
| **Docusaurus** | Raw `<iframe>` (with style-as-JS-object) | None | None | None |
| **Nextra** | Raw `<iframe>` inside `<Bleed>` for full-bleed layout | `<Bleed full>` (layout-only) | None | None |
| **Astro Starlight** | Per-provider components via `astro-embed` package | Per-provider | Yes — `<YouTube id="...">` etc. | Per-component |
| **BlockNote** | **No iframe block** (only File/Image/Video/Audio) | n/a | n/a | n/a |
| **Notion** | Embed block via Iframely cloud proxy | Native UI | Yes (1900+ domains) | Per-domain |

### Patterns observed

1. **Raw iframe is the dominant primitive.** Four of seven (Mintlify, Fumadocs, Docusaurus, Nextra) treat iframe as raw HTML the author writes by hand. The lingua franca of MDX docs.
2. **The wrapper sits next to the primitive, not over it.** Mintlify's `Frame`, Nextra's `Bleed` — both are siblings in the component tree, not parents that sniff URLs. The primitive stays primitive; the wrapper adds platform-specific affordances around it.
3. **Sandbox by default would break the world.** No platform documents one. The expected stance is "trust the embed origin; iframe is a user choice".
4. **URL-sniffing is a separate concern.** When platforms do sniff (Astro, Notion), they ship a separate per-provider component or proxy through cloud infrastructure. They don't try to make the iframe primitive sniff.
5. **Caption is wrapper-territory, not primitive-territory.** Mintlify `Frame` holds caption; Astro YouTube has no caption; BlockNote video has caption on the block itself. Caption-on-primitive is a minority position.

### Implication

The dominant pattern is **lowercase-canonical raw iframe + sibling wrapper for affordances** — exactly the canonical/compat split that `cb-v2-md-foundation` just shipped for `img` / `video` / `audio`. Iframe joining the canonical set is the convergent answer.

---

## D4: React intrinsic types

### `IframeHTMLAttributes` (16 props, 5 deprecated)

Source: `node_modules/@types/react@19.2.14/index.d.ts:3140-3161`. Three diverge from HTML lowercase:

| OK descriptor (HTML lowercase) | React JSX (camelCase) | HTML attribute |
|-------------------------------|----------------------|---------------|
| `srcdoc` | `srcDoc` | `srcdoc` |
| `referrerpolicy` | `referrerPolicy` | `referrerpolicy` |
| `allowfullscreen` | `allowFullScreen` | `allowfullscreen` |

(Plus the 5 explicitly @deprecated camelCase fields: `frameBorder`, `marginHeight`, `marginWidth`, `scrolling`, `allowTransparency`. Out of scope for the descriptor.)

The 1P precedent (`built-ins.ts:120-152` JSDoc): descriptor PropDef `name` = HTML-spec lowercase; React component file translates to camelCase at the JSX boundary. Same translation pattern as `Video.tsx` already does for `autoplay → autoPlay` and `playsinline → playsInline`.

### Recommended PropDef shape

| Tier | PropDef name (lowercase) | type | required | notes |
|------|--------------------------|------|----------|-------|
| common | `src` | `string` | true | Embed URL. autoFocus on insert. |
| common | `title` | `string` | false | a11y label (MDN strongly recommends) |
| common | `width` | `number` | false | |
| common | `height` | `number` | false | |
| common | `allow` | `string` | false | Permissions Policy directives |
| advanced | `sandbox` | `string` | false | space-separated `allow-*` tokens |
| advanced | `referrerpolicy` | `enum` (9 values) | false | matches `HTMLAttributeReferrerPolicy` |
| advanced | `loading` | `enum` (`eager`/`lazy`) | false | |
| advanced | `name` | `string` | false | Targetable browsing-context name |
| advanced | `srcdoc` | `string` | false | Inline HTML override (rare) |
| advanced | `allowfullscreen` | `boolean` | false | Legacy but ubiquitous in real-world iframes |

Deprecated attributes intentionally omitted from the PropPanel surface. Anything authors paste with deprecated attrs still parses correctly and round-trips byte-identically through `mdxJsxFlowElement.attributes`; the descriptor just doesn't surface them in the PropPanel.

### Notable absences from `@types/react@19.2.14`

`csp` and `credentialless` are MDN-documented but not in the type. Authors who set them would need a cast at the JSX boundary. **Recommendation:** omit from the v1 descriptor; revisit when @types/react catches up.

---

## D5: Embed providers

### Provider × requirement matrix

| Provider | Sandbox needed? | Allow attrs | Self-closing OK? | URL-sniffable? |
|----------|----------------|-------------|------------------|----------------|
| YouTube | No | 6+ tokens | Yes | Yes (extract VIDEO_ID) |
| Loom | No | `encrypted-media *;` | Yes | Yes (replace `/share/` → `/embed/`) |
| Vimeo | No | 3 tokens | Yes | Yes |
| CodeSandbox | Self-voiding | 12 tokens | Yes | Yes |
| StackBlitz | No | (none) | Yes | Trivial (`?embed=1`) |
| Figma | No | (none) | Yes | Yes (host swap) |
| Spotify | No | 5 tokens | Yes | Yes (path insert) |
| Twitter / X | n/a (no iframe) | n/a | n/a | n/a |
| Google Maps | No | (none, but `referrerpolicy` yes) | Yes | Limited (API key) |
| OpenStreetMap | No | (none) | Yes | Yes (bbox compute) |

### Convergence

1. **No major provider needs sandbox to function.** CodeSandbox sets it but with a self-voiding configuration.
2. **`allow` varies WIDELY** — from empty (Figma, OSM) to 12 tokens (CodeSandbox). Hardcoding any default fails some providers. This validates the "no default sandbox/allow; authors configure per embed" recommendation.
3. **All providers (except X) work with self-closing JSX `<iframe ... />`.** None require children. Validates the carve-out's `/>` requirement.
4. **All providers are URL-sniffable** (except X). The transformation is "swap path segment" or "extract ID from URL". But each provider's regex is different; the cumulative cost is real.

### URL-sniffing cost estimate

~30 lines of regex per provider. Eight providers × 30 lines = ~240 lines, plus tests and a maintenance burden as URL formats drift. The cb-v2-video research already locked v1 to "no URL sniffing, no iframe emission" for the video descriptor; iframe was the safety valve. **Iframe v1 should also defer URL-sniffing.** The descriptor's PropDef shape supports later URL-sniffing additions cleanly (just add a paste-time canonicalizer that turns a YouTube watch URL into a complete iframe block).

---

## D6: Autolink-eats-src bug trace

### The observation

`showcase/03-video.mdx:84-92` (working tree, not committed):

```mdx
<iframe
width="560"
height="315"
src="[https://www.youtube.com/embed/dQw4w9WgXcQ](https://www.youtube.com/embed/dQw4w9WgXcQ)"
title="YouTube embed example"
frameBorder="0"
allow="autoplay; encrypted-media; picture-in-picture"
allowFullScreen
/>
```

The `src` value is `"[url](url)"` — CommonMark inline-link syntax inside an HTML attribute string. The browser rejects this as malformed.

### Reproduction (executable trace)

A scratch test fed `<iframe src="https://...embed/ID" />` through `protectFromMdx` + `remark-parse + remark-mdx + remark-gfm`. The MDAST output:

```
[
  {
    "type": "paragraph",
    "children": [
      { "type": "text", "value": "<iframe src=\"" },
      {
        "type": "link",
        "url": "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "children": [{ "type": "text", "value": "https://www.youtube.com/embed/dQw4w9WgXcQ" }]
      },
      { "type": "text", "value": "\" />" }
    ]
  }
]
```

remark-gfm's autolink-literal claimed the bare URL inside the attribute string and promoted it to a link node. When this round-trips through to-markdown, the link serializes as `[url](url)`.

### Root cause

`autolink-void-html-guard.ts:206-223` PUA-guards angle brackets of lowercase HTML tags but leaves the **interior of the tag** — including attribute-string contents — exposed to the next pipeline stage. Once `<` and `>` are PUA, nothing tells autolink-literal that the URL is "inside" anything.

`<img>`, `<video>`, `<audio>` don't have this bug because they're exempted from the PUA guard via `LOWERCASE_JSX_CANONICAL_TAGS` (line 88) — they pass through unchanged to remark-mdx, which claims the **whole tag** as a single mdx-jsx token. autolink-literal runs after tokenization, so attribute strings inside an mdx-jsx token are opaque to it.

### Why the showcase content has the bug despite the author writing a clean iframe

`git diff showcase/03-video.mdx` shows the iframe section was just authored in this working copy. The plausible path:

1. The author drafted the iframe with a normal `src="..."` URL.
2. The live preview pulled it through OK's parse + serialize loop.
3. autolink-literal claimed the URL; the link node serialized as `[url](url)`; the file watcher wrote the corrupted form back to disk.

The bug surfaces on every save once an author pastes any iframe with a URL `src`. The showcase content is the first artifact where it became visible — it reveals an editing-loop hazard that affects every iframe an OK user might author.

### Fix

Add `'iframe'` to `LOWERCASE_JSX_CANONICAL_TAGS` and ship a registered descriptor. One regex line + one descriptor entry. No new sentinel logic, no new escape pass.

### Caveat

Paired-form `<iframe>...</iframe>` stays guarded (the carve-out requires `/>`). Authors who copy-paste YouTube's "embed" snippet (which uses paired form) will get the same autolink-eats-src corruption. Mitigations:

- (a) Document self-closing JSX form in the showcase. Cheap.
- (b) Extend `LOWERCASE_JSX_CANONICAL_TAGS` to a paired-form exemption (more complex — paired flow-form claims children). Out of scope for v1.
- (c) Paste-time canonicalizer that converts paired iframe to self-closing. Out of scope for v1.

(a) covers the v1 ergonomic; (b) and (c) are clean follow-ups.

---

## Recommendation

Register `iframe` as the 6th lowercase canonical descriptor.

### Implementation sketch (~200 LoC)

1. **`packages/core/src/markdown/autolink-void-html-guard.ts:88`** — append `'iframe'` to `LOWERCASE_JSX_CANONICAL_TAGS`.
2. **`packages/core/src/markdown/mdast-to-html.ts:66`** — append `'iframe'` to `HTML_PRIMITIVE_TAGS`.
3. **`packages/core/src/registry/built-ins.ts`** — register `iframe` descriptor with the PropDef shape from D4 (11 props across common/advanced tiers; `src` required + autoFocus).
4. **`packages/app/src/editor/components/Iframe.tsx`** — new file. Mirror `Video.tsx` shape: receive lowercase descriptor props, translate `srcdoc → srcDoc`, `referrerpolicy → referrerPolicy`, `allowfullscreen → allowFullScreen` at the JSX boundary, render `<iframe>`.
5. **`packages/app/src/editor/extensions/IframePropPanel.tsx`** — new file. Mirror `VideoPropPanel.tsx` for the WYSIWYG configuration UI.
6. **Tests** —
   - `packages/core/src/markdown/autolink-void-html-guard.precision.test.ts` — extend I11 to cover iframe self-closing form.
   - `packages/core/src/markdown/iframe.fidelity.test.ts` — round-trip fidelity for typical YouTube / Loom / Figma snippets (self-closing JSX form).
   - Existing PBT invariants (I1-I10) cover by construction.
7. **Showcase update** — fix `showcase/03-video.mdx:87` to self-closing form; add `showcase/07-iframe.mdx` (or extend `06-unknown-components.mdx`) with YouTube + Loom + Figma examples in self-closing JSX form.

### Out of scope

- **Paired-form `<iframe>...</iframe>`** support. Document self-closing as the canonical OK form. NG-track for follow-up.
- **URL-sniffing per provider.** Authors paste an iframe; OK doesn't synthesize iframe from a YouTube URL. NG-track.
- **`csp` / `credentialless`** PropDefs. Wait for `@types/react` to add them. NG-track.
- **`<Frame>` wrapper component** for caption / hint / aspect-ratio. Lives at the canonical/compat boundary one layer up. Separate research; valid follow-up.
- **CSP `frame-src` deployment configuration.** Server-side concern.
- **`rehype-sanitize` upgrade** for full schema validation. Defense-in-depth follow-up; the bespoke `rehypeSanitizeUrls` is sufficient for v1.

### Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Authors copy-paste YouTube's paired-form iframe and see the same `[url](url)` corruption | Showcase docs the self-closing form prominently. Paired-form exemption is a clean follow-up. |
| Sandbox-as-string isn't validated; authors can write `sandbox="allow-banana"` | Match React's behavior — no validation. PropPanel doc lists valid tokens. Not a regression vs raw HTML. |
| `srcdoc` with `<` characters needs escaping | Out of scope (rare). PropDef accepts string; emitter quotes correctly. If authoring drift happens, add a fidelity test. |
| `csp`/`credentialless` users blocked at TypeScript | Document the gap in the descriptor JSDoc; revisit when @types/react updates. |
| The PUA-guard's lowercase-paired carve-out absence becomes confusing | Keep the inline doc accurate. The asymmetry is intentional — paired flow-form claims children, which iframe semantically doesn't have. |

### Why this beats the alternatives

| Option | Why it loses |
|--------|--------------|
| Raw HTML passthrough (no descriptor) | Doesn't fix the autolink-eats-src bug. Authoring loop stays broken. |
| Capitalized `<Embed>` wrapper | Inconsistent with `img` / `video` / `audio` shipped on the same branch. Authors would write `<Embed>` for iframe but `<img>` for image — a confusing split that would haunt every future media descriptor. |
| URL-sniffing with provider allowlist | Closes the editor to a fixed provider set, contradicts the "no cloud, no allowlist" 1P stance, and the implementation cost grows with every supported provider. NG-track for v1. |

---

## Confidence provenance

All findings labeled **CONFIRMED** in the per-dimension evidence files were code-verified or trace-verified during the 2026-04-28 research session:

- D1 / D6 — executable trace via `bun test` against the actual `protectFromMdx + remark-parse + remark-mdx + remark-gfm` pipeline.
- D2 — code-verified against `packages/core/src/markdown/mdast-to-html.ts:64-110`; security taxonomy from MDN + HTML Living Standard.
- D3 — public docs review (Mintlify, Fumadocs, Docusaurus, Nextra, Astro Starlight, BlockNote, Notion).
- D4 — code-verified against `node_modules/@types/react@19.2.14/index.d.ts:3140-3161` and `:3000-3010` (`HTMLAttributeReferrerPolicy`).
- D5 — provider-doc review (YouTube Player Parameters, Loom Atlassian Support, Vimeo, CodeSandbox, StackBlitz, Figma, Spotify, Google Maps, OpenStreetMap).
- D6 — `git blame -L 87,87 showcase/03-video.mdx` + executable trace.

## Gaps

1. **Inline-position iframe** (`text <iframe ... /> more text`). Trace evidence covers top-level (block) iframe → `mdxJsxFlowElement`. Inline iframe would parse as `mdxJsxTextElement`. The descriptor framework treats both uniformly, but no fidelity test exists. Adding one is trivial; deferred unless a real authoring case appears.
2. **Cross-provider real-world fidelity.** No empirical paste-test was run for YouTube/Loom/Figma/etc. through OK's full pipeline. The implementation should add a fidelity-corpus entry per provider before declaring v1 complete.
3. **`sandbox` token validation strategy.** This research recommends matching React (no validation). A future hardening pass could add render-time warnings for the `allow-scripts + allow-same-origin` footgun, but the descriptor framework doesn't have first-class support for cross-token validation. Deferred.

---

## Cross-references

- [`evidence/mdx-parse-path.md`](evidence/mdx-parse-path.md) — D1 raw findings + `bun test` trace
- [`evidence/security-model.md`](evidence/security-model.md) — D2 taxonomy + sanitizer audit
- [`evidence/oss-editors.md`](evidence/oss-editors.md) — D3 platform-by-platform pattern survey
- [`evidence/react-types.md`](evidence/react-types.md) — D4 `IframeHTMLAttributes` + recommended PropDef shape
- [`evidence/embed-providers.md`](evidence/embed-providers.md) — D5 provider-by-provider URL/snippet/requirement matrix
- [`evidence/autolink-bug.md`](evidence/autolink-bug.md) — D6 reproduction + root cause
- Related research: [`reports/cb-v2-video-superset-research/REPORT.md`](../cb-v2-video-superset-research/REPORT.md) (D-MF12: video v1 deferred URL-sniffing — iframe applies the same scope discipline)
- 1P spec home: a `specs/<datestamp>-iframe-canonical-descriptor/SPEC.md` would consume this report and translate it into FRs, ACs, and decision log. Not yet created.
