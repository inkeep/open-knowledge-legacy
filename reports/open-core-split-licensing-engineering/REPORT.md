---
title: "Open-Core Split Licensing Engineering Patterns: ee/ Directories, AGPL Linking Exceptions, and npm IP Protection"
description: "How open-core companies architecturally implement split licensing — structuring proprietary code alongside open-source code, building/distributing compiled-only npm packages, handling contributor boundaries, and using AGPL linking exceptions. 13 company code-first case studies, legal mechanics, npm obfuscation effectiveness, and a three-tier architecture design for AGPL + proprietary compiled modules."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - Cal.com
  - Formbricks
  - Infisical
  - GitLab
  - Grafana
  - Documenso
  - Dub.co
  - Twenty
  - Appsmith
  - Mastra
  - Activepieces
  - n8n
  - Tldraw
  - Liveblocks
  - Firecrawl
  - napi-rs
  - terser
  - javascript-obfuscator
topics:
  - open core engineering
  - split licensing
  - npm obfuscation
  - AGPL linking exceptions
---

# Open-Core Split Licensing Engineering Patterns

**Purpose:** Provide evidence-based engineering guidance for implementing a three-tier licensing architecture — AGPL framework + proprietary compiled engine modules + paid enterprise features — informed by how 13+ companies actually structure this in their codebases.

---

## Executive Summary

The open-core ee/ directory pattern has converged on a remarkably standardized approach: **a directory-based split with a shared license template, shipped in every deployment, gated at runtime by license key validation.** This is the dominant pattern across Cal.com, Formbricks, Documenso, Dub.co, Papermark, Infisical, and Activepieces — all using nearly identical license text.

**Key Findings:**

- **The ee/ license template is a shared convention.** At least 8 companies use nearly identical text derived from a common template: "May only be used in production if you have a valid [Company] Enterprise License." Dev/testing is always free. This template is the de facto standard.

- **Most companies ship ee/ source to everyone.** 11 of 13 companies include enterprise code in the public repo and gate at runtime via license keys, not at build time. Only Grafana (separate private repo + Go build tags) and Appsmith (stub files swapped at build time) achieve true build-time separation.

- **AGPL + proprietary compiled modules is legally sound via Section 7 linking exceptions.** The copyright holder is not bound by their own AGPL (FSF-confirmed). A custom linking exception under GPLv3/AGPLv3 Section 7 — modeled on the OpenJDK Classpath Exception — permits combining AGPL framework code with proprietary compiled npm modules. Grafana is the strongest real-world precedent.

- **JavaScript obfuscation is a speed bump, not a wall.** Academic tools achieve 100% deobfuscation success. LLMs can deobfuscate for ~$0.50. The practical protection ladder: (1) compiled-only distribution (baseline), (2) terser + javascript-obfuscator (moderate), (3) napi-rs native binaries (strong), (4) server-side execution (strongest).

- **The AGPL framework must function without proprietary modules** to keep them outside the "Corresponding Source" boundary. GPLv3 requires source for "dynamically linked subprograms that the work is specifically designed to require." Design the interface so the framework works in degraded mode without the engine.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| 1 | ee/ Directory Patterns (13 companies) | Deep | P0 |
| 2 | GPL/AGPL Linking Exceptions | Deep | P0 |
| 3 | npm Package Obfuscation | Deep | P0 |
| 4 | AGPL + Proprietary Module Legal Mechanics | Deep | P0 |
| 5 | Contributor Dynamics at the Boundary | Deep | P0 |
| 6 | Build Pipeline Architecture | Moderate | P1 |
| 7 | Three-Tier Model Precedents | Moderate | P1 |

---

## Detailed Findings

### 1. The ee/ Directory Pattern: How 13 Companies Structure It

**Finding:** Directory-based separation with runtime license key gating is the dominant pattern. Most companies ship enterprise source in the public repo.

**Evidence:** [evidence/ee-directory-patterns.md](evidence/ee-directory-patterns.md)

#### The Five Boundary Mechanisms

| Mechanism | Companies | How it works | Pros | Cons |
|-----------|-----------|-------------|------|------|
| **Directory-based** (ee/) | Cal.com, Formbricks, Documenso, Dub.co, Papermark, Infisical, Activepieces, Mastra | Separate `ee/` directory with own LICENSE | Simple, grep-able, clear boundary | Source visible to all |
| **File-level markers** | Twenty, n8n | `/* @license Enterprise */` comments or `.ee.` filename suffix | No directory restructuring needed | Scattered, harder to audit |
| **Stub/proxy swap** | Appsmith | `ee/` contains stubs; real code in private repo; swapped at build time | True code separation | Complex build pipeline |
| **Separate private repo** | Grafana, GitLab | Enterprise code in private repo; build tags/module injection | Strongest separation | Two repos to maintain |
| **Next.js route groups** | Dub.co, Papermark | `app/(ee)/` parenthesized directories | URL-invisible, framework-native | Next.js-specific |

#### The Shared EE License Template

At least 8 companies use nearly identical text:

```
This software and associated documentation files (the "Software") may 
only be used in production, if you (and any entity that you represent) 
have agreed to, and are in compliance with, the [Company] Subscription 
Terms available at [URL], or other agreements governing the use of the 
Software, as mutually agreed by you and [Company], and otherwise have a 
valid [Company] Enterprise Edition subscription for the correct number 
of hosts/seats.
```

Key provisions: production requires subscription; dev/testing is free; modifications remain subject to the licensor's terms.

#### Runtime Feature Gating (Universal Pattern)

```
Environment variable → Server startup → Remote API validation → Feature toggle
     LICENSE_KEY          fetch(api)        valid/invalid          enable/disable
```

All companies that ship ee/ source use this pattern. Enterprise features are disabled (not removed) without a key. This is a "soft gate" — the boundary is legal + runtime, not architectural.

**Decision triggers:**
- If you want true code separation (source never exposed) → Grafana/Appsmith model (separate repo or build-time swap)
- If you want simplicity and community trust (source visible, legally restricted) → Cal.com/Formbricks model (directory + license key)
- If you want maximum flexibility → Liveblocks model (per-package licensing)

---

### 2. AGPL Linking Exceptions: The Legal Mechanism

**Finding:** GPLv3/AGPLv3 Section 7 "additional permissions" is the established mechanism for allowing copyleft code to combine with proprietary modules. Templates exist.

**Evidence:** [evidence/agpl-linking-exceptions.md](evidence/agpl-linking-exceptions.md)

#### Established Exceptions

| Exception | License | What it permits | Template for npm? |
|-----------|---------|----------------|------------------|
| **GCC Runtime Library** | GPLv3 | Compiled output can combine with proprietary code | Structural model only |
| **OpenJDK Classpath** | GPLv2 | Proprietary code can link with GPL'd Java libraries | **Closest analogy** (classloading ≈ import) |
| **Qt LGPL** | LGPLv3 | Proprietary linking via LGPL's built-in permission | Uses LGPL, not custom exception |
| **MySQL FOSS** | GPLv2 | GPL → other OSS license linking only | Does NOT cover proprietary |

#### Custom AGPL Linking Exception for npm

Based on the Classpath Exception and Nextcloud patterns, an AGPL linking exception for proprietary compiled npm modules:

```
Additional permission under GNU AGPL version 3 section 7:

If you modify this Program, or any covered work, by combining it with 
Modules distributed as compiled npm packages by [Company] (the "Engine 
Modules"), the licensors of this Program grant you additional permission 
to convey the resulting combination under the terms of this License 
(AGPL-3.0) for the AGPL-licensed portions, and under the terms of 
[Company]'s license for the Engine Modules, provided that those Engine 
Module terms do not place additional restrictions on the AGPL-licensed 
portions themselves.
```

**Key design choices:**
1. **Scope:** Only the copyright holder's own modules, not all third-party code
2. **AGPL core remains copyleft:** Modifications to the AGPL framework are still copyleft-bound
3. **Revocability:** Section 7 permissions can be removed by the copyright holder in future versions

---

### 3. npm Package Obfuscation: The Protection Ladder

**Finding:** JS obfuscation provides a meaningful speed bump but is not a security boundary. Architectural choices (what ships vs. what stays server-side) matter more than obfuscation settings.

**Evidence:** [evidence/npm-obfuscation-protection.md](evidence/npm-obfuscation-protection.md)

#### The Protection Ladder

```
Level 5: Server-side execution              ████████████████████  Strongest
         Logic never ships in package        (Cursor, Vercel v0)

Level 4: Rust → napi-rs native binary        ███████████████████  Strong
         Platform-specific .node addons      (Cross-compilation CI)

Level 3: javascript-obfuscator               ██████████████       Substantial
         Control flow + string + dead code   (15-80% perf cost)

Level 2: terser (mangle + compress)          █████████            Moderate
         Property mangling + compress        (Negligible perf cost)

Level 1: Compiled-only distribution          ██████               Baseline
         "files" allowlist + no source maps  (Zero cost, mandatory)
```

#### Baseline Configuration (Mandatory)

```json
// package.json
{
  "files": ["dist/**/*.js", "dist/**/*.d.ts"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}

// tsconfig.build.json
{
  "compilerOptions": {
    "sourceMap": false,
    "declarationMap": false
  }
}
```

Always verify with `npm pack --dry-run` before publishing. Source maps are the #1 leak vector.

#### Deobfuscation Reality

| Tool | What it does | Cost |
|------|-------------|------|
| prettier | Reformats minified JS to readable | Free, seconds |
| de4js | Unpacks common obfuscation patterns | Free, seconds |
| webcrack | Specifically targets obfuscator.io output | Free, minutes |
| humanify | LLM-based variable renaming with semantic accuracy | ~$0.50 per bundle |
| JSimplifier | Academic: 100% success across 20 techniques | Research tool |

**Recommendation:** Level 1 (compiled-only) is mandatory. Level 2 (terser) adds negligible cost. Level 3 (javascript-obfuscator medium preset) is worthwhile for server-side packages where 15-30% perf cost is acceptable. Level 4 (napi-rs) is justified only for core algorithmic IP where the development cost of Rust rewrite is warranted. Level 5 (server-side) is the ultimate protection but requires always-on infrastructure.

---

### 4. AGPL + Proprietary Modules: Legal Foundations

**Finding:** As the copyright holder, you are not bound by your own AGPL and can freely combine it with proprietary modules. Grafana validates this model commercially. The framework must function without proprietary modules to maintain AGPL coherence.

**Evidence:** [evidence/agpl-proprietary-legal-mechanics.md](evidence/agpl-proprietary-legal-mechanics.md)

#### The Copyright Holder Exception

The FSF is explicit: "The GPL is a license granted by the developer to others; the developer itself is not bound by it." RMS endorsed "selling exceptions" since the 1990s. As the sole copyright holder of both the AGPL framework and proprietary modules, you can combine them without triggering copyleft on the proprietary parts.

This is the legal foundation of dual-licensing: MySQL, Qt, MongoDB (historically), and Grafana all operate this way.

#### The "Corresponding Source" Design Principle

GPLv3 Section 1 defines Corresponding Source as including "dynamically linked subprograms that the work is **specifically designed to require**." If the AGPL framework requires proprietary modules to function, those modules fall within Corresponding Source — meaning users could demand their source.

**Design principle:** The AGPL framework must work (possibly degraded) without the proprietary engine modules. This keeps the modules outside the Corresponding Source boundary.

```typescript
// GOOD: Framework functions without engine (degraded mode)
const engine = await loadEngine() // returns null if not installed
if (engine) {
  // Use optimized engine
  engine.createObserverBridge(xml, text)
} else {
  // Fall back to basic/slower implementation
  basicObserverSync(xml, text)
}

// BAD: Framework crashes without engine
import { createObserverBridge } from '@company/engine' // hard dependency
```

#### What Happens When Someone Forks the AGPL Parts

The forker receives:
- Full rights to the AGPL framework (modify, redistribute, serve over network)
- **No rights** to the proprietary compiled modules
- The ability to reimplement the module interfaces with their own code

This is why the interface between framework and engine must be clean and documented — forks need to be able to substitute implementations for the AGPL rights to be meaningful.

---

### 5. Contributor Dynamics: Managing the Boundary

**Finding:** The boundary is enforced through social convention (CODEOWNERS) and review, not CI tooling. Companies universally require CLAs only when they need relicensing flexibility.

**Evidence:** [evidence/contributor-dynamics-alternative-splits.md](evidence/contributor-dynamics-alternative-splits.md)

#### Boundary Enforcement Patterns

| Mechanism | Who uses it | How it works |
|-----------|------------|-------------|
| **CODEOWNERS** | GitLab, Cal.com (inferred) | ee/ changes require internal maintainer approval |
| **Social convention** | All | CONTRIBUTING.md says "don't modify ee/" |
| **Label gating** | Cal.com | Community PRs need "approved" label before starting work |
| **CLA bot** | Grafana | Apache Foundation CLA template, auto-checks all PRs |

No company uses CI linting rules to block community commits from touching ee/ directories. The enforcement is social + review-based.

#### CLA Decision

| Scenario | Need CLA? | Why |
|----------|-----------|-----|
| AGPL + dual license (need to relicense contributions) | **Yes** | Copyright must be assigned/licensed to dual-license |
| AGPL + ee/ (enterprise code is separate) | **Usually no** | AGPL copyleft already governs community contributions |
| MIT/Apache + ee/ | **No** | Permissive license doesn't restrict relicensing |

Grafana requires a CLA because they dual-license (AGPL + proprietary relicense). Cal.com, Formbricks, and Infisical don't appear to require CLAs.

---

### 6. Alternative Split Patterns (Non-ee/)

**Finding:** Beyond the ee/ directory pattern, companies use package-level splits, runtime enforcement, backend boundaries, and cloud-advantage models.

**Evidence:** [evidence/contributor-dynamics-alternative-splits.md](evidence/contributor-dynamics-alternative-splits.md)

| Pattern | Company | Mechanism | Best for |
|---------|---------|-----------|----------|
| **Package-level licensing** | Liveblocks | Apache client SDKs, AGPL server, proprietary cloud | Libraries consumed by third-party apps |
| **Runtime license key** | Tldraw | `licenseKey` prop, client-side validation, watermark fallback | Component libraries, SDKs |
| **Client/server boundary** | AFFiNE | MIT frontend, proprietary backend | Local-first apps with optional server |
| **Cloud advantage** | Firecrawl | Full AGPL repo, cloud has proprietary infra (proxies, sandboxes) | SaaS where infra IS the moat |
| **Modified permissive** | Dify | Apache 2.0 + added restrictions | **Avoid** — legally controversial, community backlash |

**Liveblocks' package-level split is the cleanest model for npm ecosystems.** Each package has an unambiguous license. No ee/ directory complexity. The trade-off: some features are entirely absent from open-source rather than gated behind a key.

---

### 7. Three-Tier Architecture Design

**Finding:** Combining the patterns above, a three-tier architecture for AGPL framework + proprietary compiled engine + paid enterprise features follows established precedents and is legally sound.

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1: OPEN FRAMEWORK (AGPL-3.0 + Section 7 exception)│
│                                                          │
│  Published source on GitHub                              │
│  Community contributions via PRs                         │
│  Clean interface to Tier 2 via documented API            │
│  MUST function in degraded mode without Tier 2           │
│                                                          │
│  Precedent: Grafana AGPL core, Cal.com AGPL core         │
├─────────────────────────────────────────────────────────┤
│  TIER 2: COMPILED ENGINE (Proprietary, free to use)      │
│                                                          │
│  npm packages: compiled JS + .d.ts only, no source       │
│  Source in private repo (not published)                   │
│  Free for all use (individual + commercial internal)     │
│  Implements interfaces defined by Tier 1                 │
│  Linked via Section 7 exception                          │
│                                                          │
│  Precedent: Grafana Enterprise plugins, Appsmith ee/ stubs│
│  Protection: Level 1-2 (compiled + terser) minimum       │
│  Optional: Level 4 (napi-rs) for core algorithms         │
├─────────────────────────────────────────────────────────┤
│  TIER 3: ENTERPRISE (Proprietary, paid)                  │
│                                                          │
│  ee/ directory in repo OR separate private repo           │
│  License key gated (env var + remote validation)         │
│  SSO, RBAC, audit logs, team management                  │
│                                                          │
│  Precedent: Cal.com, Formbricks, Infisical ee/           │
│  License template: Standard EE license (shared template) │
└─────────────────────────────────────────────────────────┘
```

#### Implementation Checklist

1. **License files:**
   - Root: AGPL-3.0 with Section 7 linking exception naming Tier 2 modules
   - `ee/LICENSE`: Standard EE license template (Cal.com-derived)
   - Tier 2 packages: Proprietary license in each package.json

2. **Build pipeline:**
   - AGPL packages: `tsc` emit with source maps, `"files": ["src/", "dist/"]`
   - Tier 2 packages: `tsc` + `terser` (mangle + compress), `"files": ["dist/**/*.js", "dist/**/*.d.ts"]`, no source maps
   - Enterprise: same as Tier 2 but gated by license key at runtime

3. **Interface design:**
   - AGPL framework defines TypeScript interfaces for engine modules
   - Framework includes basic/fallback implementations (degraded mode)
   - Tier 2 engine provides optimized implementations loaded at runtime
   - Dynamic `import()` preferred over static `import` for strongest "separate work" argument

4. **Contributor workflow:**
   - CODEOWNERS on ee/ and engine interface files
   - CONTRIBUTING.md documents boundary: "PRs to AGPL framework welcome; ee/ and engine are internal"
   - CLA if you need dual-licensing flexibility; DCO otherwise

5. **Verification:**
   - `npm pack --dry-run` on every Tier 2 package before publish
   - CI check: no `.ts` source files in Tier 2 package tarballs
   - CI check: no source maps in published packages

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Revenue impact of shipping ee/ source:** Do companies lose sales to self-hosters who bypass license keys? No data found.
- **WASM as middle ground:** AssemblyScript/wasm-pack for IP protection — identified but not deeply explored.
- **Self-hosting bypass prevalence:** How easy is it to circumvent license key checks? Not investigated.

### Out of Scope
- Which license to choose (covered in [related report](../oss-licensing-strategies-open-core/REPORT.md))
- Legal advice or license text drafting
- First-party codebase analysis

---

## References

### Evidence Files
- [evidence/ee-directory-patterns.md](evidence/ee-directory-patterns.md) — 13 company code-first analysis
- [evidence/agpl-linking-exceptions.md](evidence/agpl-linking-exceptions.md) — GCC, Classpath, Qt, custom exception templates
- [evidence/npm-obfuscation-protection.md](evidence/npm-obfuscation-protection.md) — Protection ladder, deobfuscation reality
- [evidence/agpl-proprietary-legal-mechanics.md](evidence/agpl-proprietary-legal-mechanics.md) — Copyright holder exception, Corresponding Source, Grafana precedent
- [evidence/contributor-dynamics-alternative-splits.md](evidence/contributor-dynamics-alternative-splits.md) — CODEOWNERS, CLA patterns, Tldraw/Liveblocks/AFFiNE/Firecrawl

### External Sources
- [FSF GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [GPLv3 Full Text](https://www.gnu.org/licenses/gpl-3.0.html)
- [AGPL-3.0 Full Text](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [GCC Runtime Library Exception v3.1](https://www.gnu.org/licenses/gcc-exception-3.1.html)
- [OpenJDK GPLv2 + Classpath Exception](https://openjdk.org/legal/gplv2+ce.html)
- [ScanCode AGPL-3.0 Linking Exception](https://scancode-licensedb.aboutcode.org/agpl-3.0-linking-exception.html)
- [Grafana Licensing](https://grafana.com/licensing/)
- [Grafana CEO Q&A on AGPL](https://grafana.com/blog/2021/04/20/qa-with-our-ceo-on-relicensing/)
- [Cal.com License Key docs](https://cal.com/docs/self-hosting/license-key)
- [Formbricks License docs](https://formbricks.com/docs/self-hosting/advanced/license)
- [Tldraw License docs](https://tldraw.dev/community/license)
- [Liveblocks Open-Sourcing Blog](https://liveblocks.io/blog/open-sourcing-the-liveblocks-sync-engine-and-dev-server)
- [Firecrawl Open Source vs Cloud](https://docs.firecrawl.dev/contributing/open-source-or-cloud)
- [napi-rs docs](https://napi.rs/docs/introduction/getting-started)
- [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [webcrack deobfuscator](https://github.com/j4k0xb/webcrack)
- [JsDeObsBench (ACM CCS 2025)](https://dl.acm.org/doi/10.1145/3719027.3744871)
- [Kyle Mitchell: Reading AGPL](https://writing.kemitchell.com/2021/01/24/Reading-AGPL)
- [FSF: On Selling Exceptions](https://www.fsf.org/blogs/rms/selling-exceptions)

### Related Research
- [../oss-licensing-strategies-open-core/](../oss-licensing-strategies-open-core/) — License selection strategy, community perception, 22 company case studies
