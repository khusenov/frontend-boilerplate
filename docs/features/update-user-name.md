# Update user name (write path)

> **Status:** Complete · **Layers:** app, pages, features, entities, shared, outside layers · **Verified against:** `33ee487`

## Purpose

The profile screen at `/users/$userId` lets a signed-in user change the first and last name of the
user it shows. The capability is deliberately small, because its real job is to be the template's
**reference write path**: the one worked example of a user action travelling from a validated form,
through a frontend-owned command (`UserNameChange`) and an outbound DTO mapper (DTO: data transfer
object, the server's wire shape), to a schema-checked `PATCH` and a cache invalidation that brings
the server's state back on screen. Before it existed, `HttpClient.patch`, `noContentSchema`, the
form seam in `shared/ui/form` (the single entry point every form is built through) and TanStack
Query mutations had no consumer, so the first improvised write — a display name split on a space, a
guessed wire shape, axios called directly, an unchecked response, a page reload standing in for
cache invalidation — would have become the precedent. The next write should copy this shape, as
[Sign-in](./sign-in.md) already does.

## How it works

**Mount.** A navigation to `/users/$userId` passes the pathless `_authenticated` layout route (see
[Authenticated route guard](./route-guard.md)); the route's `loader` prefetches the user detail
query, and `UserProfilePage` renders `UserProfileContent` — the status switch that, in its `ready`
case, renders `UpdateUserNameForm` under `UserProfileView`, the read-only profile display (heading,
email, role, join date). The read side is covered in [User profile](./user-profile.md). The form
therefore never renders without a loaded `User`. `UpdateUserNameForm`, the slice's container, calls
`useUpdateUserName(user.id)` for `{ status, submit, dismissOutcome }` and `useUserNameChangeSchema()`
for the translated validation schema, then renders `UpdateUserNameFormView` with the user's
`firstName` and `lastName` as default values and `<UpdateUserNameOutcome status={status} />` in its
outcome slot.

**Edit.** `UpdateUserNameFormView` builds the form with `useAppForm` from the form seam (the
`shared/ui/form` group every form goes through; see [Forms](./forms.md)) and registers the schema as
a form-level `onChange` validator, so every keystroke re-checks both fields against
`createUserNameChangeSchema`'s rules: each part must be non-empty and at most `MAXIMUM_NAME_LENGTH`
(80) characters **once trimmed**. A form-level `onChange` listener calls `dismissOutcome` on every
edit, which clears a success or failure message left by the previous attempt. Field messages appear
on blur or after the first submit attempt, per the seam's reveal rule.

**Submit.** Activating **Save name** runs TanStack Form's submit. An invalid form never reaches the
slice's `onSubmit`: the submit marks every field touched, the messages appear, and no request is
sent. The button is never disabled for invalidity, because pressing it is how a keyboard user
reaches the messages. A valid form passes its raw values to `submit`, which awaits `mutateAsync` on
`useMutation(createUserMutations(httpClient).updateName(userId))`, with `httpClient` taken from
`useHttpClient()`. While the mutation is pending, `status` is `saving` and `SubmitButton` shows its
`pendingLabel` ("Saving…") on a disabled, `aria-busy` button. The mutation function maps the command
with `toUpdateUserNameDto` — both parts trimmed and renamed to the wire's `first_name` and
`last_name` — and sends it through the bearer-token `HttpClient` that `HttpClientProvider` publishes
(see [HTTP transport](./http-transport.md)):

```text
PATCH {apiBaseUrl}/users/{encodeURIComponent(userId)}
{"first_name":"Ada","last_name":"King"}
```

`apiBaseUrl` is `/v1` unless `VITE_API_BASE_URL` overrides it. The response must satisfy
`noContentSchema`, which accepts only an empty body (`''`, `null` or `undefined`) and resolves
`null`.

**Refresh.** The entity's `onSuccess` calls
`client.invalidateQueries({ queryKey: userQueryKeys.detail(userId) })`: invalidation marks the
cached query `['users', 'detail', userId]` stale, and TanStack Query refetches it at once because the
page observes it. `onSuccess` returns the invalidation promise and TanStack Query awaits it before
the mutation settles, so the button keeps "Saving…" until the refetched `User` — mapped again by
`toUser` — is in the cache and the page heading shows the new `displayName`. Only then does `status`
become `saved` and the polite `<output>` region announce "Name updated.".

**Failure.** Any rejection of the mutation function fails the save: an `HttpError` for a 4xx or 5xx
response, a network failure or a timeout; kind `validation` when the response carries a non-empty
body; kind `unknown` when `userResourcePath` refuses an empty or dot-segment id before anything is
sent. Mutations are not retried (`retry: false` is the `createQueryClient` default). The query client's
`MutationCache` reports the error to the composition root's `ErrorReporter` as
`{ source: 'mutation', error, mutationHash }` (see
[Error handling and reporting](./error-handling.md)); `submit` then swallows the rejection, `status`
becomes `failed`, and the `role="alert"` paragraph announces "The name could not be updated.". The
typed values stay in the fields and, since nothing was invalidated, the heading keeps the old name.
The next edit resets the settled mutation through `dismissOutcome`, which returns `status` to `idle`
and empties both regions.

## Architecture

In Feature-Sliced Design terms the capability spans five layers. `features/update-user-name` is a
_slice_ — a folder on the `features` layer holding one user action — split into a `model` _segment_
(schema, status mapping, orchestration hook) and a `ui` segment (container, view, outcome). Its
_public API_ is its `index.ts`, which exports `UpdateUserNameForm` and nothing else. The write's data
access lives in the `entities/user` slice's `api` segment, beside the read it invalidates, because
the DTO, the mapper, the path builder and the query keys it needs are private to that segment. Every
collaborator is reached through a _port_ (the repo also says _seam_) — a type the code programs
against — and bound to a concrete only at the _composition root_, `src/app/entrypoint`: the feature
gets the `HttpClient` from `useHttpClient()` and the `QueryClient` from `useMutation`;
`createUserMutations` narrows the former to `UserWriteClient` (`Pick<HttpClient, 'patch'>`) and
receives the latter as `{ client }` in `onSuccess`; the form validates through the
`UserNameChangeSchema` Standard Schema port; the response is checked against the
`ResponseSchema<null>` named `noContentSchema`. `AppProviders` constructs the concretes — the
bearer-token `HttpClient` from `createAuthenticatedTransport(apiBaseUrl)`, the `QueryClient` from
`createQueryClient(queryErrorHandlers)`, the i18n instance from
`createI18n()` — and publishes them through `HttpClientProvider`, `QueryClientProvider` and
`I18nProvider`; nothing on the write path constructs a client (see
[Composition root](./composition-root.md)). Imports point only downward — `app/routes` →
`pages/user-profile` → `@/features/update-user-name` → `@/entities/user` → `@/shared/api`,
`@/shared/i18n`, `@/shared/ui/form` — and modules inside the slice import each other by relative
path (see [Architecture boundaries](./architecture-boundaries.md)).

| Component                          | Layer                               | Responsibility                                                                                                       | File                                                                               |
| ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `UserProfileRoute`                 | `app/routes`                        | Route module for `/users/$userId`: its `loader` prefetches the detail query, its component renders `UserProfilePage` | `src/app/routes/_authenticated/users.$userId.tsx`                                  |
| `AppProviders`                     | `app/entrypoint`                    | Constructs and publishes the `HttpClient`, `QueryClient` and i18n instance the write path runs on                    | `src/app/entrypoint/app-providers.tsx`                                             |
| `createQueryErrorHandlers`         | `app/entrypoint`                    | Builds the `onMutationError` handler that forwards a failed mutation to the error reporter                           | `src/app/entrypoint/create-query-error-handlers.ts`                                |
| `UserProfilePage`                  | `pages/user-profile · ui`           | Calls `useUserProfile(userId)` and renders `UserProfileContent` inside the screen's `<main>`                         | `src/pages/user-profile/ui/user-profile-page.tsx`                                  |
| `UserProfileContent`               | `pages/user-profile · ui`           | The status switch: in its `ready` case renders `UserProfileView`, then `UpdateUserNameForm` with the loaded `User`   | `src/pages/user-profile/ui/user-profile-page.tsx`                                  |
| `UpdateUserNameForm`               | `features/update-user-name · ui`    | Container: wires the hook and the schema into the view; the slice's only export                                      | `src/features/update-user-name/ui/update-user-name-form.tsx`                       |
| `UpdateUserNameFormView`           | `features/update-user-name · ui`    | Builds the form on `useAppForm`: heading, two `TextField`s, `SubmitButton`, outcome slot                             | `src/features/update-user-name/ui/update-user-name-form-view.tsx`                  |
| `UpdateUserNameOutcome`            | `features/update-user-name · ui`    | Renders the success `<output>` and the failure `role="alert"` region for a status                                    | `src/features/update-user-name/ui/update-user-name-outcome.tsx`                    |
| `useUpdateUserName`                | `features/update-user-name · model` | Runs the `updateName` mutation; exposes `status`, `submit`, `dismissOutcome`                                         | `src/features/update-user-name/model/use-update-user-name.ts`                      |
| `toUpdateUserNameStatus`           | `features/update-user-name · model` | Total map from `MutationStatus` to `UpdateUserNameStatus`                                                            | `src/features/update-user-name/model/update-user-name-status.ts`                   |
| `createUserNameChangeSchema`       | `features/update-user-name · model` | Presence and length rules on trimmed names, typed as the `UserNameChangeSchema` port                                 | `src/features/update-user-name/model/user-name-change-schema.ts`                   |
| `useUserNameChangeSchema`          | `features/update-user-name · model` | Resolves the three messages with `t` and memoises the schema                                                         | `src/features/update-user-name/model/use-user-name-change-schema.ts`               |
| `createUserMutations`              | `entities/user · api`               | `updateName(userId)` mutation options: the `PATCH` and the detail-query invalidation                                 | `src/entities/user/api/user-mutations.ts`                                          |
| `toUpdateUserNameDto`              | `entities/user · api`               | Outbound mapper: trims both parts, renames them to `first_name` / `last_name`                                        | `src/entities/user/api/user-mapper.ts`                                             |
| `UpdateUserNameDto`                | `entities/user · api`               | The request body type, derived from `UserDto`                                                                        | `src/entities/user/api/user-dto.ts`                                                |
| `userResourcePath`                 | `entities/user · api`               | `/users/{id}` builder with the id guard, shared with the read                                                        | `src/entities/user/api/user-resource-path.ts`                                      |
| `UserNameChange`                   | `entities/user · model`             | The domain command `{ firstName, lastName }`                                                                         | `src/entities/user/model/user.ts`                                                  |
| `noContentSchema`                  | `shared/api`                        | `ResponseSchema<null>` that accepts only an empty body                                                               | `src/shared/api/response-schema.ts`                                                |
| `useHttpClient`                    | `shared/api`                        | Reads the `HttpClient` published by `HttpClientProvider`                                                             | `src/shared/api/http-client-context.ts`                                            |
| `useAppForm`                       | `shared/ui/form`                    | The form seam: `form.Form`, `form.SubmitButton`, `field.TextField`                                                   | `src/shared/ui/form/use-app-form.ts`                                               |
| `updateUserName.*` copy            | `shared/i18n`                       | English and Russian strings for labels, states and messages                                                          | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json` |
| `fsd/insignificant-slice` override | `outside layers`                    | Turns the rule off for this slice, `features/sign-in`, `features/sign-out` and `features/switch-locale`              | `steiger.config.ts`                                                                |
| `createUserStub`                   | `outside layers`                    | Stateful `page.route` stub for `GET` and `PATCH` on `/v1/users/{id}`                                                 | `e2e/fixtures/user-stub.ts`                                                        |
| `createUserProfilePageObject`      | `outside layers`                    | Role-, label- and text-based locators for the profile and the form                                                   | `e2e/page-objects/user-profile-page-object.ts`                                     |

## Public surface

| Path             | Auth                                                                | Purpose                                                                                                |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/users/$userId` | `authenticated` (`src/app/routes/_authenticated/users.$userId.tsx`) | The user profile screen; renders `UpdateUserNameForm` under the profile once the detail query resolves |

**`@/features/update-user-name`** exports one component, `UpdateUserNameForm`, whose props are
(the interface itself is not exported):

```ts
interface UpdateUserNameFormProps {
  readonly user: Pick<User, 'firstName' | 'id' | 'lastName'>;
}
```

`user.id` selects the resource to patch and the query to invalidate; `firstName` and `lastName` seed
the two fields. The component renders the heading, both fields, the Save button and the outcome
regions, and needs the `QueryClientProvider`, `HttpClientProvider` and i18n instance that
`AppProviders` mounts.

**`@/entities/user`** exports the write's building blocks (the read-side exports belong to
[User profile](./user-profile.md)):

| Export                | Signature                                                                                                                                             | Role                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `createUserMutations` | `(httpClient: Pick<HttpClient, 'patch'>) => { updateName: (userId: UserId) => Omit<UseMutationOptions<null, Error, UserNameChange>, 'mutationKey'> }` | Mutation options for the name write, invalidation included; pass them to `useMutation` |
| `UserNameChange`      | `interface { readonly firstName: string; readonly lastName: string }`                                                                                 | The domain command the form produces and the mapper consumes                           |
| `UserId`, `toUserId`  | branded `string`; `(value: string) => UserId`                                                                                                         | The id `updateName` is keyed on                                                        |

Another slice can drive the same write, and inherit its invalidation, by passing
`createUserMutations(httpClient).updateName(userId)` to its own `useMutation`.

**`@/shared/api`** exports `noContentSchema: ResponseSchema<null>`, the response schema for any
endpoint that answers `204 No Content`.

**Internal by design.** Nothing else is exported. Inside the slice: `useUpdateUserName` and
`UseUpdateUserNameResult`, `UpdateUserNameStatus` and `toUpdateUserNameStatus`,
`createUserNameChangeSchema`, `UserNameChangeMessages`, `UserNameChangeSchema`,
`MAXIMUM_NAME_LENGTH`, `useUserNameChangeSchema`, `UpdateUserNameFormView` and
`UpdateUserNameOutcome`. Inside `entities/user/api`: `toUpdateUserNameDto`, `UpdateUserNameDto`,
`UserWriteClient`, `userResourcePath` and `userQueryKeys` — an entity barrel never exports a DTO
type, a mapper, a path builder or a query-key object.

**Copy contract.** Every string comes from the `common` namespace; `ru/common.json` translates each
key.

| Key                                           | English                         | Russian                    | Rendered by                                                              |
| --------------------------------------------- | ------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `updateUserName.formLabel`                    | Update name                     | Изменить имя               | The `<h2>` in `UpdateUserNameFormView`, the form's accessible name       |
| `updateUserName.firstName`                    | First name                      | Имя                        | First `field.TextField` label                                            |
| `updateUserName.lastName`                     | Last name                       | Фамилия                    | Second `field.TextField` label                                           |
| `updateUserName.save`                         | Save name                       | Сохранить имя              | `form.SubmitButton` label                                                |
| `updateUserName.saving`                       | Saving…                         | Сохранение…                | `form.SubmitButton`'s `pendingLabel`, shown while the request is pending |
| `updateUserName.saved`                        | Name updated.                   | Имя обновлено.             | `UpdateUserNameOutcome`'s `<output>` on `saved`                          |
| `updateUserName.failed`                       | The name could not be updated.  | Не удалось обновить имя.   | `UpdateUserNameOutcome`'s `role="alert"` paragraph on `failed`           |
| `updateUserName.validation.firstNameRequired` | Enter a first name.             | Введите имя.               | First-name rule, through `useUserNameChangeSchema`                       |
| `updateUserName.validation.lastNameRequired`  | Enter a last name.              | Введите фамилию.           | Last-name rule, through `useUserNameChangeSchema`                        |
| `updateUserName.validation.nameTooLong`       | Use at most {{max}} characters. | Не более {{max}} символов. | Length rule; `useUserNameChangeSchema` passes `MAXIMUM_NAME_LENGTH`      |

## Configuration

The slice reads no environment variable itself. These settings decide where its request goes and how
it behaves:

| Variable / option                                                                        | Default                                                                                           | Meaning                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                                                                      | `/v1` (`DEFAULT_API_BASE_URL` in `src/shared/config/app-config.ts`; `.env.example` sets the same) | Base URL the `PATCH /users/{id}` resolves against. `appConfig.apiBaseUrl` reads it and falls back to the default when it is unset or blank; `App` passes it to `AppProviders` as `apiBaseUrl`, which hands it to `createAuthenticatedTransport`. See [Configuration and environment](./configuration.md) |
| `server.proxy['/v1']` (`vite.config.ts`, dev server only)                                | `http://localhost:8000`                                                                           | Where `npm run dev` forwards `/v1` requests, the name `PATCH` included                                                                                                                                                                                                                                   |
| `MAXIMUM_NAME_LENGTH` (`src/features/update-user-name/model/user-name-change-schema.ts`) | `80`                                                                                              | Upper bound on each name part's trimmed length; interpolated into `updateUserName.validation.nameTooLong` as `{{max}}`                                                                                                                                                                                   |
| `mutations.retry` (`createQueryClient` default)                                          | `false`                                                                                           | A failed `PATCH` is not retried; `AppProviders` passes no override                                                                                                                                                                                                                                       |
| `webServer.env.VITE_API_BASE_URL` (`playwright.config.ts`)                               | `API_PREFIX` (`/v1`)                                                                              | Pins the end-to-end build's base URL, so `user-stub.ts` matches `/v1/users/{id}` whatever a local `.env` says                                                                                                                                                                                            |

## Usage & extension

### Render the form

Any `pages` or `widgets` slice may render the form; a `features` slice may not, because slices on one
layer are isolated from each other. It needs a `User` — or an object with the three fields it picks —
and the providers `AppProviders` mounts. A section component in a hypothetical
`src/pages/account/ui/account-name-section.tsx`:

```tsx
import type { User } from '@/entities/user';
import { UpdateUserNameForm } from '@/features/update-user-name';

interface AccountNameSectionProps {
  readonly user: User;
}

export function AccountNameSection({ user }: AccountNameSectionProps) {
  return <UpdateUserNameForm user={user} />;
}
```

A second consumer also makes this slice's `steiger.config.ts` override unnecessary (see
[Design decisions & trade-offs](#design-decisions--trade-offs)).

### Change the rules or the copy

- **The limit.** `MAXIMUM_NAME_LENGTH` drives both the rule and the `{{max}}` in its message, and the
  tests build their over-limit inputs from it — but `update-user-name-form.test.tsx` asserts the
  literal "Use at most 80 characters.", so update that assertion with the constant.
- **A new rule.** Add a refinement inside `createUserNameChangeSchema` with
  `.check(zm.refine(predicate, message))`, add its message to `UserNameChangeMessages`, resolve it in
  `useUserNameChangeSchema`, and add the key to both locale files. Judge the trimmed value (through
  `toNormalizedName`), because the trimmed value is what the mapper sends.
- **The copy.** The component tests and the `COPY` object in
  `e2e/page-objects/user-profile-page-object.ts` assert the English strings verbatim, so change them
  together with `en/common.json`. Every key needs its Russian counterpart:
  `lazy-locale-loader.test.ts` fails when a Russian key family is missing.

### Add the next write

The steps below add a hypothetical email change; nothing named `updateEmail` exists today.

1. **Model the command and the wire shape in the entity.** Add the command to
   `src/entities/user/model/user.ts`:

   ```ts
   export interface UserEmailChange {
     readonly email: string;
   }
   ```

   Derive the body type in `api/user-dto.ts` — `export type UpdateUserEmailDto = Pick<UserDto, 'email'>;`
   — so the wire vocabulary keeps one owner, and add a pure outbound mapper to `api/user-mapper.ts`
   (extending its type imports with `UserEmailChange` and `UpdateUserEmailDto`):

   ```ts
   export function toUpdateUserEmailDto(change: UserEmailChange): UpdateUserEmailDto {
     return { email: change.email.trim() };
   }
   ```

2. **Add the mutation beside `updateName`.** It reuses the narrow port, the shared path builder,
   `noContentSchema` and the same invalidation. `src/entities/user/api/user-mutations.ts` becomes:

   ```ts
   import { mutationOptions } from '@tanstack/react-query';

   import { noContentSchema } from '@/shared/api';
   import type { HttpClient } from '@/shared/api';

   import type { UserEmailChange, UserId, UserNameChange } from '../model/user';

   import { toUpdateUserEmailDto, toUpdateUserNameDto } from './user-mapper';
   import { userQueryKeys } from './user-queries';
   import { userResourcePath } from './user-resource-path';

   export type UserWriteClient = Pick<HttpClient, 'patch'>;

   export function createUserMutations(httpClient: UserWriteClient) {
     return {
       updateName: (userId: UserId) =>
         mutationOptions({
           mutationFn: async (change: UserNameChange): Promise<null> =>
             httpClient.patch(userResourcePath(userId), {
               body: toUpdateUserNameDto(change),
               schema: noContentSchema,
             }),
           onSuccess: (_data, _change, _onMutateResult, { client }) =>
             client.invalidateQueries({ queryKey: userQueryKeys.detail(userId) }),
         }),
       updateEmail: (userId: UserId) =>
         mutationOptions({
           mutationFn: async (change: UserEmailChange): Promise<null> =>
             httpClient.patch(userResourcePath(userId), {
               body: toUpdateUserEmailDto(change),
               schema: noContentSchema,
             }),
           onSuccess: (_data, _change, _onMutateResult, { client }) =>
             client.invalidateQueries({ queryKey: userQueryKeys.detail(userId) }),
         }),
     };
   }
   ```

   Then export the command type — never the DTO or the mapper — from `src/entities/user/index.ts`:

   ```ts
   export { createUserMutations } from './api/user-mutations';
   export { createUserQueries } from './api/user-queries';
   export { toUserId } from './model/user';
   export type { User, UserEmailChange, UserId, UserNameChange, UserRole } from './model/user';
   ```

3. **Copy the feature slice** to `src/features/update-user-email/`, file by file, together with its
   three co-located test files:

   | From `src/features/update-user-name/`  | To `src/features/update-user-email/`    | What changes                                                                                                   |
   | -------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
   | `model/user-name-change-schema.ts`     | `model/user-email-change-schema.ts`     | An `email` rule set typed `StandardSchemaV1<UserEmailChange, UserEmailChange>`; messages still arrive resolved |
   | `model/use-user-name-change-schema.ts` | `model/use-user-email-change-schema.ts` | Resolves `updateUserEmail.validation.*`                                                                        |
   | `model/update-user-name-status.ts`     | `model/update-user-email-status.ts`     | Renamed type; the total `MutationStatus` map stays                                                             |
   | `model/use-update-user-name.ts`        | `model/use-update-user-email.ts`        | Uses `createUserMutations(httpClient).updateEmail(userId)`                                                     |
   | `ui/update-user-name-form-view.tsx`    | `ui/update-user-email-form-view.tsx`    | One `field.TextField` with `type="email"` and `autoComplete="email"`                                           |
   | `ui/update-user-name-outcome.tsx`      | `ui/update-user-email-outcome.tsx`      | Renders `updateUserEmail.saved` and `updateUserEmail.failed`                                                   |
   | `ui/update-user-name-form.tsx`         | `ui/update-user-email-form.tsx`         | `UpdateUserEmailForm`, taking the user's `id` and `email`                                                      |
   | `index.ts`                             | `index.ts`                              | `export { UpdateUserEmailForm } from './ui/update-user-email-form';`                                           |

4. **Wire the rest.** Add the `updateUserEmail.*` keys to `en/common.json` and `ru/common.json`;
   render `UpdateUserEmailForm` in `UserProfileContent`'s `ready` case in
   `src/pages/user-profile/ui/user-profile-page.tsx`; run `npm run arch` — a slice with a single
   consumer fails `fsd/insignificant-slice`, so either add its glob to the `steiger.config.ts`
   override — beside the three already listed there — because it is a deliberate single-home
   action, or merge it into the page. For the end-to-end suite, `e2e/fixtures/user-stub.ts` answers
   `400` to any `PATCH` body that is not `{ first_name, last_name }`, so a new body shape needs its
   own pinned wire type and branch there.

The transport, the query client, the form seam and the composition root need no change: the new
write reaches them through the same ports.

## Design decisions & trade-offs

- **Invalidate and refetch rather than write the cache.** The endpoint answers `204 No Content`, so
  the response carries no server representation to cache, and building a `User` on the client would
  mean authoring `displayName` outside `toUser`, its only author. Invalidation re-reads the canonical
  record through the same DTO schema and mapper as every other read. The cost is one extra `GET` per
  save and no optimistic update: the heading changes only when the refetch lands. Because
  `onSuccess` returns the invalidation promise, "Saving…" lasts through that refetch, so the success
  message never appears while the heading still shows the old name.
- **The invalidation belongs to the entity.** Which queries a user write invalidates follows from the
  entity's query keys, so it is entity knowledge, not interaction knowledge: `onSuccess` sits in
  `createUserMutations`, every consumer of `updateName` inherits it, and `userQueryKeys` stays out
  of `@/entities/user` because no caller outside `entities/user/api` needs a key (commit `7bc9813`
  removed it from the barrel). `onSuccess` takes the `QueryClient` from TanStack Query's mutation
  context (`{ client }`), so the factory needs neither a `QueryClient` parameter nor a hook, and its
  test passes a plain `new QueryClient()`. Removing `onSuccess` fails `user-mutations.test.ts` and
  the refetch test in `user-profile-page.test.tsx`.
- **An empty body is part of the contract.** `updateName` validates the response against
  `noContentSchema` instead of ignoring it, so a server that starts returning a body fails the save
  visibly — an `HttpError` of kind `validation` with the issue "Expected an empty response body" —
  rather than having that body silently ignored; `user-mutations.test.ts` pins both halves. The
  price is that such a save reports failure even though the server applied it: contract drift is
  surfaced for investigation, not absorbed. Adopting a body-returning endpoint is therefore a
  deliberate edit to the schema and to what happens with the data. `noContentSchema` is a
  hand-written Standard Schema in `shared/api/response-schema.ts`, which keeps that segment free of a
  concrete validator.
- **Trim once, in the outbound mapper; the schema validates but never transforms.** TanStack Form
  validates against the Standard Schema but hands `onSubmit` the raw values, not the schema's
  output, so a `.trim()` — or `.toLowerCase()`, `.default()`, `.catch()` — in a form schema
  type-checks and is then silently dropped ([Forms](./forms.md) states the rule). Hence
  `UserNameChangeSchema` is `StandardSchemaV1<UserNameChange, UserNameChange>`, stating in the port
  that input equals output; its predicates judge the trimmed value through `toNormalizedName`; and
  `toUpdateUserNameDto` trims both parts, so the wire carries exactly what was validated. The cost is
  one rule in two places, pinned at both ends by `user-name-change-schema.test.ts` (a padded name
  that trims to the limit is accepted), `user-mapper.test.ts` and the end-to-end trim scenario.
  Trimming also makes a whitespace-only name fail presence — unlike `features/sign-in`, whose
  `isPresent` deliberately does not trim, because spaces are legitimate password characters.
- **Rules receive resolved messages; one hook resolves them.** `createUserNameChangeSchema(messages)`
  is a pure module-scope factory with no i18n import, testable with plain string literals.
  `useUserNameChangeSchema` translates the three messages in one place and memoises the schema on
  `[t]`, which react-i18next keeps stable per language and namespace load. `nameTooLong` interpolates
  `MAXIMUM_NAME_LENGTH` as `{{max}}`, so the number in the copy cannot drift from the rule. Typing the
  schema as a Standard Schema port rather than a Zod type keeps the view dependent on an interface
  and the validator swappable. This slice and `features/sign-in` are the two worked examples of the
  pattern described in [Forms](./forms.md).
- **`zod/mini`, and why this slice made it the rule for every schema.** The rule once exempted form
  schemas, on the reasoning that code splitting confines a form to one route's chunk and classic
  `zod` reads better in long refined validators. This slice retired the exemption: the `zod/mini`
  runtime already ships for the entity DTO schemas (in the eager `schemas-*.js` chunk), so a classic
  `zod` form schema would put a second validator runtime in front of every visitor of the form —
  about 17 kB gzip against about 3.2 kB for the same object schema in `zod/mini`, as measured in
  commit `86d52ff` — to avoid a syntax preference. `zod/mini` composes functionally: refinements go
  through `.check(zm.refine(predicate, message))`. The rule is a convention, not a gate: no lint rule
  rejects classic `zod` in `src/`, and several tests import it.
- **`submit` awaits the mutation, then swallows its rejection.** Awaiting `mutateAsync` keeps
  TanStack Form's `isSubmitting` true for the whole request, which is what disables the button and
  prevents a double submit; calling `mutate` and returning would end the submit at once. The
  rejection is then caught because `status` already carries the failure and `UpdateUserNameOutcome`
  already renders it — rethrowing would hand the same failure to `form.Form`, whose catch passes it
  to `onSubmitError`, a second channel for one failure. One channel per form: this slice uses
  mutation state and leaves `onSubmitError` unset, which is meant for submit failures that mutation
  state does not model. Observability is unaffected, because the query client's `MutationCache` has
  already reported the error.
- **`dismissOutcome` clears only a settled outcome.** An edit after `saved` or `failed` calls
  `mutation.reset()`, so a stale message never sits beside values that were not saved. While
  `saving` it does nothing, because `reset()` detaches the observer from the in-flight mutation: the
  button would keep showing "Saving…" until the request settled, and its result would never be
  announced. The consequence, pinned by `use-update-user-name.test.tsx`: an edit made during a save
  cancels nothing, and that save's outcome still appears until the next keystroke.
- **A status vocabulary of the feature's own, checked for totality.** The view never branches on
  TanStack Query's `MutationStatus`. `toUpdateUserNameStatus` maps it through
  `STATUS_BY_MUTATION_STATUS`, declared `satisfies Record<MutationStatus, UpdateUserNameStatus>`,
  and `UpdateUserNameOutcome` maps each status to a region with an exhaustive `switch`. A new member
  on either side is a compile error at the site that must handle it, never a silently missed branch.
- **Container, view and outcome are separate components.** `UpdateUserNameForm` owns the
  orchestration — the hook and the schema. `UpdateUserNameFormView` receives its schema, default
  values, rendered outcome and side effects (`onSubmit`, `onEdited`) as props and resolves only its
  own labels, so it renders and does nothing else. `UpdateUserNameOutcome` owns the announcement
  markup. [`features/sign-in`](./sign-in.md) mirrors the trio.
- **Accessible by construction.** The form takes its accessible name from its visible `<h2>`
  (`aria-labelledby` with a `useId()` id), which is also how the tests and the end-to-end page object
  find it — by role and name, never by class or generated id. The fields declare `given-name` and
  `family-name` autocomplete. The outcome renders two live regions (areas whose changes screen
  readers announce): a polite `<output>` for success and an assertive `role="alert"` paragraph for
  failure. Both stay mounted, empty when there is nothing to say, because a live region must be in
  the DOM before its content changes for the change to be announced.
- **Narrow ports and one path builder.** `createUserMutations` depends on `UserWriteClient`
  (`Pick<HttpClient, 'patch'>`), mirroring `UserReadClient` on the read side, so a test stubs one
  verb and the write cannot issue anything else. `userResourcePath` is shared with the read so the
  id guard cannot be applied to one and forgotten on the other: it percent-encodes the id
  (`../admin` becomes `/users/..%2Fadmin`) and refuses `''`, `.` and `..` — which encoding alone would
  not contain — with an `HttpError` of kind `unknown` before any request. `UpdateUserNameDto` is
  derived as `Pick<UserDto, 'first_name' | 'last_name'>` rather than redeclared, so the snake_case
  vocabulary keeps one owner.
- **`fsd/insignificant-slice` is off for this slice.** The steiger rule reports a slice that exactly
  one other slice imports ("This slice has only one reference in slice … Consider merging them."),
  and `pages/user-profile` is this slice's only importer by design. The rule targets premature
  slicing; a user action that genuinely has one home is not that, and merging it into the page would
  erase the template's example of where a write lives. The override in `steiger.config.ts` is scoped
  to the globs `./src/features/sign-in/**`, `./src/features/sign-out/**`,
  `./src/features/switch-locale/**` and `./src/features/update-user-name/**` — one per slice that
  has made this decision — so every other
  slice is still checked. The `recommended` preset raises the rule as an error, so removing the
  override fails `npm run arch`; once a second slice imports this one, the rule no longer applies
  and the glob can go.
- **Default mutation garbage collection.** `updateName` sets no `gcTime`, and `createQueryClient`
  sets one only for queries, so a settled name change leaves the mutation cache on TanStack Query's
  default schedule — five minutes after nothing observes it. `features/sign-in` sets `gcTime: 0`
  only because its variables hold a password.
- **The form seam's bundle cost was paid here, once.** This slice was the first non-test consumer of
  `shared/ui/form`, so it is where TanStack Form started shipping. Measured when it landed (commit
  `7bc9813`): the `users._userId-*.js` route chunk grew from 3.59 to 22.74 kB gzip (+19.15 kB) —
  about 18 kB of it TanStack Form and the field components, about 1 kB the `zod/mini` command schema
  — while the entry chunk grew 0.77 kB gzip, because `autoCodeSplitting` kept the seam in the lazily
  loaded route chunk. An isolated per-package projection made beforehand (Vite 8 / Rolldown,
  minified, React external) had predicted roughly +40 kB gzip — `@tanstack/react-form` plus
  `@tanstack/react-store` at 21.41 kB, classic `zod` at 18.24 kB against 4.49 kB for `zod/mini` on
  the same schema; the measurement came in at about half because the slice uses `zod/mini` and
  validates two string fields. The "paid once" half held too: when `features/sign-in` became the
  second form (commit `8fe59fc`), the build hoisted the seam into one shared `form-*.js` chunk
  (74.03 kB raw, 19.06 kB gzip) that both form routes import, that is fetched on navigation rather
  than preloaded, and that the entry chunk does not contain; `users._userId-*.js` fell to 12.28 kB
  raw. After `npm run build`, `grep -l submissionAttempts dist/assets/*.js` lists only `form-*.js` —
  a check that expects the `users._userId` chunk predates that split. The entity's write code
  (`createUserMutations`, `toUpdateUserNameDto`) and `noContentSchema` ship in the eager entry chunk,
  alongside the read-side modules the route `loader` already pulls in.
- **A duplicated store is expected.** `@tanstack/react-form@1.33.5` requires
  `@tanstack/react-store@^0.11.0`, while `@tanstack/react-router@1.170.32` declares `^0.9.3`, a
  range that cannot reach it, so npm nests a second copy of both `@tanstack/react-store` and
  `@tanstack/store` (0.11.1) under the form packages. It resolves itself when TanStack Router widens
  its range; nothing needs doing here.

## Testing

Unit and component tests (Vitest, jsdom), co-located with the code:

- `src/features/update-user-name/model/user-name-change-schema.test.ts` — accepts a first and last
  name; rejects a whitespace-only first name (which a minimum-length check would accept) and an
  empty last name; rejects a name whose trimmed length exceeds `MAXIMUM_NAME_LENGTH`; accepts a
  padded name that trims to exactly the limit; surfaces the caller-supplied message for every rule.
- `src/features/update-user-name/model/use-update-user-name.test.tsx` — `status` moves from `idle`
  to `saved` on success and to `failed` on failure while `submit` still resolves; `dismissOutcome`
  returns a settled success or failure to `idle` and leaves `idle` and an in-flight `saving` alone.
- `src/features/update-user-name/ui/update-user-name-form.test.tsx` — prefills both fields; names the
  form by its `<h2>` and declares both autocomplete purposes; sends the trimmed snake_case body to
  `/users/u_1`; an emptied field and an over-limit name show their messages (the limit interpolated)
  and send no request; announces success; announces failure while keeping the typed values; clears a
  settled outcome on the next edit; shows "Saving…" on a disabled button while the request is in
  flight.
- `src/entities/user/api/user-mutations.test.ts` — patches `/users/u_1` with the snake_case body;
  sends trimmed names; percent-encodes a slash in the id; rejects a dot-segment id as kind `unknown`
  without a request; resolves `null` for an empty body and rejects a non-empty one (the 204
  contract); invalidates `['users', 'detail', 'u_1']` on success.
- `src/entities/user/api/user-mapper.test.ts` (`toUpdateUserNameDto` block) — renames to the wire
  vocabulary, trims each part, sends no other field, leaves its argument unmutated.
- `src/shared/api/response-schema.test.ts` (`noContentSchema` block) — accepts `''`, `null` and
  `undefined`; rejects a body as kind `validation` with the issue "Expected an empty response body".
- `src/pages/user-profile/ui/user-profile-page.test.tsx` — "refetches the profile so the heading
  shows the name the form just saved": a stateful stub applies the `PATCH`, and the `<h1>` changes
  from "Ada Lovelace" to "Ada King" through the invalidation.

The hook and component tests render through `renderWithProviders` / `renderHookWithProviders` from
`@/shared/testing`, which supply a real `QueryClientProvider` (query and mutation retries off) and an
`HttpClientProvider` over the `HttpClient` passed as the `httpClient` option. That client comes from
`createHttpClientStub({ patch })`: the other four verbs reject by name, and `patch` either rejects or
validates an empty body (`null`) against the request's own `schema`, so `noContentSchema` runs for
real.
`vitest.setup.ts` installs an English i18n instance, which is why the tests query by English copy.

End-to-end tests (Playwright against the production build, `e2e/user-profile.spec.ts`) cover the
write path in five scenarios; the file's two read-path scenarios belong to
[User profile](./user-profile.md):

| Scenario                                                    | What it proves                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `saves a new name and shows the refetched profile`          | Saving "Augusta" shows "Name updated.", the `<h1>` shows "Augusta Lovelace" from the refetch, and the stub received exactly `{ first_name: 'Augusta', last_name: 'Lovelace' }` |
| `trims the submitted name before it reaches the wire`       | A first name typed as `'   Augusta   '` reaches the wire as `first_name: 'Augusta'`                                                                                            |
| `reports a rejected save without discarding what was typed` | With `failNextNameUpdate(SERVER_ERROR_STATUS)` the `PATCH` gets a 500: the failure message appears, the last-name field keeps "Byron", the heading stays "Ada Lovelace"        |
| `blocks a blank first name before it reaches the network`   | A whitespace-only first name shows "Enter a first name." inside the form and the stub records no patch                                                                         |
| `keeps the form operable by keyboard alone`                 | Select-all and type in the first name, two Tabs land on Save (pinning the order first name, last name, Save), Enter saves                                                      |

`e2e/fixtures/user-stub.ts` is the stateful `GET`/`PATCH /v1/users/{id}` stub these scenarios drive,
installed automatically by `e2e/fixtures/harness.ts`; `e2e/page-objects/user-profile-page-object.ts`
locates the form by role and accessible name and its controls by label. See
[End-to-end testing](./e2e-testing.md) for the stub's full contract and the harness.

| Command                                                       | Runs                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                                                    | The whole Vitest suite                                                       |
| `npx vitest run src/features/update-user-name`                | The slice's three test files                                                 |
| `npx vitest run src/entities/user/api src/pages/user-profile` | The entity's API tests and the page's refetch test                           |
| `npm run test:e2e`                                            | Builds the app, serves it with `vite preview` and runs every Playwright spec |
| `npm run test:e2e -- e2e/user-profile.spec.ts`                | Only the profile spec                                                        |
| `npm run arch`                                                | steiger over `./src`, with this slice's override                             |

CI runs `npm run audit` (steiger and the coverage-gated Vitest suite among its steps) in the
`Quality gates` job and `npm run test:e2e` in the `End-to-end tests` job; see
[Quality gates](./quality-gates.md).

## Known limitations

- **Every failed save shows the same message.** `UpdateUserNameOutcome` has one failure string,
  `updateUserName.failed`, whatever the cause — a `400` that names a field, a `5xx`, an offline
  network or a contract violation — and no server error is mapped onto a field: nothing in `src/`
  calls TanStack Form's `setErrorMap`.
- **A failed refetch after a successful save replaces the profile.** `invalidateQueries` swallows
  refetch failures, so a `PATCH` that succeeds followed by a refetch that fails (once the query
  retry policy has run its course) still settles the mutation as `saved`. The detail query is then
  in TanStack Query's `error` status with its previous data kept, and `useUserProfile` checks
  `isError` before it returns `ready`, so the page swaps the profile and this form for "This profile
  could not be loaded.". No test covers this path.
- **The fields are not re-seeded after a save.** TanStack Form applies new `defaultValues` only while
  the form is untouched, and a submit marks every field touched. After a save the inputs keep exactly
  what was typed — padding included — while the heading shows the trimmed name the refetch returned,
  and a name changed elsewhere does not reach fields the user has already submitted.
- **Failure reports are keyless and carry the name.** `updateName` declares no `mutationKey`, so
  every failed save reaches the error reporter with `mutationHash` `'[]'`, the empty-key case
  `src/shared/api/query-client.test.ts` pins. For a failed exchange — an error response, a network
  failure, a timeout — the reported `HttpError` keeps the `AxiosError` as its `cause`, whose
  `config.data` is the serialized request body, so the submitted name reaches whatever sink
  `app-error-reporter.ts` binds (today the browser console). The sign-in write keeps its password out
  of reports (see [Sign-in](./sign-in.md)); this write does not do the same for the name.
