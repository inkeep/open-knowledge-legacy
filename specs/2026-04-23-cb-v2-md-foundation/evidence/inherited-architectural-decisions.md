---
source: specs/2026-04-14-component-blocks-v2/SPEC.md (CB-v2 parent spec)
kind: reference-pointers
cutoff: 2026-04-23
---

# Inherited architectural decisions from CB-v2

This spec narrows CB-v2's 17-component scope to a 5-pack but **inherits the architectural decisions unchanged**. Listed here as file:line-scoped pointers for discoverability. No text is copied — consult the parent spec for rationale and evidence.

## LOCKED decisions that stay active

| ID | Brief | Parent spec anchor |
|---|---|---|
| D0 | Supersede PR #23 + block-editor-ux SPEC | `specs/2026-04-14-component-blocks-v2/SPEC.md` §10 D0 |
| D1 | One `jsxComponent` node; widened `atom: false, content: 'block*'` | §10 D1 |
| D2 | Build additively on #105 | §10 D2 |
| D5 | Expression attrs: JSON.parse simple, raw-string complex, spread → sourceRaw | §10 D5 |
| D6 | γ hybrid serialization (jsxComponent only) | §10 D6 |
| D7 | Custom flush-left `mdxJsxFlowElement` to-markdown handler | §10 D7 |
| D11 | G9 bridge always-live; `parseWithFallback` + single-pass `findFallbackRegion` | §10 D11 |
| D13 | CM-in-PM for `rawMdxFallback`; direct PM dispatch | §10 D13 |
| Q6 | Wildcard `'*'` descriptor: `hasChildren: true` default | §11 Q6 |
| Q10 | `bridgeId` in PM PluginState (WeakMap), not schema attr | §11 Q10 |

## FLIPPED decisions that stay FLIPPED

| ID | Brief | Stays flipped to |
|---|---|---|
| D8 | Inline Layer 3 → flipped → NG14 (jsxInline is thin shape, source text in WYSIWYG) | NG14 active |
| D9 | Custom-component registration via `.open-knowledge/components.ts` → flipped → NG13 | NG13 active |
| D10 | Custom components in scope → flipped → NG13 | NG13 active |

## Precedents introduced by CB-v2 that stay active

| # | Precedent | Parent location |
|---|---|---|
| 24 | Direct PM dispatch for nested editors | `CLAUDE.md` / `AGENTS.md` §Architectural precedents + CB-v2 SPEC §9.0 |
| 26 | All user content always visible + invalid states surface source editor | same |

## Precedent retracted on this branch

- **Precedent #25 (Context Bridge Registry for compound React components across NodeView portals)** — retracted from this branch's `AGENTS.md` because the 5-pack has zero compound consumers. Preserved verbatim on PR #165 branch at commit `e56f33c3`. Re-add when compound tier ships (NG19).

## Narrowed decisions

| ID | Was | Narrowed to |
|---|---|---|
| D3 | 18 → 17 built-ins | 5 (Callout, Image, Video, Audio, Accordion) |
| D12 | Use fumadocs-ui directly + Context Bridge Registry | "Use fumadocs-ui directly" dropped (all 5 DIY); "Context Bridge Registry" retracted (no compound consumers). Fidelity-priority design principle stays — our DIY components adopt fumadocs patterns where researched (see `reports/cb-v2-image-superset-research/REPORT.md` for ImageZoom patterns). |

## Non-goals inherited with no change

- NG1 (absorbed into NG13), NG2, NG3 (refined), NG4, **NG5, NG6, NG7, NG7a** (NEVER items — load-bearing invariants), NG8, NG9, NG10, NG11, **NG12** (γ-dirty normalization accepted fidelity gap), NG13, NG14, NG15.

See parent SPEC §3 for full text of each.

## Invariants inherited

- I12 (pristine byte-identity): scoped to 5-pack
- I13 (edited-path idempotence): scoped to 5-pack
- I14 (rawMdxFallback byte-identity): unchanged
- I15 (Observer B vs mdManager parity): scoped to 5-pack
- I16 (nested effectiveDirty): **DELETED** this spec (NG25). Compound parent-child only; restore with compound tier.
- I17 (all-user-content-visible STOP rule): unchanged; static source scan

## Tests inherited + adjusted

Per `reports/worldmodel-pr-165-component-blocks-v2/audit-mvp-component-claims.md` — the 5-pack exercises (refreshed 2026-04-23 post-D-MF11/D-MF14/D-MF16/D-MF17 decisions):
- enum PropDef (Callout `type` × **5 GFM values** per D-MF11; Image `loading`, Video `preload`, Audio `preload`)
- string PropDef (every descriptor has at least one)
- number PropDef (Image dimensions only; Video dimensions excluded per D-MF12 narrow)
- boolean PropDef (Video 4 booleans; Audio 3 booleans; Accordion `defaultOpen` per D-MF14/D-MF16; Callout `collapsible` + `defaultOpen` per D-MF17)
- reactnode PropDef (every descriptor `children`; Accordion `icon` before D-MF14 narrow to namespaced-string form)

## Source fidelity note

All inherited architectural decisions trace to CB-v2 SPEC as recorded at commit `315deae6` (this spec's baseline). Any future amendment to the parent spec triggers a re-read check on this spec.
