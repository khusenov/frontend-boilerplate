# Composition root

> **Status:** Complete · **Layers:** app, widgets, entities, shared, outside layers · **Verified against:** `65a99bc`

## Purpose

Every seam in this application — the HTTP transport, the query cache, the session, translation,
error reporting — is a type its consumers program against while the concrete implementation is
chosen somewhere else. The composition root is that somewhere: `src/app/entrypoint` constructs
every client, binds it to its seam and publishes it to the code that needs it. `index.html` and
`src/main.tsx` start the application before any of that runs, and `src/app/router` later hands the
ports — the same seams — that route code needs to the router. Keeping construction in one place is
what lets every layer below `app` stay free of clients, configuration reads and vendor choices — so
each can be tested with a plain stub — and what turns replacing an implementation into a change to
one module. There is no
dependency-injection container: React context carries the ports to components and hooks, the router
context carries them to route guards and loaders, and plain arguments carry the rest.

## How it works

A **seam**, or **port**, is a type that consumers depend on — `HttpClient`, `SessionResolver`,
`ErrorReporter` — while its **concrete** implementation is constructed elsewhere. Feature-Sliced
Design (FSD) splits `src/` into **layers** that import only from layers below them (`app` → `pages`
→ `widgets` → `features` → `entities` → `shared`). `app` and `shared` are divided into purpose-named
**segments** (`app/entrypoint`, `app/router`, `app/routes`, `app/styles`), the layers between them
into **slices** (`entities/session`, `widgets/app-header`), and each slice or segment is consumed
through its **public API**, an `index.ts` barrel that only re-exports. A **provider** publishes one
value to its React subtree, and a hook such as `useHttpClient()` reads it back, throwing when no
provider is above it.

**Construction and composition are separate jobs**, and `widgets` is the instructive case of a layer
that needs the second without the first. The composition root _constructs_ nothing for it:
`AppHeader` — the repo's only widget ([App shell](./app-shell.md)) — is a plain component that
takes one prop and renders `LocaleSwitcher` from `features/switch-locale`, which reaches the i18n
instance through `useLocale()`. There is no widget client, no widget provider and no widget factory
to build. What
the root still does for it is _compose_ it: `src/app/routes/__root.tsx` mounts
`<AppHeader appName={appConfig.name} />` above the routed `<Outlet />` and hands the widget its
configuration as a prop. That is the convention this document exists to describe — configuration is
read at the composition seam and passed down as a plain value, so the widget names no config key of
its own, exactly as `src/app/routes/index.tsx` already hands `appConfig.name` to `HomePage`
([Configuration and environment](./configuration.md)). A layer with no concrete to bind still has a
mount point, and the mount point is here.

Startup runs in this order:

1. **The host page.** `index.html` contains an empty `<div id="root"></div>` and one
   `<script type="module" src="/src/main.tsx">`. Vite treats the page as the application's entry:
   the dev server transforms `src/main.tsx` on request, and `vite build` rewrites the tag to the
   hashed entry chunk and adds a link to the entry stylesheet.
2. **Module evaluation binds the stateless half.** The `import { App } from '@/app'` at the top of
   `src/main.tsx` evaluates the application's module graph before `main.tsx` runs a statement of its
   own. `src/app/index.ts` re-exports `App` from `./entrypoint/app`, and evaluating `app.tsx` loads
   the global stylesheet (`src/app/styles/index.css`), computes `appConfig`, binds `reportError` in
   `app-error-reporter.ts` to `toSafeErrorReporter(createConsoleErrorReporter())`, and builds two
   adapters at module scope: `handleRenderError = createRenderErrorHandler(reportError)` and
   `queryErrorHandlers = createQueryErrorHandlers(reportError)`. No client exists yet.
3. **The mount.** `src/main.tsx` looks up the element whose id is `ROOT_ELEMENT_ID` (`'root'`). If
   there is none it throws `Root element #root was not found in index.html`; otherwise it calls
   `createRoot(rootElement).render()` with `<App />` wrapped in `<StrictMode>`. It binds nothing.
4. **`App` renders the tree.** Everything below `App` is created by `App`, `AppProviders` and
   `AppRouterProvider`; the right-hand column names the value each element holds or publishes:

   ```text
   StrictMode                               src/main.tsx
   └─ App                                   src/app/entrypoint/app.tsx
      └─ ErrorBoundary                      AppCrashFallback, onError = handleRenderError
         └─ AppProviders                    builds transport, queryClient, i18n
            └─ QueryClientProvider          queryClient
               ├─ Suspense                  fallback = null
               │  └─ I18nProvider           i18n
               │     └─ HttpClientProvider  transport.httpClient
               │        └─ SessionResolverProvider   transport.sessionResolver
               │           └─ SessionStarterProvider   transport.sessionStarter
               │              └─ SessionEnderProvider   transport.sessionEnder
               │                 └─ AppRouterProvider   builds the router, fills AppRouterContext
               │                    └─ RouterProvider   the route tree
               │                       └─ RootLayout   AppHeader appName={appConfig.name}, Outlet
               └─ ReactQueryDevtools        initialIsOpen = false
   ```

5. **`AppProviders` builds the clients, once.** Its first render runs three `useState` lazy
   initializers, in order: `createAuthenticatedTransport(apiBaseUrl)`, which composes two HTTP
   clients with the session store, token source, resolver, starter, ender and observer and sends
   nothing ([HTTP transport](./http-transport.md)); `createQueryClient(queryErrorHandlers)`, the
   TanStack Query client whose failure callbacks feed the reporter; and `createI18n()`, the i18next
   instance, which detects the locale synchronously ([Internationalization](./internationalization.md)).
   A lazy initializer runs on the first render only, so each instance keeps its identity for as long
   as `AppProviders` stays mounted. The providers publish them: `QueryClientProvider` the query
   client, `I18nProvider` the i18n instance, `HttpClientProvider` `transport.httpClient`, and
   `SessionResolverProvider`, `SessionStarterProvider` and `SessionEnderProvider` the transport's
   `sessionResolver`, `sessionStarter` and `sessionEnder`.
6. **`AppRouterProvider` hands the ports to the router.** Route `beforeLoad` guards and `loader`s
   run outside React, where no hook can be called. So `AppRouterProvider` — the child that `App`
   passes into `AppProviders` — reads `useHttpClient()`, `useQueryClient()` and
   `useSessionResolver()` into an `AppRouterContext` object, creates the router once with
   `useState(() => createAppRouter({ context }))` and renders
   `<RouterProvider router={router} context={context} />` ([Routing](./routing.md)). Every guard and
   loader then receives the ports as its `context` argument: the `_authenticated` layout route's
   `beforeLoad` awaits `context.sessionResolver.resolve()`
   ([Authenticated route guard](./route-guard.md)), and the `/users/$userId` loader prefetches
   through `context.queryClient` and `context.httpClient`
   ([User profile (read path)](./user-profile.md)).
7. **After the first commit, the cache policy subscribes.** The one effect in `AppProviders` calls
   `clearCacheOnSessionEnd(transport.sessionObserver, queryClient)`, which records the current
   session status, subscribes to the observer and clears the query cache on every notification
   whose previous status was `authenticated`, so one visitor's cached data does not outlive their
   session ([Session management](./session-management.md)). It returns the unsubscribe function,
   which becomes the effect's cleanup. Nothing else receives the observer.

**When startup fails.**

- **No `#root` element.** The guard throws while `src/main.tsx` is evaluated, before React exists,
  so no boundary catches it and no reporter sees it. The page stays blank and the browser console
  shows a message that names the file to fix.
- **A client or the router cannot be constructed.** The `useState` initializers of `AppProviders`
  and `AppRouterProvider` run inside the root `ErrorBoundary`. It replaces the tree with
  `AppCrashFallback` (`Something went wrong`) and hands the error to `handleRenderError`, which files
  a `render` report. `Try again` remounts both components, so every client and the router are
  constructed again ([Error handling and reporting](./error-handling.md)).
- **A module throws while it is evaluated** — `app-config.ts`, a sink constructed in
  `app-error-reporter.ts`, anything in the static import graph. That happens in step 2, before
  `createRoot(rootElement).render()` runs, so, like a missing `#root`, it escapes every boundary.

## Architecture

The composition root declares almost no seam of its own: it is where other features' seams meet
their concretes, over three channels. React providers publish the ports that components and hooks
read — `HttpClient`, the `QueryClient` ([HTTP transport](./http-transport.md)), the i18next
instance ([Internationalization](./internationalization.md)), `SessionResolver`, `SessionStarter`
and `SessionEnder` ([Session management](./session-management.md)). `AppRouterContext` carries the
three that code outside React needs — `httpClient`, `queryClient` and `sessionResolver` — to
`beforeLoad` and `loader`. Plain arguments and props carry what must exist above or beside the
tree, and what needs no client at all: `appConfig.apiBaseUrl`, the `queryErrorHandlers`, the
`ErrorReporter` ([Error handling and reporting](./error-handling.md)), which reaches the root
boundary as `onError` because that boundary sits above every provider, and `appConfig.name`, which
`src/app/routes/__root.tsx` hands to `AppHeader` as `appName` — composition with nothing to
construct and nothing to publish. The root's own types are narrow:
`AuthenticatedTransport`, the bundle that one factory returns; `AppRouterContext`; and the
collaborator types `QueryErrorHandlers` and `CacheResetTarget`. Imports point one way —
`src/main.tsx` → `@/app` → `app/entrypoint` → `app/router`, `app/styles` and the public APIs of
`entities` and `shared` — and no module below `app` may import any of it. ESLint keeps
construction here: every layer below `app`, and `app/routes` and `app/router`, is barred from
importing `createHttpClient`, `createQueryClient`, `createI18n`, the six session constructors or
any value from `@/shared/observability`, so `app/entrypoint` is the only place a client can be
built. `app/router` builds one concrete, the router, from ports it reads back out of React context
([Routing](./routing.md)).

| Component                                                                   | Layer                      | Responsibility                                                                                                                                                              | File                                                                                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host page                                                                   | outside layers             | Holds the `#root` mount element and the module script that makes `src/main.tsx` Vite's entry                                                                                | `index.html`                                                                                                                                                                   |
| `ROOT_ELEMENT_ID` guard and mount                                           | outside layers             | Finds `#root` or throws; renders `<App />` inside `StrictMode`; binds nothing                                                                                               | `src/main.tsx`                                                                                                                                                                 |
| `index.ts`                                                                  | app                        | The `app` layer's public API: re-exports `App` and nothing else                                                                                                             | `src/app/index.ts`                                                                                                                                                             |
| `App`                                                                       | app/entrypoint             | Imports the global stylesheet, builds the two error adapters at module scope, reads `appConfig.apiBaseUrl`, renders `ErrorBoundary` → `AppProviders` → `AppRouterProvider`  | `src/app/entrypoint/app.tsx`                                                                                                                                                   |
| `AppProviders`                                                              | app/entrypoint             | Owns every client in a `useState` initializer, publishes them through six providers, mounts the `Suspense` boundary and `ReactQueryDevtools`, subscribes the cache policy   | `src/app/entrypoint/app-providers.tsx`                                                                                                                                         |
| `createAuthenticatedTransport`, `AuthenticatedTransport`                    | app/entrypoint             | Composes both HTTP clients with the session collaborators; returns the authenticated client, three session ports and the observer                                           | `src/app/entrypoint/create-authenticated-transport.ts`                                                                                                                         |
| `clearCacheOnSessionEnd`, `CacheResetTarget`                                | app/entrypoint             | Clears the query cache on each notification that leaves `authenticated`; returns the unsubscribe                                                                            | `src/app/entrypoint/clear-cache-on-session-end.ts`                                                                                                                             |
| `reportError`                                                               | app/entrypoint             | The one binding of a concrete error sink                                                                                                                                    | `src/app/entrypoint/app-error-reporter.ts`                                                                                                                                     |
| `createRenderErrorHandler`                                                  | app/entrypoint             | Adapts the root boundary's `onError` callback onto `reportError`                                                                                                            | `src/app/entrypoint/create-render-error-handler.ts`                                                                                                                            |
| `createQueryErrorHandlers`, `QueryErrorHandlers`                            | app/entrypoint             | Adapts the query client's two failure callbacks onto `reportError`                                                                                                          | `src/app/entrypoint/create-query-error-handlers.ts`                                                                                                                            |
| `AppCrashFallback`                                                          | app/entrypoint             | The screen the root boundary renders when startup crashes                                                                                                                   | `src/app/entrypoint/app-crash-fallback.tsx`                                                                                                                                    |
| `AppRouterProvider`                                                         | app/router                 | Reads the ports back out of React context into `AppRouterContext`, builds the router once, re-supplies the context on every render                                          | `src/app/router/app-router-provider.tsx`                                                                                                                                       |
| `AppRouterContext`                                                          | app/router                 | The three required ports every `beforeLoad` and `loader` receives                                                                                                           | `src/app/router/app-router-context.ts`                                                                                                                                         |
| `createAppRouter`                                                           | app/router                 | Builds the router over the generated route tree with the routing policy ([Routing](./routing.md))                                                                           | `src/app/router/create-app-router.ts`                                                                                                                                          |
| `RootLayout`, the root route                                                | app/routes                 | Declares the root route over `AppRouterContext`; mounts `AppHeader` with `appName={appConfig.name}` above the routed `<Outlet />` and the router devtools                   | `src/app/routes/__root.tsx`                                                                                                                                                    |
| `AppHeader`                                                                 | widgets/app-header         | The app-shell banner the root layout mounts: the application name beside the `LocaleSwitcher`. Constructed by nothing; configured by one prop ([App shell](./app-shell.md)) | `src/widgets/app-header/ui/app-header.tsx`                                                                                                                                     |
| Global stylesheet                                                           | app/styles                 | Imports the design-system theme and sets base styles ([Design system](./design-system.md))                                                                                  | `src/app/styles/index.css`                                                                                                                                                     |
| `SessionResolverProvider`, `SessionStarterProvider`, `SessionEnderProvider` | entities/session · model   | Publish `SessionResolver`, `SessionStarter` and `SessionEnder`, read with `useSessionResolver()`, `useSessionStarter()` and `useSessionEnder()`                             | `src/entities/session/model/session-resolver-provider.tsx`, `src/entities/session/model/session-starter-provider.tsx`, `src/entities/session/model/session-ender-provider.tsx` |
| `HttpClientProvider`                                                        | shared/api                 | Publishes the `HttpClient`, read with `useHttpClient()`                                                                                                                     | `src/shared/api/http-client-provider.tsx`                                                                                                                                      |
| `createQueryClient`                                                         | shared/api                 | Builds the `QueryClient` with its cache defaults, retry policy and failure callbacks                                                                                        | `src/shared/api/query-client.ts`                                                                                                                                               |
| `createI18n`, `I18nProvider`                                                | shared/i18n                | Build the i18next instance; publish it and keep `<html lang dir>` in sync with the locale                                                                                   | `src/shared/i18n/create-i18n.ts`, `src/shared/i18n/i18n-provider.tsx`                                                                                                          |
| `ErrorBoundary`                                                             | shared/ui · error-boundary | The containment seam the root boundary is built from                                                                                                                        | `src/shared/ui/error-boundary/error-boundary.tsx`                                                                                                                              |
| `appConfig`                                                                 | shared/config              | The only reader of `import.meta.env`; the source of `apiBaseUrl`                                                                                                            | `src/shared/config/app-config.ts`                                                                                                                                              |
| `src/main.tsx` fence and construction bans                                  | outside layers             | `no-restricted-imports` blocks that hold `src/main.tsx` to `@/app` and keep construction inside `app/entrypoint`                                                            | `eslint.config.js`                                                                                                                                                             |
| `@/*` alias                                                                 | outside layers             | Maps `@/…` specifiers to `./src/*` for the compiler; Vite reads the same mapping through `resolve.tsconfigPaths`                                                            | `tsconfig.app.json`, `vite.config.ts`                                                                                                                                          |

## Public surface

The composition root serves no route and exports one component. Its contract is what it publishes:
the ports lower layers read, the context route modules receive, and the handful of modules an
engineer edits to change a binding.

### The `@/app` barrel

`src/app/index.ts` exports exactly one symbol, `App`, a component with no props. Its only importer
is `src/main.tsx`, which ESLint permits to import nothing else under `@/`. Everything else in
`app/entrypoint` is internal to the segment and imported by relative path; the tests import `./app`
the same way.

### What the root binds

One line per binding; the owner documents the seam in depth. Composition that binds nothing gets no
row: `AppHeader` takes `appName={appConfig.name}` in `src/app/routes/__root.tsx`, and that prop is
the whole of what the root does for the `widgets` layer.

| Port              | Concrete                                                                                         | Published through                                                                                                                                                              | Read with                                                                                            | Owner                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `HttpClient`      | `transport.httpClient`, the authenticated client from `createAuthenticatedTransport(apiBaseUrl)` | `HttpClientProvider`; `AppRouterContext.httpClient`                                                                                                                            | `useHttpClient()` from `@/shared/api`; `context.httpClient`                                          | [HTTP transport](./http-transport.md)                                                        |
| `QueryClient`     | `createQueryClient(queryErrorHandlers)`                                                          | `QueryClientProvider`; `AppRouterContext.queryClient`                                                                                                                          | `useQuery`, `useMutation` and `useQueryClient()` from `@tanstack/react-query`; `context.queryClient` | [HTTP transport](./http-transport.md)                                                        |
| i18next instance  | `createI18n()`                                                                                   | `I18nProvider`                                                                                                                                                                 | `useTranslation()`, `Trans` and `useLocale()` from `@/shared/i18n`                                   | [Internationalization](./internationalization.md)                                            |
| `SessionResolver` | `transport.sessionResolver`                                                                      | `SessionResolverProvider`; `AppRouterContext.sessionResolver`                                                                                                                  | `useSessionResolver()`; `context.sessionResolver` in the `_authenticated` guard                      | [Session management](./session-management.md), [Authenticated route guard](./route-guard.md) |
| `SessionStarter`  | `transport.sessionStarter`                                                                       | `SessionStarterProvider`                                                                                                                                                       | `useSessionStarter()`, called only by `useSignIn` in `features/sign-in`                              | [Session management](./session-management.md), [Sign-in](./sign-in.md)                       |
| `SessionEnder`    | `transport.sessionEnder`                                                                         | `SessionEnderProvider`                                                                                                                                                         | `useSessionEnder()`, called only by `useSignOut` in `features/sign-out`                              | [Session management](./session-management.md), [Sign-out](./sign-out.md)                     |
| `SessionObserver` | `transport.sessionObserver`                                                                      | Nothing: `AppProviders` passes it straight to `clearCacheOnSessionEnd`                                                                                                         | Not readable below `app`                                                                             | [Session management](./session-management.md)                                                |
| `ErrorReporter`   | `reportError`                                                                                    | Arguments: `createRenderErrorHandler(reportError)` becomes the root boundary's `onError`, `createQueryErrorHandlers(reportError)` becomes `AppProviders`' `queryErrorHandlers` | Not readable below `app`                                                                             | [Error handling and reporting](./error-handling.md)                                          |
| Router            | `createAppRouter({ context })`                                                                   | `RouterProvider`                                                                                                                                                               | Route modules under `src/app/routes`; below `app`, only `Link`                                       | [Routing](./routing.md)                                                                      |

`createAuthenticatedTransport` returns the authenticated client and all four session-related values
from one call because they must share instances: one session store behind the observer, the starter,
the ender and the token source, and one token source behind both the authenticated client and the
resolver, so a guard's refresh and a `401` retry that overlap await the same in-flight token refresh
instead of firing two. The shared token source is what makes that possible: the resolver's
`settle()` and the authenticated client's `renewToken()` both enter one `singleFlight` task
(`shared/lib/single-flight`), whose `run()` hands every concurrent caller the same promise, so at
most one `POST /auth/refresh` is in flight. The shared store does the same for the ender:
`sessionEnder.signOut()` ends the very store `clearCacheOnSessionEnd` observes, so signing out needs
no cache wiring of its own — and the very store the token source re-reads before it starts a session
from a refresh, which is what stops a renewal in flight from undoing a sign-out. Why that matters is
[Session management](./session-management.md); this doc's rule is only that the transport is built
once, here.

### The router context

Declared in `src/app/router/app-router-context.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

import type { SessionResolver } from '@/entities/session';
import type { HttpClient } from '@/shared/api';

export interface AppRouterContext {
  readonly httpClient: HttpClient;
  readonly queryClient: QueryClient;
  readonly sessionResolver: SessionResolver;
}
```

- `src/app/routes/__root.tsx` declares the root route with
  `createRootRouteWithContext<AppRouterContext>()`, so every route's `beforeLoad` and `loader`
  receive `context` typed, and `createRouter` rejects a call without a `context` option.
  `CreateAppRouterOptions.context` is required as well. The same module supplies that route's
  `component` and `notFoundComponent`: `NotFoundPage` from `@/pages/not-found`, and `RootLayout`,
  which is no longer a bare `<Outlet />` beside `TanStackRouterDevtools`. It now renders real
  markup — `<AppHeader appName={appConfig.name} />` above the outlet — which is why `__root.tsx`
  imports `appConfig` from `@/shared/config`, as `src/app/routes/index.tsx` already does for the
  home page. Everything a visitor sees on every screen is mounted there ([Routing](./routing.md)).
- Every field is required. `sessionStarter` and `sessionEnder` are absent on purpose: no guard or
  loader starts or ends a session, and their only callers — `useSignIn` in `features/sign-in` and
  `useSignOut` in `features/sign-out` — read them from React context ([Sign-in](./sign-in.md),
  [Sign-out](./sign-out.md)).

### Segment-internal modules

Declared in `create-authenticated-transport.ts` and `clear-cache-on-session-end.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

import type {
  SessionEnder,
  SessionObserver,
  SessionResolver,
  SessionStarter,
} from '@/entities/session';
import type { HttpClient } from '@/shared/api';

export interface AuthenticatedTransport {
  readonly httpClient: HttpClient;
  readonly sessionEnder: SessionEnder;
  readonly sessionObserver: SessionObserver;
  readonly sessionResolver: SessionResolver;
  readonly sessionStarter: SessionStarter;
}

export declare function createAuthenticatedTransport(baseUrl: string): AuthenticatedTransport;

export type CacheResetTarget = Pick<QueryClient, 'clear'>;

export declare function clearCacheOnSessionEnd(
  session: SessionObserver,
  cache: CacheResetTarget,
): () => void;
```

| Component           | Module                    | Contract                                                                                                                                                             |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App`               | `app.tsx`                 | No props. The only reader of `appConfig` in `app/entrypoint` and the only component that renders `AppProviders`                                                      |
| `AppProviders`      | `app-providers.tsx`       | Props `{ readonly apiBaseUrl: string; readonly queryErrorHandlers: QueryErrorHandlers; readonly children: ReactNode }`; the first two are read once, by initializers |
| `AppRouterProvider` | `app-router-provider.tsx` | No props. Must render below `QueryClientProvider`, `HttpClientProvider` and `SessionResolverProvider`, or its hooks throw                                            |

The error-reporting bindings — `reportError`, `createRenderErrorHandler`,
`createQueryErrorHandlers`, `QueryErrorHandlers` and `AppCrashFallback` — are specified in
[Error handling and reporting](./error-handling.md#composition-root-bindings).

## Configuration

The composition root reads one environment variable, through `appConfig`, and fixes everything else
in code.

| Variable / option                                                         | Default                                                            | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL`, read into `appConfig.apiBaseUrl`                     | `/v1`; a blank or whitespace-only value also falls back            | The API base URL. `App` passes it to `AppProviders` as `apiBaseUrl` ([Configuration and environment](./configuration.md))                                                                                                                                                                                                                                                                                                                              |
| `apiBaseUrl` (`AppProviders` prop)                                        | Required                                                           | Handed to `createAuthenticatedTransport` inside a `useState` initializer, so it is read once: a later change does not rebuild the transport                                                                                                                                                                                                                                                                                                            |
| `sendCookies` (`createHttpClient`, unauthenticated client)                | `true`, overriding the `false` default                             | Lets the unauthenticated client send and receive cookies on the `/auth/refresh`, `/auth/login` and `/auth/logout` exchanges; set in `create-authenticated-transport.ts`. `signOut` shares the client `refresh` uses because only it sends the refresh cookie, and no type says so — `create-authenticated-transport.test.ts` asserts it by expecting no `authorization` header on `/auth/logout` ([HTTP transport](./http-transport.md#configuration)) |
| `bearerTokenSource` (`createHttpClient`, authenticated client)            | The `SessionTokenSource`; the option is otherwise unset            | Installs the `attachBearerToken` interceptors, so only the authenticated client carries the token and its renew-once-on-`401` replay ([Session management](./session-management.md))                                                                                                                                                                                                                                                                   |
| `queryErrorHandlers` (`AppProviders` prop)                                | Required; `app.tsx` passes `createQueryErrorHandlers(reportError)` | Becomes the options object of `createQueryClient`, read once in the same way ([Error handling and reporting](./error-handling.md#configuration))                                                                                                                                                                                                                                                                                                       |
| `appName` (`AppHeader` prop)                                              | Required; `__root.tsx` passes `appConfig.name`                     | The name the app-shell banner displays. `appConfig.name` is the constant `'frontend-boilerplate'` in `src/shared/config/app-config.ts`, not an environment variable; it is read on every render, not captured in an initializer ([Configuration and environment](./configuration.md))                                                                                                                                                                  |
| `defaultOptions` (`createQueryClient`)                                    | Not passed                                                         | The factory's cache and retry defaults apply unchanged ([HTTP transport](./http-transport.md#configuration))                                                                                                                                                                                                                                                                                                                                           |
| `createI18n` options                                                      | None passed                                                        | Locale detection keeps its defaults: the `lng` query parameter, then `app.locale` in `localStorage`, then the browser ([Internationalization](./internationalization.md))                                                                                                                                                                                                                                                                              |
| `initialIsOpen` (`ReactQueryDevtools`)                                    | `false`                                                            | The panel starts collapsed. It renders only when `process.env.NODE_ENV` is `'development'` — under `npm run dev`, never in a `vite build` bundle or under Vitest                                                                                                                                                                                                                                                                                       |
| `createAppRouter` options                                                 | `{ context }` only                                                 | No `history` is passed, so TanStack Router creates a browser history; the routing policy is described in [Routing](./routing.md)                                                                                                                                                                                                                                                                                                                       |
| `ROOT_ELEMENT_ID` (`src/main.tsx`)                                        | `'root'`                                                           | Id of the mount element; must equal the `id` of the `<div>` in `index.html`                                                                                                                                                                                                                                                                                                                                                                            |
| Entry script (`index.html`)                                               | `/src/main.tsx`                                                    | The module Vite starts from, in development and at build time                                                                                                                                                                                                                                                                                                                                                                                          |
| `paths` (`tsconfig.app.json`), `resolve.tsconfigPaths` (`vite.config.ts`) | `"@/*": ["./src/*"]`; `true`                                       | Resolve `@/app` and every other `@/…` specifier, for `tsc` and for Vite                                                                                                                                                                                                                                                                                                                                                                                |

## Usage & extension

### Reach a published port

- In a component or hook below `app`, call the port's hook: `useHttpClient()`,
  `useSessionResolver()`, `useSessionStarter()`, `useSessionEnder()`, `useTranslation()`. TanStack
  Query's hooks find the client through `QueryClientProvider` on their own.
- In a route's `beforeLoad` or `loader`, destructure `context`, as
  `src/app/routes/_authenticated.tsx` and `src/app/routes/_authenticated/users.$userId.tsx` do.
- Never construct a client outside `app/entrypoint`. Importing `createHttpClient` from
  `@/shared/api` in `app/router`, for example, fails `npm run lint` with _Route and router modules
  receive the transport through the router context. Only app/entrypoint constructs clients._

### Add a provider-backed seam

A provider-backed seam is a port that code below `app` reads from React context. The steps below
add a hypothetical product-analytics tracker; the code compiles, passes `npm run lint` and
`npm run arch`, and keeps the `app` tests green. Each step mirrors an existing binding.

1. **Declare the port, its context and its provider in the owning segment.** A tracker belongs to no
   business noun, so it becomes a new `shared` segment, flat at its root like `shared/observability`.
   The port is a function type, the repo's idiom for a single-operation collaborator
   (`ErrorReporter`, `SessionListener`), in `src/shared/analytics/analytics-tracker.ts`:

   ```ts
   export interface AnalyticsEvent {
     readonly name: string;
     readonly properties: Readonly<Record<string, string>>;
   }

   export type AnalyticsTracker = (event: AnalyticsEvent) => void;
   ```

   The context and its hook go in `analytics-tracker-context.ts` and the provider in
   `analytics-tracker-provider.tsx`, two files because `react-refresh/only-export-components`
   rejects a component exported beside a hook — the split `src/shared/api/http-client-context.ts`
   and `http-client-provider.tsx` already make:

   ```ts
   import { createContext, use } from 'react';

   import type { AnalyticsTracker } from './analytics-tracker';

   export const AnalyticsTrackerContext = createContext<AnalyticsTracker | null>(null);

   export function useAnalyticsTracker(): AnalyticsTracker {
     const analyticsTracker = use(AnalyticsTrackerContext);

     if (analyticsTracker === null) {
       throw new Error('useAnalyticsTracker must be called inside an AnalyticsTrackerProvider');
     }

     return analyticsTracker;
   }
   ```

   ```tsx
   import type { ReactNode } from 'react';

   import type { AnalyticsTracker } from './analytics-tracker';
   import { AnalyticsTrackerContext } from './analytics-tracker-context';

   interface AnalyticsTrackerProviderProps {
     readonly analyticsTracker: AnalyticsTracker;
     readonly children: ReactNode;
   }

   export function AnalyticsTrackerProvider({
     analyticsTracker,
     children,
   }: AnalyticsTrackerProviderProps) {
     return <AnalyticsTrackerContext value={analyticsTracker}>{children}</AnalyticsTrackerContext>;
   }
   ```

   A concrete adapter, `create-beacon-analytics-tracker.ts`, posts each event to a collector
   endpoint without a dependency:

   ```ts
   import type { AnalyticsTracker } from './analytics-tracker';

   export function createBeaconAnalyticsTracker(endpoint: string): AnalyticsTracker {
     return (event) => {
       const body = new Blob([JSON.stringify(event)], { type: 'application/json' });

       navigator.sendBeacon(endpoint, body);
     };
   }
   ```

   The barrel, `src/shared/analytics/index.ts`, exports the port, the hook, the provider and the
   factory — not the context object, so the hook and its check are the only way to read it:

   ```ts
   export type { AnalyticsEvent, AnalyticsTracker } from './analytics-tracker';
   export { useAnalyticsTracker } from './analytics-tracker-context';
   export { AnalyticsTrackerProvider } from './analytics-tracker-provider';
   export { createBeaconAnalyticsTracker } from './create-beacon-analytics-tracker';
   ```

2. **Fence the constructor.** In `eslint.config.js`, append a construction ban to
   `LOWER_LAYER_IMPORT_PATHS`, which covers the five layers below `app`:

   ```js
   {
     name: '@/shared/analytics',
     importNames: ['createBeaconAnalyticsTracker'],
     message:
       'Construct the analytics tracker only in the app layer. Reach it with useAnalyticsTracker().',
   },
   ```

   Add the same entry, with a message addressed to route modules, to the `paths` of the
   `src/app/{routes,router}/**` block, which does not spread that list. steiger — the FSD
   architecture linter `npm run arch` runs over `./src` — skips same-layer imports, so a deep
   import from another `shared` segment needs a lint pattern too; add this one to
   `LOWER_LAYER_IMPORT_PATTERNS` and to the `patterns` of the routes and router block, beside
   `^@/shared/observability/`:

   ```js
   {
     regex: '^@/shared/analytics/',
     message: 'Import the segment public API: @/shared/analytics.',
   },
   ```

   The ban names the factory rather than the whole path, as `createI18n` is banned on
   `@/shared/i18n`, because lower layers must still import `useAnalyticsTracker`.
   [Architecture boundaries](./architecture-boundaries.md) explains the block order these entries
   sit in.

3. **Name the concrete in one composition-root module**, as `app-error-reporter.ts` names the error
   sink. The tracker holds no state, so it is built once at module scope in
   `src/app/entrypoint/app-analytics-tracker.ts`:

   ```ts
   import { createBeaconAnalyticsTracker } from '@/shared/analytics';

   const ANALYTICS_COLLECTOR_URL = '/v1/analytics-events';

   export const trackEvent = createBeaconAnalyticsTracker(ANALYTICS_COLLECTOR_URL);
   ```

   `ANALYTICS_COLLECTOR_URL` names a collector you operate; nothing in this repository serves it. A
   concrete that owns live state — a cache, a connection, a token — is built instead in a
   `useState` lazy initializer inside `AppProviders`, beside the transport, the query client and
   the i18n instance; one that needs the transport or the session is built inside
   `createAuthenticatedTransport`, so it shares their instances.

4. **Hand it to `AppProviders` and publish it.** `App` passes the tracker down as a prop, the way it
   passes `queryErrorHandlers`, which keeps `AppProviders` testable with a stub:

   ```tsx
   import { appConfig } from '@/shared/config';
   import { ErrorBoundary } from '@/shared/ui/error-boundary';

   import { AppRouterProvider } from '../router/app-router-provider';

   import { trackEvent } from './app-analytics-tracker';
   import { AppCrashFallback } from './app-crash-fallback';
   import { reportError } from './app-error-reporter';
   import { AppProviders } from './app-providers';
   import { createQueryErrorHandlers } from './create-query-error-handlers';
   import { createRenderErrorHandler } from './create-render-error-handler';

   import '../styles/index.css';

   const handleRenderError = createRenderErrorHandler(reportError);
   const queryErrorHandlers = createQueryErrorHandlers(reportError);

   export function App() {
     return (
       <ErrorBoundary FallbackComponent={AppCrashFallback} onError={handleRenderError}>
         <AppProviders
           apiBaseUrl={appConfig.apiBaseUrl}
           queryErrorHandlers={queryErrorHandlers}
           analyticsTracker={trackEvent}
         >
           <AppRouterProvider />
         </AppProviders>
       </ErrorBoundary>
     );
   }
   ```

   `AppProviders` declares the prop and nests the provider directly around `{children}`:

   ```tsx
   import { QueryClientProvider } from '@tanstack/react-query';
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
   import { Suspense, useEffect, useState } from 'react';
   import type { ReactNode } from 'react';

   import {
     SessionEnderProvider,
     SessionResolverProvider,
     SessionStarterProvider,
   } from '@/entities/session';
   import { AnalyticsTrackerProvider } from '@/shared/analytics';
   import type { AnalyticsTracker } from '@/shared/analytics';
   import { createQueryClient, HttpClientProvider } from '@/shared/api';
   import { createI18n, I18nProvider } from '@/shared/i18n';

   import { clearCacheOnSessionEnd } from './clear-cache-on-session-end';
   import { createAuthenticatedTransport } from './create-authenticated-transport';
   import type { QueryErrorHandlers } from './create-query-error-handlers';

   interface AppProvidersProps {
     readonly apiBaseUrl: string;
     readonly queryErrorHandlers: QueryErrorHandlers;
     readonly analyticsTracker: AnalyticsTracker;
     readonly children: ReactNode;
   }

   export function AppProviders({
     apiBaseUrl,
     queryErrorHandlers,
     analyticsTracker,
     children,
   }: AppProvidersProps) {
     const [transport] = useState(() => createAuthenticatedTransport(apiBaseUrl));
     const [queryClient] = useState(() => createQueryClient(queryErrorHandlers));
     const [i18n] = useState(() => createI18n());

     useEffect(
       () => clearCacheOnSessionEnd(transport.sessionObserver, queryClient),
       [transport, queryClient],
     );

     return (
       <QueryClientProvider client={queryClient}>
         <Suspense fallback={null}>
           <I18nProvider i18n={i18n}>
             <HttpClientProvider client={transport.httpClient}>
               <SessionResolverProvider sessionResolver={transport.sessionResolver}>
                 <SessionStarterProvider sessionStarter={transport.sessionStarter}>
                   <SessionEnderProvider sessionEnder={transport.sessionEnder}>
                     <AnalyticsTrackerProvider analyticsTracker={analyticsTracker}>
                       {children}
                     </AnalyticsTrackerProvider>
                   </SessionEnderProvider>
                 </SessionStarterProvider>
               </SessionResolverProvider>
             </HttpClientProvider>
           </I18nProvider>
         </Suspense>
         <ReactQueryDevtools initialIsOpen={false} />
       </QueryClientProvider>
     );
   }
   ```

   Where a new provider goes follows from the order rules under
   [Design decisions & trade-offs](#design-decisions--trade-offs): inside `Suspense` and
   `I18nProvider`; directly around `{children}` when its value comes from `AppProviders` itself;
   inside another port's provider when its own component calls that port's hook.

5. **Test the wiring.** Add a case to `src/app/entrypoint/app-providers.test.tsx`, beside
   `provides the transport session resolver to its children`, importing `useAnalyticsTracker` and
   the `AnalyticsTracker` type from `@/shared/analytics`:

   ```tsx
   it('provides the analytics tracker to its children', () => {
     const analyticsTracker = vi.fn();
     const captured: { tracker: AnalyticsTracker | null } = { tracker: null };

     function TrackerProbe() {
       captured.tracker = useAnalyticsTracker();

       return null;
     }

     render(
       <AppProviders
         apiBaseUrl="/api"
         queryErrorHandlers={createQueryErrorHandlersFake()}
         analyticsTracker={analyticsTracker}
       >
         <TrackerProbe />
       </AppProviders>,
     );

     expect(captured.tracker).toBe(analyticsTracker);
   });
   ```

   The prop is required, so the file's eight existing renders stop type-checking until each passes
   `analyticsTracker={vi.fn()}`. The new segment's modules need co-located tests of their own —
   `vite.config.ts` enforces 90 % coverage per file: mirror
   `src/shared/api/http-client-provider.test.tsx` for the provider and the hook, and stub
   `navigator.sendBeacon`, which jsdom does not implement, for the adapter.

Everything reachable from `src/main.tsx` through static imports is fetched when the page starts;
`autoCodeSplitting` moves only route components into chunks of their own. A new seam's modules, and
any SDK its adapter imports, therefore join the startup download.

### Hand a port to guards and loaders

Add a port to the router context only when a `beforeLoad` or a `loader` has to call it; components
keep reading React context
([Add a member to the router context](./routing.md#add-a-member-to-the-router-context)). For the
tracker, add a required field to `src/app/router/app-router-context.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

import type { SessionResolver } from '@/entities/session';
import type { AnalyticsTracker } from '@/shared/analytics';
import type { HttpClient } from '@/shared/api';

export interface AppRouterContext {
  readonly httpClient: HttpClient;
  readonly queryClient: QueryClient;
  readonly sessionResolver: SessionResolver;
  readonly analyticsTracker: AnalyticsTracker;
}
```

and read it back in `src/app/router/app-router-provider.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';

import { useSessionResolver } from '@/entities/session';
import { useAnalyticsTracker } from '@/shared/analytics';
import { useHttpClient } from '@/shared/api';

import type { AppRouterContext } from './app-router-context';
import { createAppRouter } from './create-app-router';

export function AppRouterProvider() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();
  const sessionResolver = useSessionResolver();
  const analyticsTracker = useAnalyticsTracker();
  const context: AppRouterContext = { httpClient, queryClient, sessionResolver, analyticsTracker };
  const [router] = useState(() => createAppRouter({ context }));

  return <RouterProvider router={router} context={context} />;
}
```

A route then calls `context.analyticsTracker` inside `beforeLoad` or `loader`. The required field
turns every hand-built context into a compile error until it supplies the port: the objects passed
to `createAppRouter` in `src/app/router/create-app-router.test.tsx`,
`src/app/routes/_authenticated.test.tsx`, `src/app/routes/sign-in.test.tsx` and
`src/app/routes/_authenticated/users.$userId.test.tsx`. The harness in
`src/app/router/app-router-provider.test.tsx` must also mount `AnalyticsTrackerProvider`, or
`useAnalyticsTracker()` throws. `createAppRouter` sets `defaultPreload: 'intent'`, so `beforeLoad`
and `loader` also run when a visitor hovers a link — a port called there is called for preloads that
never become navigations.

### Swap an implementation

Swapping a concrete means editing the one module that names it; its consumers do not change. The
error sink is the common case. With the scrubbing beacon adapter from
[Error handling and reporting](./error-handling.md#swap-the-console-for-a-real-sink) in
`src/app/entrypoint/create-beacon-error-reporter.ts`, the binding in `app-error-reporter.ts` can
also choose the sink by build mode, which is configuration read at the composition root:

```ts
import { appConfig } from '@/shared/config';
import { createConsoleErrorReporter, toSafeErrorReporter } from '@/shared/observability';

import { createBeaconErrorReporter } from './create-beacon-error-reporter';

const ERROR_COLLECTOR_URL = '/v1/client-errors';

export const reportError = toSafeErrorReporter(
  appConfig.mode === 'production'
    ? createBeaconErrorReporter(ERROR_COLLECTOR_URL)
    : createConsoleErrorReporter(),
);
```

`vite build` runs in `production` mode and Vitest in `test` mode, so production sends reports while
the dev server and the suite keep the console sink — and `app.test.tsx`, which asserts the console
line `error reported from render`, stays green. The sink is constructed while
`app-error-reporter.ts` is evaluated, before `createRoot(rootElement).render()` runs, and
`toSafeErrorReporter` guards calls into the sink, not its construction: an SDK whose setup can throw
would stop the application before it mounts, so keep the construction infallible.

Other bindings swap the same way: a different credential source is passed as `bearerTokenSource`
in `create-authenticated-transport.ts`
([HTTP transport](./http-transport.md#implement-a-bearertokensource)), and the tests swap bindings
without editing source, as [Testing](#testing) shows.

### React to a session transition

A policy that must run when the session changes is a subscriber like `clearCacheOnSessionEnd`,
subscribed in its own `useEffect` in `AppProviders` that returns the unsubscribe.
[Session management](./session-management.md#react-to-a-session-transition) gives the template.

### Move the mount element

Change `ROOT_ELEMENT_ID` in `src/main.tsx` and the `id` of the `<div>` in `index.html` together.
`src/main.test.ts` creates a `div` with the id `root` and asserts the guard's message, so update it
in the same change. The `<title>` in `index.html` is a static `frontend-boilerplate`; nothing derives
it from `appConfig.name` or translates it.

## Design decisions & trade-offs

- **No dependency-injection container.** backend-boilerplate registers its dependency graph in an
  Awilix container (`src/container.ts`, `src/composition/`); this frontend has no counterpart.
  React context is the lookup for components and hooks, `AppRouterContext` for code outside React,
  and plain arguments for everything else. What that buys: lifetimes follow React, so resetting the
  root boundary remounts `AppProviders` and `AppRouterProvider` and rebuilds every client with no
  disposal code; every binding is checked by the compiler at the site that makes it — a provider's
  prop type, a required `AppRouterContext` field — rather than resolved by key at run time; and a
  test replaces a binding by rendering a provider with a stub. The cost is manual wiring: a new seam
  edits `AppProviders`, and `AppRouterContext` when routes need it, and the provider tree deepens by
  one level per seam.
- **Each context lives with its port, not in `app`.** `HttpClientProvider` is in `shared/api`
  ([HTTP transport](./http-transport.md)), `I18nProvider` in `shared/i18n`, the session pairs in
  `entities/session`; the composition root only mounts them. A module imports only from layers
  below its own, so a hook in `features` could never import a context declared in `app`.
- **Factories, never module singletons.** Every client is built by a factory that takes plain
  values: the base URL arrives as a string, and only `src/shared/config` reads `import.meta.env`
  ([Configuration and environment](./configuration.md)).
  `AppProviders` receives `apiBaseUrl` and `queryErrorHandlers` as props instead of importing them,
  which is why its test renders it with `apiBaseUrl="/api"` and two `vi.fn()` handlers. A
  module-level client would instead be built at import time — before any boundary exists, and
  before a test could hand it another value.
- **Clients live in `useState` lazy initializers, not `useMemo`.** A lazy initializer runs once per
  mount, so the identity of each client is stable for the component's lifetime. `useMemo` would not
  do: React may discard a memoized value, and each of these owns live state — the transport its
  interceptor chain and, through the session store, the in-memory access token; the query client
  its cache; the i18n instance its language and loaded namespaces. The same reasoning holds the
  router in `AppRouterProvider`.
- **Stateless adapters live at module scope.** `reportError`, `handleRenderError` and
  `queryErrorHandlers` hold no state, so module scope gives them a stable identity with no
  `useMemo` or `useCallback`. They also have to exist above the providers: the root boundary's
  `onError` sits outside `AppProviders`, so nothing inside the tree could supply it. The trade-off
  is timing — module-scope code runs during import, before any boundary exists.
- **The root boundary wraps the providers.** A boundary inside `AppProviders` could not catch a
  throw from its own initializers, so `ErrorBoundary` sits in `app.tsx`, above everything it
  protects. As a result `AppCrashFallback` renders without a provider, which is why its copy is
  hard-coded English ([Error handling and reporting](./error-handling.md)).
- **The provider order follows from what reads what.** `AppRouterProvider`, the child, calls
  `useHttpClient()`, `useQueryClient()` and `useSessionResolver()`, so all three providers must
  enclose `children`; the pages it renders also need `I18nProvider`, `SessionStarterProvider` and
  `SessionEnderProvider`.
  `QueryClientProvider` is outermost because `ReactQueryDevtools` reads the same client from
  context and sits beside the application rather than inside it, outside `Suspense`, so a suspended
  subtree never takes the devtools with it. `Suspense` wraps `I18nProvider` and everything beneath
  as a backstop: react-i18next suspends while a namespace loads, TanStack Router's `Matches` wraps
  the route tree in its own `Suspense`, and this boundary catches whatever suspends above that one.
  Nothing does today — `DocumentLocaleSync` reads `useLocale()`, which opts out with
  `useSuspense: false` ([Internationalization](./internationalization.md)). The five providers
  inside it — `I18nProvider`, `HttpClientProvider`, `SessionResolverProvider`,
  `SessionStarterProvider` and `SessionEnderProvider` — read nothing from one another's context,
  since every value comes from `AppProviders`' own state, so their relative order is not
  load-bearing; what matters is that all of them enclose `children`. They nest the i18n instance
  first and then the transport's values — client, resolver, starter, ender — a convention rather
  than a constraint: `AuthenticatedTransport` lists `sessionEnder` second, alphabetically, while
  `SessionEnderProvider` is nested innermost.
- **`AppRouterProvider` bridges React context into the router context.** It lives in `app/router`,
  apart from `AppProviders`, so transport wiring and routing wiring stay separately replaceable,
  and it has to render below the providers to call their hooks. `useState` captures its
  initializer's `context` once, so the context is also passed as a prop: `RouterProvider` forwards
  extra props to `router.update()`, merging `context`, on every render. Without the prop the router
  would hand loaders whichever instances existed at first render, forever. Every field of
  `AppRouterContext` is required because an optional one would let a guard whose dependency is
  merely absent fail open — worse than a member that unguarded routes carry and never call.
- **The cache policy is subscribed where both halves live.** `AppProviders` is the one component
  that holds both the session observer and the query client, so the subscription is its effect. The
  effect returns the unsubscribe, so `StrictMode`'s development-only unmount and remount leaves
  exactly one subscription, and its dependencies come from `useState`, so it subscribes once per
  mount. Subscribing after the first commit misses nothing: the session starts `unknown`, every
  transition waits on a network response, and the policy acts only on leaving `authenticated`. It
  is a subscriber rather than a call at each place a session ends: an expired refresh and
  `SessionEnder.signOut()` both end one through the same `store.end()` transition, so adding
  sign-out needed no cache code at all ([Session management](./session-management.md)).
- **`src/main.tsx` sits outside the layers, so ESLint fences it.** steiger does not analyse it, and
  the `no-restricted-imports` block for `src/main.tsx` stands in: `@/app` is the only `@/` path it
  may import (pattern `['@/**', '!@/app', './*/**', '../**']`), relative imports that reach into a
  directory are banned outright, and so is `react-error-boundary`. Code placed there would escape
  both steiger and the root boundary, so it does only what nothing else can: find `#root` and mount
  `App`.
- **The `#root` guard fails fast and names the fix.** Without it `createRoot(null)` would throw
  React's generic `Target container is not a DOM element.`; the guard names the element and the
  file instead, and narrows `HTMLElement | null` for the compiler without a non-null assertion.
- **`StrictMode` wraps the whole application.** In development it renders each component an extra
  time, calls each `useState` initializer twice and keeps one result, and on mount runs every
  effect's setup, cleanup and setup again; a production build is unaffected. That puts two rules on
  anything the composition root constructs: a factory must tolerate a discarded twin, so nothing
  that must happen exactly once belongs in it, and every subscription must return its cleanup, as
  `clearCacheOnSessionEnd` does.
- **The global stylesheet is imported by `app.tsx`.** A side effect belongs in the module that owns
  it — here the component that needs the styles, so anything rendering `App` gets them. The `app`
  barrel re-exports and does not execute, and `src/main.tsx` imports only `@/app`; its pattern
  rejects `./app/styles/index.css` outright.
- **Devtools ship with no guard.** `@tanstack/react-query-devtools` sits in `dependencies` and
  `ReactQueryDevtools` is imported unconditionally. The package's entry resolves to a component that
  returns `null` whenever `process.env.NODE_ENV !== 'development'`, which the production bundler
  eliminates, so no lazy import and no `import.meta.env.DEV` check is needed. A production build
  contains no devtools code: after `npm run build`, `grep -l query-devtools dist/assets/*.js` finds
  nothing. The router's devtools, mounted in `src/app/routes/__root.tsx`, work the same way
  ([Routing](./routing.md#design-decisions--trade-offs)).

## Testing

Every composition-root module that carries behaviour has a co-located test (see
[Unit and component testing](./unit-testing.md)); the two without one are `app-error-reporter.ts`,
a single binding expression, and `app-router-context.ts`, an interface:

| Test file                                                                                                                      | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.test.ts`                                                                                                             | `throws when #root is missing` with the guard's exact message; `renders the app when #root exists`, waiting for the `frontend-boilerplate` heading                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/entrypoint/app.test.tsx`                                                                                              | The real composition root renders the home page; a cold load with `app.locale` set to `ru` renders the Russian button and sets `<html lang="ru">` ([Internationalization](./internationalization.md)); the mounted tree exposes a `banner` carrying `frontend-boilerplate`; clicking `Русский` inside that banner switches the home page's copy and `document.documentElement.lang` to `ru`; a provider construction failure shows the crash heading and reaches the console sink as `error reported from render` |
| `src/app/entrypoint/app-providers.test.tsx`                                                                                    | Children render; the query client carries the configured `staleTime` of `30_000` and the HTTP client is usable; one HTTP client instance across re-renders; the cache clears when the session ends; the transport's starter, resolver and ender reach children; a query failure reaches the injected `onQueryError`                                                                                                                                                                                               |
| `src/app/router/app-router-provider.test.tsx`                                                                                  | `creates the router once across re-renders`, under a hand-built provider stack                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/app/router/create-app-router.test.tsx`                                                                                    | `stores the injected dependencies on the router context` — the `httpClient`, `queryClient` and `sessionResolver` passed to `createAppRouter` come back off `router.options.context` by identity; the file's remaining cases assert the routing policy ([Routing](./routing.md))                                                                                                                                                                                                                                   |
| `src/app/entrypoint/clear-cache-on-session-end.test.ts`                                                                        | Clears when an authenticated session ends and when a different session replaces it; leaves the cache alone when the first session starts and when a bootstrap refresh finds no session; stops after the returned unsubscribe                                                                                                                                                                                                                                                                                      |
| `src/app/entrypoint/create-authenticated-transport.test.ts`                                                                    | The two-client composition end to end through MSW, including the two sign-out cases that pin the cookie-client rule — `/auth/logout` arrives with no `authorization` header, and a `500` there still leaves the observer `anonymous` ([Session management](./session-management.md), [HTTP transport](./http-transport.md))                                                                                                                                                                                       |
| `src/app/entrypoint/app-crash-fallback.test.tsx`, `create-render-error-handler.test.ts`, `create-query-error-handlers.test.ts` | The crash screen and the two reporting adapters ([Error handling and reporting](./error-handling.md))                                                                                                                                                                                                                                                                                                                                                                                                             |

Two of those cases — `renders the application header with the configured name` and
`switches the application language from the app-shell header` — are journey tests rather than unit
tests, and they sit at the `app` layer on purpose. Mounting `<AppHeader />` in
`src/app/routes/__root.tsx` opens a gap no slice-level test can close: delete that one line and
`src/widgets/app-header/ui/app-header.test.tsx` and
`src/features/switch-locale/ui/locale-switcher.test.tsx` still pass, because each renders its own
component directly; `RootLayout` is still invoked, so v8 coverage records no loss either. Only the
composition seam itself is affected, and `app` is the only layer that exercises it. Deleting the
line fails exactly those two tests and nothing else.

Their reach is narrower than it looks, which is worth stating plainly:

- `renders the application header with the configured name` renders `/` and asserts that the
  `banner` has the text content `frontend-boilerplate`. The expected string is hard-coded in the
  test, so it does **not** prove the `appName={appConfig.name}` wiring — a literal in `__root.tsx`
  would pass it too. What it pins is that the shell is mounted at all.
- `switches the application language from the app-shell header` drives a real click with
  `userEvent`, then asserts both that the home page's button becomes `Добавить секунду` and that
  `document.documentElement.lang` becomes `ru`. That copy is the `addOneSecond` key of the `home`
  namespace, which `BUNDLED_RESOURCES` ships for `en` but not for `ru`, so passing it means the
  namespace was fetched lazily at run time ([Internationalization](./internationalization.md)). The
  case is forced to this layer for a second reason as well: `no-restricted-imports` bans
  `createI18n` from `@/shared/i18n` in every layer below `app`, and in `app/routes` and `app/router`
  besides, so a slice-level test cannot construct the instance this assertion needs — rendering the
  real `App` is how it gets one ([Architecture boundaries](./architecture-boundaries.md)).

The techniques are worth copying when a test needs to swap a binding:

- **A module whose work happens at evaluation is imported, not rendered.** `main.test.ts` drives
  `src/main.tsx` through `import('./main')` and calls `vi.resetModules()` in `afterEach`, so each
  case evaluates the module afresh. React 19 roots flush asynchronously, and mounting the router
  makes the first route match asynchronous too, so the mount case wraps the import in `act()` and
  the assertion in `waitFor`.
- **A factory is swapped per test.** `app-providers.test.tsx` wraps the real
  `createAuthenticatedTransport` in `vi.fn` through `vi.mock(import('./create-authenticated-transport'))`,
  and a case that needs control calls `vi.mocked(createAuthenticatedTransport).mockReturnValueOnce()`
  with a hand-rolled transport whose session it can move.
- **A whole provider is swapped for one case.** The boundary case in `app.test.tsx` replaces
  `./app-providers` with a throwing component through `vi.doMock`, `vi.resetModules` and a dynamic
  import of `./app`, and unmocks in `afterEach`; a hoisted `vi.mock` would replace the providers for
  the file's other cases too. Deleting the `ErrorBoundary` from `app.tsx` fails this case.
- **A provider stack is built by hand.** `app-router-provider.test.tsx` renders `QueryClientProvider`,
  `HttpClientProvider` and `SessionResolverProvider` around `AppRouterProvider` with inert stubs, so
  the router test needs no transport at all. Those three are what `AppRouterProvider`'s own hooks
  need; a test that renders a _route_ also needs whatever the screen behind it reads, and the hook
  throws rather than degrading when a provider is missing. `_authenticated/users.$userId.test.tsx`
  is the worked example: `SessionEnderProvider`, because `/users/$userId` renders
  `UserProfilePage`, which renders `SignOutButton`, whose `useSignOut` hook calls
  `useSessionEnder()`; and `SessionStarterProvider` around it, because the sign-out case follows the
  redirect to `/sign-in`, whose form reaches `useSessionStarter()` through `useSignIn`.
  `_authenticated.test.tsx` wraps both for the same reason.

`vite.config.ts` measures every `src/**/*.{ts,tsx}` file except tests, `.d.ts` files and the
generated route tree, at 90 % per file, so `src/main.tsx` counts, and `main.test.ts` is what keeps
it covered. The barrel `src/app/index.ts` is measured too; a pure re-export leaves nothing
uncovered.
End to end, both Playwright specs load the production build through `index.html` and its hashed
entry chunk: `e2e/app-shell.spec.ts` and `e2e/user-profile.spec.ts` ([End-to-end testing](./e2e-testing.md)).

```sh
npm test
npx vitest run src/main.test.ts src/app/entrypoint src/app/router
npm run test:coverage
npm run test:e2e
```

## Known limitations

- **The vendor fences stop at the composition root.** In `app/entrypoint` only the generic
  `src/**` block applies, and of the vendor fences it carries only `react-error-boundary`: `axios`,
  the i18next packages and `@tanstack/react-form` import there without a lint error. `src/main.tsx`
  admits any bare package except `react-error-boundary` — `import axios from 'axios'` passes.
  steiger still rejects a deep import from `app/entrypoint` into another layer's segment, such as
  `@/shared/api/http-client`.
- **The barrel rule admits side-effect imports.** `no-restricted-syntax` on `src/**/index.ts`
  allows every `import` declaration, so `import './styles/index.css'` in `src/app/index.ts` would
  pass lint. Keeping the stylesheet in `app.tsx` rather than the barrel is a convention.
- **Failures before the tree exists are not reported.** The `#root` guard, and any throw during
  module evaluation, happen before a boundary exists, and `src/main.tsx` passes no `onCaughtError`,
  `onUncaughtError` or `onRecoverableError` to `createRoot`; these errors reach only the browser's
  defaults ([Error handling and reporting](./error-handling.md#known-limitations)).
- **Some wiring is unasserted.** Identity across re-renders is tested for the HTTP client and the
  router only, not for the query client or the i18n instance. No test asserts the provider order,
  no test suspends above the router, so the `Suspense` fallback is never rendered in the suite, and
  no gate checks that devtools stay out of the production bundle. Nothing asserts that the banner's
  `appName` comes from `appConfig.name` rather than from a literal, either: both
  `src/app/entrypoint/app.test.tsx` and `src/widgets/app-header/ui/app-header.test.tsx` compare
  against the string `frontend-boilerplate`, which `appConfig.name` happens to equal.
