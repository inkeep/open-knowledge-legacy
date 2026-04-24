# URL-Path-Level Network Restrictions

Every tier in this directory does **domain-level** filtering (allow `github.com` or not). None filter URL paths (`github.com/inkeep/*` yes, rest no).

This is a real gap. Even the [Anthropic sandbox docs](https://code.claude.com/docs/en/sandboxing) flag it:

> "Users should be aware of potential risks that come from allowing broad domains like `github.com` that may allow for data exfiltration."

This doc enumerates the options for path-level filtering, ordered by operational cost.

## Option 1 (best for GitHub specifically): fine-grained PATs

Instead of filtering at the network layer, constrain at the auth layer. This is the cleanest answer when the remote service has its own scoping model — and GitHub does.

```
GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
  ├─ Repository access: "Only select repositories" → choose inkeep/* repos
  ├─ Expiration: short (7d or less)
  └─ Permissions: minimum Claude Code needs
     ├─ Contents: Read and write (for git clone / commit)
     ├─ Metadata: Read
     ├─ Pull requests: Read and write (if you want PR interactions)
     └─ nothing else
```

Pass into the sandbox via `GH_TOKEN` / `GITHUB_TOKEN`:

```bash
export GH_TOKEN=<fine-grained-pat>
./sandbox-recipes/tier1-apple-container/ok-sandbox.sh --unattended
```

**Why this beats MITM:**
- Zero proxy infrastructure
- Zero performance overhead
- Server-side enforcement — GitHub's server rejects non-inkeep requests with 404 regardless of what the sandbox's network layer allows
- Token is short-lived — a compromised token expires soon
- No CA cert trust dance inside the container

**When it doesn't apply:** services that don't have scoped tokens (e.g., you want `pypi.org/simple/specific-package/*` but not the rest of PyPI — PyPI's tokens scope to *uploads*, not reads).

## Option 2 (general path filtering): mitmproxy-in-container

When you actually need path-level rules for services that don't offer scoped auth, add [mitmproxy](https://mitmproxy.org/) to the sandbox image. It's ~2x lighter than Squid + ssl-bump in resource cost and has Python-scriptable rules.

Architecture:

```
[agent] → HTTPS_PROXY=localhost:8080 → [mitmproxy inside container]
                                           ├─ filter.py applies URL-path rules
                                           ├─ decrypts via mitmproxy CA (trusted in container)
                                           └─ re-encrypts upstream to github.com
```

Sketch of how to extend `tier1-apple-container` for this:

1. Add to `Containerfile`:
   ```dockerfile
   RUN apt-get update && apt-get install -y --no-install-recommends mitmproxy
   # Generate mitmproxy CA once, copy it to the system trust store at build time
   RUN mitmdump --help >/dev/null 2>&1 || true    # triggers cert gen
   # (or bake a pre-generated cert at build time — reproducible)
   RUN cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt \
    && update-ca-certificates
   ```

2. Add a filter script `mitmproxy-filter.py`:
   ```python
   from mitmproxy import http

   ALLOWED = [
       ("api.anthropic.com", None),           # any path
       ("github.com", "/inkeep/"),             # path prefix
       ("api.github.com", "/repos/inkeep/"),   # org-scoped
       ("registry.npmjs.org", None),
   ]

   def request(flow: http.HTTPFlow) -> None:
       host = flow.request.pretty_host
       path = flow.request.path
       for allowed_host, allowed_prefix in ALLOWED:
           if host == allowed_host:
               if allowed_prefix is None or path.startswith(allowed_prefix):
                   return  # allow
       flow.response = http.Response.make(403, b"Blocked by sandbox policy")
   ```

3. In `entrypoint.sh`, start mitmproxy before dropping to claude user:
   ```bash
   mitmdump -s /usr/local/bin/mitmproxy-filter.py --listen-port 8080 --set block_global=false &
   export HTTPS_PROXY=http://localhost:8080 HTTP_PROXY=http://localhost:8080
   ```

**Tradeoffs vs the simpler iptables allowlist:**
- ✅ True path-level filtering
- ✅ Python-scriptable rules (block patterns, log exfiltration attempts, inject secrets)
- ❌ Extra ~50-100 MB RAM per container (mitmproxy is Python)
- ❌ CA cert trust means the container can't verify upstream server authenticity — you're trusting mitmproxy's view of the world
- ❌ Some clients pin certificates (git defaults don't, but some tools do) and will break under MITM

**Not implemented as a recipe** in this PR — would double the PR size. If you want it, say so and I'll add a `tier1-apple-container-mitm/` variant.

## Option 3: [Matchlock](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage)

Already has MITM for secret injection. Adding URL-path rules is a natural extension. OSS project, maintained by VirtusLab. Macros support: ephemeral microVM per agent invocation.

Out of scope for these recipes but worth evaluating if you need the full Matchlock feature set (ephemeral microVM + MITM + secret injection + seccomp).

## Option 4 (do NOT use): Squid + ssl-bump

You already found this too heavy. Moving on.

## Decision matrix

| Your need | Use |
|---|---|
| Constrain GitHub access to one org | Fine-grained PAT (Option 1) |
| Constrain GitHub + also constrain PyPI/npm/other to specific paths | mitmproxy-in-container (Option 2) |
| Constrain everything AND inject short-lived secrets AND ephemeral microVM per task | Matchlock (Option 3) |
| Constrain everything, willing to pay Squid's cost | Squid + ssl-bump (Option 4, rejected) |

For the narrow `github.com/inkeep/*` case: **fine-grained PAT**. No new infrastructure, works with every tier in this directory as-is, server-side enforcement is stronger than any proxy-layer trick.
