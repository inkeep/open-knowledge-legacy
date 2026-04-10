# Evidence: Terminal-Based Viewers

**Dimension:** Zero-infrastructure options — no Docker required
**Date:** 2026-04-09
**Sources:** GitHub repos

---

## Key repos referenced

- https://github.com/ymtdzzz/otel-tui — otel-tui (TUI viewer)
- https://github.com/CtrlSpice/otel-desktop-viewer — otel-desktop-viewer (browser UI, CLI tool)

---

## Findings

### Finding: otel-tui is a terminal viewer supporting all three OTel signals
**Confidence:** CONFIRMED
**Evidence:** https://github.com/ymtdzzz/otel-tui

Installation:
```bash
brew install ymtdzzz/tap/otel-tui
# or
go install github.com/ymtdzzz/otel-tui@latest
# or
docker run --rm -it ymtdzzz/otel-tui:latest
```

Signals: traces, metrics, logs (all three).
Also supports: Zipkin traces, Prometheus metrics, Datadog format.
Ports: 4317 (OTLP gRPC), 4318 (OTLP HTTP).
Latest release: v0.7.1 (February 2026).
Buffer: 1000 service root spans and logs (with rotation).
Features: trace filtering, topology views, metric charts (Gauge/Sum/Histogram), log filtering with trace/span correlation.

**Implications:** Lightest weight option. No Docker needed (brew install). Runs directly in terminal. All three signals. Ideal for quick debugging without leaving the terminal.

---

### Finding: otel-desktop-viewer supports traces only, provides browser UI
**Confidence:** CONFIRMED
**Evidence:** https://github.com/CtrlSpice/otel-desktop-viewer

Installation:
```bash
brew install --cask ctrlspice/tap/otel-desktop-viewer
# or
go install github.com/CtrlSpice/otel-desktop-viewer@latest
```

Signals: traces only — no metrics, no logs.
Ports: 8000 (browser UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP).
Latest release: v0.2.5 (August 2025).
Storage: DuckDB (in-memory default, optional persistence).
Features: dark mode, vim-style keyboard nav, self-contained Go binary.

**Implications:** Traces-only limitation reduces utility for a project emitting all three signals. otel-tui is strictly superior for multi-signal local dev.

---

## Gaps / follow-ups

* Neither tool provides persistent storage by default — data is lost on restart.
* otel-tui buffer size (1000 spans/logs) may be insufficient for long debugging sessions.
