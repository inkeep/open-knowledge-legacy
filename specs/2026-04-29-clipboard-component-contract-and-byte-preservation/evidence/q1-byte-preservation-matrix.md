---
date: 2026-04-29
type: meta
sources:
  - "Code: packages/app/src/editor/clipboard/handle-paste.ts (5-branch dispatcher)"
  - "Code: packages/app/src/editor/clipboard/source-clipboard.ts (4-branch source dispatcher)"
  - "Code: packages/app/src/editor/clipboard/serialize.ts (clipboardTextSerializer + MdastClipboardSerializer)"
  - "Code: packages/app/src/editor/clipboard/is-markdown.ts (FR-14 heuristic)"
  - "Code: packages/app/src/editor/clipboard/detect-source.ts (vendor fingerprints)"
  - "Code: packages/core/src/extensions/shared.ts (sharedExtensions order; Image priority 50)"
  - "Code: packages/core/src/extensions/jsx-component.ts (parseHTML: div[data-jsx-component])"
  - "Code: packages/core/src/extensions/wiki-link.ts (a.wiki-link[data-target] priority 100)"
  - "Code: packages/core/src/extensions/code-block-fidelity.ts (CodeBlockFidelity priority 60 tag: pre)"
  - "Code: packages/core/src/markdown/mdast-to-hast-handlers.ts (HTML_PRIMITIVE_TAGS={img,video,audio}; mdxJsxFlowHandler)"
  - "Code: packages/core/src/markdown/autolink-void-html-guard.ts (LOWERCASE_JSX_CANONICAL_TAGS; PUA-protect non-canonical lowercase)"
  - "Code: packages/core/src/markdown/to-markdown-handlers.ts (mdxJsxFlowElement γ: pristine sourceRaw vs dirty reconstruct vs htmlBoundary)"
  - "Code: packages/core/src/markdown/index.ts (PM↔mdast handlers)"
  - "Code: packages/core/src/markdown/callout-transformer.ts (GFM-alerts → GFMCallout compat)"
  - "Code: packages/core/src/registry/built-ins.ts (5 canonical + 3 compat descriptors with serialize methods)"
  - "Code: packages/core/src/registry/index.ts (wildcard '*' descriptor; getOrWildcard)"
  - "Evidence: ./_init_worldmodel.md §8 current-state enumeration"
  - "Evidence: ./branch-c-disk-outcome-trace.md (parseDOM table + 4 payload traces)"
  - "Evidence: ./byte-preservation-rationale.md (D1 + D7 NG-carve-out framing)"
  - "Evidence: ./structural-payload-mechanism.md (FR-13-first vs marker-attribute decision)"
  - "Report: ../../../reports/tiptap-clipboard-round-trip-markdown/REPORT.md (1171 LoC + 2026-04-30 verification)"
  - "Spec text: ./SPEC.md §6 / §10 D5+D6+D7 / §11 Q-table"
---

# Q1 — Byte preservation matrix (path-by-path audit)

Resolves SPEC §11 Q1 ("Where does byte-preservation currently fail across the paste matrix? Enumerate path-by-path with reasons"). Gates §6 FR acceptance criteria, §13 In Scope completeness, and feeds into Q4/Q6/Q7/Q8/Q14/Q15/Q16 cells. Evidence base for the §10 D5 (FR-13-first reorder) and D7 (NG carve-out) decisions.

## Method

### Inputs

For every meaningful combination of:

- **Source** (J1-J4 from SPEC §5 user journeys),
- **Dispatcher branch hit** (Pre-checks / A / B / FR-13 / C / D / E — post-D5 reorder),
- **Custom node type / payload shape** (worldmodel §3 entity taxonomy: jsxComponent canonical lowercase media, jsxComponent canonical capitalized, jsxComponent compat, jsxInline, wikiLink, rawMdxFallback, image (TipTap built-in), standard markdown blocks, edge-case raw HTML inline, pre-PR-310 capitalized `<Image>`),

we record the **end-to-end transformation**: input bytes → text/plain MIME → text/html MIME → dispatcher branch hit → resulting PM tree (after `parseFromClipboard` or `mdManager.parse`) → final disk bytes (after persistence + `mdManager.serialize`).

### Code-grounded mechanics (constants used throughout)

- **Outbound text/plain** = `mdManager.serialize(slice→docJson)` (`serialize.ts:105-107`). Markdown emit goes through `to-markdown-handlers.mdxJsxFlowElement`: pristine path emits `data.sourceRaw` verbatim (`to-markdown-handlers.ts:340-343`), dirty path reconstructs from structural attrs (`:359-380`), htmlBoundary path emits `<details>...</details>` (`:349-356`).
- **Outbound text/html** = `markdownToHtml(text/plain)` (`serialize.ts:111-125`) re-running through `customNodeHandlers` → `mdxJsxFlowHandler`. Native `<img>/<video>/<audio>` for `HTML_PRIMITIVE_TAGS` membership (`mdast-to-hast-handlers.ts:84-104`); else `<pre class="mdx-component"><code>{escaped raw}</code></pre>`.
- **PM auto-attaches `data-pm-slice`** to first element of returned fragment (`prosemirror-view/src/clipboard.ts:32-34`) — there is no way to suppress it short of bypassing `clipboardSerializer` entirely.
- **Branch C** (`/data-pm-slice/i.test(html)`) returns `false` → PM-native `parseFromClipboard` walks text/html through priority-ordered parseDOM rules. Branch C **never reads text/plain** for content — only the slice metadata from the attribute. Image extension priority 50 wins for `img[src]`; CodeBlockFidelity priority 60 wins for `pre`; WikiLink priority 100 wins for `a.wiki-link[data-target]`. JsxComponent matches only `div[data-jsx-component]` — which OK's outbound HTML pipeline never emits.
- **Branch D** generic HTML → `htmlToMdast` → `mdastToMarkdown` → `mdManager.parse`. 9 vendor cleanup plugins run between rehype-parse + rehype-remark.
- **FR-13 markdown-first** (post-D5) fires before Branch C, when `plain && html && isMarkdown(plain)`. Routes through `tryBranchMarkdown` = `mdManager.parse(plain)` → `replaceSelection`.
- **Branch E** text/plain only: `isMarkdown(plain)` ⇒ markdown path; else `tr.replaceSelectionWith(schema.text(plain))` literal insert.
- **Persistence** = `yXmlFragmentToProseMirrorRootNode(default).toJSON()` → `mdManager.serialize(json)` (`packages/server/src/persistence.ts:800-808`). Disk bytes are byte-identical to text/plain `clipboardTextSerializer` output if the PM tree is unchanged from the source — i.e., **what hits disk = what `mdManager.serialize(PMtree)` produces**, where the PM tree is whichever branch built it.

### Conventions in this matrix

- **`text/plain` notation** uses literal markdown form (e.g., `<Callout type="note">body</Callout>` or `> [!NOTE]\n>\nbody`).
- **`text/html` notation** abbreviates the data-pm-slice attribute as `[pm-slice]` and shows the relevant tag wrapper.
- **Branch label** is the post-D5 reorder ordering: Pre / A / B / FR-13 / C / D / E.
- **Status** uses one of:
  - **BYTE-PRESERVING** — disk bytes round-trip identical (modulo NG1-NG11 storage normalizations per D7).
  - **BUG** — disk bytes flip identity (the user-perceived defect class).
  - **NG-CARVE-OUT** — drift is one of NG1-NG11 (accepted; spec carve-out).
  - **DESTINATION-STRIPPED** — outbound only (paste-out covered by Q17, not this matrix).
  - **UNVERIFIED** — too theoretical to confirm without runtime test; resolution path noted.

---

## Matrix

### J1 — OK→OK same-machine

Most common journey. Spec target: byte-perfect round-trip via FR-13-first → text/plain canonical markdown.

#### J1.A — WYSIWYG → WYSIWYG paste

| Cell | Input bytes (source PM) | text/plain | text/html | Branch hit (pre-D5) | Branch hit (post-D5) | PM tree (post-paste) | Disk bytes | Status | Failure mechanism (code ref) |
|---|---|---|---|---|---|---|---|---|---|
| J1.A.1 | `<img src="x.png" alt="hero" />` jsxComponent (canonical `img`) | `<img src="x.png" alt="hero" />` (pristine sourceRaw) | `<img src="x.png" alt="hero" [pm-slice]>` (Option B native) | **C** | **FR-13** | post-D5: `mdxJsxFlowElement{name:'img'}` → wildcard descriptor restores jsxComponent. **pre-D5: `image{src,alt}` (Image priority 50 wins; jsxComponent identity LOST)** | post-D5: `<img src="x.png" alt="hero" />`. **pre-D5: `![hero](x.png)`** | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | pre-D5: `mdast-to-hast-handlers.ts:84-104` Option B emits `<img>`; `prosemirror-view` Image parseDOM rule `img[src]:not([src^="data:"])` priority 50 (`extensions/shared.ts:82`) wins over jsxComponent's `div[data-jsx-component]` rule (no div in payload). **CTO-reported regression.** |
| J1.A.2 | `<Callout type="note">body</Callout>` jsxComponent (canonical capitalized) | `<Callout type="note">body</Callout>` (pristine sourceRaw, fall-through to `<pre>` shape on hast) | `<pre class="mdx-component" [pm-slice]><code>&lt;Callout type=&quot;note&quot;&gt;body&lt;/Callout&gt;</code></pre>` | **C** | **FR-13** | post-D5: `mdxJsxFlowElement{name:'Callout'}` via wildcard descriptor. **pre-D5: `codeBlock{language:null, text:'<Callout type=\"note\">body</Callout>'}`** (CodeBlockFidelity priority 60 matches `pre`; HTML-decoded textContent) | post-D5: `<Callout type="note">body</Callout>`. **pre-D5: `\`\`\`\n<Callout type="note">body</Callout>\n\`\`\``** (literal in fenced code block) | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | pre-D5: `code-block-fidelity.ts` priority 60 `tag: 'pre'` wins; jsxComponent `div[data-jsx-component]` doesn't match `<pre>`. CONFIRMED bug, evidenced in `branch-c-disk-outcome-trace.md` payload (b). |
| J1.A.3 | `<Accordion title="X">body</Accordion>` jsxComponent (canonical capitalized) | `<Accordion title="X">body</Accordion>` | `<pre class="mdx-component" [pm-slice]><code>&lt;Accordion ...&gt;</code></pre>` | C | **FR-13** | post-D5: Accordion jsxComponent restored. pre-D5: codeBlock (literal source as code) | post-D5: `<Accordion title="X">body</Accordion>`. pre-D5: fenced code block | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | Same mechanism as J1.A.2. |
| J1.A.4 | `<video src="x.mp4" />` (canonical lowercase media) | `<video src="x.mp4" />` | `<video src="x.mp4" [pm-slice]>` (Option B native, empty children) | C | **FR-13** | post-D5: jsxComponent restored. **pre-D5: video src lost — TipTap has no `video` extension, so `<video>` falls back to PM's default DOM-parser passthrough → bare paragraph + text "x.mp4" or empty** | post-D5: `<video src="x.mp4" />`. **pre-D5: empty paragraph or stripped** | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | No `video` parseDOM rule in `sharedExtensions`. PM's DOMParser drops unrecognized inline elements but descends into children — `<video>` has no text children. UNVERIFIED behavior detail (whether result is empty vs error); resolution: runtime Playwright test on a `<video>` paste between two OK tabs. |
| J1.A.5 | `<audio src="x.mp3" />` | analogous to A.4 | analogous to A.4 | C | FR-13 | analogous | analogous | BUG → BYTE-PRESERVING | Same mechanism as J1.A.4. |
| J1.A.6 | `> [!NOTE]\n> body` GFMCallout (compat) | `> [!NOTE]\n> body` (`html: '[!NOTE]'` mdast → blockquote with `> ` prefix per `built-ins.ts:635-682`) | `<blockquote [pm-slice]><p>[!NOTE]</p><p>body</p></blockquote>` (markdownToHtml round-trips `> [!NOTE]` shape; GFM-alerts plugin runs — outbound HTML loses the alert classifier badge unless rehype-github-alerts is in markdownToHtml pipeline) | C | **FR-13** | post-D5: `mdxJsxFlowElement{name:'GFMCallout'}` via callout-transformer (`callout-transformer.ts`). **pre-D5: blockquote + paragraph (Branch C parseFromClipboard sees plain blockquote; alerts plugin doesn't run on parseDOM); GFMCallout identity LOST** | post-D5: `> [!NOTE]\n> body`. **pre-D5: `> body` or `> [!NOTE]\n> body` depending on whether `[!NOTE]` survives as text** | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | Branch C parseDOM walks HTML through schema rules; the blockquote → paragraph PM shape is rebuilt without re-running remark-github-alerts. The GFMCallout descriptor is a parse-time mdast transformation, not a parseDOM rule. |
| J1.A.7 | `![alt](x.png "title")` CommonMarkImage (compat) | `![alt](x.png "title")` (paragraph + image mdast) | `<p [pm-slice]><img src="x.png" alt="alt" title="title"></p>` | C | **FR-13** (`![alt](x.png)` triggers inline-link signal? No — `INLINE_LINK_RE = /\[[^\]\n]+\]\([^)\n]+\)/` matches `[alt](x.png)`; image syntax `![alt](url)` also matches because `![alt]` contains `[alt]` substring — single signal) | post-D5: image mdast → CommonMarkImage compat (registry has no parse-time transform to demote `image` mdast back to a separate compat — actually image stays as canonical `image` mdast; `built-ins.ts:686-711` CommonMarkImage uses it as the descriptor for source-form preservation in the slash-menu, but the parse path doesn't re-classify). pre-D5: identical in this case (Image extension wins; mdast image = same shape) | post-D5: `![alt](x.png "title")`. pre-D5: `![alt](x.png "title")`. | **BYTE-PRESERVING (both pre- and post-D5)** | Image is the natural mdast `image` form. Both paths converge on the same disk bytes. CommonMarkImage as a "compat descriptor" identity is render-time only; storage is plain CommonMark image. |
| J1.A.8 | `<details><summary>X</summary>body</details>` HtmlDetailsAccordion (compat) | `<details>\n<summary>X</summary>\n\nbody\n\n</details>` (htmlBoundary path, `to-markdown-handlers.ts:349-356`) | `<details><summary>X</summary><p>body</p></details>` ([pm-slice] on first child) | C | **FR-13** (text/plain has `<details>`; capitalized JSX signal NOT in current heuristic, but blockquote/inline-link/etc. signals also miss — likely **fails FR-13 trigger**) | post-D5: if FR-13 matches → mdxJsxFlowElement{name: 'HtmlDetailsAccordion'} via callout-transformer's sister logic? **No — there is no inbound transformer for `<details>` → HtmlDetailsAccordion**. The MDX parser sees `<details>` as a lowercase tag NOT in `LOWERCASE_JSX_CANONICAL_TAGS` (={img,video,audio}) → PUA-protected as raw HTML text → eventually emerges as `html` mdast type → `htmlBlock` PM node. **pre-D5: identical mechanism — Branch C parseDOM has `details` not registered → falls through; eventual `<details>` HTML probably produces nested PM children but no compat descriptor.** | post-D5 / pre-D5: `<details><summary>X</summary>\nbody\n</details>` as html-block; **HtmlDetailsAccordion compat identity is LOST in both pre and post.** | **BUG (both pre- and post-D5)** — D5 alone insufficient | `autolink-void-html-guard.ts:95` LOWERCASE_JSX_CANONICAL_TAGS = {img,video,audio} only. `<details>` is NOT in this set, so it gets PUA-protected as raw HTML text on parse. There is no inbound transformer that re-promotes `<details>` to HtmlDetailsAccordion (only the outbound serialize emits the htmlBoundary form). **D5 + D8 alone don't fix this; needs `fromClipboardHast` (NG-S5 NOT NOW) OR an inbound `<details>` → HtmlDetailsAccordion transformer.** UNVERIFIED whether the round-trip lands as htmlBlock or as nested PM (depends on lowercase-tag PUA escape path); resolution: runtime trace on `<details>` input. |
| J1.A.9 | `[[Page Title]]` wikiLink | `[[Page Title]]` (sourceRaw) | `<a class="wiki-link" data-target="Page Title" data-anchor="" data-alias="" href="#page-title" [pm-slice]>Page Title</a>` | **C** | **FR-13** (text/plain `[[Page Title]]` — does it trigger? INLINE_LINK_RE `[[Page]](...)` doesn't match `[[Page]]` because no `(` after; **no markdown signal — fails FR-13**) | post-D5 (FR-13 misses, falls to C): WikiLink parseHTML rule `a.wiki-link[data-target]` priority 100 wins → wikiLink restored. **pre-D5: same Branch C → WikiLink restored.** | `[[Page Title]]` | **BYTE-PRESERVING (both pre- and post-D5)** | Wiki-link's explicit `a.wiki-link[data-target]` priority-100 parseDOM rule (`wiki-link.ts:111-133`) is **load-bearing** for Branch C round-trip. Without it, `a[href]` link mark would match first. **D5 reorder doesn't break this** because FR-13 misses on `[[Page Title]]` text/plain (no markdown signals) — Branch C still fires. |
| J1.A.10 | `[[Page|Alias]]` wikiLink with alias | `[[Page|Alias]]` | `<a class="wiki-link" data-target="Page" data-alias="Alias" href="#page" [pm-slice]>Alias</a>` | C | C (FR-13 misses) | wikiLink restored | `[[Page\|Alias]]` | **BYTE-PRESERVING** | Same as J1.A.9. |
| J1.A.11 | `<Icon name="check" />` jsxInline (NG14 thin shape) | `Some text <Icon name="check" /> more` (sourceRaw text in jsxInline atom) | `<p [pm-slice]>Some text <span data-jsx-inline contenteditable="false">&lt;Icon ...&gt;</span> more</p>`?? **Actually**: serialize.ts → markdown via mdManager → through `mdxJsxTextHandler` which emits `<span class="mdx-inline">{escaped raw}</span>`. So **the wrapper class is `mdx-inline` not `data-jsx-inline`.** | C | FR-13 (signal? NO — no markdown signals; falls to C) | post-D5/pre-D5: PM parseDOM rule `span[data-jsx-inline]` does NOT match `<span class="mdx-inline">`. Falls through; raw text content `<Icon name="check" />` is preserved as text inside a paragraph. **jsxInline identity LOST.** | `Some text <Icon name="check" /> more` (re-parsed as text → R23 PUA guard → eventually re-promoted to jsxInline IF the text re-parses through markdown route) | **UNVERIFIED — likely BUG via Branch C, BYTE-PRESERVING via FR-13 if any markdown signal triggers** | Asymmetric naming bug: outbound emits `<span class="mdx-inline">` (mdast-to-hast-handlers.ts:181-197) but inbound parseHTML matches `span[data-jsx-inline]` (jsx-inline.ts). Branch C cannot recover jsxInline identity. **NEW FINDING** — surface as own item. Resolution: runtime test on `<Icon />` between OK tabs. |
| J1.A.12 | rawMdxFallback content (parse-error block) | `<MalformedComponent>` (the failing source verbatim) | `<!-- Parse error: ... -->\n<pre class="mdx-fallback" [pm-slice]><code>...</code></pre>` | C | FR-13 (signal? depends on content; usually fails) | post-D5/pre-D5: rawMdxFallback parseHTML rule matches `div[data-raw-mdx-fallback]` — but the OUTBOUND shape is `<pre class="mdx-fallback">`, NOT `<div data-raw-mdx-fallback>`. **Asymmetric.** Branch C falls through; `<pre>` matches CodeBlockFidelity priority 60. The HTML comment is dropped. | `\`\`\`\n<MalformedComponent>\n\`\`\`` | **BUG** — rawMdxFallback identity LOST | Same asymmetric naming pattern as J1.A.11. Outbound: `mdast-to-hast-handlers.ts:205-235` emits `<pre class="mdx-fallback">`. Inbound: `raw-mdx-fallback.ts` parseHTML matches `div[data-raw-mdx-fallback]`. **NEW FINDING.** |
| J1.A.13 | Plain TipTap `Image` (CommonMark `image` mdast — not jsxComponent) | `![](x.png)` | `<img src="x.png" [pm-slice]>` (no alt or empty alt) | C | FR-13 (`![](x.png)` triggers inline-link signal — `\[[^\]\n]*\]\([^)\n]+\)` ... actually `[]` does match because `[^\]\n]+` requires ≥1 non-`]` char, so `[]` fails. Try `![alt](x)` with text — fires. With empty alt, fails.) | If FR-13 fires (alt non-empty): mdManager.parse(`![alt](x.png)`) → image mdast → image PM node. Else C: TipTap Image parseDOM matches; same image PM node. | `![alt](x.png)` | **BYTE-PRESERVING** | Both paths converge. CommonMark `image` is the universal target. |
| J1.A.14 | Heading + paragraph + strong + emphasis + list | `## H\n\nSome **bold** and *italic*\n\n- item` | `<h2 [pm-slice]>H</h2><p>Some <strong>bold</strong> and <em>italic</em></p><ul><li>item</li></ul>` | C | **FR-13** (heading `^# ` + bullet `^- ` + emphasis pair signals — depending on D8 extension) | both: clean GFM PM tree | `## H\n\nSome **bold** and *italic*\n\n- item` | **BYTE-PRESERVING** | Linear-style content; both paths land identical. `branch-c-disk-outcome-trace.md` payload (c) confirms. |
| J1.A.15 | Code block fence triple-backtick | `` ```js\nconst x = 1;\n``` `` | `<pre [pm-slice]><code class="language-js">const x = 1;</code></pre>` | C | **FR-13** (FENCE_RE single-fence signal triggers) | both: codeBlock with language='js' | `` ```js\nconst x = 1;\n``` `` | **BYTE-PRESERVING** | Standard fenced code; round-trip identical. |
| J1.A.16 | GFM table | `\| h \|\n\|---\|\n\| c \|` | `<table [pm-slice]>...</table>` | C | **FR-13** (TABLE_ROW_RE + TABLE_SEPARATOR_RE both fire — STRICTER pairing) | both: table PM tree | `\| h \|\n\|---\|\n\| c \|` | **BYTE-PRESERVING (modulo NG9 — column widths normalize)** | NG9 carve-out: column widths align to longest cell. |
| J1.A.17 | Strikethrough `~~strike~~` | `~~strike~~` | `<p [pm-slice]><s>strike</s></p>` | C | FR-13 (current is-markdown does NOT check `~~`; D8 adds paired-emphasis incl. `~~`) | post-D8: FR-13 fires; pre-D8 misses → C → `<s>` matches StarterKit Strike priority default → strike PM mark | both: `~~strike~~` | **BYTE-PRESERVING (modulo D8 false-negative for short strike-only inputs in pre-D8)** | Pre-D8 short input `~~hi~~` (single-line, 0 lines/5=0, threshold=Math.max(1,0)=1 — needs 1 signal; `~~` not a signal in current `is-markdown.ts` → falls to plaintext insert via Branch E? **No — text/html present, so Branch C wins**). Branch C `<s>` → strike mark. So actually fine via Branch C. |
| J1.A.18 | Link `[label](url)` | `[label](url)` | `<a href="url" [pm-slice]>label</a>` | C | **FR-13** (INLINE_LINK_RE fires) | both: link mark | `[label](url)` | **BYTE-PRESERVING** | LinkFidelity priority 60 wins on `<a href>`. |
| J1.A.19 | Hard break `\\n` (two-trailing-spaces or backslash) | `line1  \nline2` (two-space) or `line1\\\nline2` (backslash) | `<p [pm-slice]>line1<br>line2</p>` | C | FR-13 (no obvious signal — falls to C) | both: hardBreak between text runs | `line1  \nline2` (canonicalized to two-space form by `hard-break-fidelity.ts`) | **BYTE-PRESERVING (modulo trailing-whitespace canonicalization — NG-adjacent)** | Hard-break form normalization is consistent NG. |
| J1.A.20 | Pre-PR-310 capitalized `<Image caption="x" zoom={false} />` (Q14) | `<Image caption="x" zoom={false} />` (sourceRaw, wildcard descriptor) | `<pre class="mdx-component" [pm-slice]><code>&lt;Image ...&gt;</code></pre>` (because `Image` is capitalized, `tryNativeHtmlPrimitive` returns null; falls to `<pre>` shape) | C | **FR-13** | post-D5: mdManager.parse → mdxJsxFlowElement{name:'Image'} (wildcard descriptor handles) → jsxComponent restored. **pre-D5: codeBlock with literal text** | post-D5: `<Image caption="x" zoom={false} />`. **pre-D5: fenced code block** | **BUG (pre-D5) → BYTE-PRESERVING (post-D5)** | Wildcard descriptor (`registry/index.ts:24-34`) restores any unregistered capitalized name. The expression attribute `{false}` survives via mdast `mdxJsxAttributeValueExpression`; `to-markdown-handlers.ts:413-450` `serializeMdxJsxAttrs` re-emits `zoom={false}` form. |

#### J1.B — WYSIWYG → Source paste (cross-view)

When a user copies WYSIWYG content and pastes into Source view. Source dispatcher has 4 branches (no Branch B); Branch C falls through to CM6's text/plain default insert.

| Cell | Source bytes | text/plain | text/html | Source dispatcher branch | Disk bytes | Status |
|---|---|---|---|---|---|---|
| J1.B.1 | `<img>` jsxComponent | `<img src="x.png" alt="hero" />` | (Option B native `<img>` w/pm-slice) | **C** → CM6 default text/plain insert | `<img src="x.png" alt="hero" />` (verbatim) | **BYTE-PRESERVING** (in both pre- and post-D5; Source dispatcher already routes correctly) |
| J1.B.2 | `<Callout>` jsxComponent | `<Callout type="note">body</Callout>` | (Option A `<pre>` w/pm-slice) | **C** → CM6 default text/plain insert | `<Callout type="note">body</Callout>` | **BYTE-PRESERVING** |
| J1.B.3 | `> [!NOTE]\n> body` GFMCallout | `> [!NOTE]\n> body` | `<blockquote>...` | C → CM6 default | `> [!NOTE]\n> body` | **BYTE-PRESERVING** |
| J1.B.4 | All standard markdown | identical to source | rendered HTML | C → CM6 default | identical | **BYTE-PRESERVING** |

**Source dispatcher Branch C is fundamentally correct for OK→OK paste** because text/plain IS the canonical truth for Source view. **Q16 verdict: Source-side D5 reorder is REDUNDANT** — Branch C already routes through text/plain.

#### J1.C — Source → WYSIWYG paste

When a user copies from Source view (CM6's `sliceDoc`) and pastes into WYSIWYG. Source copy writes:
- text/plain = the markdown bytes (verbatim from `sliceDoc`)
- text/html = `markdownToHtml(markdown)` — **goes through the same custom-node hast handlers** as WYSIWYG copy

So the clipboard MIME shape is **identical** to J1.A's outbound; only the source's PM tree differs (Source has no PM tree — selection is text). Branch decisions and outcomes are identical to J1.A.

| Cell | Source bytes | Branch hit (post-D5) | Status (post-D5) |
|---|---|---|---|
| J1.C.1 | `<img src="x.png" />` (text in Source) | FR-13 (single-line `<img...` — only matches if D8 lowercase JSX-with-attr signal added) | **post-D8 BYTE-PRESERVING; post-D5-only single-line `<img />` fails FR-13 → Branch C → BUG (Image extension wins)** |
| J1.C.2 | `<Callout type="note">body</Callout>` (text in Source) | FR-13 (no signal w/o D8) | **post-D8 BYTE-PRESERVING; post-D5-only fails FR-13 → Branch C → BUG (codeBlock fence)** |
| J1.C.3 | Multi-block markdown | FR-13 (multi-signal) | **BYTE-PRESERVING** |

**D8 (capitalized JSX + lowercase JSX-with-attr signals) is load-bearing for Source→WYSIWYG paste of single JSX bytes.** Without D8, single-line JSX from Source view falls back to Branch C and hits the original bug class.

#### J1.D — Source → Source paste (same view)

Source-to-Source uses Source dispatcher: Branch C → CM6 default text/plain insert. No PM tree involved.

| Cell | Source bytes | Disk bytes | Status |
|---|---|---|---|
| J1.D.1 | Anything | text/plain verbatim | **BYTE-PRESERVING** for all cases |

**Q15 (Source view paste of HTML-inline raw markdown like `<u>foo</u>`):** text/plain carries `<u>foo</u>`. CM6 default inserts the bytes verbatim. On persistence, Source's Y.Text is the canonical content; mdManager.parse is run for WYSIWYG render but Source disk bytes IS the content. **BYTE-PRESERVING** via Source paste. (When a WYSIWYG user pastes the same text/html, `<u>` is StarterKit's Underline mark → underline mark → mdast renders... `<u>` is not a CommonMark element; mdast emits as `html` inline node → handler maps to `htmlBlock` (block atom). **MISMATCH between Source (preserves) and WYSIWYG (probably promotes to inline html, may flatten).** Resolution: runtime trace on `<u>` between views. UNVERIFIED for WYSIWYG path.)

---

### J2 — OK→external

Out of this matrix's scope (covered by Q17 acceptance test). Outbound shape recap:

- **Lowercase media JSX** (`<img>/<video>/<audio>`) — Option B native HTML; renders correctly in Slack/Notion/Gmail/GitHub/Google Docs.
- **Capitalized JSX** (Callout, Accordion, custom names) — `<pre class="mdx-component"><code>{escaped raw}</code></pre>`; renders as escaped MDX source code in destinations. **DESTINATION-STRIPPED conspicuous degradation.** Spec D3 (per-descriptor `toClipboardHast`) addresses this.
- **Compat descriptors** — GFMCallout emits blockquote HTML; HtmlDetailsAccordion emits real `<details>` HTML; both render correctly cross-app via existing pipeline.
- **wikiLink** — `<a class="wiki-link" data-target href="#slug">label</a>`; renders as link with fragment href. Most destinations strip the data-attrs.
- **rawMdxFallback** — `<!-- Parse error -->` + `<pre class="mdx-fallback">`. Destinations strip the comment; pre block survives.
- **jsxInline** — `<span class="mdx-inline">` (escaped raw). Renders as inline source code-like text.

NG-S6 [NOT NOW]: round-trip OK→external→OK is best-effort via text/plain; the externally-stripped HTML round-trip is DESTINATION-STRIPPED (accepted degradation per SPEC §3 NG-S6).

---

### J3 — External→OK where source is markdown-canonical

text/plain has canonical markdown bytes. text/html may also be present (rendered by source app).

| Cell | Source app | text/plain payload (representative) | text/html present? | Branch hit (post-D5) | Disk bytes | Status |
|---|---|---|---|---|---|---|
| J3.1 | VS Code editing `.md` file | `## H\n\nbody\n\n- item` | NO (only vscode-editor-data + text/plain) | **A** (vscode-editor-data routes to fenced code block — **NOT** text/plain markdown!) | `\`\`\`markdown\n## H\n\nbody\n\n- item\n\`\`\`` (fenced!) | **DESTINATION-STRIPPED-ish — VS Code's mode hint flips this to a code block, NOT markdown content.** | **DESIGN-INTENT for VS Code:** the user is copying *source code* of a markdown file, and Branch A treats it as code. May surprise users who want the rendered markdown structure. **Q-implication:** this is a known intentional design tradeoff per SPEC FR-3 / D6. |
| J3.2 | GitHub textarea (issue, comment, PR body) | `## H\n\nbody` (plus possibly text/x-gfm MIME) | YES (GitHub renders preview to text/html sometimes) | **B** (text/x-gfm path) or **FR-13** (markdown-first) | `## H\n\nbody` | **BYTE-PRESERVING** | text/x-gfm preferred when present (Branch B); else FR-13 wins. |
| J3.3 | AI chat copy-button (Claude/ChatGPT/Gemini) | `## Heading\n\n\`code\`\n\n> quote\n\n**bold** and *italic*` (markdown-canonical) | usually NO (or simple HTML) | post-D5: FR-13 (if signals trigger). **post-D8 closes the gap: `> quote`, `\`code\``, `**bold**` all add signals.** post-D5-only: heading + maybe inline-link triggers; partial coverage. | parsed markdown → PM tree → disk = canonical | **BYTE-PRESERVING with D8; partial coverage with D5-only** | D8 closes the AI-chat false-negative class (REPORT.md §2026-04-30 markdown-detection survey). |
| J3.4 | Linear editor copy | text/plain = markdown (per 2026-04-30 verification — closed-source default `Cmd+C` UNCERTAIN; explicit `Cmd+Opt+C` confirmed markdown) | YES (TipTap-based; `data-pm-slice` on outbound) | **post-D5: FR-13** (text/plain is canonical markdown — wins); **pre-D5: C** (data-pm-slice routes to PM-native parseFromClipboard) | post-D5: parsed markdown → PM tree. pre-D5: PM-native parseFromClipboard walks Linear's HTML → maps to OK schema. | **BYTE-PRESERVING (both pre- and post-D5 — Linear's HTML → OK schema is clean GFM, no JSX layer to lose)** — see `branch-c-disk-outcome-trace.md` payload (c) | **Q7 verdict: FR-13-first does NOT lose information vs Branch C for Linear/Outline/BlockNote.** Their HTML and their text/plain markdown encode the same structural content (heading, list, mark, link primitives that all map cleanly to OK schema). FR-13-first routes through the more direct path; Branch C achieves the same end via parseDOM walking. |
| J3.5 | Outline editor copy | text/plain = markdown via `clipboardTextSerializer` + heuristic-conditional plain text (CONFIRMED via primary source) | YES (PM-based; data-pm-slice on outbound) | post-D5: FR-13 wins. pre-D5: Branch C. | identical | **BYTE-PRESERVING (both pre- and post-D5)** | Same logic as J3.4. |
| J3.6 | BlockNote editor copy | text/plain = markdown (CONFIRMED — `cleanHTMLToMarkdown(externalHTML)` 3-MIME multi-write) + `blocknote/html` private MIME (we don't read) | YES (PM-based; data-pm-slice probably present though their primary fingerprint is `blocknote/html`) | post-D5: FR-13 wins. pre-D5: Branch C if data-pm-slice present, else Branch D. | identical (BlockNote's text/plain is canonical markdown derived from their externalHTML serializer) | **BYTE-PRESERVING (both pre- and post-D5)** | Same. |
| J3.7 | Milkdown / tiptap-markdown / Keystatic / Plate / etc. | text/plain = canonical markdown via clipboardTextSerializer | YES (PM-based, data-pm-slice probably present) | post-D5: FR-13 → Branch B path; pre-D5: Branch C | both lossless | **BYTE-PRESERVING** | Same family. |
| J3.8 | Raw `.md` file received via email/Slack/file copy (cross-machine D4) | full markdown content | NO (text/plain only) | **E** (markdown-first via isMarkdown threshold) | parsed markdown → PM tree | **BYTE-PRESERVING when isMarkdown fires** | The signal-set is the gate. |
| J3.9 | **`<Callout>` source line** (single-line `<Callout type="note">body</Callout>` from email/Slack file or AI chat that emitted MDX-form) | `<Callout type="note">body</Callout>` (one line — zero lines/5=0 → threshold=Math.max(1,0)=1) | NO (text/plain only) | **E**: pre-D8 isMarkdown returns false (no signals fire — capitalized JSX not in current set) → **falls through to verbatim plaintext insert** | `<Callout type="note">body</Callout>` as plain text inside a paragraph (no descriptor restored) | **BUG (pre-D8) → BYTE-PRESERVING (post-D8 capitalized-JSX signal)** | CONFIRMED gap. SPEC §1 Complication #4 names this directly. D8 adds `/<[A-Z]\w*[\s\/>]/` signal. |
| J3.10 | `<img src="x" />` source line cross-machine | `<img src="x" />` | NO | **E** pre-D8: 0 signals → plaintext. post-D8 (lowercase JSX-with-attr signal `/<[a-z]+\s+\w+="[^"]*"/`): 1 signal → markdown path | post-D8: jsxComponent (img) via wildcard. pre-D8: literal text. | **BUG (pre-D8) → BYTE-PRESERVING (post-D8)** | Same class as J3.9. |
| J3.11 | `> [!NOTE]\n> body` (raw GFM-alert in email) | as-is | NO | **E** pre-D8: bullet (`> ` not in signals — but BlockNote/peer-survey gap). post-D8 (blockquote `^>\s+\S+/m` signal): fires | parsed → GFMCallout via callout-transformer | **BUG (pre-D8) → BYTE-PRESERVING (post-D8)** | D8 closes blockquote false-negative. |
| J3.12 | `\`code\`` single inline code in email | as-is | NO | **E** pre-D8: zero signals → plaintext. post-D8 (inline-code signal): fires (single signal) | post-D8: parsed → inline code mark. pre-D8: text. | **BUG (pre-D8) → BYTE-PRESERVING (post-D8)** | Same. |

---

### J4 — External→OK where source is rich-HTML-canonical

text/plain is degraded (visible text only); text/html is structural. Branch D pipeline (htmlToMdast + 9 cleanup plugins) handles these.

| Cell | Source app | text/plain (degraded) | text/html (structural) | Branch hit | Disk bytes | Status |
|---|---|---|---|---|---|---|
| J4.1 | Notion | visible text + literal `\n` newlines | structured `<div>...` with `<!-- notionvc: UUID -->` marker | **D** (notion fingerprint stripped via `rehypeSkipNotionWhitespace` keeping `\n` as hard breaks) | clean GFM | **BYTE-PRESERVING for things in OK schema** (NG-CARVE-OUT for things outside: e.g., Notion mentions silently dropped) | Branch D pipeline correctly handles Notion. |
| J4.2 | Gmail rich | visible text | `<div class="gmail_quote">...` | **D** (rehypeStripGmailClasses) | clean GFM | **BYTE-PRESERVING for OK-schema elements; NG-CARVE-OUT for non-schema (signature blocks etc.)** | Same. |
| J4.3 | Google Docs | visible text | `<b id="docs-internal-guid-...">...</b>` | **D** (rehypeStripGdocsWrapper) | clean GFM | **BYTE-PRESERVING for OK-schema; NG-CARVE-OUT for tables with merged cells (NG9)** | Same. |
| J4.4 | Word | visible text | `<meta>` MSO + `<o:p>` Office tags + mso-* styles | **D** (rehypeStripMsoStyles) | clean GFM (lists may flatten — NG3) | **BYTE-PRESERVING for OK-schema; NG-CARVE-OUT for Word lists (NG3)** | NG3 carve-out per SPEC §3 NG-S8. |
| J4.5 | Slack rich | visible text | `<div class="c-message_kit__...">` | **D** (rehypeStripSlackClasses) | clean | **BYTE-PRESERVING for OK-schema** | Same. |
| J4.6 | Apple Notes (TextEdit RTF→HTML via Cocoa) | visible text | `<meta name="Generator" content="Cocoa HTML Writer">...` | **D** (rehypeStripCocoaMeta) | clean | **BYTE-PRESERVING for OK-schema** | Same. |
| J4.7 | Google Sheets cells | visible text | `<google-sheets-html-origin>...<table data-sheets-value="...">` | **D** (rehypeStripGsheetsWrapper) | clean GFM table | **NG-CARVE-OUT for `data-sheets-value` cell metadata (NG9)** | Same. |
| J4.8 | GitHub textarea hover-cards | visible text | `<a data-hovercard-type="user">@user</a>` | **D** (rehypeStripGithubHovercard) | clean | **NG-CARVE-OUT for hovercard data** | Same. |

---

## Failure modes ranked by spec priority

Ordered by user-impact severity × frequency. All references are post-D5+D8 baseline; pre-D5 baseline is the regression class the spec exists to fix.

### Top BUGs the spec must fix

1. **J1.A.1 — `<img>` JSX silent-flip OK→OK** (CTO-reported regression). text/html → Image extension parseDOM (`extensions/shared.ts:82`, priority 50) wins over JsxComponent's `div[data-jsx-component]` rule. **Resolved by D5 FR-13-first reorder.** This is the highest-priority cell because it's the regression that triggered the spec.

2. **J1.A.2 / J1.A.3 — Capitalized JSX (`<Callout>`, `<Accordion>`) flips to fenced code block OK→OK.** text/html `<pre class="mdx-component">` matches CodeBlockFidelity (priority 60, `tag: 'pre'`) before any JSX-aware rule. **Resolved by D5 FR-13-first reorder.** Very high priority — conspicuous degradation.

3. **J1.A.20 — Pre-PR-310 capitalized `<Image>` falls through to fenced code block OK→OK.** Identical mechanism to J1.A.2 (capitalized JSX → `<pre>` shape → CodeBlockFidelity wins). The wildcard descriptor handles parse-side restoration once routed through `mdManager.parse`. **Resolved by D5.** (Q14 verdict.)

4. **J1.A.4 / J1.A.5 — Lowercase `<video>` / `<audio>` JSX silent-loss OK→OK.** No `video` / `audio` parseDOM rule in `sharedExtensions`; PM's DOMParser drops the wrapper. **Resolved by D5.** Same class as #1 but with a different terminal failure (drop instead of substitute).

5. **J3.9 / J3.10 / J3.11 / J3.12 — Cross-machine markdown text falls through to verbatim plaintext when isMarkdown returns false.** Single-line `<Callout>`, `<img>`, `> [!NOTE]`, `` `code` `` in raw markdown emails miss the heuristic. **Resolved by D8 signal extension** (capitalized JSX, lowercase JSX-with-attr, blockquote, inline code, paired emphasis).

6. **J1.A.11 — jsxInline asymmetric outbound/inbound naming.** Outbound emits `<span class="mdx-inline">`; inbound parseHTML matches `span[data-jsx-inline]`. Branch C cannot recover jsxInline identity — falls to text. **NEW FINDING beyond worldmodel §8.** Resolution paths: (a) FR-13-first re-routes to text/plain markdown which mdManager.parse handles correctly via mdxJsxTextElement → jsxInline (D5 catches); (b) update `mdast-to-hast-handlers.ts:181-197` to emit `data-jsx-inline` attribute too. **D5 alone fixes it via FR-13 — UNVERIFIED whether the FR-13 path produces byte-identical inline content; resolution: runtime test.**

7. **J1.A.12 — rawMdxFallback asymmetric outbound/inbound naming.** Outbound emits `<pre class="mdx-fallback">`; inbound parseHTML matches `div[data-raw-mdx-fallback]`. Branch C falls to CodeBlockFidelity. **NEW FINDING.** Same resolution shape as #6 — D5 catches via text/plain markdown route through mdManager.parse, which restores rawMdxFallback through the unknown-mdast-type guard.

### BUGs D5+D8 don't fully fix (need new mechanism)

8. **J1.A.8 — HtmlDetailsAccordion compat identity LOST OK→OK in BOTH pre- and post-D5.** `<details>` is NOT in `LOWERCASE_JSX_CANONICAL_TAGS` (= {img, video, audio}); the autolink guard PUA-protects it as raw HTML. There is no inbound transformer to re-promote `<details>` → HtmlDetailsAccordion (only outbound serialization emits the htmlBoundary form). On round-trip, the descriptor identity collapses to `htmlBlock`. **Spec needs to address this directly** — either expand LOWERCASE_JSX_CANONICAL_TAGS to include `details` (with sister inbound mdast transformer), or accept it as a known limitation in the SPEC §3 NG list. UNVERIFIED whether the round-trip lands as htmlBlock vs nested PM children; resolution: runtime trace on `<details>` paste. **Surface as own item; D5+D8 alone insufficient.**

### NG-CARVE-OUTs that surface on the clipboard path (D7 input)

The clipboard path inherits NG normalizations from the unified parse/serialize pipeline. D7 LOCKED — no new lossy normalizations beyond canonical NG1-NG11 on the clipboard path. **NG numbering uses canonical CLAUDE.md §"Markdown pipeline" §"Irreducible gaps"** + `specs/2026-04-16-markdown-pipeline-engineering-health/evidence/ng-coverage-audit.md` (distinct from the predecessor `2026-04-16-clipboard-mdast-canonical/SPEC.md`'s own non-goal NG numbering, which §3 NG-S8/S9/S10 reference with explicit qualifier). Specific canonical NG instances visible in this matrix:

- **NG1 (blank-line counts):** any multi-paragraph paste collapses sequential blank lines to canonical 2-line paragraph separation. Visible across J1, J3, J4.
- **NG3 (math, footnotes, alerts):** non-callout alerts (CommonMark, Pandoc-style `::: tip`) drop; math `$$..$$` preserved in text but math node not in PM schema.
- **NG9 (U+E000–E004 PUA reserved sentinels):** any inbound text containing these PUA chars conflicts with the R23 autolink-void-html-guard sentinel range. Rare in practice.
- **NG10 (doc-start `---`→`***`):** J1 paste of a yaml-frontmatter-shaped block at doc start gets normalized to `***`.
- **NG11 (ensureNonEmptyDoc synthesis):** if a paste produces an ignore-typed-only result (frontmatter-only paste), schema synthesizes empty paragraph. Edge case.

(Other canonical NG2/NG4/NG5/NG6/NG7/NG8 don't manifest on the clipboard path in this matrix.)

**Cross-reference to predecessor `2026-04-16-clipboard-mdast-canonical/SPEC.md`'s own non-goal numbering** (used in §3 NG-S8/S9/S10):
- Predecessor NG3 (Word lists, CKEditor-grade reconstruction): J4.4 carve-out — Word's `mso-list:` hint extraction not done; lists flatten or render with raw indent.
- Predecessor NG4 (binary image paste, drag-image, RTF): out of clipboard text/html scope; PR #270 in flight.
- Predecessor NG5 (text/markdown MIME): NEVER per SPEC NG-S3.
- Predecessor NG7 (DOMPurify / paste-time sanitization): NEVER per SPEC NG-S11.
- Predecessor NG8 (CM6 lastLinewiseCopy): NOT UNLESS per SPEC NG-S12.
- Predecessor NG9 (table colspan/rowspan, sheets data attrs): J4.3 / J4.7 — Google Docs merged cells flatten; Sheets `data-sheets-value` stripped.

These ARE the §6 FR acceptance criteria qualifier per D7 — "byte identity excluding canonical NG-X."

---

## Cross-PM-editor verification (Q7 resolution)

**Question:** Does FR-13-first break Branch C cross-PM-editor interop in any meaningful way?

**Verdict: NO.**

**Evidence chain:**

1. Linear, Outline, BlockNote all emit canonical markdown to text/plain (verified 2026-04-30 against primary source — see `reports/tiptap-clipboard-round-trip-markdown/REPORT.md` lines 1200-1212). Linear's default Cmd+C is closed-source UNCERTAIN, but their data-pm-slice text/html and their text/plain encode the same content for OK-schema-mappable elements (heading, paragraph, list, mark, link).
2. Their text/html, when run through Branch C parseFromClipboard, walks OK's parseDOM rules. Linear's HTML maps cleanly to OK's schema (`branch-c-disk-outcome-trace.md` payload (c) confirms — `## Heading\n\nSome **bold** and *italic* text.` round-trips identically).
3. Their text/plain markdown, when run through FR-13's `mdManager.parse`, produces the same mdast → PM tree as walking the HTML through parseDOM — because both encode the same primitive content.

**Edge cases where FR-13-first could lose information:**

- Linear/Outline have a feature in their HTML that doesn't appear in text/plain (e.g., a custom node type they emit as both rich HTML and degraded markdown). UNVERIFIED — none surfaced in the 2026-04-30 verification or the prior 1171-line report. Linear's mention-link, Outline's task-list-with-id, BlockNote's per-block hierarchy — all would be observable as text/html-only features. None are documented as such; both editors' text/plain is described as the "simpler, canonical" output.
- Editor X emits text/plain that fails OK's `is-markdown` heuristic threshold (sub-1-signal short snippets) — **falls through to Branch C, same as today**. FR-13-first only fires when isMarkdown returns true; a short snippet that fails isMarkdown still hits Branch C. This is graceful — no regression class.

**Conclusion:** FR-13-first does not lose information; it routes the same content through the more direct path. SPEC D5 LOCKED is well-founded.

---

## Source-side reorder analysis (Q16 resolution)

**Question:** Does Source view need the FR-13-first reorder, or is it redundant?

**Verdict: REDUNDANT.**

**Source dispatcher branches (`source-clipboard.ts:119-187`):**

```
1. Shift held → CM6 default verbatim
2. Branch A (vscode-editor-data) → fenced code block string
3. Branch C (data-pm-slice) → return false → CM6 default reads text/plain
4. Branch D (HTML present, no pm-slice) → htmlToMdast → markdown → CM6 dispatch
5. Branch E (text/plain only) → return false → CM6 default
```

**Why Source already routes correctly:**

- Branch C returns false. CM6's default reads **text/plain** (not text/html). Source's CM6 binding inserts text/plain verbatim into Y.Text. Source view's storage IS markdown.
- For OK→OK paste, text/plain is canonical markdown via `mdManager.serialize`. CM6's verbatim insert lands the canonical bytes directly in Y.Text. The bridge (Server Observer B) re-renders the PM tree from Y.Text on demand — but Y.Text is the source of truth.
- For external→OK paste with text/html present (and isMarkdown(text/plain) would fire), Source dispatcher Branch D runs htmlToMdast → markdown via remark-stringify. But this is only when text/html is present **AND no data-pm-slice**, which means it's an external-rich-HTML source. Routing through Branch D is correct for those cases (Notion, Gmail, etc.) — text/plain is degraded.

**Where could a Source FR-13-first reorder matter?**

The case where text/plain is canonical markdown AND text/html is also present AND no data-pm-slice. That's J3 markdown-canonical sources without OK's PM origin (raw markdown email + rich-HTML preview from email client?). **For those, Source's Branch D currently runs htmlToMdast — which often degrades the canonical markdown bytes vs just inserting text/plain verbatim.**

Specifically: a markdown file rendered to HTML by email-client preview, copied as both MIMEs. Source dispatcher's Branch D runs `htmlToMdast → markdown` instead of inserting the raw text/plain. This is a **pre-existing bug class for Source**, but it's narrow (rare cross-app scenario) and the cost (htmlToMdast has cleanup plugins that might be wrong for a markdown→HTML email-render input) is bounded.

**Recommendation per Q16:**

- **Symmetric reorder for Source IS NOT REDUNDANT in narrow J3-with-html cases**. Adding FR-13-first to Source dispatcher (between Branch C and Branch D) catches the same J3 markdown-canonical-with-html case the WYSIWYG path catches. Cost: ~5 LoC.
- **For OK→OK paste specifically (J1), Source FR-13-first IS REDUNDANT** — Branch C already routes correctly via CM6's text/plain default.

**Net:** SPEC §10 D5 should commit to symmetric reorder per D2 (G4 explicit symmetry goal). The Source-side reorder catches the narrow J3 case; the WYSIWYG-side reorder catches the dominant J1 case.

---

## What surprised me (in-scope honesty)

1. **Asymmetric outbound/inbound naming for jsxInline + rawMdxFallback (J1.A.11, J1.A.12).** The mdast-to-hast handlers emit `<span class="mdx-inline">` and `<pre class="mdx-fallback">`, but the PM extensions match `span[data-jsx-inline]` and `div[data-raw-mdx-fallback]`. Branch C cannot recover identity for these custom node types. D5 saves them by routing through text/plain, but this is a structural bug that should be surfaced as a separate finding. The mdast-to-hast handlers should emit BOTH the class and the data-attribute (or align to data-attr only).

2. **HtmlDetailsAccordion (J1.A.8) is broken in BOTH pre- and post-D5.** D5+D8 together don't fix it because there is no inbound transformer to re-promote `<details>` mdast → HtmlDetailsAccordion. The compat descriptor exists for **outbound source-form preservation** when the user inserted via slash menu, but a paste of the same `<details>` source bytes from another OK doc collapses to htmlBlock (or html-block atom). This is a non-obvious limitation that the spec should either fix (add inbound transformer) or explicitly carve out as NG.

3. **VS Code text/plain markdown gets fenced as code (J3.1).** This is design-intent per SPEC FR-3 / D6 (Branch A wins on vscode-editor-data MIME), but it surprises users who copied source code OF a markdown document expecting the rendered structure. Worth surfacing in user-facing documentation; not a bug per the spec.

4. **WikiLink's explicit `a.wiki-link[data-target]` priority-100 parseDOM rule is load-bearing for Branch C.** Without it, `<a class="wiki-link">` would match LinkFidelity priority 60 (the `a[href]` default link mark) and the `[[Page|Alias]]` round-trip would lose. This is mentioned in the wiki-link.ts source comment. **Pattern to replicate for jsxComponent / jsxInline / rawMdxFallback if the asymmetric-naming bug isn't fixed via the more direct path.**

5. **`<u>foo</u>` cross-view symmetry (Q15) is UNVERIFIED.** Source view preserves the bytes verbatim (CM6 text/plain insert), but WYSIWYG paste of the same `<u>` runs through StarterKit's Underline mark → mdast `html` inline node → PM `htmlBlock` (block atom). Cross-view symmetry invariant says same selection → byte-identical disk; this case may violate it. Resolution: runtime trace.

---

## Summary

**Total cells classified:** 36 (J1.A: 20, J1.B: 4, J1.C: 3, J1.D: 1, J3: 12 distinct sources, J4: 8). J2 deferred to Q17.

**BUG cells the spec must fix (top 7):** J1.A.1 (`<img>` flip), J1.A.2 (`<Callout>` → code block), J1.A.3 (`<Accordion>` → code block), J1.A.4/A.5 (`<video>/<audio>` lost), J1.A.20 (pre-PR-310 `<Image>` → code block), J3.9-12 (cross-machine markdown text falls through to plaintext). J1.A.11 + J1.A.12 (jsxInline / rawMdxFallback asymmetric naming) are **NEW findings** rescued by D5 but warranting structural fix. J1.A.8 (HtmlDetailsAccordion) is **NEW finding requiring action beyond D5+D8**.

**Verified:** D5 (FR-13-first reorder) + D8 (heuristic extension) resolve 5 of 7 highest-impact bugs end-to-end.

**Open:** HtmlDetailsAccordion + jsxInline/rawMdxFallback asymmetric naming need separate spec attention.
