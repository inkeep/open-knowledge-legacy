# Evidence: D4 — React Cosmos

**Dimension:** React Cosmos (react-cosmos/react-cosmos) — fixture model, controls, registration, vs Storybook
**Date:** 2026-04-14
**Sources:** https://reactcosmos.org/docs, https://reactcosmos.org/docs/fixtures/fixture-inputs, https://api.github.com/repos/react-cosmos/react-cosmos, https://api.npmjs.org/downloads/point/last-month/react-cosmos

---

## Key files / pages referenced
- https://reactcosmos.org/docs — Architecture overview
- https://reactcosmos.org/docs/fixtures/fixture-inputs — useFixtureInput, useFixtureSelect
- https://reactcosmos.org/docs/fixtures — Fixture model overview
- GitHub API: 8,656 stars, v7.2.0 released 2026-03-05

---

## Findings

### Finding: React Cosmos uses fixtures — not stories. A fixture is a module exporting a React element or element factory.
**Confidence:** CONFIRMED
**Evidence:** https://reactcosmos.org/docs + https://reactcosmos.org/docs/fixtures

```text
"File-system based module convention for defining component states effortlessly."
A fixture is any file that exports a React component (Node fixture) or an element.
No default export metadata object (unlike Storybook CSF's default export with title/component).
No argTypes or args declarations required.
File naming: *.fixture.tsx or files inside __fixtures__/ directories.
```

**Implications:** Fixture model is fundamentally simpler than Storybook stories — it's just a React component file. No special DSL, no metadata object. This reduces boilerplate but also reduces discoverability at the metadata level.

---

### Finding: React Cosmos auto-generates prop controls for Node fixtures without any configuration
**Confidence:** CONFIRMED
**Evidence:** https://reactcosmos.org/docs/fixtures/fixture-inputs

```text
"Prop inputs are created automatically for Node fixtures in the Cosmos UI."
"Enables you to tweak component props and see the result in real time without any configuration."
This applies when the fixture exports a React element (JSX) — Cosmos inspects the component's props.
```

**Implications:** This is the only tool surveyed that provides truly zero-config automatic prop controls from React components — no argTypes, no type extraction config, no TypeScript integration required. The mechanism appears to be runtime prop inspection of the rendered element.

---

### Finding: React Cosmos fixture inputs use React hook APIs (useFixtureInput, useFixtureSelect) — controls as hooks inside fixtures
**Confidence:** CONFIRMED
**Evidence:** https://reactcosmos.org/docs/fixtures/fixture-inputs

```text
useFixtureInput(name, defaultValue): serializable data (string, number, boolean, object, array).
  Returns [value, setValue] tuple like useState.
  Number inputs: arrow key increments; modifier keys adjust step size.
  Boolean Input Plugin: converts to checkboxes.
useFixtureSelect(name, { options }): dropdown with predefined options.
  Grouped options: array of { group, options } objects.
  Returns getter + setter tuple.
Both hooks generate controls in the Control Panel automatically.
```

**Implications:** Fixture inputs are a hooks-first controls model. This is more React-idiomatic than Storybook's external args/argTypes pattern — the control definition lives inside the component's rendering code. The trade-off: fixture inputs couple the component file to the test infrastructure (hooks only work inside Cosmos fixtures).

---

### Finding: React Cosmos is React-only, library-over-framework approach — integrates with any bundler
**Confidence:** CONFIRMED
**Evidence:** https://reactcosmos.org/docs

```text
"Library over framework approach — modular design allows integration with various bundlers."
"Dedicated to React — solely focused on React to harness the full potential of the React component model."
Plugin system for extending capabilities.
Decorators: wrapper components for fixture enhancement (analogous to Storybook decorators).
Fixture Options: per-fixture configuration.
```

**Implications:** React Cosmos's library model means less configuration lock-in compared to Storybook's opinionated framework. But it also means less out-of-box tooling.

---

### Finding: React Cosmos maintenance status — v7.2.0 released 2026-03-05, actively maintained
**Confidence:** CONFIRMED
**Evidence:** GitHub API + npm registry

```text
GitHub: 8,656 stars, 386 forks, last pushed 2026-04-07, 7 open issues (very low — well-maintained signal)
Latest release: v7.2.0, 2026-03-05 (React 19 + Next.js 15 support)
Monthly downloads (Mar 15–Apr 13 2026): 118,504
npm: react-cosmos@7.2.0, MIT, peer deps: React 18+
```

**Implications:** Highest GitHub stars among non-Storybook alternatives (8.6K). Very low open issues (7) is a strong maintenance signal. React 19 support confirmed. Downloads (118K/month) are much lower than Playroom or react-live, suggesting it's used by smaller but committed audience.

---

## Negative searches
- Searched: React Cosmos multi-framework (Vue, Svelte, Angular) support → NOT FOUND (React-only by design)
- Searched: React Cosmos CSF story format compatibility → NOT FOUND (own fixture format, not CSF)

---

## Gaps / follow-ups
- Exact mechanism for automatic prop controls on Node fixtures (runtime prop inspection vs static type extraction) — not fully documented
- Whether decorator system is equivalent to Storybook's in power/scope
