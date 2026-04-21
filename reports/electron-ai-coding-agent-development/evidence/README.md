# Evidence index — electron-ai-coding-agent-development

This research used nested fanout across 5 parallel cluster workers. Primary-source evidence (URLs, file:line, confidence labels, snippets) is grouped by cluster in `../fanout/2026-04-15-initial/<cluster>/REPORT.md` rather than per-dimension `.md` files here. This mirrors the convention used by `reports/rust-napi-rs-best-practices-2026/evidence/` where cluster-grouped evidence files serve as the proof layer.

## Evidence location per dimension

| Dimension | Cluster | Evidence file |
|---|---|---|
| D1 — Repo structure for agent navigation | A | [fanout/2026-04-15-initial/a-structure-ops/REPORT.md](../fanout/2026-04-15-initial/a-structure-ops/REPORT.md) §D1 |
| D2 — Cross-platform CI/CD + packaged matrix | A | [a-structure-ops](../fanout/2026-04-15-initial/a-structure-ops/REPORT.md) §D2 |
| D6 — Distribution + debug build parity | A | [a-structure-ops](../fanout/2026-04-15-initial/a-structure-ops/REPORT.md) §D6 |
| D3 — Multi-process testing harness primitives | B | [b-testing-parity](../fanout/2026-04-15-initial/b-testing-parity/REPORT.md) §D3 |
| D4 — Dev ↔ packaged parity gates | B | [b-testing-parity](../fanout/2026-04-15-initial/b-testing-parity/REPORT.md) §D4 |
| E3 — Integration test depth | B | [b-testing-parity](../fanout/2026-04-15-initial/b-testing-parity/REPORT.md) §E3 |
| D5 — AI coding agent workflow specifics | C | [c-agent-workflow](../fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) §D5 |
| D9 — IPC observability + typed contextBridge | C | [c-agent-workflow](../fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) §D9 |
| D10 — Quality gates + machine-parseable output | C | [c-agent-workflow](../fanout/2026-04-15-initial/c-agent-workflow/REPORT.md) §D10 |
| D7 — Worktree isolation + parallel runs | D | [d-dev-loop](../fanout/2026-04-15-initial/d-dev-loop/REPORT.md) §D7 |
| E1 — Hot-reload across main/renderer/utility | D | [d-dev-loop](../fanout/2026-04-15-initial/d-dev-loop/REPORT.md) §E1 |
| E2 — Running Electron headless in CI + scripts | D | [d-dev-loop](../fanout/2026-04-15-initial/d-dev-loop/REPORT.md) §E2 |
| D8 — Electron toolchain readiness 2026 | E | [e-toolchain-readiness](../fanout/2026-04-15-initial/e-toolchain-readiness/REPORT.md) |

## What each evidence file contains

Every fanout `REPORT.md` includes per-finding:
- **Confidence label** — CONFIRMED / INFERRED / UNCERTAIN / NOT FOUND
- **Evidence** — URL to primary docs, GitHub issue/PR, or file:line-range on disk
- **Minimal snippet** — quoted text / code / output sufficient to justify the claim
- **Implications for agent-velocity** — one-sentence decision trigger

Plus: UNRESOLVED / NOT FOUND sections documenting negative searches, cross-dimension patterns, and a References list grouped by source type.

## Reproducing

The worker prompts live in the run coordination file: [../meta/runs/2026-04-15-initial/RUN.md](../meta/runs/2026-04-15-initial/RUN.md). Re-running the 5 parallel workers against a different baseline (e.g., Electron 42 GA) would produce an updated evidence set under `fanout/<new-run-id>/`.
