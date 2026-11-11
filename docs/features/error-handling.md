# Error handling and reporting

> **Status:** Complete · **Layers:** app, pages, shared, outside layers · **Verified against:** `8df68fb`

## Purpose

Three failures need three different answers. A render-time throw that no error boundary catches
unmounts the whole React root and leaves the user on a blank page. A throw inside a route — a page
component, a `loader`, a `beforeLoad` guard — would otherwise land in TanStack Router's own built-in
panel: unstyled, untranslated, with no retry and with `error.message` one "Show Error" click away.
And a failure that never throws into render — a failed query or mutation — just sits in TanStack
Query's cache state, so nothing tells anyone off the device that production is broken. This feature
catches a start-up crash behind an accessible recovery screen, contains a route failure at the
failing route so the app shell survives and the visitor can retry, and sends every failure that is
_not_ contained at a route — escalated render crashes, plus query and mutation failures — through
one reporting port, `ErrorReporter`, whose concrete destination is chosen in a single
composition-root module. Replacing the console with a real error-tracking service is therefore one
new adapter and one changed line, with no layer below `app` touched.

## How it works

Two kinds of _error boundary_ — a React component that catches a throw from anywhere in its subtree
and renders a fallback in its place — sit in the rendered tree: the root `ErrorBoundary` in
`app.tsx`, and the per-match `CatchBoundary` TanStack Router mounts around every non-root route.
Which of the two catches a crash decides what the visitor sees and whether the crash is reported. A
failure is _contained_ when a boundary below the root catches it, so only part of the screen is
replaced, and _escalated_ when nothing below the root does, so the whole application is replaced; it
is _reported_ when it is handed to the reporting port and can therefore leave the browser.
Containment and reporting are independent — a contained route failure is _not_ reported today
([Known limitations](#known-limitations)). Two more words recur below: a _match_ is TanStack
Router's runtime object for one route of the currently matched chain, carrying that route's
`status`, `error` and loader data, and a _sink_ is the concrete destination reports are written to.

In the tree below, `RouterProvider`, `Matches`, `MatchesInner`, `Match`, `CatchBoundary`,
`CatchNotFound` and `Outlet` come from TanStack Router and `Suspense` is React's; every other node
is a module in this repository. `CatchNotFound` is the one catch-named node that is not a crash
boundary: it adopts a `notFound()`, never a throw. The diagram shows only the boundaries that decide
error containment, so three `Suspense` boundaries that exist at runtime are left out: `Matches`
around `MatchesInner`, the root `Outlet` around the next match, and `AppProviders`' own
`<Suspense fallback={null}>`.

```text
App                                  src/app/entrypoint/app.tsx
└─ ErrorBoundary                     root boundary: AppCrashFallback, onError = handleRenderError
   └─ AppProviders                   useState initializers: transport, query client, i18n, theme
      └─ AppRouterProvider           useState initializer: createAppRouter({ context })
         └─ RouterProvider → Matches → MatchesInner
            │                        disableGlobalCatchBoundary: true — no global CatchBoundary
            └─ Match (__root__)      errorComponent: false — no error boundary on the root
               └─ CatchNotFound      notFoundComponent: NotFoundPage
                  └─ RootLayout      the app shell: banner, then the outlet
                     ├─ AppHeader    widgets/app-header, hosting the locale switcher
                     └─ Outlet
                        └─ Match (every non-root route)
                           └─ Suspense    fallback: the route's pendingComponent,
                                          falling back to RoutePendingPage
                              └─ CatchBoundary   defaultErrorComponent: RouteErrorFallback
                                 └─ the route component: pages, forms, the guard layout
```

**Binding at start-up.** When `app.tsx` is evaluated it takes `reportError` — which
`app-error-reporter.ts` exports as `toSafeErrorReporter(createConsoleErrorReporter())` — and binds
it to two adapters: `handleRenderError = createRenderErrorHandler(reportError)` and
`queryErrorHandlers = createQueryErrorHandlers(reportError)`. `App` gives the first to the root
`ErrorBoundary` as `onError` and the second to `AppProviders`, whose `useState` initializer passes
it to `createQueryClient`.

**A query or mutation fails — the common path.** `createQueryClient` registers `onError` on the
client's `QueryCache` and `MutationCache`. When a query fetch has failed for good — after the retry
policy owned by [HTTP transport](./http-transport.md) gives up — the cache calls
`onQueryError(error, query.queryHash)`; the **query hash** is TanStack Query's stable JSON
serialisation of the query key, `["users","detail","<user id>"]` for a user profile. A failed
mutation calls `onMutationError(error, hashKey(mutation.options.mutationKey ?? []))`. The adapters
turn these into `{ source: 'query', error, queryHash }` and
`{ source: 'mutation', error, mutationHash }` reports, and the console sink prints
`error reported from query` (or `mutation`), the error and the hash. Reporting is a side channel and
changes nothing on screen: the query or mutation still settles into its error state and its owner
renders it — the profile page shows its `unavailable` state
([User profile (read path)](./user-profile.md)) and the name form its `failed` notice
([Update user name (write path)](./update-user-name.md)). Every failed fetch is
reported, including background refetches, the `prefetchQuery` started by the `users.$userId.tsx`
loader, and failures the UI expects, such as a `404` for a user that does not exist. No data failure
throws into render today: nothing outside the test suite uses `useSuspenseQuery` or `throwOnError`.

**A crash at start-up — the root boundary.** A throw while rendering `AppProviders` or
`AppRouterProvider` happens above the router, so the root `ErrorBoundary` catches it. That includes
their `useState` initializers: `createAuthenticatedTransport`, `createQueryClient`, `createI18n`,
`createThemeController`, `createDocumentThemeApplier`, and `createAppRouter`, which builds the route
tree eagerly and throws
`Invariant failed` on a duplicate route id. The `react-error-boundary` primitive replaces the whole
tree with `AppCrashFallback` and calls `onError`, so `handleRenderError` reports
`{ source: 'render', error, componentStack }` with React's component stack (`''` when React supplies
none) and the console sink prints `error reported from render`. `AppCrashFallback` moves focus to
its `Something went wrong` heading, explains
`The application could not start. Trying again may fix it.` and offers a `Try again` button wired
to `resetErrorBoundary`. A reset renders the boundary's children from scratch: `AppProviders` and
`AppRouterProvider` remount, and every client and the router are constructed again, so a transient
failure recovers and a deterministic one returns to the crash screen.

**A crash inside a route — the per-match boundary.** `createAppRouter` spreads
`ROUTER_FALLBACK_DEFAULTS` into `createRouter`, which sets
`defaultErrorComponent: RouteErrorFallback` and `disableGlobalCatchBoundary: true`. TanStack mounts
a `CatchBoundary` around a match only when
`route.options.errorComponent ?? router.options.defaultErrorComponent` resolves, so with a
router-wide default every match gets one — except the root, whose `src/app/routes/__root.tsx` sets
`errorComponent: false` and so resolves to nothing. The innermost boundary wins, which means a
failing page is replaced inside `RootLayout`'s `<Outlet />`: `AppHeader`
([App shell](./app-shell.md)) and any parent layout route stay on screen, and only the failed
subtree becomes the error screen. A `loader` or `beforeLoad` rejection reaches the same boundary by
a different path — the router marks the match errored during loading, and TanStack's `MatchInner`
re-throws `match.error` when it renders that match — so a data failure and a render crash converge
on one screen.

The router's `defaultErrorComponent` is `RouteErrorFallback`
(`src/app/router/route-error-fallback.tsx`); the screen it renders is `RouteErrorPage` from
`@/pages/route-error`: a `<main>` with an `<h1>` that takes focus on mount, the
`routeError.description` paragraph, a `Try again` button and a `Back to home` link. The page takes
only `onRetry`, never the error, so it cannot render a thrown message. Its copy comes from the
`routeError.*` keys of the `common` namespace, which is bundled eagerly for both locales
([Internationalization](./internationalization.md)), so the screen is translated even when the
failure was a lazy chunk that never arrived.

**The retry.** `RouteErrorFallback` delegates to a private `RouteErrorRecovery` component that
composes two private hooks. `useRetryFailedRoute` reads the failed match's id with
`useMatch({ strict: false, shouldThrow: false, select: (match) => match.id })` — the error component
renders inside that match's context — and returns a handler that calls `router.invalidate` with all
three of `filter`, `forcePending: true` and `sync: true`. The `filter`,
`(match) => match.id === failedMatchId`, narrows the invalidation to the failed match, so the layout
routes above it stay mounted and visible instead of being put back into `pending` and hidden under
`display: none` for the reload. `forcePending` is what covers a render crash: a match
whose `loader` rejected already carries `status: 'error'` and `invalidate` resets it either way, but
a match whose loader succeeded and whose component then threw is still `status: 'success'`, and only
`forcePending` clears that one's error and puts it back into `pending`. A route with load work then
re-runs its `loader` and `beforeLoad` behind the pending screen it inherits before the component is
tried again; on a route with nothing to load — no `loader`, no `beforeLoad`, no lazy part — its
status is never reset, because `routeNeedsLoad` gates only the `status: 'pending'` /
`error: undefined` half of the reset while `invalidate` still replaces the committed match object
with `{ ...match, invalid: true }` and so still resets the boundary. Such a route therefore
re-renders in place, and a deterministic crash returns to the error screen with no pending flash in
between. `sync` runs the reload in the current task rather than a deferred microtask, and forces
stale ancestor reloads to be blocking rather than background; it alone is what holds one click to
exactly one new catch, while `filter` and `forcePending` buy the other two properties — see
[Design decisions](#design-decisions--trade-offs) for the mechanism and what dropping each costs.
`useResetQueryErrorsOnMount` calls `useQueryErrorResetBoundary().reset()` in a mount effect, so a
`useSuspenseQuery` that threw its cached error fetches again on the retry instead of re-throwing
immediately. `reset`, the second prop TanStack passes an error component, is deliberately ignored —
see [Design decisions](#design-decisions--trade-offs).

**A not-found passes straight through.** `notFound()` produces an ordinary thrown object that
TanStack recognises by its `isNotFound` flag, and a not-found thrown while rendering travels the
same route as a crash: it hits the match's `CatchBoundary`. `RouteErrorFallback` therefore checks
`isNotFound(error)` first and re-throws with `notFound({ ...error, throw: true })` during its own
render. Timing is what makes this work. React renders the fallback before it calls the boundary's
`componentDidCatch`, and TanStack's `componentDidCatch` is where a not-found gets stamped with
`error.routeId ??= match.routeId`; the fresh copy the fallback throws therefore carries no
`routeId`, climbs past every ancestor route, and is adopted by the nearest `notFoundComponent` —
today the root's `NotFoundPage` ([Routing](./routing.md)). A not-found thrown from a `loader` or
`beforeLoad` never involves an error boundary at all: the router marks that match `notFound` and
renders the not-found screen directly.

**When there is no route boundary left — escalation.** Three kinds of failure still reach the root
`ErrorBoundary`, and each is reported as `{ source: 'render' }`. A crash in `RootLayout` is the
first: the root route opts out with `errorComponent: false`, and with the global `CatchBoundary`
disabled nothing inside the router catches it, so it leaves `RouterProvider` entirely.

A crash of the error screen itself is the second. The boundary that would catch it is the one
already rendering it, so the throw goes to the **nearest ancestor route that still has a
boundary** — and the root route has none, because `__root__` sets `errorComponent: false` and
`Match` resolves `ResolvedCatchBoundary = routeErrorComponent ? CatchBoundary : SafeFragment`.
A route that is a direct child of `__root__` therefore has no ancestor route boundary at all, and
a crash confined to one of its matches escapes `RouterProvider` on the first hop. Three of today's
four non-root routes
are such children — `/` (`src/app/routes/index.tsx`), `/sign-in` and `/_authenticated` — so even a
match-specific `RouteErrorFallback` crash on one of them lands on the root `ErrorBoundary` and _is_
reported. The exception is `/_authenticated/users/$userId`: `src/app/routes/_authenticated.tsx`
declares no `errorComponent` and so inherits one, and a crash confined to the `users/$userId` match
is caught by the `_authenticated` match's boundary, which renders `RouteErrorPage` again inside the
shell and reports nothing. Determinism only decides what happens from below such a layout route:
because every non-root route shares the same fallback, a crash that repeats in each ancestor's copy
of it keeps climbing past that layout route, while one confined to a single match stops there.
`router-fallback-defaults.test.tsx` reproduces the escalation with a `defaultErrorComponent`
stand-in that always throws, at `/loaded` — a direct child of that tree's root route, so it escapes
on the first hop rather than by climbing.

A render-time not-found that no ancestor `notFoundComponent` accepts is the third. In each case
`AppCrashFallback` replaces the whole application and `handleRenderError` reports the failure.

**What a contained route failure leaves behind.** A catch at a per-match boundary is _not_ reported:
no production module sets `defaultOnCatch`, and TanStack calls `onCatch` / `defaultOnCatch` only
from a per-match boundary, so `reportError` never runs for it. Two traces reach the console instead.
React's default caught-error handler logs the error, because `src/main.tsx` passes no
`onCaughtError` to `createRoot`. What that default prints depends on the build: React 19's
production build is a bare `console.error(error)`, while its development build wraps the same error
in a formatted message —
`console.error('%o\n\n%s\n\n%s\n', error, componentNameMessage, recreateMessage)` — naming the
component that threw and the boundary that caught it. Outside production TanStack adds
`console.warn('Warning: Error in route match: <match id>')` on top. Wiring the port to this path is
a deliberate next step, sketched in
[Report route failures through the port](#report-route-failures-through-the-port) and recorded under
[Known limitations](#known-limitations).

**The sink itself fails.** `toSafeErrorReporter` calls the sink inside `try`/`catch`. If the sink
throws, the guard logs `the error reporter failed` with the sink's error and `report.source`, then
returns normally, so a broken sink can neither turn a caught crash into an unmounted tree nor
replace a query's real error with its own. The next report goes to the sink again.

**The outcomes, side by side.** Containment and reporting are decided independently: only the render
failures that reach the root `ErrorBoundary`, plus the two data channels, are reported — and a crash
of the crash screen escapes even that.

| Failure                                                               | Caught by                                                                           | What the user sees                                                    | Reported as    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------- |
| A provider or router constructor throws at start-up                   | the root `ErrorBoundary` in `app.tsx`                                               | `AppCrashFallback` replaces the whole application                     | `render`       |
| A non-root route component throws while rendering                     | that match's `CatchBoundary`                                                        | `RouteErrorPage` inside the shell; the banner and parent layouts stay | _not reported_ |
| A `loader` or `beforeLoad` rejects                                    | the same match's `CatchBoundary`, after `MatchInner` re-throws its error            | `RouteErrorPage` inside the shell                                     | _not reported_ |
| `RootLayout` throws                                                   | the root `ErrorBoundary` — the root route sets `errorComponent: false`              | `AppCrashFallback` replaces the whole application                     | `render`       |
| The error screen throws for one match below a non-root layout route   | that layout route's `CatchBoundary` — today only `_authenticated`'s                 | `RouteErrorPage` again, inside the shell                              | _not reported_ |
| The error screen throws for one match on a direct child of `__root__` | the root `ErrorBoundary` — no ancestor route has a boundary to stop at              | `AppCrashFallback` replaces the whole application                     | `render`       |
| The error screen throws wherever it renders                           | the root `ErrorBoundary`, after climbing past every ancestor that still has one     | `AppCrashFallback` replaces the whole application                     | `render`       |
| A query fetch fails for good                                          | nothing — no throw reaches render                                                   | the owner's own error state, e.g. the profile's `unavailable`         | `query`        |
| A mutation fails                                                      | nothing — no throw reaches render                                                   | the owner's own error state, e.g. the name form's `failed` notice     | `mutation`     |
| A render-time `notFound()` an ancestor adopts                         | that match's `CatchBoundary`, then re-thrown from `RouteErrorFallback`'s own render | `NotFoundPage` inside the shell                                       | _not reported_ |
| A `notFound()` from a `loader` or `beforeLoad`                        | nothing — no boundary is involved; the router marks the match `notFound`            | `NotFoundPage` inside the shell                                       | _not reported_ |
| A render-time `notFound()` no ancestor `notFoundComponent` adopts     | the root `ErrorBoundary`                                                            | `AppCrashFallback` replaces the whole application                     | `render`       |
| `AppCrashFallback` itself throws                                      | nothing — no boundary sits above the root one                                       | a blank page: the React root unmounts                                 | _not reported_ |

## Architecture

Feature-Sliced Design (FSD) splits `src/` into _layers_ — `app`, `pages`, `widgets`, `features`,
`entities`, `shared`, top to bottom — and a module imports only from the layers below its own
([Architecture boundaries](./architecture-boundaries.md)). `pages` holds _slices_, one screen each
(`pages/route-error`), divided into purpose-named _segments_ (`ui`); `app` and `shared` have
segments but no slices (`app/entrypoint`, `app/router`, `app/routes`, `shared/observability`), and
`shared/ui` and `shared/lib` divide further into _groups_, one folder per primitive or helper
(`shared/ui/error-boundary`). Every slice, segment and group is reached from outside only through
its `index.ts` barrel, its _public API_.

This feature has two _ports_ — the repo's word, used interchangeably with _seam_, for a type
consumers program against while the implementation is chosen elsewhere. `ErrorReporter`, in
`shared/observability`, is the reporting port: a plain function type over the `ErrorReport` union
that every producer calls and every sink implements. `ErrorBoundary`, in `shared/ui/error-boundary`,
is the boundary seam: the only module that imports `react-error-boundary`, with its own
`ErrorFallbackProps` and `RenderErrorHandler` types so that no vendor type crosses it. Concretes
meet the seams only in the _composition root_ — `src/app/entrypoint`, the only code that constructs
concretes ([Composition root](./composition-root.md)): `app-error-reporter.ts` is the one module
that names a sink, and `app.tsx` binds `AppCrashFallback` plus the two adapters that turn each
producer's callback into an `ErrorReport`. The producers never learn about the port — the boundary
calls a `RenderErrorHandler`, and `createQueryClient` calls two plain `(error, hash) => void`
callbacks — so
neither `shared/ui` nor `shared/api` imports `shared/observability`, and `shared/observability`
imports nothing outside itself. The route fallbacks follow the same direction: `app/router` owns the
policy and the adapter that knows about TanStack (`RouteErrorFallback`), while the screen it shows
is an ordinary `pages` slice that takes a callback and knows nothing about routing. Every import
points down, from `app` into `pages` and `shared`.

ESLint holds the fences (see [Architecture boundaries](./architecture-boundaries.md)):
`ERROR_BOUNDARY_VENDOR_IMPORT_PATHS` bans `react-error-boundary` everywhere in `src` except the
non-test files of `src/shared/ui/error-boundary`; the five layers below `app`, plus `app/routes` and
`app/router`, may import `@/shared/observability` for types only and never past its barrel; and
`ROUTE_FALLBACK_RESTRICTIONS` keeps a route module from naming its own error component — `false`,
the opt-out that escalates to the parent, is the only value it allows. That `console` is called only
inside `shared/observability` (the console sink and `toSafeErrorReporter`) and
`shared/notifications` (`toSafeNotifier`) is a convention nothing lints; check it with
`grep -rn "console\." src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`.

| Component                                        | Layer                        | Responsibility                                                                                                                                             | File                                                 |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `App`                                            | `app/entrypoint`             | Wraps the tree in the root `ErrorBoundary`; binds `reportError` to `handleRenderError` and `queryErrorHandlers`                                            | `src/app/entrypoint/app.tsx`                         |
| `reportError`                                    | `app/entrypoint`             | The one binding of a concrete sink: `toSafeErrorReporter(createConsoleErrorReporter())`                                                                    | `src/app/entrypoint/app-error-reporter.ts`           |
| `AppCrashFallback`                               | `app/entrypoint`             | Whole-application crash screen: focuses its heading, shows hard-coded English copy, retries through `resetErrorBoundary`                                   | `src/app/entrypoint/app-crash-fallback.tsx`          |
| `createRenderErrorHandler`                       | `app/entrypoint`             | Adapts the boundary's `(error, info)` callback into a `render` report                                                                                      | `src/app/entrypoint/create-render-error-handler.ts`  |
| `createQueryErrorHandlers`, `QueryErrorHandlers` | `app/entrypoint`             | Adapts the query client's two failure callbacks into `query` and `mutation` reports                                                                        | `src/app/entrypoint/create-query-error-handlers.ts`  |
| `AppProviders`                                   | `app/entrypoint`             | Passes `queryErrorHandlers` to `createQueryClient` inside its `useState` initializer                                                                       | `src/app/entrypoint/app-providers.tsx`               |
| `AppRouterProvider`                              | `app/router`                 | Builds the router inside the root boundary and renders `RouterProvider`                                                                                    | `src/app/router/app-router-provider.tsx`             |
| `createAppRouter`                                | `app/router`                 | Spreads `ROUTER_FALLBACK_DEFAULTS` into `createRouter`; sets no `defaultOnCatch`                                                                           | `src/app/router/create-app-router.ts`                |
| `ROUTER_FALLBACK_DEFAULTS`                       | `app/router`                 | The whole fallback policy in one `as const` literal: pending timings and component, `defaultErrorComponent`, `disableGlobalCatchBoundary`                  | `src/app/router/router-fallback-defaults.ts`         |
| `RouteErrorFallback`                             | `app/router`                 | The router's `defaultErrorComponent`: passes a render-time not-found on, then renders `RouteErrorPage`                                                     | `src/app/router/route-error-fallback.tsx`            |
| `Route` (root)                                   | `app/routes`                 | Root route: `component: RootLayout`, `errorComponent: false` (escalate to the root boundary), `notFoundComponent: NotFoundPage`                            | `src/app/routes/__root.tsx`                          |
| `RouteErrorPage`                                 | `pages/route-error · ui`     | The translated, recoverable error screen: focused `<h1>`, `Try again`, `Back to home`; takes `onRetry`, never the error                                    | `src/pages/route-error/ui/route-error-page.tsx`      |
| `RoutePendingPage`                               | `pages/route-pending · ui`   | The transient screen a forced-pending retry shows while the route loads again ([Routing](./routing.md) owns the timings)                                   | `src/pages/route-pending/ui/route-pending-page.tsx`  |
| `ErrorBoundary`                                  | `shared/ui · error-boundary` | Wraps the vendor boundary; forwards only `FallbackComponent` and `onError`, which defaults to a no-op                                                      | `src/shared/ui/error-boundary/error-boundary.tsx`    |
| `ErrorReport`, `ErrorReporter`                   | `shared/observability`       | The reporting port: a three-arm union and the function type that consumes it                                                                               | `src/shared/observability/error-reporter.ts`         |
| `createConsoleErrorReporter`                     | `shared/observability`       | The shipped sink: one `console.error` call per report                                                                                                      | `src/shared/observability/console-error-reporter.ts` |
| `toSafeErrorReporter`                            | `shared/observability`       | Decorator that keeps a throwing sink from escaping into React or TanStack Query                                                                            | `src/shared/observability/to-safe-error-reporter.ts` |
| `createQueryClient`                              | `shared/api`                 | Registers `QueryCache` and `MutationCache` `onError` and forwards to `onQueryError` / `onMutationError`                                                    | `src/shared/api/query-client.ts`                     |
| `HttpError`                                      | `shared/api`                 | The error most query and mutation reports carry; keeps the original failure as `cause`                                                                     | `src/shared/api/http-error.ts`                       |
| `createRoot`                                     | `outside layers`             | Mounts `<App />`, passing neither `onCaughtError` nor `onUncaughtError` — which is why a caught route failure reaches only React's default console handler | `src/main.tsx`                                       |
| `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS`             | `outside layers`             | Lint fence: `react-error-boundary` importable only inside `shared/ui/error-boundary`                                                                       | `eslint.config.js`                                   |
| `ROUTE_FALLBACK_RESTRICTIONS`                    | `outside layers`             | Lint fence: a route module may set `errorComponent` to nothing but `false`, and may not hide its options behind a spread                                   | `eslint.config.js`                                   |

## Public surface

This feature serves no route of its own. `AppCrashFallback` replaces the whole tree and has no URL;
`RouteErrorPage` renders at whichever URL failed, inside the app shell. The contract is two `shared`
seams, one `pages` slice, the router-wide fallback policy, the failure callbacks of one `shared/api`
factory, and the composition-root bindings.

### `@/shared/observability`

The reporting port. Value imports are banned below `app` and in `app/routes` / `app/router`, which
leaves `app/entrypoint`; `import type` works everywhere.

```ts
export type ErrorReport =
  | { readonly source: 'render'; readonly error: unknown; readonly componentStack: string }
  | { readonly source: 'query'; readonly error: unknown; readonly queryHash: string }
  | { readonly source: 'mutation'; readonly error: unknown; readonly mutationHash: string };

export type ErrorReporter = (report: ErrorReport) => void;
```

| Export                       | Signature                                       | Behaviour                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorReport`                | the union above                                 | One arm per producer; every field except `error` is a `string`                                                                                                |
| `ErrorReporter`              | `(report: ErrorReport) => void`                 | The port a sink implements and a producer calls                                                                                                               |
| `createConsoleErrorReporter` | `() => ErrorReporter`                           | Calls `console.error('error reported from <source>', error, context)`, where `context` is the arm's `componentStack`, `queryHash` or `mutationHash`           |
| `toSafeErrorReporter`        | `(reportError: ErrorReporter) => ErrorReporter` | Forwards every report; when the wrapped sink throws, calls `console.error('the error reporter failed', reporterFailure, report.source)` instead of rethrowing |

### `@/shared/ui/error-boundary`

The only way to build an error boundary.

| Export               | Signature                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorBoundary`      | Component taking `ErrorBoundaryProps`; forwards `FallbackComponent` and `onError` (default `() => undefined`) to the vendor boundary                  |
| `ErrorBoundaryProps` | `{ readonly FallbackComponent: ComponentType<ErrorFallbackProps>; readonly onError?: RenderErrorHandler \| undefined; readonly children: ReactNode }` |
| `ErrorFallbackProps` | `{ readonly error: unknown; readonly resetErrorBoundary: () => void }`                                                                                |
| `RenderErrorHandler` | `(error: unknown, info: ErrorInfo) => void`, where `ErrorInfo` is React's                                                                             |

### `@/pages/route-error`

| Export           | Signature                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `RouteErrorPage` | Component taking `{ readonly onRetry: () => void }`; renders one `<main>` and one focused `<h1>` |

The props type itself is intentionally not exported: the slice's `index.ts` re-exports the component
alone, so a caller cannot widen the page with an `error` prop it never declared.

### `@/pages/route-pending`

| Export             | Signature                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `RoutePendingPage` | Component taking no props; renders one `<main>` around one `<output>`, and deliberately no heading at all |

### The router-wide fallback policy

`app` has segments rather than slices, so `app/router` modules import each other relatively and
nothing outside `src/app` may reach them (`@/app` exports only `App`).

| Module                        | Export                     | Shape                                                                                                                                                          |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router-fallback-defaults.ts` | `ROUTER_FALLBACK_DEFAULTS` | `as const` literal: `defaultPendingMs`, `defaultPendingMinMs`, `defaultPendingComponent`, `defaultErrorComponent`, `disableGlobalCatchBoundary`                |
| `route-error-fallback.tsx`    | `RouteErrorFallback`       | Component taking `Readonly<Pick<ErrorComponentProps, 'error'>>`, assignable to TanStack's `ErrorRouteComponent` slot                                           |
| `create-app-router.ts`        | `createAppRouter`          | `(options: CreateAppRouterOptions) => AppRouter`, where `CreateAppRouterOptions` is `{ readonly context: AppRouterContext; readonly history?: RouterHistory }` |

### Translation keys

`RouteErrorPage` reads four keys from the `common` namespace, bundled eagerly for `en` and `ru`
(`src/shared/i18n/locales/<locale>/common.json`):

| Key                      | English                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `routeError.title`       | `This page could not be displayed`                                                   |
| `routeError.description` | `An unexpected error interrupted this page. Try again, or go back to the home page.` |
| `routeError.retry`       | `Try again`                                                                          |
| `routeError.backToHome`  | `Back to home`                                                                       |

### `createQueryClient` failure callbacks

`createQueryClient(options?: CreateQueryClientOptions): QueryClient` from `@/shared/api`; the rest
of the factory belongs to [HTTP transport](./http-transport.md). `CreateQueryClientOptions` is
declared in `src/shared/api/query-client.ts` but not exported from the barrel, so a caller passes an
object literal or a structurally matching object such as `QueryErrorHandlers`. ESLint lets only
`app/entrypoint` import `createQueryClient`.

| Option            | Type                                                            | Called with                                                 |
| ----------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `onQueryError`    | `((error: unknown, queryHash: string) => void) \| undefined`    | The error and `query.queryHash`, once per failed fetch      |
| `onMutationError` | `((error: unknown, mutationHash: string) => void) \| undefined` | The error and `hashKey(mutation.options.mutationKey ?? [])` |

### Composition-root bindings

Modules in `src/app/entrypoint`, imported relatively within the segment; `@/app` exports only `App`.

| Binding                    | Signature                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportError`              | `ErrorReporter`, bound to `toSafeErrorReporter(createConsoleErrorReporter())`                                                                      |
| `createRenderErrorHandler` | `(reportError: ErrorReporter) => RenderErrorHandler`                                                                                               |
| `createQueryErrorHandlers` | `(reportError: ErrorReporter) => QueryErrorHandlers`                                                                                               |
| `QueryErrorHandlers`       | `{ readonly onQueryError: (error: unknown, queryHash: string) => void; readonly onMutationError: (error: unknown, mutationHash: string) => void }` |
| `AppCrashFallback`         | Component taking `Pick<ErrorFallbackProps, 'resetErrorBoundary'>`                                                                                  |
| `AppProviders`             | Component whose `queryErrorHandlers: QueryErrorHandlers` prop becomes the options of `createQueryClient`                                           |

## Configuration

No `VITE_*` variable reaches this feature: the sink is fixed in code, and `app-error-reporter.ts`
binds the same console sink in development, test and production builds. What can be configured are
the options and props the composition root passes, plus the router options that decide who catches
a route crash:

| Variable / option                                           | Default                                                                   | Meaning                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `reportError` (`src/app/entrypoint/app-error-reporter.ts`)  | `toSafeErrorReporter(createConsoleErrorReporter())`                       | The sink every report reaches; the line to change when swapping sinks                                                         |
| `FallbackComponent` (`ErrorBoundaryProps`)                  | None — required; `app.tsx` passes `AppCrashFallback`                      | Component rendered in place of the crashed subtree                                                                            |
| `onError` (`ErrorBoundaryProps`)                            | `() => undefined`; `app.tsx` passes `handleRenderError`                   | Called once per caught render crash with the error and React's `ErrorInfo`                                                    |
| `queryErrorHandlers` (`AppProviders` prop)                  | None — required; `app.tsx` passes `createQueryErrorHandlers(reportError)` | Handed to `createQueryClient` as its options object                                                                           |
| `onQueryError` (`createQueryClient` option)                 | `() => undefined`                                                         | Receives each failed query's error and query hash                                                                             |
| `onMutationError` (`createQueryClient` option)              | `() => undefined`                                                         | Receives each failed mutation's error and mutation hash                                                                       |
| `defaultErrorComponent` (router option)                     | `RouteErrorFallback`, from `ROUTER_FALLBACK_DEFAULTS`                     | The error component every route inherits, and the reason every non-root match has a boundary at all                           |
| `disableGlobalCatchBoundary` (router option)                | `true`, from `ROUTER_FALLBACK_DEFAULTS`                                   | Removes TanStack's global catch-all panel, so anything no route boundary catches escalates to the root `ErrorBoundary`        |
| `defaultOnCatch` (router option)                            | Unset — the only occurrence in `src` is the counter a test injects        | Would be called once per per-match catch; leaving it unset is why contained route failures are not reported                   |
| `errorComponent` (route option)                             | Unset, except `false` on `src/app/routes/__root.tsx`                      | A per-route override; `ROUTE_FALLBACK_RESTRICTIONS` allows nothing but `false`, which opts the route out of having a boundary |
| `onCatch` (route option)                                    | Unset on every route                                                      | A per-route catch callback; overrides `defaultOnCatch` for that route                                                         |
| `onCaughtError` (`createRoot` option)                       | Unset — `src/main.tsx` passes neither                                     | React's hook for an error a boundary caught; unset, so React's own default handler logs it to the console                     |
| `onUncaughtError` (`createRoot` option)                     | Unset — `src/main.tsx` passes neither                                     | React's hook for an error no boundary caught; unset, so React's own default handler logs it to the console                    |
| `notFoundComponent` (route option)                          | Unset, except `NotFoundPage` on `src/app/routes/__root.tsx`               | Where a render-time not-found that `RouteErrorFallback` passed on is adopted; the root's is the only one today                |
| `defaultPendingComponent` (router option)                   | `RoutePendingPage`, from `ROUTER_FALLBACK_DEFAULTS`                       | What a forced-pending retry shows while the route loads again, unless the route declares its own                              |
| `defaultPendingMs` / `defaultPendingMinMs` (router options) | `300` / `300`, from `ROUTER_FALLBACK_DEFAULTS`                            | Pending-screen delay and minimum hold; [Authenticated route guard](./route-guard.md) owns the reasoning                       |

## Usage & extension

### Swap the console for a real sink

The shipped sink never leaves the browser, so replace it before production depends on error
reports. The adapter lives in `src/app/entrypoint/`, next to the other concretes, so nothing in
`shared`, `entities`, `features` or `pages` changes and the ESLint fences hold without edits. The
example posts each report with `navigator.sendBeacon` to a collector endpoint you operate, which
needs no dependency; an adapter for a vendor SDK has the same shape, with the SDK's capture call in
place of the beacon.

1. Add the adapter, `src/app/entrypoint/create-beacon-error-reporter.ts`. It implements
   `ErrorReporter` and scrubs the error before it leaves the browser: it keeps the name, message and
   stack plus, for an `HttpError` ([HTTP transport](./http-transport.md#the-failure-model)), `kind`
   and `status`, and drops `cause`, `payload` and `issues`
   (see [Known limitations](#known-limitations) for what those carry). A thrown non-`Error` value
   is described by its type only.

   ```ts
   import { isHttpError } from '@/shared/api';
   import type { HttpErrorKind } from '@/shared/api';
   import type { ErrorReport, ErrorReporter } from '@/shared/observability';

   interface ScrubbedError {
     readonly name: string;
     readonly message: string;
     readonly stack: string | null;
     readonly httpKind: HttpErrorKind | null;
     readonly httpStatus: number | null;
   }

   function scrubError(error: unknown): ScrubbedError {
     if (!(error instanceof Error)) {
       return {
         name: 'NonError',
         message: `a ${typeof error} was thrown`,
         stack: null,
         httpKind: null,
         httpStatus: null,
       };
     }

     const httpError = isHttpError(error) ? error : null;

     return {
       name: error.name,
       message: error.message,
       stack: error.stack ?? null,
       httpKind: httpError?.kind ?? null,
       httpStatus: httpError?.status ?? null,
     };
   }

   function describeReport(report: ErrorReport): string {
     switch (report.source) {
       case 'render':
         return report.componentStack;
       case 'query':
         return report.queryHash;
       case 'mutation':
         return report.mutationHash;
     }
   }

   export function createBeaconErrorReporter(endpoint: string): ErrorReporter {
     return (report) => {
       const event = {
         source: report.source,
         context: describeReport(report),
         error: scrubError(report.error),
       };
       const body = new Blob([JSON.stringify(event)], { type: 'application/json' });

       navigator.sendBeacon(endpoint, body);
     };
   }
   ```

2. Change the binding in `src/app/entrypoint/app-error-reporter.ts`, keeping `toSafeErrorReporter`
   around whichever sink you choose. `ERROR_COLLECTOR_URL` names your own collector; nothing in this
   repository or its end-to-end stubs serves it.

   ```ts
   import { toSafeErrorReporter } from '@/shared/observability';

   import { createBeaconErrorReporter } from './create-beacon-error-reporter';

   const ERROR_COLLECTOR_URL = '/v1/client-errors';

   export const reportError = toSafeErrorReporter(createBeaconErrorReporter(ERROR_COLLECTOR_URL));
   ```

3. Test the adapter beside it, in `src/app/entrypoint/create-beacon-error-reporter.test.ts`;
   `npm run test:coverage` enforces 90 % per-file coverage, and these three cases reach 100 %. jsdom
   implements no `navigator.sendBeacon`, so the test stubs it. Its `afterEach` needs no
   `scrollTo` / `matchMedia` re-stub, unlike step 4's, because no case in this file mounts `App`:

   ```ts
   import { afterEach, describe, expect, it, vi } from 'vitest';

   import { HttpError } from '@/shared/api';
   import type { ErrorReport } from '@/shared/observability';

   import { createBeaconErrorReporter } from './create-beacon-error-reporter';

   const LEAKY_HTTP_ERROR = new HttpError(
     'Request failed with status code 500',
     {
       kind: 'server',
       status: 500,
       method: 'GET',
       url: '/users/0198f0a2-7b1c-7d3e-8f00-123456789abc',
       payload: 'upstream-detail',
       issues: [],
     },
     { config: { headers: { Authorization: 'Bearer secret-token' } } },
   );

   async function sendThroughBeacon(report: ErrorReport): Promise<string> {
     const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
     vi.stubGlobal('navigator', { sendBeacon });

     createBeaconErrorReporter('/collector')(report);

     const [url, body] = sendBeacon.mock.calls[0] ?? [];
     expect(url).toBe('/collector');

     return (await body?.text()) ?? '';
   }

   describe('createBeaconErrorReporter', () => {
     afterEach(() => {
       vi.unstubAllGlobals();
     });

     it('keeps the kind and status of an HttpError but drops its cause and payload', async () => {
       const sent = await sendThroughBeacon({
         source: 'query',
         error: LEAKY_HTTP_ERROR,
         queryHash: '[]',
       });

       expect(sent).toContain('"httpStatus":500');
       expect(sent).not.toContain('secret-token');
       expect(sent).not.toContain('upstream-detail');
     });

     it('sends an error that did not come from the transport without HTTP fields', async () => {
       const error = new Error('mapper failed');
       delete error.stack;

       const sent = await sendThroughBeacon({ source: 'mutation', error, mutationHash: '[]' });

       expect(sent).toContain('"message":"mapper failed","stack":null,"httpKind":null');
     });

     it('describes a thrown non-error by its type only', async () => {
       const sent = await sendThroughBeacon({
         source: 'render',
         error: 'raw-secret',
         componentStack: '',
       });

       expect(sent).toContain('a string was thrown');
       expect(sent).not.toContain('raw-secret');
     });
   });
   ```

4. Repair the wiring case the swap breaks. `src/app/entrypoint/app.test.tsx` today asserts the
   console line `error reported from render` that the beacon sink never prints. Swapping the
   assertion is not enough; the file needs four separate edits.

   1. **Stub `navigator.sendBeacon` inside the case**, the way step 3 does. jsdom implements none,
      so without the stub the sink throws on every report, `toSafeErrorReporter` swallows the throw
      as `the error reporter failed`, and although the fallback still renders, no beacon call is
      ever recorded to assert on.
   2. **Keep the `console.error` spy, drop its assertion.** It no longer proves anything; it only
      silences React's own log of the caught error.
   3. **Add `vi.unstubAllGlobals()` to the existing `afterEach`**, so the `navigator` stub does not
      outlive the case.
   4. **Re-stub `scrollTo` and `matchMedia` in that same `afterEach`.** `vi.unstubAllGlobals()`
      also removes the two module-scope stubs `vitest.setup.ts` installs, and a module-scope stub is
      never reinstalled between cases, so every case that runs afterwards loses them. The shared
      `afterEach` first fires after the first case, so three of the four cases that mount the real
      `App` would run without them. Without `matchMedia`, jsdom 30 leaves `window.matchMedia`
      undefined and `AppProviders` throws inside `createSystemThemeSource()`; without `scrollTo`, a
      navigating case prints jsdom's not-implemented error
      ([Unit and component testing](./unit-testing.md#known-limitations)).

   The rewritten hook:

   ```tsx
   afterEach(() => {
     vi.doUnmock('./app-providers');
     vi.resetModules();
     vi.restoreAllMocks();
     vi.unstubAllGlobals();
     vi.stubGlobal('scrollTo', vi.fn());
     vi.stubGlobal('matchMedia', (query: string) => ({
       matches: false,
       media: query,
       onchange: null,
       addEventListener: vi.fn(),
       removeEventListener: vi.fn(),
       dispatchEvent: vi.fn(),
     }));
   });
   ```

   And the rewritten case:

   ```tsx
   it('catches a provider construction failure instead of unmounting the tree', async () => {
     vi.spyOn(console, 'error').mockImplementation(() => undefined);
     const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
     vi.stubGlobal('navigator', { sendBeacon });
     vi.doMock('./app-providers', () => ({
       AppProviders: () => {
         throw new Error('provider construction failed');
       },
     }));
     vi.resetModules();

     const { App: AppWithFailingProviders } = await import('./app');
     render(<AppWithFailingProviders />);

     expect(
       screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
     ).toBeInTheDocument();

     const [url, body] = sendBeacon.mock.calls[0] ?? [];
     expect(url).toBe('/v1/client-errors');
     await expect(body?.text()).resolves.toContain('"source":"render"');
   });
   ```

   The rendering cases above it keep their bodies: `vi.stubGlobal` replaces `navigator` only inside
   this case, and none of them reaches the reporter.

To keep console output as well — useful in development — call both sinks from one `ErrorReporter`
and wrap each in `toSafeErrorReporter`, so one failing sink cannot silence the other. One thing the
swap does not change: the query channel still reports expected failures such as a `404`, so filter
them in the sink by the `httpKind` and `httpStatus` it keeps rather than at the producers.

### Report route failures through the port

Today a contained route failure never reaches `reportError`. A route-level `onCatch` would cover one
route while the gap is router-wide, so the lever is `createRouter`'s `defaultOnCatch`: closing the
gap means threading a handler from the composition root to it. TanStack declares its signature as
`(error: unknown, errorInfo: React.ErrorInfo) => void` — structurally identical to the seam's own
`RenderErrorHandler`, so `handleRenderError` fits without an adapter. Three files change.

1. `src/app/router/create-app-router.ts` — accept the handler and keep it out of the spread that
   reaches `createRouter`. The module's tail matters: dropping the `Register` augmentation would
   untype every `Link to`, stop the `@ts-expect-error` case in `create-app-router.test.tsx` from
   erroring, and fail `npm run typecheck`.

   ```ts
   import { createRouter } from '@tanstack/react-router';
   import type { RouterHistory } from '@tanstack/react-router';

   import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

   import type { AppRouterContext } from './app-router-context';
   import { routeTree } from './route-tree.gen';
   import { ROUTER_FALLBACK_DEFAULTS } from './router-fallback-defaults';

   const ROUTER_PRELOAD_STALE_TIME_MILLISECONDS = 0;

   export interface CreateAppRouterOptions {
     readonly context: AppRouterContext;
     readonly onRenderError: RenderErrorHandler;
     readonly history?: RouterHistory;
   }

   export function createAppRouter({ onRenderError, ...routerOptions }: CreateAppRouterOptions) {
     return createRouter({
       routeTree,
       defaultPreload: 'intent',
       defaultPreloadStaleTime: ROUTER_PRELOAD_STALE_TIME_MILLISECONDS,
       ...ROUTER_FALLBACK_DEFAULTS,
       defaultOnCatch: onRenderError,
       scrollRestoration: true,
       ...routerOptions,
     });
   }

   export type AppRouter = ReturnType<typeof createAppRouter>;

   declare module '@tanstack/react-router' {
     interface Register {
       router: AppRouter;
     }
   }
   ```

2. `src/app/router/app-router-provider.tsx` — take the handler as a prop and pass it on. The one new
   import is `RenderErrorHandler`; `import-x/order` puts it last in the `@/…` group:

   ```tsx
   import { useQueryClient } from '@tanstack/react-query';
   import { RouterProvider } from '@tanstack/react-router';
   import { useState } from 'react';

   import { useSessionResolver } from '@/entities/session';
   import { useHttpClient } from '@/shared/api';
   import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

   import type { AppRouterContext } from './app-router-context';
   import { createAppRouter } from './create-app-router';

   interface AppRouterProviderProps {
     readonly onRenderError: RenderErrorHandler;
   }

   export function AppRouterProvider({ onRenderError }: AppRouterProviderProps) {
     const httpClient = useHttpClient();
     const queryClient = useQueryClient();
     const sessionResolver = useSessionResolver();
     const context: AppRouterContext = { httpClient, queryClient, sessionResolver };
     const [router] = useState(() => createAppRouter({ context, onRenderError }));

     return <RouterProvider router={router} context={context} />;
   }
   ```

3. `src/app/entrypoint/app.tsx` — bind it:
   `<AppRouterProvider onRenderError={handleRenderError} />`.

Making the option required rather than optional keeps `exactOptionalPropertyTypes` out of the way
and forces every construction site to be explicit. Five `createAppRouter` calls across four test
files then have to pass their own spy or `() => undefined`: `createRouterAt` in
`src/app/router/create-app-router.test.tsx` (that file's only caller — `renderRouterAt` delegates to
it), and the routers built in `src/app/routes/sign-in.test.tsx`,
`src/app/routes/_authenticated.test.tsx` and `src/app/routes/_authenticated/users.$userId.test.tsx`,
which builds two. `src/app/router/app-router-provider.test.tsx` renders `<AppRouterProvider />` and
needs the new prop as well. `src/app/router/router-fallback-defaults.test.tsx` is untouched: it
never calls `createAppRouter`, it builds its own `createRouter` and already injects a
`defaultOnCatch` counter. Reusing `handleRenderError` files route catches under the existing
`render` arm; to tell them apart in the sink, give them an arm of their own first — see
[Report a new kind of failure](#report-a-new-kind-of-failure) — and adapt `defaultOnCatch` to it the
way `createRenderErrorHandler` adapts the boundary's callback.

### Change what a route failure looks like

- **Everywhere at once:** edit `ROUTER_FALLBACK_DEFAULTS`. It is the single source of the policy,
  and `create-app-router.test.tsx` pins the router against it with `toMatchObject`, so a change
  there is a change everywhere.
- **For one route:** you cannot give a route module its own `errorComponent`.
  `ROUTE_FALLBACK_RESTRICTIONS` rejects every value but `false`, because a bespoke error component
  would silently lose the not-found pass-through and the scoped retry. Vary the screen inside
  `RouteErrorPage` instead, or contain the part that fails with its own `ErrorBoundary` (below).
- **To let a parent catch instead:** set `errorComponent: false` on the child route module. Its
  failures then bubble to the nearest ancestor route that still has a boundary — and, on the root
  route, out of the router entirely into `AppCrashFallback`. That is exactly what
  `src/app/routes/__root.tsx` does.
- Route modules must spell their options out: the same fence rejects
  `createFileRoute('/x')({ ...options })` and `createFileRoute('/x')(options)`, so the
  `errorComponent` rule cannot be sidestepped by hiding the object.

### Contain a subtree with its own boundary

This recipe is independent of
[Report route failures through the port](#report-route-failures-through-the-port): that one threads
`handleRenderError` into the router's `defaultOnCatch`, while this one threads the same handler into
`AppRouterContext` so a component below `app` can give it to a boundary of its own. Because both
name the prop `onRenderError`, they compose: apply both and `AppRouterProvider` takes the prop once,
puts it in the context and forwards it to the router in the same call —
`const [router] = useState(() => createAppRouter({ context, onRenderError }));`.

The rules first:

- Import `ErrorBoundary` from `@/shared/ui/error-boundary`; `react-error-boundary` itself is
  lint-banned outside that group.
- Pass a `FallbackComponent`. It renders as a component of its own, so it may use hooks; the seam
  deliberately offers no `fallbackRender`.
- Declare only the props the fallback needs: `Pick<ErrorFallbackProps, 'resetErrorBoundary'>`
  turns rendering the thrown message into a compile error.
- A boundary nested inside a route catches before that route's `CatchBoundary`, so it is the way to
  keep one block's failure from replacing the whole screen with `RouteErrorPage`. Its `onError`
  cannot be a sink constructed below `app`: ESLint bans value imports of `@/shared/observability`
  there, and `AppRouterContext` carries no reporter today. The handler has to be handed down as a
  `RenderErrorHandler` from the composition root.

A worked example: contain the locale switcher inside the app-shell banner
([App shell](./app-shell.md)). `AppHeader` is mounted by `__root.tsx`, and the root route has no
boundary, so a throw from `LocaleSwitcher` today replaces the whole application with
`AppCrashFallback`. A boundary around it keeps the banner and the routed screen alive instead.

1. The fallback, `src/widgets/app-header/ui/locale-switcher-fallback.tsx`. It declares only
   `resetErrorBoundary`, so the thrown message is never in scope, and it reuses the shared
   `routeError.retry` label rather than inventing copy. `Button` comes from the design system
   ([Design system](./design-system.md)); a widget may not render `<main>`, an `<h1>` or an explicit
   `main` / `heading` role, which `PAGE_LANDMARK_RESTRICTIONS` reserves for pages.

   ```tsx
   import { useTranslation } from '@/shared/i18n';
   import { Button } from '@/shared/ui/button';
   import type { ErrorFallbackProps } from '@/shared/ui/error-boundary';

   export function LocaleSwitcherFallback({
     resetErrorBoundary,
   }: Pick<ErrorFallbackProps, 'resetErrorBoundary'>) {
     const { t } = useTranslation();

     return (
       <Button variant="outline" onClick={resetErrorBoundary}>
         {t('routeError.retry')}
       </Button>
     );
   }
   ```

2. The mount site, `src/widgets/app-header/ui/app-header.tsx`. It takes the handler as a prop rather
   than constructing one:

   ```tsx
   import { LocaleSwitcher } from '@/features/switch-locale';
   import { ErrorBoundary } from '@/shared/ui/error-boundary';
   import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

   import { LocaleSwitcherFallback } from './locale-switcher-fallback';

   interface AppHeaderProps {
     readonly appName: string;
     readonly onLocaleSwitcherError: RenderErrorHandler;
   }

   export function AppHeader({ appName, onLocaleSwitcherError }: AppHeaderProps) {
     return (
       <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
         <span className="text-sm font-semibold tracking-tight">{appName}</span>
         <ErrorBoundary FallbackComponent={LocaleSwitcherFallback} onError={onLocaleSwitcherError}>
           <LocaleSwitcher />
         </ErrorBoundary>
       </header>
     );
   }
   ```

3. The chain that reaches it. Nothing below `app` may construct a handler, and route components take
   no props from `app.tsx`, so the router context is the channel — the same one the transport and
   the session resolver already travel. Widen `src/app/router/app-router-context.ts`:

   ```ts
   import type { QueryClient } from '@tanstack/react-query';

   import type { SessionResolver } from '@/entities/session';
   import type { HttpClient } from '@/shared/api';
   import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

   export interface AppRouterContext {
     readonly httpClient: HttpClient;
     readonly queryClient: QueryClient;
     readonly sessionResolver: SessionResolver;
     readonly onRenderError: RenderErrorHandler;
   }
   ```

   Widening the context and adding two required props ripples into six test files, and
   `npm run typecheck` — and therefore `npm run audit` and CI — stays red until all six are fixed.
   Four build an `AppRouterContext` literal and have to add the field:
   `src/app/router/create-app-router.test.tsx` (line 44),
   `src/app/routes/sign-in.test.tsx` (line 30), `src/app/routes/_authenticated.test.tsx` (line 48)
   and `src/app/routes/_authenticated/users.$userId.test.tsx`, which builds two (lines 50 and 77).
   `src/app/router/app-router-provider.test.tsx` renders `<AppRouterProvider />` and has to pass the
   new `onRenderError` prop. `src/widgets/app-header/ui/app-header.test.tsx` makes two
   `render(<AppHeader appName="frontend-boilerplate" />)` calls, both of which now need
   `onLocaleSwitcherError`. Fill the context in `src/app/router/app-router-provider.tsx`, which
   takes the handler as a prop:

   ```tsx
   import { useQueryClient } from '@tanstack/react-query';
   import { RouterProvider } from '@tanstack/react-router';
   import { useState } from 'react';

   import { useSessionResolver } from '@/entities/session';
   import { useHttpClient } from '@/shared/api';
   import type { RenderErrorHandler } from '@/shared/ui/error-boundary';

   import type { AppRouterContext } from './app-router-context';
   import { createAppRouter } from './create-app-router';

   interface AppRouterProviderProps {
     readonly onRenderError: RenderErrorHandler;
   }

   export function AppRouterProvider({ onRenderError }: AppRouterProviderProps) {
     const httpClient = useHttpClient();
     const queryClient = useQueryClient();
     const sessionResolver = useSessionResolver();
     const context: AppRouterContext = {
       httpClient,
       queryClient,
       sessionResolver,
       onRenderError,
     };
     const [router] = useState(() => createAppRouter({ context }));

     return <RouterProvider router={router} context={context} />;
   }
   ```

   Bind it in `src/app/entrypoint/app.tsx` —
   `<AppRouterProvider onRenderError={handleRenderError} />` — and read it back in the route module
   that mounts the widget, `src/app/routes/__root.tsx`:

   ```tsx
   import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
   import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

   import { NotFoundPage } from '@/pages/not-found';
   import { appConfig } from '@/shared/config';
   import { AppHeader } from '@/widgets/app-header';

   import type { AppRouterContext } from '../router/app-router-context';

   function RootLayout() {
     const { onRenderError } = Route.useRouteContext();

     return (
       <>
         <AppHeader appName={appConfig.name} onLocaleSwitcherError={onRenderError} />
         <Outlet />
         <TanStackRouterDevtools position="bottom-left" initialIsOpen={false} />
       </>
     );
   }

   export const Route = createRootRouteWithContext<AppRouterContext>()({
     component: RootLayout,
     errorComponent: false,
     notFoundComponent: NotFoundPage,
   });
   ```

For a boundary inside a page rather than a widget, the last hop is shorter: the route module already
renders the page, so it passes `onRenderError` straight down as a prop, exactly as
`users.$userId.tsx` passes `onSignedOut`.

### Report a new kind of failure

- Below `app`, never construct or import a sink. Accept an `ErrorReporter` as a prop or a factory
  argument (`import type { ErrorReporter } from '@/shared/observability'`) and let `app/entrypoint`
  pass `reportError` down. `app/routes` and `app/router` follow the same rule; `AppRouterContext`
  carries no reporter today.
- Give a new producer its own arm on `ErrorReport`, with its context as `string` fields.
  `describeErrorReport` in `console-error-reporter.ts` switches over `report.source` with no
  `default` branch, so the build fails with TS2366 (_Function lacks ending return statement and
  return type does not include 'undefined'_) until it handles the new arm; a sink written the same
  way, like `describeReport` above, gets the same check.

## Design decisions & trade-offs

- **The root boundary sits in `app.tsx`, above `AppProviders`.** That is the only position that
  covers client construction: a boundary inside `AppProviders` could not catch a throw from
  `AppProviders`' own `useState` initializers, because the component that throws would be the one
  hosting it, and `AppRouterProvider` builds the router the same way. The cost is that the fallback
  renders outside every provider — no `I18nProvider`, no query client — so its copy is hard-coded
  English: if the i18n subsystem is what failed, there is nothing left to translate a message with.
  `Button` needs no provider, so the fallback still uses the design system
  ([Design system](./design-system.md)).
- **Route failures get a boundary per match, not one panel for the app.** Setting
  `defaultErrorComponent` is what makes TanStack mount a `CatchBoundary` around every match at all,
  and the innermost one wins. The failure is therefore contained where it happened: `AppHeader` and
  every parent layout route stay mounted, the visitor keeps the navigation that got them there, and
  a retry re-runs only the route that broke. A single global panel — what the router does by
  default — loses all of that, and it is untranslated besides. The cost is one boundary per match
  rather than one per application, and a policy that has to be kept in one place rather than
  assumed.
- **The root route opts out with `errorComponent: false`.** A crash in `RootLayout` is not a page
  failure; it is the shell failing, and there is nothing left to render the error screen _inside_.
  Worse, a boundary there could only offer to reload the very layout that just threw. Escalating to
  the root `ErrorBoundary` gives the honest outcome: the whole application is replaced, the failure
  is reported as `{ source: 'render' }`, and `Try again` remounts every provider rather than
  pretending a smaller recovery is possible. `false` is TanStack's own typed opt-out
  (`errorComponent?: false | null | undefined | ErrorRouteComponent`), so this is a supported
  configuration and not a trick.
- **`disableGlobalCatchBoundary: true` removes the safety net on purpose.** With per-match
  boundaries in place, the global `CatchBoundary` would only ever catch the three things no route
  boundary can — a root-layout crash, a crash of the error screen that no ancestor route boundary
  stops, and a render-time not-found no ancestor accepts — and it would answer all three with
  an unstyled panel that keeps
  `error.message` one "Show Error" click away in production. Disabling it routes those three to the
  root `ErrorBoundary` instead, which cannot leak a message and does report. The trade-off is that
  the application-wide crash screen now has three more ways to appear.
- **The retry is scoped, forced to pending and synchronous — all three matter, for three different
  reasons.** TanStack keys every `CatchBoundary` on its match object (`getResetKey: () => match`),
  and `router.invalidate` replaces every committed match it touches with
  `{ ...match, invalid: true }`, so a boundary resets and re-renders whenever its own match is
  republished. `filter` keeps that replacement off the ancestors — not to bound how often the
  failure is caught, which it does not affect at all, but so the layout routes above the failure
  stay mounted _and visible_. An unscoped
  call puts a `/section/*` layout route back into `pending` too and hides its subtree under
  `display: none` while the reload runs, so the layout the visitor was looking at disappears along
  with the failed slot; the two `/section/*` retry cases hold that in place with
  `expect(screen.getByText(SECTION_LAYOUT_TEXT)).toBeVisible()`, which is why the assertion is about
  visibility rather than about finding the element. `forcePending` earns its place in exactly one
  case. `invalidate` resets a match to `status: 'pending'` and clears its error when the match is
  already `error` or `notFound`, or when
  `forcePending` is set — and either way only for a route that needs a load, one declaring a
  `loader`, a `beforeLoad` or a lazy part. A match whose loader rejected is already `error`, so it
  resets without the flag. A match whose loader succeeded and whose component then threw is still
  `success`, because a render throw never reaches the router, and `forcePending` is the only thing
  that resets that one; without it, that match would re-render and re-throw the crash it already
  holds. `sync` is the option that bounds the catch count, and it has two effects the retry wants.
  Without it the whole transaction is deferred with `Promise.resolve().then(run)`; with it `run()`
  is called in the current task, so the invalidation and the reload's first state transition reach
  React together instead of leaving one render in between in which the still-errored match throws
  again. And `sync` is read a second time per match, as one conjunct of the test that decides
  whether a stale reload may run in the background, so it forces every stale ancestor reload to be
  blocking instead. That is the multi-catch mechanism: without `sync`, a stale ancestor reload runs
  in the background, republishes the failed match when it lands, re-arms its boundary and announces
  the same failure a second time. Each extra catch is a real cost, not just noise: the error screen
  unmounts and remounts, so its `<h1>` runs its focus effect again and steals the caret back
  mid-interaction, and once `defaultOnCatch` is wired
  ([Report route failures through the port](#report-route-failures-through-the-port)) every
  duplicate catch becomes a duplicate report in the sink. The suite counts `defaultOnCatch` calls in
  total after one retry click, and the shipped policy always totals two — the original failure plus
  exactly one new catch — on each of the five retry paths it drives that way. Dropping `filter`
  leaves all five totals untouched; dropping `sync` raises two of them to three; dropping all three
  options for a plain `router.invalidate()` gives totals of two to five, so one click adds between
  one and four catches instead of one.
- **`reset` is ignored, deliberately.** TanStack hands an error component a `reset` callback, but it
  only clears the boundary's own state; the match underneath is still `status: 'error'`, and
  `MatchInner` re-throws `match.error` on the next render, so the error screen would flash and come
  straight back without anything having been retried. `RouteErrorPage` is given a real retry
  instead, and `RouteErrorFallback` narrows its props to
  `Readonly<Pick<ErrorComponentProps, 'error'>>` so the misleading callback is not even in scope.
- **The not-found pass-through happens during the fallback's own render.** TanStack stamps a
  not-found with the failing route's id inside the boundary's `componentDidCatch`, which React runs
  _after_ the fallback has rendered. Re-throwing `notFound({ ...error, throw: true })` from the
  fallback's render therefore sends up a copy that still carries no `routeId`, and the nearest
  ancestor `notFoundComponent` adopts it. If the stamped original were allowed through instead, the
  root's not-found boundary would compare ids, find them different, re-throw, and a plain missing
  resource would land on the application crash screen. Doing the check in a `useEffect` or an event
  handler is not an alternative: both run _after_ `componentDidCatch`, so by then the original
  already carries `routeId` and the spread would copy it. Nor can the check share a component with
  the hooks: an early throw placed above a hook call makes every hook below it conditional, which
  the rules of hooks forbid and `react-hooks/rules-of-hooks` reports. `RouteErrorFallback` therefore
  stays an outer, hook-free layer and delegates to `RouteErrorRecovery`, which owns `useMatch` and
  `useQueryErrorResetBoundary`.
- **The error screen never receives the error.** `RouteErrorPage` declares only
  `{ readonly onRetry: () => void }`, and `RouteErrorFallback` never passes anything else — the same
  narrowing `AppCrashFallback` applies with `Pick<ErrorFallbackProps, 'resetErrorBoundary'>`.
  Leaking a thrown message, which may carry a URL or a token, is unrepresentable rather than merely
  tested. TanStack's built-in panel does the opposite; that is a large part of why it is switched
  off.
- **The screens live in `pages`, the policy lives in `app/router`.** Both are ordinary page slices
  that know nothing about matches or invalidation. `RouteErrorPage` takes one callback, `onRetry`,
  and owns its `<main>` and its focused `<h1>`. `RoutePendingPage` takes no props at all and renders
  a `<main>` around an `<output>` and nothing else: it is the doc set's single named exception to
  the one-`<h1>`-per-page rule, because a heading on a transient screen would make every unnamed
  `findByRole('heading', { level: 1 })` in the suite race against it ([Routing](./routing.md)).
  Everything that knows about TanStack — `useMatch`, `router.invalidate`, `isNotFound` — sits in
  `RouteErrorFallback` in `app/router`, where the `@tanstack/react-router` import is allowed. That
  keeps the router swappable and keeps the screens testable without a router.
- **The fence allows `errorComponent: false` and nothing else.** A route module that set its own
  error component would silently lose the not-found pass-through and the scoped retry — both live in
  `RouteErrorFallback`, not in the router — and the loss would be invisible until a missing resource
  showed the crash screen. `ROUTE_FALLBACK_RESTRICTIONS` makes that a lint error, and a second pair
  of selectors rejects spreading or passing route options as one object so the first rule cannot be
  hidden from the linter. The cost is that per-route error screens now need a deliberate change to
  the fence.
- **The seam forwards `FallbackComponent`, never `fallbackRender`.** In the installed
  `react-error-boundary`, a `fallbackRender` function is _called_ inside the boundary class's own
  `render()` rather than mounted as a component of its own, so it never gets a fiber — the
  per-component instance React attaches hook state to — and any hook it calls therefore has nothing
  to attach to and throws _Invalid hook call_, from a position only a boundary above could catch.
  Above the root boundary there is none, so the crash screen would crash to the blank page it exists
  to prevent. `FallbackComponent` goes through `createElement` instead: it mounts as an ordinary
  component with a fiber of its own, and hooks behave normally. Exposing only that slot means no
  caller can pick the trap, and `AppCrashFallback` needs `useRef` and `useEffect` today. The prop
  keeps the vendor's name because the vendor's `fallback` already means a `ReactNode`.
- **The seam owns its types.** `ErrorFallbackProps` and `RenderErrorHandler` are declared locally
  rather than re-exported, so no vendor type crosses the seam. `RenderErrorHandler` is a narrow "a
  render crashed" callback over React's own `ErrorInfo`, not the observability port, which the
  boundary knows nothing about. `onError` is typed `RenderErrorHandler | undefined` because
  `exactOptionalPropertyTypes` would otherwise reject passing a handler that may be `undefined`.
- **The crash screen cannot show the error.** `AppCrashFallback` declares
  `Pick<ErrorFallbackProps, 'resetErrorBoundary'>` and still satisfies the boundary's
  `FallbackComponent: ComponentType<ErrorFallbackProps>` slot: the boundary hands its fallback one
  object carrying both `error` and `resetErrorBoundary`, and that object already has everything a
  component asking only for `resetErrorBoundary` needs, so the assignment is safe — the same rule
  TypeScript applies whenever a function is assigned where a more demanding parameter type is
  expected (parameter contravariance). What the narrowing buys is the other direction: `error` is
  not one of the component's props, so it never enters scope and a JSX call that tried to pass it
  would be rejected. It is the same narrowing move as `UserReadClient = Pick<HttpClient, 'get'>`
  ([User profile (read path)](./user-profile.md)).
- **Focus, not a live region.** Both crash screens give their heading `tabIndex={-1}` and focus on
  mount, and neither uses `role="alert"`. A live region announces content inserted into a region
  that already exists, but a boundary replaces the whole subtree, so region and text mount in the
  same commit and several screen readers stay silent; doing both makes NVDA and JAWS announce twice.
  The focus ring uses `focus:` utilities rather than `focus-visible:` because `:focus-visible` does
  not match a programmatic `.focus()` after a pointer interaction.
- **`ErrorReporter` is a bare function type over a string-only union.** A single-operation
  collaborator in this repo is a function type (`SessionListener`, `RenderErrorHandler`), not a
  one-method object. Every `ErrorReport` field except `error` is a `string`, so a DTO or a live
  domain object cannot reach a sink through a context field — and neither can a mutation's
  `variables`, where the sign-in mutation holds the plaintext password, because `createQueryClient`
  forwards only the error and a hash. `error` stays `unknown` by design: scrubbing belongs to
  whichever sink first leaves the browser.
- **Injection by argument and prop, never React context.** The root boundary sits above
  `AppProviders`, so a context provided inside the tree could never reach its `onError`, and nothing
  in `entities`, `features` or `pages` needs to report today. ESLint bans the
  `@/shared/observability` path below `app` and in `app/routes` / `app/router` with
  `allowTypeImports: true`, so a prop can still be typed `ErrorReporter`, plus a
  `^@/shared/observability/` pattern that closes the deep-import route around the barrel. It is a
  path ban rather than an `importNames` list of today's factories, so the next adapter added to the
  barrel cannot silently become importable.
- **`toSafeErrorReporter` guards every sink.** Two vendor behaviours make a throwing sink dangerous.
  `react-error-boundary` calls `onError` from `componentDidCatch` with no guard, so a throw on the
  render path escapes the topmost boundary and unmounts the whole tree. TanStack Query's `Query`
  calls its cache's `onError` unguarded inside its own `catch` block, just before rethrowing, so a
  throw there would replace the application's real error with the sink's. (The mutation path is
  already wrapped in `try`/`catch` by TanStack Query.) When the sink fails, the guard falls back to
  `console`, the last channel left.
- **`shared/api` knows nothing about reporting.** `createQueryClient` takes an options object with
  two plain `(error, hash) => void` callbacks instead of importing `ErrorReporter` — `QueryCache`
  and `MutationCache` take `onError` as constructor options, not `DefaultOptions` fields
  ([HTTP transport](./http-transport.md#design-decisions--trade-offs) covers why). The adapters in
  `app/entrypoint` bridge those callbacks to the port, the same narrow-collaborator pattern as
  `CacheResetTarget`.
- **The console stays the production default, deliberately.** A template that silenced production
  errors by default would be worse than one that logs them, and the swap is one line. The cost:
  until a real sink replaces it, the console receives the whole error object — `HttpError`
  `payload`, `issues` and `cause` included — and nothing leaves the device.
- **No error-tracking SDK ships.** Measured when the reporting seam landed (`9795dee`): the entry
  chunk grew 455.66 → 456.53 kB raw and 148.76 → 149.08 kB gzip — +0.32 kB gzip, all first-party —
  and modules went 563 → 569, while the route chunks and `index.css` did not move. `@sentry/react`
  was rejected at roughly +30 kB gzip on the entry chunk, for a DSN the template has no business
  owning. The boundary vendor is small — `react-error-boundary` 6.1.5's ESM build is 2,995 B raw and
  1,163 B gzip — but because `AppCrashFallback` imports `Button`, the button primitive and its
  `class-variance-authority`, `clsx`, `tailwind-merge` and Radix `Slot` dependencies are statically
  reachable from the entry.
- **`react-error-boundary` is a fenced vendor**, like axios, the i18next packages, TanStack Form,
  sonner and the concrete validators. `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS` in `eslint.config.js`
  bans it through `no-restricted-imports` in every block that fences a vendor — the five non-`app`
  layers, `app/routes`, `app/router` and `src/main.tsx` — plus the generic `src/**` block, which is
  what covers `app/entrypoint`. The `src/shared/ui/error-boundary/**` exemption must stay after the
  `src/{entities,features,widgets,pages,shared}/**` block because flat config replaces rather than
  merges `no-restricted-imports` options; its glob does not overlap `src/shared/ui/form/**`, so the
  two exemptions coexist.

## Testing

Unit and component tests sit beside the modules they cover (see
[Unit and component testing](./unit-testing.md)):

| Test file                                                                                                    | What it proves                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/observability/console-error-reporter.test.ts`                                                    | The `console.error` line for each of the three sources                                                                                                                                                                                                                                                                                   |
| `src/shared/observability/to-safe-error-reporter.test.ts`                                                    | A report is forwarded; a throwing sink is logged as `the error reporter failed` instead of rethrown; forwarding continues after a failure                                                                                                                                                                                                |
| `src/shared/ui/error-boundary/error-boundary.test.tsx`                                                       | Children render; the fallback receives the thrown error; the fallback is mounted as a component of its own, so a hook inside it works — the case that fails if the seam switches to `fallbackRender`; `onError` runs once; a reset renders the children again                                                                            |
| `src/app/entrypoint/app-crash-fallback.test.tsx`                                                             | The heading takes focus on mount; the copy; `Try again` calls `resetErrorBoundary`; mounted by a real boundary around a child throwing a token-bearing URL, it never renders the message                                                                                                                                                 |
| `src/app/entrypoint/create-render-error-handler.test.ts`                                                     | React's component stack is forwarded, and a `null` stack becomes `''`                                                                                                                                                                                                                                                                    |
| `src/app/entrypoint/create-query-error-handlers.test.ts`                                                     | `query` and `mutation` reports carry their hashes                                                                                                                                                                                                                                                                                        |
| `src/shared/api/query-client.test.ts` (`createQueryClient failure callbacks`)                                | A failing query reports its query hash; a failing mutation reports `hashKey` of its key, or of `[]` without one; no callbacks means no console output; a custom `queryKeyHashFn` shapes `queryHash` while mutations keep TanStack's `hashKey`                                                                                            |
| `src/app/entrypoint/app-providers.test.tsx` (`reports a query failure through the injected handlers`)        | `AppProviders` really hands its handlers to the query client                                                                                                                                                                                                                                                                             |
| `src/app/entrypoint/app.test.tsx` (`catches a provider construction failure instead of unmounting the tree`) | With `AppProviders` replaced by a throwing component through `vi.doMock`, `vi.resetModules` and a dynamic import, `App` shows the crash heading and the console sink prints `error reported from render` — pinning the boundary's presence, its position above `AppProviders` and the `onError` wiring                                   |
| `src/app/router/router-fallback-defaults.test.tsx`                                                           | 19 cases driving the policy through a real router built from `ROUTER_FALLBACK_DEFAULTS` over a purpose-built route tree — see below                                                                                                                                                                                                      |
| `src/app/router/create-app-router.test.tsx`                                                                  | The real application router: a `SessionResolver` double that rejects drives the `_authenticated` guard into failure, and the error screen renders with the banner still present and exactly one `<main>`; `Back to home` navigates; `router.options` matches `ROUTER_FALLBACK_DEFAULTS` and the root route's `errorComponent` is `false` |
| `src/pages/route-pending/ui/route-pending-page.test.tsx`                                                     | The pending screen renders its loading message as a `status` inside the page landmark and deliberately renders no heading                                                                                                                                                                                                                |

`router-fallback-defaults.test.tsx` is where the route-failure behaviour is pinned. It builds a real
`createRouter` over a small tree of deliberately broken routes — a rejecting loader, a throwing
component, a `useSuspenseQuery` that fails once, routes that throw `notFound()` from render, from a
`loader` and from a `beforeLoad`, and a nested section layout — wraps it in the real `ErrorBoundary`
with a stand-in fallback, and injects `defaultOnCatch` purely as a counter, which is how "exactly
one catch per click" is measured. It covers: the policy literal itself; the translated error screen,
its focused heading, its refusal to render the thrown message, and its home link; the pending screen
on a slow navigation and on a retry; one catch per retry click for a failing loader, a failing
component, a route with nothing to load, and a nested route whose layout stays on screen; a failed
suspense query refetching after `Try again`; not-found pass-through from render, from a nested
route, from a `loader` and from a `beforeLoad`; and escalation to the application boundary when
`RootLayout` crashes and when a `defaultErrorComponent` stand-in that always throws replaces the
error screen at `/loaded`, a direct child of that tree's root route. `RouteErrorPage` has no
co-located test of
its own — it is exercised only through these two router-level suites, which is what keeps the
assertions about the surrounding shell honest.

Run them with:

```sh
npm test
npx vitest run src/shared/observability src/shared/ui/error-boundary src/app/entrypoint
npx vitest run src/app/router src/pages/route-pending
npx vitest run src/shared/api/query-client.test.ts
npm run test:e2e
```

No Playwright spec exercises this feature. `e2e/` holds `app-shell.spec.ts`, `user-profile.spec.ts`
and `security-headers.spec.ts`; none of them drives a route crash or asserts on reporting.
`e2e/user-profile.spec.ts` does produce a real query failure (a `404` for an unknown id) and a real
mutation failure (a `500` on save) against the production build, and both are reported to the
browser console, but the specs assert only the on-screen states (see
[End-to-end testing](./e2e-testing.md)).

## Known limitations

- **A contained route failure is not reported.** No production module in `src` sets `defaultOnCatch`
  or a route-level `onCatch` — the single occurrence is the counter
  `src/app/router/router-fallback-defaults.test.tsx` injects — and TanStack calls those callbacks
  only from a per-match boundary, so nothing that `RouteErrorFallback` catches reaches
  `reportError` — nor a vendor sink bound there. What a production build leaves behind is one bare
  `console.error(error)` from React's default caught-error handler (`src/main.tsx` passes no
  `onCaughtError` to `createRoot`); a development build prints a formatted version of the same error
  naming the component and the boundary, and adds
  `console.warn('Warning: Error in route match: <match id>')` from TanStack. A root-layout crash
  _is_ reported, as `{ source: 'render' }`, because it escalates to the root `ErrorBoundary`. So is
  a crash of the error screen, unless it is confined to one match _below a non-root layout route_ —
  today only `/_authenticated/users/$userId`, whose `_authenticated` ancestor inherits a boundary,
  catches the crash, renders `RouteErrorPage` again and reports nothing. The other three non-root
  routes are direct children of `__root__`, which has no boundary, so there a match-specific crash
  of the error screen reaches the root `ErrorBoundary` and is reported. Wiring the port to route
  catches is a
  deliberate next step and needs an
  `onRenderError` threaded through `App` → `AppRouterProvider` → `createAppRouter`; the exact change
  is in [Report route failures through the port](#report-route-failures-through-the-port).
- **A crash inside `AppCrashFallback` has no containment at all.** Nothing sits above the root
  `ErrorBoundary`, so a throw while rendering the crash screen unmounts the React root and produces
  exactly the blank page this feature exists to prevent — and `onError` is not called for it either,
  so it is never reported. The screen is kept deliberately small for that reason (a heading, a
  paragraph and a `Button`, with no provider, no translation and no data), but no test covers the
  case, because there is no boundary from which to observe it.
- **`AppCrashFallback`'s copy no longer fits every case it covers.** It reads
  `The application could not start. Trying again may fix it.`, which is hard-coded English in
  `src/app/entrypoint/app-crash-fallback.tsx`. Since the root route opted out of having an error
  boundary, that screen also appears for a mid-session `RootLayout` crash and for a crash of the
  route error screen that no ancestor route boundary stops — neither of which is a start-up failure.
- **The console is the only sink, in every build.** No report leaves the device; a production error
  is visible only in the affected user's own browser console.
- **Reports carry unscrubbed errors.** `HttpError` keeps the original failure as `cause`. When an
  exchange on the authenticated client fails — an error status, a timeout, a dropped connection —
  that is the live `AxiosError`, whose `config.headers` still hold the `Authorization: Bearer …`
  header set by the request interceptor in `src/shared/api/attach-bearer-token.ts`, and whose
  `config.data` holds the request body; `payload` holds the server's response body. The `redact`
  list `createHttpClient` passes to axios (`authorization`, `cookie`, `set-cookie` by default)
  applies only to `AxiosError#toJSON()` — the transport's own test checks it through
  `JSON.stringify(failure.cause)` — and does not touch the live object the console sink logs or a
  vendor SDK may walk. A sink that leaves the browser must scrub `cause`, `payload` and `issues`
  itself, as the example above does.
- **Every mutation report carries the same hash.** Neither the sign-in mutation in
  `src/features/sign-in/model/use-sign-in.ts` nor `createUserMutations(httpClient).updateName`
  declares a `mutationKey`, so both report `mutationHash` `[]` and only the error tells them apart.
- **Failures outside render and outside TanStack Query are not reported.** Nothing installs a
  `window` `error` or `unhandledrejection` listener, and `src/main.tsx` passes no `onUncaughtError`
  or `onCaughtError` to `createRoot`, so a throw in an event handler or timer, an unhandled promise
  rejection, or the missing-`#root` error that `main.tsx` throws before any boundary exists reaches
  only React's and the browser's defaults. Failures the session model folds into an outcome resolve
  instead of rejecting, so they are never reported either: sign-in's `rejected`, `rate-limited` and
  `unavailable` ([Sign-in](./sign-in.md)), and the refresh exchange's `expired` and `unavailable`
  and the resolver's `unknown` ([Session management](./session-management.md)).
- **The suspense-reset hook has no production caller yet.** `useResetQueryErrorsOnMount` exists so a
  failed `useSuspenseQuery` refetches on retry, and a test route proves it works, but nothing
  outside the test suite uses `useSuspenseQuery` or `throwOnError` today; the profile screen renders
  its own `unavailable` state instead of throwing into the route boundary.
