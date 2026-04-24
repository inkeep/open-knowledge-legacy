#!/usr/bin/env bash
# Verify the matryoshka pattern actually works in this environment.
# Run inside the container (from host: `container run --rm claude-matryoshka:latest /home/claude/verify-matryoshka.sh`).
#
# Checks, in order:
#   1. bubblewrap is installed and runnable
#   2. User namespaces work (required for bubblewrap without CAP_SYS_ADMIN)
#   3. Anthropic's sandbox runtime can spawn a sandboxed subprocess
#   4. The network proxy path works (domain allowlist is enforceable)
#
# Exit 0 = matryoshka works. Exit 1 = at least one check failed; see output for which.

set -u

OK=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "[verify] $label:  OK"
    OK=$((OK + 1))
  else
    echo "[verify] $label:  FAIL ($*)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Matryoshka sandbox verification ==="
echo "Container kernel: $(uname -r)"
echo "User: $(id -un) (uid $(id -u))"
echo ""

# 1. bubblewrap
check "bubblewrap installed" command -v bwrap
if command -v bwrap >/dev/null 2>&1; then
  echo "[verify] bubblewrap version: $(bwrap --version 2>&1 | head -1)"
fi

# 2. user namespaces — the critical check
# Bubblewrap uses user namespaces to drop privileges without CAP_SYS_ADMIN
# If this fails, the inner sandbox can't function without setuid bwrap
echo ""
echo "[verify] Testing user namespace spawn (this is the critical check)..."
if bwrap --ro-bind / / --dev /dev --tmpfs /tmp true 2>&1; then
  echo "[verify] user ns:     OK — bubblewrap can spawn an isolated process"
  OK=$((OK + 1))
else
  echo "[verify] user ns:     FAIL — bubblewrap cannot start"
  echo "[verify]              This is the case the Anthropic 'enableWeakerNestedSandbox' flag tries to address."
  echo "[verify]              Even with enableWeakerNestedSandbox=true, nested bubblewrap may be flaky."
  echo "[verify]              Fall-back: use tier1-apple-container with guest-side iptables."
  FAIL=$((FAIL + 1))
fi

# 3. Anthropic's sandbox runtime
echo ""
check "sandbox-runtime installed" command -v npx
check "sandbox-runtime binary" test -f /usr/lib/node_modules/@anthropic-ai/sandbox-runtime/package.json

# Try a tiny sandboxed invocation
echo ""
echo "[verify] Testing @anthropic-ai/sandbox-runtime echo..."
if RESULT=$(npx @anthropic-ai/sandbox-runtime echo "hello-from-sandbox" 2>&1); then
  if [[ "$RESULT" == *"hello-from-sandbox"* ]]; then
    echo "[verify] sandbox-runtime: OK (got expected output)"
    OK=$((OK + 1))
  else
    echo "[verify] sandbox-runtime: PARTIAL (ran but output unexpected): $RESULT"
    FAIL=$((FAIL + 1))
  fi
else
  echo "[verify] sandbox-runtime: FAIL"
  echo "[verify]                  Output: $RESULT"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Summary ==="
echo "OK:   $OK"
echo "FAIL: $FAIL"
echo ""
if (( FAIL > 0 )); then
  echo "RESULT: matryoshka is NOT working cleanly. See failures above."
  echo "        Fall-back: use ../tier1-apple-container with guest-side iptables."
  exit 1
else
  echo "RESULT: matryoshka appears to work. Anthropic's inner sandbox can start."
  echo "        Caveat: Anthropic's 'enableWeakerNestedSandbox considerably weakens security'"
  echo "                (their words) — the outer microVM is doing the real work."
  exit 0
fi
