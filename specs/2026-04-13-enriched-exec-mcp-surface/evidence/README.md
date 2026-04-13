# Evidence — Enriched `exec` MCP Surface

Spec-local factual findings. Each file has frontmatter:

```yaml
---
topic: <short topic name>
sources:
  - <file:line or URL>
confidence: HIGH | MED | LOW
---
```

## Index

- `worldmodel.md` — full surface inventory (15 MCP tools), connections & dependencies, 3P landscape, current state, unresolved items (dispatched via `/worldmodel` skill on 2026-04-13)
- `internal-prior-art-contradicts-direction.md` — `reports/just-bash-virtual-filesystem-analysis/` recommends hybrid 6-7 tools; our L2-aggressive direction is a conscious strategic choice, not an evidence-aligned one
- `enrichment-data-gaps.md` — fs mtime not plumbed anywhere today; backlink count N-amplification on multi-path output
- `shadow-repo-identity-and-sdk.md` — agent-vs-human attribution via `WriterIdentity.id` prefix (confirmed in code); MCP SDK 1.29 supports `structuredContent` with `outputSchema`
