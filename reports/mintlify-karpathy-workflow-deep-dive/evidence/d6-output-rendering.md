# Evidence: D6 — Output and Rendering

**Dimension:** What can Mintlify render? Can it support Karpathy-style outputs (Marp, matplotlib, custom viz)?
**Date:** 2026-04-02
**Sources:** Mintlify component docs, Mermaid docs, MDX capabilities

---

## Key pages referenced
- https://www.mintlify.com/docs/components — Full component library
- https://www.mintlify.com/docs/components/mermaid-diagrams — Mermaid support
- https://www.mintlify.com/docs/api-playground/openapi-setup — API playground
- https://github.com/mintlify/mdx — MDX parser

---

## Findings

### Finding: Mintlify renders MDX with 22+ built-in components, Mermaid, and custom React
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/components, https://www.mintlify.com/docs/components/mermaid-diagrams

**Built-in components (22+):**
- Structure: Tabs, Code Groups, Steps, Columns, Panel
- Attention: Callouts, Banner, Badge, Update, Frames, Tooltips
- AI: Prompt (copyable with Cursor integration)
- Show/Hide: Accordions, Expandables, View (conditional rendering)
- API: Fields, Responses, Examples
- Navigation: Cards, Tiles
- Visual: Icons (Lucide), Mermaid diagrams, Color swatches, Tree

**Mermaid support:**
- Flowcharts, sequence diagrams, Gantt charts, and all Mermaid types
- ELK (Eclipse Layout Kernel) for complex diagrams
- Interactive zoom/pan controls (auto-appear when height > 120px)
- Theme customization

**Custom React components:** Supported via MDX JSX embedding.

### Finding: Mintlify CANNOT render Marp slides, matplotlib images, or arbitrary visualizations
**Confidence:** CONFIRMED (negative search)
**Evidence:** Component docs, MDX parser

What Mintlify CANNOT render:
- **Marp slides**: No Marp support. Mintlify renders pages, not presentation decks.
- **matplotlib images**: No Python execution. Static images (PNG/SVG) can be embedded but not generated.
- **Custom chart libraries**: No D3, Chart.js, Plotly, etc. built-in. Could theoretically embed via custom React components, but the managed build pipeline limits what JavaScript libraries are available.
- **Jupyter notebooks**: No notebook rendering.
- **LaTeX/math**: Not mentioned in component docs (though MDX could support via rehype plugins — unclear if Mintlify's managed pipeline includes math support).
- **Interactive data visualizations**: Beyond Mermaid, no built-in charting.

### Finding: LLM outputs would need to be converted to MDX for display
**Confidence:** INFERRED
**Evidence:** Architecture analysis

For Karpathy's workflow where LLMs generate:
1. **Markdown files** -> Yes, MDX is a superset of Markdown. Would render correctly.
2. **Marp slides** -> No. Would need conversion to static images or MDX Steps component.
3. **matplotlib images** -> Could be embedded as static PNG/SVG files in the repo. But generation must happen outside Mintlify.
4. **Charts/visualizations** -> Would need pre-rendering to static images or Mermaid diagrams.

The fundamental limitation: Mintlify is a rendering engine for authored content, not a computation platform. It cannot execute code, run Python, or generate visualizations. All computation must happen outside Mintlify, with results committed as static files.

### Finding: API Playground is a genuine differentiator for developer documentation
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/api-playground/openapi-setup

OpenAPI 3.0/3.1 specs auto-generate:
- Interactive API playgrounds (try-it-out)
- Request/response samples
- Authentication handling (API keys, Bearer, basic auth)
- SDK code sample injection (via Stainless, liblab)
- Auto-generated endpoint pages

This is uniquely valuable for API documentation but irrelevant to the Karpathy knowledge base workflow.

---

## Negative searches

* Searched: "Mintlify Marp slides" — No Marp support
* Searched: "Mintlify chart visualization D3 plotly" — No charting libraries
* Searched: "Mintlify LaTeX math equations" — Not documented in component library
* Searched: "Mintlify code execution Python" — No code execution capability

---

## Gaps / follow-ups

* Whether Mintlify's managed pipeline includes any math/LaTeX rendering plugins
* Whether custom React components could embed interactive visualizations (and what the build constraints are)
