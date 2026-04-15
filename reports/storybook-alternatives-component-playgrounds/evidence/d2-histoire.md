# Evidence: D2 — Histoire

**Dimension:** Histoire (histoire-dev/histoire) — Vue/Svelte focus, React support status, controls system
**Date:** 2026-04-14
**Sources:** https://histoire.dev, https://histoire.dev/guide/getting-started, https://histoire.dev/guide/vue3/controls, https://api.github.com/repos/histoire-dev/histoire, https://api.npmjs.org/downloads/point/last-month/histoire, https://github.com/histoire-dev/histoire/discussions/199

---

## Key files / pages referenced
- https://histoire.dev/guide/getting-started — Frameworks supported: Vue 3, Svelte 3/4 only
- https://histoire.dev/guide/vue3/controls — Controls slot pattern, HstText/HstCheckbox
- https://github.com/histoire-dev/histoire/discussions/199 — React support discussion thread
- GitHub API: last pushed 2026-04-14, 3,533 stars, 209 forks, 196 open issues

---

## Findings

### Finding: Histoire does NOT support React — Vue 3 and Svelte 3/4 only
**Confidence:** CONFIRMED
**Evidence:** https://histoire.dev/guide/getting-started + GitHub discussion #199

```text
Official docs: "Currently Supported Frameworks: Vue 3 (3.2+) and Svelte (4+)"
Getting started page shows Ladle as the recommended alternative for React users.
Discussion #199 (July 2022 and ongoing): multiple users requesting React support, 
  no response from maintainers, no official position issued.
  User quote: "I don't believe I've found a project without React support. 
  Makes sense, when there is no React-ion."
```

**Implications:** Histoire is not a viable tool for React projects. The Histoire docs themselves point React users to Ladle. Any article claiming "Histoire has a React adapter" reflects either outdated or aspirational content.

---

### Finding: Histoire's controls system uses an explicit template slot pattern with reactive state — fundamentally different from Storybook args
**Confidence:** CONFIRMED
**Evidence:** https://histoire.dev/guide/vue3/controls.html (official docs)

```text
Controls declared in <template #controls> slot within Story/Variant components.
State defined via Vue Composition API (setup return), Options API (data()), or <script setup>.
Built-in control components: HstText, HstCheckbox (+ more at controls.histoire.dev).
"Histoire will inspect and synchronize this reactive data."
initState prop enables per-variant state initialization.
HstText, HstCheckbox bind via v-model directly to reactive state.
```

**Implications:** Histoire's controls model is Vue-idiomatic — reactive state objects, v-model binding. This is more explicit than Storybook's args but requires Vue-specific knowledge. There's no equivalent for React since the framework isn't supported.

---

### Finding: Histoire's story format uses Vue SFC (.story.vue files) — not CSF-compatible
**Confidence:** CONFIRMED
**Evidence:** https://histoire.dev official docs + comparison articles

```text
Stories use *.story.vue file format for Vue, *.story.svelte for Svelte.
Not compatible with Storybook's CSF (*.stories.tsx/jsx).
Own format: <Story> and <Variant> component tags in templates.
Variants are the Histoire equivalent of Storybook stories — named sub-states per component.
```

**Implications:** No story portability between Histoire and Storybook/Ladle.

---

### Finding: Histoire maintenance status — last release Apr 2024, active repo pushes Apr 2026, 196 open issues
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry

```text
GitHub: 3,533 stars, 209 forks, last pushed 2026-04-14 (TODAY), 196 open issues
npm (histoire package): v1.0.0-beta.1, maintained by akryum (Guillaume Chau)
Latest release tag: v0.17.17, published 2024-04-09
Monthly downloads (Mar 15–Apr 13 2026): 353,753
```

**Implications:** The npm package version (v0.17.17 latest release April 2024) combined with 196 open issues and Vue/Svelte-only scope suggests the project has not reached v1 stable for its core use case. Active repo pushes suggest ongoing maintenance, but the beta label on the v1.0.0 npm tag and the unresponded React discussion are caution signals.

---

## Negative searches
- Searched: Histoire React adapter, plugin, npm package for React → NOT FOUND (confirmed by docs and discussion #199)
- Searched: Histoire v1 stable release → NOT FOUND (only v1.0.0-beta.1 on npm)

---

## Gaps / follow-ups
- Whether the v0.17.17 latest release gap (Apr 2024) vs. active GitHub pushes (Apr 2026) reflects a documentation site update vs. npm package updates — would need to check the GitHub releases page more carefully
