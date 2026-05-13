#!/usr/bin/env bash
# Tier-3 test runner: invocation-scoped jsdom preload + workspace-package
# resolution. Filters to `*.dom.test.tsx` files when called without args
# so unit-tier tests (which assume no DOM) are not pulled in.
#
# Examples:
#   bun run test:dom                                  # all *.dom.test.tsx in src/
#   bun run test:dom src/components/Foo.dom.test.tsx  # one file
#
# Exits 0 when no *.dom.test.tsx files exist (substrate present, no adopters yet).

set -euo pipefail

# `--isolate`: run each test file in a fresh global object so that
# `mock.module(...)` calls (which Bun documents as in-place module patches
# that persist across test files within one `bun test` invocation —
# oven-sh/bun#12823) don't leak from one `.dom.test.tsx` into the next.
# Without this flag, `config-provider.dom.test.tsx`'s
# `mock.module('@/hooks/use-theme-bridge', () => ({ useThemeBridge: () => {} }))`
# replaces the hook globally; any sibling test file that imports the real
# hook later in the run gets the no-op shim and its useEffect never fires
# bridge.setThemeSource — exactly the `Received: 0` failure mode this
# substrate hit on Linux CI (where filesystem-order puts `lib/` before
# `hooks/`). `--isolate` was added in Bun 1.3.x specifically to address
# this class of cross-file mock contamination.
PRELOAD_FLAGS=(--isolate --preload ./tests/dom/jsdom-preload.ts --conditions development)

if [ "$#" -gt 0 ]; then
  exec bun test "${PRELOAD_FLAGS[@]}" "$@"
fi

# Guard structurally before the find probe so a missing src/ surfaces
# loudly instead of being swallowed by 2>/dev/null on find's stderr. CI
# clones fresh, so this should never fire — when it does, the repo
# layout is wrong, not the test script.
if [ ! -d src ]; then
  echo "[test:dom] error: src/ directory not found (expected at $(pwd)/src)" >&2
  exit 2
fi

if find src -name '*.dom.test.tsx' -print -quit | grep -q .; then
  # Substring filter (bun test positional arg, not a glob). The full
  # `.dom.test.tsx` suffix is the D18 routing contract; a looser `.dom.test`
  # filter would also pull in `.dom.test.ts` files that the STOP rule at
  # tests/integration/dom-test-filename-stop-rule.test.ts does not enforce
  # against, blurring the substrate boundary.
  exec bun test "${PRELOAD_FLAGS[@]}" .dom.test.tsx
fi

echo "[test:dom] no *.dom.test.tsx files found in src/"
exit 0
