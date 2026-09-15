# Authenticated route guard

> **Status:** Complete · **Layers:** app, pages, entities, shared, outside layers · **Verified against:** `1c193c6`

## Purpose

A private screen is only useful to a signed-in visitor, and a single-page app has to establish that
before it renders the screen: without a guard, a signed-out visitor opening `/users/u_1` got the
profile shell, a request with no bearer token, a wasted refresh round trip and a dead "This profile
could not be loaded." page with no way to sign in. The route guard asks the session one question
before any private screen loads — _may this navigation proceed?_ — and sends every visitor it cannot
confirm to `/sign-in`, which makes protecting a screen a matter of where its route file lives. It is
a user-experience boundary, not a security boundary: the API must still authorize every request on
its own.

## How it works

**Wiring, once at bootstrap.** `AppProviders` (`src/app/entrypoint/app-providers.tsx`) builds the
transport with `createAuthenticatedTransport(apiBaseUrl)`. One of its outputs is a
`SessionResolver`, created by `createSessionResolver({ settler: sessionTokenSource })` from the same
token-source instance the bearer-token HTTP client reads its token from. `SessionResolverProvider`
publishes the resolver to the React tree, and `AppRouterProvider` reads it back with
`useSessionResolver()` into the router context, `AppRouterContext`. The hand-off exists because a
route's `beforeLoad` runs outside React, where no hook can reach; the router context is the only way
in.

**A navigation into the guarded subtree.** `src/app/routes/_authenticated.tsx` is a _pathless layout
route_: in TanStack Router's file naming, a leading underscore marks a parent route that wraps its
children without adding a URL segment, and this one contributes the guard. Every route module under
`src/app/routes/_authenticated/` is its child and keeps its own URL — today only `/users/$userId`.
When a navigation matches one of them, the router calls `beforeLoad` on each matched route, parent
first, and starts no `loader` until all of them have finished:

1. The layout's `beforeLoad` awaits `context.sessionResolver.resolve()`.
2. `resolve()` delegates to the token source's `settle()`, which
   [Session management](./session-management.md) owns. A status of `authenticated` or `anonymous`
   comes back as it stands, with no request. A status of `unknown` — where every page load starts,
   because the access token lives only in memory — joins the in-flight `POST /auth/refresh`
   (starting it if none is running) and returns the status that refresh leaves in the in-memory
   session store. If the settler rejects, `resolve()` returns `'unknown'` instead of rejecting.
3. While the verdict is pending, the router waits 300 ms (`defaultPendingMs`), renders the layout's
   `pendingComponent`, `ResolvingSessionPage` — a heading reading "Checking your session…" — and
   keeps it on screen for at least 300 ms (`defaultPendingMinMs`). Once the session is settled
   (`authenticated` or `anonymous`) the verdict comes back at once, so the page does not appear
   again.
4. On `'authenticated'`, `beforeLoad` returns and the child route's `loader` and component run.
   Whatever made the session authenticated — this refresh or an earlier sign-in — wrote the token
   into the store the HTTP client's bearer-token interceptor reads, so the first request under the
   guard already carries its `Authorization` header.
5. On anything else — `'anonymous'` or `'unknown'` — `redirect({ to: '/sign-in', throw: true })`
   throws a redirect. The router abandons the matched routes (no loader runs, the guarded screen
   never mounts, no request leaves) and navigates to `/sign-in`, replacing the denied URL in
   history.

Two failure paths matter:

- **The refresh endpoint is down or misbehaving.** Any refresh outcome other than a token or a
  `401` — a 5xx, a dropped connection, a body that fails its schema — leaves the status `unknown`.
  The visitor is turned away but the session is not ended, nothing caches the verdict, and the next
  navigation into the subtree tries the refresh again. A `401` does end the session: the status
  becomes `anonymous`, and every later verdict returns without a request until a sign-in starts a
  new session.
- **A settler that throws.** `createSessionResolver` catches the rejection and reports `'unknown'`,
  so the visitor is redirected rather than shown a route error.

## Architecture

Feature-Sliced Design (FSD) splits `src/` into layers — `app`, `pages`, `widgets`, `features`,
`entities`, `shared`, top to bottom — and a module imports only from layers below its own. A layer
holds _slices_ (one concept each, such as `entities/session`), a slice holds _segments_ named by
purpose (`ui`, `model`, `api`), and code outside a slice reaches it only through its `index.ts`, the
slice's _public API_. The guard depends on one _port_ — the repo's word, used interchangeably with
_seam_, for a type consumers program against while the implementation is chosen elsewhere:
`SessionResolver` in `entities/session`, whose single member is
`resolve: () => Promise<SessionStatus>`. Its one implementation, `createSessionResolver`, is a total
wrapper around the token source's `settle()`. The _composition root_ — `src/app/entrypoint/**`, the
only code that constructs concretes — builds it in `createAuthenticatedTransport` and publishes it
through `SessionResolverProvider` in `AppProviders`; `AppRouterProvider` in `app/router` reads it
back with `useSessionResolver()`, and `_authenticated.tsx` only ever sees `context.sessionResolver`.
The context-and-provider pair mirrors the one that publishes the `SessionStarter`, and ESLint bans
importing `createSessionResolver` in `app/routes`, `app/router` and every layer below `app`, so no
route or page can build a resolver of its own (see
[Architecture boundaries](./architecture-boundaries.md)). Every import points downward:
`app/routes` → `pages/resolving-session` → `shared/i18n`, and `app/entrypoint` and `app/router` →
`entities/session` → `shared`.

| Component                                  | Layer                          | Responsibility                                                                                                                                                                                      | File                                                                               |
| ------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Route` (id `/_authenticated`)             | `app/routes`                   | Pathless layout route: `beforeLoad` asks `context.sessionResolver.resolve()` for a verdict and redirects anything but `'authenticated'` to `/sign-in`; `pendingComponent` is `ResolvingSessionPage` | `src/app/routes/_authenticated.tsx`                                                |
| `AppRouterContext`                         | `app/router`                   | Router context type; its required `sessionResolver` member is how the guard receives the port                                                                                                       | `src/app/router/app-router-context.ts`                                             |
| `AppRouterProvider`                        | `app/router`                   | Reads `useSessionResolver()`, `useHttpClient()` and `useQueryClient()` into the router context                                                                                                      | `src/app/router/app-router-provider.tsx`                                           |
| `createAppRouter`                          | `app/router`                   | Builds the router with the pending and preload policy the guard relies on                                                                                                                           | `src/app/router/create-app-router.ts`                                              |
| `createAuthenticatedTransport`             | `app/entrypoint`               | Constructs the resolver over the token source the authenticated HTTP client also uses                                                                                                               | `src/app/entrypoint/create-authenticated-transport.ts`                             |
| `AppProviders`                             | `app/entrypoint`               | Publishes `transport.sessionResolver` through `SessionResolverProvider`                                                                                                                             | `src/app/entrypoint/app-providers.tsx`                                             |
| `ResolvingSessionPage`                     | `pages/resolving-session · ui` | The pending screen: one `<main>` and one `<h1>` reading `t('session.resolving')`                                                                                                                    | `src/pages/resolving-session/ui/resolving-session-page.tsx`                        |
| `SessionResolver`, `createSessionResolver` | `entities/session · model`     | The port and its total implementation: delegates to `settle()`, turns a rejection into `'unknown'`                                                                                                  | `src/entities/session/model/session-resolver.ts`                                   |
| `useSessionResolver`                       | `entities/session · model`     | Returns the provided resolver; throws outside a `SessionResolverProvider`                                                                                                                           | `src/entities/session/model/session-resolver-context.ts`                           |
| `SessionResolverProvider`                  | `entities/session · model`     | Publishes a `SessionResolver` to its subtree                                                                                                                                                        | `src/entities/session/model/session-resolver-provider.tsx`                         |
| `SessionTokenSource.settle`                | `entities/session · model`     | The settler the resolver wraps: a settled status without a request, one refresh while `unknown` (owned by [Session management](./session-management.md))                                            | `src/entities/session/model/session-token-source.ts`                               |
| `session.resolving`                        | `shared/i18n`                  | The pending page's copy, in `en` and `ru`                                                                                                                                                           | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json` |
| `restoreSession`                           | `outside layers`               | End-to-end stub that answers every `POST /v1/auth/refresh` with a token                                                                                                                             | `e2e/fixtures/session-stub.ts`                                                     |

## Public surface

| Path                                    | Auth            | Purpose                                                                                                  |
| --------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| _(pathless)_ route id `/_authenticated` | —               | The guard itself: a layout route whose children are every module under `src/app/routes/_authenticated/`  |
| `/users/$userId`                        | `authenticated` | The one guarded screen today — see [User profile (read path)](./user-profile.md)                         |
| `/sign-in`                              | `public`        | Where the guard sends every visitor it turns away; nothing links to it yet — see [Sign-in](./sign-in.md) |

`/` and the not-found page are public and never consult the guard.

**`entities/session` — the resolver's part of the slice's public API**
(`src/entities/session/index.ts`):

| Export                    | Kind      | Contract                                                                                                                                                                                                                                                                          |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionResolver`         | type      | The port, `{ readonly resolve: () => Promise<SessionStatus> }`. It hands out a status string, never the token-carrying session state                                                                                                                                              |
| `SessionStatus`           | type      | `SessionState['status']`, the status `resolve()` returns; documented in [Session management](./session-management.md)                                                                                                                                                             |
| `createSessionResolver`   | factory   | `createSessionResolver(options: CreateSessionResolverOptions): SessionResolver`. Its one option, `settler`, is anything exposing the token source's `settle: () => Promise<SessionStatus>`. ESLint rejects importing it in `app/routes`, `app/router` and every layer below `app` |
| `SessionResolverProvider` | component | Props `readonly sessionResolver: SessionResolver` and `readonly children: ReactNode`                                                                                                                                                                                              |
| `useSessionResolver`      | hook      | `useSessionResolver(): SessionResolver`; throws `useSessionResolver must be called inside a SessionResolverProvider` when no provider is above it. Its one runtime caller is `AppRouterProvider`                                                                                  |

The rest of that barrel — `createSessionApi`, `Credentials`, `createSessionStarter`,
`SessionStarter`, `useSessionStarter`, `SessionStarterProvider`, `createSessionStore`,
`toSessionObserver`, `SessionObserver`, `createSessionTokenSource` and `SignInOutcome` — is
documented in [Session management](./session-management.md) and [Sign-in](./sign-in.md). Three
resolver names stay inside the slice on purpose: `SessionResolverContext` (naming it would let a
caller `use()` the context and skip the null check), `SessionSettler` and
`CreateSessionResolverOptions`.

**`pages/resolving-session`** exports `ResolvingSessionPage`, a component with no props.

**The composition contract in `app`.** Route modules receive the resolver through the router
context, whose type is the whole of `src/app/router/app-router-context.ts`:

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

`createAuthenticatedTransport(baseUrl: string)` returns the resolver as
`AuthenticatedTransport.sessionResolver`, alongside the HTTP client, the `SessionObserver` and the
`SessionStarter` (see [Composition root](./composition-root.md)).

**Copy.** The pending page's one string lives in the `common` namespace of each locale:

| Key                 | `en`                   | `ru`                   |
| ------------------- | ---------------------- | ---------------------- |
| `session.resolving` | Checking your session… | Проверяем вашу сессию… |

## Configuration

The guard reads no `VITE_*` variable itself. Its behaviour is fixed by the options below, set in
`src/app/router/create-app-router.ts`, `src/app/routes/_authenticated.tsx` and the composition root;
the last row is the one variable that decides where its refresh goes.

| Variable / option                                                    | Default                | Meaning                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultPendingMs` (`ROUTER_PENDING_DELAY_MILLISECONDS`)             | `300`                  | How long the router waits on a pending navigation before rendering the guard's `pendingComponent`; on a cold load the screen stays blank until then. TanStack's own default is `1000`                                                                |
| `defaultPendingMinMs` (`ROUTER_PENDING_HOLD_MILLISECONDS`)           | `300`                  | The shortest time `ResolvingSessionPage` stays up once rendered, so a fast refresh does not flicker. TanStack's own default is `500`                                                                                                                 |
| `defaultPreload`                                                     | `'intent'`             | A `<Link>` preloads its target on hover or focus (after TanStack's default 50 ms `defaultPreloadDelay`) and on touch, and a preload runs `beforeLoad`, so the guard is consulted before the click. No `<Link>` points into the guarded subtree today |
| `defaultPreloadStaleTime` (`ROUTER_PRELOAD_STALE_TIME_MILLISECONDS`) | `0`                    | How long preloaded loader data counts as fresh; `0` leaves caching to TanStack Query (see [Routing](./routing.md)). It never caches the guard: the router runs `beforeLoad` on every navigation and every preload                                    |
| `pendingComponent` (route `/_authenticated`)                         | `ResolvingSessionPage` | What the router renders in the layout's place while `beforeLoad` awaits the verdict                                                                                                                                                                  |
| `redirect` target (`to`)                                             | `'/sign-in'`           | Where a denied visitor is sent; a path missing from the generated route tree is a type error                                                                                                                                                         |
| `settler` (option of `createSessionResolver`)                        | `sessionTokenSource`   | What the resolver asks for a status; the composition root passes the token source the authenticated HTTP client also uses                                                                                                                            |
| `VITE_API_BASE_URL`                                                  | `/v1`                  | Not read by the guard: `appConfig.apiBaseUrl` reaches `createAuthenticatedTransport(baseUrl)`, so it sets where the guard's refresh goes (`POST <base>/auth/refresh`). See [Configuration and environment](./configuration.md)                       |

## Usage & extension

### Protect a screen

Protection is a file placement, not code in the screen. For a new private screen:

1. Create its route module under `src/app/routes/_authenticated/` — for example an empty
   `src/app/routes/_authenticated/settings.tsx` — or `git mv` an existing public module there.
2. Run `npx vite build`, or keep `npm run dev` running. The router plugin fills an empty module
   with a scaffold, rewrites the id a moved module passes to `createFileRoute` so it carries the
   `/_authenticated` prefix, and regenerates `src/app/router/route-tree.gen.ts`. For the empty file
   above it writes:

   ```tsx
   import { createFileRoute } from '@tanstack/react-router';

   export const Route = createFileRoute('/_authenticated/settings')({
     component: RouteComponent,
   });

   function RouteComponent() {
     return <div>Hello "/_authenticated/settings"!</div>;
   }
   ```

3. Replace the scaffolded component with a thin adapter that renders a page slice, as
   `src/app/routes/_authenticated/users.$userId.tsx` does for `UserProfilePage`. The screen's URL is
   `/settings`: the layout adds no segment, and the module needs no guard code of its own.
4. Commit the module together with the regenerated tree — a stale tree fails `npm run typecheck`
   (see [Routing](./routing.md)) — and list what the guard covers:

   ```bash
   grep -n -B2 "getParentRoute: () => AuthenticatedRoute" src/app/router/route-tree.gen.ts
   ```

To make a route public again, move its module out of `_authenticated/` and rebuild; the plugin
rewrites the id back.

### See a guarded screen locally

On `npm run dev` with no API behind the dev proxy, opening `/users/u_1` lands on `/sign-in`: the
guard's refresh fails, so the status never reaches `authenticated`. See
[User profile (read path) → See it run](./user-profile.md#see-it-run) for how to serve an API and
sign in locally.

### Test a route under the guard

Route tests build the real router with a stub resolver; any object whose `resolve` returns a
`Promise<SessionStatus>` satisfies the port. From a test beside `_authenticated.tsx`:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';

import type { SessionStatus } from '@/entities/session';
import type { HttpClient } from '@/shared/api';

import { createAppRouter } from '../router/create-app-router';

function createRouterBehindGuard(httpClient: HttpClient, verdict: SessionStatus) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter({
    context: {
      httpClient,
      queryClient,
      sessionResolver: { resolve: () => Promise.resolve(verdict) },
    },
    history: createMemoryHistory({ initialEntries: ['/users/u_1'] }),
  });

  return { router, queryClient };
}
```

Render `<RouterProvider router={router} />` inside `QueryClientProvider` and `HttpClientProvider` —
plus `SessionStarterProvider` when the test follows the redirect, because `/sign-in` renders a form
that calls `useSessionStarter()` — as `renderGuardedRoute` in
`src/app/routes/_authenticated.test.tsx` does. Wait on a **named** heading: `ResolvingSessionPage`
has an `<h1>` of its own, so an unnamed `findByRole('heading', { level: 1 })` resolves against it
the instant it paints. Routes outside the guard need the stub too, because the context member is
required; `sign-in.test.tsx` and `create-app-router.test.tsx` pass one that resolves `'anonymous'`.

### Replace the resolver

The guard never names `createSessionResolver`; it sees only `context.sessionResolver`. A different
implementation is therefore bound on one line, the `sessionResolver` entry that
`createAuthenticatedTransport` returns — today
`createSessionResolver({ settler: sessionTokenSource })` — and reaches the guard unchanged through
`AppProviders`, `SessionResolverProvider`, `useSessionResolver()` in `AppRouterProvider` and
`AppRouterContext`. A replacement must:

- **stay total** — resolve to `'unknown'` rather than reject, because a rejection escaping
  `beforeLoad` as anything but a redirect errors the route instead of turning the visitor away;
- **settle through the `sessionTokenSource` the authenticated client already uses** — a second
  token-source instance owns a second single-flight (the one shared request concurrent callers
  join), so a guard's refresh and a `401` retry would send two refreshes instead of one;
- **be constructible only at the composition root** — export its factory from `@/entities/session`
  and add the name to `SESSION_CONSTRUCTOR_NAMES` in `eslint.config.js`, the list that keeps
  `createSessionResolver` out of route modules and lower layers today.

## Design decisions & trade-offs

- **A pathless layout route guards a whole subtree, so protection is a file-system placement.**
  Moving `users.$userId.tsx` under `_authenticated/` changed one line besides its location — the id
  passed to `createFileRoute` — and its URL stayed `/users/$userId`, because the layout adds no
  segment. One guard serves every descendant, so a private screen carries no guard code. The
  placement cuts both ways: a route filed outside `_authenticated/` is silently public, and no gate
  notices.
- **The guard denies by negation, so an unforeseen status fails closed.** The check is
  `!== 'authenticated'`, not `=== 'anonymous'`: a `SessionStatus` member added later is denied until
  someone decides otherwise. It also fixes what `unknown` means after `resolve()`: the refresh
  itself failed, which is a denial, not an open door. That is why the session has three states
  rather than a nullable token — the guard must tell "not checked yet" (resolve it first) from
  "checked and gone" (deny).
- **The resolver reaches `beforeLoad` through the router context, as a required member.**
  `beforeLoad` runs outside React, so the hook cannot be called there. A dependency only one
  subtree needs would normally arrive through a parent's `beforeLoad` return value, which the router
  merges into the child context, but the guard's dependency is what its _own_ `beforeLoad` consumes,
  so the root context is the only way in. `AppRouterContext.sessionResolver` is required because a
  guard whose resolver may be absent fails open. Membership has a rule, and it cuts both ways: only
  ports a loader or a guard needs _injected_ — because they vary by environment or must be swappable
  in a test — go on `AppRouterContext`, while module singletons such as `appConfig` are imported
  directly at their point of use instead. That is why `VITE_API_BASE_URL` reaches
  `createAuthenticatedTransport(baseUrl)` as `appConfig.apiBaseUrl`, imported in
  `src/app/entrypoint/app.tsx` and handed to `AppProviders` as a prop, without ever passing through
  the router context — and why `sessionResolver` must. The price: every route inherits it, so `/`
  and `/sign-in` carry a `sessionResolver` they never call, and every router test must supply one. On
  the React side, `useSessionResolver()` throws when no provider is above it, so a missing binding
  is a loud render error, never a silently open guard.
- **`resolve()` is total.** `createSessionResolver` catches a rejecting settler and returns
  `'unknown'`: the port is an interface anyone may implement, and a rejection escaping `beforeLoad`
  as anything but a redirect would error the route instead of turning the visitor away. It is the
  routing-side twin of `renewQuietly` in `src/shared/api/attach-bearer-token.ts`
  ([HTTP transport](./http-transport.md)), which wraps `renewToken` for the same reason.
- **A failed resolution is not cached.** `resolve()` asks the settler on every call, and `settle()`
  answers a settled status without a request, so re-asking costs nothing for a live or ended
  session. While `/auth/refresh` is degraded the status stays `unknown`, and every navigation into
  the subtree — and, with `defaultPreload: 'intent'`, every hover over a `<Link>` into it — fires
  another refresh POST, because `singleFlight` collapses concurrent callers, not sequential ones.
  Back-off is deferred; the last `settle()` case in `session-token-source.test.ts` ("retries the
  refresh on every settle while the session stays unresolved") pins today's behaviour so that step
  starts from a red test.
- **Settling before any loader spares guarded routes the reload `401`.** The access token lives in
  memory, so every page load starts `unknown`, and the first authenticated request would otherwise
  go out bare and pay `401` → refresh → replay — one extra round trip and a `401` in every devtools
  trace. Because `beforeLoad` finishes before a loader fires, the first request under
  `_authenticated/` already carries a bearer token; a request issued from an unguarded route after a
  reload would still pay the round trip (none issues one today). This is a property of the
  composition in `createAuthenticatedTransport`, not a promise of the `SessionResolver` port, which
  guarantees a verdict and nothing more: it holds because one token-source instance serves both the
  authenticated client and the resolver, so the refresh the guard drives writes the very store the
  bearer interceptor reads. `create-authenticated-transport.test.ts` asserts it end to end.
- **`redirect({ to: '/sign-in', throw: true })`, not `throw redirect(...)`.** `redirect()` returns a
  `Response`, and `@typescript-eslint/only-throw-error` (part of `recommendedTypeChecked`) rejects
  throwing one, so the option makes the router's helper throw it. Nothing static protects that
  option: without `throw: true` the redirect is built and discarded, which is neither a type nor a
  lint error, and three cases in `_authenticated.test.tsx` are what fail. The target, by contrast,
  is type-checked against the generated route tree.
- **Pending timings are 300 ms and 300 ms, and a test asserts them.** `defaultPendingMs` is how long
  the router waits on a pending match before `ResolvingSessionPage` appears; `defaultPendingMinMs`
  is how long the page then holds, so a fast refresh does not flicker. TanStack's defaults of
  1000 ms and 500 ms would leave a cold load of a guarded route blank for up to a full second, and
  nothing else would notice — which is why `create-app-router.test.tsx` asserts both values:
  deleting either line would otherwise pass every gate.
- **The pending screen is a page slice of its own.** `ResolvingSessionPage` lives in
  `pages/resolving-session`, takes no props and reads no route state, so
  `resolving-session-page.test.tsx` renders it with no router — the same executable proof as the
  home page's test that a page below `app` stays router-free. It reuses the sign-in page's layout
  utilities, and its one string sits in the `common` namespace, which `BUNDLED_RESOURCES` ships for
  every locale, so the page never waits on a lazily loaded namespace.
- **The guard adds 0.35 kB gzip of eager JavaScript, all of it first-party.** Measured against the
  sign-in commit (`8fe59fc`), eager bytes — everything `index.html` pulls — grew 460.05 → 461.34 kB
  raw and 152.60 → 152.95 kB gzip, and modules transformed went 585 → 591. The router plugin's
  `defaultCodeSplitGroupings` split only `component`, `errorComponent` and `notFoundComponent`, so
  `pendingComponent` stays in `_authenticated.tsx`, which the route tree imports eagerly:
  `ResolvingSessionPage` costs no chunk of its own because it ships in the entry chunk.
  `button-*.js` grew 102.98 → 103.10 kB raw with the `session.resolving` string in each locale's
  bundled `common`;
  every route chunk kept its raw size, and `index.css` kept its content hash. No vendor code was
  added: `beforeLoad` and `redirect` are the router's own guard primitives, already in the bundle.
  The bundler names a route chunk after its module's file name, which the move under
  `_authenticated/` left unchanged, so the profile's route chunk is still `users._userId-*.js`.
- **It is a user-experience affordance, not an authorization boundary.** The guard decides what to
  render, in code the visitor controls, and the private route's chunk is a static asset anyone can
  fetch. The server must authorize every request on its own; the guard spares a signed-out visitor
  a broken screen and a wasted request, nothing more.

## Testing

Unit and component tests sit beside the code they cover; the browser suite lives in `e2e/`.

- `src/app/routes/_authenticated.test.tsx` — the guard through the real route tree:
  `createAppRouter` with a memory history at `/users/u_1` and a stubbed `sessionResolver`. An
  `'authenticated'` verdict renders the profile and keeps the URL; `'anonymous'` and `'unknown'`
  both land on `/sign-in`; a visitor it turns away triggers no HTTP request; a pending verdict shows
  "Checking your session…" and then the profile once it settles; and the guard asks the port for
  its verdict.
- `src/entities/session/model/session-resolver.test.ts` — the resolver passes `authenticated`,
  `anonymous` and `unknown` through, turns a rejecting settler into `'unknown'`, and asks the
  settler again on every call.
- `src/entities/session/model/session-resolver-context.test.tsx` — the provider renders its
  children, the hook returns the provided resolver, and the hook throws outside a provider.
- `src/pages/resolving-session/ui/resolving-session-page.test.tsx` — the heading copy, rendered with
  no router and no provider (the Vitest setup registers a global English i18n instance; see
  [Unit and component testing](./unit-testing.md)).
- `src/app/router/create-app-router.test.tsx` — the injected `sessionResolver` lands on the router
  context, and the pending and preload values are asserted.
- `src/app/router/app-router-provider.test.tsx` — `AppRouterProvider` builds the router once across
  re-renders, with the resolver supplied by a `SessionResolverProvider`.
- `src/app/entrypoint/app-providers.test.tsx` — `AppProviders` publishes the transport's resolver to
  its children.
- `src/app/entrypoint/create-authenticated-transport.test.ts` (Node environment, MSW) — an `unknown`
  session resolves with one refresh across two `resolve()` calls, and the first request after a
  resolved session carries its bearer token: the shared-token-source invariant.
- `src/entities/session/model/session-token-source.test.ts` — the `settle()` cases the resolver
  relies on, documented in [Session management](./session-management.md).
- End to end, `e2e/fixtures/harness.ts` registers `restoreSession` for every spec, so the seven
  scenarios in `e2e/user-profile.spec.ts` open `/users/:id` and pass the guard as a signed-in
  visitor. Without the stub they would bounce to `/sign-in` the moment the guard's refresh hit the
  harness's catch-all `501`. See [End-to-end testing](./e2e-testing.md).

```bash
npm test
npx vitest run src/app/routes/_authenticated.test.tsx
npx vitest run src/entities/session/model/session-resolver.test.ts
npx vitest run src/entities/session/model/session-resolver-context.test.tsx
npm run test:e2e
```

## Known limitations

- **End-to-end tests cover only the admit path.** `restoreSession` answers every
  `POST /v1/auth/refresh` with a token, and the user stub in `e2e/fixtures/user-stub.ts` never
  inspects the `Authorization` header, so the suite would stay green with the guard deleted;
  `e2e/app-shell.spec.ts` visits only unguarded paths (see
  [End-to-end testing](./e2e-testing.md)). The redirect to `/sign-in`, for `anonymous`
  and for `unknown`, is covered only in Vitest by `src/app/routes/_authenticated.test.tsx`.
  Exercising it in a browser needs a controllable session stub, which is deferred.
- **A visitor who is turned away does not return to the page they asked for.** The redirect carries
  no record of the denied URL, and a successful sign-in navigates to `/` (`onSignedIn` in
  `src/app/routes/sign-in.tsx`; see [Sign-in](./sign-in.md)). Returning them needs an open-redirect
  guard and is deferred.
- **A session that ends mid-visit is not re-checked until the next navigation.** Nothing re-runs
  `beforeLoad` when the session leaves `authenticated`: `clearCacheOnSessionEnd` clears the query
  cache, but the visitor stays on the page they were on until they navigate (see
  [Session management](./session-management.md)). Re-validating the matched routes on that edge is
  deferred to sign-out, which does not exist yet.
- **There is no back-off while the refresh endpoint is degraded.** Each navigation or intent preload
  into the subtree retries the refresh while the status is `unknown`, as described under Design
  decisions.
- **Nothing checks route placement.** No lint rule, steiger rule or type flags a private screen
  filed outside `src/app/routes/_authenticated/`; the `grep` under
  [Protect a screen](#protect-a-screen) is the review step.
