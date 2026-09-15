# Routing

> **Status:** Complete · **Layers:** app, pages, entities, shared, outside layers · **Verified against:** `19fe53b`

## Purpose

A single-page app still has addresses: each screen needs a URL that can be bookmarked, linked and
opened cold, and some screens need a guard or a data prefetch to finish before they render. Routing
maps every URL to a screen through TanStack Router, runs that work first, and answers every other
URL with a not-found page. It keeps route state — the location, its params, navigation — inside the
`app` layer, so every page below it is a plain component that takes props and renders without a
router. Because the route tree is generated from the files in `src/app/routes`, a link to a path
that no route file declares fails `npm run typecheck` instead of reaching a user as a broken page.

## How it works

**Build time: files become a typed route tree.** `@tanstack/router-plugin`, the Vite plugin
registered as `routerPlugin` in `vite.config.ts`, scans `src/app/routes`. Every file there except
the co-located `*.test.tsx` files is a _route module_: it exports a `Route`, and its file name is its
URL (`sign-in.tsx` serves `/sign-in`). The plugin writes `src/app/router/route-tree.gen.ts`, the _route tree_: every route
wired to its parent, plus a `declare module '@tanstack/react-router'` block that gives each route's
path and parent a type. With `autoCodeSplitting: true` it also moves each route's `component` into a
chunk of its own. The plugin runs when `npm run dev` starts, again on every file change, and on
every `vite build`. It is left out when Vite runs in `test` mode, so Vitest imports the committed
tree as it is.

**Start-up: the router is built inside the provider tree.**

```text
src/main.tsx → <App />
└─ ErrorBoundary             app/entrypoint/app.tsx: the root error boundary
   └─ AppProviders           app/entrypoint: QueryClient, i18n, HttpClient, SessionResolver, SessionStarter, SessionEnder
      └─ AppRouterProvider   app/router: router context from hooks, router from a useState initializer
         └─ RouterProvider
            └─ RootLayout    app/routes/__root.tsx: <Outlet /> and <TanStackRouterDevtools />
               ├─ /                          HomeRoute → HomePage
               ├─ /sign-in                   SignInRoute → SignInPage
               ├─ /_authenticated (no URL)   the guard → /users/$userId: UserProfileRoute → UserProfilePage
               └─ any other URL              NotFoundPage, the root route's notFoundComponent
```

[Composition root](./composition-root.md) builds and publishes everything above `AppRouterProvider`
in this tree — `ErrorBoundary` through `AppProviders`.

`AppRouterProvider` reads three ports out of React context — `useHttpClient()`, `useQueryClient()`
and `useSessionResolver()` — into an `AppRouterContext` object, the _router context_. It creates the
router once, with `useState(() => createAppRouter({ context }))`, and renders
`<RouterProvider router={router} context={context} />`. `createAppRouter` hands TanStack's
`createRouter` the generated `routeTree` and the app's routing policy. It passes no `history`, so
the router follows the browser's address bar through TanStack's default, `createBrowserHistory()`.

**A navigation.** The router matches the URL against the tree, calls `beforeLoad` on each matched
route from the root down, then runs the matched `loader`s — both receive the router context as
`context` — and loads the matched route's component chunk. It then renders `RootLayout` with that
route's component in the `<Outlet />`. At `/`, `HomeRoute` reads `appConfig` and renders `HomePage`
with its `name`, `mode` and `apiBaseUrl` as props. A navigation still pending after 300 ms
(`defaultPendingMs`) shows the nearest `pendingComponent` — only the guard's layout route declares
one — for at least 300 ms (`defaultPendingMinMs`); [Authenticated route guard](./route-guard.md)
covers that screen. Once the new screen has rendered, the router scrolls the window to the top or,
on Back and Forward, to where the visitor left that history entry (`scrollRestoration: true`).

**Links and preloading.** A `<Link>` renders a real `<a href>` and turns a plain left click into a
client-side navigation, with no page reload. With `defaultPreload: 'intent'`, hovering over or
focusing a link for 50 ms (TanStack's `defaultPreloadDelay`), or touching it, _preloads_ its target:
the router fetches the target's component chunk and runs its `beforeLoad` and `loader` before the
click. `defaultPreloadStaleTime: 0` stops the router caching what that preload produced, so the
click runs the loader again and TanStack Query's own cache decides whether a request goes out.

**No route matches.** For an unknown URL the router renders the `notFoundComponent` of the deepest
matched route that declares one. Only the root route declares one, so every unknown URL renders
`NotFoundPage` inside `RootLayout`: the heading "Page not found", one sentence, and a "Back to home"
`<Link>` to `/`. This relies on the server answering an unknown path with the app's `index.html`:
the dev server and `vite preview` do, and a production host has to be configured to (see
[Deploy behind a static host](#deploy-behind-a-static-host)).

**Two other failures.** A route module the tree does not list cannot ship:
`createFileRoute('/about')` type-checks only once the generated tree declares `'/about'`, so a stale
tree fails `npm run typecheck`, and with it `npm run build` and `npm run audit`. A route component
that throws while rendering, or a `beforeLoad` or `loader` that throws anything other than a
redirect, stops at TanStack Router's own error boundary, because no route declares an
`errorComponent`; [Error handling and reporting](./error-handling.md) owns that path.

## Architecture

Feature-Sliced Design (FSD) splits `src/` into layers — `app`, `pages`, `widgets`, `features`,
`entities`, `shared`, top to bottom — and a module imports only from layers below its own. `pages`,
`features` and `entities` hold _slices_, one concept each (`pages/not-found`), divided into
purpose-named _segments_ (`ui`, `model`, `api`) and reached from outside only through the slice's
`index.ts`, its _public API_; `app` and `shared` have segments but no slices. Routing lives almost
entirely in `app`, the layer that holds the repo's _composition root_ (`app/entrypoint`, the only
place that binds concrete implementations to _ports_ — the repo's word, used interchangeably with
_seam_, for a type that consumers program against while the implementation is chosen elsewhere). The
router context is the seam routing adds:
`AppRouterContext` is a typed bundle of three ports — the `HttpClient` from `shared/api`, TanStack
Query's `QueryClient`, and the `SessionResolver` from `entities/session` — that route `beforeLoad`
guards and `loader`s receive, because they run outside React, where no hook can reach.
`app/entrypoint` constructs the concretes and publishes them through the providers in
`AppProviders`; `AppRouterProvider` in `app/router` reads them back and hands them to the router; a
route module only ever sees `context`. Two `app` segments split the rest by axis of change:
`app/routes` holds URL-to-screen wiring — thin _adapters_ that read route state or config and hand
plain props and callbacks to a page — and `app/router` holds construction, policy, mounting and the
generated tree. Every import points downward: `app/routes` imports `pages` slices, `entities/user`
and `shared/config`; `app/router` imports `entities/session` and `shared/api`; and below `app` the
router's only importable export is `Link`, which `pages/not-found` alone uses.

| Component                                                       | Layer                      | Responsibility                                                                                                                                                                                                             | File                                                                                                       |
| --------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `createAppRouter`, `CreateAppRouterOptions`, `AppRouter`        | `app/router`               | Builds the router from `routeTree` with the app's routing policy, and registers `AppRouter` with TanStack's `Register` interface so links and redirects are type-checked                                                   | `src/app/router/create-app-router.ts`                                                                      |
| `AppRouterContext`                                              | `app/router`               | The router context type: `httpClient`, `queryClient` and `sessionResolver`, all required                                                                                                                                   | `src/app/router/app-router-context.ts`                                                                     |
| `AppRouterProvider`                                             | `app/router`               | Reads the three ports from React context, creates the router once, renders `RouterProvider` and re-supplies the context on every render                                                                                    | `src/app/router/app-router-provider.tsx`                                                                   |
| `routeTree`                                                     | `app/router` (generated)   | The route tree and the `FileRoutesByPath` type augmentation, written by the router plugin and never edited by hand                                                                                                         | `src/app/router/route-tree.gen.ts`                                                                         |
| `Route` (id `__root__`), `RootLayout`                           | `app/routes`               | The root route: types the context with `createRootRouteWithContext<AppRouterContext>()`, renders `<Outlet />` and the router devtools, and sets `notFoundComponent: NotFoundPage`                                          | `src/app/routes/__root.tsx`                                                                                |
| `Route` (id `/`), `HomeRoute`                                   | `app/routes`               | The index route: passes `appConfig.name`, `appConfig.mode` and `appConfig.apiBaseUrl` to `HomePage`                                                                                                                        | `src/app/routes/index.tsx`                                                                                 |
| `NotFoundPage`                                                  | `pages/not-found · ui`     | The 404 screen, and the one module below `app` that imports from the router (`Link`)                                                                                                                                       | `src/pages/not-found/ui/not-found-page.tsx`                                                                |
| `HomePage`                                                      | `pages/home · ui`          | The worked example the index route renders, documented in [Internationalization](./internationalization.md)                                                                                                                | `src/pages/home/ui/home-page.tsx`                                                                          |
| `App`                                                           | `app/entrypoint`           | Mounts `AppRouterProvider` inside `AppProviders` and the root `ErrorBoundary`                                                                                                                                              | `src/app/entrypoint/app.tsx`                                                                               |
| `AppProviders`                                                  | `app/entrypoint`           | Publishes what `AppRouterProvider` reads: `QueryClientProvider`, `HttpClientProvider`, `SessionResolverProvider` (see [Composition root](./composition-root.md))                                                           | `src/app/entrypoint/app-providers.tsx`                                                                     |
| `SessionResolver`, `useSessionResolver`                         | `entities/session · model` | The guard's port and the hook that reads it into the router context, owned by [Authenticated route guard](./route-guard.md)                                                                                                | `src/entities/session/model/session-resolver.ts`, `src/entities/session/model/session-resolver-context.ts` |
| `HttpClient`, `useHttpClient`                                   | `shared/api`               | The transport port and the hook that reads it into the router context, owned by [HTTP transport](./http-transport.md)                                                                                                      | `src/shared/api/http-client.ts`, `src/shared/api/http-client-context.ts`                                   |
| `appConfig`                                                     | `shared/config`            | The configuration the index route reads, owned by [Configuration and environment](./configuration.md)                                                                                                                      | `src/shared/config/app-config.ts`                                                                          |
| `notFound.title`, `notFound.description`, `notFound.backToHome` | `shared/i18n`              | The not-found page's copy, in `en` and `ru`                                                                                                                                                                                | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json`                         |
| `routerPlugin`                                                  | `outside layers`           | The `tanstackRouter` plugin instance: generates the tree and code-splits route components; absent from the plugin list when `mode === 'test'`                                                                              | `vite.config.ts`                                                                                           |
| Router import fence and route rules                             | `outside layers`           | `no-restricted-imports` allows only `Link` from `@tanstack/react-router` below `app`; `@tanstack/eslint-plugin-router`'s recommended rules; `react-refresh/only-export-components` off for route modules; the tree ignored | `eslint.config.js`                                                                                         |
| `src/app/router/route-tree.gen.ts` entry                        | `outside layers`           | Keeps Prettier off the generated tree                                                                                                                                                                                      | `.prettierignore`                                                                                          |
| `vi.stubGlobal('scrollTo', vi.fn())`                            | `outside layers`           | Stubs the global `scrollTo` the router calls after every navigation, which jsdom does not implement                                                                                                                        | `vitest.setup.ts`                                                                                          |
| `GENERATED_ROUTE_TREE`                                          | `outside layers`           | Exempts the tree from the coverage-scope guard                                                                                                                                                                             | `scripts/verify-coverage-scope.mjs`                                                                        |
| `application shell` spec                                        | `outside layers`           | The not-found page and its link home, in the production build                                                                                                                                                              | `e2e/app-shell.spec.ts`                                                                                    |

## Public surface

**Routes** — every route in `src/app/router/route-tree.gen.ts`:

| Path                                    | Auth            | Purpose                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                     | `public`        | The index route, `src/app/routes/index.tsx`: renders `HomePage` with values from `appConfig`                                                                                                                                                                       |
| `/sign-in`                              | `public`        | `src/app/routes/sign-in.tsx`: renders `SignInPage` and navigates to `/` after a sign-in — see [Sign-in](./sign-in.md)                                                                                                                                              |
| `/users/$userId`                        | `authenticated` | `src/app/routes/_authenticated/users.$userId.tsx`: prefetches the user in its `loader`, renders `UserProfilePage`, and sends the visitor to `/sign-in` once the session is ended — see [User profile (read path)](./user-profile.md) and [Sign-out](./sign-out.md) |
| _(pathless)_ route id `/_authenticated` | —               | `src/app/routes/_authenticated.tsx`: the layout route whose `beforeLoad` guards every module under `src/app/routes/_authenticated/` — see [Authenticated route guard](./route-guard.md)                                                                            |
| _(root)_ route id `__root__`            | —               | `src/app/routes/__root.tsx`: wraps every route in `RootLayout` and owns not-found handling                                                                                                                                                                         |
| any other URL                           | `public`        | No route matches, so the root route's `notFoundComponent` renders `NotFoundPage`                                                                                                                                                                                   |

**`pages/not-found`** — its public API, `src/pages/not-found/index.ts`, exports one component:

| Export         | Kind      | Contract                                                                                                                                                                                                                                                                            |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotFoundPage` | component | No props. Renders one `<main>` holding an `<h1>` (`notFound.title`), a `<p>` (`notFound.description`) and `<Link to="/">` (`notFound.backToHome`). It needs a `RouterProvider` ancestor, because `Link` reads the router, and an i18n instance, because it calls `useTranslation()` |

**The router contract inside `app`.** `app` has segments rather than slices, and its public API,
`src/app/index.ts`, exports only `App`; route modules, router modules and their tests reach the
following by relative path.

| Export                   | Module                                   | Contract                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppRouterContext`       | `src/app/router/app-router-context.ts`   | `{ readonly httpClient: HttpClient; readonly queryClient: QueryClient; readonly sessionResolver: SessionResolver }` — what every `beforeLoad` and `loader` receives as `context`                                 |
| `createAppRouter`        | `src/app/router/create-app-router.ts`    | `createAppRouter(options: CreateAppRouterOptions)` returns a router built from `routeTree` with the policy listed under [Configuration](#configuration)                                                          |
| `CreateAppRouterOptions` | `src/app/router/create-app-router.ts`    | `{ readonly context: AppRouterContext; readonly history?: RouterHistory }`. It accepts no policy option, so every caller, tests included, gets the production policy                                             |
| `AppRouter`              | `src/app/router/create-app-router.ts`    | `ReturnType<typeof createAppRouter>`, the type registered with TanStack Router                                                                                                                                   |
| `AppRouterProvider`      | `src/app/router/app-router-provider.tsx` | A component with no props. It must render inside `QueryClientProvider`, `HttpClientProvider` and `SessionResolverProvider`, whose hooks it calls                                                                 |
| `routeTree`              | `src/app/router/route-tree.gen.ts`       | Generated. Imported only by `createAppRouter`; the file's `FileRoutesByPath` augmentation is what makes `createFileRoute('<path>')` type-check                                                                   |
| `Route`                  | every route module                       | The value of `createFileRoute('<path>')(options)`, or of `createRootRouteWithContext<AppRouterContext>()(options)` for the root. The generator owns the path string and rewrites it to match the file's location |

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
`Outlet`, `redirect`, `useNavigate`, `Route.useParams()` — and `@/shared/config`, read at this
composition seam and passed down as props. Its `beforeLoad` and `loader` receive
`context: AppRouterContext`. `eslint.config.js` keeps construction and vendors out of
`src/app/routes/**` and `src/app/router/**`: `createHttpClient`, `createQueryClient`, `createI18n`,
the six session constructors (`SESSION_CONSTRUCTOR_NAMES`) and value imports from
`@/shared/observability` are rejected there, as are `axios`, the i18next packages,
`@tanstack/react-form` and `react-error-boundary` — type-only imports of `i18next` and
`@tanstack/react-form` excepted (see [Architecture boundaries](./architecture-boundaries.md)).

**What is allowed below `app`.** `import { Link } from '@tanstack/react-router'` and nothing else
from the router, in every file under `src/entities`, `src/features`, `src/widgets`, `src/pages` and
`src/shared`, test files included. `to` and `params` are checked against the tree.

**Copy.** The not-found page's strings live in the `common` namespace of each locale:

| Key                    | `en`                                   | `ru`                                     |
| ---------------------- | -------------------------------------- | ---------------------------------------- |
| `notFound.title`       | Page not found                         | Страница не найдена                      |
| `notFound.description` | The page you requested does not exist. | Запрошенная вами страница не существует. |
| `notFound.backToHome`  | Back to home                           | На главную                               |

## Configuration

Routing reads no `VITE_*` variable itself. The index route reads `appConfig`, whose `apiBaseUrl`
comes from `VITE_API_BASE_URL`, and everything else is an option in `create-app-router.ts`,
`vite.config.ts` or `__root.tsx`:

| Variable / option                                                                | Default                                                                        | Meaning                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context` (`CreateAppRouterOptions`)                                             | required                                                                       | The `AppRouterContext` every `beforeLoad` and `loader` receives; `AppRouterProvider` fills it from React context                                                                                                   |
| `history` (`CreateAppRouterOptions`)                                             | TanStack's `createBrowserHistory()`                                            | Where the router reads and writes the location. The app passes none; tests pass `createMemoryHistory({ initialEntries: [path] })`                                                                                  |
| `defaultPreload`                                                                 | `'intent'`                                                                     | A `<Link>` preloads its target on hover or focus (after `defaultPreloadDelay`) and on touch. TanStack's default is no preloading                                                                                   |
| `defaultPreloadStaleTime` (`ROUTER_PRELOAD_STALE_TIME_MILLISECONDS`)             | `0`                                                                            | How long a preload's loader result counts as fresh. `0` leaves caching to TanStack Query; TanStack's default is 30 s                                                                                               |
| `defaultPendingMs` (`ROUTER_PENDING_DELAY_MILLISECONDS`)                         | `300`                                                                          | How long a pending navigation waits before the nearest `pendingComponent` renders. TanStack's default is `1000`; the reasoning is in [Authenticated route guard](./route-guard.md)                                 |
| `defaultPendingMinMs` (`ROUTER_PENDING_HOLD_MILLISECONDS`)                       | `300`                                                                          | The shortest time a `pendingComponent` stays up once shown. TanStack's default is `500`                                                                                                                            |
| `scrollRestoration`                                                              | `true`                                                                         | Keeps each history entry's scroll position (saved to `sessionStorage` when the page is hidden) and restores it on Back and Forward; a new navigation starts at the top. TanStack's default is `false`              |
| `defaultPreloadDelay`, `defaultStaleTime`, `notFoundMode`                        | not set: TanStack's `50`, `0`, `'fuzzy'`                                       | The hover delay before a preload; loader results already count as stale on ordinary navigations; an unknown URL is handled by the deepest matched route with a `notFoundComponent`, which is always the root today |
| `routesDirectory` (`routerPlugin`)                                               | `'./src/app/routes'`                                                           | Where route modules live                                                                                                                                                                                           |
| `generatedRouteTree` (`routerPlugin`)                                            | `'./src/app/router/route-tree.gen.ts'`                                         | Where the plugin writes the tree. The name is the repo's choice, not the generator's                                                                                                                               |
| `routeFileIgnorePattern` (`routerPlugin`)                                        | `'\\.test\\.tsx?$'`                                                            | Lets `*.test.ts(x)` files sit beside route modules without becoming routes                                                                                                                                         |
| `autoCodeSplitting` (`routerPlugin`)                                             | `true`                                                                         | Moves each non-root route's `component` into its own lazily loaded chunk                                                                                                                                           |
| `target`, `quoteStyle`, `semicolons` (`routerPlugin`)                            | `'react'`, `'single'`, `true`                                                  | The framework the generated code targets, and how the generator formats the tree and the modules it scaffolds; single quotes are its default, semicolons are not                                                   |
| Plugin list (`vite.config.ts`)                                                   | `mode === 'test' ? [] : [routerPlugin]`                                        | Vitest runs without the plugin, against the committed tree                                                                                                                                                         |
| `position`, `initialIsOpen` (`TanStackRouterDevtools`)                           | `'bottom-left'`, `false`                                                       | Where the devtools toggle sits and whether the panel starts open. Both equal the package's own defaults; the TanStack Query devtools toggle defaults to the bottom-right corner, so the two do not overlap         |
| `appConfig.name`, `appConfig.mode`, `appConfig.apiBaseUrl` (read by `index.tsx`) | `'frontend-boilerplate'`, `import.meta.env.MODE`, `VITE_API_BASE_URL` or `/v1` | Passed to `HomePage` as `name`, `mode` and `apiBaseUrl`. See [Configuration and environment](./configuration.md)                                                                                                   |
| `appType` (Vite)                                                                 | not set: Vite's `'spa'`                                                        | The dev server and `vite preview` answer any unknown path with `index.html`, which is what lets a deep link reach the router                                                                                       |

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
   exactly one `<main>` and one `<h1>`. `src/pages/about/ui/about-page.tsx`:

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

3. Create the route module `src/app/routes/about.tsx` as a thin adapter:

   ```tsx
   import { createFileRoute } from '@tanstack/react-router';

   import { AboutPage } from '@/pages/about';

   export const Route = createFileRoute('/about')({
     component: AboutPage,
   });
   ```

   Starting from an empty file also works: the next generation (step 4) fills it with a placeholder
   `RouteComponent` to replace.

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

   import { toHttpError } from '@/shared/api';
   import type { HttpClient } from '@/shared/api';

   import { createAppRouter } from '../router/create-app-router';

   const notCalled = (): Promise<never> =>
     Promise.reject(toHttpError(new Error('The about route performs no HTTP calls.')));

   const httpClient: HttpClient = {
     get: notCalled,
     post: notCalled,
     put: notCalled,
     patch: notCalled,
     delete: notCalled,
   };

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

   No i18n provider is needed in either test: `vitest.setup.ts` registers an English instance
   globally (see [Unit and component testing](./unit-testing.md)).

6. Run `npm run audit` ([Quality gates](./quality-gates.md)).

A private screen is the same steps with the route module under `src/app/routes/_authenticated/`;
[Authenticated route guard](./route-guard.md) covers that placement.

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
is the working example. A page that renders a `Link` needs a `RouterProvider` above it in its tests,
which a test file below `app` cannot import — so test such a page through the route tree from
`src/app/routes` or `src/app/router`, as `create-app-router.test.tsx` does for `NotFoundPage`.

### Change the routing policy

The policy is three constants and two literals in `src/app/router/create-app-router.ts`, and the
`applies the routing policy the factory owns` case in `src/app/router/create-app-router.test.tsx`
asserts every value, so change both together. Read the reasoning for the pending pair in
[Authenticated route guard](./route-guard.md) and for `defaultPreloadStaleTime` under
[Design decisions](#design-decisions--trade-offs) first. `CreateAppRouterOptions` deliberately has
no policy field: a per-caller override would let tests run a policy production does not.

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
every deep link and every reload off `/` then gets the host's 404 instead of the app.

## Design decisions & trade-offs

- **TanStack Router, because the route tree is a type.** The commit that chose it (`97bbc7a`)
  records it as the only React router that made `<Link to="/typo">` a compile error rather than a
  runtime 404: React Router typed `Link`'s `to` as `string | Partial<Path>`, which made path safety
  opt-in per call site, and Wouter, at about 1.5 kB, has no typed params, loaders or router context,
  so every guard and prefetch would have been hand-written. It also belongs to the ecosystem
  TanStack Query and its ESLint plugin had already brought in. The price is weight: in a production
  build at `19fe53b`, the router's runtime — `@tanstack/router-core`, `@tanstack/react-router`,
  `@tanstack/history` and the `@tanstack/store` pair it depends on — is about 74 kB of the 326 kB
  entry chunk (attributed with the build's source map), roughly 27 kB gzipped on its own. Typed
  links, typed params, a typed router context and per-route code-splitting are what that buys.
- **Route state stops at `app`; below it, `Link` is the whole router API.** The fence is an
  allow-list — `allowImportNames: ['Link']` — because a ban list fails open: it would have to name
  `getRouteApi`, which hands a caller `useParams`, `useSearch`, `useLoaderData`, `useRouteContext`
  and `useNavigate` through one import, and it would silently admit whatever a future minor version
  exports. Two patterns close the side doors: `^@tanstack/react-router/` (deep imports) and
  `^@tanstack/(react-)?router-core`, since npm hoists `@tanstack/router-core` where any module can
  import it. The fence covers test files too, so `home-page.test.tsx` and
  `resolving-session-page.test.tsx` render their pages with no router at all — the executable proof
  that a page below `app` reads no route state. Pages and features become substitutable as a result:
  `features/sign-in` takes `onSignedIn` and would work unchanged in a modal or under another router.
  The cost is one exception, `NotFoundPage`, whose `Link` needs a router in any test.
  [Architecture boundaries](./architecture-boundaries.md) covers how this fence composes with the
  repo's others.
- **Two segments, split by axis of change.** `app/routes` changes when a URL or its screen changes;
  `app/router` changes when construction or policy does. The generated tree lives in `app/router`
  rather than a top-level `src/routes`, which would sit outside the layer system — like
  `src/main.tsx` — where steiger cannot analyse it.
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
  The pending pair (`defaultPendingMs` and `defaultPendingMinMs`, 300 ms each) is set here for the
  guard's pending screen and is reasoned about in that document.
- **Scroll restoration is on.** With `scrollRestoration: true` the router takes over the browser's
  own restoration (`history.scrollRestoration = 'manual'`) and returns a visitor to where they were
  on Back and Forward; a new navigation still starts at the top. The router calls the global
  `scrollTo` after every navigation, which jsdom does not implement, so `vitest.setup.ts` stubs it
  with `vi.stubGlobal('scrollTo', vi.fn())`.
- **Not-found belongs to the root route, and the root route is never split.** Only `__root.tsx`
  declares a `notFoundComponent`, so under TanStack's default `notFoundMode` every unknown URL
  renders `NotFoundPage` inside `RootLayout`, with no per-subtree variants to keep consistent. The
  router plugin treats `createRootRouteWithContext` as unsplittable, so `RootLayout` and
  `NotFoundPage` ship in the entry chunk and a mistyped URL renders without fetching another chunk.
  Unlike `pages/home`, which is a worked example to replace, `pages/not-found` is a permanent slice.
- **`autoCodeSplitting` splits route components, not the work that runs before them.** The plugin's
  default groupings split `component`, `errorComponent` and `notFoundComponent` only, so every
  `loader`, `beforeLoad` and `pendingComponent` stays in its route module, which the tree imports
  eagerly. A production build at `19fe53b` (598 modules) emits one chunk per routed component —
  `routes-*.js` for `/` (12.01 kB, 5.11 kB gzip), `sign-in-*.js` (2.58 kB, 1.14 kB gzip) and
  `users._userId-*.js` (12.97 kB, 4.60 kB gzip) — beside the 326.48 kB (107.76 kB gzip) entry chunk.
  Styling is one `index-*.css`: components carry Tailwind utilities, so no route chunk emits CSS.
  `dist/index.html` modulepreloads the two shared chunks the entry imports statically
  (`button-*.js` and `session-*.js`) but no route chunk, so the landing route always costs one extra
  round trip for its own chunk; intent preloading covers later `<Link>` navigations but cannot help
  the first. The plugin wraps each split component in TanStack's `lazyRouteComponent`: when the
  browser fails to fetch a route chunk — after a redeploy removed it, say — it reloads the page
  once, with a `sessionStorage` flag keyed by the error message to prevent a loop, so the visitor
  picks up the new `index.html`; if the same failure repeats, the error is thrown to the router's
  error boundary.
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
- **Pages own their landmarks.** `RootLayout` renders no markup of its own, so each page renders
  exactly one `<main>` and one `<h1>`. `home-page.test.tsx` queries `heading, { level: 1 }` with no
  name and would throw on a second `<h1>`; a second `<main>` is a landmark ambiguity no gate
  catches.

## Testing

Unit and component tests sit beside the code they cover; the browser suite lives in `e2e/`.

- `src/app/router/create-app-router.test.tsx` — the router built by `createAppRouter` with a memory
  history and stub ports: `/` renders the `frontend-boilerplate` heading; `/does-not-exist` renders
  "Page not found"; clicking "Back to home" navigates to the home page; the injected `httpClient`,
  `queryClient` and `sessionResolver` land on `router.options.context`; and the policy values —
  `'intent'`, `0`, `300`, `300` and `true` — are asserted. Its last case is a type test: a
  `@ts-expect-error` on `<Link to="/definitely-not-a-route">`. Vitest does not type-check, so this
  case can only fail in `npm run typecheck` (and `npm run build`), where error `TS2578` reports the
  directive as unused the moment the `Register` augmentation stops typing links.
- `src/app/router/app-router-provider.test.tsx` — inside `QueryClientProvider`, `HttpClientProvider`
  and `SessionResolverProvider`, `AppRouterProvider` calls `createAppRouter` once across a
  re-render.
- `src/app/entrypoint/app.test.tsx` — the whole `App`, providers and router included, renders the
  home page.
- `src/main.test.ts` — the mount test wraps the import in `act()` and its assertion in `waitFor`,
  because the router resolves the first match asynchronously.
- `src/pages/home/ui/home-page.test.tsx` — deliberately stands up no router. `pages/not-found` has
  no co-located test: its `Link` needs a `RouterProvider`, which the fence keeps out of test files
  below `app`, and such a test would re-test the router; `create-app-router.test.tsx` and the
  end-to-end spec cover it.
- The route modules of other documents are tested the same way, through `createAppRouter` and a
  memory history: `src/app/routes/sign-in.test.tsx` ([Sign-in](./sign-in.md)),
  `src/app/routes/_authenticated.test.tsx` ([Authenticated route guard](./route-guard.md)) and
  `src/app/routes/_authenticated/users.$userId.test.tsx`
  ([User profile (read path)](./user-profile.md)).
- `e2e/app-shell.spec.ts` — Playwright against the production build served by `vite preview`: it
  opens `/no-such-page`, sees "Page not found", clicks "Back to home" and lands on `/`. It runs the
  tree and the chunks exactly as the router plugin emits them, which no Vitest test does, and it
  depends on the preview server answering an unknown path with `index.html`; the seven specs in
  `e2e/user-profile.spec.ts` do the same for the guarded route. See
  [End-to-end testing](./e2e-testing.md).

```bash
npm test
npx vitest run src/app/router/create-app-router.test.tsx
npx vitest run src/app/router/app-router-provider.test.tsx
npm run typecheck
npm run test:e2e
npx playwright test e2e/app-shell.spec.ts
```

## Known limitations

- **Navigation changes neither the document title nor focus.** Every URL keeps
  `<title>frontend-boilerplate</title>` from `index.html`: no route declares a `head` option and
  nothing renders TanStack's `HeadContent`. Nothing moves focus or announces the new screen after a
  client-side navigation either — the only `focus()` call in `src` is `AppCrashFallback`'s — so a
  screen-reader user is not told the page changed.
- **An unknown URL is a soft 404.** The server answers it with `index.html` and status `200`; only
  the client renders "Page not found". `vite preview` answers even a missing `/assets/*.js` path
  with `200 text/html`.
- **`NotFoundPage` is unstyled.** Its `<main>`, heading, paragraph and link carry no Tailwind
  utilities, unlike every other page.
- **Intent preloading has one consumer.** The only `<Link>` in `src` that ever renders is
  `NotFoundPage`'s link to `/`; the only other `<Link>` is the never-rendered `@ts-expect-error`
  fixture in `create-app-router.test.tsx` (see [Testing](#testing)). Every other navigation starts
  from a typed URL, the guard's redirect to `/sign-in` or the `navigate({ to: '/' })` that follows a
  sign-in, and none of those preloads.
- **Route errors bypass the app's error reporting.** No route declares an `errorComponent` and
  `createAppRouter` sets no `defaultErrorComponent`, so a crash inside a route renders TanStack's
  built-in, untranslated error panel and never reaches the `ErrorReporter` — see
  [Error handling and reporting](./error-handling.md).
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
