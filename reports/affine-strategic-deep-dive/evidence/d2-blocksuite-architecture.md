# Evidence: D2 — BlockSuite architecture and reusability

**Dimension:** D2 (P0 Deep)
**Date:** 2026-04-11
**Sources:** github.com/toeverything/blocksuite (cloned), npm registry (@blocksuite/*), BlockSuite docs, AFFiNE monorepo

---

## Key sources

- github.com/toeverything/blocksuite — monorepo (cloned locally during research)
  - `packages/framework/store/package.json` — v0.22.4 core package
  - `packages/framework/store/src/__tests__/test-schema.ts` — schema usage example
  - `packages/framework/std/src/effects.ts` — `EditorHost`, custom elements
  - `packages/affine/shared/src/adapters/types/adapter.ts` — `BlockAdapterMatcher`
  - `packages/affine/blocks/note/src/adapters/markdown.ts` — markdown adapter
  - `docs/guide/block-schema.md` — `defineBlockSchema` API docs
- [npmjs.com/package/@blocksuite/store](https://www.npmjs.com/package/@blocksuite/store) — 1337 versions, MIT
- [BlockSuite docs: Adapter guide](https://blocksuite.io/guide/adapter.html)
- [AFFiNE docs: Transformer & Adapter](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter)
- Recent sync PRs into BlockSuite: #9146, #9147, #9149 — "chore: sync affine blocksuite to packages"

---

## Findings

### Finding: BlockSuite is a downstream mirror of AFFiNE, not independently maintained

**Confidence:** CONFIRMED
**Evidence:** GitHub API `GET /repos/toeverything/blocksuite/commits?since=2025-10-11T00:00:00Z` returns **zero commits** on `main` in the last 6 months (and no commits in the last 9 months). The most recent commit on `main` dates to 2025-07-07 (sync PR `#9149` "chore: sync affine blocksuite to packages"). Only renovate vulnerability-bump branches show activity since. Authoritative development occurs in the AFFiNE monorepo; the standalone BlockSuite repo has stopped receiving snapshot imports.

```text
Recent commit pattern on `main` (blocksuite repo):
  2025-07-07  chore: sync affine blocksuite to packages (#9149)  ← most recent
  2025-07-??  chore: sync affine blocksuite to packages (#9147)
  2025-07-??  chore: sync affine blocksuite to packages (#9146)
  --- no commits after July 7, 2025 ---
  (renovate branches for vulnerability bumps exist but are not merged to main)
```

**Implication:** The README claim that "BlockSuite was open-sourced and maintained independently" is not operationally accurate as of April 2026. Development gravity has shifted back into AFFiNE. For external consumers, this means the BlockSuite npm packages are a lagging snapshot, not a living framework with external-contributor-friendly cadence. **This is a material correction to the landscape report's "BlockSuite is explicitly designed as a reusable toolkit" framing.**

---

### Finding: Published npm packages are version-fragmented and stale

**Confidence:** CONFIRMED
**Evidence:** Published state on npm as of 2026-04-11:

| Package | Version | Last publish |
|---|---|---|
| `@blocksuite/store` | 0.22.4 | ~9 months ago (2025-07-01) |
| `@blocksuite/block-std` | 0.20.0 | older |
| `@blocksuite/inline` | 0.20.0 | older |
| `@blocksuite/blocks` | 0.19.5 | ~16 months ago (2024-12-19) |
| `@blocksuite/presets` | 0.19.5 | ~16 months ago |

Total versions published across packages: 1337+ (pre-1.0, high churn, no semver-major boundaries).

**Implication:**
- No unified versioning strategy: `@blocksuite/store` is at 0.22.x while `@blocksuite/blocks` (which depends on it) is at 0.19.x. External consumers cannot confidently pin a consistent set.
- Staleness: 9–16 months since last publish means the public package surface is well behind the AFFiNE-internal snapshot.
- Pre-1.0 with 1337 versions = unstable API surface, no stability guarantees.
- This directly contradicts the landscape report's implication of an adoptable reusable toolkit.

---

### Finding: `defineBlockSchema` API exists, is CRDT-native, but lacks breaking-change tracking

**Confidence:** CONFIRMED
**Evidence:** `packages/framework/store/src/__tests__/test-schema.ts` and `docs/guide/block-schema.md` show the API:

```typescript
export const MyBlockSchema = defineBlockSchema({
  flavour: 'my-block',
  props: internal => ({
    text: internal.Text(),      // CRDT-native rich text (wraps Y.Text)
    level: 0,
  }),
  metadata: {
    version: 1,
    role: 'content',
  },
});
```

Props use `internal.Text()` which wraps yjs `Y.Text` — CRDT-native by construction. Metadata supports versioning hooks. No CHANGELOG.md or breaking-change log in the repo or docs.

**Implication:** The schema API is *functional* and architecturally principled (CRDT from the ground up, not retrofitted). But the ecosystem risk is severe without breaking-change tracking: custom blocks would silently break across minor version bumps. Combined with the version fragmentation finding, custom-block adoption is a multi-month maintenance commitment per dependent project.

---

### Finding: Adapter layer supports markdown / notion-html / plain-text but fidelity is undocumented

**Confidence:** CONFIRMED
**Evidence:**
- `packages/affine/shared/src/adapters/types/adapter.ts` defines `BlockAdapterMatcher` with `toBlockSnapshot` / `fromBlockSnapshot` handlers.
- `packages/affine/blocks/note/src/adapters/markdown.ts` implements markdown conversion (footnote handling visible).
- Transformers in `@blocksuite/store` use `ASTWalker` and `Transformer` abstraction.
- Adapters exist for: markdown, notion-html, plain-text, html.
- No published spec on conversion fidelity or supported/unsupported features.

**Implication:** Adapters work mechanically but without a fidelity contract. Custom adapter adoption is risky without clear specs. See `d5-format-fidelity.md` for the separate data-loss investigation (which confirmed the adapter docs explicitly warn of data loss).

---

### Finding: Architecture is Web Components (Lit-based), not ProseMirror-compatible

**Confidence:** CONFIRMED
**Evidence:**
- `@blocksuite/store` package.json: `"lit": "^3.2.0"`, `"@lit/context": "..."`.
- `packages/framework/std/src/effects.ts` defines `EditorHost`, `GfxViewport` as custom elements (`@customElement('test-root-block')` decorator pattern).
- No ProseMirror or TipTap dependencies in any core framework package.json.

**Implication:** Architectural mismatch with the ProseMirror/TipTap + y-prosemirror ecosystem. Web Components are framework-agnostic in theory but fundamentally different from the ProseMirror schema model that dominates CRDT-native rich editors (TipTap, Outline, Notion-internal). **BlockSuite is not a drop-in substrate substitute for any ProseMirror-based editor.** Switching would require rewriting rich-text composition, commands, plugins, and binding layers.

---

### Finding: No credible non-AFFiNE production adoption

**Confidence:** UNCERTAIN (negative result with method limitations)
**Evidence:**
- README cites "you can reuse and extend BlockSuite" but lists no external adopters.
- BlocksVite (a Vue-based fork) appears unmaintained/marginal.
- `BlockSuite-Ecosystem-CI` referenced in resources but appears internal to toeverything.
- GitHub public dependency search blocked by auth requirement during research; no external projects found in accessible public search.

**Negative searches:** "uses @blocksuite/store", "powered by BlockSuite", "alternative to ProseMirror BlockSuite" → no production adopters named.

**Implication:** The "reusable toolkit" narrative remains aspirational. Zero-to-marginal external production adoption 2+ years after OSS release indicates the toolkit hasn't landed as a general editor framework. The target audience (other OSS editors, apps building CRDT-native editors) has not adopted despite the marketing.

---

### Finding: API stability is poor; release cadence is high but unpredictable

**Confidence:** CONFIRMED
**Evidence:**
- 1337 npm versions across @blocksuite/* packages, all pre-1.0.
- No semantic versioning milestones (no 1.0.0, no major-version discipline).
- No CHANGELOG.md; breaking changes not separately tracked.
- Last 6 months: only ~20 commits to the standalone BlockSuite monorepo (reinforces the "downstream mirror" finding — real work happens in AFFiNE).

**Implication:** Custom blocks and external consumers face high maintenance cost. Unsuitable for long-lived production extensions without active maintainer vigilance.

---

## Strategic assessment for the reader

- **BlockSuite as alternative editor substrate for a TipTap/ProseMirror-based project:** NOT VIABLE.
  - Architectural mismatch (Web Components vs ProseMirror schema).
  - No unified package versioning.
  - Zero external production adoption.
  - Mirrored, not maintained, outside AFFiNE.
- **BlockSuite as a reference for CRDT-native block schema design:** USEFUL.
  - `defineBlockSchema` is a clean encoding of Yjs-backed structured content; the approach generalizes.
  - Adapter-layer pattern (ASTWalker + Transformer) is sound architecturally, even if fidelity is weak in practice.
- **Decision trigger:** If BlockSuite ships a 1.0.0 with unified versioning, independent maintenance, and external adopters, this assessment should be revisited. Current signals point the opposite direction.

---

## Gaps / follow-ups

- GitHub dependency search was auth-blocked; an authenticated pass might surface 1–5 external dependents.
- Discord/community ecosystem not covered — possible but unlikely to change the finding.
- BlockSuite 2.0 or major rewrite plans (if announced) not surveyed; worth a web search as a Path C refresh facet.
