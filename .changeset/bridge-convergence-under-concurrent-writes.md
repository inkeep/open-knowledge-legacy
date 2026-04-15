---
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge": patch
---

fix(bridge): close Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). Server-side agent writes now follow the XmlFragment-authoritative pattern (`applyAgentMarkdownWrite` replaces `syncTextToFragment`). Client Observer A uses conditional baseline refresh when a local debounce is pending. Extracts `applyByPrefixSuffix` to `@inkeep/open-knowledge-core` for shared use. Hardens the bridge-testing harness (FR-11 invariant watcher, FR-12 origin probe, FR-15 Scheduler DI with clock unification, FR-16 network control, FR-17 multi-client convergence fuzzer with char-granular content oracle).
