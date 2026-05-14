// FIXTURE — drives `playwright-topass-budget.test.ts` via shell-out to
// `biome check`. Not part of the main lint (lives outside the lint
// command's path list).
//
// Five positive cases (deliberate violations — plugin must fire) + four
// negative cases (well-calibrated `toPass` budgets — plugin must NOT
// fire). Exact-equality (`toBe(5)`) in the test catches both
// false-negative regressions (drop below 5) and false-positive widenings
// (above 5).

// We're not actually executing this fixture — it just needs to parse
// with realistic call shapes. `expect.toPass` is the real shape.
declare const expect: { (fn: () => unknown): { toPass: (opts: { timeout: number }) => unknown } };

// === Positive cases — toPass budgets BELOW 15_000 ===

// (1) Canonical 5s budget — the exact shape PR #533 originally shipped
//     for deep-link/external-link tests.
void expect(() => 'x').toPass({ timeout: 5_000 });

// (2) Same value without the underscore separator — both forms are
//     valid JS literals; the plugin must catch both.
void expect(() => 'x').toPass({ timeout: 5000 });

// (3) 10s budget — also below 15s threshold. Tests the 10000-14999 band.
void expect(() => 'x').toPass({ timeout: 10_000 });

// (4) Edge case just below threshold — 14_999 is the largest still-flagged value.
void expect(() => 'x').toPass({ timeout: 14_999 });

// (5) Sub-second budget — way too short for Apple-Event roundtrip,
//     plugin must flag.
void expect(() => 'x').toPass({ timeout: 1_000 });

// === Negative cases — toPass budgets AT OR ABOVE 15_000 ===

// (6) Exact threshold — must NOT fire. The calibration unit test's
//     invariant is `>= 15_000`; the plugin mirrors that boundary.
void expect(() => 'x').toPass({ timeout: 15_000 });

// (7) Comfortable headroom — the value the fix in this PR adopts.
void expect(() => 'x').toPass({ timeout: 30_000 });

// (8) `15000` without underscore — the literal form variant must NOT fire.
void expect(() => 'x').toPass({ timeout: 15000 });

// (9) `toPass()` without options — no `timeout` to flag, must NOT fire.
//     Playwright's default ~5s applies internally, but that's a separate
//     concern; the plugin only checks declared `timeout:` literals.
void expect(() => 'x').toPass();
