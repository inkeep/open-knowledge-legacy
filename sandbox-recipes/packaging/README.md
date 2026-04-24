# packaging/

Scaffolding for extracting sandbox-recipes into a standalone repo (e.g., `inkeep/claude-sandbox`).

Only relevant if/when you decide to spin this out of `open-knowledge` for wider distribution.

## Files

| File | Purpose |
|---|---|
| [`PUBLISHING.md`](PUBLISHING.md) | Step-by-step playbook: extract → private → public |
| [`extract.sh`](extract.sh) | Automation: turns `git subtree split` output into a standalone repo with `install.sh` + LICENSE + standalone README + genericization |
| [`install.sh.template`](install.sh.template) | The curl-able one-liner installer (lives at root of the standalone repo) |
| [`README.template.md`](README.template.md) | Standalone-repo README (replaces the OK-specific one) |

## Quick usage

```bash
# From open-knowledge root, after PR #291 merges:
git checkout main && git pull --ff-only
git subtree split --prefix=sandbox-recipes -b claude-sandbox-extracted
./sandbox-recipes/packaging/extract.sh ~/Documents/code/claude-sandbox
cd ~/Documents/code/claude-sandbox
gh repo create inkeep/claude-sandbox --private --source=. --push
```

See [`PUBLISHING.md`](PUBLISHING.md) for the full walkthrough.

## Why this exists in the PR

Pre-existing the extraction scaffolding (a) documents the intent — this tooling is designed to be extractable — and (b) makes the actual extraction a one-command operation when the timing is right. Nothing here affects day-to-day use of the in-tree `sandbox-recipes/`.
