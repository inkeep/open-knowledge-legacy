# Evidence: Frontmatter Library Comparison

**Dimension:** Frontmatter parsing — build vs buy
**Date:** 2026-04-10
**Sources:** npmjs.com package pages, GitHub repos, bundlephobia

---

## Key packages evaluated

| | **front-matter** | **gray-matter** | **yaml-front-matter** |
|---|---|---|---|
| Weekly downloads | ~4.6M | ~5.6M | ~73K |
| Unpacked size | 11 KB (1 file) | 39 KB (10 files) | — |
| Dependencies | 1 (`js-yaml`) | 4 (`js-yaml`, `kind-of`, `section-matter`, `strip-bom-string`) | 2 (`js-yaml`, `commander`) |
| TypeScript | Built-in `index.d.ts` | Built-in `gray-matter.d.ts` | None |
| Parse | Yes | Yes | Yes |
| **Serialize/stringify** | **No** (parse-only) | **Yes** (`matter.stringify()`) | No |
| YAML engine | `js-yaml` | `js-yaml` (pluggable) | `js-yaml` |
| Last publish | 2022 (v4.0.2) | 2022 (v4.0.3) | 2022 (v4.1.1) |

---

## Findings

### Finding: All three libraries depend on `js-yaml`, not `yaml`
**Confidence:** CONFIRMED
**Evidence:** npm dependency trees for front-matter@4.0.2, gray-matter@4.0.3, yaml-front-matter@4.1.1

The codebase already uses the `yaml` package (Eemeli Aro) for config loading and frontmatter serialization. Adding any of these libraries would introduce `js-yaml` as a redundant second YAML parser in the dependency tree.

### Finding: `front-matter` is parse-only — no serialize/stringify
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/front-matter — API exposes `fm(string)` returning `{ attributes, body, bodyBegin, frontmatter }`. No `stringify` or `serialize` export.

The wiki catalog generator needs both parse (reading article frontmatter) and serialize (writing INDEX.md frontmatter). `front-matter` only covers half the use case.

### Finding: `gray-matter` is the most capable but heaviest
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/gray-matter — supports parse + stringify, pluggable YAML engines (could swap in `yaml` for `js-yaml`), custom delimiters, excerpt extraction. However, it brings 4 transitive dependencies.

gray-matter's engine-pluggable architecture means you _could_ configure it to use the `yaml` package, but this adds complexity for functionality achievable in ~30 lines of custom code.

### Finding: `yaml-front-matter` is not a viable candidate
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/yaml-front-matter — ~73K weekly downloads (vs 4-5M for alternatives), no TypeScript types, ships `commander` as a dependency (CLI tool bundled into the library).

---

## Decision

**Keep the hand-rolled approach.** Extract frontmatter parsing into a shared `wiki/frontmatter.ts` utility using the existing `yaml` package:

- `parseFrontmatter(content)` — regex extracts the `---` block, `yaml.parse()` returns typed object
- `serializeFrontmatter(data)` — `yaml.stringify()` + `---` delimiters

**Rationale:**
1. Zero new dependencies — reuses `yaml` already in the tree
2. No `js-yaml` duplication — all three libraries would add a second YAML parser
3. Trivial implementation (~30 lines) with dedicated tests
4. Full control over parse + serialize behavior

**Implications:** The `yaml` package is the canonical YAML dependency for this project. See `js-yaml-vs-yaml-comparison.md` for why `yaml` was chosen over `js-yaml`.
