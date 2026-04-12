# Evidence: npm Package Obfuscation & Compiled Distribution

**Dimension:** npm Package Obfuscation
**Date:** 2026-04-11
**Sources:** terser docs, javascript-obfuscator docs, npm docs, academic research, napi-rs docs

---

## Key sources
- [Terser Options docs](https://terser.org/docs/options/)
- [javascript-obfuscator GitHub](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [JsDeObsBench (ACM CCS 2025)](https://dl.acm.org/doi/10.1145/3719027.3744871)
- [webcrack](https://github.com/j4k0xb/webcrack) — deobfuscation tool
- [humanify](https://github.com/jehna/humanify) — LLM-based variable renaming
- [napi-rs docs](https://napi.rs/docs/introduction/getting-started)
- [npm developers docs](https://docs.npmjs.com/cli/v11/using-npm/developers/)

---

## The Protection Ladder

| Level | Technique | Protection | Performance Cost | Reversibility |
|-------|-----------|-----------|-----------------|---------------|
| 1 (Baseline) | `"files"` allowlist, no source maps, .d.ts only | Low | None | Trivial (prettier) |
| 2 (Moderate) | terser (mangle + compress) | Low-Medium | Negligible | Easy (de4js, prettier) |
| 3 (Substantial) | javascript-obfuscator (control flow, strings, dead code) | Medium | 15-80% runtime | Moderate (webcrack, days) |
| 4 (Strong) | Rust → napi-rs native binary addon | High | Platform-specific builds | Hard (decompilation) |
| 5 (Strongest) | Server-side execution; logic never ships | Maximum | Requires server infra | N/A |

## Key Finding: JS obfuscation is a speed bump, not a wall
**Confidence:** CONFIRMED

Academic benchmarks: JSimplifier achieves 100% processing across all 20 obfuscation techniques. webcrack specifically targets obfuscator.io output. LLMs achieve ~466% readability improvement. humanify uses GPT to rename mangled variables. Cost to deobfuscate with ChatGPT: ~$0.50.

## Key Finding: Compiled-only npm distribution is straightforward
**Confidence:** CONFIRMED

Pattern: (1) Use `"files"` in package.json as allowlist: `["dist/**/*.js", "dist/**/*.d.ts"]`. (2) `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`. (3) `"sourceMap": false, "declarationMap": false`. (4) Verify with `npm pack --dry-run`. Source maps are the #1 leak vector.

## Key Finding: napi-rs provides strongest npm-compatible IP protection
**Confidence:** CONFIRMED

Compiles Rust to platform-specific `.node` binary addons. Published as scoped packages with platform suffixes. Binary is opaque — standard decompilation orders of magnitude harder than JS deobfuscation. Requires cross-compilation CI.

## Key Finding: Architectural choices matter more than obfuscation
**Confidence:** INFERRED

Cursor/Vercel keep valuable logic server-side. The client receives only rendered output. Neither relies primarily on JS obfuscation. Most effective strategy: keep sensitive algorithms server-side where they never ship to clients at all.

---

## Gaps / follow-ups
* WASM as middle ground (AssemblyScript, wasm-pack) not deeply explored
* Specific terser + javascript-obfuscator pipeline configurations not benchmarked
