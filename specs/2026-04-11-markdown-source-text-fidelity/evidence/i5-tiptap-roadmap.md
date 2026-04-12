# I5: @tiptap/markdown Upstream Trajectory & Roadmap

**Question:** Is upstream likely to fix markdown fidelity issues? Should we wait, patch, fork, or migrate?

**Verdict: Patch now, track upstream. Do not wait, fork, or migrate.**

---

## 1. No v4 — Incremental v3.x Releases Only

There is no v4 milestone, branch, or RFC. TipTap uses rolling minor/patch releases on v3.x. Release cadence is aggressive: 27 releases from Oct 2025 to Apr 2026 (~5/month). The "Markdown" milestone (8 total) has 5 closed issues and 0 open — all resolved by Nov 2025. No new milestone for markdown work exists.

**Implication:** No breaking major version is imminent. Patches targeting v3.22.x internals are safe from a v4 break for the foreseeable future.

## 2. PR #7565 — Entity Encoding Landed in v3.21.0

PR [#7565](https://github.com/ueberdosis/tiptap/pull/7565) (merged 2026-03-28 by `bdbch`) introduced `encodeHtmlEntities`/`decodeHtmlEntities` in `MarkdownManager.ts` and `packages/core/src/utilities/htmlEntities.ts`. This is the PR that causes our `&amp;`/`&lt;`/`&gt;` fidelity issues.

**Key facts:**
- Entity encoding is **not configurable** — hardcoded in `renderNodeToMarkdown` and `parseInlineTokens`
- Copilot review flagged asymmetry (`&quot;` decoded but not re-encoded) and missing inline `code` mark handling — these were addressed in the final merge but the encode/decode is still unconditional
- No opt-out mechanism was discussed or requested in the PR
- Files changed: `MarkdownManager.ts` (+30/-4), new `htmlEntities.ts` (+26), new tests (+195 lines)

**Implication:** Our monkey-patches target exactly these functions. The surface area is small and well-tested upstream, reducing surprise breakage risk.

## 3. Open Markdown Issues — Active Bug Surface

As of 2026-04-11, 10+ open markdown issues exist:

| # | Issue | Severity |
|---|-------|----------|
| 7731 | Table `<br>` lost in serialization | Medium |
| 7728 | Strikethrough + bold/italic nesting invalid | High |
| 7722 | HTML comments dropped in parse | Medium |
| 7720 | `editor.markdown.parse()` fails on HTML comments | Medium |
| 7690 | Adjacent marks with different attrs merged | High |
| 7682 | Same-type adjacent marks merged in getMarkdown | High |
| 7677 | OrderedList drops lazy continuation lines | Medium |
| 7499 | Nested inline styles broken | Medium |
| 7495 | `getMarkdown` returns `&nbsp;` when empty | Low |

**Pattern:** Serialization fidelity issues are accumulating. The mark-nesting bugs (#7728, #7690, #7682) suggest the serializer architecture has structural limits. Maintainer response to these issues: **0 comments on most** (7728, 7731, 7729 have 0 comments). Community PRs exist for some (#7722, #7690) but are unmerged.

## 4. Maintainer Responsiveness

- **Core repo merge velocity:** High for non-markdown PRs. 15 PRs merged in first 8 days of April 2026, mostly core/drag-handle/react fixes
- **Markdown-specific:** Slow. PR #7162 (empty markdown fix, Nov 2025) never merged. Community PRs #7722 and #7690 pending with no maintainer review
- **Primary maintainer:** `bdbch` handles most merges. Markdown appears lower priority than core editor, drag-handle, and React integration
- **AI-assisted development:** Multiple `claude/*` branches visible, suggesting AI-assisted bug fixing. This may accelerate fixes but hasn't touched markdown serialization

## 5. TipTap Product Direction — Markdown Deprioritized

Per our existing [TipTap 2026 Direction report](../../reports/tiptap-2026-direction-overlap/REPORT.md) and the official [roadmap](https://tiptap.dev/roadmap):

- Roadmap priorities: AI Toolkit, Pages/Conversion, Tracked Changes, Shorthand (token compression)
- **Zero mention of markdown** on the public roadmap
- TipTap is investing in their proprietary document format (Shorthand) for AI use cases — markdown is a community/open-source concern
- The markdown extension originated as a community fork (`aguingand/tiptap-markdown`, 517 stars, last push Oct 2025) that was absorbed into the main repo. It doesn't appear to have a dedicated maintainer

## 6. Alternative Ecosystem Options

- **`aguingand/tiptap-markdown`** (original community fork): 517 stars, last push Oct 2025. Effectively abandoned since absorption into tiptap core
- **No competing TipTap markdown solution** exists in the ecosystem
- **Milkdown** (markdown-first ProseMirror editor): different architecture, would require full migration
- **Direct prosemirror-markdown**: lower-level, would lose TipTap extension ecosystem

## 7. Breaking Change Risk Assessment

| Scenario | Probability | Our Patch Impact |
|----------|-------------|------------------|
| v3.23/v3.24 touches `htmlEntities.ts` | **Low** (15%) — file is small, stable, and the encoding logic is "done" per PR #7565 |  Patch needs rebase but same API surface |
| v3.23/v3.24 refactors `MarkdownManager.ts` | **Medium** (30%) — active bug reports may drive changes to serialization | Monkey-patches may need method signature updates |
| v3.23/v3.24 makes encoding configurable | **Very low** (5%) — no issue or RFC requesting this | Our patches become unnecessary (best case) |
| v4.0 ships | **Very low** (<10% in next 12 months) — no signals whatsoever | Full reassessment needed |

**Expected maintenance burden:** ~1 hour per minor release to verify patches still apply. With 2-3 releases/month, this is ~3 hours/month if we pin loosely, or zero if we pin exact versions and update deliberately.

## 8. Recommendation

**Patch now. Do not wait for upstream.**

1. **Entity encoding will not become configurable upstream** — no demand signal, no RFC, no discussion
2. **Markdown fidelity is not a TipTap priority** — their product direction is toward proprietary formats (Shorthand) and paid features (Conversion, AI Toolkit)
3. **The patch surface is small and stable** — `htmlEntities.ts` (26 lines) and `MarkdownManager.ts` (34 lines changed). Low churn risk
4. **Pin `@tiptap/markdown` version** — update deliberately after verifying patches apply, not via automated semver range
5. **Do not fork** — the maintenance burden of a fork exceeds the burden of targeted patches
6. **Do not migrate** — no better alternative exists in the TipTap/ProseMirror ecosystem

**Timeline:** Upstream fixes to the serializer architecture (mark nesting, entity handling) are unlikely within 6 months. If they happen, they'll arrive as breaking changes to the serializer internals that will require patch updates regardless.
