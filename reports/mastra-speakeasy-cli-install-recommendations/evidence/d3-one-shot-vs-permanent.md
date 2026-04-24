# Evidence: D3 — One-shot runner vs permanent install posture

**Dimension:** D3 — Does the vendor push `npx/bunx/pnpm dlx` as the on-ramp, or require a permanent install?
**Date:** 2026-04-20
**Sources:** Mastra docs, Mastra CLI + create-mastra READMEs, Speakeasy docs, install.sh

---

## Key files / pages referenced

- [mastra.ai/reference/cli/create-mastra](https://mastra.ai/reference/cli/create-mastra)
- [packages/cli/README.md (Mastra)](https://github.com/mastra-ai/mastra/blob/main/packages/cli/README.md)
- [packages/create-mastra/README.md](https://github.com/mastra-ai/mastra/blob/main/packages/create-mastra/README.md)
- [speakeasy.com/docs/introduction](https://www.speakeasy.com/docs/introduction)
- [speakeasy.com/docs/speakeasy-reference/cli/getting-started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started)

---

## Findings

### Finding: Mastra's default on-ramp is one-shot; persistent CLI installs as a devDependency of the scaffolded project, not globally

**Confidence:** CONFIRMED
**Evidence:** create-mastra reference + CLI README

[mastra.ai/reference/cli/create-mastra](https://mastra.ai/reference/cli/create-mastra) documents exclusively ephemeral invocations:

```
npx create-mastra@latest
pnpm create mastra
yarn dlx create-mastra@latest
bun x create-mastra
```

The persistent `mastra` CLI is then auto-installed into the generated project's `package.json` by `create-mastra` as a devDependency, and used via npm scripts or `npx mastra`. [packages/cli/README.md](https://github.com/mastra-ai/mastra/blob/main/packages/cli/README.md):

> After installing `mastra` globally you can use it anywhere. `npm i -g mastra`. If you prefer to not install packages globally, you can use `npx`: `npx mastra`.

The global install is framed as optional; `npx mastra` is the equal-status alternative.

**Implications:** Mastra is fully within the modern npm dlx-first convention. `npm create X` is the most polished possible form of "try it in 30 seconds." No signup required before the scaffolder runs.

### Finding: Speakeasy requires a permanent install and gates installation behind account creation

**Confidence:** CONFIRMED
**Evidence:** Introduction page + install.sh behavior

[speakeasy.com/docs/introduction](https://www.speakeasy.com/docs/introduction):

> Sign up for a free Speakeasy account at [https://app.speakeasy.com](https://app.speakeasy.com)

The Introduction page sequences **sign-up → install**. install.sh performs a permanent install (writes to `/usr/local/bin`), not ephemeral execution. There is no `@speakeasy-api/cli` npm package, so no `npx`/`bunx`/`pnpm dlx` path exists.

No "try this in 30 seconds" dlx snippet anywhere in the docs. The first CLI contact is always a binary that lives at `/usr/local/bin/speakeasy`.

**Implications:** Speakeasy's funnel is account-first, binary-second. This is self-interested routing — every install leads to the vendor's hosted platform. For a user evaluating the tool without commitment, the friction is high relative to Mastra's `npm create` zero-signup path.

---

## Comparative matrix

| Posture                   | Mastra                                                  | Speakeasy                                          |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| "Try it" on-ramp          | `npm create mastra@latest` (dlx, no install)            | Requires sign-up + binary install                  |
| Permanent install framing | Optional (`npm i -g mastra`), equal-status `npx mastra` | Required (brew / curl / winget)                    |
| Signup before install     | Not required                                            | Required before the install docs route you forward |
| dlx path exists           | Yes (npm / pnpm / bunx / yarn dlx)                      | No (not an npm package)                            |
| Implementation language   | TypeScript/Node                                         | Go                                                 |

The difference tracks the implementation language: a Node CLI has native dlx because npm ships the package in the registry. A Go binary has no equivalent — the closest is `go run`, which requires the user to have Go installed, and is not a distribution channel a CLI vendor targets.

---

## Negative searches

- "speakeasy npx" — no official doc lists an npx path. The `@speakeasy-api/*` scope holds no CLI package.
- "mastra global install required" — no doc mandates global install; every doc example uses `npm create`, `npx mastra`, or npm scripts.

---

## Gaps / follow-ups

- Whether Speakeasy has considered a `postinstall`-download wrapper (prisma-style) to enable `npx speakeasy`. No RFC or issue surfaced.
- Whether Mastra's `npx mastra` path has measurable adoption vs `npm i -g mastra` — no telemetry disclosed.

