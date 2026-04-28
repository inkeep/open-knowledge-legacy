---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-app": minor
---

feat(cb-v2): lowercase media canonicals + PropPanel Advanced section + cross-app clipboard fidelity

Follow-up architectural pivot on the Component Blocks v2 5-pack. The three media canonicals are now lowercase HTML-tag-spelled — `img` / `video` / `audio` — replacing the capitalized `Image` / `Video` / `Audio` descriptors that shipped in the original 5-pack. PropPanel gains an "Advanced" collapsible section so the long tail of HTML-native attributes (`srcset`, `sizes`, `decoding`, `fetchpriority`, `crossorigin`, `referrerpolicy`, etc.) doesn't dominate the panel for common edits.

The rule formalized in `built-ins.ts`: a canonical descriptor goes lowercase when (a) the HTML primitive carries a complete-enough attribute set that nothing OK-specific needs to live as a prop, and (b) compositional wrappers (Frame, Figure, etc.) are the canonical home for OK-specific affordances around the primitive. Capitalized canonicals stay capitalized when HTML has no covering primitive (`Callout`) or the closest one is a structural subset (`Accordion` vs `<details>`).

What changed for authors:

- **Slash menu labels remain capitalized** ("Image" / "Video" / "Audio") via `displayName`, so the authoring UX is unchanged. The descriptor name (and the MDX bytes on disk) flip lowercase: a slash-menu insert now writes `<img src="…" alt="…" />` instead of `<Image …/>`.
- **`caption` and `zoom` are dropped** from the Image descriptor's prop surface. `zoom` becomes always-on inside the Image React component (click-to-zoom for every `<img>`); a future Frame v2 wrapper will host caption + border + decorations as a compositional element. `<figure>` / `<figcaption>` rendering is removed from the bare Image component.
- **PropPanel "Advanced" collapsible** — common props (`src`, `alt`, `width`, `height`) render flat; the HTML-native attribute tail collapses behind an "Advanced" trigger. The panel remembers per-descriptor open/closed state in localStorage. A count badge surfaces non-default-set advanced props.
- **Cross-app paste of media now lands as real `<img>` / `<video>` / `<audio>`** — the mdast→hast handler emits native HTML elements for lowercase media canonicals, so pasting from Open Knowledge into Slack / Notion / Gmail / Google Docs renders the actual asset instead of an escaped MDX source block (`<pre class="mdx-component"><code>&lt;img …&gt;</code></pre>`). Capitalized JSX (Callout, Accordion, custom components) continues to flow through the source-as-code shape until per-descriptor `toClipboardHast` lands as a follow-up.
- **The `CommonMarkImage` compat descriptor reroutes through `img`** — `![alt](src)` source forms still round-trip byte-identically, and the PropPanel "Convert" button now reads "Convert to Image" via the canonical's `displayName` lookup (the descriptor name `img` is invisible to authors).

Internal: `imageProps` / `videoProps` / `audioProps` arrays are replaced with `htmlImgProps` (12 props) / `htmlVideoProps` (11 props) / `htmlAudioProps` (7 props), each split into common + advanced subsets. HTML attribute names use lowercase spelling on the descriptor side (`autoplay`, `playsinline`, `fetchpriority`) — the React components translate to camelCase at the JSX boundary so the emitted MDX matches the HTML spec exactly. The `autolink-void-html-guard.ts` PUA-protection layer gains a self-closing JSX-canonical exemption for `img` / `video` / `audio` so lowercase canonicals reach remark-mdx as `mdxJsxFlowElement` rather than being routed into raw-HTML protection.

Breaking changes:

- New slash-menu inserts emit lowercase `<img>` / `<video>` / `<audio>` to disk. Any pre-existing content written with capitalized `<Image>` / `<Video>` / `<Audio>` falls through to the wildcard fallback (`UnknownComponent` chrome) since those descriptor names are no longer registered. Greenfield posture: rename in place to recover the registered descriptor.
- `caption` and `zoom` props removed from the Image descriptor. Pre-existing `<Image caption="…" zoom={false} />` content keeps the props as wildcard attributes (preserved verbatim, no longer interpreted) until renamed to `<img>` and rewritten through Frame v2.
