# HTTP transport

> **Status:** Complete · **Layers:** app, pages, features, entities, shared, outside layers · **Verified against:** `d6deb01`

## Purpose

Every slice — a self-contained module on a layer above `shared`, such as `entities/user` or
`features/sign-in` — needs the API, and left alone each would pick an HTTP client, decide for itself
whether to check what comes back, invent its own error shape and hand-roll retries. `src/shared/api`
is the one place that speaks HTTP instead: the `api` _segment_ of `shared`, the bottom layer. A
_segment_ is a purpose-named subdivision — `ui/` for components, `model/` for domain state and
ports, `api/` for the server-facing code, `lib/` for helpers — and it exists at both levels of the
tree: every slice is divided into segments (`entities/user` has `api/` and `model/`), and `shared`
and `app`, which have no slices, expose their segments directly (`api`, `config`, `i18n`, `lib`,
`notifications`, `observability`, `testing`, `theme`, `ui` in `shared`). That `api` segment offers five things, three of them _ports_. A
_port_ (the repo also says _seam_) is a type a consumer programs against whose concrete
implementation is bound elsewhere, at the _composition root_, `src/app/entrypoint`.

- `HttpClient` — the transport port. It will not hand back a body its caller has not described
  with a schema.
- `ResponseSchema` — the validation port that describes that body. It is the one port with no
  single instance to hand out, because every call passes the DTO schema its own slice owns.
- `BearerTokenSource` — the credential port. An interceptor attaches its token to each request
  and, on a 401, renews it once and replays the request.
- `HttpError` — the one frontend-owned failure type every failure of this segment arrives as. It
  is a concrete class every layer shares, with nothing to bind behind it.
- The TanStack Query client from `createQueryClient`, whose retry policy understands those failures.

Together they make the project's DTO → domain-model rule enforceable — a _DTO_, a data transfer
object, is the server's wire shape, and unvalidated API data cannot get past the transport, so the
entity that owns a resource translates a checked DTO into its own frontend-owned model — and they
keep axios a replaceable detail behind a boundary the linter enforces.
[User profile](./user-profile.md#the-dto--domain-model-contract) states that contract in full.

## How it works

**Startup.** `App` (`src/app/entrypoint/app.tsx`) passes `appConfig.apiBaseUrl` to `AppProviders`,
which builds the transport once, in a `useState` lazy initializer, by calling
`createAuthenticatedTransport(apiBaseUrl)`. That factory calls `createHttpClient` twice:

- the **unauthenticated client** — `sendCookies: true`, no token source — which it hands to
  `createSessionApi` for `POST /auth/refresh`, `POST /auth/login` and `POST /auth/logout`, and which
  never leaves the factory;
- the **authenticated client**, built with `bearerTokenSource: sessionTokenSource`, which is the
  client every other caller receives.

All three session calls belong on the first client for the same two reasons. It is the only one
that sends the `httpOnly` refresh cookie, which the server needs to identify the session it is
renewing, issuing or revoking; and it carries no bearer interceptor, so a 401 from any of them comes
back as a 401 instead of triggering a renewal that would answer the refresh with another refresh.

`AppProviders` also builds the query client with `createQueryClient(queryErrorHandlers)` and renders
`<HttpClientProvider client={transport.httpClient}>` inside `QueryClientProvider`. Components and
hooks reach the client with `useHttpClient()`; `AppRouterProvider` copies it, together with the
query client, into `AppRouterContext`, because route `beforeLoad` guards and `loader`s run outside
React ([Composition root](./composition-root.md)).

**A read, end to end.** On the `/users/$userId` route the `loader` starts
`context.queryClient.prefetchQuery(createUserQueries(context.httpClient).detail(toUserId(params.userId)))`
without awaiting it, and the page's `useUserProfile` hook runs the same query options through
`useQuery` with the client from `useHttpClient()`. The `queryFn` calls
`httpClient.get(userResourcePath(userId), { schema: userDtoSchema, signal })`. Inside the client:

1. `toAxiosRequestConfig` copies `params`, `headers`, `signal` and `body` (as axios `data`) into the
   axios request by name; the schema stays behind.
2. The request interceptor that `attachBearerToken` installed sets `Authorization: Bearer <token>`
   from `getToken()`, or deletes the header when the source holds no token.
3. axios sends the request beneath `baseURL`, with `Accept: application/json` and a 15-second
   timeout.
4. On a 2xx response, `parseResponse` runs the schema's Standard Schema `validate` over
   `response.data` and resolves with the schema's _output_ — a Zod object schema has already dropped
   undeclared keys — which `toUser` then maps into the domain model. _Standard Schema_ is a small
   shared validation interface — a `~standard` property holding a `version`, a `vendor` and a
   `validate` function — that validator libraries such as Zod implement and `noContentSchema`
   implements by hand, so `shared/api` can check a response body without depending on any one
   validator.

**When it fails.** Every axios rejection passes the response interceptors in registration order — on
the authenticated client the bearer handler first, then `normalizeErrors` — and reaches the caller
as an `HttpError` whose `kind` names what went wrong (the kinds are tabled under
[The failure model](#the-failure-model)).

- **A 401 on the authenticated client.** The bearer handler reads the token the failed request
  carried and calls `renewToken(staleToken)`. If that resolves a token, the handler replays the
  original request config marked `bearerTokenRenewed: true`. The replay passes the request
  interceptor again, so it carries whatever `getToken()` returns now, and its response returns to
  the caller and is validated like any other. If renewal yields `null` or rejects — or the replay is
  itself a 401 — the caller receives the original failure: kind `client`, status `401`. How the
  token is renewed is [Session management](./session-management.md).
- **A body the schema rejects.** The call rejects with kind `validation`, one `{ path, message }`
  entry per schema issue, and `payload: null`. Validation runs after axios has resolved, outside the
  interceptor chain, so it never triggers a renewal.

**In the cache.** TanStack Query receives the `HttpError` and consults the default `retry`
predicate: `network`, `timeout` and `server` failures and HTTP 429 are retried up to twice;
everything else — including a 401 the transport could not recover — fails at once. When a query has
failed for good, `onQueryError(error, query.queryHash)` fires; a failed mutation, which is never
retried, fires `onMutationError(error, hashKey(mutation.options.mutationKey ?? []))`. `App` binds
both to the error reporter ([Error handling and reporting](./error-handling.md)), and the page folds
the failure into its own state: `useUserProfile` returns `{ status: 'unavailable' }`.

## Architecture

This feature declares three ports: `HttpClient` (the five HTTP verbs), `ResponseSchema` (the
Standard Schema interface every response is validated through) and `BearerTokenSource` (where a
bearer token comes from). All three fail through the same frontend-owned type, `HttpError` — not a
fourth port with alternatives to bind, but one concrete class declared in `http-error.ts` and
exported for every caller to share, so a transport rejection, a schema that rejects the body and a
renewal that produces no token all arrive as one type.

`shared/api` owns the transport-side concretes: `createHttpClient` (axios behind the port),
`noContentSchema` and `createQueryClient`. The remaining implementations live in the slices that own
the knowledge — every other `ResponseSchema` is a slice's `zod/mini` DTO schema in `entities/*/api`,
passed with the request rather than bound once, and the one `BearerTokenSource` is
`createSessionTokenSource` in `entities/session`. Nothing is bound inside `shared/api`, and
`src/app/entrypoint` is the only place that constructs clients:
`create-authenticated-transport.ts` builds both of them and gives the token source to one,
`app-providers.tsx` owns their lifetimes and publishes them through `HttpClientProvider` and
`QueryClientProvider` — React code then reads the client through `useHttpClient()` — and
`app/router/app-router-provider.tsx` copies them into `AppRouterContext`
([Composition root](./composition-root.md)).

Imports point strictly downward: `shared/api` imports `axios`, `react`, `@tanstack/react-query` and
the types-only `@standard-schema/spec` — nothing from any other segment or layer — and every
consumer reaches it through its _public API_, the `index.ts` barrel imported as `@/shared/api`.

| Component                                                                                                           | Layer                               | Responsibility                                                                                                                                                                                                                                                                           | File                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `HttpClient`                                                                                                        | `shared/api`                        | The transport port: five verbs, each taking a `url` and a config with a required `schema`                                                                                                                                                                                                | `src/shared/api/http-client.ts`                                                    |
| `createHttpClient`                                                                                                  | `shared/api`                        | Builds an axios instance behind the port (base URL, timeout, `Accept`, `allowAbsoluteUrls: false`, header redaction), installs the bearer interceptors when given a source, then `normalizeErrors`                                                                                       | `src/shared/api/http-client.ts`                                                    |
| `ResponseSchema`, `parseResponse`, `noContentSchema`                                                                | `shared/api`                        | The Standard Schema port, the validation step every response passes, and the empty-body schema                                                                                                                                                                                           | `src/shared/api/response-schema.ts`                                                |
| `toValidationError`, `toSchemaFailureError`                                                                         | `shared/api`                        | Turn schema issues into a `validation` error and a throwing schema into an `unknown` one, both carrying the exchange's method, URL and status                                                                                                                                            | `src/shared/api/validation-error-mapper.ts`                                        |
| `HttpError`, `isHttpError`, `toHttpError`                                                                           | `shared/api`                        | The failure type and its kind vocabulary, with no third-party import                                                                                                                                                                                                                     | `src/shared/api/http-error.ts`                                                     |
| `toHttpErrorFromAxios`                                                                                              | `shared/api`                        | Classifies an `AxiosError` into a kind; hands anything else to `toHttpError`                                                                                                                                                                                                             | `src/shared/api/axios-error-mapper.ts`                                             |
| `BearerTokenSource`                                                                                                 | `shared/api`                        | The credential port: `getToken()` and `renewToken(staleToken)`                                                                                                                                                                                                                           | `src/shared/api/bearer-token-source.ts`                                            |
| `attachBearerToken`                                                                                                 | `shared/api`                        | A request interceptor that sends the token and a response interceptor that renews once on a 401 and replays                                                                                                                                                                              | `src/shared/api/attach-bearer-token.ts`                                            |
| `useHttpClient`                                                                                                     | `shared/api`                        | Reads the client from `HttpClientContext`; throws outside a provider                                                                                                                                                                                                                     | `src/shared/api/http-client-context.ts`                                            |
| `HttpClientProvider`                                                                                                | `shared/api`                        | Publishes one client to the React tree                                                                                                                                                                                                                                                   | `src/shared/api/http-client-provider.tsx`                                          |
| `createQueryClient`                                                                                                 | `shared/api`                        | A TanStack `QueryClient` with stale and GC times, the kind-aware retry policy and the failure callbacks                                                                                                                                                                                  | `src/shared/api/query-client.ts`                                                   |
| `index.ts`                                                                                                          | `shared/api`                        | The segment's public API; re-exports only                                                                                                                                                                                                                                                | `src/shared/api/index.ts`                                                          |
| `createAuthenticatedTransport`                                                                                      | `app/entrypoint`                    | Builds the unauthenticated and the authenticated client, binds `createSessionTokenSource` to the latter, and assembles the five-member `AuthenticatedTransport` — `httpClient`, `sessionEnder`, `sessionObserver`, `sessionResolver`, `sessionStarter` — over one `createSessionStore()` | `src/app/entrypoint/create-authenticated-transport.ts`                             |
| `AppProviders`                                                                                                      | `app/entrypoint`                    | Holds the transport and the query client in `useState` and publishes them through `HttpClientProvider` and `QueryClientProvider`                                                                                                                                                         | `src/app/entrypoint/app-providers.tsx`                                             |
| `createQueryErrorHandlers`                                                                                          | `app/entrypoint`                    | Adapts `onQueryError` and `onMutationError` onto the `ErrorReporter`                                                                                                                                                                                                                     | `src/app/entrypoint/create-query-error-handlers.ts`                                |
| `AppRouterContext`, `AppRouterProvider`                                                                             | `app/router`                        | Carry `httpClient` and `queryClient` to route `loader`s and `beforeLoad` guards                                                                                                                                                                                                          | `src/app/router/app-router-context.ts`, `src/app/router/app-router-provider.tsx`   |
| `createSessionTokenSource`                                                                                          | `entities/session · model`          | The concrete `BearerTokenSource`: the renewal policy over the session store ([Session management](./session-management.md))                                                                                                                                                              | `src/entities/session/model/session-token-source.ts`                               |
| `createSessionApi`                                                                                                  | `entities/session · api`            | `POST /auth/refresh`, `POST /auth/login` and `POST /auth/logout` on the unauthenticated client; turns `HttpError` statuses into outcomes                                                                                                                                                 | `src/entities/session/api/session-api.ts`                                          |
| `createUserQueries`, `createUserMutations`                                                                          | `entities/user · api`               | Reference callers: `get` with `userDtoSchema` and `signal`, and `patch` with the same `userDtoSchema`, because the server answers a rename with the saved user                                                                                                                           | `src/entities/user/api/user-queries.ts`, `src/entities/user/api/user-mutations.ts` |
| `parseStubResponse`                                                                                                 | `shared/testing`                    | The test-double seam: runs a stub body through the transport's own `parseResponse`, so a double rejects a bad body exactly as the axios client does                                                                                                                                      | `src/shared/testing/parse-stub-response.ts`                                        |
| `useUserProfile`                                                                                                    | `pages/user-profile · model`        | Takes the client from `useHttpClient()` for the profile query                                                                                                                                                                                                                            | `src/pages/user-profile/model/use-user-profile.ts`                                 |
| `useUpdateUserName`                                                                                                 | `features/update-user-name · model` | Takes the client from `useHttpClient()` for the name mutation                                                                                                                                                                                                                            | `src/features/update-user-name/model/use-update-user-name.ts`                      |
| `TRANSPORT_VENDOR_IMPORT_PATHS`, `VALIDATOR_IMPORT_PATTERNS`, `LOWER_LAYER_IMPORT_PATHS`, the `parseResponse` block | outside layers                      | Lint fences: `axios` only in `shared/api`, no concrete validator inside it, no `createHttpClient` or `createQueryClient` below `app`, and `parseResponse` only in `shared/api` and `shared/testing`                                                                                      | `eslint.config.js`                                                                 |

## Public surface

The transport serves no route. Its contract is the `@/shared/api` barrel
(`src/shared/api/index.ts`); a deep import such as `@/shared/api/http-client` is a lint error.

| Export                                                                                                       | Kind                        | Role                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createHttpClient`, `CreateHttpClientOptions`                                                                | factory, type               | Build a client. Importable only in `app/entrypoint`                                                                                                              |
| `HttpClient`                                                                                                 | type                        | The five-verb port every caller depends on, usually narrowed with `Pick`                                                                                         |
| `HttpRequestOptions`, `HttpRequestConfig`, `HttpBodyRequestConfig`, `HttpQueryParams`, `HttpQueryParamValue` | types                       | Per-request configuration                                                                                                                                        |
| `ResponseSchema`, `noContentSchema`                                                                          | type, constant              | The schema port, and the schema for an empty body                                                                                                                |
| `parseResponse`, `ExchangeContext`                                                                           | function, type              | The validation step every response passes, and the exchange it reports. Importable only in `shared/api` and `shared/testing`, where `parseStubResponse` wraps it |
| `BearerTokenSource`                                                                                          | type                        | The credential port                                                                                                                                              |
| `HttpError`, `isHttpError`, `toHttpError`                                                                    | class, type guard, function | The failure type, its narrowing guard, and a wrapper for any thrown value                                                                                        |
| `HttpErrorDetails`, `HttpErrorKind`, `ResponseValidationIssue`                                               | types                       | The failure's fields                                                                                                                                             |
| `HttpClientProvider`, `useHttpClient`                                                                        | component, hook             | Publish and read the client in React                                                                                                                             |
| `createQueryClient`                                                                                          | factory                     | The configured TanStack `QueryClient`. Importable only in `app/entrypoint`                                                                                       |

### The transport, the schema port and the credential port

Declared in `http-client.ts`, `response-schema.ts` and `bearer-token-source.ts`. `HttpBodyOptions`
is internal to `http-client.ts` and shown only because `HttpBodyRequestConfig` is built from it.

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';

export type ResponseSchema<TValue> = StandardSchemaV1<unknown, TValue>;

export declare const noContentSchema: ResponseSchema<null>;

export interface ExchangeContext {
  readonly method: string;
  readonly url: string;
  readonly status: number;
}

export declare function parseResponse<TValue>(
  schema: ResponseSchema<TValue>,
  body: unknown,
  context: ExchangeContext,
): Promise<TValue>;

export interface BearerTokenSource {
  readonly getToken: () => string | null;
  readonly renewToken: (staleToken: string | null) => Promise<string | null>;
}

export type HttpQueryParamValue = boolean | number | string;

export type HttpQueryParams = Record<
  string,
  HttpQueryParamValue | readonly HttpQueryParamValue[] | undefined
>;

export interface HttpRequestOptions {
  readonly params?: HttpQueryParams;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}

interface HttpBodyOptions extends HttpRequestOptions {
  readonly body?: unknown;
}

export interface HttpRequestConfig<TValue> extends HttpRequestOptions {
  readonly schema: ResponseSchema<TValue>;
}

export type HttpBodyRequestConfig<TValue> = HttpRequestConfig<TValue> & HttpBodyOptions;

export interface HttpClient {
  readonly get: <TValue>(url: string, config: HttpRequestConfig<TValue>) => Promise<TValue>;
  readonly post: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly put: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly patch: <TValue>(url: string, config: HttpBodyRequestConfig<TValue>) => Promise<TValue>;
  readonly delete: <TValue>(url: string, config: HttpRequestConfig<TValue>) => Promise<TValue>;
}

export interface CreateHttpClientOptions {
  readonly baseUrl: string;
  readonly timeoutMilliseconds?: number;
  readonly bearerTokenSource?: BearerTokenSource;
  readonly sendCookies?: boolean;
  readonly redactedHeaders?: readonly string[];
}

export declare function createHttpClient(options: CreateHttpClientOptions): HttpClient;
```

- `url` is joined to `baseUrl` as given. The transport does not encode it, so a path segment built
  from data must be encoded by the caller — `userResourcePath` is the model to copy.
- `params` becomes the query string (axios drops `undefined` entries); `headers` are sent on top of
  the default `Accept: application/json`; aborting `signal` rejects the call with kind `canceled`.
- Each verb resolves with the schema's output type: `TValue` is inferred from `schema`, never
  asserted. `get` and `delete` take a config without `body`, so passing one is a compile error.
- `noContentSchema` accepts `''`, `null` or `undefined` and resolves `null`; any other body fails
  with kind `validation` and the issue message `Expected an empty response body`.
- `parseResponse` resolves the schema's output or rejects with the `validation` or `unknown`
  `HttpError` described below, stamped with the `ExchangeContext` it is given. The client calls it
  with the real method, URL and status; `parseStubResponse` calls it with the placeholders `STUB`,
  `stubbed-response` and `200`, because a test double has no request to describe.

### The failure model

Declared in `http-error.ts`.

```ts
export type HttpErrorKind =
  'canceled' | 'client' | 'network' | 'server' | 'timeout' | 'unknown' | 'validation';

export interface ResponseValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface HttpErrorDetails {
  readonly kind: HttpErrorKind;
  readonly status: number | null;
  readonly method: string | null;
  readonly url: string | null;
  readonly payload: unknown;
  readonly issues: readonly ResponseValidationIssue[];
}

export declare class HttpError extends Error implements HttpErrorDetails {
  readonly kind: HttpErrorKind;
  readonly status: number | null;
  readonly method: string | null;
  readonly url: string | null;
  readonly payload: unknown;
  readonly issues: readonly ResponseValidationIssue[];
  constructor(message: string, details: HttpErrorDetails, cause: unknown);
}

export declare function isHttpError(error: unknown): error is HttpError;

export declare function toHttpError(error: unknown): HttpError;
```

| `kind`       | Raised when                                                                                      | `status`                                                  | `payload`            | `issues`                                 | `cause`          |
| ------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------- | ---------------------------------------- | ---------------- |
| `canceled`   | The request's `signal` aborted it (axios `ERR_CANCELED`)                                         | `null`                                                    | `null`               | `[]`                                     | The `AxiosError` |
| `timeout`    | No response within `timeoutMilliseconds` (`ECONNABORTED` or `ETIMEDOUT`)                         | `null`                                                    | `null`               | `[]`                                     | The `AxiosError` |
| `network`    | axios failed without any response: unreachable host, dropped connection                          | `null`                                                    | `null`               | `[]`                                     | The `AxiosError` |
| `client`     | The server answered with a status below 500 (a 4xx)                                              | The status                                                | The response body    | `[]`                                     | The `AxiosError` |
| `server`     | The server answered with 500 or above                                                            | The status                                                | The response body    | `[]`                                     | The `AxiosError` |
| `validation` | A 2xx body failed the call's schema                                                              | The 2xx status                                            | `null`, deliberately | One `{ path, message }` per schema issue | `null`           |
| `unknown`    | `toHttpError` wrapped a value that is not an `HttpError`, or the schema itself threw or rejected | `null` when wrapped; the 2xx status for a throwing schema | `null`               | `[]`                                     | The thrown value |

- `classifyErrorKind` checks in the table's order — cancellation, timeout, no response, then status
  — so a timed-out request is always `timeout`, never `network`.
- `method` is the upper-case verb and `url` the path the caller passed, not the resolved absolute
  URL; both are `null` when `toHttpError` wraps a value.
- `issues[].path` joins the schema's path with dots: `profile.email`, `tags.0`, or `''` for the
  root.
- `message` is a diagnostic: axios's own text for a transport failure, `Response did not match the
expected schema` for `validation`, `Response schema threw while validating` for a throwing schema,
  and for `toHttpError` the wrapped error's message, the thrown string itself, or `Unknown failure`.
  `name` is `HttpError`.
- `toHttpError` returns an `HttpError` unchanged; `isHttpError` is an `instanceof` check.

### React injection and the query cache

Declared in `http-client-provider.tsx`, `http-client-context.ts` and `query-client.ts`.
`CreateQueryClientOptions` is exported by `query-client.ts` but not by the barrel, so a caller passes
a structurally matching object — `AppProviders` passes its `QueryErrorHandlers`.

```ts
import type { DefaultOptions, QueryClient } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import type { HttpClient } from '@/shared/api';

interface HttpClientProviderProps {
  readonly client: HttpClient;
  readonly children: ReactNode;
}

export declare function HttpClientProvider(props: HttpClientProviderProps): JSX.Element;

export declare function useHttpClient(): HttpClient;

export interface CreateQueryClientOptions {
  readonly onQueryError?: ((error: unknown, queryHash: string) => void) | undefined;
  readonly onMutationError?: ((error: unknown, mutationHash: string) => void) | undefined;
  readonly defaultOptions?: DefaultOptions | undefined;
}

export declare function createQueryClient(options?: CreateQueryClientOptions): QueryClient;
```

- `useHttpClient()` throws `useHttpClient must be called inside an HttpClientProvider` when no
  provider is above it. `HttpClientContext` is not exported from the barrel, so the hook — with that
  check — is the only way to read it.
- The query client's defaults, retry policy and callbacks are tabled under
  [Configuration](#configuration).

### Internal by design

`attachBearerToken`, `toHttpErrorFromAxios`, `toValidationError`, `toSchemaFailureError` and
`HttpClientContext` stay inside the segment. `parseResponse` and `ExchangeContext` cross the barrel
for one consumer, `shared/testing`, and an ESLint block rejects importing `parseResponse` from any
other module under `src/`.
No axios type crosses the barrel: `http-client.ts` uses `AxiosInstance` only internally, and
`attach-bearer-token.ts` and `axios-error-mapper.ts` export nothing through `index.ts`.

## Configuration

| Variable / option                          | Default                                                          | Meaning                                                                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                        | `/v1`                                                            | The base URL both clients are built with — `src/shared/config/app-config.ts` reads it as `appConfig.apiBaseUrl` and falls back to the default when the variable is blank or whitespace ([Configuration and environment](./configuration.md)) |
| `server.proxy['/v1']` in `vite.config.ts`  | `http://localhost:8000`                                          | The dev server forwards the default base path to a local API, so development requests stay same-origin                                                                                                                                       |
| `baseUrl` (`createHttpClient`)             | required                                                         | axios `baseURL`; with `allowAbsoluteUrls: false` every request URL resolves beneath it                                                                                                                                                       |
| `timeoutMilliseconds` (`createHttpClient`) | `15_000` (`DEFAULT_TIMEOUT_MILLISECONDS`)                        | Per-attempt timeout; exceeding it rejects with kind `timeout`. Neither client overrides it                                                                                                                                                   |
| `bearerTokenSource` (`createHttpClient`)   | none                                                             | Installs the `attachBearerToken` interceptors. Only the authenticated client has one                                                                                                                                                         |
| `sendCookies` (`createHttpClient`)         | `false`                                                          | Sets axios `withCredentials`. Only the unauthenticated client turns it on                                                                                                                                                                    |
| `redactedHeaders` (`createHttpClient`)     | `['authorization', 'cookie', 'set-cookie']` (`REDACTED_HEADERS`) | Keys axios replaces with `[REDACTED ****]` when a failure is serialized through `AxiosError.toJSON()`. A supplied list replaces the default instead of extending it; neither client supplies one                                             |
| `onQueryError` (`createQueryClient`)       | no-op                                                            | `(error, queryHash)`, called once a query has failed for good. `App` supplies it through `createQueryErrorHandlers(reportError)`                                                                                                             |
| `onMutationError` (`createQueryClient`)    | no-op                                                            | `(error, mutationHash)`, called when a mutation fails; the hash is `hashKey(mutation.options.mutationKey ?? [])`                                                                                                                             |
| `defaultOptions` (`createQueryClient`)     | `{}`                                                             | TanStack `DefaultOptions`, merged group by group over the four defaults below. The app passes none                                                                                                                                           |
| `queries.staleTime`                        | `30_000` (`STALE_TIME_MILLISECONDS`)                             | 30 s before cached data counts as stale                                                                                                                                                                                                      |
| `queries.gcTime`                           | `300_000` (`GARBAGE_COLLECTION_TIME_MILLISECONDS`)               | 5 min before an unused query is garbage-collected                                                                                                                                                                                            |
| `queries.retry`                            | `shouldRetryQuery`                                               | Retries the `network`, `server` and `timeout` kinds and status 429 (`TOO_MANY_REQUESTS_STATUS`) while `failureCount < MAX_QUERY_RETRIES` (2)                                                                                                 |
| `mutations.retry`                          | `false`                                                          | Mutations never retry                                                                                                                                                                                                                        |

> **Repointing `VITE_API_BASE_URL` can silently break every token renewal.** The default is a path,
> not an origin, and its `/v1` path segment is load-bearing rather than cosmetic: the backend issues the
> refresh cookie with `path: '/v1/auth'`. Give the variable a base URL whose path drops `/v1`
> without changing that cookie's `path` server-side and the browser refuses to attach the cookie to
> `POST /auth/refresh` — every renewal then fails with a 401 indistinguishable from a genuinely
> expired session ([Session management](./session-management.md)).

Two settings are fixed rather than optional: every request sends `Accept: application/json`
(`JSON_MEDIA_TYPE`), and `allowAbsoluteUrls` is always `false`.

## Usage & extension

### Reach the transport — never construct it

In a component or hook, call `useHttpClient()`, as `useUserProfile` and `useUpdateUserName` do. In
a route `loader` or `beforeLoad`, read `context.httpClient` from `AppRouterContext`, as
`src/app/routes/_authenticated/users.$userId.tsx` does. `createHttpClient` and `createQueryClient`
are importable only in `src/app/entrypoint`; lint rejects them anywhere else.

### Call the API from an entity's `api/` segment

The wire schema, the HTTP call and the mapping to the domain model live together in the slice's
`api/` segment, and nothing above it sees a DTO. For a new `workspace` entity, declare the wire
shape with `zod/mini` in `src/entities/workspace/api/workspace-dto.ts`:

```ts
import * as zm from 'zod/mini';

export const workspaceDtoSchema = zm.object({
  id: zm.string(),
  name: zm.string(),
  archived_at: zm.nullable(zm.iso.datetime({ offset: true })),
});

export type WorkspaceDto = zm.infer<typeof workspaceDtoSchema>;

export type RenameWorkspaceDto = Pick<WorkspaceDto, 'name'>;
```

and the calls in `src/entities/workspace/api/workspace-api.ts`, depending on the narrowest part
of the port the module uses:

```ts
import { isHttpError, noContentSchema } from '@/shared/api';
import type { HttpClient } from '@/shared/api';

import type { Workspace, WorkspaceId, WorkspaceRename } from '../model/workspace';

import { workspaceDtoSchema } from './workspace-dto';
import { toRenameWorkspaceDto, toWorkspace } from './workspace-mapper';
import { workspaceResourcePath } from './workspace-resource-path';

const NOT_FOUND_STATUS = 404;

export type WorkspaceClient = Pick<HttpClient, 'delete' | 'get' | 'put'>;

export type WorkspaceRemoval = { readonly status: 'removed' } | { readonly status: 'missing' };

export function createWorkspaceApi(httpClient: WorkspaceClient) {
  return {
    read: async (workspaceId: WorkspaceId, signal: AbortSignal): Promise<Workspace> =>
      toWorkspace(
        await httpClient.get(workspaceResourcePath(workspaceId), {
          schema: workspaceDtoSchema,
          signal,
        }),
      ),
    rename: async (workspaceId: WorkspaceId, rename: WorkspaceRename): Promise<Workspace> =>
      toWorkspace(
        await httpClient.put(workspaceResourcePath(workspaceId), {
          body: toRenameWorkspaceDto(rename),
          schema: workspaceDtoSchema,
        }),
      ),
    remove: async (workspaceId: WorkspaceId): Promise<WorkspaceRemoval> => {
      try {
        await httpClient.delete(workspaceResourcePath(workspaceId), { schema: noContentSchema });

        return { status: 'removed' };
      } catch (error: unknown) {
        if (isHttpError(error) && error.kind === 'client' && error.status === NOT_FOUND_STATUS) {
          return { status: 'missing' };
        }

        throw error;
      }
    },
  };
}
```

- `Pick<HttpClient, 'delete' | 'get' | 'put'>` keeps the dependency honest and lets a test hand in
  a three-method object without a cast.
- The schema's output type becomes each call's return type. `put` sends a `body` and still
  validates the response; a `204` from `delete` resolves `null` through `noContentSchema`.
- `read` takes an `AbortSignal` so a `queryFn` can forward TanStack's `signal`: a superseded request
  then aborts, rejects as `canceled` and is not retried.
- Expected failures become domain outcomes here, decided by `kind` and `status` — never by
  `message` — and anything else is rethrown so the cache still reports it. `createSessionApi` is the
  in-repo precedent.
- `workspaceResourcePath` mirrors `userResourcePath`: it refuses `''`, `.` and `..` by throwing an
  `HttpError` built with `toHttpError`, so the query keeps a single failure type. Its kind is
  `unknown`, because `client` means the server really answered with a 4xx.
- The model (`model/workspace.ts`), the mapper (`toWorkspace`, `toRenameWorkspaceDto`) and the
  `queryOptions()` / `mutationOptions()` factories that wrap these calls follow `entities/user`: see
  [User profile (read path)](./user-profile.md) and
  [Update user name (write path)](./update-user-name.md). The slice's `index.ts` exports the domain
  model and the factories — never the DTO, its schema, the mapper or the path builder.

### Test a consumer without a network

Slice tests never stand up a server. They hand the code a plain object that satisfies the port and
still runs the real schema over a fixture through `parseStubResponse` from `@/shared/testing`, which
calls the transport's own `parseResponse` — so a wire-shape mismatch fails the test with the same
`HttpError` kind and issues production would raise. For the `workspace` API above, in
`workspace-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { toHttpError } from '@/shared/api';
import { parseStubResponse } from '@/shared/testing';

import { toWorkspaceId } from '../model/workspace';

import { createWorkspaceApi } from './workspace-api';
import type { WorkspaceClient } from './workspace-api';

const refuse = (): Promise<never> =>
  Promise.reject(toHttpError(new Error('This test performs no such request.')));

function createReadClient(payload: unknown): WorkspaceClient {
  return {
    get: (_url, config) => parseStubResponse(config.schema, payload),
    put: refuse,
    delete: refuse,
  };
}

describe('createWorkspaceApi', () => {
  it('resolves the mapped domain model for a payload the schema accepts', async () => {
    const api = createWorkspaceApi(
      createReadClient({ id: 'w_1', name: 'Apollo', archived_at: null }),
    );
    const { signal } = new AbortController();

    await expect(api.read(toWorkspaceId('w_1'), signal)).resolves.toStrictEqual({
      id: toWorkspaceId('w_1'),
      name: 'Apollo',
      archivedAt: null,
    });
  });
});
```

A component test does the same through `renderWithProviders` from `@/shared/testing`, which mounts
`HttpClientProvider` over the `HttpClient` it is handed — `createHttpClientStub` builds that client,
overriding the verbs the subject uses and leaving the rest to reject by name, as
`src/pages/user-profile/ui/user-profile-page.test.tsx` does; see
[Unit and component testing](./unit-testing.md).

### Implement a `BearerTokenSource`

`createSessionTokenSource` is the reference implementation
([Session management](./session-management.md)). Whatever replaces it must honour the contract
`attachBearerToken` relies on:

1. `getToken()` is called for every request and every replay, synchronously and unguarded. It
   returns the current token or `null` and never throws.
2. `renewToken(staleToken)` is called once per failed request, and only for a 401 that has not
   already been replayed. `staleToken` is the token that request carried — `null` if it went out
   bare. Resolve a token to have the request replayed, or `null` to let the original 401 through; a
   rejection counts as `null`. The transport sets no deadline, so the promise must settle.
3. Once `renewToken` has resolved a token, `getToken()` must return it: the replay's header is read
   from `getToken()`, not from `renewToken`'s result.
4. Concurrent 401s each call `renewToken`; collapsing them into one refresh is the source's job.

Bind it in `src/app/entrypoint/create-authenticated-transport.ts`, passing it as `bearerTokenSource`
where `sessionTokenSource` goes today. The call that renews the credential must run on a client
without a token source, or its own 401 would recurse into another renewal. If no lower layer may
construct the source, add its factory to the ESLint construction ban the way
`SESSION_CONSTRUCTOR_NAMES` fences the session constructors
([Architecture boundaries](./architecture-boundaries.md)).

### Tune the cache

- **App-wide:** pass `defaultOptions` next to the handlers where `AppProviders` builds the client —
  `createQueryClient({ ...queryErrorHandlers, defaultOptions: { queries: { staleTime: 60_000 } } })`.
  Each group is merged, so the other defaults survive.
- **Per query:** set the option in the slice's `queryOptions()`; TanStack applies it over the
  defaults.
- **Which failures retry:** edit `RETRYABLE_ERROR_KINDS` or `MAX_QUERY_RETRIES` in `query-client.ts`,
  together with `query-client.test.ts`. Overriding `defaultOptions.queries.retry` instead replaces
  the kind-aware predicate wholesale.

### Reach a second host

`allowAbsoluteUrls: false` pins every request of a client beneath its base URL, so another host
needs another `createHttpClient` call in `src/app/entrypoint`, with its own token source or none.
`HttpClientProvider` publishes a single client, so the second one reaches its consumers as a factory
argument — the way `createSessionApi` receives the unauthenticated client — not through
`useHttpClient()`.

## Design decisions & trade-offs

- **One port, axios behind it.** `HttpClient` names no axios type, and neither does anything else in
  the barrel: `BearerTokenSource` is two plain functions. Axios can therefore be replaced inside one
  segment, and — the stronger reason — no request can skip validation or error normalization. That
  guarantee holds only because `axios` is banned outside `shared/api`; the ban was extended to all
  five lower layers in the same step that made the schema mandatory, since an entity importing axios
  directly would have made that step's guarantee false.
- **Transport and cache ship as one feature.** A transport without a cache forces every feature to
  hand-roll `useEffect`, retry and de-duplication — the duplication a boilerplate exists to prevent —
  so `createQueryClient` lives beside `createHttpClient`, and its retry policy speaks `HttpError`.
- **Factories take plain values; the composition root owns lifetimes.** `createHttpClient` is a
  factory, never a module singleton: the base URL arrives as a string (only `src/shared/config`
  reads `import.meta.env`; see [Configuration and environment](./configuration.md)), which keeps
  every consumer testable with a literal. `AppProviders` holds
  each client in a `useState` lazy initializer rather than `useMemo`, because React may discard a
  memoized value and each client owns live state — an interceptor chain, a query cache and, through
  the token source, an in-memory access token.
- **Construction and the vendor are fenced by lint.** `no-restricted-imports` bans
  `createHttpClient` and `createQueryClient` on the `@/shared/api` barrel in every layer below `app`
  and in `app/routes` and `app/router`. steiger's `fsd/no-public-api-sidestep` blocks a deep import
  from another layer, and because steiger skips same-layer imports, an `^@/shared/api/` pattern
  blocks one from another `shared` segment. `axios` is banned in the same places, with a carve-out
  block for `src/shared/api/**` that must follow the `src/{entities,features,widgets,pages,shared}/**`
  block — flat config replaces rather than merges `no-restricted-imports` options — and a second
  block after it that re-exempts the segment's tests from the validator ban. The mechanics are in
  [Architecture boundaries](./architecture-boundaries.md); the gaps are under
  [Known limitations](#known-limitations).
- **The schema is a required argument.** Until it was, `get<TResponse>()` was an unchecked
  assertion: a renamed field, a `null` where an object was expected, or an error envelope sent with a
  200 crashed deep inside a component, far from the boundary that let it in. A DTO/mapper convention
  cannot rest on an unvalidated boundary, and optional validation lets each new entity decide for
  itself, so the schema is mandatory and checked in the lowest layer. Because `TValue` is inferred
  from the schema's output, an unchecked response type is no longer expressible.
- **Standard Schema at the seam; the validator belongs to the slice.** `ResponseSchema<TValue>` is
  `StandardSchemaV1<unknown, TValue>` — the stance the form seam already takes — so `shared/api`
  never chooses a validator. `@standard-schema/spec` is types-only (its `dist/index.js` is 0 bytes
  and `verbatimModuleSyntax` erases the `import type`), so it sits in `devDependencies`. Measured
  when the seam landed, the entry chunk grew 130.76 → 131.03 kB gzip (+0.27 kB); it ships because
  the composition root constructs the client at startup. The lint rule behind it is the regex
  `^(zod|valibot|arktype|yup|joi|superstruct)(/|$)` rather than a `paths` entry, because an
  exact-name ban on `zod` would let `zod/mini` straight through.
- **One `(url, config)` shape for all five verbs.** TypeScript cannot put a required `schema` after
  an optional positional `body`, so a `post(url, body, config)` signature would force
  `post('/x', undefined, { schema })` for every bodyless POST. `body` lives in the config instead,
  and `get` and `delete` take a config type without it, so a body literal on either is a compile
  error.
- **The axios config is built from an allow-list.** `toAxiosRequestConfig` copies `params`,
  `headers`, `signal` and `body` by name instead of rest-spreading the caller's object:
  excess-property checks fire only on object literals, so a caller passing a widened variable could
  otherwise smuggle `baseURL` past `allowAbsoluteUrls: false`. Its parameter type has no `schema`,
  so the schema cannot reach axios at all; `http-client.test.ts` asserts it never appears in a
  serialized failure.
- **`allowAbsoluteUrls: false`.** Without it axios ignores `baseURL` for an absolute URL while the
  bearer interceptor still attaches the token — one `${userSuppliedUrl}` away from sending a
  credential to a third-party host. With it, an absolute URL is appended beneath the base URL
  instead: `https://evil.example/x` requested with the base `/v1` becomes
  `/v1/https://evil.example/x`. A second host takes a second client, deliberately.
- **One failure type with a closed vocabulary.** `http-error.ts` imports nothing, so the type every
  layer above depends on cannot drift toward the library that produces it. `message` is a
  diagnostic, never display copy: wording is the UI's job, and putting it here would drag i18n into
  the transport. `issues` is always an array — `[]` when there is nothing to report, the same honest
  zero as `status: number | null` — so read sites need no optional chaining. The query error type
  stays TanStack's default `Error`, un-augmented, because TanStack throws its own `CancelledError`
  and a `queryFn` can throw anything; narrow with `isHttpError`.
- **A throwing schema is `unknown`, not `validation`.** `validation` means the server broke the
  contract and is investigated as drift; a schema that throws is a bug on our side. Both are outside
  the retry list, so separating them costs nothing, and it keeps an invariant worth having: `issues`
  is non-empty only when the response body is at fault, and every path in it names a field of that
  body. The `return await` inside `validate` is load-bearing — the pinned Zod 4 reports a throwing
  refinement or transform as a rejected promise, which the `try` sees only when it is awaited inside
  it — and `response-schema.test.ts` covers a rejecting schema as well as a throwing one, because
  only the rejecting case fails if the `await` is dropped. `validate` is its own function so its
  `catch` cannot swallow `toValidationError` and relabel ordinary mismatches.
- **`payload` is `null` when validation fails.** Every other kind carries the response body there,
  but a body that failed validation is by definition unmodelled, and copying it into an error that
  will be logged is the likeliest personal-data leak in the codebase; the issue path identifies the
  offending field without reproducing its value. Two conventions follow, and no linter checks them:
  a DTO schema must not interpolate the value into a refinement message, and must not throw an error
  built from it. The guarantee is scoped — `payload` and `issues` never carry the rejected body,
  while `cause` keeps a throwing schema's error unredacted.
- **Redaction protects the serialized error, not the error object.** axios consults `redact` (fed by
  `redactedHeaders`) only inside `AxiosError.toJSON()`; it never touches the outgoing request or the
  live object. For every transport failure `HttpError.cause` is the original `AxiosError`, whose
  `config.headers` — also reachable as `cause.response.config` — still hold
  `Authorization: Bearer <token>`, and whose `config.data` holds the serialized request body, which
  even `toJSON()` keeps because only the listed keys are replaced. `JSON.stringify(httpError)` emits
  only `name`, `kind`, `status`, `method`, `url`, `payload` and `issues`, since `cause` is
  non-enumerable, but a sink that walks `cause` sees the live token, and one that serializes it
  ships request bodies. That is why `createSessionApi` turns every sign-in `HttpError` into an
  outcome instead of rethrowing it — that body is a plaintext password ([Sign-in](./sign-in.md)) —
  and why a reporting vendor needs a scrubbing sink
  ([Error handling and reporting](./error-handling.md)).
- **Retries by kind; mutations never.** Only failures that may succeed on a second attempt are
  retried — `network`, `timeout`, `server`, and HTTP 429 even though it is a `client` error — at
  most twice, with TanStack's default back-off of 1 s and then 2 s. A `client` failure (including a
  401 the transport could not recover), `validation`, `unknown`, `canceled` and anything that is not
  an `HttpError` fail at once. Mutations never retry because they are not assumed idempotent: a
  retried POST can charge a customer twice. The budget is real — a query that times out on every
  attempt settles after roughly 48 s (three 15 s attempts plus 3 s of back-off) — which is why the
  `/users/$userId` loader fires its prefetch without awaiting it.
- **Overrides merge per group.** `createQueryClient` spreads `defaultOptions.queries` and
  `defaultOptions.mutations` over its own defaults, so a test can pass `retry: false` without losing
  `gcTime`.
- **Failure callbacks instead of an observability import.** `QueryCache` and `MutationCache` take
  `onError` as constructor options — it is not a field of `DefaultOptions` — so `createQueryClient`
  takes an options object whose `onQueryError` and `onMutationError` are plain `(error, hash)`
  functions, and `shared/api` still imports nothing from `shared/observability`. A query reports
  `query.queryHash`, which honours a custom `queryKeyHashFn`; a mutation has no hash of its own, so
  the factory hashes its `mutationKey`, or `[]`, with TanStack's `hashKey`. Both callbacks default to
  no-ops, so a bare `createQueryClient()` is silent.
- **A credential port, not a header map.** The transport once declared a `getAuthHeaders` option
  that nothing ever passed — an authentication seam with no implementation. `BearerTokenSource`
  replaced it: a consumer-driven port the transport owns and a slice above implements, the same
  arrangement `ResponseSchema` has with DTO schemas. On a client that has a source, `Authorization`
  belongs to the source, and a caller-supplied header is overwritten.
- **`renewToken` is told which token failed.** It receives the token the failed request actually
  carried, so a source can tell "my credential expired" from "someone already replaced it" and
  answer the second case without a round trip, as `createSessionTokenSource` does.
- **Interceptor order is a correctness requirement.** `attachBearerToken` registers its response
  handler before `normalizeErrors`, and axios runs response interceptors in registration order, so
  the handler receives the raw `AxiosError` — the only value that still carries the request
  `config`, and therefore the only one that can be replayed. Registered the other way round it would
  see an `HttpError` and never replay; the test named
  `registers the bearer interceptor before error normalization` pins the order.
- **The replay guard is a config flag.** `bearerTokenRenewed: true`, declared on axios's
  `AxiosRequestConfig` by module augmentation, is stamped on the replay's config and stops a second
  401 from starting another renewal. A `WeakSet` of config objects would not work: axios merges each
  request's config into a new object (`mergeConfig`), and the flag survives that merge.
- **The renewal guard absorbs a failing source.** `BearerTokenSource` is an interface anyone may
  implement, and a rejection from `renewToken` must not escape into TanStack Query as anything but
  an `HttpError`, so `renewQuietly` treats it as "no token" and the caller receives the original 401. `getToken()` is called unguarded on purpose: returning a token or `null` without throwing is
  part of its contract.
- **The transport knows one HTTP fact, and runs as two clients.** "A 401 means ask for a fresh
  bearer token, once" is all `attachBearerToken` knows; de-duplicating concurrent renewals, locking
  across tabs and remembering that a session has ended belong to the source
  ([Session management](./session-management.md)). The refresh therefore rides a second client with
  no token source: on the bearer client, a 401 from `/auth/refresh` would call the refresh again,
  forever. The login rides the same client, so a wrong password is not mistaken for an expired
  token. So does `POST /auth/logout`, for both halves of that reason: it is the only client that
  sends the `httpOnly` refresh cookie the server needs in order to revoke the session, and it has
  no bearer interceptor to answer the revocation's own 401 with a refresh attempt — a 401 there
  means the session is already gone, which `signOut` maps to `signed-out`. Nothing in the types
  enforces the placement: `createSessionApi` takes `SessionWriteClient`, declared as
  `Pick<HttpClient, 'post'>`, which either client satisfies. It is a composition rule asserted by a
  test: the case named `ends the authenticated session and revokes it through the cookie client` in
  `create-authenticated-transport.test.ts` records the `authorization` header the logout request
  arrives with and expects `[null]`.
- **No auth-refresh library.** `axios-auth-refresh` (unmaintained) and `axios-retry` (which solves
  retry-on-5xx, not token custody) were both rejected: either would still leave de-duplication and
  token custody to this repo, in exchange for a dependency and an opaque interceptor ordering. The
  whole bearer-token step — the port, both interceptors, the single-flight primitive and
  `entities/session` — grew the entry chunk 147.71 → 148.52 kB gzip (+0.81 kB), all of it
  first-party.
- **`sendCookies` is named for its effect.** Like `baseUrl` and `timeoutMilliseconds`, the option
  says what it does rather than exposing axios's `withCredentials`. It is off by default and only the
  unauthenticated client turns it on. `withCredentials` governs cross-origin requests only: under a
  same-origin base URL, such as the default `/v1` behind the dev proxy, the browser attaches cookies
  whatever the flag says, so the flag separates the two clients only when the API lives on another
  origin.
- **DTO schemas use `zod/mini`.** Measured in this repo, the same object schema costs ≈17 kB gzip
  with classic `zod` against ≈3.2 kB with `zod/mini`, on a ≈2.2 kB floor for any mini schema
  (bundled in isolation the packages measure 18.24 kB and 4.49 kB gzip). A DTO schema reaches the
  entry chunk through the route `loader` — the half `autoCodeSplitting` cannot split — and adding
  `entities/user` grew that chunk by ≈4.8 kB gzip, `zod/mini` included, while `routes-*.js` did not
  move. Every production DTO and form-validation schema in `src/` uses `zod/mini` —
  `user-dto.ts`, `session-dto.ts` and the two form schemas ([Forms](./forms.md)) — imported as `zm`
  and composed functionally: `zm.nullable(zm.string())`, never `zm.string().nullable()`, with
  refinements through `.check(zm.refine(predicate, message))`. Response-validation messages are
  developer-facing diagnostics, never display copy. Almost nothing lints the choice:
  `VALIDATOR_IMPORT_PATTERNS` bans every concrete validator inside `shared/api` and
  `shared/ui/form` only, and each of those two blocks lifts the ban again for its own
  `*.test.{ts,tsx}` files — `shared/api` through an overriding test block, `shared/ui/form` through
  `ignores`. That carve-out is why classic `zod` still appears in six test files —
  `http-client.test.ts`, `attach-bearer-token.test.ts` and `response-schema.test.ts` under
  `shared/api`, `text-field.test.tsx` and `submit-button.test.tsx` under `shared/ui/form`, and
  `create-authenticated-transport.test.ts` under `app/entrypoint`, which no validator fence covers.
  Those fixtures stand in for an arbitrary consumer's Standard Schema and never reach the bundle, so
  the heavier package is deliberate there.
- **`noContentSchema` lives beside the port.** It is ten lines that keep `shared/api` free of a
  concrete validator; the port and its one canonical implementation are treated as one concept, and
  a second schema owned by `shared/api` is the trigger to split the module. One production caller
  describes an empty body with it: the `signOut` of `createSessionApi`, whose `POST /auth/logout`
  answers `204` on the unauthenticated client. The user rename used it too until the entity was
  pinned to backend-boilerplate, which answers a `PATCH` with the saved user
  ([Update user name](./update-user-name.md)). Describing a `204` still costs a validation pass,
  and that is the point: a backend that starts returning a body fails the schema, `parseResponse`
  throws an `HttpError` with `kind: 'validation'` and the issue message
  `Expected an empty response body`, and — because
  `signOut` catches every `HttpError` — that drift surfaces as `{ status: 'unavailable' }` rather
  than as anything naming a schema. It is detected and contained, not loudly reported: the same
  trade `refresh` already makes when it turns a non-401 `HttpError` into
  `{ status: 'unavailable' }`.
- **The parser is exported for test doubles, and fenced to them.** A hand-written double that
  checks a stub body itself throws whatever error its author chose, so a test could pass against a
  double that fails differently from the real client — the substitutability a port promises, broken
  where it is hardest to see. `parseStubResponse` closes that by running the real `parseResponse`,
  which means `parseResponse` has to cross the barrel. Anywhere else it would mint an `HttpError`
  for a request that never happened, so a dedicated `@typescript-eslint/no-restricted-imports`
  block rejects it in every file under `src/` except `src/shared/api/**` and
  `src/shared/testing/**`. It uses the typescript-eslint rule rather than the core
  `no-restricted-imports`, whose options each block replaces rather than merges, so the fence
  cannot wipe out, or be wiped out by, the vendor fences above it.
- **Context and provider sit in two files.** `react-refresh/only-export-components` rejects a module
  that exports a component beside a hook, so `useHttpClient` and the unexported-from-the-barrel
  `HttpClientContext` live in `http-client-context.ts`, and `HttpClientProvider` in
  `http-client-provider.tsx`.

## Testing

| File                                                        | What it pins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/api/http-client.test.ts`                        | Through a real axios stack and MSW: a validated success, the `Accept` header, query params, caller headers, a POST body, `put`, `patch` and `delete`, a `204` through `noContentSchema`, a 200 that fails its schema (`validation`, with the failing path), no `Authorization` without a token source, a custom redacted header and the schema kept out of a serialized failure, and each transport kind — `client` with its payload, `server`, `network`, `timeout` (against a 20 ms timeout) and `canceled` — always as an `HttpError`                                        |
| `src/shared/api/attach-bearer-token.test.ts`                | Through a real axios stack and MSW: the token sent as `Bearer`, no header without a token, a caller's `Authorization` overwritten, the registration order, renew once and replay with the new token, the sent token (or `null`) handed to `renewToken`, no header on a replay the source can no longer credential, exactly one renewal when the replay is also a 401, the original 401 when renewal yields nothing or the source rejects, no renewal for a 403, a 500 or a network failure, and a 401 without a request config or a non-axios failure rejected without renewing |
| `src/shared/api/response-schema.test.ts`                    | `parseResponse`: the validated value with unknown keys stripped, the `validation` error's exchange details, `payload: null` with the body kept out of the serialized error, dotted, index, root and object-segment paths, one issue per failing field, an async `validate`, and a throwing or rejecting schema as `unknown` with the thrown error on `cause`; `noContentSchema` accepting `''`, `null` and `undefined` and rejecting a body                                                                                                                                     |
| `src/shared/api/axios-error-mapper.test.ts`                 | Each axios code and status to its kind, the upper-case method and the URL (or `null`), the axios message and the `cause`, and non-axios errors handed to `toHttpError`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/shared/api/http-error.test.ts`                         | `toHttpError` identity and wrapping (an `Error`, a string, anything else), `null` request details, the `HttpError` fields and `name`, and `isHttpError`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/api/query-client.test.ts`                       | Stale and GC times, no mutation retry, the per-group override merge, the retry limit and policy by kind (429 retried; 422, `canceled` and non-`HttpError` errors not), the callbacks' hashes (a custom `queryKeyHashFn` honoured, `[]` for a keyless mutation) and silence without callbacks                                                                                                                                                                                                                                                                                    |
| `src/shared/api/http-client-provider.test.tsx`              | The provider renders its children; `useHttpClient()` returns the provided client and throws outside a provider                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/testing/parse-stub-response.test.ts`            | `parseStubResponse` resolves the schema's output with unknown keys stripped, and rejects a refused body as an `HttpError` of kind `validation` carrying the failing path — the transport's own failure                                                                                                                                                                                                                                                                                                                                                                          |
| `src/app/entrypoint/create-authenticated-transport.test.ts` | The two-client composition end to end: renew and replay through a real refresh call, no recursion when the refresh itself answers 401, the first request after a sign-in or a resolved session carrying the bearer token, and `sessionEnder.signOut()` reaching `POST /auth/logout` with a `null` `authorization` header — the cookie-client rule — resolving `signed-out` and moving the observer to `anonymous`, which a `500` leaves anonymous too while resolving `unavailable` ([Session management](./session-management.md))                                             |
| `src/app/entrypoint/app-providers.test.tsx`                 | A usable client and the configured query client (`staleTime` of `30_000`) under `AppProviders`, one client instance across re-renders, and a query failure reaching the injected `onQueryError`                                                                                                                                                                                                                                                                                                                                                                                 |

Three files declare `// @vitest-environment node` — `http-client.test.ts`,
`attach-bearer-token.test.ts` and `create-authenticated-transport.test.ts`, the only tests that
drive a real request through MSW. Under jsdom axios picks its `xhr` adapter, and MSW's XHR
interception does not enforce `xhr.timeout`, so the timeout case could never observe a timeout. The
cost is that these files exercise axios's Node adapter rather than the browser's; the mapping of
both `ECONNABORTED` and `ETIMEDOUT` to `timeout` is covered environment-independently in
`axios-error-mapper.test.ts`. Every other test stubs the port as shown under
[Test a consumer without a network](#test-a-consumer-without-a-network). The browser path is covered
end to end: `e2e/user-profile.spec.ts` drives the built bundle, axios's `xhr` adapter included,
against Playwright `page.route` stubs — a 200 read, a 200 save validated against `userDtoSchema`, a
`500` on save and a `404` read ([End-to-end testing](./e2e-testing.md)).

```sh
npm test
npx vitest run src/shared/api
npx vitest run src/shared/api/attach-bearer-token.test.ts
npm run test:coverage
npm run test:e2e
```

`npm run test:coverage` enforces the 90 % per-file thresholds in `vite.config.ts`.

## Known limitations

- **`put` and `delete` have no runtime caller.** Production code calls `get` (`createUserQueries`),
  `patch` (`createUserMutations`) and `post` (`createSessionApi`, on the unauthenticated client).
  `HttpClient.put` and `HttpClient.delete` are exercised only by `http-client.test.ts`
  (`supports put, patch and delete` and the `204` through `noContentSchema`).
- **The retained `AxiosError` still carries credentials and request bodies.** `HttpError.cause` for
  a transport failure holds the live `Authorization: Bearer <token>` header in `config.headers` and
  the serialized request body in `config.data`, and `payload` holds the server's error body for the
  `client` and `server` kinds. The only sink today, `createConsoleErrorReporter`, hands the error to
  `console.error`, so nothing leaves the browser yet; a sink that forwards to a reporting vendor must
  scrub `cause` and `payload` first ([Error handling and reporting](./error-handling.md)).
- **A custom `redactedHeaders` list drops the defaults.** `createInstance` uses
  `options.redactedHeaders ?? REDACTED_HEADERS`, so passing `['x-api-key']` stops redacting
  `authorization`, `cookie` and `set-cookie`. Restate them when adding a header.
- **Some security-relevant settings have no test.** Nothing asserts `allowAbsoluteUrls: false`; the
  default redaction of `authorization` is untested, because the redaction test supplies its own list;
  and `sendCookies` is untested, since it matters only in a browser and is a no-op under the Node
  adapter.
- **The 401 replay is proven only for `GET`.** `isReplayableUnauthorized` ignores the method, so the
  authenticated `PATCH` from `createUserMutations` is replayed too, with its already-serialized body,
  yet every replay test in `attach-bearer-token.test.ts` and `create-authenticated-transport.test.ts`
  uses `GET`.
- **Renewal has no deadline at the transport.** `renewQuietly` awaits `renewToken` without a
  timeout, so a source that never settles leaves the original call pending.
- **Mutation failures are reported under one hash.** Neither `createUserMutations(httpClient).updateName`
  nor the mutation in `useSignIn` declares a `mutationKey`, so every mutation failure reaches
  `onMutationError` as `hashKey([])`, the string `[]`.
- **The fences are drift protection, not a sandbox.** `app/entrypoint`, the `app` barrel and
  `src/main.tsx` carry no `axios` ban. The ban is an exact-name `paths` entry, so an `axios/…`
  subpath import — the package exports `./unsafe/*` and its adapters — passes lint. The deep-import
  rules match `@/shared/api/…` specifiers, so a relative import from another `shared` segment
  (`../api/http-client`) bypasses them. No rule restricts `fetch` or `XMLHttpRequest`.
- **Array query parameters use axios's bracket format.** `HttpQueryParams` accepts arrays, which
  axios serializes as `tag[]=a&tag[]=b` (percent-encoded). No caller passes one and no test pins the
  format, so check the API's expectation before relying on it.
