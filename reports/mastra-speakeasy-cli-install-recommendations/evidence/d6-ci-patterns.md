# Evidence: D6 — CI / non-interactive install patterns

**Dimension:** D6 — How is the CLI recommended for CI? Actions, Docker, pinned-tarball?
**Date:** 2026-04-20
**Sources:** Mastra platform deploy docs, Speakeasy sdk-generation-action + install.sh

---

## Key files / pages referenced

- [mastra.ai/guides/deployment/mastra-platform](https://mastra.ai/guides/deployment/mastra-platform)
- `packages/cli/src/index.ts` — `-y, --yes` flag definitions
- [speakeasy-api/sdk-generation-action](https://github.com/speakeasy-api/sdk-generation-action)
- [sdk-generation-action Dockerfile](https://github.com/speakeasy-api/sdk-generation-action/blob/main/Dockerfile)
- [speakeasy install.sh header comment](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh)

---

## Findings

### Finding: Mastra has no custom GitHub Action; its CI pattern leans on generic Node-ecosystem tooling

**Confidence:** CONFIRMED
**Evidence:** [mastra.ai/guides/deployment/mastra-platform](https://mastra.ai/guides/deployment/mastra-platform)

Recommended CI snippet:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
- run: npx mastra server deploy --yes
  env:
    MASTRA_API_TOKEN: ${{ secrets.MASTRA_API_TOKEN }}
```

Token created via `mastra auth tokens create ci-deploy`, stored as a GitHub secret. The `--yes` / `-y` flag skips interactive prompts:

> Pass `--yes` (or `-y`) to skip all confirmation prompts, as without it, the CLI waits for interactive input and your CI job hangs.

`packages/cli/src/index.ts` confirms `-y, --yes` flags on `server deploy`, `studio deploy`, `migrate`.

No pinned-tarball pattern, no `mastra-ai/setup-mastra-action`.

**Implications:** Mastra outsources CI plumbing to `actions/setup-node@v4` + `npx`. Versioning is controlled by whatever `@latest` resolves to at deploy time; users wanting deterministic CI would need to pin `mastra@X.Y.Z` in their project's `package.json`.

### Finding: Speakeasy's blessed CI path is a Docker-based GitHub Action that bundles a separate Go orchestrator plus every SDK-generation language toolchain

**Confidence:** CONFIRMED
**Evidence:** [sdk-generation-action](https://github.com/speakeasy-api/sdk-generation-action) + Dockerfile

Referenced as `uses: speakeasy-api/sdk-generation-action@v15` (rolling major tag).

[Dockerfile](https://github.com/speakeasy-api/sdk-generation-action/blob/main/Dockerfile):

```dockerfile
FROM golang:1.24-alpine3.23
# ... RUN go build -o /action
# plus layers for Node, Python, Java, Ruby, .NET, PHP toolchains
```

The action accepts a `speakeasy_version` input (default `"latest"`) so users can pin.

For non-GitHub CI, install.sh is documented as:

> Designed for quick installs over the network and CI/CD
> `curl -fsSL https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh | sh`

No `speakeasy` Docker image is published for the CLI itself.

**Implications:** Speakeasy's vendor-branded action is heavy (\~1GB+ image given all toolchains) but self-contained. One Action tag = one deterministic environment. This is a different philosophy from Mastra's "BYO Node, npx the tool" pattern — Speakeasy ships a full CI sandbox; Mastra assumes the CI host already has a working Node environment.

---

## Comparative matrix

| CI concern           | Mastra                                               | Speakeasy                                                                      |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Vendor GitHub Action | None                                                 | `speakeasy-api/sdk-generation-action@v15`                                      |
| Action type          | N/A                                                  | Docker (Go build + polyglot toolchains)                                        |
| Generic CI install   | `actions/setup-node@v4` + `npx mastra`               | `curl -fsSL go.speakeasy.com/cli-install.sh \| sh`                             |
| Auth for CI          | `MASTRA_API_TOKEN` (+ `MASTRA_ORG_ID`) GitHub secret | `SPEAKEASY_API_KEY` GitHub secret                                              |
| Non-interactive flag | `--yes` / `-y` (explicit in docs)                    | Not inspected for `speakeasy quickstart`/`run` — assumed via env vars          |
| Version pinning      | `mastra@X.Y.Z` in project `package.json`             | `speakeasy_version: X.Y.Z` input to action; `VERSION=X.Y.Z` env for install.sh |
| Determinism          | Weak (`@latest` on every run unless pinned)          | Strong (pinned action tag locks the whole environment)                         |

---

## Negative searches

- **Mastra setup-mastra-action:** No such repo in `mastra-ai/*` org. WebSearch confirmed.
- **Speakeasy Docker Hub CLI image:** No `speakeasy-api/speakeasy` Docker image; `.goreleaser.yaml` header explicitly disclaims Docker for the CLI.

---

## Gaps / follow-ups

- **Mastra:** Whether `mastra auth login` has a headless/device-code flow for CI bootstrapping, or if `MASTRA_API_TOKEN` is the only supported auth. Docs lean on env var but a device-flow path would matter for restricted CI.
- **Speakeasy:** Whether the sdk-generation-action emits runtime provenance (attestations, SLSA) — not inspected.

