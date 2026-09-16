# Sign-out

> **Status:** Complete · **Layers:** app, pages, features, entities, shared, outside layers · **Verified against:** `33ee487`

## Purpose

A session that only the server can end cannot be ended on a shared machine. `SessionStore.end()`
existed from the first session commit, but no port a component could reach ended the session: the
entity published `createSessionStarter` and `useSessionStarter` with no counterpart, and
`createSessionStore` is fenced to `app/entrypoint` by `SESSION_CONSTRUCTOR_NAMES`, so the local
session ended only when the token source saw an expired refresh
([Session management](./session-management.md)). Sign-out closes that lifecycle: one button asks the
server to revoke the session and ends the local one whether or not the server answers. Emptying the
TanStack Query cache and navigating away are not this feature's code: the cache falls out of the
`authenticated → anonymous` transition the session store already publishes
([Session management](./session-management.md)), and the redirect is the `onSignedOut` callback the
route supplies, fired once the attempt settles — on a confirmed revocation and a failed one alike.

## How it works

Four repo terms run through the walkthrough below. A _port_ — this repo also says _seam_ — is an
interface a consumer programs against instead of naming a concrete implementation; the _composition
root_ is `src/app/entrypoint/**` ([Composition root](./composition-root.md)), the one place that
constructs concretes and binds them to those ports; a slice's `index.ts` is its _public API_, the
only file other slices may import; and an _outcome_ is a closed union a call returns instead of
throwing — it carries the success and every expected transport failure as members, so the caller
reads a `status` rather than catching. [Architecture](#architecture) covers the rest of the
Feature-Sliced Design vocabulary and names this feature's two seams.

1. **Trigger.** An authenticated visitor is on `/users/$userId`. `UserProfilePage` renders
   `SignOutButton` in a right-aligned row above the profile content, ahead of the profile's own
   `pending` / `unavailable` / `ready` states, so the control is reachable even while the profile
   query is failing. The visitor clicks it.
2. **Container.** One control is two components. `SignOutButton` calls
   `useSignOut({ onSignedOut })` and renders `SignOutButtonView` with `isSigningOut` and an
   `onSignOut` that fires `void signOut()`; the view is presentational — its only decision is
   `isSigningOut`, with copy from `useTranslation()`.
3. **Hook.** `useSignOut` reads the `SessionEnder` port from React context with `useSessionEnder()`
   and drives it through a TanStack Query mutation whose `mutationFn` is
   `() => sessionEnder.signOut()`. While that promise is pending, `isSigningOut` is
   `mutation.isPending` and the view renders a disabled `Button` carrying `aria-busy="true"` and the
   `signOut.inProgress` label, so a second click cannot start a second request.
4. **Revocation.** The ender built by `createSessionEnder` awaits its injected `requestSignOut`,
   which the composition root — `src/app/entrypoint/create-authenticated-transport.ts` — bound to
   `SessionApi.signOut`. That posts an empty object to `/auth/logout` on the cookie-bearing
   unauthenticated HTTP client and validates the answer against `noContentSchema`. A 204 becomes
   `{ status: 'signed-out' }`; a 401 becomes `signed-out` as well; every other `HttpError` — another
   status, no response, a timeout, or a 2xx that carries a body — becomes `unavailable`.
5. **The local end.** Whatever that request answered, and even if it threw, the `finally` block
   calls `store.end()`. The session store publishes `anonymous` to its observers — a no-op when the
   state already is `anonymous`, because the store publishes only a change — and `signOut` returns
   the `SignOutOutcome` (or rethrows the non-`HttpError` that escaped step 4). The end holds
   even against a token renewal that was already in flight when the visitor clicked: `applyResult`
   in `createSessionTokenSource` re-reads the store before applying a `refreshed` result and returns
   `null` once the status is `anonymous`, so a late refresh cannot republish `authenticated` behind
   the sign-out ([Session management](./session-management.md) owns that machinery).
6. **Cache.** `clearCacheOnSessionEnd`, subscribed to the transport's `SessionObserver` in
   `AppProviders`' `useEffect`, sees a transition whose previous status was `authenticated` and calls
   `queryClient.clear()`. This feature adds no cache code of its own: emptying the cache is the
   session transition's policy, not sign-out's.
7. **Departure.** The mutation settles and its `onSettled` calls `onSignedOut` — the prop
   `UserProfilePage` received from `UserProfileRoute`, which runs `navigate({ to: '/sign-in' })`.
8. **Afterwards.** Any later navigation to a route module under `src/app/routes/_authenticated/`
   resolves `anonymous` and is turned away by the guard
   ([Authenticated route guard](./route-guard.md)); the authenticated HTTP client now sends no
   `Authorization` header, because the store holds no token.

Two failure paths matter:

- **The server refuses to revoke.** A 500, an unreachable API or a timeout classifies as
  `unavailable`. `store.end()` has already run, `useSignOut` discards the outcome, and the visitor
  leaves exactly as on success. This tab is signed out; the browser is not, because the `httpOnly`
  refresh cookie survives (see [Known limitations](#known-limitations)).
- **The ender rejects.** Only a failure that is not an `HttpError` can make it out of
  `SessionApi.signOut`, because every expected transport failure has already been classified into an
  outcome. `store.end()` still ran in the `finally`, `useSignOut`'s `signOut` catches the rejection
  so the click handler's `void signOut()` cannot produce an unhandled rejection, `onSettled` still
  calls `onSignedOut`, and the query client's mutation-cache handler hands the error to the app's
  error reporter ([Error handling and reporting](./error-handling.md)).

## Architecture

Feature-Sliced Design (FSD) stacks the code in _layers_ — the top-level folders under `src/`, which
may import only downward in the order `app` → `pages` → `widgets` → `features` → `entities` →
`shared`. This feature spans every one of them except `widgets` — that layer now exists, but its
only slice, `app-header`, hosts no part of this feature yet, for the reason given under
[The move into `widgets`](#the-move-into-widgets) — plus two root config files the layers do not
cover, which the table below marks `outside layers`. A _slice_ is one screen, user action or
business noun inside a layer — here `pages/user-profile` (a screen), `features/sign-out` (a user
action) and `entities/session` (a business noun) — and a _segment_ is a purpose-named folder inside
a slice: `ui/` for components, `model/` for domain types, state, hooks and ports, `api/` for DTOs,
wire schemas, mappers and HTTP calls. The table writes a
component's home as `slice · segment`, so `features/sign-out · ui` means the `ui` folder of the
`features/sign-out` slice; `app` and `shared` have segments but no slices, so their rows name the
segment alone (`app/entrypoint`, `shared/api`).

The flow depends on two seams and names no concrete. `useSignOut` programs against the
`SessionEnder` port — one method, `signOut(): Promise<SignOutOutcome>` — which it reads from React
context with `useSessionEnder()`. Its only implementation, `createSessionEnder`, receives two
deliberately narrow collaborators as `CreateSessionEnderOptions`: a `SessionEndTarget`
(`Pick<SessionStore, 'end'>`, so the ender can end a session but never read or start one) and a
`requestSignOut` function. `createAuthenticatedTransport` binds both — the single
`createSessionStore()` instance as the store, `sessionApi.signOut` from a
`createSessionApi(unauthenticatedClient)` instance as `requestSignOut` — and `AppProviders`
publishes the ender through `SessionEnderProvider`, the innermost of the three session providers,
nested inside `SessionResolverProvider` and `SessionStarterProvider`. The second seam is navigation:
the `onSignedOut` callback, whose only concrete is the route's `navigate({ to: '/sign-in' })`.
Imports run strictly downward through each slice's public `index.ts` —
`app/routes/_authenticated/users.$userId.tsx` → `@/pages/user-profile` → `@/features/sign-out` →
`@/entities/session` → `@/shared/*` — and ESLint's `no-restricted-imports` lists
`createSessionEnder` in `SESSION_CONSTRUCTOR_NAMES` (`eslint.config.js`) beside the other session
constructors, so every layer below `app`, plus `app/routes` and `app/router`, is barred from
building an ender and must take the port from the provider tree.

| Component                                       | Layer                       | Responsibility                                                                                                                                                                | File                                                                               |
| ----------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Route`, `UserProfileRoute`                     | `app/routes`                | Registers `/users/$userId` under the guard and supplies `onSignedOut` as `navigate({ to: '/sign-in' })`                                                                       | `src/app/routes/_authenticated/users.$userId.tsx`                                  |
| `UserProfilePage`                               | `pages/user-profile · ui`   | Composes `SignOutButton` above the profile content and forwards `onSignedOut`; reads no route state                                                                           | `src/pages/user-profile/ui/user-profile-page.tsx`                                  |
| `SignOutButton`                                 | `features/sign-out · ui`    | Container: wires `useSignOut` into the view                                                                                                                                   | `src/features/sign-out/ui/sign-out-button.tsx`                                     |
| `SignOutButtonView`                             | `features/sign-out · ui`    | Presentational `Button` (`variant="outline"`): swaps its label and sets `aria-busy` and `disabled` while pending                                                              | `src/features/sign-out/ui/sign-out-button-view.tsx`                                |
| `useSignOut`                                    | `features/sign-out · model` | Drives `SessionEnder.signOut` through `useMutation`; returns `isSigningOut` and a `signOut` that never rejects                                                                | `src/features/sign-out/model/use-sign-out.ts`                                      |
| `SessionEnder`, `createSessionEnder`            | `entities/session · model`  | The port, and its implementation: request the revocation, then end the local session in a `finally`                                                                           | `src/entities/session/model/session-ender.ts`                                      |
| `SessionEndTarget`, `CreateSessionEnderOptions` | `entities/session · model`  | The narrowed store (`Pick<SessionStore, 'end'>`) and the factory's options; both internal to the slice                                                                        | `src/entities/session/model/session-ender.ts`                                      |
| `useSessionEnder`, `SessionEnderContext`        | `entities/session · model`  | Reads the published ender; throws outside a provider                                                                                                                          | `src/entities/session/model/session-ender-context.ts`                              |
| `SessionEnderProvider`                          | `entities/session · model`  | Publishes an ender to the tree below it                                                                                                                                       | `src/entities/session/model/session-ender-provider.tsx`                            |
| `SignOutOutcome`                                | `entities/session · model`  | The two-member outcome the port returns: `signed-out` or `unavailable`                                                                                                        | `src/entities/session/model/sign-out-outcome.ts`                                   |
| `createSessionStore` (`end`)                    | `entities/session · model`  | Publishes `anonymous` to every observer, unless the state already is                                                                                                          | `src/entities/session/model/session-store.ts`                                      |
| `createSessionTokenSource` (`applyResult`)      | `entities/session · model`  | Drops a `refreshed` renewal once the store reads `anonymous`, so a late refresh cannot undo `store.end()`                                                                     | `src/entities/session/model/session-token-source.ts`                               |
| `createSessionApi` (`signOut`)                  | `entities/session · api`    | `POST /auth/logout` with an empty body, and the 401 / other classification                                                                                                    | `src/entities/session/api/session-api.ts`                                          |
| `noContentSchema`                               | `shared/api`                | The `ResponseSchema` that accepts only an empty body, so a 204 is validated like any other answer                                                                             | `src/shared/api/response-schema.ts`                                                |
| `Button`                                        | `shared/ui`                 | The Radix + CVA primitive the view renders (see [Design system](./design-system.md))                                                                                          | `src/shared/ui/button/button.tsx`                                                  |
| `signOut.*` keys                                | `shared/i18n`               | English and Russian copy for the idle and pending labels                                                                                                                      | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json` |
| `createAuthenticatedTransport`                  | `app/entrypoint`            | Builds the cookie-bearing unauthenticated client and binds `createSessionEnder({ store, requestSignOut })`                                                                    | `src/app/entrypoint/create-authenticated-transport.ts`                             |
| `AppProviders`                                  | `app/entrypoint`            | Mounts `SessionEnderProvider` with the transport's ender and subscribes `clearCacheOnSessionEnd`                                                                              | `src/app/entrypoint/app-providers.tsx`                                             |
| `clearCacheOnSessionEnd`                        | `app/entrypoint`            | Clears the query cache on any transition whose previous status was `authenticated`; predates this feature                                                                     | `src/app/entrypoint/clear-cache-on-session-end.ts`                                 |
| `SESSION_CONSTRUCTOR_NAMES`                     | `outside layers`            | Lists `createSessionEnder`, so only `app/entrypoint` may import it from `@/entities/session`                                                                                  | `eslint.config.js`                                                                 |
| `fsd/insignificant-slice` override              | `outside layers`            | Exempts four single-consumer feature slices — `sign-in`, `sign-out`, `switch-locale`, `update-user-name` — so steiger does not ask to merge each into its one consuming slice | `steiger.config.ts`                                                                |

## Public surface

### Routes

| Path             | Auth            | Purpose                                                                                         |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `/users/$userId` | `authenticated` | The only screen that currently mounts the control; a completed sign-out navigates to `/sign-in` |

The route module lives at `src/app/routes/_authenticated/users.$userId.tsx`, so the guard on
`src/app/routes/_authenticated.tsx` resolves the session before it loads. The screen itself is
documented in [User profile (read path)](./user-profile.md); this doc covers only the control it
hosts.

### Slice public APIs

`@/pages/user-profile` (`src/pages/user-profile/index.ts`):

| Export            | Kind      | Contract                                                                                                                          |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `UserProfilePage` | component | Props `{ readonly userId: UserId; readonly onSignedOut: () => void }`. Renders the control and the profile; takes no route state. |

`@/features/sign-out` (`src/features/sign-out/index.ts`):

| Export          | Kind      | Contract                                                                                                                                                                                                                                                    |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SignOutButton` | component | Props `{ readonly onSignedOut: () => void }`, called once the attempt settles, whatever it settled as. Needs a `QueryClientProvider`, a `SessionEnderProvider` and an initialized i18n instance (`I18nProvider`) above it; `AppProviders` mounts all three. |

`useSignOut`, `UseSignOutOptions`, `UseSignOutResult`, `SignOutButtonView` and the two props
interfaces are internal, matching `features/sign-in`, which exports only `SignInForm`.

`@/entities/session`, the sign-out half of `src/entities/session/index.ts`:

| Export                 | Kind                           | Contract                                                                                                                                                                 |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SignOutOutcome`       | type                           | `{ readonly status: 'signed-out' } \| { readonly status: 'unavailable' }`                                                                                                |
| `SessionEnder`         | type (port)                    | `{ readonly signOut: () => Promise<SignOutOutcome> }`                                                                                                                    |
| `useSessionEnder`      | hook                           | `(): SessionEnder`; throws `useSessionEnder must be called inside a SessionEnderProvider` when no provider is above it                                                   |
| `SessionEnderProvider` | component                      | Props `{ readonly sessionEnder: SessionEnder; readonly children: ReactNode }`                                                                                            |
| `createSessionEnder`   | factory, `app/entrypoint` only | `(options: CreateSessionEnderOptions) => SessionEnder`, the options being `{ readonly store: SessionEndTarget; readonly requestSignOut: () => Promise<SignOutOutcome> }` |
| `createSessionApi`     | factory, `app/entrypoint` only | `(unauthenticatedClient: SessionWriteClient) => SessionApi`, where `SessionWriteClient` is `Pick<HttpClient, 'post'>`; only its `signOut` is documented here             |

`CreateSessionEnderOptions`, `SessionEndTarget`, `SessionStore`, `SessionApi`, `SessionWriteClient`
and `SessionEnderContext` are **not** exported; the composition root satisfies the options
structurally. The rest of the barrel — the store, the observer, the token source, the resolver and
the starter — belongs to [Session management](./session-management.md),
[Authenticated route guard](./route-guard.md) and [Sign-in](./sign-in.md).

### HTTP contract

| Aspect                | Contract                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request               | `POST {VITE_API_BASE_URL}/auth/logout` — `/v1/auth/logout` with the default base URL — on the unauthenticated client, which sets axios `withCredentials` and carries no bearer interceptor |
| Body                  | `{}`, a literal empty object: no DTO type, no outbound mapper, nothing read from the session                                                                                               |
| Credential            | The `httpOnly` refresh cookie the browser attaches; no `Authorization` header is sent, which `create-authenticated-transport.test.ts` asserts                                              |
| Success               | Any 2xx whose body passes `noContentSchema` — `''`, `null` or `undefined`; a 204 is the expected answer → `signed-out`                                                                     |
| 401                   | `signed-out`: a session the server has already forgotten is a session successfully ended                                                                                                   |
| Any other `HttpError` | `unavailable`: another status, no response, a timeout, or a 2xx that carries a body (`noContentSchema` reports an issue, and `parseResponse` turns that into a `validation` `HttpError`)   |
| Any other error       | Rethrown by `SessionApi.signOut`, and rethrown by `SessionEnder.signOut` after `store.end()` has run; `useSignOut` swallows it and still calls `onSignedOut`                               |

### Copy

The keys live in the `common` namespace, typed from `src/shared/i18n/locales/en/common.json`:

| Key                  | English      | Russian  | Rendered by                                     |
| -------------------- | ------------ | -------- | ----------------------------------------------- |
| `signOut.action`     | Sign out     | Выйти    | The button's label while it is idle             |
| `signOut.inProgress` | Signing out… | Выходим… | The button's label while the request is pending |

Namespaces, typed keys and locale loading belong to
[Internationalization](./internationalization.md).

## Configuration

No module listed in [Architecture](#architecture) reads `import.meta.env` — `VITE_*` variables are
read only in `src/shared/config/app-config.ts`
([Configuration and environment](./configuration.md)) — and the one `appConfig` field any of them
reads is `appConfig.name`, which `createSessionTokenSource` uses to name its single-flight refresh
task ([Session management](./session-management.md)). Everything else this feature reaches, it
reaches through collaborators it is handed. The options below are what it does take, and what they
decide:

| Variable / option                           | Default                                                                                   | Meaning                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onSignedOut` prop                          | `navigate({ to: '/sign-in' })`, passed by `UserProfileRoute` through `UserProfilePage`    | Where the visitor lands once the attempt settles; the only navigation the flow performs                                                                                    |
| `CreateSessionEnderOptions.store`           | The single `createSessionStore()` instance, passed by `createAuthenticatedTransport`      | The `SessionEndTarget` whose `end()` the `finally` calls; narrowed to `Pick<SessionStore, 'end'>`                                                                          |
| `CreateSessionEnderOptions.requestSignOut`  | `sessionApi.signOut`, passed by `createAuthenticatedTransport`                            | The remote revocation. Swapping it is how a different backend contract is bound without touching any layer below `app`                                                     |
| `sendCookies` on the unauthenticated client | `true`, set by `createAuthenticatedTransport` (the `createHttpClient` default is `false`) | Turns on axios `withCredentials`, so the refresh cookie the server needs in order to revoke is attached to the logout request                                              |
| `timeoutMilliseconds`                       | `15_000` (`DEFAULT_TIMEOUT_MILLISECONDS`; `createAuthenticatedTransport` passes none)     | A revocation slower than this fails as a `timeout` `HttpError` and classifies as `unavailable` — the local session still ends                                              |
| Mutation `retry`                            | `false`, the mutation default set by `createQueryClient`                                  | A failed revocation is never retried automatically. Retrying would be pointless as well as slow: the local session has already ended in the `finally` of the first attempt |

The base URL the logout inherits (`VITE_API_BASE_URL`, default `/v1`) is the unauthenticated
client's, configured once for the whole transport; it is documented in
[HTTP transport](./http-transport.md) and [Sign-in](./sign-in.md#configuration).

## Usage & extension

### Try it locally

The control lives behind the route guard, so reaching it needs an API: `npm run dev` proxies `/v1`
to `http://localhost:8000` (`server.proxy` in `vite.config.ts`), and with nothing listening there
the guard redirects every visit to `/users/<id>` to `/sign-in`. Against an API that serves
`POST /v1/auth/login`, `POST /v1/auth/refresh` and `POST /v1/auth/logout` — backend-boilerplate,
with an account created as the root README describes — sign in, open `/users/<id>`, and the button
ends the session and returns to `/sign-in`. To watch the failure path,
answer the logout with a 500: the visitor still leaves, because the local session ended anyway.

### Mount the control on another screen

A screen takes the destination as a prop and leaves navigation to its route module, exactly as
`pages/user-profile` does. The page:

```tsx
import { SignOutButton } from '@/features/sign-out';

interface AccountPageProps {
  readonly onSignedOut: () => void;
}

export function AccountPage({ onSignedOut }: AccountPageProps) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div className="flex justify-end">
        <SignOutButton onSignedOut={onSignedOut} />
      </div>
    </main>
  );
}
```

And the route module under `src/app/routes/_authenticated/`, the only place in the chain that knows
navigation exists:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AccountPage } from '@/pages/account';

function AccountRoute() {
  const navigate = useNavigate();

  return (
    <AccountPage
      onSignedOut={() => {
        void navigate({ to: '/sign-in' });
      }}
    />
  );
}

export const Route = createFileRoute('/_authenticated/account')({ component: AccountRoute });
```

Run `npx vite build` afterwards to regenerate `src/app/router/route-tree.gen.ts`; until then the
route module is a type error. To change where a completed sign-out lands, change the `to` passed to
`navigate`; nothing below `app/routes` knows the destination.

### Bind a different `SessionEnder`

The port has one method, so an alternative implementation is small — a build that ends the session
without a network call, say:

```ts
import type { SessionEnder, SessionEndTarget } from './session-ender';

export function createLocalSessionEnder(store: SessionEndTarget): SessionEnder {
  return {
    signOut: () => {
      store.end();

      return Promise.resolve({ status: 'signed-out' });
    },
  };
}
```

1. Add the file as `src/entities/session/model/local-session-ender.ts`, next to `session-ender.ts`;
   inside its own slice a module uses relative imports, and `SessionEndTarget` is reachable that way
   without leaving the slice.
2. Re-export the factory from `src/entities/session/index.ts`
   (`export { createLocalSessionEnder } from './model/local-session-ender';`) — the barrel only
   re-exports, which `no-restricted-syntax` enforces.
3. Add `'createLocalSessionEnder'` to `SESSION_CONSTRUCTOR_NAMES` in `eslint.config.js`, so the new
   constructor is fenced to `app/entrypoint` like every other session constructor.
4. Bind it in `src/app/entrypoint/create-authenticated-transport.ts`, replacing the
   `createSessionEnder({ store: sessionStore, requestSignOut: sessionApi.signOut })` value of
   `sessionEnder`, so the returned object carries the new factory instead:

   ```ts
   sessionEnder: createLocalSessionEnder(sessionStore),
   ```

   Assign a `SessionEnder` here, never `sessionApi` itself — that also type-checks and skips the
   local end entirely, for the reason given under
   [A mis-wiring the compiler cannot catch](#design-decisions--trade-offs).

Nothing in `features/sign-out`, `pages/user-profile` or `app/routes` changes: they depend on
`SessionEnder`, not on how it ends a session.

### The move into `widgets`

The `widgets` layer now exists, created in one commit with its first slice, `src/widgets/app-header`
— exactly the shape this section predicted. `AppHeader` is a `<header>` banner that `RootLayout` in
`src/app/routes/__root.tsx` mounts as `<AppHeader appName={appConfig.name} />` above the
`<Outlet />`, so it renders on every route, and it already hosts one occupant: `LocaleSwitcher`, from
`@/features/switch-locale`. That is the app shell this section always wanted `SignOutButton` to live
in rather than on one screen.

The move is still blocked, and by one concrete gap. A banner on every route must offer the control
only while a session is live — mounted unconditionally it would put "Sign out" on `/sign-in` — and
nothing below `app` can read session status today. `src/entities/session/index.ts` publishes three
context/provider pairs, and none of them publishes a _status_ a component can subscribe to:

- `SessionResolverProvider` / `useSessionResolver` — `resolve(): Promise<SessionStatus>` answers
  once per call, for the route guard's `beforeLoad` ([Authenticated route guard](./route-guard.md));
  it settles a pending renewal rather than reporting live state.
- `SessionStarterProvider` / `useSessionStarter` — exchanges credentials ([Sign-in](./sign-in.md)).
- `SessionEnderProvider` / `useSessionEnder` — this feature's port, `signOut()` and nothing else.

`SessionObserver` — `status()` plus `subscribe()`, precisely the subscribable shape a header
needs — is exported from the barrel as a **type** only. Its one instance is built in the composition
root by `toSessionObserver(sessionStore)` inside `createAuthenticatedTransport`, and reaches exactly
one consumer: `clearCacheOnSessionEnd`, subscribed in `AppProviders`' `useEffect`. There is no
`SessionObserverProvider` and no `useSessionStatus` hook, and `__root.tsx` itself sees only what
`AppRouterContext` carries — `httpClient`, `queryClient` and `sessionResolver`.

Building that provider, the hook that reads it, their tests and the `AppProviders` wiring is a step
of its own, and it belongs to [Session management](./session-management.md) rather than to this
feature. Once it lands, `AppHeader` can render `SignOutButton` for an `authenticated` status alone,
`UserProfilePage` drops its `onSignedOut` prop, and the header's host supplies the callback.
Nothing inside `features/sign-out` changes in that move — which is the test of whether the slice was
placed correctly.

## Design decisions & trade-offs

- **A separate `SessionEnder` port, not a `signOut` method on `SessionStarter`.** One port with both
  methods would make `SignInForm` depend on a method it never calls and `SignOutButton` depend on
  `signIn`; each would have to be stubbed with the other's method in every test, and a change to one
  signature would ripple into the other's consumers. Two narrow ports keep each client dependent
  only on what it uses (the interface-segregation principle), and the cost is visible and
  accepted — a second context, a second provider and a second nesting level in `AppProviders`.
  The pairing is deliberate: `session-ender.ts`, `session-ender-context.ts` and
  `session-ender-provider.tsx` mirror their `session-starter-*` counterparts file for file, so the
  next port in this entity has an obvious shape to copy.
- **`finally`, not a conditional `end()`.** `createSessionEnder` ends the local session in a
  `finally` block, so it runs on `signed-out`, on `unavailable` and on a rejection alike. Ending
  only on a confirmed revocation would mean that a token outlives a sign-out whenever the network is
  down — leaving the next person at this browser signed in, which is the one scenario the feature
  exists for. That postcondition is the port's contract, not an implementation detail: all four
  cases of `session-ender.test.ts` assert it against a spy, and
  `create-authenticated-transport.test.ts` proves it against the real store and real HTTP by
  answering the logout with a 500 and still observing `anonymous`. The end also survives a token
  renewal already in flight: `applyResult` in `createSessionTokenSource` drops a `refreshed` result
  once the store reads `anonymous`, and `session-token-source.test.ts` pins that overlap in
  `drops a renewal that settles after the session has ended`
  ([Session management](./session-management.md)).
- **`onSettled`, not `onSuccess`.** The local session is gone down every path, so the caller must
  leave down every path. On `onSuccess`, a visitor whose revocation failed would stay on a screen
  whose data has just been cleared, holding no token — a dead page. `useSignOut`'s `signOut` also
  catches the mutation's rejection (`.catch(() => undefined)`) so the view's `void signOut()` cannot
  raise an unhandled rejection; the failure has already been reported by the mutation cache
  ([Error handling and reporting](./error-handling.md)), so swallowing it here reports nothing
  twice.
- **The revocation rides the cookie-bearing unauthenticated client.** It is the only client built
  with `sendCookies: true`, and therefore the only one that presents the `httpOnly` refresh cookie
  the server needs in order to revoke the session behind it; it is also the only one with no bearer
  interceptor, which on the authenticated client would read a logout 401 as an expired token and
  fire a refresh — renewing the session the request was sent to destroy. Nothing in the types
  enforces the choice: `createSessionApi` takes a `SessionWriteClient`, which is
  `Pick<HttpClient, 'post'>`, and either client satisfies it. It is a composition rule, so it is
  asserted where composition happens — `create-authenticated-transport.test.ts` records the
  `authorization` header of the logout request and expects `[null]`.
- **401 collapses to `signed-out`.** To the frontend, "the server revoked it" and "the server had
  already forgotten it" are the same fact: there is no session left to end. Giving 401 its own
  outcome would add a member that every consumer must map and no consumer could act on differently.
- **No DTO and no mapper.** The repo's hard rule is that API data never crosses `entities/*/api`
  untranslated, but here nothing crosses: the request body is `{}` and the response is 204. Adding a
  `signOutRequestDto` and a mapper for an empty object would be ceremony that teaches the wrong
  lesson. The boundary is still validated — `noContentSchema` accepts only `''`, `null` or
  `undefined`, so a server that starts returning a body fails the schema and the outcome becomes
  `unavailable` rather than being silently ignored. `session-api.test.ts` pins exactly that case.
- **The hook exposes no status union, unlike `useSignIn`.** `useSignOut` returns `isSigningOut` and
  `signOut`, and discards the `SignOutOutcome` entirely. `useSignIn` needs a `SignInStatus` because
  the visitor stays on the form and must be told which of the four `SignInOutcome` members came
  back; after a sign-out the caller navigates away unconditionally, so a status would be API
  surface built for a consumer that does not exist. The cost is named rather than hidden:
  surfacing a failed revocation later means reopening the view, which — unlike `SignInFormView` and
  `UpdateUserNameFormView`, both of which take an `outcome: ReactNode` slot — has no place to render
  one, so the change would touch the hook, the container and the view together.
- **A mis-wiring the compiler cannot catch.** `SignInOutcome`'s `signed-in` member declares
  `accessToken?: never`, so `SignInResult` is not assignable to it and passing the raw
  `SessionApi` where a `SessionStarter` is expected fails to compile — the type system enforces that
  the starter, not the API, is what a consumer receives. Sign-out has no payload to strip:
  `SessionApi.signOut`, `requestSignOut` and `SessionEnder.signOut` are all literally
  `() => Promise<SignOutOutcome>`, so writing `sessionEnder: sessionApi` in
  `create-authenticated-transport.ts` **compiles**, and silently skips `store.end()`. The
  consequence is a sign-out that does nothing: the visitor is navigated to `/sign-in` while the
  store still reports `authenticated`, so the access token survives, `clearCacheOnSessionEnd` never
  fires, and the next guarded navigation walks straight back in. A phantom field added purely to
  recreate the compile error was rejected as worse to read than the risk it removes; the
  compensating control is behavioural — the 500 case in
  `create-authenticated-transport.test.ts` fails under any wiring that bypasses the ender, because
  only the ender moves the observer to `anonymous` when the server refuses.
- **The slice publishes one component.** `src/features/sign-out/index.ts` exports `SignOutButton`
  and nothing else; the hook, the view and the props interfaces stay internal, so the slice's
  contract is "give me a callback, I will call it when the session has ended" and its internals stay
  free to change. This matches `features/sign-in`, whose barrel exports `SignInForm` alone.
- **The container/view split is what keeps the control cheap to test.** `SignOutButton` depends on
  exactly one port — the `SessionEnder` it reads through `useSignOut` — so
  `sign-out-button.test.tsx` stands the whole control up through `renderWithProviders`, passing a
  `SessionEnderProvider` holding a one-method object literal as its one extra wrapper, with no store
  and no router underneath. The harness also mounts an `HttpClientProvider` over a stub whose every
  verb rejects by name, so the control's "no HTTP" claim is now asserted rather than assumed. `SignOutButtonView` in turn decides its entire pending appearance from `isSigningOut`,
  so the label, `disabled` and `aria-busy` can be asserted against that one boolean and the view
  needs no test file of its own.
- **`fsd/insignificant-slice` is off for this slice.** steiger's rule flags a slice with a single
  consuming slice, and `features/sign-out` has exactly one today: `pages/user-profile`. The rule
  targets premature slicing, and a user action whose one home is currently a single host is not
  that — keeping it in the `features` layer is what makes the move into `widgets/app-header` a
  relocation rather than a rewrite. The override in `steiger.config.ts` names four globs —
  `./src/features/sign-in/**`, `./src/features/sign-out/**`, `./src/features/switch-locale/**` and
  `./src/features/update-user-name/**` — instead of switching the rule off for `src/features/**`, so
  the next single-consumer slice is still flagged. The exempted consumer need not be a page:
  `switch-locale`'s one consumer is the `widgets/app-header` slice
  ([Internationalization](./internationalization.md)), which is why the rationale is "exactly one
  consuming slice" rather than "exactly one screen".
- **What the backend must do.** The endpoint receives a cookie-authenticated `POST` with an empty
  body, which is precisely the shape a cross-site request forgery can produce: any page can submit a
  form to it and sign the visitor out. The server must therefore reject cross-site requests —
  `SameSite=Lax` or `Strict` on the refresh cookie, or a CSRF token. Logout CSRF is real and
  commonly dismissed as harmless. `/auth/refresh` already carries the same requirement for a much
  worse reason, so this is an existing expectation made explicit rather than a new one.

## Testing

| File                                                                        | Level                   | What it covers                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/entities/session/model/session-ender.test.ts`                          | Unit                    | The `finally` postcondition: the local session ends on `signed-out`, on `unavailable` and when the transport throws (which propagates), and exactly once per call                                                                                                                                                         |
| `src/entities/session/model/session-ender-context.test.tsx`                 | Component               | The provider renders its children; the hook returns the provided ender and throws `useSessionEnder must be called inside a SessionEnderProvider` without one                                                                                                                                                              |
| `src/entities/session/model/session-token-source.test.ts`                   | Unit                    | A `refreshed` result that arrives after `store.end()` resolves `null` and leaves the store `anonymous` (`drops a renewal that settles after the session has ended`) — the only test pinning the concurrent-renewal half of the `finally` postcondition; the file belongs to [Session management](./session-management.md) |
| `src/entities/session/api/session-api.test.ts` (`createSessionApi.signOut`) | Unit                    | Posts `{}` and `noContentSchema` to `/auth/logout`; an empty answer and a 401 both become `signed-out`; a 500 and a 2xx that carries a body both become `unavailable`; a non-`HttpError` is rethrown                                                                                                                      |
| `src/features/sign-out/model/use-sign-out.test.tsx`                         | Hook                    | Idle before anything is clicked; `onSignedOut` fires once on `signed-out`, once on `unavailable`, and once when the ender rejects — where `signOut` still resolves; `isSigningOut` is true while the request is in flight                                                                                                 |
| `src/features/sign-out/ui/sign-out-button.test.tsx`                         | Component               | The accessible name "Sign out" on an enabled button; the caller notified after a click; the pending button labelled "Signing out…", disabled and `aria-busy="true"`; a second click starts no second request                                                                                                              |
| `src/app/entrypoint/create-authenticated-transport.test.ts`                 | Integration (MSW, Node) | Over real axios: a real sign-in authenticates the session, then `signOut` reaches `/auth/logout` with no `authorization` header, returns `signed-out` and leaves the observer `anonymous`; a 500 returns `unavailable` and leaves it `anonymous` too                                                                      |
| `src/app/entrypoint/app-providers.test.tsx`                                 | Component               | `AppProviders` publishes the transport's ender to its children, and drives a controllable observer from `authenticated` to `anonymous` in `clears the query cache when the session ends`, finding the cache empty afterwards                                                                                              |
| `src/app/routes/_authenticated/users.$userId.test.tsx`                      | Route                   | Through the real route tree (`createAppRouter`, memory history): clicking "Sign out" on the profile renders the sign-in heading and leaves `router.state.location.pathname` at `/sign-in`                                                                                                                                 |
| `src/pages/user-profile/ui/user-profile-page.test.tsx`                      | Component               | Finds the control enabled beside the profile's error alert in `offers a way out while the profile is failing to load`, which is why it sits above the three profile states                                                                                                                                                |

`sign-out-button-view.tsx` and `session-ender-provider.tsx` have no test file of their own; the
button and context suites above exercise them. The hook, button, page and route tests substitute the
port with an object literal under `SessionEnderProvider`, such as
`{ signOut: () => Promise.resolve({ status: 'signed-out' }) }`, beside a fresh `QueryClient`;
`session-api.test.ts` fakes the `post` of a `SessionWriteClient`, and only
`create-authenticated-transport.test.ts` puts real HTTP (MSW) under the flow. Component tests render
without an `I18nProvider` because `vitest.setup.ts` installs an English i18n instance before each
test.

**No single test spans `store.end()` → cache clear.** The chain is covered by two that compose:
`create-authenticated-transport.test.ts` proves that `sessionEnder.signOut()` moves the real
observer from `authenticated` to `anonymous`, and `app-providers.test.tsx`'s
`clears the query cache when the session ends` proves that this transition empties the query cache.
No test exercises both halves in one run: removing the `clearCacheOnSessionEnd` subscription from
`AppProviders` fails `app-providers.test.tsx`, not any sign-out test.

```bash
npm test
npx vitest run src/features/sign-out src/entities/session/model/session-ender.test.ts
npx vitest run src/app/entrypoint/create-authenticated-transport.test.ts
npm run test:e2e
```

`npm run test:e2e` runs Playwright over the production build, but no spec covers sign-out (see
below). The runner and conventions are described in
[Unit and component testing](./unit-testing.md) and [End-to-end testing](./e2e-testing.md).

## Known limitations

- **A failed revocation is not a durable sign-out.** `store.end()` drops the in-memory access token,
  but the `httpOnly` refresh cookie is script-unreadable and survives; the session store is
  in-memory, so the next page load starts at `unknown`, the token source refreshes against the live
  cookie and the visitor is authenticated again. This tab is signed out; the browser is not. The gap
  is the surviving cookie on a fresh page load, not this tab's live session: a renewal that was
  already in flight when `store.end()` ran is dropped rather than applied (step 5 of
  [How it works](#how-it-works)), so nothing signs the visitor back in behind them before they
  leave. Only the server can close the remaining gap, which is why the request is made at all and
  why `unavailable` is a modeled outcome rather than a silent one.
- **The redirect can flash the profile's error state.** Between `store.end()` and the route change,
  `clearCacheOnSessionEnd` empties the query cache while `UserProfilePage` is still mounted, so its
  `useQuery` can issue one refetch. That request leaves without a bearer token — `getToken()`
  returns `null` for an `anonymous` store and the request interceptor deletes the header — and its
  401 is not replayed, because `renewToken` returns `null` for an `anonymous` store. A `client`
  `HttpError` is not retryable either, so the query fails at once, `useUserProfile` reports
  `unavailable`, and the `userProfile.unavailable` alert can appear for the instant before
  `/sign-in` renders. The same failure reaches `queryErrorHandlers.onQueryError`, so a sign-out from
  the profile can report one query error to the error reporter. The structural fix is a route-level
  `errorComponent` plus a 401-to-redirect rule; neither exists today.
- **The disabled button drops focus to `<body>`.** Disabling the focused control for the duration of
  the request moves focus out of it, so neither `aria-busy="true"` nor the swapped
  `signOut.inProgress` label is announced to a screen-reader user, and the keyboard focus ring is
  lost until the redirect lands. This is the convention `src/shared/ui/form/submit-button.tsx`
  already sets repo-wide (`disabled={isSubmitting || disabled === true}` beside
  `aria-busy={isSubmitting}`), so changing it is a repo-wide decision, not a sign-out one.
- **`queryClient.clear()` also empties the mutation cache mid-flight.** `QueryClient.clear()` clears
  the query cache and the mutation cache, and step 6 of the flow runs while the sign-out mutation is
  still settling. It is harmless in practice — the `useMutation` observer holds its own reference to
  the mutation, so `onSettled` still fires and `onSignedOut` is still called — but nothing asserts
  the two together, for the reason given under Testing.
- **No end-to-end coverage.** `e2e/` holds `app-shell.spec.ts` and `user-profile.spec.ts`; neither
  clicks the control, and `e2e/fixtures/session-stub.ts` answers only `POST /v1/auth/refresh`.
  Nothing drives `POST /v1/auth/logout` or the redirect against the production build; the capability
  is verified in jsdom alone.
- **A failed remote revocation is invisible to the visitor.** `useSignOut` discards the
  `SignOutOutcome`, so `unavailable` and `signed-out` look identical on screen: the same pending
  label, the same navigation to `/sign-in`. Nobody is told that the session may still be alive on
  the server, which matters most in exactly the case this feature is for — a shared machine with a
  flaky network.
