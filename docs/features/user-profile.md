# User profile (read path)

> **Status:** Complete · **Layers:** app, pages, features, entities, shared, outside layers · **Verified against:** `d6deb01`

## Purpose

The API speaks the server's language — its own field names (`fullName`, `createdAt`), an id that is
only a string, a timestamp as a string, fields the screen never reads — and the project's hard rule
is that no component ever sees it: every
response is validated and translated into a frontend-owned model inside its entity's `api` segment
(`entities/*/api`). This feature is where that rule becomes code. `entities/user` is the reference
entity every future entity copies, and the `/users/$userId` screen is the read path that proves it
end to end — a route loader warms the cache, one query factory fetches, validates and maps, and a
page renders a `User` in three explicit states. Together they answer where a wire shape lives, what
stops it escaping, and where a query key and its fetcher belong.

## How it works

A visit to `/users/{userId}` — typed or pasted, since nothing in the app links there yet — runs
this sequence:

1. **Guard.** The route module sits under the pathless `_authenticated` layout route, whose
   `beforeLoad` asks `context.sessionResolver.resolve()` for a verdict and redirects anything other
   than `authenticated` to `/sign-in` before this route's loader runs
   ([Authenticated route guard](./route-guard.md)).
2. **Loader.** The route's `loader` — TanStack Router's per-route data hook, which runs after every
   parent `beforeLoad` and before the component renders — builds the detail query options from the
   router context with `createUserQueries(context.httpClient).detail(toUserId(params.userId))`,
   where `toUserId` brands the raw URL segment, and hands them to
   `context.queryClient.prefetchQuery` without awaiting. The navigation commits at once while the
   request is in flight.
3. **Route component.** `UserProfileRoute` reads `Route.useParams()` for the id and `useNavigate()`
   for the destination, then renders `UserProfilePage` with `userId={toUserId(userId)}` and
   `onSignedOut={() => { void navigate({ to: '/sign-in' }); }}`. Route state and navigation stop in
   `app/routes`; the page receives a prop and a callback, the same division
   `src/app/routes/sign-in.tsx` uses for `onSignedIn`.
4. **Query.** `useUserProfile(userId)` takes the transport from `useHttpClient()` and calls
   `useQuery` with the same options. The key, `['users', 'detail', userId]`, matches the prefetch,
   so the hook joins the request already in flight instead of sending a second one.
5. **Fetch, validate, map.** The `queryFn` builds the path with `userResourcePath` — refusing `''`,
   `.` and `..`, percent-encoding everything else — and calls
   `httpClient.get('/users/{userId}', { schema: userDtoSchema, signal })`. The transport sends
   `GET /v1/users/{userId}` with the session's bearer token and resolves only with a body that
   satisfies `userDtoSchema` ([HTTP transport](./http-transport.md)). `toUser` translates that
   `UserDto` into a `User`, and the cache stores the `User`: nothing above `entities/user/api` ever
   holds the wire shape.
6. **Render.** `useUserProfile` reduces the query to a `UserProfileState` — `pending`, `unavailable`
   or `ready`. `UserProfilePage` calls the hook and renders two things inside its `<main>`: a
   right-aligned `<div>` holding `SignOutButton` from `@/features/sign-out`, and then
   `UserProfileContent`. `UserProfileContent` switches on the status: an `<output>` reading
   `userProfile.loading`, a `role="alert"` paragraph reading `userProfile.unavailable`, or
   `UserProfileView` (the display name as the `<h1>`, the email, the status rendered by the entity's
   `UserStatusLabel` and the join date in a `<time>` element) followed by `UpdateUserNameForm` from
   the [write path](./update-user-name.md). The button sits outside the status switch on purpose, so
   it is on screen in all three states — see [Design decisions](#design-decisions--trade-offs).
7. **Leaving.** Clicking the button runs `useSignOut`, which calls `useSessionEnder().signOut()`
   through a TanStack `useMutation` and notifies the page `onSettled`. `onSignedOut` reaches the
   route, which navigates to `/sign-in`; `clearCacheOnSessionEnd` empties the query cache as the
   session leaves `authenticated`, so the cached `User` goes with it
   ([Session management](./session-management.md)).

The failure paths that matter:

- **The read fails.** Every rejection of the `queryFn` is an `HttpError`: a `403` or `404` (kind
  `client`) — backend-boilerplate answers `403` for any id but the caller's own unless the caller
  holds `users.read`, so only such a caller sees `404` for an id that does not exist — a body that
  fails `userDtoSchema` (`validation`), a dropped connection, a timeout or a `5xx` once
  the retry policy gives up (`network`, `timeout`, `server`), or a dot-segment id refused before any
  request is made (`unknown`). The query settles in error, the page shows the `unavailable` alert,
  and the query cache's `onError` hands the failure to the error reporter that
  `app/entrypoint/app.tsx` binds ([Error handling and reporting](./error-handling.md)).
- **The guard denies.** The redirect is thrown from the parent's `beforeLoad`, so this loader never
  runs and no user request is sent.

Two later events touch the cached `User`. A successful rename through `UpdateUserNameForm`
replaces it: `createUserMutations` maps the saved user the `PATCH` returned and writes it over
`['users', 'detail', userId]` through `replaceCachedUser`, so the view re-renders with the new name
and no second read is sent. When the session leaves `authenticated`,
`clearCacheOnSessionEnd` clears the whole query cache, cached users included
([Session management](./session-management.md)).

## Architecture

In Feature-Sliced Design a _layer_ is a top-level folder under `src/` (`app`, `pages`, `features`,
`entities`, `shared`), a _slice_ is one screen or business noun inside a layer
(`pages/user-profile`, `entities/user`), a _segment_ is a purpose-named folder inside a slice
(`model/`, `api/`, `ui/`), and a slice's _public API_ is its `index.ts` barrel, the only file other
slices may import. A _port_ — the repo also says _seam_ — is an interface its consumers program
against while the concrete behind it is chosen elsewhere. The read path defines no port of its own;
it programs against two owned elsewhere: the `HttpClient` transport port, narrowed to
`UserReadClient` (`Pick<HttpClient, 'get'>`), and TanStack Query's `QueryClient`. Their concretes
are built once at the _composition root_ — `src/app/entrypoint/**`, the only code that constructs
concretes — in `app-providers.tsx`, as `createAuthenticatedTransport(apiBaseUrl).httpClient` and
`createQueryClient(queryErrorHandlers)`, and published through `HttpClientProvider` and
`QueryClientProvider`. Components reach the transport with `useHttpClient()`; the loader runs
outside React, so `AppRouterProvider` copies both into `AppRouterContext`
([Composition root](./composition-root.md)). The screen also composes one `features` slice that
programs against a third port it does not own: `SignOutButton` from `@/features/sign-out` reaches
`SessionEnder` through `useSessionEnder()`, which `AppProviders` fills with `SessionEnderProvider`
(see [Sign-out](./sign-out.md) for that port and [Authenticated route guard](./route-guard.md) for
the session's ports). The feature therefore binds nothing at the composition root: its only wiring
is its route module. Imports point strictly down the layers — the route module imports
`@/entities/user` and `@/pages/user-profile`; the page imports `@/features/sign-out`,
`@/features/update-user-name`, `@/entities/user`, `@/shared/api` and `@/shared/i18n`; the entity
imports `@/shared/api`, `@/shared/i18n` (for `UserStatusLabel` alone), `@tanstack/react-query` and
`zod/mini`; and `model/user.ts` imports nothing at all.

| Component                                                     | Layer                            | Responsibility                                                                                                                                             | File                                                                               |
| ------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Route` (`/_authenticated/users/$userId`), `UserProfileRoute` | `app/routes`                     | Prefetches the detail query in `loader`; turns the URL param into a `UserId` prop and `useNavigate()` into the `onSignedOut` callback                      | `src/app/routes/_authenticated/users.$userId.tsx`                                  |
| `AppRouterContext`                                            | `app/router`                     | Carries `httpClient` and `queryClient` (and the guard's `sessionResolver`) to loaders                                                                      | `src/app/router/app-router-context.ts`                                             |
| `UserProfilePage`                                             | `pages/user-profile · ui`        | Calls `useUserProfile(userId)` and renders `SignOutButton` and then `UserProfileContent` inside the screen's `<main>`                                      | `src/pages/user-profile/ui/user-profile-page.tsx`                                  |
| `UserProfileContent`                                          | `pages/user-profile · ui`        | The status switch: in its `ready` case renders `UserProfileView`, then `UpdateUserNameForm`                                                                | `src/pages/user-profile/ui/user-profile-page.tsx`                                  |
| `SignOutButton`                                               | `features/sign-out · ui`         | The page's way out: ends the session through `useSessionEnder()` and calls `onSignedOut` when the attempt settles; documented in [Sign-out](./sign-out.md) | `src/features/sign-out/ui/sign-out-button.tsx`                                     |
| `useUserProfile`, `UserProfileState`                          | `pages/user-profile · model`     | Reduces the detail query to `pending`, `unavailable` or `ready`                                                                                            | `src/pages/user-profile/model/use-user-profile.ts`                                 |
| `UserProfileView`                                             | `pages/user-profile · ui`        | Renders a loaded `User`: heading, email, status label, join date                                                                                           | `src/pages/user-profile/ui/user-profile-view.tsx`                                  |
| `UpdateUserNameForm`                                          | `features/update-user-name · ui` | Write-path form the page renders in its `ready` state; documented in [Update user name](./update-user-name.md)                                             | `src/features/update-user-name/ui/update-user-name-form.tsx`                       |
| `User`, `UserId`, `UserStatus`, `UserNameChange`, `toUserId`  | `entities/user · model`          | The frontend-owned domain model; imports nothing                                                                                                           | `src/entities/user/model/user.ts`                                                  |
| `userDtoSchema`, `UserDto`, `UpdateUserNameRequestDto`        | `entities/user · api`            | The server's wire shape as a consumer-driven `zod/mini` schema, the type inferred from it, and the request body the write sends                            | `src/entities/user/api/user-dto.ts`                                                |
| `toUser`, `toUpdateUserNameRequestDto`                        | `entities/user · api`            | Pure translation between the wire and domain shapes                                                                                                        | `src/entities/user/api/user-mapper.ts`                                             |
| `createUserQueries`, `userQueryKeys`, `UserReadClient`        | `entities/user · api`            | The query-key tree and the `detail` query options: fetch, validate, map                                                                                    | `src/entities/user/api/user-queries.ts`                                            |
| `userResourcePath`                                            | `entities/user · api`            | Builds `/users/{id}` and refuses `''`, `.` and `..`                                                                                                        | `src/entities/user/api/user-resource-path.ts`                                      |
| `createUserMutations`                                         | `entities/user · api`            | Write-path mutation options and their cache write; documented in [Update user name](./update-user-name.md)                                                 | `src/entities/user/api/user-mutations.ts`                                          |
| `replaceCachedUser`, `UserCacheTarget`                        | `entities/user · api`            | Writes a saved `User` over the cached one, and only over an existing one; documented in [Update user name](./update-user-name.md)                          | `src/entities/user/api/user-cache.ts`                                              |
| `UserStatusLabel`                                             | `entities/user · ui`             | Renders a `UserStatus` as translated copy, so every screen that shows a status uses one wording                                                            | `src/entities/user/ui/user-status-label.tsx`                                       |
| `useLocale`                                                   | `shared/i18n`                    | Supplies the resolved, supported `Locale` the view formats dates with                                                                                      | `src/shared/i18n/use-locale.ts`                                                    |
| `user.*`, `userProfile.*`, `signOut.*` keys                   | `shared/i18n`                    | Field labels, status labels, state copy and the button's two labels, in `en` and `ru`                                                                      | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json` |
| `UserWireRecord`, `createUserStub`                            | `outside layers`                 | A pinned copy of the wire shape and a stateful `GET`/`PATCH /v1/users/{id}` stub                                                                           | `e2e/fixtures/user-stub.ts`                                                        |
| `createUserProfilePageObject`                                 | `outside layers`                 | The screen's locators and copy for the browser suite                                                                                                       | `e2e/page-objects/user-profile-page-object.ts`                                     |

### The DTO → domain model contract

Each entity holds three shapes in three files, and only one of them may leave the slice:

| Shape        | File                     | Speaks for                                       | In `entities/user`                                                                                                                                                                                                                      |
| ------------ | ------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire (DTO)   | `api/<entity>-dto.ts`    | The server                                       | `userDtoSchema`, a `zod/mini` schema declaring the seven fields the frontend reads, and `UserDto` inferred from it; `UpdateUserNameRequestDto` is declared on its own, because the server validates requests with a schema of their own |
| Domain model | `model/<entity>.ts`      | The frontend                                     | `User`: a `UserStatus` union, a real `Date`, a branded `UserId`, and `displayName` in place of the wire's `fullName`; the file imports nothing, not even a schema library                                                               |
| Translation  | `api/<entity>-mapper.ts` | Both — the only module that knows the two shapes | `toUser` inbound and `toUpdateUserNameRequestDto` outbound; pure — no I/O, no clock, no i18n                                                                                                                                            |

Three rules make the contract hold:

- **Validate at the transport, map in the factory.** `HttpClient` requires a `schema` on all five
  verbs, so a response reaches the entity already checked against its DTO schema. The query and
  mutation factories then apply the mappers — `toUser` to what comes in,
  `toUpdateUserNameRequestDto` to what goes out — so whatever leaves `api/`, into the cache, a hook
  or a component, is the domain model.
- **Only the mapper authors a model.** `toUser` is the only module that constructs a `User`, and it
  builds one only from a validated server record — `displayName` included, which it copies from the
  server-composed `fullName`. The write path puts the `User` that `toUser` mapped from the `PATCH`
  response into the cache, never one it assembled itself. Test fixtures are the exception, and must
  keep `displayName` consistent with the name parts by hand — no type can enforce it.
- **The barrel is the leak gate.** Nothing that names the wire shape is exported from
  `src/entities/user/index.ts`, so no module outside the slice can name it; inside the slice, only
  `api/` modules import `user-dto.ts`.

What an entity's `index.ts` may export:

| May export                                          | In `@/entities/user`                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain model types                                  | `User`, `UserId`, `UserNameChange` — `UserStatus` stays inside, because consumers name it as `User['status']`                                         |
| Constructors of model values                        | `toUserId`                                                                                                                                            |
| Collaborator factories                              | `createUserQueries`, `createUserMutations`                                                                                                            |
| Components that present a model value               | `UserStatusLabel`                                                                                                                                     |
| Ports, with the provider and hook that publish them | None here; `entities/session` exports `SessionResolverProvider` and `useSessionResolver`, for example ([Authenticated route guard](./route-guard.md)) |

What it must not export:

| Must not export             | Kept inside `entities/user`                            | Why                                                                                                                       |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| DTO types and their schemas | `UserDto`, `UpdateUserNameRequestDto`, `userDtoSchema` | They are the wire shape the rule confines to `api/`                                                                       |
| Mappers                     | `toUser`, `toUpdateUserNameRequestDto`                 | Only the factories apply them, so every value leaving `api/` is already mapped                                            |
| Path builders               | `userResourcePath`                                     | The URL is transport detail, and one builder keeps the dot-segment guard on reads and writes alike                        |
| Query-key objects           | `userQueryKeys`                                        | Which cache entry a user write replaces is entity knowledge; it lives in `createUserMutations`' `mutationFn`              |
| Cache helpers               | `replaceCachedUser`, `UserCacheTarget`                 | The write-through rules — replace, never create; cancel reads first — stay with the factory that applies them             |
| Required-interface types    | `UserReadClient`, `UserWriteClient`                    | They describe what the slice needs, not what it provides; each is exported from its own module for the slice's tests only |

The door is enforced mechanically; what passes through it is not. The ESLint slice public-API
pattern `^@/(entities|features|widgets|pages)/[^/]+/(?!@x/).+` (over the lower layers and
`app/routes`/`app/router`) and steiger's `fsd/no-public-api-sidestep` (over every layer, including
`app/entrypoint`) reject any import past an `index.ts`, and `no-restricted-syntax` keeps every
`index.ts` a pure re-export list — but no gate inspects _which_ names a barrel re-exports. Keeping
the second table out of the barrel is a review responsibility
([Architecture boundaries](./architecture-boundaries.md)).

## Public surface

### Route

| Path             | Auth            | Purpose                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/users/$userId` | `authenticated` | The profile of the user named by `$userId`. Module `src/app/routes/_authenticated/users.$userId.tsx`, route id `/_authenticated/users/$userId`; the pathless `_authenticated` layout adds no URL segment. The `loader` prefetches the detail query, and the component renders `UserProfilePage` with the URL param and an `onSignedOut` callback that navigates to `/sign-in`. |

### `@/pages/user-profile`

| Export            | Kind      | Signature                                                                                                                                                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserProfilePage` | Component | `UserProfilePage({ onSignedOut, userId }: UserProfilePageProps)`, where `UserProfilePageProps` is `{ readonly userId: UserId; readonly onSignedOut: () => void }` | Calls `useUserProfile(userId)` and renders one `<main>` holding `SignOutButton` and then `UserProfileContent`: the loading `<output>`, the `unavailable` alert, or `UserProfileView` followed by `UpdateUserNameForm`. `onSignedOut` fires once the sign-out attempt settles, whatever its outcome. Needs `QueryClientProvider`, `HttpClientProvider`, `SessionEnderProvider`, `NotifierProvider` and an i18n instance above it; it reads no route state, so it needs no router. |

`useUserProfile`, `UserProfileState`, `UserProfileContent` and `UserProfileView` are internal to
the slice, and so is `UserProfilePageProps` — the barrel exports the component alone.

The route module is the canonical call site. The whole of
`src/app/routes/_authenticated/users.$userId.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { createUserQueries, toUserId } from '@/entities/user';
import { UserProfilePage } from '@/pages/user-profile';

function UserProfileRoute() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <UserProfilePage
      userId={toUserId(userId)}
      onSignedOut={() => {
        void navigate({ to: '/sign-in' });
      }}
    />
  );
}

export const Route = createFileRoute('/_authenticated/users/$userId')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      createUserQueries(context.httpClient).detail(toUserId(params.userId)),
    );
  },
  component: UserProfileRoute,
});
```

`useNavigate` is reachable here because the module sits in `app/routes`: below `app`, lint allows
`Link` alone from `@tanstack/react-router`, which is why the destination arrives as a callback
rather than being chosen inside the page.

### `@/entities/user`

| Export                | Kind      | Signature                                                                                                  | Purpose                                                                                                                                                                                                                     |
| --------------------- | --------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createUserQueries`   | Function  | `createUserQueries(httpClient: UserReadClient)`, where `UserReadClient` is `Pick<HttpClient, 'get'>`       | Returns `{ detail }`. `detail(userId: UserId)` returns the `queryOptions()` for one user — key `['users', 'detail', userId]`, a `queryFn` that resolves a `User` — for `useQuery`, `prefetchQuery` or `fetchQuery`          |
| `createUserMutations` | Function  | `createUserMutations(httpClient: UserWriteClient)`, where `UserWriteClient` is `Pick<HttpClient, 'patch'>` | Returns `{ updateName }`. `updateName(userId: UserId)` returns the write path's `mutationOptions()`; see [Update user name](./update-user-name.md)                                                                          |
| `toUserId`            | Function  | `toUserId(value: string): UserId`                                                                          | Brands a raw string as a `UserId`; an unchecked cast that parses nothing                                                                                                                                                    |
| `User`                | Type      | See the model below                                                                                        | The domain model                                                                                                                                                                                                            |
| `UserId`              | Type      | `string & { readonly [userIdBrand]: 'UserId' }`                                                            | A branded identifier                                                                                                                                                                                                        |
| `UserNameChange`      | Type      | `{ readonly firstName: string; readonly lastName: string }`                                                | The input of `updateName`                                                                                                                                                                                                   |
| `UserStatusLabel`     | Component | `UserStatusLabel({ status }: { readonly status: UserStatus })`                                             | Renders the translated label of a status — `Active`, `Inactive` or `Awaiting verification` in English — as a text node. `UserStatus` is not exported; a consumer passes `user.status` or names the type as `User['status']` |

The whole domain model, `src/entities/user/model/user.ts`:

```ts
declare const userIdBrand: unique symbol;

export type UserId = string & { readonly [userIdBrand]: 'UserId' };

export type UserStatus = 'active' | 'inactive' | 'pending';

export interface User {
  readonly id: UserId;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly joinedAt: Date;
}

export interface UserNameChange {
  readonly firstName: string;
  readonly lastName: string;
}

export function toUserId(value: string): UserId {
  return value as UserId;
}
```

### HTTP contract

| Method | Path                                                                                                                                                            | Success response                                 | Mapped by               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| `GET`  | `/users/{userId}` under `VITE_API_BASE_URL` — `/v1/users/{userId}` by default; the id is percent-encoded, and `''`, `.` and `..` are refused before any request | `200` with a body that satisfies `userDtoSchema` | `toUser`, into a `User` |

| Wire field (`UserDto`) | Rule in `userDtoSchema`                      | Domain field (`User`) | Translation in `toUser`                                                                              |
| ---------------------- | -------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                   | `zm.uuid()`                                  | `id: UserId`          | `toUserId(dto.id)`                                                                                   |
| `firstName`            | `zm.string()`                                | `firstName`           | Unchanged; the server trims names before it stores them                                              |
| `lastName`             | `zm.string()`                                | `lastName`            | Unchanged                                                                                            |
| `fullName`             | `zm.string()`                                | `displayName`         | Unchanged; the server composes it as `` `${firstName} ${lastName}` ``                                |
| `email`                | `zm.email()`                                 | `email`               | Unchanged                                                                                            |
| `status`               | `zm.enum(['active', 'inactive', 'pending'])` | `status: UserStatus`  | Unchanged; `status: dto.status` compiles only while every value the schema accepts is a `UserStatus` |
| `createdAt`            | `zm.iso.datetime({ offset: true })`          | `joinedAt: Date`      | `new Date(dto.createdAt)`                                                                            |
| `updatedAt`            | Not declared, so stripped                    | —                     | —                                                                                                    |

The shape is a consumer-driven subset of backend-boilerplate's `userResponse`: the schema declares
the seven fields the frontend reads, drops every field it does not name — today `updatedAt` — and
rejects a missing or retyped one, so the server may add fields freely while a rename or retype fails
validation. A `status` the schema does not list fails closed: the page shows its `unavailable` state
until the value is added here, which is why a frontend release that knows a new status has to ship
before the backend starts sending it. `zm.iso.datetime({ offset: true })` rejects a timestamp
without a zone designator, so `new Date(dto.createdAt)` always parses an absolute instant. The
server answers `403 FORBIDDEN` for any id other than the caller's own unless the caller holds the
`users.read` permission — compared case-sensitively, so an upper-cased copy of the caller's own id
is someone else's — and only a `users.read` holder sees `404 USER_NOT_FOUND`; every error body is
the envelope `{ "error": { "code", "message", "requestId" } }`, which the transport does not parse.

### Translation keys

All keys live in the `common` namespace, which `src/shared/i18n/i18next.d.ts` types against the
English file, so a misspelt key fails `npm run typecheck`
([Internationalization](./internationalization.md)). `user.*` names the entity's fields and
statuses; `userProfile.*` is this screen's state copy; `signOut.*` belongs to `features/sign-out`,
which the screen composes.

| Key                       | `en`                              | `ru`                          | Used by                                           |
| ------------------------- | --------------------------------- | ----------------------------- | ------------------------------------------------- |
| `user.email`              | Email                             | Электронная почта             | `UserProfileView`                                 |
| `user.status`             | Status                            | Статус                        | `UserProfileView`                                 |
| `user.joinedAt`           | Joined                            | Присоединился                 | `UserProfileView`                                 |
| `user.statuses.active`    | Active                            | Активен                       | `UserStatusLabel`, through `STATUS_LABEL_KEYS`    |
| `user.statuses.inactive`  | Inactive                          | Неактивен                     | `UserStatusLabel`, through `STATUS_LABEL_KEYS`    |
| `user.statuses.pending`   | Awaiting verification             | Ожидает подтверждения         | `UserStatusLabel`, through `STATUS_LABEL_KEYS`    |
| `userProfile.loading`     | Loading profile…                  | Загрузка профиля…             | `UserProfileContent`, `pending` state             |
| `userProfile.unavailable` | This profile could not be loaded. | Не удалось загрузить профиль. | `UserProfileContent`, `unavailable` state         |
| `signOut.action`          | Sign out                          | Выйти                         | `SignOutButtonView` (internal), idle label        |
| `signOut.inProgress`      | Signing out…                      | Выходим…                      | `SignOutButtonView` (internal), request in flight |

## Configuration

The feature reads no `VITE_*` variable and takes no options of its own: `createUserQueries`
receives only an `HttpClient`, and the slice's constants — `USERS_QUERY_SCOPE`,
`USERS_RESOURCE_SCOPE`, `UNUSABLE_IDENTIFIER_SEGMENTS` and `STATUS_LABEL_KEYS` — are fixed in
source. Its behaviour is
shaped by settings owned elsewhere:

| Variable / option                                                      | Default                                                                      | Meaning                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`, read as `appConfig.apiBaseUrl`                    | `/v1`                                                                        | The prefix the transport puts before `/users/{id}`, so the read is `GET /v1/users/{id}` by default; see [Configuration and environment](./configuration.md)                                       |
| `server.proxy['/v1']` in `vite.config.ts`                              | `http://localhost:8000`                                                      | Under `npm run dev`, forwards `/v1` requests to a local API                                                                                                                                       |
| `staleTime`, set by `createQueryClient`                                | `30_000` ms                                                                  | A cached `User` younger than this is served without a request, both to the loader's `prefetchQuery` and to `useQuery`                                                                             |
| `gcTime`, set by `createQueryClient`                                   | `300_000` ms                                                                 | How long an unobserved `User` stays cached after its page unmounts                                                                                                                                |
| `retry`, set by `createQueryClient`                                    | Up to 2 retries, for `network`, `server` and `timeout` failures and HTTP 429 | A `403`, a `404` or a `validation` failure shows the alert at once; a `5xx` shows it after the retries                                                                                            |
| `timeoutMilliseconds`, read by `createHttpClient`                      | `15_000` ms                                                                  | The limit on each attempt of the `GET`; `createAuthenticatedTransport` passes no override                                                                                                         |
| `defaultPreload` / `defaultPreloadStaleTime`, set by `createAppRouter` | `'intent'` / `0`                                                             | Hovering a `Link` into the route runs the guard and the loader; the router caches no loader result, so the query's `staleTime` alone decides whether a request goes out ([Routing](./routing.md)) |
| `webServer.env.VITE_API_BASE_URL` in `playwright.config.ts`            | `API_PREFIX`, which is `/v1`                                                 | Pins the end-to-end build to the prefix the stubs intercept                                                                                                                                       |
| `use.locale` / `use.timezoneId` in `playwright.config.ts`              | `'en-US'` / `'UTC'`                                                          | Make the English copy and the `January 5, 2024` join date deterministic in the browser suite                                                                                                      |

## Usage & extension

### See it run

```bash
npm install
cp .env.example .env
npm run dev
```

Open `/users/<id>` on the dev server. With no API running, the app redirects to `/sign-in`: the
guard resolves the session through `POST /v1/auth/refresh`, and a refused connection is not an
authenticated session. To see the profile, run
[backend-boilerplate](https://github.com/khusenov/backend-boilerplate), which serves
`POST /v1/auth/refresh`, `POST /v1/auth/login` and `GET /v1/users/{id}` in the shapes of
`src/entities/session/api/session-dto.ts` and `src/entities/user/api/user-dto.ts` at
`http://localhost:8000`, where the dev server proxies `/v1`. A fresh backend has no users, so
register one and verify its email first, as the root README's
[Getting started](../../README.md#getting-started) shows. Sign in at `/sign-in`
([Sign-in](./sign-in.md)), which lands on `/`, then open `/users/<id>` with the `id` registration
returned.

### Read a user from another slice

Any slice below `app` reads a user through the factory and the transport hook — never through the
DTO or a hand-built path. Every consumer of `detail(userId)` shares one cache entry with the profile
page: one fetch, and one entry that a rename replaces for every reader at once. To project a single
field, pass `select` rather than mapping in the component:

```ts
import { useQuery } from '@tanstack/react-query';

import { createUserQueries } from '@/entities/user';
import type { UserId } from '@/entities/user';
import { useHttpClient } from '@/shared/api';

export function useUserDisplayName(userId: UserId): string | undefined {
  const httpClient = useHttpClient();
  const { data } = useQuery({
    ...createUserQueries(httpClient).detail(userId),
    select: (user) => user.displayName,
  });

  return data;
}
```

A route module that wants the user before render prefetches exactly as `users.$userId.tsx` does,
with `context.httpClient` and `context.queryClient` from `AppRouterContext`. It constructs no client
of its own: ESLint bans `createHttpClient` and `createQueryClient` in every layer below `app` and in
`app/routes` and `app/router`.

### Link to a profile

Below `app`, `Link` is the only importable `@tanstack/react-router` export, and the generated route
tree types its params:

```tsx
import { Link } from '@tanstack/react-router';

import type { User } from '@/entities/user';

interface UserProfileLinkProps {
  readonly user: Pick<User, 'displayName' | 'id'>;
}

export function UserProfileLink({ user }: UserProfileLinkProps) {
  return (
    <Link to="/users/$userId" params={{ userId: user.id }}>
      {user.displayName}
    </Link>
  );
}
```

With `defaultPreload: 'intent'`, hovering the link runs the guard and the loader, so the request
starts before the click.

### Add a field to `User`

1. Add the wire field to `userDtoSchema` in `src/entities/user/api/user-dto.ts`; `UserDto` follows
   by inference.
2. Add the domain field to `User` in `src/entities/user/model/user.ts`, in frontend vocabulary:
   camelCase, and a `Date`, a union or a brand where the wire sends a string.
3. Translate it in `toUser` (`src/entities/user/api/user-mapper.ts`) and cover the translation in
   `user-mapper.test.ts`. Its `keeps no wire field names on the domain model` case lists the model's
   keys and fails until you add the new one.
4. Update the unit fixtures. The wire payload literals in eight test files —
   `user-queries.test.ts`, `user-cache.test.ts`, `user-mutations.test.ts`,
   `use-update-user-name.test.tsx`, `update-user-name-form.test.tsx`, `user-profile-page.test.tsx`,
   `users.$userId.test.tsx` and `_authenticated.test.tsx` — are plain objects checked only by the
   schema at run time, through `parseStubResponse`, so a new required field missing from them fails
   those tests rather than the type check. `adaDto` in `user-mapper.test.ts` and the `User` fixtures
   in `user-cache.test.ts` and `user-mutations.test.ts` are typed, and fail `npm run typecheck`; the
   `ada` fixture in `user-profile-view.test.tsx` is typed from the view's own `Pick`, so it changes
   only when the view starts reading the field.
5. If the screen shows the field, render it in `UserProfileView` with a label key added to both
   `src/shared/i18n/locales/en/common.json` and `src/shared/i18n/locales/ru/common.json`.
6. Update `UserWireRecord` in `e2e/fixtures/user-stub.ts` and the `ADA` record in
   `e2e/user-profile.spec.ts` by hand — never by importing `UserDto`.

### Add the next entity

The steps below add a hypothetical `project` entity served by `GET /v1/projects/{id}` and a
`/projects/$projectId` screen; substitute your own resource. Name the slice in the singular:
steiger's `fsd/inconsistent-naming` rejects a mix of plural and singular entity names, and `user`
and `session` are singular. Every snippet below type-checks, lints and passes `npm run arch` as
written. This hypothetical API names its fields and values differently from backend-boilerplate on
purpose, so the mapper has real translation to do; when a wire value already is the domain value,
pass it straight through, as `toUser` does with `status`.

**1. The domain model** — `src/entities/project/model/project.ts`, importing nothing:

```ts
declare const projectIdBrand: unique symbol;

export type ProjectId = string & { readonly [projectIdBrand]: 'ProjectId' };

export type ProjectVisibility = 'private' | 'public';

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly visibility: ProjectVisibility;
  readonly createdAt: Date;
}

export function toProjectId(value: string): ProjectId {
  return value as ProjectId;
}
```

**2. The wire shape** — `src/entities/project/api/project-dto.ts`, in `zod/mini`:

```ts
import * as zm from 'zod/mini';

export const projectDtoSchema = zm.object({
  id: zm.string(),
  name: zm.string(),
  visibility: zm.enum(['PRIVATE', 'PUBLIC']),
  created_at: zm.iso.datetime({ offset: true }),
});

export type ProjectDto = zm.infer<typeof projectDtoSchema>;
```

**3. The mapper** — `src/entities/project/api/project-mapper.ts`. Typing the lookup table as
`Record<ProjectDto['visibility'], ProjectVisibility>` makes a new wire value without a translation a
compile error:

```ts
import { toProjectId } from '../model/project';
import type { Project, ProjectVisibility } from '../model/project';

import type { ProjectDto } from './project-dto';

const PROJECT_VISIBILITY_BY_WIRE_VALUE: Record<ProjectDto['visibility'], ProjectVisibility> = {
  PRIVATE: 'private',
  PUBLIC: 'public',
};

export function toProject(dto: ProjectDto): Project {
  return {
    id: toProjectId(dto.id),
    name: dto.name.trim(),
    visibility: PROJECT_VISIBILITY_BY_WIRE_VALUE[dto.visibility],
    createdAt: new Date(dto.created_at),
  };
}
```

**4. The resource path** — `src/entities/project/api/project-resource-path.ts`, copying the
dot-segment guard unchanged:

```ts
import { toHttpError } from '@/shared/api';

import type { ProjectId } from '../model/project';

const PROJECTS_RESOURCE_SCOPE = 'projects';
const UNUSABLE_IDENTIFIER_SEGMENTS: readonly string[] = ['', '.', '..'];

export function projectResourcePath(projectId: ProjectId): string {
  if (UNUSABLE_IDENTIFIER_SEGMENTS.includes(projectId)) {
    throw toHttpError(new Error('A project identifier may not be empty or a dot segment.'));
  }

  return `/${PROJECTS_RESOURCE_SCOPE}/${encodeURIComponent(projectId)}`;
}
```

**5. The query factory** — `src/entities/project/api/project-queries.ts`. `projectQueryKeys` stays
out of the barrel; a future `createProjectMutations` imports it to write a saved project through, as
`replaceCachedUser` does for users:

```ts
import { queryOptions } from '@tanstack/react-query';

import type { HttpClient } from '@/shared/api';

import type { Project, ProjectId } from '../model/project';

import { projectDtoSchema } from './project-dto';
import { toProject } from './project-mapper';
import { projectResourcePath } from './project-resource-path';

const PROJECTS_QUERY_SCOPE = 'projects';
const ALL_PROJECTS_KEY = [PROJECTS_QUERY_SCOPE] as const;

export type ProjectReadClient = Pick<HttpClient, 'get'>;

export const projectQueryKeys = {
  all: () => ALL_PROJECTS_KEY,
  detail: (projectId: ProjectId) => [...ALL_PROJECTS_KEY, 'detail', projectId] as const,
};

export function createProjectQueries(httpClient: ProjectReadClient) {
  return {
    detail: (projectId: ProjectId) =>
      queryOptions({
        queryKey: projectQueryKeys.detail(projectId),
        queryFn: async ({ signal }): Promise<Project> => {
          const dto = await httpClient.get(projectResourcePath(projectId), {
            schema: projectDtoSchema,
            signal,
          });

          return toProject(dto);
        },
      }),
  };
}
```

**6. The public API** — `src/entities/project/index.ts`, exporting the model and the factory only:

```ts
export { createProjectQueries } from './api/project-queries';
export { toProjectId } from './model/project';
export type { Project, ProjectId, ProjectVisibility } from './model/project';
```

**7. The entity's tests.** `src/entities/project/api/project-mapper.test.ts` pins the translation,
including the case that fails a lazy `dto as unknown as Project`:

```ts
import { describe, expect, it } from 'vitest';

import type { ProjectDto } from './project-dto';
import { toProject } from './project-mapper';

const apolloDto: ProjectDto = {
  id: 'p_1',
  name: 'Apollo',
  visibility: 'PRIVATE',
  created_at: '2024-01-05T12:00:00.000Z',
};

describe('toProject', () => {
  it('translates every wire visibility into its domain visibility', () => {
    expect(toProject({ ...apolloDto, visibility: 'PRIVATE' }).visibility).toBe('private');
    expect(toProject({ ...apolloDto, visibility: 'PUBLIC' }).visibility).toBe('public');
  });

  it('parses the wire timestamp into a date', () => {
    expect(toProject(apolloDto).createdAt).toStrictEqual(new Date('2024-01-05T12:00:00.000Z'));
  });

  it('keeps no wire field names on the domain model', () => {
    expect(Object.keys(toProject(apolloDto)).sort()).toStrictEqual([
      'createdAt',
      'id',
      'name',
      'visibility',
    ]);
  });
});
```

Then copy `src/entities/user/api/user-queries.test.ts` to `project-queries.test.ts` and rename: it
covers the key tree, the request path, percent-encoding, the dot-segment refusal and schema
rejections, and it is what executes `project-dto.ts` and `project-resource-path.ts` under coverage.

**8. The screen.** Add a top-level `projectOverview` object to
`src/shared/i18n/locales/en/common.json`, the typed file, so a missing key fails
`npm run typecheck`:

```json
{
  "projectOverview": {
    "loading": "Loading project…",
    "unavailable": "This project could not be loaded."
  }
}
```

Add its translation to `src/shared/i18n/locales/ru/common.json`, where a missing key falls back to
English:

```json
{
  "projectOverview": {
    "loading": "Загрузка проекта…",
    "unavailable": "Не удалось загрузить проект."
  }
}
```

The hook, `src/pages/project-overview/model/use-project-overview.ts`, mirrors `useUserProfile`:

```ts
import { useQuery } from '@tanstack/react-query';

import { createProjectQueries } from '@/entities/project';
import type { Project, ProjectId } from '@/entities/project';
import { useHttpClient } from '@/shared/api';

export type ProjectOverviewState =
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly project: Project };

export function useProjectOverview(projectId: ProjectId): ProjectOverviewState {
  const httpClient = useHttpClient();
  const projectQuery = useQuery(createProjectQueries(httpClient).detail(projectId));

  if (projectQuery.isPending) {
    return { status: 'pending' };
  }

  if (projectQuery.isError) {
    return { status: 'unavailable' };
  }

  return { status: 'ready', project: projectQuery.data };
}
```

The page, `src/pages/project-overview/ui/project-overview-page.tsx`. When the loaded state grows
beyond a heading, move it into its own `*-view.tsx`, as `UserProfileView` is, so its test needs no
providers:

```tsx
import type { ReactElement } from 'react';

import type { ProjectId } from '@/entities/project';
import { useTranslation } from '@/shared/i18n';

import { useProjectOverview } from '../model/use-project-overview';
import type { ProjectOverviewState } from '../model/use-project-overview';

interface ProjectOverviewPageProps {
  readonly projectId: ProjectId;
}

interface ProjectOverviewContentProps {
  readonly overview: ProjectOverviewState;
}

function ProjectOverviewContent({ overview }: ProjectOverviewContentProps): ReactElement {
  const { t } = useTranslation();

  switch (overview.status) {
    case 'pending':
      return <output>{t('projectOverview.loading')}</output>;
    case 'unavailable':
      return (
        <p role="alert" className="text-destructive">
          {t('projectOverview.unavailable')}
        </p>
      );
    case 'ready':
      return <h1 className="text-3xl font-semibold tracking-tight">{overview.project.name}</h1>;
  }
}

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const overview = useProjectOverview(projectId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <ProjectOverviewContent overview={overview} />
    </main>
  );
}
```

The page's public API, `src/pages/project-overview/index.ts`:

```ts
export { ProjectOverviewPage } from './ui/project-overview-page';
```

**9. The route** — `src/app/routes/_authenticated/projects.$projectId.tsx`, a private route because
it sits under `_authenticated/`:

```tsx
import { createFileRoute } from '@tanstack/react-router';

import { createProjectQueries, toProjectId } from '@/entities/project';
import { ProjectOverviewPage } from '@/pages/project-overview';

function ProjectOverviewRoute() {
  const { projectId } = Route.useParams();

  return <ProjectOverviewPage projectId={toProjectId(projectId)} />;
}

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      createProjectQueries(context.httpClient).detail(toProjectId(params.projectId)),
    );
  },
  component: ProjectOverviewRoute,
});
```

Run `npx vite build` (or keep `npm run dev` running) to regenerate `src/app/router/route-tree.gen.ts`
and commit it; until then the new module is a `npm run typecheck` error. Copy
`src/pages/user-profile/ui/user-profile-page.test.tsx` and
`src/app/routes/_authenticated/users.$userId.test.tsx` for the page and route tests, and drop their
`SessionStarterProvider` and `SessionEnderProvider` wrappers — in the page test that means removing
the entry from `renderWithProviders`'s `wrappers` array, leaving the option off entirely:
`ProjectOverviewPage` composes no `features` slice, so nothing in its tree calls
`useSessionStarter()` or `useSessionEnder()`.

**10. The gates.** Run `npm run audit` ([Quality gates](./quality-gates.md)). Its coverage step
enforces 90% per file, which is why each new module needs the tests above. `fsd/insignificant-slice` passes because `entities/project` has
two referencing locations, the route module in `app` and `pages/project-overview`; without the
route module steiger reports
`This slice has only one reference in slice "pages/project-overview". Consider merging them.` An
entity therefore lands together with its first consumers. A slice of the `features` layer has no
such second consumer to find: `steiger.config.ts` turns the rule off for all four of them —
`./src/features/sign-in/**`, `./src/features/sign-out/**`, `./src/features/switch-locale/**` and
`./src/features/update-user-name/**` — each with exactly one consuming slice, which is what the rule
flags. Add a new feature slice's glob to that
override rather than inventing a second consumer for it; an entity gets no such waiver.

For the browser suite, a second resource stub is a new file beside `e2e/fixtures/user-stub.ts` —
which falls through with `route.fallback()` on any path it does not own — plus one `page.route`
registration in `e2e/fixtures/harness.ts` ([End-to-end testing](./e2e-testing.md)).

## Design decisions & trade-offs

- **Three shapes in three files, and the model imports nothing.** A consumer of `User` inherits no
  vendor — not Zod, not TanStack, not axios — and no server naming; that is the property the
  arrangement exists to buy. Rendering the DTO directly would couple every component to the
  server's naming, so a wire rename would ripple through the UI instead of stopping at one mapper.
  The last `toUser` test asserts the domain object carries none of the wire field names, so a lazy
  `dto as unknown as User` fails the suite, not merely the reviewer.
- **`displayName` comes from the server.** backend-boilerplate composes `fullName` from the name
  parts it has already trimmed, so `toUser` copies it into `displayName` rather than joining
  `firstName` and `lastName` a second time on the client, where the two joins could disagree. The
  model keeps `firstName` and `lastName`, which the write path needs to prefill its form, so no
  component splits a display name back into parts. The cost is that a hand-built `User` fixture must
  keep the three fields consistent.
- **The DTO is consumer-driven, and fails closed on an unknown status.** `userDtoSchema` names the
  seven fields the frontend reads rather than all eight the server sends, so a field the server adds
  or the frontend never reads is stripped instead of breaking the page. An enum is the exception: a
  `status` value the schema does not list fails validation, and there is no lookup table to keep in
  step, because `status: dto.status` stops compiling the moment the schema accepts a value
  `UserStatus` lacks, and `STATUS_LABEL_KEYS` then demands its label. Failing closed fixes a
  deployment order — expand the frontend, then let the backend send the value. A status that is only
  displayed could be read tolerantly instead, mapping an unknown value to a neutral label; that is a
  deliberate change for the day frontend-first releases can no longer be guaranteed.
- **`toUserId` brands; it does not parse.** It is an unchecked cast whose value is naming the two
  boundaries where an untyped string becomes an identifier: `app/routes`, where the URL param is
  read, and `toUser`, where the wire `id` is translated. Those are call sites, not ports — nothing
  is substituted behind them. The brand stops a plain `string` — an email, a display name — being
  passed where a `UserId` is expected; it validates nothing, which is why the guard that matters
  lives where the path is built.
- **The path builder refuses dot segments rather than encoding them.** `encodeURIComponent` keeps a
  crafted `../admin` inside the users path (`/users/..%2Fadmin`), but it leaves `.` unreserved, so a
  bare `..` still climbs a level once the URL is normalised (`/v1/users/..` becomes `/v1/`), and
  encoding the dots does not help, because the WHATWG URL parser treats `%2e%2e` as a double-dot
  segment too; `''` and `.` would address the collection instead of a user. Refusing the three
  segments outright is the only thing that holds. The refusal throws through `toHttpError`, so the
  query keeps exactly one failure type, `HttpError`, and its kind is `unknown` rather than `client`
  because no request was made and `client` means a real 4xx. `userResourcePath` is the one builder
  queries and mutations share, so the guard cannot be applied to reads and forgotten on writes.
- **Each factory depends on the narrowest port it uses.** `createUserQueries` takes
  `Pick<HttpClient, 'get'>` and `createUserMutations` takes `Pick<HttpClient, 'patch'>`, rather
  than the five-verb interface. The signature states what the factory can do, and a test
  substitutes a one-method object with no cast, as `user-queries.test.ts` does.
- **One home for a key and its fetcher.** `queryOptions()` keeps `queryKey` and `queryFn`
  type-linked, so `useQuery`, `prefetchQuery` and `fetchQuery` all infer `User` without restating
  it. Both key builders derive from one `ALL_USERS_KEY`, so invalidating `['users']` cannot
  silently stop matching a descendant; the test pins that as a prefix relationship rather than a
  literal. The cache write after a rename lives in `createUserMutations`' `mutationFn`, through
  `replaceCachedUser`, because which entry a user write replaces is entity knowledge — which is also
  why `userQueryKeys` left the barrel: no consumer needs it, and no consumer option can remove the
  write.
- **The loader prefetches without awaiting.** Awaiting would block the navigation on the request:
  the page's own pending state would never render, and a down backend would hold the navigation for
  the whole retry-and-timeout budget before the alert appeared. Firing and forgetting paints the loading
  state at once, `useQuery` joins the in-flight prefetch, and intent preloading can still warm the
  cache from a hovered link. The cost is that the loader cannot redirect or throw on a missing
  user, so the page owns every outcome.
- **The way out sits outside the status switch.** `SignOutButton` is rendered by `UserProfilePage`
  itself, in a `<div className="flex justify-end">` above `UserProfileContent`, not inside
  `UserProfileContent`'s `ready` case. Putting it in the `ready` case would tie the control to a
  successful read: a visitor whose profile query has failed would see the `unavailable` alert and
  no way to leave — precisely the state in which leaving matters most, and precisely the dead end
  the guard exists to avoid ([Authenticated route guard](./route-guard.md)). The last case of
  `user-profile-page.test.tsx`, "offers a way out while the profile is failing to load", renders
  with the failing client and asserts the `Sign out` button is enabled beside the alert, so moving
  the button under the switch fails the suite. The cost is that the page composes a `features`
  slice it does not otherwise need, which is why `UserProfilePage` takes `onSignedOut` as well as
  `userId`.
- **The page is three modules, one reason to change each.** A hook reduces the query to a view
  model, a view renders a loaded `User` and nothing else, and a container chooses which state is on
  screen, so `user-profile-view.test.tsx` stands up no `QueryClientProvider`, no
  `HttpClientProvider` and no router. The state `switch` has an explicit `ReactElement` return type
  and no `default`, so a fourth `UserProfileState` member fails to compile with TS2366. The
  familiar `default: return profile satisfies never` type-checks identically but is unreachable,
  so v8 would record an uncovered statement against the 90% per-file coverage threshold.
- **Native elements carry the states' semantics.** Loading is an `<output>`, whose implicit role is
  `status`; oxlint's `jsx-a11y/prefer-tag-over-role` rejects the `<div role="status">`
  alternative. Failure uses `role="alert"`, for which no native element exists. Each `dt`/`dd` pair
  is wrapped in a `div` so the pair can be a flex row while the `dl` keeps `display: block`,
  because changing a description list's box type is known to drop its semantics in some screen
  readers.
- **Statuses and dates are rendered, never shown raw.** `UserStatusLabel` maps each `UserStatus` to
  a typed i18n key through `STATUS_LABEL_KEYS`, which `satisfies Record<UserStatus, string>`, so a
  new status without a label fails to compile; its test asserts the wire constant never reaches the
  screen. The mapping lives in the entity's `ui` segment because it depends only on `UserStatus` and
  `@/shared/i18n`, which makes `entities/user` the lowest layer that can hold it and gives every
  screen that shows a status the same wording. The join date goes through
  `Intl.DateTimeFormat` with `dateStyle: 'long'` and no date library: `Intl` reads the platform's
  CLDR data, so the same `Date` renders as `January 5, 2024` under `en` and `5 января 2024 г.`
  under `ru` at zero bundle cost, in the viewer's own time zone, while the model keeps a native
  `Date` rather than a vendor type. The locale comes from `useLocale()`, not `i18n.language`:
  `language` is the requested tag (`ru-RU` after `changeLanguage('ru-RU')`, typed `string`),
  whereas `useLocale` clamps `resolvedLanguage` to a supported `Locale`
  ([Internationalization](./internationalization.md)). A date library earns its place only when
  relative time or date arithmetic is needed, behind a `shared/lib` group, with `User.joinedAt`
  unchanged.
- **The DTO schema is `zod/mini`, because it ships on every page view.** `autoCodeSplitting` cuts a
  route module in two: the `component` moves into a lazily loaded chunk of its own, fetched only by
  a visitor who actually reaches that route, while the `loader` and `beforeLoad` stay in the module
  the generated route tree imports eagerly and so land in the entry chunk every visitor downloads
  ([Routing](./routing.md)). An entity's DTO schema is reached through the `loader`, which puts it
  on the eager side: its validator's bytes are paid by every visitor, not only by one who opens this
  route. Each figure below was measured under its own conditions. In this repo, the same object
  schema costs ≈17 kB gzip with classic `zod` against ≈3.2 kB with `zod/mini`. Any `zod/mini` schema
  pays a fixed ≈2.2 kB floor for the runtime, so roughly 1 kB of that ≈3.2 kB is this schema's own
  marginal cost. Bundled in isolation with React external, the same two packages measure 18.24 kB
  against 4.49 kB gzip — a per-package reference, not a marginal delta. When the slice landed
  (`640e67e`), the entry chunk grew 131.03 → 135.82 kB gzip, about +4.8 kB covering `zod/mini` and
  the whole slice, while `routes-*.js` — the component chunk of `/`, the only other split route at
  that commit — did not move at all, which is the measurement that pins the schema to the eager
  half. The new route's own component half became a `users._userId-*.js` chunk of 3.60 kB gzip,
  fetched only by a visitor to the route. `index.css` grew 4.40 → 4.50 kB gzip in that same commit,
  because Tailwind v4 scans source files rather than the import graph, so the utilities on the
  page's components are emitted as soon as the files exist. A build of `ccbb676` shows the same
  split: `userDtoSchema`, `toUser` and `userResourcePath` are in the entry chunk and
  `UserProfileView` is in `users._userId-*.js` — as is `SignOutButton`, whose `signOut.inProgress`
  label ships in the route's component chunk, so composing the feature cost the eager half nothing.
  Pinning `id` to `zm.uuid()` later added about 0.2 kB gzip to the eager `session-*.js` chunk that
  hosts `zod/mini` (11.21 → 11.43 kB). `zod/mini` composes functionally
  (`zm.nullable(zm.string())`, never `zm.string().nullable()`), and every schema that ships from
  `src/`, form schemas included, uses it ([Forms](./forms.md)). The schema's validation messages are
  developer diagnostics, never display copy: they travel as `HttpError.issues` to the error
  reporter, while the page shows `userProfile.unavailable`.
- **The browser suite pins its own copy of the wire shape.** `e2e/fixtures/user-stub.ts` declares
  `UserWireRecord` instead of importing `UserDto`. Renaming `fullName` in the DTO, the mapper and
  the unit fixtures together leaves `npm run audit` green, and only the pinned copy — which still
  sends `fullName` — fails the end-to-end suite; the general policy and its mechanical fence belong
  to [End-to-end testing](./e2e-testing.md). The copy is itself hand-written: this entity once
  pinned a `snake_case` shape no real server sent, and every gate stayed green, until it was
  re-pinned against backend-boilerplate's `userResponse` by reading that repository.

## Testing

| File                                                   | Kind                                                                                                                                                                                      | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/entities/user/api/user-mapper.test.ts`            | Unit                                                                                                                                                                                      | `toUser` shows the server's `fullName` as the display name, keeps `firstName` and `lastName`, carries every wire status into the domain, parses `createdAt` into a `Date`, carries the id across, and leaves no wire field name on the model. Its `toUpdateUserNameRequestDto` cases belong to the [write path](./update-user-name.md).                                                                                                                                                                |
| `src/entities/user/api/user-queries.test.ts`           | Unit, with a real `QueryClient` and a one-method `UserReadClient` that answers through `parseStubResponse`                                                                                | Every key sits under `['users']` and `detail` nests under it as a prefix; `detail` requests `/users/{uuid}` and resolves exactly the mapped `User`, so neither `fullName` nor `updatedAt` reaches the model; `../admin` goes out as `/users/..%2Fadmin`; `..` is refused with a `dot segment` message and kind `unknown`; an id of `not-a-uuid`, a status of `suspended`, an email of `not-an-email` and a `createdAt` of `yesterday` each reject with kind `validation` and the failing field's path. |
| `src/entities/user/ui/user-status-label.test.tsx`      | Component, no providers                                                                                                                                                                   | Each status renders its translated label — `Active`, `Inactive`, `Awaiting verification` — and never the wire constant.                                                                                                                                                                                                                                                                                                                                                                                |
| `src/pages/user-profile/ui/user-profile-view.test.tsx` | Component, no providers; the fixture is typed from the view's own `Pick` props                                                                                                            | The display name is the `<h1>`; the `Email`, `Status` and `Joined` labels are translated; the email and `Active` render; the join date is a `<time>` whose `datetime` is `2024-01-05T12:00:00.000Z`.                                                                                                                                                                                                                                                                                                   |
| `src/pages/user-profile/ui/user-profile-page.test.tsx` | Component, `renderWithProviders` (`QueryClientProvider`, `HttpClientProvider` and `NotifierProvider`) plus a `SessionEnderProvider` wrapper, all with stub collaborators, no router       | A `status` region while pending; the heading once the query resolves; an `alert` when it fails; after the form saves a new last name, the heading reads `Ada King` from the `PATCH` response while the stub has recorded exactly one `GET`, which proves the write path's cache write reaches this query without a second read; and the `Sign out` button is enabled beside the alert while the profile is failing to load.                                                                            |
| `src/app/routes/_authenticated/users.$userId.test.tsx` | Integration through `createAppRouter` and the generated route tree, memory history at `/users/{uuid}`, wrapped in `SessionStarterProvider`, `SessionEnderProvider` and `NotifierProvider` | With a resolver that answers `authenticated`, the route requests `/users/{uuid}` and renders `Ada Lovelace`; clicking `Sign out` then lands on `/sign-in`, which is what proves the route's `onSignedOut` callback reaches the router.                                                                                                                                                                                                                                                                 |
| `e2e/user-profile.spec.ts`                             | End to end, Chromium against the production build                                                                                                                                         | The scenarios below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

The end-to-end scenarios that exercise the read path:

- `renders the mapped domain model from the wire payload` — the stub serves all eight fields, the
  heading reads `Ada Lovelace`, and the `<main>` landmark contains `ada@example.test`, `Active`
  (from `active`) and `January 5, 2024` (from `createdAt`).
- `shows the unavailable state when the profile does not exist` — the unknown id
  `0198f0a2-7b1c-7d3e-8f00-000000000000` receives the stub's `404`, and the page shows
  `This profile could not be loaded.`

The spec's other five scenarios exercise the write path ([Update user name](./update-user-name.md));
two of them also pin this query's own behaviour:
`saves a new name and shows the profile the server returned` — the `PATCH` answers with the renamed
record, and the heading reads `Augusta Lovelace` from it — and
`reports a rejected save without discarding what was typed` — an injected `500` fails the save, the
cache is not written, and the heading still reads `Ada Lovelace`. Trimming, blank-name validation
and keyboard operability round out the write path. The `userStub` fixture from
`e2e/fixtures/harness.ts` is automatic: it installs `createUserStub()` behind `page.route` for
`**/v1/**`, the spec seeds `ADA` in `beforeEach`, and the stub answers `GET /v1/users/{id}` with the
seeded `UserWireRecord` or `404` with backend-boilerplate's error envelope,
`{ error: { code: 'USER_NOT_FOUND', message: 'No such user.', requestId } }`. The harness also
answers the guard's `POST /v1/auth/refresh` with a token, so every scenario starts authenticated.
The spec finds elements through the page object, by role, label and visible text: `displayName()` is
the level-1 heading and `content()` the `<main>` landmark. The harness itself is described in
[End-to-end testing](./e2e-testing.md).

Related suites owned elsewhere: `src/entities/user/api/user-mutations.test.ts` and
`src/entities/user/api/user-cache.test.ts` ([Update user name](./update-user-name.md)), and
`src/app/routes/_authenticated.test.tsx`, which uses `/users/{uuid}` as its guarded route and
asserts, among other cases, that a visitor it turns away triggers no user request
([Authenticated route guard](./route-guard.md)).

```bash
npm test
npx vitest run src/entities/user src/pages/user-profile 'src/app/routes/_authenticated/users.$userId.test.tsx'
npm run test:coverage
npm run test:e2e
npx playwright test e2e/user-profile.spec.ts
```

Quote the route test's path: unquoted, the shell expands `$userId` to an empty string. `npm test`
runs the whole Vitest suite, and `npm run test:coverage` adds the 90% per-file thresholds
([Unit and component testing](./unit-testing.md)).
`npm run test:e2e` builds the app, serves it with `vite preview` and runs every spec;
`npx playwright test e2e/user-profile.spec.ts` does the same for this spec alone.

## Known limitations

- **Every failure renders the same message.** `useUserProfile` collapses any query error into
  `unavailable`, so someone else's profile (`403`), a missing user (`404`), a response that fails
  `userDtoSchema`, a network failure and a refused dot-segment id all show
  `This profile could not be loaded.`, with no retry action.
  The route declares no `errorComponent` or `notFoundComponent`, and nothing on this screen
  branches on `HttpError.kind`.
- **A failed background refetch hides a loaded profile.** `useUserProfile` tests `isError` before
  it returns `data`, and TanStack Query v5 keeps `data` alongside `error` when a refetch fails. A
  failing refetch — on window focus or reconnect once the 30-second `staleTime` has passed —
  therefore replaces a rendered profile, and the form inside it, with the alert, although a valid
  `User` is still cached. No test covers it.
- **No test pins the loader's prefetch.** With the `loader` removed from `users.$userId.tsx`, every
  Vitest file under `src/app` and `src/pages/user-profile` still passes, because `useQuery` fetches
  on mount anyway; only the timing of the first request changes, and nothing asserts it.
- **The route is reachable only by URL.** The only `Link` the app renders is the not-found page's
  link home, and a successful sign-in navigates to `/` (`src/app/routes/sign-in.tsx`), so a visitor
  the guard bounced from `/users/<id>` does not return there, and the intent preloading the loader
  supports is unused today — the same gap [Sign-in](./sign-in.md#known-limitations) and
  [Authenticated route guard](./route-guard.md#known-limitations) each describe from their own side.
  Nor can a visitor learn their own id in the app: `POST /v1/auth/login` returns the signed-in user,
  which `entities/session` discards, and nothing calls `GET /v1/auth/me`.
- **The route id is cast, not parsed.** `toUserId` brands whatever the URL holds, so a malformed id
  costs a round trip that ends in the backend's `400 VALIDATION`, and an upper-cased copy of the
  caller's own id answers `403`, because the backend compares it case-sensitively.
- **The barrel rule is enforced in review only.** Adding
  `export type { UserDto } from './api/user-dto';` to `src/entities/user/index.ts` passes
  `npm run lint` and `npm run arch`; the gates stop imports that bypass a barrel, not exports that
  widen it.
- **No heading outside the `ready` state.** The `<h1>` is the display name inside
  `UserProfileView`, so while the profile is pending or unavailable the page renders a `<main>`
  with no heading.
- **The browser suite cannot see the wire loosening.** The pinned `UserWireRecord` catches the app
  tightening away from the wire — a renamed or retyped field — but if the server makes a field
  optional, the pinned copy keeps sending the old shape and nothing fails. Catching that needs a
  contract artefact generated from the server, such as OpenAPI or Pact
  ([End-to-end testing](./e2e-testing.md#known-limitations)).
