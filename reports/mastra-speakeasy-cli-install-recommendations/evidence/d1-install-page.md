# Evidence: D1 — Canonical Installation Page

**Dimension:** D1 — What does each vendor's install page show first?
**Date:** 2026-04-20
**Sources:** Mastra docs, npm, GitHub; Speakeasy docs, goreleaser, install.sh

---

## Key files / pages referenced

- [mastra.ai/docs](https://mastra.ai/docs) — Mastra's landing doc with inlined Quickstart
- [mastra.ai/guides/getting-started/quickstart](https://mastra.ai/guides/getting-started/quickstart)
- [mastra.ai/docs/getting-started/manual-install](https://mastra.ai/docs/getting-started/manual-install)
- [create-mastra README on GitHub](https://github.com/mastra-ai/mastra/blob/main/packages/create-mastra/README.md)
- [speakeasy.com/docs/speakeasy-reference/cli/getting-started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started)
- [install.sh (main)](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh)

---

## Findings

### Finding: Mastra leads with an npm-scaffolder one-liner inside a PM tab switcher

**Confidence:** CONFIRMED
**Evidence:** [mastra.ai/docs](https://mastra.ai/docs)

Landing page inlines a Quickstart block — no standalone "Installation" page is primary. First command shown:

```
npm create mastra@latest
```

Tab order: **npm → pnpm → yarn → bun**. Each tab shows the equivalent form:

```
pnpm create mastra
yarn create mastra
bunx create-mastra
```

`packages/create-mastra/README.md` reinforces: `create-mastra` is the **recommended** way to get started with Mastra" (emphasis in source).

**Implications:** Mastra's install UX is PM-agnostic on the face but npm-ordered in priority. The tab switcher is the classic react/vite/next.js pattern — no OS detection, no "which PM are you using" prompt — just 4 copy-paste targets.

### Finding: Speakeasy leads with Homebrew, then curl-pipe-sh, then Windows PMs, then manual

**Confidence:** CONFIRMED
**Evidence:** [speakeasy.com/docs/speakeasy-reference/cli/getting-started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started)

Getting Started page lists install methods in fixed prose order:

1. `brew install speakeasy-api/tap/speakeasy`
2. `curl -fsSL https://go.speakeasy.com/cli-install.sh | sh`
3. `winget install speakeasy`
4. `choco install speakeasy`
5. Manual download

No tab switcher, no JS-driven OS auto-detection, no npm option, no Scoop, no Docker option. Post-install guidance: "Simply type `speakeasy` in the terminal for a guided set-up and usage experience."

**Implications:** Speakeasy's ordering is macOS-first (Homebrew), Unix-ish-second (curl | sh), Windows-third. The absence of an npm option is a deliberate product choice (D2), not an oversight.

---

## Comparative observation

Mastra vs Speakeasy diverge on the primary install channel because of their language of implementation:

| Vendor    | First-shown command                        | Channel                         | Motivation                                          |
| --------- | ------------------------------------------ | ------------------------------- | --------------------------------------------------- |
| Mastra    | `npm create mastra@latest`                 | npm (tab switcher across 4 PMs) | TS/Node CLI; npm is the native distribution surface |
| Speakeasy | `brew install speakeasy-api/tap/speakeasy` | Homebrew                        | Go binary; brew is the conventional macOS channel   |

Neither vendor uses OS auto-detection; both require the user to self-select. Mastra's PM tab switcher is the richer UX for an ecosystem (Node) that has multiple runners; Speakeasy's prose-ordered list is optimized for a binary-distribution world where users tend to know which OS-level PM they use.

---

## Negative searches

- No evidence Mastra publishes an "Installation" page at `/docs/getting-started/installation` — WebFetch returned 404 on that path. The Quickstart-on-landing-page IS the installation UX.
- No evidence Speakeasy publishes a tab-switcher install UX — the Getting Started page is a static ordered list.

---

## Gaps / follow-ups

- Whether Mastra's tab order (npm first) is A/B tested or a durable product decision — not documented.
- Whether Speakeasy considered adding an npm entry post-goreleaser — no public RFC or issue surfaced.

