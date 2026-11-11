# Routing

> **Status:** Complete · **Layers:** app, pages, widgets, entities, shared, outside layers · **Verified against:** `8df68fb`

## Purpose

A single-page app still has addresses: each screen needs a URL that can be bookmarked, linked and
opened cold, and some screens need a guard or a data prefetch to finish before they render. Routing
maps every URL to a screen through TanStack Router, runs that work first, and answers every other
URL with a not-found page. It also owns what the visitor sees while that work runs and when it
fails: every route falls back to a translated pending screen and to a contained, recoverable error
screen, both rendered inside the app shell rather than in place of it. It keeps route state — the
location, its params, navigation — inside the `app` layer (the top tier of the Feature-Sliced Design
stack this repo is organised in; [Architecture](#architecture) defines that vocabulary), so every
page below it is a plain component that takes props and renders without a router. Because the route
tree is generated from the files in `src/app/routes`, a link to a path that no route file declares
fails `npm run typecheck` instead of reaching a user as a broken page.

Four entry points into the rest of this document. To **add a screen**, go to
[Add a public screen](#add-a-public-screen). To **understand the fallbacks**, read
[When the pending screen appears](#when-the-pending-screen-appears),
[A route throws](#a-route-throws) and [No route matches](#no-route-matches). To **change the
policy** (a timing, a preload option, a fallback component), go to
[Change the routing policy](#change-the-routing-policy) and the option table under
[Configuration](#configuration). For what routing does **not** do — no search-param validation, no
document title, and no report for a contained route failure yet — see
[Known limitations](#known-limitations).

## How it works

### Build time: files become a typed route tree

`@tanstack/router-plugin`, the Vite plugin registered as `routerPlugin` in `vite.config.ts`, scans
`src/app/routes`. Every file there except the co-located `*.test.tsx` files is a _route module_: it
exports a `Route`, and its file name is its URL (`sign-in.tsx` serves `/sign-in`). The plugin writes
`src/app/router/route-tree.gen.ts`, the _route tree_: every route wired to its parent, plus a
`declare module '@tanstack/react-router'` block that gives each route's path and parent a type. With
`autoCodeSplitting: true` it also moves each route's `component` into a chunk of its own. The plugin
runs when `npm run dev` starts, again on every file change, and on every `vite build`. It is left
out when Vite runs in `test` mode, so Vitest imports the committed tree as it is.

### Start-up: the router is built inside the provider tree

```text
src/main.tsx → <App />
└─ ErrorBoundary                app/entrypoint/app.tsx: the root error boundary, AppCrashFallback
   └─ AppProviders              app/entrypoint: ThemeProvider, then QueryClientProvider…
      └─ <Suspense fallback={null}>   …then everything below, the router included
         └─ I18nProvider        and beneath it, in order: NotificationViewport,
                                HttpClientProvider, SessionResolverProvider,
                                SessionStarterProvider, SessionEnderProvider, NotifierProvider
            └─ AppRouterProvider   app/router: router context from hooks, router from a useState initializer
               └─ RouterProvider
                  └─ RootLayout    app/routes/__root.tsx: the banner, the outlet and the devtools
                     ├─ AppHeader      widgets/app-header: the <header> banner, on every route
                     └─ <Outlet />     the matched route's component, or its fallback:
                        ├─ /                          HomeRoute → HomePage
                        ├─ /sign-in                   SignInRoute → SignInPage
                        ├─ /_authenticated (no URL)   the guard → /users/$userId: UserProfileRoute → UserProfilePage
                        ├─ still loading              RoutePendingPage, the router-wide defaultPendingComponent
                        ├─ threw                      RouteErrorFallback, the router-wide defaultErrorComponent → RouteErrorPage
                        └─ any other URL              NotFoundPage, the root route's notFoundComponent
```

The [composition root](./composition-root.md) — `app/entrypoint`, the one segment that constructs
concrete implementations and publishes them — builds everything above `AppRouterProvider` in this
tree, `ErrorBoundary` through `AppProviders`, and owns the order those providers sit in. One node of
it matters to routing: the `<Suspense fallback={null}>` in `app-providers.tsx` sits _above_
`RouterProvider`, so the only suspensions it ever catches are ones raised outside the router, such
as `I18nProvider` initialising. Nothing inside the router reaches it. TanStack wraps every _match_
— the live object it creates for one route on the path a URL selects — in a `Suspense` whose
fallback is that match's pending screen, and wraps the whole match tree in one more falling back to
the root route's. The root match is no exception: a suspension raised in `RootLayout` itself or in
the `AppHeader` banner shows `RoutePendingPage` for as long as it lasts, rather than a blank screen.

`AppRouterProvider` reads three _ports_ out of React context — `useHttpClient()`,
`useQueryClient()` and `useSessionResolver()` — into an `AppRouterContext` object, the _router
context_. A port, in this repo, is a type consumers program against while the composition root picks
the implementation. `AppRouterProvider` creates the router once, with
`useState(() => createAppRouter({ context }))`, and renders
`<RouterProvider router={router} context={context} />`. `createAppRouter` hands TanStack's
`createRouter` the generated `routeTree`, two preload options, and the fallback policy it spreads in
from `ROUTER_FALLBACK_DEFAULTS` (`src/app/router/router-fallback-defaults.ts`). It passes no
`history`, so the router follows the browser's address bar through TanStack's default,
`createBrowserHistory()`.

### A navigation

The router turns a URL into a list of matches, one per route on the path from the root down to the
deepest route the URL selects: `/users/$userId` gives a match for the root, one for `_authenticated`
and one for `users.$userId`. Each is a live object, not a description — it holds that route's
params, its load state (`pending`, `success`, `error` or `notFound`) and its own error boundary —
and everything below about pending screens, retries and containment is said of one match rather
than of "the page". Each match runs two route options in turn. `beforeLoad` is the guard: it runs
before any data is fetched and may redirect or throw to stop the navigation there. `loader` is the
data the screen needs before it renders. Both receive the router context as `context`. The router
calls every
matched `beforeLoad` from the root down, then runs the matched `loader`s, fetching each matched
route's component chunk concurrently with its loader rather than waiting for the loader to settle
first. It then renders `RootLayout`, whose `AppHeader` banner is mounted
once and survives every navigation, with that route's component in the `<Outlet />` beneath it. At
`/`, `HomeRoute` reads `appConfig` and renders `HomePage` with its `name`, `mode` and `apiBaseUrl`
as props. Once the new screen has rendered, the router scrolls the window to the top or, on Back and
Forward, to where the visitor left that history entry (`scrollRestoration: true`).

### Which pending screen, and whose

A match still loading after 300 ms (`defaultPendingMs`) shows a pending screen for at least 300 ms
(`defaultPendingMinMs`). Which screen is resolved per match, not per navigation: TanStack reads
`route.options.pendingComponent ?? router.options.defaultPendingComponent` for the match that is
pending, so a route that declares its own wins _for its own match only_, and
every match whose route declares none falls back to the router-wide `RoutePendingPage`. One route
declares its own: `_authenticated`, whose `pendingComponent: ResolvingSessionPage` names the session
check the visitor is waiting on ([Authenticated route guard](./route-guard.md)). So on the way to
`/users/$userId` the visitor can see two different screens in sequence. While the `_authenticated`
match is pending — its `beforeLoad` awaiting the session check — that match resolves
`ResolvingSessionPage`. Once the guard resolves and the `/users/$userId` match is the one still
pending on its own `loader`, that match resolves its own screen; `users.$userId.tsx` declares no
`pendingComponent`, so it gets `RoutePendingPage`. Declaring a screen on a layout route does not
hand it down to the children; it only covers the layout route's own load work.

### When the pending screen appears

The two timings do not describe every case, because TanStack takes one of three paths. The first two
are pinned by
`src/app/router/router-fallback-defaults.test.tsx`; the third is exercised by a route in that file
but never asserted.

- **After 300 ms, on a slow navigation.** A match whose `beforeLoad`, `loader` or code-split chunk
  is still running when `defaultPendingMs` elapses swaps in its pending screen, and
  `defaultPendingMinMs` then holds it for at least 300 ms so a load that finishes at 310 ms does not
  produce a flash. Anything faster than 300 ms never shows a pending screen at all. Pinned by the
  `shows the pending screen when a navigation outlasts the pending delay` case.
- **At once, on a retry.** This is the `Try again` button of the error screen, introduced under
  [A route throws](#a-route-throws) and [The retry](#the-retry) below. It _invalidates_ the failed
  match — throws that match's loaded state away so the router runs the route again — with
  `router.invalidate({ forcePending: true, … })`, and TanStack uses a delay of `0` for an
  invalidated match, so the error screen is replaced by the pending screen in the same tick rather
  than 300 ms later. Whether it appears at all turns on what the match _declares_, not on how long
  the work takes: TanStack's `routeNeedsLoad(route)` is
  `loader || beforeLoad || lazyFn || component?.preload || pendingComponent?.preload` — `lazyFn`
  being the deferred module a route attaches with `Route.lazy()`, the one entry this repo has no use
  for — and a match moves back to `pending` only when that holds. A match that declares one of them
  has to await a promise on the reload, so it commits at least one render in `pending` and the
  screen appears even for a loader that resolves instantly; a match that declares none settles
  inside the same synchronous pass and the visitor goes straight back to the route. Both halves are
  pinned by fixtures in the same test file: `/broken` declares `loader: loadNothing` — a loader that
  resolves immediately — and its retry case asserts `findByRole('status')`, while `/crashing`
  declares no loader at all and its retry case asserts `queryByRole('status')` is absent. One of the
  five is genuinely consumed rather than declared: `lazyRouteComponent` clears its own `preload`
  after a successful fetch, so a route chunk that has already been fetched stops counting.
- **At once, on a suspension inside the route.** The pending element is also every match's
  `Suspense` fallback, and React shows a fallback the moment a child suspends. `defaultPendingMs`
  does not apply on this path. This is the unasserted one. The `/greeting` route exercises it — its
  component calls `useSuspenseQuery` — but the suspense case asserts only that the refetched
  greeting appears; it never queries the `status` role or the `Loading…` text.

### Links and preloading

A `<Link>` renders a real `<a href>` and turns a plain left click into a
client-side navigation, with no page reload. With `defaultPreload: 'intent'`, hovering over or
focusing a link for 50 ms (TanStack's `defaultPreloadDelay`), or touching it, _preloads_ its target:
the router fetches the target's component chunk and runs its `beforeLoad` and `loader` before the
click. `defaultPreloadStaleTime: 0` stops the router caching what that preload produced, so the
click runs the loader again and TanStack Query's own cache decides whether a request goes out.

### A route throws

A component that crashes while rendering, or a `beforeLoad` or `loader` that
rejects with anything other than a redirect, stops at that match's own error boundary. Because
`defaultErrorComponent: RouteErrorFallback` is set router-wide, every non-root match has one, and
the innermost boundary catches. So what the visitor keeps is the app shell with exactly one slot
replaced: the failing match's own slot becomes the error screen, while the `AppHeader` banner and
every ancestor layout route stay mounted.

`RouteErrorFallback` (`src/app/router/route-error-fallback.tsx`) renders `RouteErrorPage` from
`@/pages/route-error` — one `<main>` with an `<h1>` that focuses itself on mount, a description, a
`Try again` button and a `Back to home` link, and no `error` prop, so a thrown message has no route
to the DOM. A
`notFound()` raised while rendering is the one value it does not treat as a failure: it passes that
on instead, so a mistyped deep link still reaches the root route's `notFoundComponent` and renders
`NotFoundPage` rather than the error screen. How the pass-through works, and why the fallback is
split into a hook-free outer layer and a `RouteErrorRecovery` inner one, belong to
[Error handling and reporting](./error-handling.md), which owns the containment machinery.

Nothing reports any of this yet. A catch at a per-match boundary reaches no `ErrorReporter`: no
production module sets TanStack's `defaultOnCatch`, so a contained route failure leaves only React's
own caught-error log and, outside production, TanStack's `Warning: Error in route match: <id>`.
Wiring it is a next step the repo intends rather than a permanent hole: the lever is
`createRouter`'s `defaultOnCatch`, and
[the recipe](./error-handling.md#report-route-failures-through-the-port) is written out. It is
recorded under [Known limitations](#known-limitations) until then. The reporting described below,
under [The root route is the exception](#the-root-route-is-the-exception), covers shell crashes
only — never a failure a route boundary contained.

### The retry

The `Try again` button invalidates the failed match, as
[When the pending screen appears](#when-the-pending-screen-appears) describes. That is deliberately
more than clearing the boundary's own state, which would re-render the component without ever
re-running the `loader` that failed. `RouteErrorFallback` passes three options with the call, and
each does a distinct job:

```ts
void router.invalidate({
  filter: (match) => match.id === failedMatchId,
  forcePending: true,
  sync: true,
});
```

- **`filter`** confines the invalidation to the failed match, so the layout routes above it stay
  mounted and visible with their own state. Dropping `filter` while keeping `forcePending: true` and
  `sync: true` invalidates the whole committed chain instead, the `/section/*` layout route above
  the failure included: that layout route is forced back into `pending` too, and its subtree is
  hidden — `display: none`, still in the DOM — for the duration of the reload, so the layout the
  visitor was looking at goes away along with the failed slot. That is what
  `expect(screen.getByText(SECTION_LAYOUT_TEXT)).toBeVisible()` holds in place in the two
  `/section/*` retry cases, and it is why the assertion is about visibility rather than about
  finding the element. What `filter` does not change is how often the failure is caught: taking it
  out of the call leaves every catch count in `router-fallback-defaults.test.tsx` exactly where it
  was.
- **`forcePending`** clears the match's stored error and puts it back into `pending`, so the visitor
  watches `RoutePendingPage` while the reload runs instead of the error screen sitting there until
  it finishes — on a match that declares load work at all, per
  [When the pending screen appears](#when-the-pending-screen-appears) above. It is not merely
  cosmetic, but it earns its place in one case only. A match already in `error` or `notFound` status
  is reset to `pending` anyway whenever `routeNeedsLoad(route)` holds, so a failed `loader` or
  `beforeLoad` needs no help. The case that needs it is a render failure: a match whose `loader`
  succeeded and whose component then threw still carries `status: 'success'`, and `forcePending` is
  the only thing that moves that one back to `pending`.
- **`sync`** is what holds a click to a single new catch. Without it a stale ancestor loader reloads
  in the background and republishes the failed match when it lands; the republished copy resets the
  failed match's boundary and the same failure is announced again. The cost is one a visitor feels:
  every extra catch remounts `RouteErrorPage`, whose `<h1>` calls `focus()` in a mount effect, so
  focus is pulled back to the heading from wherever the visitor had moved it in the meantime. The
  flag's mechanism inside TanStack belongs to
  [Error handling and reporting](./error-handling.md), which owns it.

So `sync` bounds the catch count, `filter` keeps the ancestors on screen, and `forcePending` is what
puts a render-failed match back into `pending`. The suite asserts the first of those by counting
`defaultOnCatch` calls on a test router: **two calls in total** after one retry of a route that
keeps failing — the original failure plus the one new catch this click adds — on each of the five
retry paths it drives that way. Take `sync` out of the call and two of those five rise to three in
total; take all three options out for a plain `router.invalidate()` and the totals run from two to
five, so a single click adds anywhere between one and four catches depending on the route shape.
Why a republished match resets its boundary at all, and why TanStack's `reset` prop is deliberately
not used, are explained in [Error handling and reporting](./error-handling.md).

### The root route is the exception

`__root.tsx` sets `errorComponent: false`, which TanStack reads
as "no boundary here" rather than "fall back to the default". A crash in `RootLayout` therefore
leaves `RouterProvider` entirely and reaches the root `ErrorBoundary` in
`src/app/entrypoint/app.tsx`, where `AppCrashFallback` renders and `handleRenderError` reports it as
`{ source: 'render' }` ([Error handling and reporting](./error-handling.md)). The root keeps its
`notFoundComponent`, so not-found handling is unaffected.

### No route matches

For an unknown URL the router renders the `notFoundComponent` of the deepest
matched route that declares one. Only the root route declares one, so every unknown URL renders
`NotFoundPage` in `RootLayout`'s `<Outlet />`, under the same `AppHeader` banner every matched route
shows: the heading "Page not found", one sentence, and a "Back to home" `<Link>` to `/`. This relies
on the server answering an unknown path with the app's `index.html`:
the dev server and `vite preview` do, and a production host has to be configured to (see
[Deploy behind a static host](#deploy-behind-a-static-host)).

### One failure the router never sees

A route module the tree does not list cannot ship:
`createFileRoute('/about')` type-checks only once the generated tree declares `'/about'`, so a stale
tree fails `npm run typecheck`, and with it `npm run build` and `npm run audit`.

## Architecture

Feature-Sliced Design (FSD) splits `src/` into layers — `app`, `pages`, `widgets`, `features`,
`entities`, `shared`, top to bottom — and a module imports only from layers below its own. `pages`,
`widgets`, `features` and `entities` hold _slices_, one concept each (`pages/not-found`), divided
into purpose-named _segments_ (`ui`, `model`, `api`) and reached from outside only through the
slice's `index.ts`, its _public API_; `app` and `shared` have segments but no slices. Routing lives
almost entirely in `app`, the layer that holds the repo's _composition root_ (`app/entrypoint`, the
only place that binds concrete implementations to _ports_ — the repo's word, used interchangeably
with _seam_, for a type that consumers program against while the implementation is chosen
elsewhere). The router context is the seam routing adds: `AppRouterContext` is a typed bundle of
three ports — the `HttpClient` from `shared/api`, TanStack Query's `QueryClient`, and the
`SessionResolver` from `entities/session` — that route `beforeLoad` guards and `loader`s receive,
because they run outside React, where no hook can reach.
`app/entrypoint` constructs the concretes and publishes them through the providers in
`AppProviders`; `AppRouterProvider` in `app/router` reads them back and hands them to the router; a
route module only ever sees `context`. Two `app` segments split the rest by axis of change:
`app/routes` holds URL-to-screen wiring — thin _adapters_ that read route state or config and hand
plain props and callbacks to a page — and `app/router` holds construction, policy, fallbacks,
mounting and the generated tree. The root route is the one route module that renders markup of its
own: it mounts `AppHeader` from `widgets/app-header` above the `<Outlet />`, so the app-shell banner
is part of every screen rather than something each page repeats. Every import points downward:
`app/routes` imports `pages` slices, `widgets/app-header`, `entities/user` and `shared/config`;
`app/router` imports `entities/session`, `shared/api`, `@/pages/route-error` and
`@/pages/route-pending`; and below `app` the router's only importable export is `Link`, which
`pages/not-found` and `pages/route-error` use.

| Component                                                   | Layer                          | Responsibility                                                                                                                                                                                                                                            | File                                                                                                       |
| ----------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `createAppRouter`, `CreateAppRouterOptions`, `AppRouter`    | `app/router`                   | Builds the router from `routeTree` with the app's routing policy, and registers `AppRouter` with TanStack's `Register` interface so links and redirects are type-checked                                                                                  | `src/app/router/create-app-router.ts`                                                                      |
| `ROUTER_FALLBACK_DEFAULTS`                                  | `app/router`                   | The single source of the fallback policy: the two pending timings, the pending and error components, and `disableGlobalCatchBoundary`. `createAppRouter` spreads it in                                                                                    | `src/app/router/router-fallback-defaults.ts`                                                               |
| `RouteErrorFallback`                                        | `app/router`                   | The router-wide `defaultErrorComponent`: passes a render-time not-found on, otherwise renders `RouteErrorPage` with a retry scoped to the failed match and a TanStack Query error reset (see [Error handling and reporting](./error-handling.md))         | `src/app/router/route-error-fallback.tsx`                                                                  |
| `AppRouterContext`                                          | `app/router`                   | The router context type: `httpClient`, `queryClient` and `sessionResolver`, all required                                                                                                                                                                  | `src/app/router/app-router-context.ts`                                                                     |
| `AppRouterProvider`                                         | `app/router`                   | Reads the three ports from React context, creates the router once, renders `RouterProvider` and re-supplies the context on every render                                                                                                                   | `src/app/router/app-router-provider.tsx`                                                                   |
| `routeTree`                                                 | `app/router` (generated)       | The route tree and the `FileRoutesByPath` type augmentation, written by the router plugin and never edited by hand                                                                                                                                        | `src/app/router/route-tree.gen.ts`                                                                         |
| `Route` (id `__root__`), `RootLayout`                       | `app/routes`                   | The root route: types the context with `createRootRouteWithContext<AppRouterContext>()`, mounts `AppHeader` above `<Outlet />`, renders the router devtools, opts out with `errorComponent: false`, and sets `notFoundComponent: NotFoundPage`            | `src/app/routes/__root.tsx`                                                                                |
| `Route` (id `/`), `HomeRoute`                               | `app/routes`                   | The index route: passes `appConfig.name`, `appConfig.mode` and `appConfig.apiBaseUrl` to `HomePage`                                                                                                                                                       | `src/app/routes/index.tsx`                                                                                 |
| `RoutePendingPage`                                          | `pages/route-pending · ui`     | The router-wide pending screen: one `<main>` around an `<output>` (implicit `status` role) reading `routePending.loading`, and deliberately no `<h1>`                                                                                                     | `src/pages/route-pending/ui/route-pending-page.tsx`                                                        |
| `RouteErrorPage`                                            | `pages/route-error · ui`       | The recoverable route error screen: a focused `<h1>`, a description, a retry `Button` and a `Back to home` `Button` wrapping a `Link`. Takes no `error`                                                                                                   | `src/pages/route-error/ui/route-error-page.tsx`                                                            |
| `NotFoundPage`                                              | `pages/not-found · ui`         | The 404 screen; with `RouteErrorPage`, one of the two modules below `app` that import from the router (`Link`)                                                                                                                                            | `src/pages/not-found/ui/not-found-page.tsx`                                                                |
| `ResolvingSessionPage`                                      | `pages/resolving-session · ui` | The guard's own pending screen, which wins over the router default inside the guarded subtree — owned by [Authenticated route guard](./route-guard.md)                                                                                                    | `src/pages/resolving-session/ui/resolving-session-page.tsx`                                                |
| `HomePage`                                                  | `pages/home · ui`              | The worked example the index route renders, documented in [Internationalization](./internationalization.md)                                                                                                                                               | `src/pages/home/ui/home-page.tsx`                                                                          |
| `AppHeader`                                                 | `widgets/app-header · ui`      | The app-shell `<header>` banner `RootLayout` mounts on every route: the application name in a `<span>`, and the `LocaleSwitcher` from `features/switch-locale` (see [App shell](./app-shell.md) and [Internationalization](./internationalization.md))    | `src/widgets/app-header/ui/app-header.tsx`                                                                 |
| `App`                                                       | `app/entrypoint`               | Mounts `AppRouterProvider` inside `AppProviders` and the root `ErrorBoundary` that catches what the root route lets through                                                                                                                               | `src/app/entrypoint/app.tsx`                                                                               |
| `AppProviders`                                              | `app/entrypoint`               | Publishes what `AppRouterProvider` reads: `QueryClientProvider`, `HttpClientProvider`, `SessionResolverProvider` (see [Composition root](./composition-root.md))                                                                                          | `src/app/entrypoint/app-providers.tsx`                                                                     |
| `SessionResolver`, `useSessionResolver`                     | `entities/session · model`     | The guard's port and the hook that reads it into the router context, owned by [Authenticated route guard](./route-guard.md)                                                                                                                               | `src/entities/session/model/session-resolver.ts`, `src/entities/session/model/session-resolver-context.ts` |
| `HttpClient`, `useHttpClient`                               | `shared/api`                   | The transport port and the hook that reads it into the router context, owned by [HTTP transport](./http-transport.md)                                                                                                                                     | `src/shared/api/http-client.ts`, `src/shared/api/http-client-context.ts`                                   |
| `appConfig`                                                 | `shared/config`                | The configuration the index route reads, owned by [Configuration and environment](./configuration.md)                                                                                                                                                     | `src/shared/config/app-config.ts`                                                                          |
| `notFound.*`, `routeError.*`, `routePending.*`              | `shared/i18n`                  | The copy for the three router-owned screens, in `en` and `ru`                                                                                                                                                                                             | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json`                         |
| `routerPlugin`                                              | `outside layers`               | The `tanstackRouter` plugin instance: generates the tree and code-splits route components; absent from the plugin list when `mode === 'test'`                                                                                                             | `vite.config.ts`                                                                                           |
| Router import fence and route rules                         | `outside layers`               | `no-restricted-imports` allows only `Link` from `@tanstack/react-router` below `app`; `@tanstack/eslint-plugin-router`'s recommended rules; `react-refresh/only-export-components` off for route modules; the tree ignored                                | `eslint.config.js`                                                                                         |
| `ROUTE_FALLBACK_RESTRICTIONS`, `PAGE_LANDMARK_RESTRICTIONS` | `outside layers`               | `no-restricted-syntax` blocks: a route file may set no `errorComponent` but `false` and must spell its options out inline; `<main>`, `<h1>`, `role="main"` and `role="heading"` are barred from route files and from `widgets`, `features` and `entities` | `eslint.config.js`                                                                                         |
| `src/app/router/route-tree.gen.ts` entry                    | `outside layers`               | Keeps Prettier off the generated tree                                                                                                                                                                                                                     | `.prettierignore`                                                                                          |
| `vi.stubGlobal('scrollTo', vi.fn())`                        | `outside layers`               | Stubs the global `scrollTo` the router calls after every navigation, which jsdom does not implement                                                                                                                                                       | `vitest.setup.ts`                                                                                          |
| `GENERATED_ROUTE_TREE`                                      | `outside layers`               | Exempts the tree from the coverage-scope guard                                                                                                                                                                                                            | `scripts/verify-coverage-scope.mjs`                                                                        |
| `application shell` spec                                    | `outside layers`               | The not-found page, its link home and the app-shell banner, in the production build                                                                                                                                                                       | `e2e/app-shell.spec.ts`                                                                                    |

## Public surface

**Routes** — every route in `src/app/router/route-tree.gen.ts`:

| Path                                    | Auth            | Purpose                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                     | `public`        | The index route, `src/app/routes/index.tsx`: renders `HomePage` with values from `appConfig`                                                                                                                                                                       |
| `/sign-in`                              | `public`        | `src/app/routes/sign-in.tsx`: renders `SignInPage` and navigates to `/` after a sign-in — see [Sign-in](./sign-in.md)                                                                                                                                              |
| `/users/$userId`                        | `authenticated` | `src/app/routes/_authenticated/users.$userId.tsx`: prefetches the user in its `loader`, renders `UserProfilePage`, and sends the visitor to `/sign-in` once the session is ended — see [User profile (read path)](./user-profile.md) and [Sign-out](./sign-out.md) |
| _(pathless)_ route id `/_authenticated` | —               | `src/app/routes/_authenticated.tsx`: the layout route whose `beforeLoad` guards every module under `src/app/routes/_authenticated/`, and the only route with a `pendingComponent` of its own — see [Authenticated route guard](./route-guard.md)                   |
| _(root)_ route id `__root__`            | —               | `src/app/routes/__root.tsx`: wraps every route in `RootLayout` — the `AppHeader` banner above the `<Outlet />` — owns not-found handling, and opts out of route error handling with `errorComponent: false`                                                        |
| any other URL                           | `public`        | No route matches, so the root route's `notFoundComponent` renders `NotFoundPage`                                                                                                                                                                                   |

**The router-rendered page slices.** Each exports one component from its `index.ts`, takes no route
state, and is rendered by the router rather than by a route module. Routing owns the first three;
the fourth is the guard's, listed here so the set is complete.

| Export                 | Slice                     | Contract                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotFoundPage`         | `pages/not-found`         | No props. One `<main>` holding an `<h1>` (`notFound.title`), a `<p>` (`notFound.description`) and `<Link to="/">` (`notFound.backToHome`). Needs a `RouterProvider` ancestor, because `Link` reads the router, and an i18n instance, because it calls `useTranslation()`                                                                                            |
| `RoutePendingPage`     | `pages/route-pending`     | No props. One `<main>` holding an `<output>` — an implicit `status` live region — with `routePending.loading`. It renders **no `<h1>`**: the screen is transient, and a heading here would make every unnamed `findByRole('heading', { level: 1 })` in the suite race against it (see [Unit and component testing](./unit-testing.md)). Needs only an i18n instance |
| `RouteErrorPage`       | `pages/route-error`       | `{ readonly onRetry: () => void }`. One `<main>` holding an `<h1>` (`routeError.title`, `tabIndex={-1}`, focused on mount), a `<p>` (`routeError.description`), a `Button` bound to `onRetry` (`routeError.retry`) and a `Button asChild variant="outline"` wrapping `<Link to="/">` (`routeError.backToHome`). No `error` prop: it cannot render a thrown message  |
| `ResolvingSessionPage` | `pages/resolving-session` | No props. One `<main>` holding an `<h1>` (`session.resolving`). The `pendingComponent` of `_authenticated`, so it answers that match's pending state only — owned by [Authenticated route guard](./route-guard.md), which documents its copy and its test                                                                                                           |

**The router contract inside `app`.** `app` has segments rather than slices, and its public API,
`src/app/index.ts`, exports only `App`; route modules, router modules and their tests reach the
following by relative path.

| Export                     | Module                                       | Contract                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppRouterContext`         | `src/app/router/app-router-context.ts`       | `{ readonly httpClient: HttpClient; readonly queryClient: QueryClient; readonly sessionResolver: SessionResolver }` — what every `beforeLoad` and `loader` receives as `context`                                 |
| `createAppRouter`          | `src/app/router/create-app-router.ts`        | `createAppRouter(options: CreateAppRouterOptions)` returns a router built from `routeTree` with the policy listed under [Configuration](#configuration)                                                          |
| `CreateAppRouterOptions`   | `src/app/router/create-app-router.ts`        | `{ readonly context: AppRouterContext; readonly history?: RouterHistory }`. It accepts no policy option, so every caller, tests included, gets the production policy                                             |
| `AppRouter`                | `src/app/router/create-app-router.ts`        | `ReturnType<typeof createAppRouter>`, the type registered with TanStack Router                                                                                                                                   |
| `ROUTER_FALLBACK_DEFAULTS` | `src/app/router/router-fallback-defaults.ts` | An `as const` object of five `createRouter` options. Spread into `createAppRouter`, asserted whole by both router test files                                                                                     |
| `RouteErrorFallback`       | `src/app/router/route-error-fallback.tsx`    | `({ error }: Readonly<Pick<ErrorComponentProps, 'error'>>)`. TanStack also passes `reset`, which this component deliberately does not accept                                                                     |
| `AppRouterProvider`        | `src/app/router/app-router-provider.tsx`     | A component with no props. It must render inside `QueryClientProvider`, `HttpClientProvider` and `SessionResolverProvider`, whose hooks it calls                                                                 |
| `routeTree`                | `src/app/router/route-tree.gen.ts`           | Generated. Imported only by `createAppRouter`; the file's `FileRoutesByPath` augmentation is what makes `createFileRoute('<path>')` type-check                                                                   |
| `Route`                    | every route module                           | The value of `createFileRoute('<path>')(options)`, or of `createRootRouteWithContext<AppRouterContext>()(options)` for the root. The generator owns the path string and rewrites it to match the file's location |

The registration that types every link, navigation and redirect sits at the end of
`create-app-router.ts`:

```ts
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
```

With it, the `to` and `params` of `<Link>`, `useNavigate()` and `redirect()` are checked against the
generated tree; without it, TanStack falls back to an untyped router and every `to` accepts any
string.

**What a route module may use.** Anything from `@tanstack/react-router` — `createFileRoute`,
`Outlet`, `redirect`, `useNavigate`, `Route.useParams()` — and the public API of any slice on a
layer below: `@/pages/*` and `@/widgets/*` (`__root.tsx` imports `@/pages/not-found` and
`@/widgets/app-header`), plus `@/shared/config`, read at this composition seam and passed down as
props. Its `beforeLoad` and `loader` receive `context: AppRouterContext`.

`eslint.config.js` keeps construction and vendors out of `src/app/{routes,router}/**`. The list is
long and grows with each new seam, so treat this summary as indicative and
[Architecture boundaries](./architecture-boundaries.md) as the authority: the block rejects the
client constructors (`createHttpClient`, `createQueryClient`, `createI18n`), the four theme
constructors from `@/shared/theme`, the six session constructors (`SESSION_CONSTRUCTOR_NAMES`) and
value imports from `@/shared/observability`; it allows only `AppNotification`, `Notifier`,
`NotifierProvider` and `useNotifier` out of `@/shared/notifications`; it bans the vendors `axios`,
the i18next packages, `@tanstack/react-form`, `react-error-boundary` and `sonner` — type-only
imports of `i18next` and `@tanstack/react-form` excepted; and its patterns force every segment and
slice to be imported through its public API, including
`^@/(entities|features|widgets|pages)/[^/]+/(?!@x/).+`, which is what stops a route module reaching
past `@/pages/home` into a file inside it. Two `no-restricted-syntax` blocks also constrain the
shape of a route file itself; they are described under
[The route-file fences](#the-route-file-fences).

**What is allowed below `app`.** `import { Link } from '@tanstack/react-router'` and nothing else
from the router, in every file under `src/entities`, `src/features`, `src/widgets`, `src/pages` and
`src/shared`, test files included. `to` and `params` are checked against the tree.

**Copy.** The screens' strings live in the `common` namespace of each locale, which is bundled
eagerly for both, so a failure screen is translated even when the failure was a chunk that never
arrived. Routing owns the not-found and pending families:

| Key                    | `en/common.json`                         | `ru/common.json`                           |
| ---------------------- | ---------------------------------------- | ------------------------------------------ |
| `notFound.title`       | `Page not found`                         | `Страница не найдена`                      |
| `notFound.description` | `The page you requested does not exist.` | `Запрошенная вами страница не существует.` |
| `notFound.backToHome`  | `Back to home`                           | `На главную`                               |
| `routePending.loading` | `Loading…`                               | `Загрузка…`                                |

The convention across the doc set is that each doc lists the keys its own screens render, and
[Internationalization](./internationalization.md) carries the full per-namespace inventory with a
`ru` column beside the `en` one. So the four `routeError.*` keys `RouteErrorPage` renders — `title`,
`description`, `retry` and `backToHome` — are listed in
[Error handling and reporting](./error-handling.md), which owns that screen, and the guard's
`session.resolving` in [Authenticated route guard](./route-guard.md).

## Configuration

Routing reads no `VITE_*` variable itself. The index route reads `appConfig`, whose `apiBaseUrl`
comes from `VITE_API_BASE_URL`, and everything else is an option in `create-app-router.ts`,
`router-fallback-defaults.ts`, `vite.config.ts` or `__root.tsx`:

| Variable / option                                                                | Default                                                                        | Meaning                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context` (`CreateAppRouterOptions`)                                             | required                                                                       | The `AppRouterContext` every `beforeLoad` and `loader` receives; `AppRouterProvider` fills it from React context                                                                                                                                                         |
| `history` (`CreateAppRouterOptions`)                                             | TanStack's `createBrowserHistory()`                                            | Where the router reads and writes the location. The app passes none; tests pass `createMemoryHistory({ initialEntries: [path] })`                                                                                                                                        |
| `defaultPreload`                                                                 | `'intent'`                                                                     | A `<Link>` preloads its target on hover or focus (after `defaultPreloadDelay`) and on touch. TanStack's default is no preloading                                                                                                                                         |
| `defaultPreloadStaleTime` (`ROUTER_PRELOAD_STALE_TIME_MILLISECONDS`)             | `0`                                                                            | How long a preload's loader result counts as fresh. `0` leaves caching to TanStack Query; TanStack's default is 30 s                                                                                                                                                     |
| `defaultPendingMs` (`ROUTER_PENDING_DELAY_MILLISECONDS`)                         | `300`                                                                          | How long a pending navigation waits before a pending screen renders. TanStack's default is `1000`; the reasoning is in [Authenticated route guard](./route-guard.md)                                                                                                     |
| `defaultPendingMinMs` (`ROUTER_PENDING_HOLD_MILLISECONDS`)                       | `300`                                                                          | The shortest time a pending screen stays up once shown. TanStack's default is `500`                                                                                                                                                                                      |
| `defaultPendingComponent`                                                        | `RoutePendingPage`                                                             | The pending screen for any match whose route declares no `pendingComponent` of its own. TanStack sets no default, which is why the guard's layout route had to declare one before this                                                                                   |
| `defaultErrorComponent`                                                          | `RouteErrorFallback`                                                           | The error component every non-root match inherits; it renders `RouteErrorPage`. TanStack's own default is its unstyled, English-only `ErrorComponent` with a "Show Error" toggle                                                                                         |
| `disableGlobalCatchBoundary`                                                     | `true`                                                                         | Removes TanStack's router-wide `CatchBoundary`, the panel that used to swallow whatever no route caught. TanStack leaves it unset, so that panel is present                                                                                                              |
| `scrollRestoration`                                                              | `true`                                                                         | Keeps each history entry's scroll position (saved to `sessionStorage` when the page is hidden) and restores it on Back and Forward; a new navigation starts at the top. TanStack's default is `false`                                                                    |
| `errorComponent` (`__root.tsx`)                                                  | `false`                                                                        | The root route's opt-out. `false` means "no boundary here", not "use the default", so a `RootLayout` crash leaves the router                                                                                                                                             |
| `notFoundComponent` (`__root.tsx`)                                               | `NotFoundPage`                                                                 | The only `notFoundComponent` in the tree, so every not-found ends here                                                                                                                                                                                                   |
| `pendingComponent` (`_authenticated.tsx`)                                        | `ResolvingSessionPage`                                                         | The one route-level override of `defaultPendingComponent`. A route option always wins, for that route's own match only — a child of `_authenticated` still gets `RoutePendingPage`                                                                                       |
| `defaultPreloadDelay`, `defaultStaleTime`, `notFoundMode`, `defaultOnCatch`      | not set: TanStack's `50`, `0`, `'fuzzy'`, none                                 | The hover delay before a preload; loader results already count as stale on ordinary navigations; an unknown URL is handled by the deepest matched route with a `notFoundComponent`, which is always the root today; and nothing is invoked when a route boundary catches |
| `routesDirectory` (`routerPlugin`)                                               | `'./src/app/routes'`                                                           | Where route modules live                                                                                                                                                                                                                                                 |
| `generatedRouteTree` (`routerPlugin`)                                            | `'./src/app/router/route-tree.gen.ts'`                                         | Where the plugin writes the tree. The name is the repo's choice, not the generator's                                                                                                                                                                                     |
| `routeFileIgnorePattern` (`routerPlugin`)                                        | `'\\.test\\.tsx?$'`                                                            | Lets `*.test.ts(x)` files sit beside route modules without becoming routes                                                                                                                                                                                               |
| `autoCodeSplitting` (`routerPlugin`)                                             | `true`                                                                         | Moves each non-root route's `component` into its own lazily loaded chunk                                                                                                                                                                                                 |
| `target`, `quoteStyle`, `semicolons` (`routerPlugin`)                            | `'react'`, `'single'`, `true`                                                  | The framework the generated code targets, and how the generator formats the tree and the modules it scaffolds; single quotes are its default, semicolons are not                                                                                                         |
| Plugin list (`vite.config.ts`)                                                   | `mode === 'test' ? [] : [routerPlugin]`                                        | Vitest runs without the plugin, against the committed tree                                                                                                                                                                                                               |
| `position`, `initialIsOpen` (`TanStackRouterDevtools`)                           | `'bottom-left'`, `false`                                                       | Where the devtools toggle sits and whether the panel starts open. Both equal the package's own defaults; the TanStack Query devtools toggle defaults to the bottom-right corner, so the two do not overlap                                                               |
| `appConfig.name`, `appConfig.mode`, `appConfig.apiBaseUrl` (read by `index.tsx`) | `'frontend-boilerplate'`, `import.meta.env.MODE`, `VITE_API_BASE_URL` or `/v1` | Passed to `HomePage` as `name`, `mode` and `apiBaseUrl`. See [Configuration and environment](./configuration.md)                                                                                                                                                         |
| `appConfig.name` (read by `__root.tsx`)                                          | `'frontend-boilerplate'`                                                       | Passed to `AppHeader` as `appName`, so the app-shell banner names the application on every route. See [Configuration and environment](./configuration.md)                                                                                                                |
| `appType` (Vite)                                                                 | not set: Vite's `'spa'`                                                        | The dev server and `vite preview` answer any unknown path with `index.html`, which is what lets a deep link reach the router                                                                                                                                             |

The two pending timings above do not by themselves say when a pending screen shows, and the retry
options are not listed here at all: both are runtime behaviour, explained under
[When the pending screen appears](#when-the-pending-screen-appears) and [The retry](#the-retry),
alongside the per-match precedence in
[Which pending screen, and whose](#which-pending-screen-and-whose) that decides _which_ pending
screen a visitor sees.

## Usage & extension

### Add a public screen

A screen is a page slice plus a route module. For an `/about` screen:

1. Add its copy to `src/shared/i18n/locales/en/common.json` — English is the type authority, so
   `t('about.title')` does not compile until the key exists there — and the translated keys to
   `src/shared/i18n/locales/ru/common.json` (see [Internationalization](./internationalization.md)):

   ```json
   {
     "about": {
       "title": "About",
       "description": "What this application is for."
     }
   }
   ```

2. Create the page slice. A page takes props and callbacks, reads no route state, and renders
   exactly one `<main>` and one `<h1>`; the `banner` landmark above it belongs to `RootLayout`, not
   to the page, so the finished screen is that banner plus this `<main>`. Only a page may render
   either element — `PAGE_LANDMARK_RESTRICTIONS` rejects both in `src/app/routes`, `src/widgets`,
   `src/features` and `src/entities`. `src/pages/about/ui/about-page.tsx`:

   ```tsx
   import { useTranslation } from '@/shared/i18n';

   export function AboutPage() {
     const { t } = useTranslation();

     return (
       <main>
         <h1>{t('about.title')}</h1>
         <p>{t('about.description')}</p>
       </main>
     );
   }
   ```

   and its public API, `src/pages/about/index.ts`:

   ```ts
   export { AboutPage } from './ui/about-page';
   ```

3. Create the route module `src/app/routes/about.tsx` as a thin adapter. Spell its options out in
   the literal; do not build them elsewhere and spread them in.

   ```tsx
   import { createFileRoute } from '@tanstack/react-router';

   import { AboutPage } from '@/pages/about';

   export const Route = createFileRoute('/about')({
     component: AboutPage,
   });
   ```

   Starting from an empty file also works: the next generation (step 4) fills it with a placeholder
   `RouteComponent` to replace. The route needs no `errorComponent` and no `pendingComponent` — it
   inherits `RouteErrorFallback` and `RoutePendingPage` from the router.

4. Regenerate the tree with `npx vite build`, or leave `npm run dev` running, and commit
   `src/app/router/route-tree.gen.ts` with the route module. Until then `createFileRoute('/about')`
   is a type error.

5. Test the page without a router, beside it in `src/pages/about/ui/about-page.test.tsx`:

   ```tsx
   import { render, screen } from '@testing-library/react';
   import { describe, expect, it } from 'vitest';

   import { AboutPage } from './about-page';

   describe('AboutPage', () => {
     it('renders the about heading', () => {
       render(<AboutPage />);

       expect(screen.getByRole('heading', { level: 1, name: 'About' })).toBeInTheDocument();
     });
   });
   ```

   and the URL through the real tree, in `src/app/routes/about.test.tsx`:

   ```tsx
   import { QueryClient } from '@tanstack/react-query';
   import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
   import { render, screen } from '@testing-library/react';
   import { describe, expect, it } from 'vitest';

   import { createHttpClientStub } from '@/shared/testing';

   import { createAppRouter } from '../router/create-app-router';

   const httpClient = createHttpClientStub();
   const sessionResolver = { resolve: () => Promise.resolve('anonymous' as const) };

   describe('the about route', () => {
     it('renders the about page at /about', async () => {
       const router = createAppRouter({
         context: { httpClient, queryClient: new QueryClient(), sessionResolver },
         history: createMemoryHistory({ initialEntries: ['/about'] }),
       });

       render(<RouterProvider router={router} />);

       expect(await screen.findByRole('heading', { level: 1, name: 'About' })).toBeInTheDocument();
     });
   });
   ```

   `AppRouterContext` requires all three ports, so even a route that issues no request has to supply
   them. `createHttpClientStub()` from `@/shared/testing` is the repo's answer: it returns a full
   `HttpClient` whose five methods all reject with "The subject under test made an unexpected GET
   request." and friends, so an accidental call fails loudly instead of returning `undefined`. Pass
   `createHttpClientStub({ get: … })` when the route does fetch — `_authenticated.test.tsx` and
   `users.$userId.test.tsx` both do. No i18n provider is needed in either test: `vitest.setup.ts`
   registers an English instance globally (see
   [Unit and component testing](./unit-testing.md)).

6. Run `npm run audit` ([Quality gates](./quality-gates.md)).

A private screen is the same steps with the route module under `src/app/routes/_authenticated/`;
[Authenticated route guard](./route-guard.md) covers that placement.

### The route-file fences

Two `no-restricted-syntax` blocks in `eslint.config.js` keep the fallback and landmark policies from
being reopened route by route. They are plain ESLint selectors, so `npm run lint` is the gate that
enforces them, and both skip the co-located test files through an `ignores` entry.

- **`ROUTE_FALLBACK_RESTRICTIONS`**, over `src/app/routes/**/*.{ts,tsx}`: a route may not set an
  `errorComponent` of its own unless the value is the literal `false` (the root's opt-out), and a
  route's options may neither be spread into the object literal nor passed as a whole object —
  because either would hide the option from the first rule. The two option-shape selectors match
  `^create(Lazy)?(File|Root)Route(WithContext)?$`, so `createFileRoute`, `createLazyFileRoute`,
  `createRootRoute` and `createRootRouteWithContext` are all covered, not only the two forms the
  repo uses today.
- **`PAGE_LANDMARK_RESTRICTIONS`**, over `src/app/routes/**/*.{ts,tsx}` and
  `src/{widgets,features,entities}/**/*.tsx`: no `<main>`, no `<h1>`, no `role="main"` and no
  `role="heading"`. Pages own both landmarks, so a rendered screen is the `AppHeader` banner plus
  exactly one page `<main>`.

If lint rejects an `errorComponent`, exactly three things are expressible instead and nothing else
is: change `RouteErrorFallback` or `RouteErrorPage`, which changes every route at once; set
`errorComponent: false` on a subtree's layout route to hand that layout route's own failures to its
parent, as `__root.tsx` does; or widen the fence. A pending screen has no such restriction — any
route may declare its own.

### Hand route state, config and navigation to a page

The adapter reads; the page receives. The three route modules that feed a page show three shapes:

- **Config to props.** `src/app/routes/index.tsx` passes `appConfig.name`, `appConfig.mode` and
  `appConfig.apiBaseUrl` to `HomePage`. Route modules read `@/shared/config` for the same reason
  `app/entrypoint/app.tsx` does — they are the composition seam — so the page stays testable with
  plain literals. This is a convention; nothing lints it.
- **URL params to props, plus a loader.** `src/app/routes/_authenticated/users.$userId.tsx` reads
  `Route.useParams()` and passes `toUserId(userId)` to `UserProfilePage`; its `loader` passes
  `createUserQueries(context.httpClient).detail(toUserId(params.userId))` to
  `context.queryClient.prefetchQuery` without awaiting it. The loader pattern is documented in
  [User profile (read path)](./user-profile.md).
- **Navigation to a callback.** `src/app/routes/sign-in.tsx` calls `useNavigate()` and passes
  `onSignedIn={() => { void navigate({ to: '/' }); }}` to `SignInPage`, so the sign-in form never
  learns that routing exists ([Sign-in](./sign-in.md)). `users.$userId.tsx` takes the same shape a
  second time, beside its params and its loader: it passes
  `onSignedOut={() => { void navigate({ to: '/sign-in' }); }}` to `UserProfilePage`, so the
  sign-out control names no destination either ([Sign-out](./sign-out.md)).

### Link to a screen

`Link` is importable from any layer, and its target is type-checked:
`<Link to="/sign-in">{t('signIn.title')}</Link>`, or
`<Link to="/users/$userId" params={{ userId: user.id }}>` for a route with a param. `NotFoundPage`
and `RouteErrorPage` are the working examples; `RouteErrorPage` also shows the `asChild` form, where
the `Button` primitive lends its styling to the `Link`'s own anchor:

```tsx
<Button asChild variant="outline">
  <Link to="/">{t('routeError.backToHome')}</Link>
</Button>
```

A page that renders a `Link` needs a `RouterProvider` above it in its tests, which a test file below
`app` cannot import — so test such a page through the route tree from `src/app/routes` or
`src/app/router`, as `create-app-router.test.tsx` does for both.

### Change the routing policy

The policy lives in two files, and each has a test that asserts it whole, so change both together.

- `src/app/router/router-fallback-defaults.ts` holds the five fallback options as
  `ROUTER_FALLBACK_DEFAULTS`. The `pins the fallback policy` case in
  `src/app/router/router-fallback-defaults.test.tsx` compares the object with `toEqual`, so adding,
  removing or retuning an option fails there first.
- `src/app/router/create-app-router.ts` holds the rest: `defaultPreload`,
  `ROUTER_PRELOAD_STALE_TIME_MILLISECONDS` and `scrollRestoration`. The
  `applies the routing policy the factory owns` case in `src/app/router/create-app-router.test.tsx`
  asserts each of them, the spread-in fallback policy (`toMatchObject(ROUTER_FALLBACK_DEFAULTS)`)
  and the root route's `errorComponent: false`.

Read the reasoning for the pending pair in [Authenticated route guard](./route-guard.md) and for
`defaultPreloadStaleTime` under [Design decisions](#design-decisions--trade-offs) first.
`CreateAppRouterOptions` deliberately has no policy field: a per-caller override would let tests run
a policy production does not.

### Give one route a different pending screen

Declare `pendingComponent` on that route; a route option always beats the router default, for that
route's own match. The guard is the worked example — `src/app/routes/_authenticated.tsx` names
`ResolvingSessionPage`, so any navigation into the guarded subtree shows the session-check screen
while the layout route's own `beforeLoad` runs. It does not extend to the children: once the guard
has resolved, a child still loading is a pending match of its own, and a child that declares no
`pendingComponent` shows `RoutePendingPage` like every other route in the tree.

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ResolvingSessionPage } from '@/pages/resolving-session';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    if ((await context.sessionResolver.resolve()) !== 'authenticated') {
      redirect({ to: '/sign-in', throw: true });
    }
  },
  pendingComponent: ResolvingSessionPage,
});
```

The error screen has no matching escape hatch: `ROUTE_FALLBACK_RESTRICTIONS` rejects any
`errorComponent` but `false`, and [The route-file fences](#the-route-file-fences) above lists the
three things a route file can express instead.

### Add a member to the router context

Add one only for an app-wide port that code outside React needs — a `loader` or a `beforeLoad` — and
that must be swappable in a test. A module singleton such as `appConfig` is imported directly, and a
dependency only one subtree needs is returned from that subtree's parent `beforeLoad`, which the
router merges into the context its children receive.

1. Add the member to `AppRouterContext` in `src/app/router/app-router-context.ts`, as `readonly` and
   required.
2. Publish the concrete from `AppProviders` through a provider, if it is not published already, then
   read it in `AppRouterProvider` with that provider's hook and add it to the `context` object.
3. Run `npm run typecheck`. It lists every `createAppRouter({ context })` call that lacks the
   member: today `create-app-router.test.tsx`, `sign-in.test.tsx`, `_authenticated.test.tsx` and
   `users.$userId.test.tsx`. `app-router-provider.test.tsx` needs the new provider in its harness.

Every route inherits the root context, so a member is a dependency of every route, used or not.

### Let a lower layer name a router type

A `shared/ui` link wrapper that needs a router type, such as `LinkProps`, cannot import it today:
the fence rejects `import type` too. Widen the existing `@tanstack/react-router` entry of
`LOWER_LAYER_IMPORT_PATHS` in `eslint.config.js` with `allowTypeImports: true` rather than adding a
name to `allowImportNames`, so route-state values stay banned:

```diff
   {
     name: '@tanstack/react-router',
     allowImportNames: ['Link'],
+    allowTypeImports: true,
     message:
       'Route state stays in src/app/routes. Below app, take props and callbacks; only <Link> is importable here.',
   },
```

The entry is shared by every block below `app`, so this admits type-only imports in all five layers,
not only in `shared/ui`.

### Regenerate the route tree

`npx vite build` regenerates `src/app/router/route-tree.gen.ts`, and so does `npm run dev`, at
start-up and on every change under `src/app/routes`. `npm run build` and `npm run audit` cannot
repair a stale tree, because both run `tsc -b` first and it aborts on the missing route; `npm test`
never regenerates it. Commit the regenerated file with the route change that caused it, and never
edit it: the next generation rewrites any content that differs from what the plugin would write.

### Deploy behind a static host

The host must answer every path that is not a real file with `/index.html` — nginx
`try_files $uri /index.html;`, a Netlify `_redirects` rule `/* /index.html 200`, an S3 or CloudFront
error document, a `404.html` copy of `index.html` on GitHub Pages. Vite's dev server and
`vite preview` do this on their own, which is why forgetting it is invisible until production, where
every deep link and every reload off `/` then gets the host's 404 instead of the app. The production
container already does it, and its `Container image` CI job opens a deep link to prove it
([Production container](./deployment.md)); keep a missing file under `/assets/` a real `404`, so a
tab running an older build fails its chunk request and reloads rather than parsing `index.html` as
JavaScript.

## Design decisions & trade-offs

- **TanStack Router, because the route tree is a type.** The commit that chose it (`97bbc7a`)
  records it as the only React router that made `<Link to="/typo">` a compile error rather than a
  runtime 404: React Router typed `Link`'s `to` as `string | Partial<Path>`, which made path safety
  opt-in per call site, and Wouter, at about 1.5 kB, has no typed params, loaders or router context,
  so every guard and prefetch would have been hand-written. It also belongs to the ecosystem
  TanStack Query and its ESLint plugin had already brought in. The price is weight: in a production
  build of the working tree at `8df68fb`, the router's runtime — `@tanstack/router-core`,
  `@tanstack/react-router` and `@tanstack/history` — is about 69.7 kB of the 391.99 kB entry chunk,
  roughly 24 kB gzipped on its own. (The attribution needs a source map, and
  `vite build --sourcemap` reports 392.03 kB for the same entry chunk, the extra 0.04 kB being the
  appended `sourceMappingURL` comment.) Typed links, typed params, a typed router context, per-route
  code-splitting and per-match error and pending
  boundaries are what that buys.
- **Route state stops at `app`; below it, `Link` is the whole router API.** The fence is an
  allow-list — `allowImportNames: ['Link']` — because a ban list fails open: it would have to name
  `getRouteApi`, which hands a caller `useParams`, `useSearch`, `useLoaderData`, `useRouteContext`
  and `useNavigate` through one import, and it would silently admit whatever a future minor version
  exports. Two patterns close the side doors: `^@tanstack/react-router/` (deep imports) and
  `^@tanstack/(react-)?router-core`, since npm hoists `@tanstack/router-core` where any module can
  import it. The fence covers test files too, so `home-page.test.tsx`,
  `route-pending-page.test.tsx` and `resolving-session-page.test.tsx` render their pages with no
  router at all — the executable proof that a page below `app` reads no route state. Pages and
  features become substitutable as a result: `features/sign-in` takes `onSignedIn` and would work
  unchanged in a modal or under another router. The cost is two exceptions, `NotFoundPage` and
  `RouteErrorPage`, whose `Link` needs a router in any test.
  [Architecture boundaries](./architecture-boundaries.md) covers how this fence composes with the
  repo's others.
- **Two segments, split by axis of change.** `app/routes` changes when a URL or its screen changes;
  `app/router` changes when construction, policy or a fallback does. The generated tree lives in
  `app/router` rather than a top-level `src/routes`, which would sit outside the layer system — like
  `src/main.tsx` — where steiger cannot analyse it.
- **The fallback policy is one `as const` object, not five lines in the factory.**
  `ROUTER_FALLBACK_DEFAULTS` collects the pending timings, the pending and error components and
  `disableGlobalCatchBoundary` in `router-fallback-defaults.ts`, and `createAppRouter` spreads it
  in. Splitting it out is what lets `router-fallback-defaults.test.tsx` build a small, purpose-made
  route tree and drive the whole policy against it — a failing loader, a crashing component, a
  suspended query, a nested not-found — without the real routes, their guard and their HTTP stubs
  in the way. The factory keeps the two preload options and `scrollRestoration`, which have nothing
  to do with fallbacks. The cost is one more file and one more import to follow.
- **A route failure is contained, not global.** Setting `defaultErrorComponent` router-wide gives
  every non-root match its own boundary, so the innermost one catches and the screen a visitor keeps
  is the app shell with one slot replaced: the `AppHeader` banner and any layout route above the
  failure stay mounted, and the locale switcher still works. The alternative — one boundary around
  the whole `RouterProvider` — is what the app already has for crashes the router cannot contain,
  and it takes the whole page down. `create-app-router.test.tsx` pins the containment: when the
  guard's `beforeLoad` rejects, the banner still reads `frontend-boilerplate` and there is exactly
  one `main` on the page. The boundary machinery itself — when TanStack mounts a `CatchBoundary`,
  how a `loader` rejection converges on the same screen as a render crash — belongs to
  [Error handling and reporting](./error-handling.md).
- **`RouteErrorPage` never receives the error.** Its props are `{ readonly onRetry: () => void }`,
  so a thrown message cannot reach the DOM even by accident. TanStack's built-in `ErrorComponent`
  does the opposite: it renders a "Show Error" toggle over `error.message` in every environment, one
  click from a visitor in production. `router-fallback-defaults.test.tsx` throws an error whose
  message embeds a fake token and asserts `expect(document.body).not.toHaveTextContent('leaked')`.
  The cost is that the screen says the same thing for every failure; the diagnosis is expected to
  come from reporting, not from the page.
- **The retry re-runs the route rather than resetting the boundary.** Resetting a boundary clears
  only the boundary's own state, so a failed `loader` would never run again and a transient network
  failure would stay failed. Routing's button therefore re-runs the match — a scoped,
  forced-pending, synchronous `router.invalidate()`, described under [The retry](#the-retry) — and
  `RouteErrorFallback` narrows its props so TanStack's `reset` is not even in scope. Why `reset` is
  refused rather than combined with the reload, and how the mount-time query-error reset keeps a
  failed `useSuspenseQuery` from re-throwing its cached error on the retry, are argued in
  [Error handling and reporting](./error-handling.md).
- **A render-time not-found is passed through, not caught.** `notFound()` travels as a thrown value,
  so with an error boundary on every match it would otherwise be caught as an ordinary failure and a
  mistyped deep link would show "This page could not be displayed" instead of "Page not found". The
  routing outcome is that not-found handling stays exactly where the tree puts it: at the root
  route's `notFoundComponent`, whatever depth raised it. Four test cases cover it — a not-found
  thrown while rendering, one thrown from a nested route, and ones thrown from a `loader` and a
  `beforeLoad` — each asserting that neither the route-catch handler nor the app boundary ever
  fires. The re-throw that makes it work is
  [Error handling and reporting](./error-handling.md)'s to explain.
- **The root route opts out, so a shell crash is still a crash.** `errorComponent: false` is not the
  same as leaving the option unset: TanStack reads
  `route.options.errorComponent ?? defaultErrorComponent`, so `false` means "no boundary here" while
  `undefined` would inherit the default. If the root
  caught its own failures, a broken `RootLayout` would render `RouteErrorPage` inside a router that
  may itself be the problem, and the app's `ErrorBoundary` — the one place that reports
  `{ source: 'render' }` — would never see it. Opting out sends `RootLayout` crashes to
  `AppCrashFallback`, which is the correct owner of "the app cannot render at all", and it sends a
  crash of the error screen there too whenever no non-root ancestor route is left to catch it: a
  crash of the fallback climbs to the nearest ancestor route that still has a boundary, and with
  `/`, `/sign-in` and `_authenticated` all direct children of the root, every top-level route
  escalates on the first hop. The root keeps `notFoundComponent`, so the not-found path is
  untouched.
- **`disableGlobalCatchBoundary: true` removes the last unstyled surface.** TanStack wraps the whole
  match tree in a `CatchBoundary` of its own. With the root opted out, that panel would have become
  the new catch-all for the three things nothing else handles — a `RootLayout` crash, a crash of the
  error screen that no ancestor route boundary is left to catch, and a render-time
  `notFound({ routeId })` that no ancestor accepts — and each would have rendered its untranslated
  "Something went wrong!" box with the header gone and no report filed. Turning it off routes all
  three to the app's root `ErrorBoundary` instead. `router-fallback-defaults.test.tsx` proves two of
  them — a crashing error screen and a crashing root layout — leave the router for that
  `ErrorBoundary`, which the suite renders with a stand-in fallback, and are reported there exactly
  once.
- **The pending screen has no heading, by exception.** Every other page renders exactly one `<main>`
  and one `<h1>`; `RoutePendingPage` renders a `<main>` around an `<output>` and nothing else. A
  heading on a screen that any route may flash through would make every unnamed
  `findByRole('heading', { level: 1 })` in the suite race against it — the hazard
  [Unit and component testing](./unit-testing.md) documents for the guard's
  `ResolvingSessionPage`, which is why tests of guarded routes must name the heading they wait for.
  The `status` role still announces the wait to a screen reader, and
  `route-pending-page.test.tsx` pins the absent heading so the exception cannot be undone by
  accident.
- **Two lint fences keep the policy from leaking back into route files.** Route options are data,
  and a future route could quietly reintroduce an unstyled error surface with one line.
  `ROUTE_FALLBACK_RESTRICTIONS` rejects every `errorComponent` but the literal `false`, and —
  because a syntax rule can only see what is written in the file — also rejects spreading options
  into the
  route literal or passing them as a prebuilt object. `PAGE_LANDMARK_RESTRICTIONS` puts `<main>`,
  `<h1>` and their ARIA equivalents out of reach of route files, widgets, features and entities, so
  the "one `<main>`, one `<h1>` per screen" rule is enforced rather than remembered. Both are plain
  `no-restricted-syntax` selectors in `eslint.config.js`, so `npm run lint` is the only gate that
  sees them — `npm run typecheck` and the test suite would both pass a route file that reopened the
  policy ([The route-file fences](#the-route-file-fences)). The cost is that a legitimately
  different error screen for one subtree is not expressible without editing the fence.
- **The route tree is generated, committed, and kept away from the formatting and coverage gates.**
  It is committed rather than gitignored because `npm run typecheck` runs `tsc -b` with no Vite in
  the process: an ignored tree fails the first typecheck on a fresh clone and in CI. It is listed in
  ESLint's `ignores` instead of relying on the `/* eslint-disable */` header the generator writes,
  which is also why the `pre-commit` lint job in `lefthook.yml` passes `--no-warn-ignored`: without
  it, staging the tree makes ESLint warn "File ignored because of a matching ignore pattern", and
  `--max-warnings 0` turns that into a rejected commit. It is in `.prettierignore` because the
  generator formats with Prettier at its default 80 columns while the repo formats at 100, so
  `format:check` would fail every regenerated tree, and a `prettier --write` would be undone by the
  next generation. Coverage skips it through `coverage.exclude` in `vite.config.ts` and
  `GENERATED_ROUTE_TREE` in `scripts/verify-coverage-scope.mjs`. `quoteStyle: 'single'` and
  `semicolons: true` make what the generator writes match the house quotes and semicolons, and
  `.tanstack/` — the generator's scratch directory, `.tanstack/tmp` by default — is gitignored.
- **Vitest runs without the router plugin.** In Vite's serve pipeline, which Vitest uses, the plugin
  injects hot-module-replacement code into every route module. Under Vitest `import.meta.hot` is
  undefined, so that code never runs and counts as uncovered statements against the 90% per-file
  coverage threshold; the commit that introduced the router measured a three-statement `__root.tsx`
  falling to 66%. `mode === 'test' ? [] : [routerPlugin]` avoids it. The cost is that the unit suite
  never exercises the generator or the code-splitting transform — it runs against the committed tree
  — and only `npm run build` and the end-to-end suite see the plugin's output.
- **The router context carries only app-wide ports, all of them required.** `AppRouterContext` holds
  what a `loader` or `beforeLoad` needs injected because it varies by environment or must be
  swappable in a test. `createRootRouteWithContext<AppRouterContext>()` makes `context` a required
  option of `createRouter`, and `CreateAppRouterOptions` requires it too, so no router — and no
  loader — can be built without it. `sessionResolver` is required rather than optional because a
  guard whose resolver may be absent fails open; the price is that `/` and `/sign-in` carry a member
  they never call, and every router test supplies a stub. The guard-side reasoning is in
  [Authenticated route guard](./route-guard.md).
- **`AppRouterProvider` bridges React context into the router.** It reads the ports out of providers
  `AppProviders` already installs, so `AppProviders` knows nothing about routing, and transport
  wiring and routing wiring stay separately replaceable. The router lives in a lazy `useState`
  initializer so it is built once per mount — `app-router-provider.test.tsx` asserts one
  `createAppRouter` call across a re-render. Because an initializer captures its arguments once, the
  context is also passed as `RouterProvider`'s `context` prop, which TanStack merges into the
  router's options on every render; without it the router would hand loaders whichever instances
  existed at first render, forever.
- **`defaultPreloadStaleTime: 0` leaves caching to TanStack Query.** TanStack Router keeps a
  preloaded match fresh for 30 s by default, a second cache of loader results beside Query's. The
  two would disagree: a loader that returned data would be served from the router's copy after Query
  had invalidated the same data. At `0` the router caches no preload, the click runs the loader
  again, and the query's own `staleTime` decides whether a request goes out. The constant carries no
  rationale on its own, so `create-app-router.test.tsx` asserts it; deleting the line would
  otherwise pass every gate and quietly restore the shadow cache.
  [HTTP transport](./http-transport.md) covers that `staleTime` policy.
- **`defaultPreload: 'intent'` spends hover work to make clicks faster.** A hovered, focused or
  touched `<Link>` fetches its target's chunk and runs its `beforeLoad` and `loader`, so the route's
  first request can start before the click. The cost is that a hover runs the guard and the loader
  of a route the visitor may never open — while the refresh endpoint is degraded, each such preload
  into the guarded subtree retries it, as [Authenticated route guard](./route-guard.md) describes.
- **Scroll restoration is on.** With `scrollRestoration: true` the router takes over the browser's
  own restoration (`history.scrollRestoration = 'manual'`) and returns a visitor to where they were
  on Back and Forward; a new navigation still starts at the top. The router calls the global
  `scrollTo` after every navigation, which jsdom does not implement, so `vitest.setup.ts` stubs it
  with `vi.stubGlobal('scrollTo', vi.fn())`.
- **Not-found belongs to the root route, and the root route is never split.** Only `__root.tsx`
  declares a `notFoundComponent`, so under TanStack's default `notFoundMode` every unknown URL
  renders `NotFoundPage` in `RootLayout`'s `<Outlet />`, under the same `AppHeader` banner as every
  matched route and with no per-subtree variants to keep consistent. The router plugin treats
  `createRootRouteWithContext` as unsplittable, so `RootLayout`, `AppHeader` and `NotFoundPage` ship
  in the entry chunk and a mistyped URL renders without fetching another chunk.
  Unlike `pages/home`, which is a worked example to replace, `pages/not-found`, `pages/route-error`
  and `pages/route-pending` are permanent slices.
- **`autoCodeSplitting` splits route components, and the fallbacks must stay eager.** The plugin's
  default groupings split `component`, `errorComponent` and `notFoundComponent` only, so every
  `loader`, `beforeLoad` and `pendingComponent` stays in its route module, which the tree imports
  eagerly — the work that runs _before_ a screen is never behind a second round trip.
  `RouteErrorPage` and `RoutePendingPage` get no chunk either: the router imports both eagerly
  through `ROUTER_FALLBACK_DEFAULTS`, so they land in the entry chunk. That is what a fallback
  needs. A pending screen that had to fetch a chunk could not appear while another chunk was still
  loading, and an error screen that had to fetch one could not render when the network is the reason
  the route failed. The cost lands on the first paint instead: `dist/index.html` modulepreloads the
  two shared chunks the entry imports statically (`button-*.js` and `session-*.js`) but no route
  chunk, so the landing route always spends one extra round trip on its own chunk, and intent
  preloading, which covers later `<Link>` navigations, cannot help the first one.

  A production build of the working tree at `8df68fb` (633 modules) emits one chunk per routed
  component beside the entry chunk, and one stylesheet for the whole app — components carry Tailwind
  utilities, so no route chunk emits CSS:

  | Chunk                | Contents                     | Raw       | gzip      |
  | -------------------- | ---------------------------- | --------- | --------- |
  | entry                | app shell, router, fallbacks | 391.99 kB | 126.41 kB |
  | `routes-*.js`        | `/`                          | 12.01 kB  | 5.09 kB   |
  | `sign-in-*.js`       | `/sign-in`                   | 2.57 kB   | 1.14 kB   |
  | `users._userId-*.js` | `/users/$userId`             | 12.58 kB  | 4.49 kB   |

- **A route chunk that will not load reloads the page once.** The plugin wraps each split component
  in TanStack's `lazyRouteComponent`, which turns the most common cause — a redeploy that removed
  the chunk a running tab still asks for — into a recovery rather than a dead screen: it reloads the
  page once so the visitor picks up the new `index.html`, guarded by a `sessionStorage` flag keyed
  by the error message so a genuinely missing chunk cannot loop. If the failure repeats after that
  reload, the error is thrown to that match's error boundary and `RouteErrorPage` takes over. The
  same wrapper is why an already-fetched component stops counting as load work: it clears its own
  `preload` on success.
- **The devtools are rendered unconditionally.** `<TanStackRouterDevtools />` sits in `RootLayout`
  with no environment check, because the package's entry exports
  `process.env.NODE_ENV !== 'development' ? () => null : TanStackRouterDevtools`. The bundler folds
  that to the stub in a production build — `dist/` has no match for `router-devtools`, and the
  package contributes about 0.03 kB to the entry chunk — and Vitest, which runs with
  `NODE_ENV=test`, renders nothing either. No lazy import and no `import.meta.env.DEV` guard is
  needed. The package is in `dependencies` because application code imports it.
- **Route module names follow TanStack's file-name-is-the-URL rule, not the kebab-case table.** Six
  files under `src/app/routes` depart from the repo's file-naming convention on purpose:
  `__root.tsx` is the generator's name for the root route; `index.tsx` is the index route of its
  directory (`/`), not a barrel — the barrel rule in `eslint.config.js` targets `src/**/index.ts`
  only; `_authenticated.tsx` and the `_authenticated/` directory mark a _pathless layout route_,
  which wraps its children without adding a URL segment; `users.$userId.tsx` spells
  `/users/$userId`, with `.` separating segments and `$` marking a param; and
  `_authenticated.test.tsx` and `users.$userId.test.tsx` keep the names of the modules they test. A
  param name must be a valid JavaScript identifier — `@tanstack/router/route-param-names` rejects
  `$user-id` — which is why the param is camelCase. `sign-in.tsx` shows that a plain segment is
  kebab-case anyway. Every route module exports a `Route` object rather than a component named after
  the file, so `react-refresh/only-export-components`, which would flag every one of them, is off
  for `src/app/routes/**/*.tsx`. `@tanstack/router/create-route-property-order` enforces the order
  of a route's options (`beforeLoad` before `loader`, for example), because each option's types are
  inferred from the ones before it; it is a warning, which `--max-warnings 0` makes blocking.
- **The root layout owns the banner; pages own everything under it.** `RootLayout` contributes one
  landmark of its own — `AppHeader`'s `<header>`, the implicit `banner`
  ([App shell](./app-shell.md)) — so a rendered route is that banner plus the page's markup, and
  each page renders exactly one `<main>` and one `<h1>`, with `RoutePendingPage` as the single named
  exception (one `<main>`, no `<h1>`). The banner names the application in a `<span>`, not a
  heading, so it never competes with the page's `<h1>`: `home-page.test.tsx` queries
  `heading, { level: 1 }` with no name and would throw on a second `<h1>`; a second `<main>` is a
  landmark ambiguity no gate catches, which is why `create-app-router.test.tsx` asserts
  `getAllByRole('main')` has length 1 on the failed-route screen. Putting the banner in the root
  route rather than in each page is what keeps that rule affordable — a page that rendered its own
  header would own two landmarks and repeat the markup on every screen.

## Testing

Unit and component tests sit beside the code they cover; the browser suite lives in `e2e/`.

- `src/app/router/router-fallback-defaults.test.tsx` — 19 cases driving the whole fallback policy
  against a purpose-built route tree (a slow section layout, a failing loader, a crashing component,
  a suspended query, routes that throw `notFound()` from a render, a `loader` and a `beforeLoad`),
  wrapped in the app's `ErrorBoundary` and a `QueryClientProvider`, with `defaultOnCatch` and the
  boundary's `onError` recorded as spies. It pins `ROUTER_FALLBACK_DEFAULTS` with `toEqual`; asserts
  the error screen's heading, description, focus, home link and that the thrown message never
  reaches the DOM; asserts the pending screen on a slow navigation, on a retry that has load work,
  and its absence on a retry that has none; counts `defaultOnCatch` calls after a retry click in
  four `it` declarations covering five route paths — `/loaded`, `/broken`, `/crashing` and an
  `it.each` over the two paths nested under a layout route that must stay visible,
  `/section/broken` and `/section/loaded` — each expecting exactly two, the original failure and the
  retried one, with a fifth case expecting one where the retry succeeds; proves a failed
  `useSuspenseQuery` refetches; proves four not-found paths reach the root not-found screen with no
  catch and no app crash; and proves a crashing error screen and a crashing root layout both leave
  the router for the app's `ErrorBoundary`, which this file renders with a stand-in fallback, and
  are reported there exactly once.
- `src/app/router/create-app-router.test.tsx` — the real router built by `createAppRouter` with a
  memory history and stub ports: `/` renders the `frontend-boilerplate` heading; `/does-not-exist`
  renders "Page not found"; clicking "Back to home" navigates to the home page. Two cases drive a
  `SessionResolver` double that rejects — the only way to make a production route fail today — and
  assert that the route error screen renders under a live `banner` with exactly one `main`, and that
  its "Back to home" link works. The injected `httpClient`, `queryClient` and `sessionResolver` land
  on `router.options.context`; the policy case asserts `ROUTER_FALLBACK_DEFAULTS`, `'intent'`, `0`,
  `true` and the root's `errorComponent: false`. Its last case is a type test: a `@ts-expect-error`
  on `<Link to="/definitely-not-a-route">`. Vitest does not type-check, so this case can only fail
  in `npm run typecheck` (and `npm run build`), where error `TS2578` reports the directive as unused
  the moment the `Register` augmentation stops typing links.
- `src/app/router/app-router-provider.test.tsx` — inside `QueryClientProvider`, `HttpClientProvider`
  and `SessionResolverProvider`, `AppRouterProvider` calls `createAppRouter` once across a
  re-render.
- `src/pages/route-pending/ui/route-pending-page.test.tsx` — one case, no router: the `status`
  region sits inside the `main` landmark, reads "Loading…", and no heading exists.
- `src/pages/resolving-session/ui/resolving-session-page.test.tsx` — one case, no router: the
  guard's pending screen renders a level-1 heading reading "Checking your session…". The slice
  belongs to [Authenticated route guard](./route-guard.md); it is listed here because the test is
  part of the proof that a page below `app` needs no router.
- `src/app/entrypoint/app.test.tsx` — the whole `App`, providers and router included, renders the
  home page beneath a `banner` carrying the configured application name, and switches the language
  from that banner's locale switcher.
- `src/main.test.ts` — the mount test wraps the import in `act()` and its assertion in `waitFor`,
  because the router resolves the first match asynchronously.
- `src/pages/home/ui/home-page.test.tsx` — deliberately stands up no router. `pages/not-found` and
  `pages/route-error` have no co-located test: each renders a `Link` that needs a `RouterProvider`,
  which the fence keeps out of test files below `app`, and such a test would re-test the router.
  `create-app-router.test.tsx` and `router-fallback-defaults.test.tsx` cover both;
  `e2e/app-shell.spec.ts` adds a browser pass over `NotFoundPage` only. `pages/route-error` has no
  browser coverage at all — no spec in `e2e/` renders `RouteErrorPage`.
- The route modules of other documents are tested the same way, through `createAppRouter` and a
  memory history: `src/app/routes/sign-in.test.tsx` ([Sign-in](./sign-in.md)),
  `src/app/routes/_authenticated.test.tsx` ([Authenticated route guard](./route-guard.md)) and
  `src/app/routes/_authenticated/users.$userId.test.tsx`
  ([User profile (read path)](./user-profile.md)).
- `e2e/app-shell.spec.ts` — Playwright against the production build served by `vite preview`: it
  opens `/no-such-page`, sees "Page not found", clicks "Back to home", lands on `/` and asserts the
  app-shell `banner` is visible there. It runs the tree and the chunks exactly as the router plugin
  emits them, which no Vitest test does, and it depends on the preview server answering an unknown
  path with `index.html`; the seven specs in `e2e/user-profile.spec.ts` do the same for the guarded
  route. See [End-to-end testing](./e2e-testing.md).

```bash
npm test
npx vitest run src/app/router/router-fallback-defaults.test.tsx
npx vitest run src/app/router/create-app-router.test.tsx
npx vitest run src/app/router/app-router-provider.test.tsx
npx vitest run src/pages/route-pending/ui/route-pending-page.test.tsx
npm run typecheck
npm run test:e2e
npx playwright test e2e/app-shell.spec.ts
```

## Known limitations

- **Route errors are contained but not reported.** No production module in `src` sets
  `defaultOnCatch`; the single occurrence is the counter `router-fallback-defaults.test.tsx` injects
  to count catches. A failure inside a route therefore reaches the `ErrorReporter` through no path
  at all, and surfaces only as React's own caught-error log plus TanStack's development-mode
  `Warning: Error in route match: <id>`. A `RootLayout` crash _is_ reported, as
  `{ source: 'render' }`, because the root route opts out and it reaches the app `ErrorBoundary`. A
  crash of the error screen climbs to the nearest ancestor route that still has a boundary, and the
  root has none — so on `/`, `/sign-in` and `_authenticated`, all direct children of the root, it
  leaves the router on the first hop and is reported the same way. Only
  `/_authenticated/users/$userId` has a non-root ancestor, `_authenticated`, which declares no
  `errorComponent` and therefore inherits one: a fallback crash confined to that single match is
  caught by that parent route's boundary, renders `RouteErrorPage` again inside the shell, and is
  not reported. The gap is unwired rather than intended: closing it means setting
  `defaultOnCatch` on `createRouter`, and
  [the recipe](./error-handling.md#report-route-failures-through-the-port) is written out.
- **No route validates its search params.** `validateSearch` and `Route.useSearch()` appear nowhere
  in `src/app/routes/**` — nowhere in `src` at all — so the query string is outside the type system
  that covers paths and params. A `<Link search={…}>` is unconstrained: TanStack accepts whatever
  object it is given, nothing parses it back, and a screen that wanted to read a filter or a page
  number out of the URL would have to add `validateSearch` first.
- **No production path can raise a route error today, and no end-to-end spec covers the new
  screens.** `/` and `/sign-in` have no `loader` and no `beforeLoad`; the guard's `beforeLoad`
  awaits `SessionResolver.resolve()`, and `createSessionResolver` catches everything and returns
  `'unknown'`; the profile loader `void`s a `prefetchQuery`, which never rejects; and no component
  uses `useSuspenseQuery`. Making a route fail in a test therefore requires a `SessionResolver`
  double that breaks that contract, which is what `create-app-router.test.tsx` does. `e2e/` has ten
  specs and none of them reaches the pending or the error screen.
- **Navigation changes neither the document title nor focus.** Every URL keeps
  `<title>frontend-boilerplate</title>` from `index.html`: no route declares a `head` option and
  nothing renders TanStack's `HeadContent`. Nothing moves focus or announces the new screen after a
  successful client-side navigation either — the two `focus()` calls in `src` are
  `AppCrashFallback`'s and `RouteErrorPage`'s, both on a failure screen — so a screen-reader user is
  not told that a normal page changed.
- **An unknown URL is a soft 404.** The server answers it with `index.html` and status `200`; only
  the client renders "Page not found". `vite preview` answers even a missing `/assets/*.js` path
  with `200 text/html`.
- **`NotFoundPage` is unstyled.** Its `<main>`, heading, paragraph and link carry no Tailwind
  utilities, unlike `RouteErrorPage`, `RoutePendingPage` and every other page.
- **Intent preloading has two consumers.** The only `<Link>`s in `src` that ever render are
  `NotFoundPage`'s and `RouteErrorPage`'s links to `/`, both on a failure screen; the only other
  `<Link>` is the never-rendered `@ts-expect-error` fixture in `create-app-router.test.tsx` (see
  [Testing](#testing)). Every other navigation starts from a typed URL, the guard's redirect to
  `/sign-in` or the `navigate({ to: '/' })` that follows a sign-in, and none of those preloads.
- **The tree's path is written in five places.** `vite.config.ts` names
  `src/app/router/route-tree.gen.ts` twice (`generatedRouteTree` and `coverage.exclude`), and
  `eslint.config.js`, `.prettierignore` and `scripts/verify-coverage-scope.mjs` once each; nothing
  derives one from another, so moving or renaming the tree means editing all five.
- **A push can leave the tree modified.** The `pre-push` hook runs `npm run audit`, whose
  `npm run build` runs `vite build`, which regenerates the tracked tree; if the committed tree
  differed from the generator's output without failing `npm run typecheck` — a hand edit, say — the
  push succeeds and leaves `route-tree.gen.ts` modified in the working tree.
- **The unit suite never runs the router plugin.** Code-split chunk loading and the generator's
  output are exercised only by `npm run build` and the end-to-end suite, which reaches the public
  shell only through `e2e/app-shell.spec.ts`'s not-found scenario.
