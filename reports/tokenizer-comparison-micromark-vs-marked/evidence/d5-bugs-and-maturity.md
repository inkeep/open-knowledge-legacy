# Evidence: Open Bugs, CVEs, and Ecosystem Maturity

**Dimension:** D5 — known bugs + D6 — ecosystem maturity
**Date:** 2026-04-12

---

## Findings

### marked — open bugs, release cadence, security

**Release cadence:** Major every ~4-6 months (v17.0.0 Nov 2025, v18.0.0 Apr 2026). High churn for downstream consumers.

**Weekly downloads:** ~27-28M (Snyk / npmtrends).

**Stars:** 36.7k. Open issues: 7 (unusually low — aggressive triage).

**Historic CVEs (2021-2022):** Three ReDoS advisories (GHSA-rrrm-qjm4-v8hf, GHSA-5v2h-r2cx-5xgj, GHSA-4r62-v4vq-hr96). No new advisories in the last 3 years — post-2022 hardening held.

**CommonMark compliance:** Improved from 74.8% (467/624 tests, v0.5.0, 2018) to ~90%+ overall (v4.2.3, Nov 2022) per [discussion #1202](https://github.com/markedjs/marked/discussions/1202). Most sections now 100%; remaining gaps: Images 15/22 (68%), Links 75/90 (83%), Entity/numeric references 15/17 (88%). The category weaknesses align with our fidelity pain points (link URLs, image alt text).

### @tiptap/markdown — open bugs

**Issue #7258 (OPEN)** — Escape character mishandling, opened Nov 21, 2025. `\*text\*` renders as italic instead of literal asterisks. Still open ~5 months later. Our bun patch fixes this.

**Issue #7539 (FIXED in 3.20.x)** — Entity double-encoding. Merged via PR #7565. Our bun patch also fixes this.

Implication: the exact class of round-trip bugs we care about are actively being filed against @tiptap/markdown. Fix velocity is non-zero but a major content-destroying bug was open for ~5 months.

### micromark / remark — bugs, maintenance

**CVEs (last 3 years):** None found.

**micromark latest:** v4.0.2 (Feb 2025). Slow, stable releases. Monorepo structure with many sub-packages.

**remark latest major:** v15.0.0 (Sept 2024). One major every 1-2 years. Much lower churn than marked.

**CommonMark compliance:** 100% (tested against ~650 CommonMark tests plus 1.2k extras, 100% code coverage, fuzz tested). Per @wooorm (Oct 2020): *"It's done. micromark is in remark. 100% CommonMark (and optionally GFM) compliant."*

**mdast-util-to-markdown bugs (open/wontfix):**

- **#12 (OPEN, Feb 2021 — ~5 years)** — `***emphasis*in emphasis*` round-trips to `\***emphasis*in emphasis*` which reparses to different structure. @wooorm (Oct 2024): *"incredibly complex… Escaping one marker affects parsing elsewhere in unexpected ways."*
- **#66 (CLOSED not-planned)** — `foo***bar***buz` → `fo&#x6F;***bar***&#x62;uz`. @wooorm: *"Note that I do not consider escaping things a breaking change; that markdown still renders the same, and the HTML output is still the same"*.
- **#8 (CLOSED invalid)** — underscore escapes in URLs. Same rationale.

**Maintainer philosophy divergence (INFERRED):** @wooorm treats cosmetic escape changes as non-bugs if HTML output is identical. For byte-exact source-text fidelity, this is a different philosophy than what we want. Mitigation: we write custom handlers that override default escape behavior.

### @handlewithcare/remark-prosemirror — maturity

**Current version:** 0.1.5 (pre-1.0). Breaking changes possible.

**First publish:** Dec 18, 2024. Last publish: Dec 29, 2025. 6 versions in ~12 months.

**Weekly downloads:** ~16,800 (low but non-zero).

**GitHub:** 29 stars, 2 forks, 1 open issue, 26 commits on main.

**Maintainer:** the `smoores-dev` maintainer (ex-NYT Oak engineer, 5 years). Part of handlewithcarecollective — also maintains `@handlewithcare/react-prosemirror` (official successor to `@nytimes/react-prosemirror`, confirmed per [ProseMirror discuss](https://discuss.prosemirror.net/t/nytimes-react-prosemirror-is-now-handlewithcare-react-prosemirror-and-v2-is-available/8168)).

**Risk:** Small library (~300 LOC), few eyes on edge cases. Mitigation: it's a thin wrapper over well-tested primitives (remark + ProseMirror), trivially forkable.

### Bus factor comparison

- **marked:** Low single digits (UziTech + small team of active committers).
- **@tiptap/markdown:** Part of TipTap org, @bdbch actively fixing markdown bugs. Moderate.
- **micromark + remark + mdast-util-*:** **Essentially one person** — Titus Wormer (@wooorm). Significant concern, but mitigated by massive downstream pressure (Docusaurus, Next.js MDX, Astro, Prettier, Milkdown, BlockNote) to keep it working.
- **@handlewithcare/remark-prosemirror:** 1-2 people. Very small.

### Industry adoption

**marked:** TipTap's `@tiptap/markdown`, some doc sites. Many legacy users. Losing market share.

**unified/remark/micromark:** Docusaurus, Next.js MDX, Astro, Prettier, Milkdown (ProseMirror + Y.js + Remark), BlockNote (full unified stack), MDX itself, Vercel's docs, numerous static site generators.

**Migration signal:** [Tom MacWright (Jan 2024)](https://macwright.com/2024/01/28/dont-use-marked): *"marked is really popular. It used to be the best option. But there are better options, use them!"*

---

## Gaps / follow-ups

- **Not investigated:** fix velocity for `@wooorm`'s wontfix rulings — would he accept a PR that makes the escape behavior configurable? Or would we need to fork?
- **Not assessed:** how remark-prosemirror's 0.x → 1.0 migration would affect us when it ships. Small library, small risk, but worth monitoring.
