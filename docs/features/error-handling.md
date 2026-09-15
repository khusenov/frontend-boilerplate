# Error handling and reporting

> **Status:** Complete · **Layers:** app, shared, outside layers · **Verified against:** `1c193c6`

## Purpose

A render-time throw that no error boundary catches unmounts the whole React root and leaves the
user on a blank page, and a failure that never throws into render — a failed query or mutation —
otherwise just sits in TanStack Query's cache state, so nothing tells anyone off the device that
production is broken. This feature contains start-up crashes behind an accessible recovery screen
and sends render, query and mutation failures through one reporting port, `ErrorReporter`, whose
concrete destination is chosen in a single composition-root module. Replacing the console with a
real error-tracking service is therefore one new adapter and one changed line, with no layer below
`app` touched.

## How it works

Terms used throughout: an **error boundary** is a React component that catches errors thrown while
rendering its subtree and renders a fallback instead; a **port** (or **seam**) is a type the rest of
the code programs against while the concrete implementation is chosen elsewhere; a **sink** is the
concrete destination that reports are written to; the **composition root** is `src/app/entrypoint`,
the only place that constructs concretes and binds them to seams (see
[Composition root](./composition-root.md)). In Feature-Sliced Design terms, `app` and `shared` are
**layers** split into purpose-named **segments** (`app/entrypoint`, `shared/observability`,
`shared/ui`, …); `shared/ui` and `shared/lib` split further into purpose-named **groups**
(`shared/ui/error-boundary`), and each segment or group is consumed through its `index.ts`
**barrel**, its public API.

Two boundaries sit in the rendered tree, and which one catches a crash decides what the user sees
and whether the crash is reported:

```text
App                                  src/app/entrypoint/app.tsx
└─ ErrorBoundary                     root boundary: AppCrashFallback, onError = handleRenderError
   └─ AppProviders                   useState initializers: transport, query client, i18n
      └─ AppRouterProvider           useState initializer: createAppRouter({ context })
         └─ RouterProvider → Matches → MatchesInner
            └─ CatchBoundary         TanStack Router's global boundary: built-in ErrorComponent
               └─ RootLayout → Outlet → route components: pages, forms, pending, not-found
```

**Binding at start-up.** When `app.tsx` is evaluated it takes `reportError` — which
`app-error-reporter.ts` exports as `toSafeErrorReporter(createConsoleErrorReporter())` — and binds it
to two adapters: `handleRenderError = createRenderErrorHandler(reportError)` and
`queryErrorHandlers = createQueryErrorHandlers(reportError)`. `App` gives the first to the root
`ErrorBoundary` as `onError` and the second to `AppProviders`, whose `useState` initializer passes
it to `createQueryClient`.

**A query or mutation fails — the common path.** `createQueryClient` registers `onError` on the
client's `QueryCache` and `MutationCache`. When a query fetch has failed for good — after the retry
policy owned by [HTTP transport](./http-transport.md) gives up — the cache calls
`onQueryError(error, query.queryHash)`; the **query hash** is TanStack Query's stable JSON
serialisation of the query key, `["users","detail","u_1"]` for a user profile. A failed mutation
calls `onMutationError(error, hashKey(mutation.options.mutationKey ?? []))`. The adapters turn these
into `{ source: 'query', error, queryHash }` and `{ source: 'mutation', error, mutationHash }`
reports, and the console sink prints `error reported from query` (or `mutation`), the error and the
hash. Reporting is a side channel and changes nothing on screen: the query or mutation still settles
into its error state and its owner renders it — the profile page shows its `unavailable` state
([User profile](./user-profile.md)) and the name form its `failed` notice
([Update user name](./update-user-name.md)). Every failed fetch is reported, including background
refetches, the `prefetchQuery` started by the `users.$userId.tsx` loader, and failures the UI
expects, such as a `404` for a user that does not exist. No data failure throws into render: nothing
in `src` uses `useSuspenseQuery` or `throwOnError`.

**A crash at start-up — the root boundary.** A throw while rendering `AppProviders` or
`AppRouterProvider` happens above the router, so the root `ErrorBoundary` catches it. That includes
their `useState` initializers: `createAuthenticatedTransport`, `createQueryClient`, `createI18n`,
and `createAppRouter`, which builds the route tree eagerly and throws `Invariant failed` on a
duplicate route id. The `react-error-boundary` primitive replaces the whole tree with
`AppCrashFallback` and calls `onError`, so `handleRenderError` reports
`{ source: 'render', error, componentStack }` with React's component stack (`''` when React supplies
none) and the console sink prints `error reported from render`. `AppCrashFallback` moves focus to
its `Something went wrong` heading, explains
`The application could not start. Trying again may fix it.` and offers a `Try again` button wired
to `resetErrorBoundary`. A reset renders the boundary's children from scratch: `AppProviders` and
`AppRouterProvider` remount, and every client and the router are constructed again, so a transient
failure recovers and a deterministic one returns to the crash screen.

**A crash inside a route — TanStack Router's boundary.** `RouterProvider` renders `Matches`, whose
`MatchesInner` wraps the matched route tree in the router's own global `CatchBoundary`
(`node_modules/@tanstack/react-router/dist/esm/Matches.js`) unless the router option
`disableGlobalCatchBoundary` is set (see [Routing](./routing.md)). The router mounts a per-route
boundary only for a route whose `errorComponent` — or the router's `defaultErrorComponent` —
resolves. The app sets none of these options, and no `onCatch` or `defaultOnCatch`, so anything that
throws while rendering inside the
router stops at that global boundary: a page, a form field, `RootLayout`, `NotFoundPage`, or
`ResolvingSessionPage`. A `loader` / `beforeLoad` error reaches the same boundary by a different
path: the router catches it during data loading, marks the match errored, and re-throws it when it
renders that match (`MatchInner` in `Match.js` throws `match.error`), so it lands in the same global
`CatchBoundary` as a render throw. Neither of today's two data steps can produce one — the
`users.$userId.tsx` loader only starts a `prefetchQuery` and discards its promise, and the
`_authenticated` guard's `beforeLoad` awaits a resolver that turns any failure into an `unknown`
status instead of rejecting, and otherwise throws only a `redirect`, which the router handles as
navigation (see [Authenticated route guard](./route-guard.md)). The global boundary renders
TanStack's built-in `ErrorComponent`: an unstyled, untranslated `Something went wrong!` panel with a
`Show Error` / `Hide Error` toggle around `error.message` — expanded by default outside production,
collapsed in production — and no retry control. The root boundary never sees the error, so neither
`handleRenderError` nor the `ErrorReporter` runs. The only traces are React's own caught-error
logging — `src/main.tsx` passes no `onCaughtError` to `createRoot`, so React logs the error with
`console.error` — and, outside production, two `console.warn` lines from the router. This is the
current behaviour, and it is recorded under [Known limitations](#known-limitations).

**The sink itself fails.** `toSafeErrorReporter` calls the sink inside `try`/`catch`. If the sink
throws, the guard logs `the error reporter failed` with the sink's error and `report.source`, then
returns normally, so a broken sink can neither turn a contained crash into an unmounted tree nor
replace a query's real error with its own. The next report goes to the sink again.

## Architecture

The feature has two seams. `ErrorReporter`, in `shared/observability`, is the reporting port: a
plain function type over the `ErrorReport` union that every producer calls and every sink
implements. `ErrorBoundary`, in `shared/ui/error-boundary`, is the containment seam: the only module
that imports `react-error-boundary`, with its own `ErrorFallbackProps` and `RenderErrorHandler`
types so that no vendor type crosses it. Concretes meet the seams only in the composition root
([Composition root](./composition-root.md)): `app-error-reporter.ts` is the one module that names
a sink, and `app.tsx` binds `AppCrashFallback` plus the two adapters that turn each producer's
callback into an `ErrorReport`. The producers never
learn about the port — the boundary calls a `RenderErrorHandler`, and `createQueryClient` calls two
plain `(error, hash) => void` callbacks — so neither `shared/ui` nor `shared/api` imports
`shared/observability`, and `shared/observability` imports nothing outside itself. Every import
points down from `app` into `shared`. ESLint holds the fences (see
[Architecture boundaries](./architecture-boundaries.md)): `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS` bans
`react-error-boundary` everywhere in `src` except the non-test files of
`src/shared/ui/error-boundary`, and the five layers below `app`, plus `app/routes` and `app/router`,
may import `@/shared/observability` for types only and never past its barrel. That `console` is
called only inside `shared/observability` is a convention nothing lints; check it with
`grep -rn "console\." src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`.

| Component                                        | Layer                        | Responsibility                                                                                                                   | File                                                 |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `App`                                            | `app/entrypoint`             | Wraps the tree in the root `ErrorBoundary`; binds `reportError` to `handleRenderError` and `queryErrorHandlers` at module scope  | `src/app/entrypoint/app.tsx`                         |
| `reportError`                                    | `app/entrypoint`             | The one binding of a concrete sink: `toSafeErrorReporter(createConsoleErrorReporter())`                                          | `src/app/entrypoint/app-error-reporter.ts`           |
| `AppCrashFallback`                               | `app/entrypoint`             | Crash screen: focuses its heading, shows hard-coded English copy, and retries through `resetErrorBoundary`                       | `src/app/entrypoint/app-crash-fallback.tsx`          |
| `createRenderErrorHandler`                       | `app/entrypoint`             | Adapts the boundary's `(error, info)` callback into a `render` report                                                            | `src/app/entrypoint/create-render-error-handler.ts`  |
| `createQueryErrorHandlers`, `QueryErrorHandlers` | `app/entrypoint`             | Adapts the query client's two failure callbacks into `query` and `mutation` reports                                              | `src/app/entrypoint/create-query-error-handlers.ts`  |
| `AppProviders`                                   | `app/entrypoint`             | Passes `queryErrorHandlers` to `createQueryClient` inside its `useState` initializer                                             | `src/app/entrypoint/app-providers.tsx`               |
| `AppRouterProvider`                              | `app/router`                 | Builds the router inside the root boundary and renders `RouterProvider`, whose global `CatchBoundary` intercepts route crashes   | `src/app/router/app-router-provider.tsx`             |
| `createAppRouter`                                | `app/router`                 | Router options; sets no `defaultErrorComponent`, `defaultOnCatch` or `disableGlobalCatchBoundary`                                | `src/app/router/create-app-router.ts`                |
| `Route` (root)                                   | `app/routes`                 | Root route: `component: RootLayout`, `notFoundComponent: NotFoundPage`, no `errorComponent` or `onCatch`                         | `src/app/routes/__root.tsx`                          |
| `ErrorBoundary`                                  | `shared/ui · error-boundary` | Wraps the vendor boundary; forwards only `FallbackComponent` and `onError`, which defaults to a no-op                            | `src/shared/ui/error-boundary/error-boundary.tsx`    |
| `ErrorReport`, `ErrorReporter`                   | `shared/observability`       | The reporting port: a three-arm union and the function type that consumes it                                                     | `src/shared/observability/error-reporter.ts`         |
| `createConsoleErrorReporter`                     | `shared/observability`       | The shipped sink: one `console.error` call per report                                                                            | `src/shared/observability/console-error-reporter.ts` |
| `toSafeErrorReporter`                            | `shared/observability`       | Decorator that keeps a throwing sink from escaping into React or TanStack Query                                                  | `src/shared/observability/to-safe-error-reporter.ts` |
| `createQueryClient`                              | `shared/api`                 | Registers `QueryCache` and `MutationCache` `onError` and forwards to `onQueryError` / `onMutationError`, which default to no-ops | `src/shared/api/query-client.ts`                     |
| `HttpError`                                      | `shared/api`                 | The error most query and mutation reports carry; keeps the original failure as `cause`                                           | `src/shared/api/http-error.ts`                       |
| `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS`             | outside layers               | Lint fence: `react-error-boundary` importable only inside `shared/ui/error-boundary`                                             | `eslint.config.js`                                   |

## Public surface

This feature serves no route: `AppCrashFallback` replaces the whole tree and has no URL of its own,
and TanStack Router's panel renders at whichever URL crashed. The contract is two `shared` seams,
the failure callbacks of one `shared/api` factory, and the composition-root bindings.

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

| Variable / option                                           | Default                                                                   | Meaning                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `reportError` (`src/app/entrypoint/app-error-reporter.ts`)  | `toSafeErrorReporter(createConsoleErrorReporter())`                       | The sink every report reaches; the line to change when swapping sinks                                                  |
| `FallbackComponent` (`ErrorBoundaryProps`)                  | None — required; `app.tsx` passes `AppCrashFallback`                      | Component rendered in place of the crashed subtree                                                                     |
| `onError` (`ErrorBoundaryProps`)                            | `() => undefined`; `app.tsx` passes `handleRenderError`                   | Called once per caught render crash with the error and React's `ErrorInfo`                                             |
| `queryErrorHandlers` (`AppProviders` prop)                  | None — required; `app.tsx` passes `createQueryErrorHandlers(reportError)` | Handed to `createQueryClient` as its options object                                                                    |
| `onQueryError` (`createQueryClient` option)                 | `() => undefined`                                                         | Receives each failed query's error and query hash                                                                      |
| `onMutationError` (`createQueryClient` option)              | `() => undefined`                                                         | Receives each failed mutation's error and mutation hash                                                                |
| `errorComponent` / `onCatch` (route options)                | Unset on every route                                                      | A per-route boundary and its catch callback; `src/app/routes/__root.tsx` sets only `component` and `notFoundComponent` |
| `defaultErrorComponent` / `defaultOnCatch` (router options) | Unset in `createAppRouter`                                                | Router-wide defaults for the two route options                                                                         |
| `disableGlobalCatchBoundary` (router option)                | `false` (TanStack Router default)                                         | Keeps the global `CatchBoundary` that intercepts route crashes before the root boundary                                |

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
   implements no `navigator.sendBeacon`, so the test stubs it:

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
       url: '/users/u_1',
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

4. Rewrite the wiring case in `src/app/entrypoint/app.test.tsx`, which today asserts the console
   line `error reported from render` that the beacon sink never prints. Swapping the assertion is
   not enough: jsdom implements no `navigator.sendBeacon`, so unless you stub it the way step 3
   does, the sink throws on every report and `toSafeErrorReporter` swallows the throw as
   `the error reporter failed` without rethrowing — the fallback still renders, but no beacon call
   is ever recorded to assert on. Keep the `console.error` spy — it no longer carries an
   assertion, it only silences React's own log of the caught error — add `vi.unstubAllGlobals()`
   to the existing `afterEach`, and replace the case with:

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

   The two rendering cases above it stay as they are: `vi.stubGlobal` replaces `navigator` only
   inside this case, and neither of them reaches the reporter.

To keep console output as well — useful in development — call both sinks from one `ErrorReporter`
and wrap each in `toSafeErrorReporter`, so one failing sink cannot silence the other. Two things the
swap does not change: the query channel still reports expected failures such as a `404`, so filter
them in the sink by the `httpKind` and `httpStatus` it keeps rather than at the producers; and
route crashes still bypass the reporter entirely (see [Known limitations](#known-limitations)).

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

### Contain a subtree with its own boundary

- Import `ErrorBoundary` from `@/shared/ui/error-boundary`; `react-error-boundary` itself is
  lint-banned outside that group.
- Pass a `FallbackComponent`. It renders as a component of its own, so it may use hooks; the seam
  deliberately offers no `fallbackRender`.
- Declare only the props the fallback needs: `Pick<ErrorFallbackProps, 'resetErrorBoundary'>`
  turns rendering the thrown message into a compile error.
- A boundary nested inside a route catches before TanStack Router's global `CatchBoundary`, so it
  is today's way to give part of a screen its own fallback. Its `onError` cannot be a sink
  constructed below `app`; hand it a `RenderErrorHandler` from the composition root.

## Design decisions & trade-offs

- **The root boundary sits in `app.tsx`, above `AppProviders`.** That is the only position that
  covers client construction: a boundary inside `AppProviders` could not catch a throw from
  `AppProviders`' own `useState` initializers, because the component that throws would be the one
  hosting it, and `AppRouterProvider` builds the router the same way. The cost is that the fallback
  renders outside every provider — no `I18nProvider`, no query client — so its copy is hard-coded
  English: if the i18n subsystem is what failed, there is nothing left to translate a message with.
  `Button` needs no provider, so the fallback still uses the design system.
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
  expected (parameter contravariance). What the narrowing buys is the other direction: `error` is not
  one of the component's props, so it never enters scope and a JSX call that tried to pass it would
  be rejected. Leaking a thrown message — which may carry a URL or a token — is unrepresentable
  rather than merely tested. It is the same narrowing move as
  `UserReadClient = Pick<HttpClient, 'get'>` ([User profile](./user-profile.md)).
- **Focus, not a live region.** The heading gets `tabIndex={-1}` and focus on mount, and there is no
  `role="alert"`. A live region announces content inserted into a region that already exists, but a
  boundary replaces the whole subtree, so region and text mount in the same commit and several
  screen readers stay silent; doing both makes NVDA and JAWS announce twice. The focus ring uses
  `focus:` utilities rather than `focus-visible:` because `:focus-visible` does not match a
  programmatic `.focus()` after a pointer interaction.
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
  two plain `(error, hash) => void` callbacks instead of importing `ErrorReporter` — `QueryCache` and
  `MutationCache` take `onError` as constructor options, not `DefaultOptions` fields
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
  owning. The boundary vendor is small — `react-error-boundary`'s ESM build is 3,007 B raw and
  1,165 B gzip — but because `AppCrashFallback` imports `Button`, the button primitive and its
  `class-variance-authority`, `clsx`, `tailwind-merge` and Radix `Slot` dependencies are statically
  reachable from the entry.
- **`react-error-boundary` is a contained vendor**, like axios, the i18next packages, TanStack Form
  and the concrete validators. `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS` in `eslint.config.js` bans it
  through `no-restricted-imports` in every block that fences a vendor — the five non-`app` layers,
  `app/routes`, `app/router` and `src/main.tsx` — plus the generic `src/**` block, which is what
  covers `app/entrypoint`. The `src/shared/ui/error-boundary/**` exemption must stay after the
  `src/{entities,features,widgets,pages,shared}/**` block because flat config replaces rather than
  merges `no-restricted-imports` options; its glob does not overlap `src/shared/ui/form/**`, so the
  two exemptions coexist.

## Testing

Unit and component tests sit beside the modules they cover (see
[Unit and component testing](./unit-testing.md)):

| Test file                                                                                                    | What it proves                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/observability/console-error-reporter.test.ts`                                                    | The `console.error` line for each of the three sources                                                                                                                                                                                                                                                 |
| `src/shared/observability/to-safe-error-reporter.test.ts`                                                    | A report is forwarded; a throwing sink is logged as `the error reporter failed` instead of rethrown; forwarding continues after a failure                                                                                                                                                              |
| `src/shared/ui/error-boundary/error-boundary.test.tsx`                                                       | Children render; the fallback receives the thrown error; the fallback is mounted as a component of its own, so a hook inside it works — the case that fails if the seam switches to `fallbackRender`; `onError` runs once; a reset renders the children again                                          |
| `src/app/entrypoint/app-crash-fallback.test.tsx`                                                             | The heading takes focus on mount; the copy; `Try again` calls `resetErrorBoundary`; mounted by a real boundary around a child throwing a token-bearing URL, it never renders the message                                                                                                               |
| `src/app/entrypoint/create-render-error-handler.test.ts`                                                     | React's component stack is forwarded, and a `null` stack becomes `''`                                                                                                                                                                                                                                  |
| `src/app/entrypoint/create-query-error-handlers.test.ts`                                                     | `query` and `mutation` reports carry their hashes                                                                                                                                                                                                                                                      |
| `src/shared/api/query-client.test.ts` (`createQueryClient failure callbacks`)                                | A failing query reports its query hash; a failing mutation reports `hashKey` of its key, or of `[]` without one; no callbacks means no console output; a custom `queryKeyHashFn` shapes `queryHash` while mutations keep TanStack's `hashKey`                                                          |
| `src/app/entrypoint/app-providers.test.tsx` (`reports a query failure through the injected handlers`)        | `AppProviders` really hands its handlers to the query client                                                                                                                                                                                                                                           |
| `src/app/entrypoint/app.test.tsx` (`catches a provider construction failure instead of unmounting the tree`) | With `AppProviders` replaced by a throwing component through `vi.doMock`, `vi.resetModules` and a dynamic import, `App` shows the crash heading and the console sink prints `error reported from render` — pinning the boundary's presence, its position above `AppProviders` and the `onError` wiring |

Run them with:

```sh
npm test
npx vitest run src/shared/observability src/shared/ui/error-boundary src/app/entrypoint
npx vitest run src/shared/api/query-client.test.ts
npm run test:e2e
```

Gaps: no test drives a crash inside a route, so the path through TanStack Router's `CatchBoundary`
is unverified by the suite; mutation reporting is wired through `AppProviders` but asserted only at
the `createQueryClient` level. No Playwright spec asserts on reporting: `e2e/user-profile.spec.ts`
produces a real query failure (a `404` for `u_missing`) and a real mutation failure (a `500` on
save) in the production build, and both are reported to the browser console, but the specs assert
only the on-screen states (see [End-to-end testing](./e2e-testing.md)).

## Known limitations

- **Route crashes are neither shown on the crash screen nor reported.** `MatchesInner` in
  `node_modules/@tanstack/react-router/dist/esm/Matches.js` wraps the match tree in a global
  `CatchBoundary`, and `MatchView` in `Match.js` mounts a per-route boundary — the only place it
  calls `onCatch` or `defaultOnCatch` — only when `errorComponent ?? defaultErrorComponent`
  resolves; `src/app/routes/__root.tsx` and `src/app/router/create-app-router.ts` set none of them.
  So the `TypeError` that `TextField` throws when bound to a non-string field
  ([Forms](./forms.md)), like any other page crash, shows TanStack Router's panel rather than
  `AppCrashFallback` and never reaches `reportError` — nor a vendor sink bound there. In production
  that panel keeps `error.message` one `Show Error` click away, which `AppCrashFallback` makes
  impossible. Setting `defaultOnCatch` alone would report nothing, because the router calls it only
  from a per-route boundary; `disableGlobalCatchBoundary: true` would let route crashes reach the
  root boundary instead, whose screen replaces the whole application.
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
