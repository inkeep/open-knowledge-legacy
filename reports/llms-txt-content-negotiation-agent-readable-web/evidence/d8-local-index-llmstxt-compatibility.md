# Evidence: Local _index.md as llms.txt-Compatible Format

**Dimension:** D8 — Local _index.md as llms.txt-compatible format: the zero-work publishing bridge
**Date:** 2026-04-05
**Sources:** llmstxt.org, Answer.AI blog, Fern docs, Mintlify docs, Hugo docs, GitBook docs

---

## Key files / pages referenced
- [llmstxt.org](https://llmstxt.org/) — The llms.txt specification (accessed 2026-04-05)
- [Answer.AI blog post](https://www.answer.ai/posts/2024-09-03-llmstxt.html) — Original proposal by Jeremy Howard (accessed 2026-04-05)
- [Fern llms.txt docs](https://buildwithfern.com/learn/docs/ai-features/llms-txt) — Per-section hierarchical llms.txt (accessed 2026-04-05)
- [Hugo content organization](https://gohugo.io/content-management/organization/) — _index.md vs index.md convention (accessed 2026-04-05)
- [Mintlify llms.txt docs](https://www.mintlify.com/docs/ai/llmstxt) — Root-only llms.txt generation (accessed 2026-04-05)
- [GitBook LLM-ready docs](https://gitbook.com/docs/publishing-documentation/llm-ready-docs) — Root-level llms.txt (accessed 2026-04-05)

---

## Findings

### Finding: llms.txt is an informal community convention, not a formal standard
**Confidence:** CONFIRMED
**Evidence:** [llmstxt.org](https://llmstxt.org/), [Answer.AI blog post](https://www.answer.ai/posts/2024-09-03-llmstxt.html)

The llms.txt specification was created by Jeremy Howard (Answer.AI) and published as a blog post on September 3, 2024. It is maintained through a GitHub repository (AnswerDotAI/llms-txt) with community input via Discord.

It is NOT a formal standard from any recognized standards body:
- Not a W3C Recommendation
- Not an IETF RFC or Internet-Draft
- Not an ISO standard
- No formal governance structure, working group, or charter

The spec describes itself as "a proposal" — literally: "We propose that those interested in providing LLM-friendly content add a /llms.txt file to their site." It is a de facto community convention that has gained adoption through organic community and vendor uptake, not through any standardization process. The GitHub repo has a reference logo and Python CLI tooling, but no formal versioning, no change process, no public review period.

**Implications:** The informal status means the format can be adopted, extended, or deviated from without violating any standard. There is no compliance authority. Structural compatibility is measured against community convention, not a normative spec.

---

### Finding: The llms.txt format rules are minimal — H1 required, everything else optional
**Confidence:** CONFIRMED
**Evidence:** [llmstxt.org](https://llmstxt.org/)

The exact format rules from the spec:

1. **H1 heading** with project or site name — the **only required** element
2. **Blockquote** with a short summary — optional, "containing key information necessary for understanding the rest of the file"
3. **Zero or more markdown sections** (paragraphs, lists — any type except headings) with "more detailed information about the project"
4. **Zero or more H2-delimited sections** containing "file lists" — each is a markdown list where each item contains:
   - A **required** markdown hyperlink `[name](url)`
   - Optionally followed by `: notes about the file`
5. An **"Optional" section** (H2) has special meaning — "URLs provided there can be skipped if a shorter context is needed"

The spec also states the file is "located in the root path /llms.txt of a website (or, optionally, in a subpath)."

Key non-rules (things the spec does NOT prohibit):
- No prohibition on relative paths (spec examples use absolute URLs but does not mandate them)
- No prohibition on additional content beyond the prescribed structure
- No prohibition on extra metadata or frontmatter
- No prohibition on per-folder placement (the "optionally, in a subpath" language explicitly allows it)

**Implications:** The format is intentionally loose. Anything that has an H1 and follows the general markdown structure is compatible.

---

### Finding: Our _index.md format aligns with llms.txt at every structural level
**Confidence:** CONFIRMED
**Evidence:** Structural comparison of formats

| llms.txt element | _index.md equivalent | Match? |
|---|---|---|
| H1 (project/site name) — required | H1 (folder name) | YES |
| Blockquote (summary) — optional | Blockquote (folder description from meta.json) | YES |
| H2 sections with file lists | Section lists of child content | YES |
| `[name](url): description` per entry | `[title](path): description` per entry | YES |
| Markdown format | Markdown format | YES |
| Well-known path (root or subpath) | Well-known path (folder root) | YES |

The structural alignment is exact for all prescribed elements. An _index.md file IS a valid llms.txt file by the spec's own rules.

---

### Finding: Divergences from typical llms.txt usage do not violate the spec
**Confidence:** CONFIRMED
**Evidence:** Spec analysis + structural comparison

Identified divergences:

1. **Relative paths vs absolute URLs:** _index.md uses relative paths (`./subfolder/page.md`) whereas typical llms.txt files use absolute URLs (`https://example.com/docs/page`). The spec requires "a required markdown hyperlink `[name](url)`" but does not mandate absolute URLs. Relative paths are valid markdown hyperlinks. When published to the web, paths would need to be resolved to absolute or site-relative URLs, but this is a deployment-time transform, not a format violation.

2. **Per-folder vs root-only:** _index.md exists in every folder. The spec says the file is "located in the root path /llms.txt of a website (or, optionally, in a subpath)." The "optionally, in a subpath" clause explicitly permits per-folder placement.

3. **Extra frontmatter fields:** _index.md may include YAML frontmatter or additional metadata beyond the `[name](url): description` pattern. The spec does not prohibit extra content — it prescribes a minimum structure, not a maximum.

4. **Naming (_index.md vs llms.txt):** Different filename. When published, the transformation is: rename _index.md to llms.txt (or serve it at the llms.txt path). This is a deployment concern, not a format incompatibility.

**Implications:** None of the divergences violate the spec. They are contextual differences (local filesystem vs web) that require minimal transformation at publishing time.

---

### Finding: Fern is the only platform implementing per-section hierarchical llms.txt
**Confidence:** CONFIRMED
**Evidence:** [Fern docs](https://buildwithfern.com/learn/docs/ai-features/llms-txt), [Mintlify docs](https://www.mintlify.com/docs/ai/llmstxt), [GitBook docs](https://gitbook.com/docs/publishing-documentation/llm-ready-docs)

Fern's documentation explicitly states: "Both files are available at any level of your documentation hierarchy (`/llms.txt`, `/llms-full.txt`, `/docs/llms.txt`, `/docs/ai-features/llms-full.txt`, etc.)." This means Fern auto-generates section-specific llms.txt files at every path level, not just the root.

No other platform does this:

| Platform | Root llms.txt | Per-section llms.txt |
|---|---|---|
| **Fern** | Yes (auto) | **Yes — at any hierarchy level** |
| **Mintlify** | Yes (auto) | No — root only |
| **GitBook** | Yes (auto) | No — root only (per-space, not per-section) |
| **ReadMe** | Yes (auto) | No — root only |
| **Docusaurus** | Yes (plugins) | No |
| **Starlight** | Yes (plugins) | No |

Fern's implementation is the closest web analog to per-folder _index.md files. The pattern is: each section of the docs hierarchy has its own llms.txt containing only that section's content, allowing agents to request scoped context rather than ingesting the full site index.

**Implications:** Per-section llms.txt is a validated concept (Fern ships it in production), but adoption is n=1 among platforms. Our _index.md approach independently arrives at the same pattern from the local-first direction.

---

### Finding: The publishing bridge from _index.md to llms.txt requires zero content transformation
**Confidence:** CONFIRMED
**Evidence:** Format comparison + spec rules

The bridge is:
1. Root `_index.md` → serve as `/llms.txt` (or rename). Content is already in the correct format.
2. Per-folder `_index.md` → serve as `/{section}/llms.txt`. Each folder's catalog becomes a section-scoped llms.txt.
3. Path resolution: relative paths in _index.md → resolve to absolute or site-relative URLs at publish time. This is standard URL resolution that any static site generator already does.

What is NOT needed:
- No content rewriting (the markdown structure is already llms.txt-compatible)
- No format conversion (markdown in, markdown out)
- No information loss (all llms.txt fields have _index.md equivalents)
- No special tooling (standard SSG URL resolution handles the path transform)

---

### Finding: The _index.md naming follows Hugo's convention and serves a dual purpose
**Confidence:** CONFIRMED
**Evidence:** [Hugo docs](https://gohugo.io/content-management/organization/), [Hugo _index.md guide](https://tangenttechnologies.ca/blog/hugo-indexmd-vs-_indexmd/)

Hugo distinguishes two types of index files:
- `index.md` = **leaf bundle** (single page — renders as content)
- `_index.md` = **branch bundle** (list page — renders as a catalog of child pages)

The `_` prefix convention means:
- `_index.md` is a **list page** — it catalogs what's in the folder, it doesn't have its own standalone content
- `index.md` is a **single page** — it IS content, like any other page

In our product, a folder can have both:
- `index.md` — human-authored content page (Fumadocs renders this for the human-facing site)
- `_index.md` — auto-generated catalog (agents read this for navigation)
- `meta.json` — folder metadata (title, description, order)

This avoids filename collision. The `_` prefix signals "this is infrastructure, not content" — the same convention Hugo established. When published, `_index.md` becomes the llms.txt at each folder level. The human-authored `index.md` becomes the HTML page for that section.

**Implications:** The naming choice is not arbitrary — it follows an established SSG convention (Hugo), serves a clear semantic purpose (catalog vs content), and maps directly to the llms.txt role (discovery index vs page content).

---

## Negative searches

* Searched: "per-section llms.txt" across Mintlify, GitBook, ReadMe, Docusaurus docs → Only Fern supports it
* Searched: "hierarchical llms.txt" in llms-txt-hub GitHub repo → No discussion of per-section files
* Searched: llmstxt.org spec for prohibition on relative paths or extra content → None found
* Searched: Any W3C, IETF, or ISO track for llms.txt standardization → None exists

---

## Gaps / follow-ups

* Whether Mintlify or GitBook plan to add per-section llms.txt support (not investigated — would require vendor roadmap access)
* Whether any non-Fern site manually creates per-section llms.txt files (possible but no evidence found)
* Real-world agent consumption of per-section llms.txt files on Fern-hosted sites (no usage data found)
