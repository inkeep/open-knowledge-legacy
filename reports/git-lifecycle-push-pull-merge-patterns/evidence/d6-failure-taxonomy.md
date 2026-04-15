# Evidence: D6 Error-Class Taxonomy (Update 2026-04-14)

**Dimension:** D6 — Error classification for git remote operations
**Date:** 2026-04-14
**Sources:** VS Code (source), GitHub Desktop/dugite (source), lazygit, JetBrains, GitKraken, Tower, Sublime Merge; cross-domain: Stripe, gRPC, AWS SDK, RFC 9457

---

## Key files / pages referenced

- `microsoft/vscode` `extensions/git/src/api/git.d.ts` — `GitErrorCodes` enum (48 values)
- `microsoft/vscode` `extensions/git/src/git.ts` — `getGitErrorCode()` regex-based classification
- `desktop/dugite` `lib/errors.ts` — `GitError` enum (59 values) + `GitErrorRegexes`
- [Stripe error handling](https://docs.stripe.com/error-handling?lang=node) — three-layer type/code/decline_code
- [gRPC status codes](https://grpc.io/docs/guides/status-codes/) — 17-code canonical taxonomy
- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) — Problem Details for HTTP APIs
- [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html) — transient/throttling/non-retryable
- [Julia Evans — Notes on git's error messages](https://jvns.ca/blog/2024/04/10/notes-on-git-error-messages/) — prefix conventions

---

## Findings

### Finding: Git communicates errors via four stderr prefix conventions with coarse exit codes
**Confidence:** CONFIRMED
**Evidence:** [Julia Evans blog post](https://jvns.ca/blog/2024/04/10/notes-on-git-error-messages/), git source

| Prefix | Meaning | Exit Code |
|--------|---------|-----------|
| `fatal:` | Terminal error, operation aborted | 128 |
| `error:` | Non-fatal, operation may partially complete | 1 |
| `hint:` | Supplementary guidance | (attached to error/fatal) |
| `warning:` | Non-blocking concern | 0 (success) |

Git provides no structured error codes — all downstream tools must parse stderr strings.

### Finding: VS Code defines 48 error codes via regex-based stderr classification
**Confidence:** CONFIRMED
**Evidence:** `microsoft/vscode` `extensions/git/src/api/git.d.ts`, `extensions/git/src/git.ts`

Key codes: `AuthenticationFailed`, `PushRejected`, `ForcePushWithLeaseRejected`, `RemoteConnectionError`, `DirtyWorkTree`, `RepositoryIsLocked`, `CantAccessRemote`, `RepositoryNotFound`. All classification is sequential regex matching in `getGitErrorCode()`.

### Finding: dugite (GitHub Desktop) defines 59 error codes including GitHub-specific server errors
**Confidence:** CONFIRMED
**Evidence:** `desktop/dugite` `lib/errors.ts`

Distinguishes SSH vs HTTPS auth (`SSHAuthenticationFailed`, `HTTPSAuthenticationFailed`). Includes GitHub server-specific: `PushWithFileSizeExceedingLimit` (GH001), `HexBranchNameRejected` (GH002), `ForcePushRejected` (GH003), `ProtectedBranchRequiresReview` (GH004), `PushWithSecretDetected`.

### Finding: Five error classes emerge from cross-referencing git editors and cross-domain taxonomies
**Confidence:** CONFIRMED
**Evidence:** Synthesis of VS Code (48 codes), dugite (59 codes), Stripe (3-layer), gRPC (17 codes), AWS (3 categories)

**Class 1 — Network (transient):** DNS failure, timeout, connection reset, HTTP 5xx, HTTP 429. Maps to gRPC `UNAVAILABLE`/`DEADLINE_EXCEEDED`, AWS "transient" category.

**Class 2 — Auth (non-retryable without re-auth):** Expired/revoked token, 401/403, scope mismatch. Maps to gRPC `UNAUTHENTICATED`/`PERMISSION_DENIED`, AWS "non-retryable."

**Class 3 — Semantic (requires user decision):** Non-fast-forward, diverged, protected branch, force-with-lease stale, merge conflicts. Maps to gRPC `FAILED_PRECONDITION`/`ABORTED`.

**Class 4 — Structural (requires content/config change):** LFS quota, large file, pre-receive hook, secret detection, missing objects. Maps to gRPC `RESOURCE_EXHAUSTED`/`INVALID_ARGUMENT`.

**Class 5 — Local (requires local cleanup):** index.lock, dirty working tree, disk full, permission denied. Maps to gRPC `FAILED_PRECONDITION` (local variant).

### Finding: Stripe's three-layer taxonomy (type/code/decline_code) is the gold standard for structured error classification
**Confidence:** CONFIRMED
**Evidence:** [Stripe error handling docs](https://docs.stripe.com/error-handling?lang=node), [Stripe error codes](https://docs.stripe.com/error-codes)

9 error types → ~100 codes → ~50 decline codes. Each error object includes `message`, `param`, `doc_url`, `request_log_url`. The `doc_url` pattern (linking to resolution docs) is directly applicable to git error UX.

### Finding: gRPC's library-vs-application code split maps to git infrastructure vs repository-semantic errors
**Confidence:** CONFIRMED
**Evidence:** [gRPC status codes](https://grpc.io/docs/guides/status-codes/)

17 canonical codes split into library-generated (OK, CANCELLED, UNKNOWN, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, UNIMPLEMENTED, INTERNAL, UNAVAILABLE, UNAUTHENTICATED) and application-only (INVALID_ARGUMENT, NOT_FOUND, ALREADY_EXISTS, PERMISSION_DENIED, FAILED_PRECONDITION, ABORTED, OUT_OF_RANGE, DATA_LOSS).

### Finding: AWS SDK classifies errors into three retryability categories with distinct backoff strategies
**Confidence:** CONFIRMED
**Evidence:** [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)

| Category | Codes | Backoff |
|----------|-------|---------|
| Transient | 400, 408, 500, 502, 503, 504 | Jittered exponential, cap 20s |
| Throttling | 400, 403, 429, 502, 503, 509 | Dynamic (adaptive mode) |
| Non-retryable | 401, 404, most 4xx | No retry |

Three retry modes: standard (3 attempts, token-bucket circuit-breaking), adaptive (client-side rate limiting), legacy.

### Finding: RFC 9457 separates stable title from instance-specific detail
**Confidence:** CONFIRMED
**Evidence:** [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)

Five standard fields: `type` (URI), `title` (human-readable), `status`, `detail` (instance-specific), `instance`. The `type` field as documentation URI mirrors Stripe's `doc_url`.

---

## Gaps / follow-ups

- No git client implements circuit-breaking, adaptive retry, or token-bucket algorithms from AWS SDK patterns
- No editor maps error codes to documentation URLs (the Stripe `doc_url` / RFC 9457 `type` pattern)
