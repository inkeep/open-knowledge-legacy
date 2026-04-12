# Evidence: D6 — y-octo CRDT engine maturity

**Dimension:** D6 (P1 Moderate)
**Date:** 2026-04-11
**Sources:** github.com/toeverything/y-octo (cloned), crates.io, npm

---

## Key sources

- github.com/toeverything/y-octo (cloned locally during research)
  - `y-octo/Cargo.toml` — workspace package, version 0.0.2
  - `y-octo-node/package.json` — private (unpublished)
  - `y-octo-utils/yrs-is-unsafe/README.md` — critique of the alternative Rust Yjs impl
  - `README.md` — adoption claims
- crates.io — searched "y-octo", not published
- npm registry — searched `y-octo-node`, not published

---

## Findings

### Finding: y-octo is pre-1.0 (v0.0.2) after years of development

**Confidence:** CONFIRMED
**Evidence:** `y-octo/Cargo.toml` declares `version = "0.0.2"`. Never reached 0.1.0. No release tags marking stability milestones.

**Implication:** The versioning signals explicit pre-alpha status. External adoption is not invited by the maintainers' own semver discipline.

---

### Finding: Tiny maintainer team; low commit velocity

**Confidence:** CONFIRMED
**Evidence:** GitHub API returns 13 commits on `main` in the last 6 months. Contributors: DarkSky (11 of 13), LongYinan (1), Hongxu Xu (1), Yii (1 — shared attribution). README lists 3 maintainers.

**Implication:** Bus factor is dangerously low for infrastructure intended for external adoption. Comparable yjs core has a much larger contributor base and release cadence.

---

### Finding: yjs-compat is partial — v1 updates done, v2 WIP

**Confidence:** CONFIRMED
**Evidence:** README's compatibility checklist:
- `✅` Yjs binary encoding, Awareness, Primitive types, Sync Protocol, Yjs update v1 encoding
- `🚧` Yjs update v2 encoding (in progress)

`y-octo-node/Cargo.toml` lists `yjs: ^13.6.29` only in dev-dependencies (for compat testing), not runtime.

**Implication:** NOT a drop-in replacement. Existing yjs-based systems relying on update v2 or newer protocol features cannot swap in y-octo without testing/migration. The "yjs-compatible" framing in marketing is narrower than it sounds.

---

### Finding: yrs-rejection rationale is technically legitimate

**Confidence:** CONFIRMED
**Evidence:** `y-octo-utils/yrs-is-unsafe/README.md` documents three specific issues with `yrs` (the more widely known Rust port of yjs):

1. **Multi-threading unsafety:** yrs uses interior mutability without `Send`/`Sync`; panics on concurrent access.
2. **Memory bloat:** Example code `Update::decode_v1(&[255, 255, 255, 122])` — 4 bytes input — allocates **538 MB** resident memory. Mysc's mobile apps experienced OOMs.
3. **Panic-everywhere error handling:** yrs panics rather than returning `Result`, breaking Rust's safety assumptions for server-side use.

**Implication:** The "why not yrs" rationale is not gratuitous — it's an engineering case based on measurable pathologies. For a mobile/server deployment under memory and stability pressure, y-octo solves a real problem. **However, this narrow value proposition (Rust servers + mobile) is not relevant to JS/TS editor ecosystems** that would use yjs directly, not via a Rust binding.

---

### Finding: Production use is limited to AFFiNE + Mysc

**Confidence:** CONFIRMED
**Evidence:**
- README "Who are using" section: AFFiNE (Electron + Node.js backend), Mysc (Rust server + mobile clients). No other named users.
- `y-octo-node` not published to npm (package.json: `"private": true`). NAPI build only.
- `y-octo` **is** published on crates.io — but stalled at v0.0.2 (last update 2026-01-10, never reached 0.1.0). A `cargo add y-octo` is mechanically possible but adopts pre-alpha software.
- No benchmarks published.

**Implication:** y-octo is effectively a **toeverything-internal infrastructure library**. The crate exists on crates.io as a publication formality, but with no public npm package, no CHANGELOG, no benchmarks, no stability guarantees, and pre-alpha versioning, external adoption is impractical. Mysc (the only named non-AFFiNE user) is also connected to toeverything per Mysc's own product positioning.

---

### Finding: Swift/Kotlin bindings "coming soon" but not in public repo

**Confidence:** CONFIRMED
**Evidence:** README: "Mysc is using y-octo in the Rust server, and the iOS/Android client via the Swift/Kotlin bindings (Official bindings coming soon)." No Swift or Kotlin sources in the repo.

**Implication:** Mysc's public adoption story includes bindings that the maintainers haven't published. The external-facing claims are misleading as a general adoption narrative.

---

## Strategic assessment for the reader

- **y-octo as yjs replacement for a JS/TS editor stack:** NOT APPLICABLE. The editor substrate for a TipTap+y-prosemirror project is JS-native yjs; y-octo only matters if building a Rust server or native mobile client that speaks yjs wire protocol.
- **y-octo as a reference for CRDT engine architecture:** NARROW VALUE. Worth understanding if designing a Rust-backed server-side CRDT. The yrs critique is the most valuable artifact for engineers evaluating Rust CRDT libraries — independent of AFFiNE entirely.
- **Decision trigger:** y-octo would matter strategically only if an open-knowledge-style project were building native mobile/Rust-server CRDT sync. It does not displace or augment yjs for a JS/TS editor.

---

## Gaps / follow-ups

- No performance benchmarks (memory, throughput, latency) published or found. Vendor's "ultra-fast" claims are unverified.
- No side-by-side test of y-octo vs yjs protocol compatibility in edge cases.
- Road to 1.0.0 not communicated publicly.
