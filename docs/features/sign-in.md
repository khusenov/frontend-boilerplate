# Sign-in

> **Status:** Complete · **Layers:** app, pages, features, entities, shared, outside layers · **Verified against:** `65a99bc`

## Purpose

A visitor with no session needs a way to start one. A refresh can only renew a session that already
holds an `httpOnly` refresh cookie — the script-unreadable cookie an earlier login leaves behind,
which buys a new access token ([Session management](./session-management.md)) — so until the
credentials exchange existed the session machinery could keep a session alive but never begin one.
Sign-in turns an email and a password into an `authenticated` session from the `/sign-in` screen
and tells the visitor exactly one of four things — signed in, rejected, rate-limited or
unavailable — while keeping the access token out of UI code and the password out of every cache and
error report that could outlive the form. It is also the repo's reference credentials form: the
route injects navigation, so the same form works in any host.

## How it works

Three repo terms run through the walkthrough below. A _port_ — this repo also says _seam_ — is an
interface a consumer programs against instead of naming a concrete implementation; the _composition
root_ is `src/app/entrypoint/**` ([Composition root](./composition-root.md)), the one place that
constructs concretes and binds them to those ports; and a slice's `index.ts` is its _public API_,
the only file other slices may import.
[Architecture](#architecture) below covers the rest of the Feature-Sliced Design vocabulary and
names this feature's three seams.

1. **Arrival.** A visitor reaches `/sign-in` by typing the URL or because the
   [authenticated route guard](./route-guard.md) turned them away from a private route. The route
   module, `src/app/routes/sign-in.tsx`, declares no `beforeLoad` and no `loader`, so arriving sends
   no API request. Its component, `SignInRoute`, renders `SignInPage` and passes it `onSignedIn`, a
   callback that runs `navigate({ to: '/' })`.
2. **Screen.** `SignInPage` renders a `<main>` holding the `signIn.title` heading and `SignInForm`,
   and forwards `onSignedIn` unchanged.
3. **Container.** `SignInForm` calls `useSignIn({ onSignedIn })` and `useCredentialsSchema()` and
   renders the presentational `SignInFormView` with `schema`, `onSubmit={submit}`,
   `onEdited={dismissOutcome}` and `outcome={<SignInAlert status={status} />}`.
4. **Validation.** `SignInFormView` builds its form with `useAppForm` from the form seam in
   `@/shared/ui/form` ([Forms](./forms.md)): empty `email` and `password` fields, the
   `CredentialsSchema` as the `onChange` validator, and a form-level `onChange` listener that calls
   `onEdited`. The schema accepts any value that is a valid email address once trimmed and any
   non-empty password; while a rule fails, submitting reveals the field message and never calls
   `onSubmit`.
5. **Submit.** `submit(credentials)` awaits `mutateAsync` on a TanStack Query mutation whose
   `mutationFn` calls `SessionStarter.signIn(credentials)` with the values exactly as typed. While
   that promise is pending, the form's `SubmitButton` is disabled and shows `signIn.submitting`, and
   `status` is `submitting`.
6. **Exchange.** The starter built by `createSessionStarter` calls its injected `requestSignIn`,
   which the composition root — here `src/app/entrypoint/create-authenticated-transport.ts` — bound
   to `SessionApi.signIn`. That maps the credentials with `toSignInRequestDto` (email trimmed and
   lowercased, password untouched), posts them to `/auth/login` on the unauthenticated HTTP client,
   and validates the answer against `signInResponseDtoSchema` — a non-empty `accessToken`. A valid
   answer becomes `{ status: 'signed-in', accessToken }`. An `HttpError` with status 401 becomes
   `rejected`, 429 becomes `rate-limited`, and any other `HttpError` — another status, no response,
   a timeout, a body that fails the schema — becomes `unavailable`.
7. **Session start.** On `signed-in` the starter calls `store.start(accessToken)`, so the session
   store reports `authenticated` to its observers, and returns `{ status: 'signed-in' }` without the
   token. Any other result is returned as a fresh `{ status }` literal and the store is left
   untouched.
8. **Outcome.** `useSignIn` derives a `SignInStatus` from the mutation with `toSignInStatus`. On
   `signed-in`, the mutation's `onSuccess` calls `onSignedIn` and the route navigates to `/`. On
   `rejected`, `rate-limited` or `unavailable` the visitor stays on the page with both fields still
   filled in, and `SignInAlert` — a `role="alert"` paragraph that is always mounted — announces
   `signIn.rejected`, `signIn.rateLimited` or `signIn.unavailable`. Editing either field calls
   `dismissOutcome`, which resets a settled attempt to `idle` and empties the alert; it does nothing
   while a request is in flight.

The token now lives in the same store the rest of the session machinery reads, so the next guarded
navigation resolves `authenticated` without a refresh request, and the authenticated HTTP client
sends the token as its bearer credential ([Session management](./session-management.md)). Whatever
the outcome, once the form unmounts the settled mutation is collected from the mutation cache with
no delay (`gcTime: 0`), taking the typed password with it.

One failure path matters:

- **The starter rejects instead of resolving.** Only a failure that is not an `HttpError` can make
  it, because every expected transport failure has already been classified into an outcome. The
  mutation settles as `error`, `status` becomes `unavailable`, `submit` still resolves, and the
  query client's mutation-cache handler hands the error to the app's error reporter
  ([Error handling and reporting](./error-handling.md)).

## Architecture

Feature-Sliced Design (FSD) stacks the code in _layers_ — the top-level folders under `src/`, which
may import only downward in the order `app` → `pages` → `widgets` → `features` → `entities` →
`shared`. This feature spans every one of them except `widgets`, whose one slice — the app-shell
header — this feature does not touch, plus one root config file the layers do not cover, which the table below marks `outside layers`. A
_slice_ is one screen, user action or business noun inside a layer — here `pages/sign-in` (a screen),
`features/sign-in` (a user action) and `entities/session` (a business noun) — and a _segment_ is a
purpose-named folder inside a slice: `ui/` for components,
`model/` for domain types, state, hooks, schemas and ports, `api/` for DTOs, wire schemas, mappers
and HTTP calls. The table below writes a component's home as `slice · segment`, so
`features/sign-in · ui` means the `ui` folder of the `features/sign-in` slice; `app` and `shared`
have segments but no slices, so their rows name the segment alone (`app/routes`, `shared/i18n`).
The three terms glossed at the top of [How it works](#how-it-works) — _public API_, _port_ (also
_seam_) and _composition root_ — land here in two files:
`src/app/entrypoint/create-authenticated-transport.ts` constructs this feature's concretes and
`src/app/entrypoint/app-providers.tsx` publishes them to the tree.

The flow depends on three seams and names none of their concretes. `useSignIn` programs against the
`SessionStarter` port — one method, `signIn(credentials): Promise<SignInOutcome>` — which it reads
from React context with `useSessionStarter()`. Its only implementation, `createSessionStarter`,
receives two deliberately narrow collaborators as options: a `SessionStartTarget`
(`Pick<SessionStore, 'start'>`, so the starter can start a session but never read or end one —
ending it is the separate `SessionEnder` port's job; see [Sign-out](./sign-out.md)) and a
`requestSignIn` function. `createAuthenticatedTransport` binds both at the composition root — the
single `createSessionStore()` instance as the store, `sessionApi.signIn` from a
`createSessionApi(unauthenticatedClient)` instance as `requestSignIn` — and `AppProviders`
publishes the starter through `SessionStarterProvider`, nested inside `HttpClientProvider` and
`SessionResolverProvider`. The second seam is validation: `SignInFormView` receives a
`CredentialsSchema`, a `StandardSchemaV1<Credentials, Credentials>` rather than a Zod type, and
`useCredentialsSchema` supplies the `zod/mini` implementation. The third is navigation: the
`onSignedIn` callback, whose only concrete is the route's `navigate({ to: '/' })`. Imports run
strictly downward through each slice's public `index.ts` — `app/routes/sign-in.tsx` →
`@/pages/sign-in` → `@/features/sign-in` → `@/entities/session` → `@/shared/*` — and ESLint's
`no-restricted-imports` bans importing `createSessionStarter` and `createSessionApi` from
`@/entities/session` in every lower layer and in `app/routes` and `app/router`, so only
`app/entrypoint` can construct a starter or reach the login endpoint around the port.

| Component                                         | Layer                      | Responsibility                                                                                                                                                                              | File                                                                               |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Route`, `SignInRoute`                            | `app/routes`               | Registers `/sign-in` and supplies `onSignedIn` as `navigate({ to: '/' })`; the only module in the flow that knows navigation exists                                                         | `src/app/routes/sign-in.tsx`                                                       |
| `SignInPage`                                      | `pages/sign-in · ui`       | A `<main>` with the `signIn.title` heading around `SignInForm`; reads no route state                                                                                                        | `src/pages/sign-in/ui/sign-in-page.tsx`                                            |
| `SignInForm`                                      | `features/sign-in · ui`    | Container: wires `useSignIn` and `useCredentialsSchema` into the view                                                                                                                       | `src/features/sign-in/ui/sign-in-form.tsx`                                         |
| `SignInFormView`                                  | `features/sign-in · ui`    | Presentational form on `useAppForm`: two `TextField`s, a `SubmitButton` and an outcome slot, with schema and outcome passed in as props                                                     | `src/features/sign-in/ui/sign-in-form-view.tsx`                                    |
| `SignInAlert`                                     | `features/sign-in · ui`    | Always-mounted `role="alert"` live region; maps a status to its message key                                                                                                                 | `src/features/sign-in/ui/sign-in-alert.tsx`                                        |
| `useSignIn`                                       | `features/sign-in · model` | Drives `SessionStarter.signIn` through `useMutation` with `gcTime: 0`; returns `status`, `submit` and `dismissOutcome`                                                                      | `src/features/sign-in/model/use-sign-in.ts`                                        |
| `SignInStatus`, `toSignInStatus`, `isDismissible` | `features/sign-in · model` | One view status from the mutation lifecycle and the outcome; which statuses an edit dismisses                                                                                               | `src/features/sign-in/model/sign-in-status.ts`                                     |
| `createCredentialsSchema`, `CredentialsSchema`    | `features/sign-in · model` | Email-shape and password-presence rules, with their messages passed in as strings                                                                                                           | `src/features/sign-in/model/credentials-schema.ts`                                 |
| `useCredentialsSchema`                            | `features/sign-in · model` | Resolves the two validation messages with `t` and memoises the schema on `[t]`                                                                                                              | `src/features/sign-in/model/use-credentials-schema.ts`                             |
| `SessionStarter`, `createSessionStarter`          | `entities/session · model` | The port, and its implementation: request, then `store.start()`, then a token-free outcome                                                                                                  | `src/entities/session/model/session-starter.ts`                                    |
| `useSessionStarter`, `SessionStarterContext`      | `entities/session · model` | Reads the published starter; throws outside a provider                                                                                                                                      | `src/entities/session/model/session-starter-context.ts`                            |
| `SessionStarterProvider`                          | `entities/session · model` | Publishes a starter to the tree below it                                                                                                                                                    | `src/entities/session/model/session-starter-provider.tsx`                          |
| `Credentials`, `toNormalizedEmail`                | `entities/session · model` | The credentials model and the email rule: trim, then lowercase                                                                                                                              | `src/entities/session/model/credentials.ts`                                        |
| `SignInResult`, `SignInOutcome`                   | `entities/session · model` | The token-carrying transport result and the token-free outcome the UI sees                                                                                                                  | `src/entities/session/model/sign-in-result.ts`                                     |
| `createSessionApi` (`signIn`)                     | `entities/session · api`   | `POST /auth/login` and the 401 / 429 / other classification                                                                                                                                 | `src/entities/session/api/session-api.ts`                                          |
| `signInResponseDtoSchema`, `SignInRequestDto`     | `entities/session · api`   | Wire shapes of the login response and request                                                                                                                                               | `src/entities/session/api/session-dto.ts`                                          |
| `toSignInRequestDto`, `toIssuedAccessToken`       | `entities/session · api`   | Outbound mapper (normalised email) and inbound mapper (branded `AccessToken`)                                                                                                               | `src/entities/session/api/session-mapper.ts`                                       |
| `createAuthenticatedTransport`                    | `app/entrypoint`           | Builds the unauthenticated client and binds `createSessionStarter({ store: sessionStore, requestSignIn: sessionApi.signIn })`                                                               | `src/app/entrypoint/create-authenticated-transport.ts`                             |
| `AppProviders`                                    | `app/entrypoint`           | Mounts `SessionStarterProvider` with the transport's starter                                                                                                                                | `src/app/entrypoint/app-providers.tsx`                                             |
| `signIn.*` keys                                   | `shared/i18n`              | English and Russian copy for the screen, the form, the outcomes and the validation rules                                                                                                    | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json` |
| `fsd/insignificant-slice` override                | `outside layers`           | Keeps steiger from asking to merge `features/sign-in` into its single consumer; the same override also covers `features/sign-out`, `features/switch-locale` and `features/update-user-name` | `steiger.config.ts`                                                                |

## Public surface

### Routes

| Path       | Auth     | Purpose                                                                                       |
| ---------- | -------- | --------------------------------------------------------------------------------------------- |
| `/sign-in` | `public` | The credentials screen and the guard's redirect target; a successful sign-in navigates to `/` |

### Slice public APIs

`@/pages/sign-in` (`src/pages/sign-in/index.ts`):

| Export       | Kind      | Contract                                                                                                      |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------- |
| `SignInPage` | component | Props `{ readonly onSignedIn: () => void }`. Renders the page heading and `SignInForm`; takes no route state. |

`@/features/sign-in` (`src/features/sign-in/index.ts`):

| Export       | Kind      | Contract                                                                                                                                                                                                                                         |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SignInForm` | component | Props `{ readonly onSignedIn: () => void }`, called when an attempt resolves `signed-in`. Needs a `QueryClientProvider`, a `SessionStarterProvider` and an initialized i18n instance (`I18nProvider`) above it; `AppProviders` mounts all three. |

Everything else in the slice — `useSignIn`, `SignInStatus`, `createCredentialsSchema`,
`useCredentialsSchema`, `SignInFormView`, `SignInAlert` — is internal.

`@/entities/session`, the sign-in half of `src/entities/session/index.ts`:

| Export                   | Kind                           | Contract                                                                                                                                                                                                           |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Credentials`            | type                           | `{ readonly email: string; readonly password: string }`                                                                                                                                                            |
| `SignInOutcome`          | type                           | One of `{ status: 'signed-in'; accessToken?: never }`, `{ status: 'rejected' }`, `{ status: 'rate-limited' }`, `{ status: 'unavailable' }`, every member `readonly`                                                |
| `SessionStarter`         | type (port)                    | `{ readonly signIn: (credentials: Credentials) => Promise<SignInOutcome> }`                                                                                                                                        |
| `useSessionStarter`      | hook                           | `(): SessionStarter`; throws `useSessionStarter must be called inside a SessionStarterProvider` when no provider is above it                                                                                       |
| `SessionStarterProvider` | component                      | Props `{ readonly sessionStarter: SessionStarter; readonly children: ReactNode }`                                                                                                                                  |
| `createSessionStarter`   | factory, `app/entrypoint` only | `(options: CreateSessionStarterOptions) => SessionStarter`, the options being `{ readonly store: SessionStartTarget; readonly requestSignIn: (credentials: Credentials) => Promise<SignInResult> }`                |
| `createSessionApi`       | factory, `app/entrypoint` only | `(unauthenticatedClient: SessionWriteClient) => SessionApi`, where `SessionWriteClient` is `Pick<HttpClient, 'post'>`; its `signIn` is the login half documented here, its `refresh` belongs to session management |

`CreateSessionStarterOptions`, `SessionStartTarget`, `SignInResult`, `SessionApi` and
`SessionWriteClient` are not exported; the composition root satisfies them structurally. The rest of
the barrel — the store, the observer, the token source, the resolver and the ender — is documented
in [Session management](./session-management.md), [Authenticated route guard](./route-guard.md) and
[Sign-out](./sign-out.md).

### HTTP contract

| Aspect                | Contract                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request               | `POST {VITE_API_BASE_URL}/auth/login` — `/v1/auth/login` with the default base URL — on the unauthenticated client, so no `Authorization` header |
| Body                  | `SignInRequestDto` `{ email, password }`: the email trimmed and lowercased by `toSignInRequestDto`, the password sent exactly as typed           |
| Success               | A 2xx body that passes `signInResponseDtoSchema`, an `accessToken` that is a non-empty string → `signed-in`                                      |
| 401                   | `rejected`                                                                                                                                       |
| 429                   | `rate-limited`                                                                                                                                   |
| Any other `HttpError` | `unavailable`: another status, no response, a timeout, or a body that fails the schema (a missing or empty `accessToken`)                        |
| Any other error       | Rethrown by `SessionApi.signIn` and by `SessionStarter.signIn`; `useSignIn` shows `unavailable`                                                  |

### Copy

The keys live in the `common` namespace, typed from `src/shared/i18n/locales/en/common.json`:

| Key                                  | English                                        | Russian                                                 | Rendered by                                   |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| `signIn.title`                       | Sign in                                        | Вход                                                    | `SignInPage` heading                          |
| `signIn.formLabel`                   | Sign in                                        | Вход                                                    | The form's `aria-label`, its accessible name  |
| `signIn.email`                       | Email                                          | Электронная почта                                       | Email field label                             |
| `signIn.password`                    | Password                                       | Пароль                                                  | Password field label                          |
| `signIn.submit`                      | Sign in                                        | Войти                                                   | Submit button                                 |
| `signIn.submitting`                  | Signing in…                                    | Вход…                                                   | Submit button while a request is pending      |
| `signIn.rejected`                    | Email or password is incorrect.                | Неверная почта или пароль.                              | `SignInAlert` on `rejected`                   |
| `signIn.rateLimited`                 | Too many attempts. Try again in a few minutes. | Слишком много попыток. Повторите через несколько минут. | `SignInAlert` on `rate-limited`               |
| `signIn.unavailable`                 | Sign-in is unavailable right now. Try again.   | Вход сейчас недоступен. Попробуйте ещё раз.             | `SignInAlert` on `unavailable`                |
| `signIn.validation.emailInvalid`     | Enter a valid email address.                   | Введите корректный адрес электронной почты.             | Email rule, through `useCredentialsSchema`    |
| `signIn.validation.passwordRequired` | Enter your password.                           | Введите пароль.                                         | Password rule, through `useCredentialsSchema` |

Field keys are flat (`signIn.email`), with the validation messages grouped under
`signIn.validation`. The `validation.invalid` fallback that `TextField` shows for an error it cannot
stringify belongs to [Forms](./forms.md); namespaces, typed keys and locale loading belong to
[Internationalization](./internationalization.md).

## Configuration

| Variable / option                           | Default                                                                                   | Meaning                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                         | `/v1` (`DEFAULT_API_BASE_URL`; a blank or whitespace-only value also falls back)          | Base URL of the unauthenticated client, so the login posts to `{VITE_API_BASE_URL}/auth/login`. `appConfig.apiBaseUrl` reads it, `App` passes it to `AppProviders`, and `AppProviders` hands it to `createAuthenticatedTransport`                                         |
| `server.proxy['/v1']` in `vite.config.ts`   | `http://localhost:8000`                                                                   | Forwards `/v1/*`, the login included, to a local API under `npm run dev`, and under `npm run preview`, which inherits `server.proxy`                                                                                                                                      |
| `sendCookies` on the unauthenticated client | `true`, set by `createAuthenticatedTransport` (the `createHttpClient` default is `false`) | Turns on axios `withCredentials` for the login and refresh exchanges                                                                                                                                                                                                      |
| `timeoutMilliseconds`                       | `15_000` (`DEFAULT_TIMEOUT_MILLISECONDS`; `createAuthenticatedTransport` passes none)     | A login slower than this fails as a `timeout` `HttpError` and shows `unavailable`                                                                                                                                                                                         |
| Mutation `gcTime`                           | `0`, hard-coded in `useSignIn`                                                            | Removes the attempted credentials from the mutation cache as soon as the form unmounts; deliberately not configurable                                                                                                                                                     |
| Mutation `retry`                            | `false`, the mutation default set by `createQueryClient`                                  | A failed attempt is never retried automatically; every expected failure resolves as an outcome rather than an error, so the only thing left to retry is a thrown non-`HttpError` — a bug, not a modeled outcome — which would fail the same way and only delay the report |
| `onSignedIn` prop                           | `navigate({ to: '/' })`, passed by `SignInRoute`                                          | What happens after a `signed-in` outcome; the only navigation the flow performs                                                                                                                                                                                           |

`.env.example` ships `VITE_API_BASE_URL=/v1`; [Configuration and environment](./configuration.md)
covers how `appConfig` reads it.

## Usage & extension

### Try it locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open `/sign-in` on the dev server, either directly or by visiting a private route such as
`/users/<id>`, which the guard redirects there. `vite.config.ts` proxies `/v1` to
`http://localhost:8000`; with no API listening there, a valid submission shows
`signIn.unavailable` ("Sign-in is unavailable right now. Try again."), which is the transport,
validation and outcome path working end to end. Against an API that serves `POST /v1/auth/login`, a
correct pair signs in and lands on `/`.

### Link to the screen

Nothing links to `/sign-in` today. `Link` is the one `@tanstack/react-router` export a page may
import, so a page's `ui` segment offers the screen like this:

```tsx
import { Link } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n';

export function SignInLink() {
  const { t } = useTranslation();

  return <Link to="/sign-in">{t('signIn.title')}</Link>;
}
```

`to` is checked against the generated route tree, so a mistyped path fails `npm run typecheck`.

### Host the form somewhere else

`SignInForm` asks its host for one thing, `onSignedIn`, and needs the `QueryClientProvider`,
`SessionStarterProvider` and initialized i18n instance (`I18nProvider`) that `AppProviders` already
mounts around the whole app — every rendered piece of the chain (`SignInFormView`'s labels and
button, `SignInAlert`'s messages, `useCredentialsSchema`'s validation strings) calls
`useTranslation`, so without i18n the host renders raw keys. A page or widget
that embeds it takes the callback as a prop and leaves navigation to its route module, as
`SignInPage` does. A host that can disappear mid-request, such as a dialog, must accept that closing
it does not cancel the attempt (see [Known limitations](#known-limitations)).

To change where a successful sign-in lands, change the `to` passed to `navigate` in
`src/app/routes/sign-in.tsx`; nothing below the route knows the destination.

### Add a sign-in outcome

Suppose the API starts answering `423 Locked` for an account locked after repeated failures, and the
form should say so. The status types are closed unions consumed through total maps, so after the
first edit the compiler lists most of the remaining ones.

1. Add the member to both unions in `src/entities/session/model/sign-in-result.ts`.
   `createSessionStarter` forwards every non-`signed-in` status as `{ status: result.status }`, so it
   stops compiling if `SignInResult` gains a member that `SignInOutcome` lacks:

   ```ts
   import type { AccessToken } from './access-token';

   export type SignInOutcome =
     | { readonly status: 'signed-in'; readonly accessToken?: never }
     | { readonly status: 'rejected' }
     | { readonly status: 'rate-limited' }
     | { readonly status: 'locked' }
     | { readonly status: 'unavailable' };

   export type SignInResult =
     | { readonly status: 'signed-in'; readonly accessToken: AccessToken }
     | { readonly status: 'rejected' }
     | { readonly status: 'rate-limited' }
     | { readonly status: 'locked' }
     | { readonly status: 'unavailable' };
   ```

2. Classify the status in `src/entities/session/api/session-api.ts`: a `LOCKED_STATUS = 423`
   constant beside `TOO_MANY_REQUESTS_STATUS`, and a `case LOCKED_STATUS` returning
   `{ status: 'locked' }` in the `switch` of `signIn`, with a matching case in `session-api.test.ts`.
   This is the one step the compiler cannot demand: without it the `default` branch keeps answering
   `unavailable`.
3. `toSignInStatus` in `src/features/sign-in/model/sign-in-status.ts` now fails to compile, because
   an outcome's status must be a `SignInStatus`. Add `'locked'` to `SignInStatus`; the two total maps
   then fail until each gains an entry — `locked: true` in `IS_DISMISSIBLE_BY_STATUS`, and
   `locked: 'signIn.locked'` in `MESSAGE_KEY_BY_STATUS` in `src/features/sign-in/ui/sign-in-alert.tsx`.
4. Add `signIn.locked` to `src/shared/i18n/locales/en/common.json` — `t` is typed from that file, so
   the alert does not compile without it — and to `src/shared/i18n/locales/ru/common.json`, which
   `src/shared/i18n/lazy-locale-loader.test.ts` checks for every English key family.
5. Cover the new status in `use-sign-in.test.tsx` and `sign-in-form.test.tsx`.

## Design decisions & trade-offs

- **The access token never reaches the UI.** `SessionApi.signIn` returns a `SignInResult` whose
  `signed-in` member carries the `AccessToken`; `createSessionStarter` hands that token to
  `store.start()` and returns a `SignInOutcome` whose `signed-in` member declares
  `accessToken?: never`, a field no value can inhabit. Assigning a result to an outcome, or passing
  the raw API where a `SessionStarter` is expected, is therefore a compile error, and every branch of
  the starter re-emits a fresh literal instead of forwarding the transport's object, so the boundary
  holds even if a future result carries data its outcome twin omits. `SignInResult` is not exported
  from `@/entities/session`. A component that can start a session still cannot read the credential,
  so the token cannot reach `localStorage`, a log line or a third-party widget through this port —
  the same decision `toSessionObserver` makes for the read side of the session.
- **Expected failures are outcomes, not exceptions.** `SessionApi.signIn` catches every `HttpError`
  and classifies it, so the screen can tell a wrong password from a rate limit from an outage — a
  401 indistinguishable from a 500 is the failure mode this avoids. There is a second reason specific
  to this endpoint: `toHttpErrorFromAxios` keeps the raw `AxiosError` as the `HttpError`'s `cause`,
  and its `config.data` is the serialised request body, here the plaintext password. A rethrown
  `HttpError` would travel through the mutation cache's `onError` into the error reporter
  ([Error handling and reporting](./error-handling.md)). Only failures that are not an
  `HttpError` — bugs, not outcomes — propagate, and they reach the reporter as an error rather
  than passing silently as an outage. The handler `createQueryClient` installs
  receives the mutation's variables too, and forwards only the error and a mutation hash.
- **`gcTime: 0` is load-bearing, not tuning.** TanStack Query stores the `mutationFn` argument as
  `mutation.state.variables`, and no reducer clears it. With the default five-minute mutation
  `gcTime`, the plaintext credentials would stay enumerable through
  `queryClient.getMutationCache().getAll()` long after the form unmounted. The threat model is the
  one the first decision above — keeping the access token out of the UI — shares with
  [Session management](./session-management.md): anything JavaScript can read, injected JavaScript
  can read, so a credential is exactly as safe as the reach of page code. Judged that way, a cached
  password is the worse of the two exposures: the token never leaves the session store's closure and
  no provider hands a component anything that returns it, while `QueryClientProvider` publishes the
  client whose mutation cache holds the credentials — and an in-memory token exposes one page
  lifetime, where a captured password is durable. `mutation.reset()` does not help, because removing
  an observer only schedules collection; the collection delay is what matters. The invariant — the
  mutation must not outlive the form that holds the credential — has a regression test in
  `use-sign-in.test.tsx`.
- **The login rides the unauthenticated client.** `createSessionApi` receives the client built with
  `sendCookies: true` and no bearer-token source, so no renew-and-replay interceptor sits on it. On
  the authenticated client, that interceptor would read a wrong-password 401 as an expired token and
  fire a refresh; `create-authenticated-transport.test.ts` pins that a rejected sign-in leaves the
  session `unknown`. It is also the only client with axios `withCredentials`, which a cross-origin
  API needs so it can set the refresh cookie on the login response; later refresh requests then
  present that cookie back to it. The two-client composition itself belongs to
  [HTTP transport](./http-transport.md) and
  [Session management](./session-management.md).
- **Navigation is injected, and only the route knows it exists.** `onSignedIn` is threaded route →
  page → form. Below `app`, ESLint's `no-restricted-imports` allows only `Link` from
  `@tanstack/react-router`, so the rule is enforced rather than encouraged. The form therefore moves
  into a dialog, a drawer or another router unchanged, and neither the page nor the slice needs a
  router in its tests. The route navigates client-side instead of reloading through
  `window.location.href`, so the query cache the app has already warmed survives the sign-in.
- **The starter travels through React context, not the router context.** It is called from a submit
  handler inside a component, so `SessionStarterProvider` is enough. `AppRouterContext` carries only
  what `beforeLoad` and `loader` need outside React — `httpClient`, `queryClient` and
  `sessionResolver` — and the `/sign-in` route has neither.
- **Only the hook leaves the slice, never the context.** `src/entities/session/index.ts` exports
  `useSessionStarter` but not `SessionStarterContext`, because `use(SessionStarterContext)` yields
  `SessionStarter | null` and the hook is the only thing that turns that `null` into the
  `useSessionStarter must be called inside a SessionStarterProvider` throw. Exporting the context
  would let a caller read it directly, skip the check and fail later with an unrelated symptom.
  [Authenticated route guard](./route-guard.md) withholds `SessionResolverContext` for the same
  reason.
- **Validation checks presence and email shape, nothing more.** Password-strength rules belong to
  sign-up: enforced at sign-in they leak the policy to attackers and lock out users whose password
  predates the current rules. `isPresent` does not trim, unlike its `update-user-name` counterpart,
  because leading and trailing spaces are legitimate password characters. The email rule tests the
  trimmed value but the schema passes the typed value through: normalisation (`toNormalizedEmail`,
  trim then lowercase) happens once, in the outbound mapper `toSignInRequestDto`, so every caller of
  the port gets it, and `sign-in-form.test.tsx` pins that the form forwards `'Ada@Example.test'`
  verbatim. An empty email produces one message, `signIn.validation.emailInvalid`, rather than a
  "required" and an "invalid" message competing.
- **A rejection does not say which field was wrong.** `signIn.rejected` reads "Email or password is
  incorrect." for every 401, because telling an unknown email from a wrong password is an
  account-enumeration oracle.
- **One status union, read only through total maps.** `SignInStatus` merges the mutation lifecycle
  (`idle`, `submitting`) with the four outcomes. Its consumers read it only through total `Record`s —
  `IS_DISMISSIBLE_BY_STATUS` in `sign-in-status.ts`, checked with
  `satisfies Record<SignInStatus, boolean>`, and `MESSAGE_KEY_BY_STATUS` in `sign-in-alert.tsx`,
  checked with `satisfies Record<SignInStatus, string | undefined>` — never through an open
  predicate, so a new status is a compile error at both sites rather than a silently missed branch.
  The maps are separate because dismissibility is not "has a message": `signed-in` is dismissible
  and silent, `submitting` is neither.
- **The alert is always mounted.** `SignInAlert` renders its `role="alert"` paragraph even when it
  is empty, because a live region must be in the DOM before its content changes or screen readers
  stay silent. The email field declares `autoComplete="username"` beside the password's
  `current-password`, so password managers recognise the pair and offer to fill and save it.
- **`submit` awaits, then swallows.** Awaiting `mutateAsync` keeps TanStack Form's `isSubmitting`
  true for the whole request, which disables the submit button and prevents a double submit.
  Swallowing the rejection is safe because `status` already renders the failure and the mutation
  cache has already reported it; letting it propagate would report the same failure twice. The form
  therefore passes no `onSubmitError` to `form.Form`: [Forms](./forms.md) asks each form to pick one
  of the two.
- **`fsd/insignificant-slice` is off for this slice.** steiger's rule flags a slice with a single
  consumer; without the override, `npm run arch` would report this for `features/sign-in`:
  `This slice has only one reference in slice "pages/sign-in". Consider merging them.` The rule
  targets premature slicing, and a user action whose one home is a single screen is not that:
  keeping the action in the `features` layer keeps `pages/sign-in` a heading around a form and
  leaves `SignInForm` reusable from any other host. The override in `steiger.config.ts` names one
  glob per slice that has made this decision — `./src/features/sign-in/**`,
  `./src/features/sign-out/**`, `./src/features/switch-locale/**` and
  `./src/features/update-user-name/**`, every slice on the `features` layer today — instead of switching the rule off for `src/features/**`, so the next
  single-consumer slice is still flagged until someone makes the same decision for it.
- **The bundle cost stays off the initial load.** In a production build (`npm run build`), the
  `/sign-in` route's own chunk, `sign-in-*.js`, is about 2.6 kB raw and 1.2 kB gzipped: the slice's
  schema, hooks and components, the page and the route component. The exchange itself is not in it —
  `createSessionApi` and `createSessionStarter` ship in the entry chunk, because the composition root
  constructs them at boot. The form seam (TanStack Form and the field components) lives in one
  shared chunk, `form-*.js`, about 74 kB raw and 19 kB gzipped, imported by both `sign-in-*.js` and
  `users._userId-*.js`. `index.html` does not modulepreload it; the entry names it only in its
  `__vite__mapDeps` table, from which it is fetched with whichever route needs it first, so a visitor
  who has opened `/sign-in` pays nothing more for the form seam on the profile route. The shared
  chunks date from this slice's arrival: once a second route needed the form seam, `zod/mini` and
  the `shared/ui` primitives, Rollup split them into `form-*.js`, `schemas-*.js` (Zod) and
  `button-*.js` (the primitives and i18next), and the `8fe59fc` commit message records that most of
  that step's gzip growth came from the split itself, since separately gzipped chunks lose a shared
  compression context.

## Testing

| File                                                                       | Level                   | What it covers                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/sign-in/model/credentials-schema.test.ts`                    | Unit                    | A valid pair passes; an empty email reports one message; an address with no domain fails; a padded address passes; an empty password fails but one of only spaces passes; every rule uses the caller's message                                                                                                                                                             |
| `src/features/sign-in/model/use-sign-in.test.tsx`                          | Hook                    | `idle` before any submit; each outcome becomes its status; `onSignedIn` fires once, and only on `signed-in`; a throwing starter becomes `unavailable` without rejecting; `submitting` while in flight; dismissal resets a settled failure and ignores `idle` and in-flight attempts; the mutation cache is empty after unmount                                             |
| `src/features/sign-in/ui/sign-in-form.test.tsx`                            | Component               | The form's accessible name, the `autocomplete` pair and the masked password; an empty live region on mount; credentials forwarded verbatim; invalid input blocks the attempt; the copy for each outcome, with a rejection naming no field; the email kept after a rejection; the alert cleared by an edit; the pending label on a disabled button; a keyboard-only sign-in |
| `src/entities/session/model/session-starter.test.ts`                       | Unit                    | Starts the session and withholds the token; leaves the store untouched on `rejected`, `rate-limited`, `unavailable` and on a throw, which propagates; passes credentials through unchanged; against the real store, publishes once per distinct token                                                                                                                      |
| `src/entities/session/model/session-starter-context.test.tsx`              | Component               | The provider renders its children; the hook returns the provided starter and throws without a provider                                                                                                                                                                                                                                                                     |
| `src/entities/session/api/session-api.test.ts` (`createSessionApi.signIn`) | Unit                    | Posts the normalised credentials and `signInResponseDtoSchema` to `/auth/login`; a token on success; 401, 429 and 500; a missing or empty token becomes `unavailable`; a non-`HttpError` is rethrown                                                                                                                                                                       |
| `src/entities/session/api/session-mapper.test.ts`                          | Unit                    | `toIssuedAccessToken`; `toSignInRequestDto` trims and lowercases the email and preserves the password's whitespace and case                                                                                                                                                                                                                                                |
| `src/app/entrypoint/create-authenticated-transport.test.ts`                | Integration (MSW, Node) | A sign-in over a real axios client authenticates the session and makes the next request carry `Bearer issued-token`, with the email normalised on the wire; a 401 sign-in leaves the session `unknown`                                                                                                                                                                     |
| `src/app/entrypoint/app-providers.test.tsx`                                | Component               | `AppProviders` publishes the transport's starter                                                                                                                                                                                                                                                                                                                           |
| `src/app/routes/sign-in.test.tsx`                                          | Route                   | Through the real route tree (`createAppRouter`, memory history) and an HTTP client that fails every call: the page renders at `/sign-in`, a rejection keeps the visitor there, a success navigates to `/`                                                                                                                                                                  |

`sign-in-status.ts`, `sign-in-alert.tsx`, `sign-in-form-view.tsx`, `use-credentials-schema.ts` and
`session-starter-provider.tsx` have no file of their own; the hook and form suites above exercise
them. `pages/sign-in` has no co-located test on purpose: it imports nothing from the router and is a
heading around `SignInForm`, whose behaviour its own slice tests, while `sign-in.test.tsx` renders the
page through the real route tree. A co-located test would stand up the same two providers to assert
nothing those suites do not. The hook, form and route tests substitute the port with an object
literal under `SessionStarterProvider`, such as
`{ signIn: () => Promise.resolve({ status: 'rejected' }) }`, beside a fresh `QueryClient`;
`session-api.test.ts` fakes the `post` of a `SessionWriteClient`, and only
`create-authenticated-transport.test.ts` puts real HTTP (MSW) under the flow. Component tests render
without an `I18nProvider` because `vitest.setup.ts` installs an English i18n instance before each
test.

```bash
npm test
npx vitest run src/features/sign-in src/entities/session src/app/routes/sign-in.test.tsx
npx vitest run src/app/entrypoint/create-authenticated-transport.test.ts
npm run test:e2e
```

`npm run test:e2e` runs Playwright over the production build, but no spec covers sign-in yet (see
below). The runner and conventions are described in [Unit and component testing](./unit-testing.md)
and [End-to-end testing](./e2e-testing.md).

## Known limitations

- **No end-to-end coverage.** `e2e/` holds `app-shell.spec.ts` and `user-profile.spec.ts`; neither
  visits `/sign-in`, and `e2e/fixtures/session-stub.ts` answers only `POST /v1/auth/refresh`.
  Nothing drives the form, `POST /v1/auth/login` or the navigation home against the production
  build; the flow is covered by Vitest alone.
- **Nothing links to `/sign-in`.** No component renders a `<Link>` to it: the app's one
  navigational `<Link>` is `NotFoundPage`'s link to `/`, and the only other `<Link>` in `src` is a
  never-rendered `@ts-expect-error` fixture in `create-app-router.test.tsx` that asserts a mistyped
  route fails typecheck. The screen is reached by typing its URL or through the guard's
  `redirect({ to: '/sign-in', throw: true })`.
- **A successful sign-in always lands on `/`.** `SignInRoute` calls `navigate({ to: '/' })`
  unconditionally. The guard's redirect carries no return location and the `/sign-in` route declares
  no `validateSearch`, so a visitor turned away from `/users/$userId` is not taken back there — the
  same gap noted, from the guard's side, in
  [Authenticated route guard](./route-guard.md#known-limitations) and, from the profile route's
  side, in [User profile (read path)](./user-profile.md#known-limitations).
- **An authenticated visitor is not turned away from `/sign-in`.** The route has no `beforeLoad`, so
  the form renders whatever the session state, and signing in again replaces the token in the store;
  what a token change does to the query cache is covered in
  [Session management](./session-management.md).
- **Only 401 and 429 are told apart.** Every other status, a 400 invalid-input answer included, and
  every transport failure show the same `signIn.unavailable` copy. `SessionApi.signIn` reads nothing
  but `error.status`, so a `Retry-After` header is never consulted, and the form accepts a new
  attempt immediately after `rate-limited`.
- **An attempt cannot be cancelled.** `SessionApi.signIn` passes no `AbortSignal`, and `useSignIn`
  registers `onSuccess` on the mutation rather than per call. If the form unmounts mid-request, a
  success still starts the session and still calls `onSignedIn` — with the route's callback, a
  navigation to `/`.
