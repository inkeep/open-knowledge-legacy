# Evidence: SPA Routing Options

**Dimension:** Follow-up F3 — React Router v7 / TanStack Router / lightweight alternatives
**Date:** 2026-04-08
**Sources:** Official docs, npm, GitHub repos

---

## Key sources referenced

- https://reactrouter.com/start/modes — React Router v7 modes
- https://reactrouter.com/how-to/spa — React Router SPA guide
- https://tanstack.com/router/latest/docs/overview — TanStack Router overview
- https://github.com/molefrog/wouter — Wouter (minimalist router)
- https://github.com/oedotme/generouted — Generouted (file-based routing for Vite)

---

## Findings

### Finding: The app doesn't need a router today
**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/` has 12 `.tsx` files, all editor-related. `main.tsx` renders a bare `createRoot` with no router. `App.tsx` is a single component with TipTap editor, source toggle, and presence bar. No multi-page navigation, no URL-driven state.

**Implications:** Adding a router now is premature. The single `<App>` component with conditional rendering works.

### Finding: React Router v7 has three modes — Declarative mode is right for this use case
**Confidence:** CONFIRMED
**Evidence:** React Router v7 (v7.9.2+) has Declarative mode (classic `<BrowserRouter>`), Data mode (loaders/actions via `createBrowserRouter`), and Framework mode (full Remix-like with Vite plugin, file-based routing). Declarative mode: ~8KB, zero opinions about build tool, works with Vite natively.

**Implications:** When routing is needed, Declarative or Data mode — not Framework mode. Framework mode adds unnecessary SSR machinery.

### Finding: TanStack Router offers type-safe search params — valuable for an editor app
**Confidence:** CONFIRMED
**Evidence:** TanStack Router v1.167+ (~12KB gzipped, ~2.1M weekly npm downloads, ~14K GitHub stars). First-class Zod integration for typed search params. File-based routing via `@tanstack/router-plugin/vite`. Built-in devtools, automatic code splitting, SWR caching on loaders.

Example: URL state for editor mode, document ID, and cursor could be typed:
```typescript
validateSearch: zodValidator(z.object({
  docId: z.string().optional(),
  mode: z.enum(['wysiwyg', 'source']).default('wysiwyg'),
}))
```

**Implications:** If the app evolves to need URL-encoded editor state, TanStack Router's search param validation is genuinely useful. More investment than React Router but better DX for typed URLs.

### Finding: Wouter is the lightest option at ~1.5KB
**Confidence:** CONFIRMED
**Evidence:** Wouter: ~1.5KB gzipped, ~877K weekly npm downloads, ~7.8K GitHub stars. No dependencies, no context provider. Familiar `<Route>`, `<Link>`, `<Switch>` API. No loaders, no type-safe params, no file-based routing, no code splitting.

**Implications:** Perfect for "I just need 3-4 routes and nothing else." The right choice if routing needs stay minimal.

### Finding: File-based routing for Vite exists without Next.js
**Confidence:** CONFIRMED
**Evidence:** Three options: (1) TanStack Router Vite Plugin — most actively maintained, type-safe, (2) Generouted — lighter, 1.2K stars, single maintainer, (3) vite-plugin-pages — aging, React Router v6 only.

**Implications:** If file-based routing is desired (Next.js-style DX without the framework), TanStack Router's Vite plugin is the best option.

---

## Recommendation

**Today:** No router needed. Don't add one prematurely.

**When multi-document support arrives:**

| Need | Recommendation | Size |
|------|---------------|------|
| Just 2-3 routes | Wouter | ~1.5KB |
| Standard SPA routing | React Router v7 Declarative | ~8KB |
| Type-safe URLs + search params | TanStack Router | ~12KB |
| File-based routing without SSR | TanStack Router + Vite plugin | ~12KB + codegen |
