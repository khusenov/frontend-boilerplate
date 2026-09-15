# Architecture boundaries

> **Status:** Complete · **Layers:** app, pages, widgets, features, entities, shared, outside layers · **Verified against:** `65a99bc`

## Purpose

A layered frontend decays one convenient import at a time: a page that reaches into a feature's
internal module, an entity that imports `axios`, a component that builds its own HTTP client. Each
shortcut compiles and looks harmless in review, and together they dissolve the structure this
template exists to provide. This feature makes Feature-Sliced Design's rules mechanical — which
layer may import which, that slices meet only through their public `index.ts`, where a vendor
library or a client constructor may appear — so a violation fails `npm run arch` or `npm run lint`
before it can be pushed. It also fixes the conventions that let an engineer find any file without a
map: one naming scheme, one path alias, one import order.

## How it works

**The model.** Feature-Sliced Design (FSD) divides `src/` into _layers_: from top to bottom `app`,
`pages`, `widgets`, `features`, `entities` and `shared`. Only a direct child of `src/` named after a
layer is one, so `src/main.tsx` sits outside them all. The four layers in between hold _slices_, one
folder per screen (`pages/sign-in`), user action (`features/sign-in`) or business noun
(`entities/session`). Each slice is divided into _segments_, folders named for their purpose such as
`ui`, `model`, `api` and `lib`, while `app` and `shared` are divided into segments directly, with no
slices (`app/entrypoint`, `shared/api`, `shared/i18n`). A slice's `index.ts`, its _barrel_,
is its _public API_: the one file code outside the slice may import. `shared/lib` and `shared/ui`
add one level more, the _group_: a folder per helper or primitive, each with its own `index.ts`.
Every import that crosses one of these boundaries is written with the `@/` alias for `src/`, so the
path names what it reaches — `@/entities/user`, `@/shared/api`, `@/shared/ui/button`.

**The rules.** Everything below enforces six rules:

1. **The Import Rule.** A module imports only from layers strictly below its own.
2. **Slice isolation.** Two slices on one layer never import each other. FSD's `@x` notation is the
   one sanctioned exception, and none exists today.
3. **Public API only.** Across a slice boundary, import the slice's `index.ts` (`@/entities/user`,
   never `@/entities/user/model/user`); inside a slice, use relative paths. A `shared` segment is
   imported through its barrel (`@/shared/api`), and `shared/lib` and `shared/ui` per group
   (`@/shared/lib/single-flight`) — never as a bare segment, never past a group's `index.ts`.
4. **Barrels only re-export.** An `index.ts` holds import and re-export declarations and nothing
   else.
5. **Constructors and vendors stay with their seam.** A _seam_ — the repo's word, used
   interchangeably with _port_ — is a type that consumers program against while the implementation
   is chosen elsewhere. Only the _composition root_, `src/app/entrypoint`, constructs clients (see
   [Composition root](./composition-root.md)), and a wrapped vendor library is imported only by the
   `shared` segment or group that wraps it.
6. **One door in from outside.** `src/main.tsx` imports `@/app` and nothing else under `@/`, and
   `e2e/` imports nothing from `src/`.

**Two engines enforce them.** `npm run arch` runs steiger over `./src`. steiger first maps the tree:
layers by folder name, and slices, where a folder counts as a slice only if it contains at least one
of the conventional segments `ui`, `api`, `lib`, `model` or `config`. It then reads every `import`
declaration and dynamic `import()` in every analysed file, type-only imports included, resolves each
specifier through the TypeScript configuration — so a relative path is judged by the file it lands
on — and runs the 17 rules of the `recommended` preset of `@feature-sliced/steiger-plugin`, all at
`error`, minus the one override in `steiger.config.ts`. It is blind in two places: it skips imports
between two segments of the same unsliced layer (`shared` to `shared`, `app` to `app`), and it does
not read `export … from` re-exports.

`npm run lint` runs ESLint, whose `no-restricted-imports` rule compares each import and re-export
specifier, as written, with lists in `eslint.config.js`: exact package paths, names imported from a
barrel, and regular-expression patterns. The file's path decides which lists apply: of the eleven
blocks that configure the rule, the last one whose `files` glob matches supplies all of its options,
because flat config replaces a rule's options instead of merging them. ESLint knows the layers only
through those globs, never resolves a relative path, and ignores dynamic `import()`.

Each engine therefore covers the other's blind spots. steiger owns layer direction, slice isolation
and imports that sidestep another layer's public API. ESLint owns what steiger cannot express or
cannot see: vendor packages, constructor names, the router allow-list (below `app`, `Link` is the
only importable `@tanstack/react-router` export; every other name is denied — see
[Import fences](#import-fences)), sidesteps from one `shared` segment into another, absolute imports
of a module inside the importer's own slice, re-exports, and the two entry points outside the
layers. Two more ESLint rules complete the set: `no-restricted-syntax` keeps every barrel a pure
list of re-exports, and `import-x/order` orders every import block.
[What each gate catches](#what-each-gate-catches) maps each violation to its gate.

**When they run.** lefthook's `pre-commit` hook runs ESLint over the staged files; the `pre-push`
hook and CI's `Quality gates` job run `npm run audit`, which includes `lint`, `typecheck` and `arch`
among its nine gates (see [Quality gates](./quality-gates.md)).

**What a failure looks like.** A page that imports a feature's form component directly —
`import { SignInForm } from '@/features/sign-in/ui/sign-in-form';` in `pages/home` — fails both
gates. ESLint reports it with the slice public-API fence's message, which names the fix:

```text
Import the slice public API: @/<layer>/<slice> — or a relative path within your own slice. Cross-slice imports go through @x.
```

and steiger reports it under `fsd/no-public-api-sidestep`:

```text
Forbidden sidestep of public API when importing from "@/features/sign-in/ui/sign-in-form".
```

The fix is `import { SignInForm } from '@/features/sign-in';`. An upward import through a barrel —
`entities/user` importing `@/features/sign-in` — passes ESLint and fails only steiger, with
`Forbidden import from higher layer "features".`; an `axios` import in a slice passes steiger and
fails only ESLint. Either failure stops `npm run audit` at that gate.

## Architecture

The feature has no runtime seam, and the composition root binds nothing for it: nothing in `src/`
imports it, and it inspects `src/` from outside. Its contracts are the public APIs — each slice's,
segment's and group's `index.ts`, plus `src/app/index.ts`, the one layer-level barrel FSD allows —
which every other module programs against. The checks that hold those contracts live in root
configuration: `steiger.config.ts` for the FSD structure; `eslint.config.js` for the import fences,
the barrel rule and import order; and the TypeScript and Vite configs, which give every tool the
same `@/` alias. The imports the checks guard all point downward — `app` → `pages` → `features` →
`entities` → `shared` — as the generated [dependency graph](../architecture-graph.md) shows.

| Component                                                                                                                                                    | Layer                           | Responsibility                                                                                                                                                                                           | File                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `arch`                                                                                                                                                       | outside layers · root config    | `steiger ./src`: the FSD structure check                                                                                                                                                                 | `package.json`                                                               |
| `defineConfig`                                                                                                                                               | outside layers · root config    | The steiger configuration: `fsd.configs.recommended` plus one `fsd/insignificant-slice` override for three `features` slices                                                                             | `steiger.config.ts`                                                          |
| `LOWER_LAYER_IMPORT_PATHS`, `LOWER_LAYER_IMPORT_PATTERNS`                                                                                                    | outside layers · root config    | The construction bans, the router allow-list and the deep-import patterns for the layers below `app`                                                                                                     | `eslint.config.js`                                                           |
| `SESSION_CONSTRUCTOR_NAMES`                                                                                                                                  | outside layers · root config    | The six session constructors, shared by both blocks that ban them                                                                                                                                        | `eslint.config.js`                                                           |
| `I18N_VENDOR_IMPORT_PATHS`, `FORM_VENDOR_IMPORT_PATHS`, `FORM_VENDOR_IMPORT_PATTERNS`, `TRANSPORT_VENDOR_IMPORT_PATHS`, `ERROR_BOUNDARY_VENDOR_IMPORT_PATHS` | outside layers · root config    | One fence per wrapped vendor                                                                                                                                                                             | `eslint.config.js`                                                           |
| `VALIDATOR_IMPORT_PATTERNS`                                                                                                                                  | outside layers · root config    | Concrete validators, banned in `shared/api` and `shared/ui/form` — the two seams that validate through _Standard Schema_, the vendor-neutral validator interface ([HTTP transport](./http-transport.md)) | `eslint.config.js`                                                           |
| `no-restricted-imports` blocks                                                                                                                               | outside layers · root config    | Eleven blocks, in order, that apply the lists by path                                                                                                                                                    | `eslint.config.js`                                                           |
| `no-restricted-syntax`                                                                                                                                       | outside layers · root config    | Keeps every `src/**/index.ts` a list of imports and re-exports                                                                                                                                           | `eslint.config.js`                                                           |
| `import-x/order`, `import-x/internal-regex`                                                                                                                  | outside layers · root config    | Groups and alphabetizes imports, with `@/…` as the internal group                                                                                                                                        | `eslint.config.js`                                                           |
| `paths`                                                                                                                                                      | outside layers · root config    | `@/*` → `./src/*` for the app project                                                                                                                                                                    | `tsconfig.app.json`                                                          |
| `baseUrl`, `paths`                                                                                                                                           | outside layers · root config    | The same alias on the solution-style root, for tools that read only that file                                                                                                                            | `tsconfig.json`                                                              |
| `resolve.tsconfigPaths`                                                                                                                                      | outside layers · root config    | Vite, and Vitest through the same config, resolve `@/` from the tsconfig paths                                                                                                                           | `vite.config.ts`                                                             |
| `include`                                                                                                                                                    | outside layers · root config    | The end-to-end project, which declares no `paths`, so `@/…` does not resolve there                                                                                                                       | `tsconfig.e2e.json`                                                          |
| `arch:graph`                                                                                                                                                 | outside layers · root config    | Regenerates the Mermaid dependency graph with dependency-cruiser; not a gate                                                                                                                             | `package.json`                                                               |
| `App`                                                                                                                                                        | `app`                           | The `app` layer's public API; `src/main.tsx` is its only importer                                                                                                                                        | `src/app/index.ts`                                                           |
| Slice barrels                                                                                                                                                | `pages`, `features`, `entities` | One public API per slice                                                                                                                                                                                 | `src/pages/*/index.ts`, `src/features/*/index.ts`, `src/entities/*/index.ts` |
| Segment barrels                                                                                                                                              | `shared`                        | One public API per segment: `api`, `config`, `i18n`, `observability`                                                                                                                                     | `src/shared/*/index.ts`                                                      |
| Group barrels                                                                                                                                                | `shared/lib`, `shared/ui`       | One public API per group; neither segment has a barrel of its own                                                                                                                                        | `src/shared/lib/*/index.ts`, `src/shared/ui/*/index.ts`                      |

## Public surface

This feature serves no route. Its contract is the scripts that check the rules, the layers and
public APIs those scripts protect, the fences, and the naming and import conventions.

### Scripts

| Command                     | Runs                                                                                           | Contract                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run arch`              | `steiger ./src`                                                                                | Prints `✔ No problems found!` and exits 0, or lists each diagnostic and exits 1. Gate 6 of `npm run audit`                                 |
| `npm run lint`              | `eslint . --max-warnings 0`                                                                    | Every fence, the barrel rule and import order, beside all other lint rules; a warning fails it. Gate 3                                     |
| `npm run lint:fix`          | `eslint . --fix`                                                                               | Reorders imports. Fences and the barrel rule have no automatic fix                                                                         |
| `npm run typecheck`         | `tsc -b --pretty`                                                                              | Resolves `@/` in the app project; rejects it in `e2e/` with TS2307, and an import whose casing differs from the file's with TS1261. Gate 5 |
| `npm run arch:graph`        | dependency-cruiser over `src` (broken down in [Quality gates](./quality-gates.md#npm-scripts)) | Rewrites [`docs/architecture-graph.md`](../architecture-graph.md). Not a gate                                                              |
| `npx steiger ./src --watch` | steiger in watch mode                                                                          | Re-reports on every file change, which helps while moving code between slices                                                              |

### Layers

| Layer      | Path           | Holds                                                                                                                                                                                                                                                | May import                                                          | Today                                                               |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `app`      | `src/app`      | The composition root, as segments: `entrypoint`, `router`, `routes`, `styles`; and `index.ts`, the layer's public API                                                                                                                                | Every layer below                                                   | Four segments                                                       |
| `pages`    | `src/pages`    | One slice per screen, assembled from lower layers; a page takes props and callbacks and reads no route state                                                                                                                                         | `widgets`, `features`, `entities`, `shared`                         | `home`, `not-found`, `resolving-session`, `sign-in`, `user-profile` |
| `widgets`  | `src/widgets`  | Self-contained page blocks composed from features and entities and shown on more than one screen                                                                                                                                                     | `features`, `entities`, `shared`                                    | `app-header`                                                        |
| `features` | `src/features` | One slice per user action that changes state: its UI, its validation schema where it has one, and the hook that drives it                                                                                                                            | `entities`, `shared`                                                | `sign-in`, `sign-out`, `switch-locale`, `update-user-name`          |
| `entities` | `src/entities` | One slice per business noun: frontend-owned models and ports in `model/`; DTOs, wire schemas, mappers, HTTP calls and query option factories in `api/`                                                                                               | `shared`                                                            | `session`, `user`                                                   |
| `shared`   | `src/shared`   | Business-free building blocks, as segments: `api`, `config`, `i18n`, `observability`, and the grouped `lib` (`cn`, `format-duration`, `single-flight`) and `ui` (`button`, `error-boundary`, `form`, `input`, `label`, beside the loose `theme.css`) | Nothing above `shared`; another segment only through its public API | Six segments                                                        |

Three things sit outside every layer: `src/main.tsx`, which mounts `<App />` inside `StrictMode` and
which steiger does not analyse; `e2e/`, which observes the built app through a browser; and root
configuration and `scripts/`, which no import fence covers except `playwright.config.ts`, fenced
with the end-to-end suite. `pages/home` and `shared/lib/format-duration`
are worked examples, not product code: they exist so that every gate has something to check, and
the first real slice and helper replace them — moving the i18n demonstrations `pages/home` carries
along (see [Internationalization](./internationalization.md#known-limitations)). `pages/not-found`
is no throwaway: it is the router's 404 screen and stays.

### Public API inventory

Every sanctioned `@/` import path. Each is the slice's, segment's or group's `index.ts`; nothing
else under `@/` may be imported across a boundary.

| Import path                    | Layer        | Values                                                                                                                                                                                                                                                                                                      | Types                                                                                                                                                                                                                                                        | Documented in                                                                                                                                                                              |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@/app`                        | `app`        | `App`                                                                                                                                                                                                                                                                                                       | None                                                                                                                                                                                                                                                         | [Composition root](./composition-root.md)                                                                                                                                                  |
| `@/pages/home`                 | `pages`      | `HomePage`                                                                                                                                                                                                                                                                                                  | None                                                                                                                                                                                                                                                         | Worked example; [Internationalization](./internationalization.md)                                                                                                                          |
| `@/pages/not-found`            | `pages`      | `NotFoundPage`                                                                                                                                                                                                                                                                                              | None                                                                                                                                                                                                                                                         | [Routing](./routing.md)                                                                                                                                                                    |
| `@/pages/resolving-session`    | `pages`      | `ResolvingSessionPage`                                                                                                                                                                                                                                                                                      | None                                                                                                                                                                                                                                                         | [Authenticated route guard](./route-guard.md)                                                                                                                                              |
| `@/pages/sign-in`              | `pages`      | `SignInPage`                                                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                         | [Sign-in](./sign-in.md)                                                                                                                                                                    |
| `@/pages/user-profile`         | `pages`      | `UserProfilePage`                                                                                                                                                                                                                                                                                           | None                                                                                                                                                                                                                                                         | [User profile (read path)](./user-profile.md)                                                                                                                                              |
| `@/widgets/app-header`         | `widgets`    | `AppHeader`                                                                                                                                                                                                                                                                                                 | None                                                                                                                                                                                                                                                         | [App shell](./app-shell.md)                                                                                                                                                                |
| `@/features/sign-in`           | `features`   | `SignInForm`                                                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                         | [Sign-in](./sign-in.md)                                                                                                                                                                    |
| `@/features/switch-locale`     | `features`   | `LocaleSwitcher`                                                                                                                                                                                                                                                                                            | None                                                                                                                                                                                                                                                         | [App shell](./app-shell.md); [Internationalization](./internationalization.md)                                                                                                             |
| `@/features/sign-out`          | `features`   | `SignOutButton`                                                                                                                                                                                                                                                                                             | None                                                                                                                                                                                                                                                         | [Sign-out](./sign-out.md)                                                                                                                                                                  |
| `@/features/update-user-name`  | `features`   | `UpdateUserNameForm`                                                                                                                                                                                                                                                                                        | None                                                                                                                                                                                                                                                         | [Update user name (write path)](./update-user-name.md)                                                                                                                                     |
| `@/entities/session`           | `entities`   | `createSessionApi`, `createSessionEnder`, `createSessionResolver`, `createSessionStarter`, `createSessionStore`, `createSessionTokenSource`, `toSessionObserver`, `SessionEnderProvider`, `useSessionEnder`, `SessionResolverProvider`, `useSessionResolver`, `SessionStarterProvider`, `useSessionStarter` | `Credentials`, `SessionEnder`, `SessionObserver`, `SessionResolver`, `SessionStarter`, `SessionStatus`, `SignInOutcome`, `SignOutOutcome`                                                                                                                    | [Session management](./session-management.md); [Authenticated route guard](./route-guard.md) (`createSessionResolver`, `SessionResolver`, `useSessionResolver`, `SessionResolverProvider`) |
| `@/entities/user`              | `entities`   | `createUserMutations`, `createUserQueries`, `toUserId`                                                                                                                                                                                                                                                      | `User`, `UserId`, `UserNameChange`, `UserRole`                                                                                                                                                                                                               | [User profile (read path)](./user-profile.md)                                                                                                                                              |
| `@/shared/api`                 | `shared`     | `createHttpClient`, `createQueryClient`, `HttpClientProvider`, `useHttpClient`, `HttpError`, `isHttpError`, `toHttpError`, `noContentSchema`                                                                                                                                                                | `BearerTokenSource`, `CreateHttpClientOptions`, `HttpBodyRequestConfig`, `HttpClient`, `HttpQueryParams`, `HttpQueryParamValue`, `HttpRequestConfig`, `HttpRequestOptions`, `HttpErrorDetails`, `HttpErrorKind`, `ResponseValidationIssue`, `ResponseSchema` | [HTTP transport](./http-transport.md)                                                                                                                                                      |
| `@/shared/config`              | `shared`     | `appConfig`                                                                                                                                                                                                                                                                                                 | None                                                                                                                                                                                                                                                         | [Configuration and environment](./configuration.md)                                                                                                                                        |
| `@/shared/i18n`                | `shared`     | `createI18n`, `I18nProvider`, `DEFAULT_LOCALE`, `LOCALES`, `SUPPORTED_LOCALES`, `useLocale`, `Trans`, `useTranslation`                                                                                                                                                                                      | `CreateI18nOptions`, `LocaleDetectionOptions`, `Locale`, `UseLocaleResult`                                                                                                                                                                                   | [Internationalization](./internationalization.md)                                                                                                                                          |
| `@/shared/observability`       | `shared`     | `createConsoleErrorReporter`, `toSafeErrorReporter`                                                                                                                                                                                                                                                         | `ErrorReport`, `ErrorReporter`                                                                                                                                                                                                                               | [Error handling and reporting](./error-handling.md)                                                                                                                                        |
| `@/shared/lib/cn`              | `shared/lib` | `cn`                                                                                                                                                                                                                                                                                                        | None                                                                                                                                                                                                                                                         | [Design system](./design-system.md)                                                                                                                                                        |
| `@/shared/lib/format-duration` | `shared/lib` | `formatDuration`                                                                                                                                                                                                                                                                                            | None                                                                                                                                                                                                                                                         | Worked example; [Internationalization](./internationalization.md)                                                                                                                          |
| `@/shared/lib/single-flight`   | `shared/lib` | `singleFlight`                                                                                                                                                                                                                                                                                              | None                                                                                                                                                                                                                                                         | [Session management](./session-management.md)                                                                                                                                              |
| `@/shared/ui/button`           | `shared/ui`  | `Button`, `buttonVariants`                                                                                                                                                                                                                                                                                  | `ButtonProps`                                                                                                                                                                                                                                                | [Design system](./design-system.md)                                                                                                                                                        |
| `@/shared/ui/error-boundary`   | `shared/ui`  | `ErrorBoundary`                                                                                                                                                                                                                                                                                             | `ErrorBoundaryProps`, `ErrorFallbackProps`, `RenderErrorHandler`                                                                                                                                                                                             | [Error handling and reporting](./error-handling.md)                                                                                                                                        |
| `@/shared/ui/form`             | `shared/ui`  | `useAppForm`                                                                                                                                                                                                                                                                                                | `TextFieldInputType`, `TextFieldProps`                                                                                                                                                                                                                       | [Forms](./forms.md)                                                                                                                                                                        |
| `@/shared/ui/input`            | `shared/ui`  | `Input`                                                                                                                                                                                                                                                                                                     | `InputProps`                                                                                                                                                                                                                                                 | [Design system](./design-system.md)                                                                                                                                                        |
| `@/shared/ui/label`            | `shared/ui`  | `Label`                                                                                                                                                                                                                                                                                                     | `LabelProps`                                                                                                                                                                                                                                                 | [Design system](./design-system.md)                                                                                                                                                        |

The constructors in this table — `createHttpClient`, `createQueryClient`, `createI18n`, the six
session constructors and both `@/shared/observability` values — are banned in every layer below
`app` and in `app/routes` and `app/router`, which leaves `app/entrypoint` as the one place in
`src/` that constructs (see [Import fences](#import-fences)). `@/shared/i18n` is the one barrel
that re-exports a vendor's API as the project's own: `Trans` and `useTranslation` come straight
from `react-i18next` ([Internationalization](./internationalization.md)). No gate checks _which_
names a barrel exports; what an entity keeps out of its barrel is covered in
[User profile (read path)](./user-profile.md).

### What each gate catches

Every row was reproduced against this commit.

| Violation                                                          | Example                                                                                         | `npm run arch` (steiger)                                  | `npm run lint` (ESLint)                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Upward import                                                      | `entities/user` imports `@/features/sign-in`                                                    | `fsd/forbidden-imports`                                   | Passes                                                                                                                             |
| Import between slices on one layer, through the barrel             | `features/sign-in` imports `@/features/update-user-name`                                        | `fsd/forbidden-imports`                                   | Passes                                                                                                                             |
| Past another layer's slice barrel                                  | `pages/home` imports `@/features/sign-in/ui/sign-in-form`                                       | `fsd/no-public-api-sidestep`                              | Slice public-API pattern                                                                                                           |
| Past a same-layer slice barrel                                     | `pages/home` imports `@/pages/user-profile/model/use-user-profile`                              | `fsd/forbidden-imports` and `fsd/no-public-api-sidestep`  | Slice public-API pattern                                                                                                           |
| Absolute import of a module in the importer's own slice            | `pages/home` imports `@/pages/home/ui/home-page`                                                | Passes                                                    | Slice public-API pattern                                                                                                           |
| Relative import that climbs into another slice                     | `features/sign-in` imports `../../update-user-name/ui/update-user-name-form`                    | `fsd/forbidden-imports` and `fsd/no-public-api-sidestep`  | Passes                                                                                                                             |
| Past a `shared` barrel, from a higher layer                        | `features/<slice>` imports `@/shared/i18n/registry`                                             | `fsd/no-public-api-sidestep`                              | Only for `shared/api` and `shared/observability` (below `app` and in `app/routes`, `app/router`) and for the `lib` and `ui` groups |
| Past a `shared` barrel, from another `shared` segment              | `shared/lib/<group>` imports `@/shared/api/http-client`                                         | Passes: same layer                                        | `^@/shared/api/`, `^@/shared/observability/` and the group patterns; nothing for `shared/i18n` or `shared/config`                  |
| Relative import between two `shared` segments                      | `shared/observability` imports `../api/http-client`                                             | Passes                                                    | Passes                                                                                                                             |
| Re-export past a barrel                                            | `export { SignInForm } from '@/features/sign-in/ui/sign-in-form';` in `src/pages/home/index.ts` | Passes: re-exports are not read                           | Slice public-API pattern, except in `app/entrypoint` and `src/app/index.ts`                                                        |
| Bare `shared/lib` or `shared/ui` segment, or a file inside a group | `@/shared/ui`, `@/shared/lib/cn/cn`                                                             | Only the file inside a group, imported from another layer | Group patterns                                                                                                                     |
| Vendor outside its seam                                            | `axios` imported in `entities/user`                                                             | Passes                                                    | Vendor fence                                                                                                                       |
| Constructor outside the composition root                           | `createHttpClient` from `@/shared/api` in a page                                                | Passes                                                    | Construction ban                                                                                                                   |
| Declaration in a barrel                                            | `export const PROBE = 1;` in an `index.ts`                                                      | Passes                                                    | `no-restricted-syntax`                                                                                                             |
| Segment named for its contents                                     | `src/features/sign-in/hooks/` or `src/features/sign-in/types.ts`                                | `fsd/segments-by-purpose`                                 | Passes                                                                                                                             |
| The importer's own slice barrel                                    | `features/sign-in` imports `@/features/sign-in`                                                 | Passes                                                    | Passes                                                                                                                             |
| Vendor through a dynamic `import()`                                | `await import('axios')` in a page                                                               | Passes                                                    | Passes                                                                                                                             |

### steiger rules

`steiger.config.ts` spreads `fsd.configs.recommended`, which enables these 17 rules at `error`. The
plugin ships three more — `fsd/no-cross-imports`, `fsd/no-higher-level-imports` and
`fsd/import-locality` — outside the preset, and none is enabled.

| Rule                               | Reports                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fsd/forbidden-imports`            | An import from a higher layer, or from another slice on the same layer unless it lands on that slice's `@x/<importing slice>` file                                                                                                                                                                                                                                                                                                   |
| `fsd/no-public-api-sidestep`       | An import from another layer or another slice that lands past the target's `index` file — for `shared/lib` and `shared/ui`, past the group's                                                                                                                                                                                                                                                                                         |
| `fsd/public-api`                   | A slice without an `index` file; a `shared` segment without one, except `lib` and `ui`; a group folder in `shared/lib` or `shared/ui` without one. `app` is exempt                                                                                                                                                                                                                                                                   |
| `fsd/no-layer-public-api`          | An `index` file directly in a layer other than `app`, such as `src/shared/index.ts`                                                                                                                                                                                                                                                                                                                                                  |
| `fsd/insignificant-slice`          | An `entities`, `features` or `widgets` slice that no other layer imports, or that exactly one other slice imports. A single importer in `app` passes, and `pages` slices are never checked. Off for `./src/features/sign-in/**`, `./src/features/sign-out/**`, `./src/features/switch-locale/**` and `./src/features/update-user-name/**`                                                                                            |
| `fsd/segments-by-purpose`          | A segment — any direct child of a slice, of `shared` or of `app`, folder or file — named for what it contains rather than what it is for: 69 names, among them `components`, `hooks`, `types`, `utils`, `helpers`, `constants`, `store`, `context`, `providers`, `services`, `schemas`, `validation`, `mutations` and `resolvers`. The `BAD_NAMES` set in `node_modules/@feature-sliced/steiger-plugin/dist/index.js` lists them all |
| `fsd/no-segmentless-slices`        | A folder on a sliced layer with no conventional segment inside (`ui`, `api`, `lib`, `model`, `config`) that is not a group of slices either                                                                                                                                                                                                                                                                                          |
| `fsd/no-segments-on-sliced-layers` | A conventional segment name used directly under `entities`, `features`, `widgets` or `pages`                                                                                                                                                                                                                                                                                                                                         |
| `fsd/no-reserved-folder-names`     | A folder inside a segment named `ui`, `api`, `lib`, `model`, `config` or `@x`                                                                                                                                                                                                                                                                                                                                                        |
| `fsd/no-ui-in-app`                 | A `ui` segment in `app`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `fsd/ambiguous-slice-names`        | A slice named like a `shared` segment — here `api`, `config`, `i18n`, `lib`, `observability` or `ui`                                                                                                                                                                                                                                                                                                                                 |
| `fsd/inconsistent-naming`          | `entities` slice names that mix singular and plural                                                                                                                                                                                                                                                                                                                                                                                  |
| `fsd/repetitive-naming`            | A word repeated by every slice name in a group of more than two slices                                                                                                                                                                                                                                                                                                                                                               |
| `fsd/excessive-slicing`            | More than 20 ungrouped slices on one layer, or in one group of slices                                                                                                                                                                                                                                                                                                                                                                |
| `fsd/shared-lib-grouping`          | More than 15 entries directly in `shared/lib`                                                                                                                                                                                                                                                                                                                                                                                        |
| `fsd/typo-in-layer-name`           | A folder under `src/` whose name is within three edits of a missing layer, such as `src/widget`                                                                                                                                                                                                                                                                                                                                      |
| `fsd/no-processes`                 | A `processes` layer, which FSD has deprecated                                                                                                                                                                                                                                                                                                                                                                                        |

Because `fsd/segments-by-purpose` judges segment names only, a module named for a concept is fine
one level down: `shared/api/http-client-context.ts` sits inside the `api` segment and is no segment
itself.

### Import fences

`eslint.config.js` names most fences once, as a module-level constant — `SESSION_CONSTRUCTOR_NAMES`,
`LOWER_LAYER_IMPORT_PATHS`, `LOWER_LAYER_IMPORT_PATTERNS`, `I18N_VENDOR_IMPORT_PATHS`,
`FORM_VENDOR_IMPORT_PATHS`, `FORM_VENDOR_IMPORT_PATTERNS`, `TRANSPORT_VENDOR_IMPORT_PATHS`,
`ERROR_BOUNDARY_VENDOR_IMPORT_PATHS`, `VALIDATOR_IMPORT_PATTERNS` — and spreads it into every block
that needs it. Three fences are copy-pasted instead, so editing one of them means editing every
copy:

- The **group patterns** (`^@/shared/(lib|ui)$`, `^@/shared/(lib|ui)/[^/]+/.+`) live as three
  independent copies of the same two objects, none of which references a constant: inline inside
  `LOWER_LAYER_IMPORT_PATTERNS`, standalone in the `src/**/*.{ts,tsx}` block, and standalone again
  in the `src/app/{routes,router}/**` block.
- The **slice public-API pattern** (`^@/(entities|features|widgets|pages)/[^/]+/(?!@x/).+`) is in no
  constant at all. It is written inline in the `src/{entities,features,widgets,pages}/**` block, and
  again in the `src/app/{routes,router}/**` block with a shorter message that drops the "or a
  relative path within your own slice" clause.
- The `src/app/{routes,router}/**` block writes its four **construction bans** and its `axios` fence
  out inline, with messages that point at the router context rather than at `useHttpClient()`; only
  the session names come from a constant (`SESSION_CONSTRUCTOR_NAMES`, shared with the block below
  `app` so the two lists cannot drift). It could not spread `LOWER_LAYER_IMPORT_PATHS` wholesale in
  any case: that constant also carries the `@tanstack/react-router` allow-list, and route modules
  import exactly what the allow-list bans — `createFileRoute`, `createRootRouteWithContext`,
  `redirect`, `createRouter`. Its `^@/shared/api/` message is a shortened copy too.

A _construction ban_ rejects importing a factory from its barrel; a _vendor fence_ rejects a
third-party package outside the one segment or group that wraps it. "The five layers below `app`"
means `entities`, `features`, `widgets`, `pages` and `shared`. Test files are fenced like the
modules beside them, apart from three test carve-outs listed in
[Unit and component testing](./unit-testing.md#public-surface).

| Fence                                                                                                                                                                                              | Kind                     | Rejected in                                                                                      | Carve-out                                                       | Owner                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `createHttpClient`, `createQueryClient` from `@/shared/api`                                                                                                                                        | Construction ban         | The five layers below `app`; `app/routes`, `app/router`                                          | None                                                            | `shared/api` — [HTTP transport](./http-transport.md)                                       |
| `createI18n` from `@/shared/i18n`                                                                                                                                                                  | Construction ban         | The same                                                                                         | None                                                            | `shared/i18n` — [Internationalization](./internationalization.md)                          |
| `SESSION_CONSTRUCTOR_NAMES` from `@/entities/session`: `createSessionApi`, `createSessionEnder`, `createSessionResolver`, `createSessionStarter`, `createSessionStore`, `createSessionTokenSource` | Construction ban         | The same                                                                                         | None                                                            | `entities/session` — [Session management](./session-management.md)                         |
| Value imports from `@/shared/observability` (`allowTypeImports: true`)                                                                                                                             | Construction ban         | The same                                                                                         | None                                                            | `shared/observability` — [Error handling and reporting](./error-handling.md)               |
| `^@/shared/api/`, `^@/shared/observability/`                                                                                                                                                       | Deep-import patterns     | The same                                                                                         | None                                                            | [HTTP transport](./http-transport.md), [Error handling and reporting](./error-handling.md) |
| `@tanstack/react-router` except `Link` (`allowImportNames: ['Link']`); `^@tanstack/(react-)?router-core`; `^@tanstack/react-router/`                                                               | Router allow-list        | The five layers below `app`, type-only imports included                                          | All of `app`                                                    | `app/routes` — [Routing](./routing.md)                                                     |
| `axios`                                                                                                                                                                                            | Vendor fence             | The five layers below `app`; `app/routes`, `app/router`                                          | `src/shared/api/**`, tests included                             | `shared/api` — [HTTP transport](./http-transport.md)                                       |
| `react-i18next`; `i18next` (`allowTypeImports: true`); `i18next-browser-languagedetector`; `i18next-resources-to-backend`                                                                          | Vendor fence             | The same                                                                                         | `src/shared/i18n/**`, tests included                            | `shared/i18n` — [Internationalization](./internationalization.md)                          |
| `@tanstack/react-form` (`allowTypeImports: true`); `^@tanstack/(form-core\|react-store)`                                                                                                           | Vendor fence             | The five layers below `app`; the package path also in `app/routes`, `app/router`                 | Non-test files in `src/shared/ui/form/**`                       | `shared/ui/form` — [Forms](./forms.md)                                                     |
| `react-error-boundary`                                                                                                                                                                             | Vendor fence             | Every file in `src/`                                                                             | Non-test files in `src/shared/ui/error-boundary/**`             | `shared/ui/error-boundary` — [Error handling and reporting](./error-handling.md)           |
| `^(zod\|valibot\|arktype\|yup\|joi\|superstruct)(/\|$)`                                                                                                                                            | Validator fence          | Non-test files in the two Standard Schema seams: `src/shared/api/**` and `src/shared/ui/form/**` | Everywhere else: a schema belongs to the slice that consumes it | [HTTP transport](./http-transport.md), [Forms](./forms.md)                                 |
| `^@/shared/(lib\|ui)$`, `^@/shared/(lib\|ui)/[^/]+/.+`                                                                                                                                             | Group patterns           | Every file in `src/`                                                                             | None                                                            | `shared/lib`, `shared/ui` — this doc; [Design system](./design-system.md)                  |
| `^@/(entities\|features\|widgets\|pages)/[^/]+/(?!@x/).+`                                                                                                                                          | Slice public-API pattern | `entities`, `features`, `widgets`, `pages`; `app/routes`, `app/router`                           | Paths through an `@x/` folder                                   | Every slice — this doc                                                                     |
| `@/**` except `@/app`; `./*/**`; `../**`                                                                                                                                                           | Entry fence              | `src/main.tsx`                                                                                   | None                                                            | [Composition root](./composition-root.md)                                                  |
| `@/**`, `**/src/**`                                                                                                                                                                                | Suite fence              | `e2e/**/*.ts`, `playwright.config.ts`                                                            | None                                                            | [End-to-end testing](./e2e-testing.md)                                                     |
| Anything but import and re-export declarations (`no-restricted-syntax`)                                                                                                                            | Barrel rule              | Every `src/**/index.ts`                                                                          | None                                                            | Every public API — this doc                                                                |

`app/entrypoint`, `src/app/index.ts` and `src/main.test.ts` fall under only the first block, so
their one vendor fence is `react-error-boundary` and their only patterns are the two group patterns.
`vitest.setup.ts`, `scripts/` and every root configuration file except `playwright.config.ts` fall
under no block at all. Both gaps are listed under [Known limitations](#known-limitations).

#### How the blocks combine

ESLint gives each file the `no-restricted-imports` options of the **last** block below whose `files`
match it (and whose `ignores` do not exclude it). An earlier block's options are discarded, not
merged. The blocks, in file order:

| #   | `files`                                                                      | Fences it applies                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/**/*.{ts,tsx}`                                                          | `react-error-boundary`; the group patterns                                                                                                                                                                                               |
| 2   | `src/{entities,features,widgets,pages,shared}/**/*.{ts,tsx}`                 | `LOWER_LAYER_IMPORT_PATHS`, `LOWER_LAYER_IMPORT_PATTERNS` and every vendor list: the i18next packages, TanStack Form (path and patterns), `axios`, `react-error-boundary`                                                                |
| 3   | `src/{entities,features,widgets,pages}/**/*.{ts,tsx}`                        | Block 2's lists plus the slice public-API pattern                                                                                                                                                                                        |
| 4   | `src/shared/i18n/**/*.{ts,tsx}`                                              | Block 2's lists without the i18next packages                                                                                                                                                                                             |
| 5   | `src/shared/api/**/*.{ts,tsx}`                                               | Block 2's lists without `axios`, plus the validator fence                                                                                                                                                                                |
| 6   | `src/shared/api/**/*.test.{ts,tsx}`                                          | Block 5's lists without the validator fence                                                                                                                                                                                              |
| 7   | `src/shared/ui/form/**/*.{ts,tsx}`, ignoring its `*.test.{ts,tsx}`           | Block 2's lists without TanStack Form, plus the validator fence                                                                                                                                                                          |
| 8   | `src/shared/ui/error-boundary/**/*.{ts,tsx}`, ignoring its `*.test.{ts,tsx}` | Block 2's lists without `react-error-boundary`                                                                                                                                                                                           |
| 9   | `src/main.tsx`                                                               | `react-error-boundary`; the entry fence                                                                                                                                                                                                  |
| 10  | `src/app/{routes,router}/**/*.{ts,tsx}`                                      | A list of its own: the four construction bans with route-specific messages, `axios`, the i18next packages, `@tanstack/react-form`, `react-error-boundary`; the group, `shared/api`, `shared/observability` and slice public-API patterns |
| 11  | `e2e/**/*.ts`, `playwright.config.ts`                                        | The suite fence                                                                                                                                                                                                                          |

Four consequences follow from that last-match-wins rule. First, every block restates the complete
list its files need, which is why most of those lists are shared constants — and why the three
copy-pasted fences above have to be edited in every place they appear. Second, a narrower block must
come after every broader block that also matches its files: `src/shared/api/http-client.test.ts`
matches blocks 1, 2, 5 and 6, and gets block 6. Third, a broad block appended later silently cancels
the narrower ones, and nothing reports it as an error — `eslint.config.js` itself warns that a
`src/shared/**` block added below the carve-outs would kill the form exemption, and nothing tests
the flat config. Fourth, an `ignores` removes files from its own block only, so they take the
options of the last other block that matches them: `src/shared/ui/form/form.test.tsx` matches blocks
1 and 2 and gets block 2, where `@tanstack/react-form` values are banned and validators are not.

### File naming

| Kind                                          | Convention                                                                  | Example                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Every file and folder                         | kebab-case                                                                  | `src/shared/lib/format-duration/format-duration.ts`                                |
| React component                               | `kebab-case.tsx`, exporting one `PascalCase` component named after the file | `src/pages/home/ui/home-page.tsx` exports `HomePage`                               |
| Public API                                    | `index.ts`                                                                  | `src/shared/lib/format-duration/index.ts`                                          |
| React context with its hook, and its provider | `<name>-context.ts` beside `<name>-provider.tsx`                            | `src/shared/api/http-client-context.ts`, `src/shared/api/http-client-provider.tsx` |
| CVA class map                                 | `<primitive>-variants.ts`, only once the primitive has variants             | `src/shared/ui/button/button-variants.ts`                                          |
| Global stylesheet                             | `index.css`                                                                 | `src/app/styles/index.css`                                                         |
| Unit or component test                        | `*.test.ts` or `*.test.tsx`, beside the module it covers                    | `src/shared/lib/format-duration/format-duration.test.ts`                           |
| End-to-end spec                               | `e2e/**/*.spec.ts`, never under `src/`                                      | `e2e/user-profile.spec.ts`                                                         |
| End-to-end page object                        | `e2e/page-objects/*-page-object.ts`                                         | `e2e/page-objects/user-profile-page-object.ts`                                     |
| Generated route tree                          | The path `generatedRouteTree` names in `vite.config.ts`                     | `src/app/router/route-tree.gen.ts`                                                 |

Six files and one folder under `src/app/routes` follow TanStack Router's file-name-is-the-URL rule
instead (see [Routing](./routing.md)): `__root.tsx`, the root route; `index.tsx`, the `/` route — a
route module, not a barrel, and outside the barrel rule, whose glob is `src/**/index.ts`;
`_authenticated.tsx` and `_authenticated.test.tsx`, where a leading underscore marks a pathless
layout route that adds a guard but no URL segment; the `_authenticated/` folder; and
`_authenticated/users.$userId.tsx` with `_authenticated/users.$userId.test.tsx`, where `.` nests a
path segment and `$` marks a parameter.

- **Tests sit beside the code they cover**, never in a `__tests__` tree. `routeFileIgnorePattern` in
  `vite.config.ts` matches `\.test\.tsx?$`, which is what keeps route tests beside route modules out
  of the route tree; a `*.spec.tsx` in `src/app/routes` makes every build print
  `does not export a Route. This file will not be included in the route tree.`
- **`.spec` means the browser.** A `*.spec.ts` runs in Chromium against the production build, not in
  jsdom, and `e2e/` sits outside `src/` because the suite observes the built artefact rather than
  belonging to a layer. Page objects end in `-page-object.ts` so that neither the folder nor the
  exported symbol can be mistaken for the FSD `pages` layer (see
  [End-to-end testing](./e2e-testing.md)).
- **A `.tsx` module exports components.** `react-refresh/only-export-components`, from the `vite`
  preset of `eslint-plugin-react-refresh`, rejects any other export from a `.tsx` file (type exports
  and primitive constants aside), and route modules are exempt because each exports `Route`. That
  is why a context and its hook live in a `.ts` module beside the provider, and why a `cva(...)`
  class map lives in a `*-variants.ts`.
- **A primitive gains `*-variants.ts` with its second variant.** `Input` and `Label` have none and
  are styled inline. Either way, classes are Tailwind utilities against the semantic tokens in
  `src/shared/ui/theme.css` — `bg-primary`, `text-muted-foreground` — never literal palette values
  (see [Design system](./design-system.md)).
- **Nothing lints file names.** Check them with
  `find src e2e scripts -name '*[A-Z_$]*' -not -path 'src/app/routes/*'`, which prints nothing
  today. A miscased import does not survive, though: `forceConsistentCasingInFileNames` makes
  `npm run typecheck` fail with TS1261 even on a case-insensitive disk.

### Import order

`import-x/order` sorts every import block into six groups — builtin, external, internal, parent,
sibling, index — with a blank line between groups, each alphabetized case-insensitively. The setting
`import-x/internal-regex: '^@/'` is what puts `@/…` paths in the internal group. The import block of
`src/app/entrypoint/app.tsx` shows the internal, parent and sibling groups, then a stylesheet:

```tsx
import { appConfig } from '@/shared/config';
import { ErrorBoundary } from '@/shared/ui/error-boundary';

import { AppRouterProvider } from '../router/app-router-provider';

import { AppCrashFallback } from './app-crash-fallback';
import { reportError } from './app-error-reporter';
import { AppProviders } from './app-providers';
import { createQueryErrorHandlers } from './create-query-error-handlers';
import { createRenderErrorHandler } from './create-render-error-handler';

import '../styles/index.css';
```

- **Side-effect imports are not ordered.** The rule ignores them; by convention a stylesheet import
  comes last, as above, and nothing enforces it. `npm run lint:fix` never moves an import across a
  side-effect import: it sorts the imports on each side separately, and a misorder that spans one
  stays reported.
- **Type-only imports are separate declarations.** `@typescript-eslint/consistent-type-imports`
  (`prefer: 'type-imports'`, `fixStyle: 'separate-type-imports'`) and `verbatimModuleSyntax` in
  `tsconfig.app.json` require `import type`, and it sorts within its group like any other import:
  `src/features/sign-in/model/use-sign-in.ts` imports `useSessionStarter` from `@/entities/session`,
  then `Credentials` and `SignInOutcome` from the same path in a separate `import type` declaration.
  It is also the form a fence's `allowTypeImports: true` admits.
- **`npm run lint:fix` rewrites the order**; there is no need to sort by hand.

### Conventions nothing lints

| Convention                                                                                                                                                                                              | How to check                                                                       | Owner                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Configuration is read at the composition seam — `app/entrypoint/app.tsx` and `app/routes/**` — and passed down as props; `entities/session/model/session-token-source.ts` is the one reader below `app` | `grep -rn "@/shared/config" src`                                                   | [Configuration and environment](./configuration.md) |
| `console` is called only inside `shared/observability`                                                                                                                                                  | `grep -rn "console\." src --include='*.ts' --include='*.tsx' --exclude='*.test.*'` | [Error handling and reporting](./error-handling.md) |
| A barrel exports its slice's contract only; an entity never exports a DTO type, its schema, a mapper, a path builder or a query-key object                                                              | Review                                                                             | [User profile (read path)](./user-profile.md)       |
| A private screen's route module sits under `src/app/routes/_authenticated/`                                                                                                                             | Review                                                                             | [Authenticated route guard](./route-guard.md)       |
| A page renders exactly one `<main>` and one `<h1>`                                                                                                                                                      | Review                                                                             | [Routing](./routing.md)                             |
| File and folder names are kebab-case                                                                                                                                                                    | `find src e2e scripts -name '*[A-Z_$]*' -not -path 'src/app/routes/*'`             | This doc                                            |
| Inside a slice, modules import each other by relative path, never through the slice's own barrel                                                                                                        | Review                                                                             | This doc                                            |
| A stylesheet import comes last in its import block                                                                                                                                                      | Review                                                                             | This doc                                            |
| A layer directory is created in the same commit as its first slice                                                                                                                                      | Review                                                                             | This doc                                            |

## Configuration

No `VITE_*` variable affects these checks. They read the options below.

| Variable / option                                                 | Default                                                                                                                                                             | Meaning                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `steiger ./src` (`arch` in `package.json`)                        | `./src`                                                                                                                                                             | The root steiger analyses: its direct child folders named after a layer are the layers; files beside them, `src/main.tsx` and `src/main.test.ts`, are not analysed                                                                                                                                                                            |
| `fsd.configs.recommended` (`steiger.config.ts`)                   | 17 rules at `error`                                                                                                                                                 | The FSD rule set (see [steiger rules](#steiger-rules))                                                                                                                                                                                                                                                                                        |
| `files` of the override block (`steiger.config.ts`)               | `['./src/features/sign-in/**', './src/features/sign-out/**', './src/features/switch-locale/**', './src/features/update-user-name/**']`                              | The slices for which `'fsd/insignificant-slice': 'off'` holds                                                                                                                                                                                                                                                                                 |
| `paths` (`tsconfig.app.json`)                                     | `"@/*": ["./src/*"]`                                                                                                                                                | The alias for `src/`, `env.d.ts` and `vitest.setup.ts`: `tsc -b`, ESLint's type-aware rules through `projectService`, and dependency-cruiser (`--ts-config tsconfig.app.json`) resolve through it                                                                                                                                             |
| `baseUrl`, `paths` (`tsconfig.json`)                              | `"."`, `"@/*": ["./src/*"]`                                                                                                                                         | The same alias on the solution-style root, for tools that read only that file — the shadcn CLI, which follows `extends` but not `references` (see [Design system](./design-system.md)). steiger resolves through the configuration nearest `src/`, which is this file, and then the projects it references. `tsc -b` compiles nothing from it |
| `resolve.tsconfigPaths` (`vite.config.ts`)                        | `true`; Vite's own default is `false`                                                                                                                               | Vite, and Vitest through the same config, resolve `@/` from the tsconfig paths                                                                                                                                                                                                                                                                |
| `paths` (`tsconfig.e2e.json`)                                     | Unset                                                                                                                                                               | `@/…` does not resolve in `e2e/` or `playwright.config.ts`, so an aliased import there fails `npm run typecheck`                                                                                                                                                                                                                              |
| `settings['import-x/internal-regex']` (`eslint.config.js`)        | `'^@/'`                                                                                                                                                             | Puts `@/…` imports in the internal group                                                                                                                                                                                                                                                                                                      |
| `import-x/order` (`eslint.config.js`)                             | `groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']`, `'newlines-between': 'always'`, `alphabetize: { order: 'asc', caseInsensitive: true }` | The import order                                                                                                                                                                                                                                                                                                                              |
| `@typescript-eslint/consistent-type-imports` (`eslint.config.js`) | `prefer: 'type-imports'`, `fixStyle: 'separate-type-imports'`                                                                                                       | Type-only imports as separate `import type` declarations                                                                                                                                                                                                                                                                                      |
| `verbatimModuleSyntax` (`tsconfig.app.json`)                      | `true`                                                                                                                                                              | A type imported without `import type` is a type error                                                                                                                                                                                                                                                                                         |
| `forceConsistentCasingInFileNames` (all three projects)           | `true`                                                                                                                                                              | An import whose casing differs from the file's fails with TS1261                                                                                                                                                                                                                                                                              |
| `routeFileIgnorePattern` (`vite.config.ts`)                       | `'\\.test\\.tsx?$'`                                                                                                                                                 | Keeps `*.test.tsx` files in `src/app/routes` out of the route tree                                                                                                                                                                                                                                                                            |
| `arch:graph` flags (`package.json`)                               | `--no-config`, `--ts-config tsconfig.app.json`, `--include-only '^src'`, `--exclude '\.test\.tsx?$'`, `--output-type mermaid`, `--collapse '^src/[^/]+/[^/]+'`      | No rule file, the app project's alias, `src` only, tests dropped, one node per slice or segment                                                                                                                                                                                                                                               |

## Usage & extension

### Check a change before you push

```sh
npm run lint
npm run arch
npm run typecheck
```

Then `npm run audit` runs every gate CI runs ([Quality gates](./quality-gates.md)). While moving
code between slices, keep `npx steiger ./src --watch` open in a second terminal.

### Read a failure

| Message                                                                                                                                                                                                                        | Gate                         | Fix                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Forbidden import from higher layer "<layer>".`                                                                                                                                                                                | `fsd/forbidden-imports`      | Invert the dependency: the higher layer passes what the lower one needs as a prop, callback or factory argument — `onSignedIn` travels from `src/app/routes/sign-in.tsx` through `SignInPage` into `SignInForm` — or move the shared code down a layer |
| `Forbidden cross-import from slice "<slice>".`                                                                                                                                                                                 | `fsd/forbidden-imports`      | Compose the two slices in a higher layer, move what both need into a lower one, or, between two entities, publish it through an `@x` file ([below](#import-across-entities-with-x))                                                                    |
| `Forbidden sidestep of public API when importing from "<specifier>".`                                                                                                                                                          | `fsd/no-public-api-sidestep` | Import the barrel instead; if it lacks the name, add the name to the barrel                                                                                                                                                                            |
| `This slice has only one reference in slice "<slice>". Consider merging them.`                                                                                                                                                 | `fsd/insignificant-slice`    | Merge the code into its one importer or, for a `features` slice with exactly one consuming slice, add the slice to the override ([step 8](#add-a-slice))                                                                                               |
| `This slice has no references. Consider removing it.`                                                                                                                                                                          | `fsd/insignificant-slice`    | Commit the slice together with its first importer                                                                                                                                                                                                      |
| `This segment's name should describe the purpose of its contents, not what the contents are.`                                                                                                                                  | `fsd/segments-by-purpose`    | Move the files into `ui`, `model`, `api`, `lib`, `config`, or a folder named for its purpose                                                                                                                                                           |
| `This slice has no segments. Consider dividing the code inside into segments.`                                                                                                                                                 | `fsd/no-segmentless-slices`  | Give the slice at least one of `ui`, `api`, `lib`, `model` or `config`                                                                                                                                                                                 |
| `This slice is missing a public API.`, `This segment is missing a public API.`, `This top-level folder in shared/<segment> is missing a public API.`                                                                           | `fsd/public-api`             | Write the `index.ts` yourself. `steiger ./src --fix` would add an empty `index.js` instead                                                                                                                                                             |
| `'<specifier>' import is restricted from being used. <fence message>`, `'<name>' import from '<specifier>' is restricted. <fence message>`, `'<specifier>' import is restricted from being used by a pattern. <fence message>` | `no-restricted-imports`      | The fence message names the fix, such as `Construct the transport only in the app layer. Reach it with useHttpClient().`                                                                                                                               |
| `A public API barrel re-exports, it does not declare.` or `A public API barrel may contain only import and re-export declarations — no export default, no statements.`                                                         | `no-restricted-syntax`       | Move the code into a module of its own and re-export it from the barrel                                                                                                                                                                                |

steiger 0.6.0 labels some diagnostics ⚠ rather than ✘ when a run reports several, because its
severity lookup mishandles repeated file paths. Read every line as an error: every rule here is
configured at `error`, and any diagnostic makes `npm run arch` exit 1.

### Add a slice

The steps below are how `features/switch-locale` — the language switcher — and `widgets/app-header`
— the app-shell banner that hosts it — were added, in one commit that also opened the `widgets`
layer. Every snippet is the shipped file's exact contents, and the whole change passes `npm run lint`,
`npm run typecheck`, `npm run arch`, `npm run lint:a11y` and `npm run test:coverage` as written.

1. **Choose the layer.**

   | The code is                                                           | Layer                       | Worked example                                                                    |
   | --------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------- |
   | A screen reached by a URL                                             | `pages`                     | [Routing — Add a public screen](./routing.md#add-a-public-screen)                 |
   | One user action that changes state                                    | `features`                  | This walkthrough; for a form, [Forms](./forms.md#build-a-form-in-a-feature-slice) |
   | A business noun: a model, its wire mapping, its HTTP calls            | `entities`                  | [User profile — Add the next entity](./user-profile.md#add-the-next-entity)       |
   | A block composed from features and entities that several screens show | `widgets`                   | This walkthrough, from step 6                                                     |
   | Business-free code any layer may reuse                                | a `shared` segment or group | [Add a `shared` segment or group](#add-a-shared-segment-or-group)                 |
   | The construction and binding of concretes                             | `app/entrypoint`            | [Composition root](./composition-root.md)                                         |

   Switching the language is one user action that changes state — the active locale — so it is a
   `features` slice. Name a slice in kebab-case, a feature verb first like `sign-in` and
   `update-user-name`; never after a `shared` segment (`fsd/ambiguous-slice-names`); and an
   `entities` slice in the singular, like `session` and `user` (`fsd/inconsistent-naming`).

2. **Export what you need from the layer below.** The switcher needs the list of locales and each
   one's label: `SUPPORTED_LOCALES` and `LOCALES` in `src/shared/i18n/registry.ts`, which the
   barrel did not export. Add them to `src/shared/i18n/index.ts` rather than importing
   `@/shared/i18n/registry`, which steiger rejects from a `features` slice as a sidestep:

   ```diff
    export { I18nProvider } from './i18n-provider';
   -export { DEFAULT_LOCALE } from './registry';
   +export { DEFAULT_LOCALE, LOCALES, SUPPORTED_LOCALES } from './registry';
    export type { Locale } from './registry';
   ```

3. **Create the slice with a purpose-named segment.** A component belongs in `ui/`, so the slice is
   `src/features/switch-locale/ui/locale-switcher.tsx`:

   ```tsx
   import { LOCALES, SUPPORTED_LOCALES, useLocale } from '@/shared/i18n';
   import { Button } from '@/shared/ui/button';

   export function LocaleSwitcher() {
     const { locale, setLocale } = useLocale();

     return (
       <div className="flex items-center gap-1">
         {SUPPORTED_LOCALES.map((candidate) => {
           const isActive = candidate === locale;

           return (
             <Button
               key={candidate}
               variant={isActive ? 'default' : 'outline'}
               size="sm"
               aria-pressed={isActive}
               lang={candidate}
               onClick={() => {
                 setLocale(candidate);
               }}
             >
               {LOCALES[candidate].label}
             </Button>
           );
         })}
       </div>
     );
   }
   ```

   It reaches the layer below only through public APIs: the `@/shared/i18n` segment and the
   `@/shared/ui/button` group. The labels are the endonyms in `LOCALES` — registry data rather than
   copy — so the slice adds no translation key, and `lang` on each button tells a screen reader to
   pronounce the label in its own language. The `default`/`outline` pair is deliberate: `secondary`
   over `ghost` would give the selected button about 1.09:1 contrast against the page and fail
   WCAG 2.2 SC 1.4.11. A slice that grows a hook would put it in `model/` and import it from `ui/`
   by relative path, as `features/sign-in` does; this one needs none, because `useLocale` is already
   the published abstraction.

4. **Test it beside the module**, in `src/features/switch-locale/ui/locale-switcher.test.tsx`. It
   needs no provider, because `vitest.setup.ts` registers an English i18n instance globally (see
   [Unit and component testing](./unit-testing.md)):

   ```tsx
   import { render, screen, waitFor } from '@testing-library/react';
   import userEvent from '@testing-library/user-event';
   import { describe, expect, it } from 'vitest';

   import { LocaleSwitcher } from './locale-switcher';

   describe('LocaleSwitcher', () => {
     it('offers every supported locale under its own name, with the active one pressed', () => {
       render(<LocaleSwitcher />);

       expect(screen.getByRole('button', { name: 'English', pressed: true })).toBeInTheDocument();
       expect(screen.getByRole('button', { name: 'Русский', pressed: false })).toBeInTheDocument();
     });

     it('moves the pressed state when another locale is chosen', async () => {
       const user = userEvent.setup();
       render(<LocaleSwitcher />);

       await user.click(screen.getByRole('button', { name: 'Русский' }));

       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'Русский', pressed: true })).toBeInTheDocument();
       });
       expect(screen.getByRole('button', { name: 'English', pressed: false })).toBeInTheDocument();
     });

     it('tags each control with the language it names', () => {
       render(<LocaleSwitcher />);

       expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
       expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute('lang', 'ru');
     });
   });
   ```

5. **Publish the contract** in `src/features/switch-locale/index.ts`, and only what consumers
   compose:

   ```ts
   export { LocaleSwitcher } from './ui/locale-switcher';
   ```

6. **Compose it from a higher layer — here, a new one.** A widget is a self-contained block of a
   screen — a header, a sidebar, a feed — composed from `features` and `entities` slices and shown
   on more than one screen. A block that only one page renders stays in that page's `ui/` segment,
   and steiger enforces the difference. A header carrying the switcher appears on every route, so it
   is a widget rather than page-local, and `src/widgets` is created now, in the same commit as its
   first slice, never as an empty folder: a directory holding only a `.gitkeep` passes steiger, but
   it advertises structure that does not exist.

   Nothing needs configuring: every `eslint.config.js` glob and the slice public-API pattern already
   name `widgets`, steiger knows the layer, and `npm run arch:graph` draws it. The component is
   `src/widgets/app-header/ui/app-header.tsx`:

   ```tsx
   import { LocaleSwitcher } from '@/features/switch-locale';

   interface AppHeaderProps {
     readonly appName: string;
   }

   export function AppHeader({ appName }: AppHeaderProps) {
     return (
       <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
         <span className="text-sm font-semibold tracking-tight">{appName}</span>
         <LocaleSwitcher />
       </header>
     );
   }
   ```

   `<header>` carries the implicit `banner` role, so no `role` attribute is written — oxlint's
   `no-redundant-roles` and `prefer-tag-over-role` both require the semantic tag. The widget takes
   the application name as a prop rather than importing `appConfig`, because configuration is read
   at the composition seam and passed down (see
   [Configuration and environment](./configuration.md)).

   Its test, `src/widgets/app-header/ui/app-header.test.tsx`, asserts composition — that the feature
   is reachable _through_ the banner, not merely co-present on the page:

   ```tsx
   import { render, screen, within } from '@testing-library/react';
   import { describe, expect, it } from 'vitest';

   import { AppHeader } from './app-header';

   describe('AppHeader', () => {
     it('renders a banner naming the application', () => {
       render(<AppHeader appName="frontend-boilerplate" />);

       expect(screen.getByRole('banner')).toHaveTextContent('frontend-boilerplate');
     });

     it('offers the locale switcher inside the banner', () => {
       render(<AppHeader appName="frontend-boilerplate" />);

       const banner = screen.getByRole('banner');

       expect(within(banner).getByRole('button', { name: 'English' })).toBeInTheDocument();
     });
   });
   ```

   and its public API, `src/widgets/app-header/index.ts`:

   ```ts
   export { AppHeader } from './ui/app-header';
   ```

7. **Mount it from the composition seam.** The root layout in `src/app/routes/__root.tsx` renders it
   above every route, feeding it the configured name:

   ```diff
    import { NotFoundPage } from '@/pages/not-found';
   +import { appConfig } from '@/shared/config';
   +import { AppHeader } from '@/widgets/app-header';

    import type { AppRouterContext } from '../router/app-router-context';

    function RootLayout() {
      return (
        <>
   +      <AppHeader appName={appConfig.name} />
          <Outlet />
          <TanStackRouterDevtools position="bottom-left" initialIsOpen={false} />
        </>
      );
    }
   ```

8. **Run the architecture check.** `npm run arch` now fails:

   ```text
   ┌ src/features/switch-locale
   ✘ This slice has only one reference in slice "widgets/app-header". Consider merging them.
   │
   └ fsd/insignificant-slice: https://github.com/feature-sliced/steiger/tree/master/packages/steiger-plugin-fsd/src/insignificant-slice

   ───────────────────────────────────────────────
    Found 1 error (none can be fixed automatically)
   ```

   `widgets/app-header` itself is not flagged, because its only importer sits in `app`, an unsliced
   layer the rule never counts. `fsd/insignificant-slice` targets premature slicing, and a feature
   with exactly one genuine consuming slice is this repo's accepted exception —
   `features/sign-in`, `features/sign-out` and `features/update-user-name` are listed for that
   reason — so add the slice to the override in `steiger.config.ts`:

   ```diff
      {
        files: [
          './src/features/sign-in/**',
          './src/features/sign-out/**',
   +      './src/features/switch-locale/**',
          './src/features/update-user-name/**',
        ],
        rules: {
   ```

   `npm run arch` then prints `✔ No problems found!`. Once a second slice imports the feature,
   delete its entry, so the rule guards it again.

9. **Pin the composition, then run the remaining gates and refresh the graph.** Mounting in
   `__root.tsx` leaves a gap no slice-level test closes: delete the `<AppHeader />` line and every
   test still passes, because `RootLayout` is still invoked. The regression is caught in
   `src/app/entrypoint/app.test.tsx`, the layer where the seam is exercised (see
   [Composition root](./composition-root.md)).

   ```sh
   npm run lint
   npm run typecheck
   npx vitest run src/features/switch-locale src/widgets/app-header
   npm run arch:graph
   npm run audit
   ```

   `npm run arch:graph` adds the `widgets` subgraph and the `app-header → switch-locale` edge to
   [`docs/architecture-graph.md`](../architecture-graph.md); commit the graph with the slices.

### Import across entities with `@x`

Two slices on one layer never import each other, with one sanctioned exception: FSD's `@x`
notation, a file named after the importing slice inside an `@x` folder of the exporting one. None
exists today. Should `entities/session` one day need `UserId`, `entities/user` publishes it for that
one consumer in `src/entities/user/@x/session.ts`:

```ts
export type { UserId } from '../model/user';
```

and `entities/session` imports it by that path:

```ts
import type { UserId } from '@/entities/user/@x/session';

export interface SignedInUser {
  readonly userId: UserId;
}
```

Both gates accept it: `fsd/forbidden-imports` allows a same-layer import that lands on
`@x/<importing slice>`, and the slice public-API pattern skips `@x/` paths. The file name is the
whole check — `entities/session` importing `@/entities/user/@x/other` is still a forbidden
cross-import. FSD intends `@x` for `entities`, where business nouns genuinely refer to each other;
between features or pages, compose in the layer above instead. Keep the file a pure re-export,
since the barrel rule matches `index.ts` only.

### Add a `shared` segment or group

- **A helper** is a group under `shared/lib`: copy the shape of `src/shared/lib/format-duration/` —
  `format-duration.ts`, `format-duration.test.ts` and an `index.ts` that re-exports it — and import
  it as `@/shared/lib/<group>`. Never a flat `src/shared/lib/<name>.ts`: steiger checks the public
  API of `shared/lib` and `shared/ui` per group folder, so a flat file has none to protect. steiger
  asks for grouping once `shared/lib` holds more than 15 entries (`fsd/shared-lib-grouping`).
- **A UI primitive** is a group under `shared/ui`; see
  [Design system — Add a primitive](./design-system.md#add-a-primitive).
- **A new segment**, for a capability with its own port, is `src/shared/<segment>/` with an
  `index.ts` (`fsd/public-api` requires one), named for its purpose — `observability`, never
  `services`. Then fence it: steiger skips same-layer imports, so another `shared` segment could
  import past its barrel until `eslint.config.js` carries a `^@/shared/<segment>/` pattern, and a
  factory stays importable everywhere until a construction ban names it.
  [Composition root — Add a provider-backed seam](./composition-root.md#add-a-provider-backed-seam)
  adds both for a hypothetical `shared/analytics`.

### Fence a new vendor

Wrap a library in the one `shared` segment or group that owns it, then make that ownership
mechanical. For a date library wrapped by a `shared/lib/format-date` group:

1. Declare the fence once, beside the other vendor lists in `eslint.config.js`:

   ```js
   const DATE_VENDOR_IMPORT_PATHS = [
     {
       name: 'date-fns',
       message:
         'Only shared/lib/format-date knows about date-fns. Format dates with @/shared/lib/format-date.',
     },
   ];
   ```

2. Spread `...DATE_VENDOR_IMPORT_PATHS` into the `paths` of every block that fences a vendor today —
   ten of the eleven, in file order: `src/**/*.{ts,tsx}`,
   `src/{entities,features,widgets,pages,shared}/**`, `src/{entities,features,widgets,pages}/**`,
   `src/shared/i18n/**`, `src/shared/api/**`, `src/shared/api/**/*.test.{ts,tsx}`,
   `src/shared/ui/form/**`, `src/shared/ui/error-boundary/**`, `src/main.tsx` and
   `src/app/{routes,router}/**`. A block left out is a hole: its files never see the fence.
3. Exempt the owner with a block that restates the lower-layer lists without the new one, placed
   anywhere after the `src/{entities,features,widgets,pages,shared}/**` block, since no later block
   matches its files:

   ```js
   {
     files: ['src/shared/lib/format-date/**/*.{ts,tsx}'],
     rules: {
       'no-restricted-imports': [
         'error',
         {
           paths: [
             ...LOWER_LAYER_IMPORT_PATHS,
             ...I18N_VENDOR_IMPORT_PATHS,
             ...FORM_VENDOR_IMPORT_PATHS,
             ...TRANSPORT_VENDOR_IMPORT_PATHS,
             ...ERROR_BOUNDARY_VENDOR_IMPORT_PATHS,
           ],
           patterns: [...LOWER_LAYER_IMPORT_PATTERNS, ...FORM_VENDOR_IMPORT_PATTERNS],
         },
       ],
     },
   },
   ```

4. Choose the fence's shape. Add `allowTypeImports: true` only if a vendor type must appear in
   consumers' props, as `@tanstack/react-form` allows; add a `patterns` regex when sibling packages
   reach the same API, as `^@tanstack/(form-core|react-store)` does, because a `paths` entry matches
   one exact specifier.
5. Prove it bites: add a throwaway module holding `export { format } from 'date-fns';` to a `pages`
   slice and to `src/app/router`, run `npm run lint`, expect the fence's message twice, then delete
   both.

### Regenerate the dependency graph

`npm run arch:graph` runs dependency-cruiser over `src` and rewrites
[`docs/architecture-graph.md`](../architecture-graph.md) as a Mermaid flowchart with one node per
slice or segment; [Quality gates](./quality-gates.md#npm-scripts) breaks the command down. Run it
whenever the imports between slices or segments change, commit the result, and never edit it by
hand. Node ids are assigned in order, so adding one slice renumbers most of the file: review the
rendered graph, not the diff. The graph follows JavaScript and TypeScript imports only, so the CSS
`@import` from `app/styles/index.css` to `shared/ui/theme.css` is not drawn.

## Design decisions & trade-offs

- **Two engines, because each is blind where the other sees.** steiger understands the FSD
  structure — layers, slices, segments, and where a resolved path lands — but reads only `import`
  statements and skips imports inside one unsliced layer. ESLint sees every specifier, re-exports
  included, and can fence packages and names, but knows the layers only through globs and never
  resolves a relative path. Either alone leaves a class of violation open; the table under
  [What each gate catches](#what-each-gate-catches) is the division of labour.
- **The `recommended` preset, whole, with one scoped override.** `steiger.config.ts` spreads
  `fsd.configs.recommended` instead of listing rules, so a rule the preset gains is enforced by
  default. The override names each exempt slice's path rather than switching
  `fsd/insignificant-slice` off for `./src/features/**`: every new slice is judged by the rule until
  someone adds it to the list, in a line a reviewer sees. The exemption exists because each
  reference feature has exactly one consuming slice — a page for three of them, `widgets/app-header`
  for `switch-locale` — which is what the rule flags; the rule targets premature slicing, and a user
  action with one genuine host is not that.
- **The slice public-API pattern duplicates steiger on purpose.** It catches two things steiger
  cannot see: an absolute import of a module inside the importer's own slice, and a re-export past a
  barrel. To watch the first one, in `src/pages/user-profile/ui/user-profile-page.tsx` rewrite
  `import { useUserProfile } from '../model/use-user-profile';` as
  `import { useUserProfile } from '@/pages/user-profile/model/use-user-profile';` and run
  `npm run arch`: it stays green — `✔ No problems found!` — because the import never crosses a slice
  boundary, and an import within one slice is nothing steiger is looking for. `npm run lint` reports
  `Import the slice public API: @/<layer>/<slice> — or a relative path within your own slice. Cross-slice imports go through @x.`
  on that line; revert it afterwards. The pattern's negative lookahead, `(?!@x/)`, keeps FSD's
  cross-import path open, and its globs stay clear of `shared`, `app/entrypoint` and `src/main.tsx`,
  so it disturbs none of the order-sensitive carve-outs.
- **Absolute across a boundary, relative inside a slice.** A fence sees only the specifier, never
  which slice wrote it: `@/pages/home/ui/home-page` reads the same in `pages/home` as in
  `pages/sign-in`. So the rule is by spelling — an aliased path is a crossing, and must name a
  barrel; a relative path is local. The cost is that a relative path is invisible to every ESLint
  fence, so the fences are drift protection, not a sandbox; relative climbs into another slice or
  layer are still caught by steiger, which resolves them.
- **No segment barrel for `shared/lib` and `shared/ui`.** One would grow a line per helper and give
  each symbol two sanctioned import paths. steiger does not require it on these two segments, so
  ESLint bans the bare path instead; and because steiger checks their public API per group folder,
  a helper is a folder with an `index.ts`, never a flat file.
- **Barrels re-export and do nothing else.** The barrel is the slice's contract: logic placed in it
  is unreachable through that contract and untestable in isolation, and a side effect belongs to the
  module that owns it — the global stylesheet is imported by `app/entrypoint/app.tsx`, not by
  `src/app/index.ts` and not by `src/main.tsx`. A pure barrel also carries no coverable statement,
  so the 90% per-file coverage threshold measures barrels without exempting them (see
  [Unit and component testing](./unit-testing.md)).
- **Vendor fences ban the package, not a list of blessed names.** An allow-list leaves the barrel a
  convention rather than a boundary: `allowImportNames: ['Trans', 'useTranslation']` on
  `react-i18next` would let a page import `useTranslation` from the vendor with no error. Each
  vendor is banned outright, its one owner gets a carve-out block, and `allowTypeImports: true`
  appears only where a vendor type must cross — `i18next` types, and the TanStack Form `form` type
  that a form split into sections names in a prop.
- **The router fence allows, the observability fence bans by path.** Both fail closed. Enumerating
  route-state exports would miss `getRouteApi`, which hands a caller `useParams`, `useSearch` and
  `useNavigate` through one import, and would admit whatever a future minor adds; allowing only
  `Link` bans all of it ([Routing](./routing.md)). Banning the `@/shared/observability` path rather
  than today's factory names bans the next adapter added to the barrel by default
  ([Error handling and reporting](./error-handling.md)). The other constructors are banned by name
  because their barrels also export what lower layers must reach — `useHttpClient`,
  `useTranslation`, `useSessionStarter` — and the session names live in `SESSION_CONSTRUCTOR_NAMES`,
  referenced by both blocks that ban them so the two lists cannot drift apart.
- **Patterns where an exact name would leak.** A `paths` entry matches one specifier exactly, so a
  ban on `zod` would admit `zod/mini`: the validator fence is the regex
  `^(zod|valibot|arktype|yup|joi|superstruct)(/|$)`, and TanStack Form's sibling packages are fenced
  by `^@tanstack/(form-core|react-store)` beside the `@tanstack/react-form` path.
- **Flat config replaces, so every block restates its lists.** Most of those lists are module-level
  constants spread into each block, though the group patterns, the slice public-API pattern and the
  `app/{routes,router}` construction bans are copy-pasted rather than shared (see
  [Import fences](#import-fences)). Every carve-out follows the broader block it narrows. The
  `shared/api` test exemption is a block of its own rather than an `ignores` on the `shared/api`
  block, because an `ignores` only removes files from that block — the tests would fall back to the
  lower-layer block, which bans `axios`. The form and error-boundary blocks use `ignores` for
  exactly that effect: their tests fall back to the lower-layer block and reach the vendor only
  through the seam they test.
- **`src/main.tsx` imports `@/app` and nothing else.** steiger cannot analyse a file outside the
  layers, so a lint block stands in: every `@/` path but `@/app`, and every relative path into a
  directory, is banned. The mount point cannot bind anything, which leaves all composition to
  `app/entrypoint` ([Composition root](./composition-root.md)).
- **A layer arrives with its first slice.** An empty `src/widgets/` would have passed steiger while
  advertising structure that did not exist, and the ESLint globs already named `widgets`, so the
  directory cost nothing to defer. It arrived with `app-header`, its first tenant, in one commit.
- **One casing for every file.** Two conventions — PascalCase for components, kebab-case for the
  rest — made naming a lookup rather than something a contributor already knows. Mixed casing is
  also a portability hazard: APFS and NTFS are case-insensitive by default, so `from './App'` finds
  `app.tsx` locally and fails only on a case-sensitive Linux checkout, which is where CI runs.
  Exported symbols stay PascalCase, because JSX treats a lowercase identifier as a host element. No
  lint rule enforces file names: a filename plugin (`eslint-plugin-check-file`, or unicorn's
  `filename-case`) would need exception syntax for the TanStack route files before it earned the
  dependency.
- **The dependency graph is generated, never drawn.** `npm run arch:graph` derives the picture from
  the imports themselves, with `--no-config`: the graph illustrates, and the rules stay in steiger
  and ESLint. Nothing checks that the generated file is current;
  [Quality gates](./quality-gates.md) sketches a gate that would.

## Testing

No test covers the boundary configuration itself. Vitest collects only
`src/**/*.{test,spec}.{ts,tsx}`, and `eslint.config.js` says of its order-sensitive blocks that
"nothing tests the flat config". The rules are verified by running the gates — every push runs
them through `npm run audit` — and by tests that make one boundary executable:

- `src/pages/home/ui/home-page.test.tsx` and
  `src/pages/resolving-session/ui/resolving-session-page.test.tsx` render their pages with no
  router, proof that a page below `app` reads no route state.
- `src/pages/user-profile/ui/user-profile-view.test.tsx` renders the profile view with no
  `QueryClientProvider`, no `HttpClientProvider` and no router.

| Command                                               | Proves                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run arch`                                        | The tree satisfies the steiger rules: `✔ No problems found!`                                        |
| `npm run lint`                                        | Every fence, the barrel rule and import order hold                                                  |
| `npm run typecheck`                                   | The alias resolves in the app project and not in `e2e/`, and every import's casing matches its file |
| `npm run audit`                                       | All nine gates pass, in CI's order                                                                  |
| `npm test`                                            | The Vitest suite, including the router-free page tests                                              |
| `npx vitest run src/pages/home/ui/home-page.test.tsx` | One file of it                                                                                      |
| `npm run test:e2e`                                    | Playwright over the production build (see [End-to-end testing](./e2e-testing.md))                   |

To see a gate bite before trusting it, break it on purpose and revert:

- Add `import { SignInForm } from '@/features/sign-in/ui/sign-in-form';` to a module under
  `src/pages/home`: `npm run lint` reports the slice public-API message and `npm run arch` reports
  `fsd/no-public-api-sidestep`.
- Add `import { SignInForm } from '@/features/sign-in';` to a module under `src/entities/user`: only
  `npm run arch` fails, with `Forbidden import from higher layer "features".`
- Replace the whole array in `steiger.config.ts` with `[...fsd.configs.recommended]`:
  `npm run arch` reports `fsd/insignificant-slice` for `src/features/sign-in`,
  `src/features/sign-out` and `src/features/update-user-name`.
- Add `export const PROBE = 1;` to any `index.ts`: `npm run lint` reports
  `A public API barrel re-exports, it does not declare.`

## Known limitations

- **steiger does not read re-exports.** Its import extractor matches `import` declarations and
  dynamic `import()`, not `export … from`, so a barrel that re-exports another slice's internal
  module passes `npm run arch`. ESLint's slice public-API pattern catches it below `app` and in
  `app/routes` and `app/router`; in `src/app/index.ts`,
  `export { createSessionStore } from '@/entities/session/model/session-store';` passes both gates.
- **The composition root is barely fenced.** `app/entrypoint`, `src/app/index.ts` and
  `src/main.test.ts` fall under only the generic `src/**` block, so `axios`, the i18next packages
  and `@tanstack/react-form` pass lint there; a deep import past a slice or segment barrel still
  fails steiger when it is written as an `import`. `vitest.setup.ts`, `scripts/` and every root
  configuration file but `playwright.config.ts` are covered by no fence.
- **A dynamic `import()` escapes every ESLint fence.** `no-restricted-imports` checks import and
  re-export declarations only: `await import('axios')` in a page passes both gates, and a dynamic
  import past a slice barrel is caught by steiger alone.
- **Relative paths are invisible to ESLint.** Every fence matches the specifier string, so
  `../api/http-client` written in `shared/observability` passes both gates — steiger skips the
  same-layer import. Across layers and slices, steiger resolves the path and catches it.
- **Deep imports into `shared/i18n` and `shared/config` from another `shared` segment pass both
  gates.** ESLint carries deep-import patterns for `shared/api` and `shared/observability` only, and
  steiger skips same-layer imports.
- **A slice's own barrel imported from inside it passes both gates.** A module in
  `features/sign-in` that imports `@/features/sign-in` routes the slice through its own `index.ts`,
  an import cycle; `fsd/import-locality`, which would report it, is not in the `recommended` preset.
- **An `@x` file is open to every higher layer.** steiger exempts `@x` from
  `fsd/no-public-api-sidestep` and the slice public-API pattern skips `@x/`, so a `features` or
  `pages` slice importing `@/entities/user/@x/session` passes both gates. The barrel rule matches
  `index.ts` only, so nothing stops an `@x` file from holding logic.
- **No gate checks what a barrel exports.** An entity barrel that exported its DTO schema would pass
  every check; keeping wire shapes out of public APIs is a review responsibility (see
  [User profile (read path)](./user-profile.md)).
- **`app/routes` and `app/router` miss the TanStack Form internals pattern.** Their block bans the
  `@tanstack/react-form` path but not `^@tanstack/(form-core|react-store)`, so an
  `@tanstack/react-store` import there passes lint.
- **Side-effect imports pass the barrel rule.** `no-restricted-syntax` admits every import
  declaration, so `import './styles/index.css';` in an `index.ts` is not reported; keeping side
  effects out of barrels is a convention.
- **Nothing tests the flat config.** A block appended below the carve-outs, or a vendor list left
  out of one block, silently disables a fence for those files; only a probe import reveals it.
- **File names are not linted.** Kebab-case names, test placement and `*-variants.ts` hold by review
  and by the `find` check under [Conventions nothing lints](#conventions-nothing-lints).
- **Nothing keeps the dependency graph current.** No gate regenerates or compares
  `docs/architecture-graph.md`, so it can drift from the imports between two runs of
  `npm run arch:graph` (see [Quality gates](./quality-gates.md#known-limitations)).
