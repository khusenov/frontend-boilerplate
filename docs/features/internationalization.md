# Internationalization

> **Status:** Complete · **Layers:** app, pages, features, shared, outside layers · **Verified against:** `19fe53b`

## Purpose

Every string a visitor reads or hears — headings, labels, button text, validation messages,
accessible names — is copy the frontend owns. This feature keeps all of it in per-locale JSON files
under `src/shared/i18n/locales`, reached from components through translation keys the compiler
checks, so the app can ship in several languages without any component knowing which one is active,
can tell browsers and screen readers what language the page is in, and charges English visitors
nothing for the languages they do not use. It was put in place while the app had two pages and seven
strings (commit `816d57f`) because the cost of retrofitting it grows with every slice: hundreds of
strings later, it also means rewriting every test that asserts on English copy.

## How it works

The feature is the `i18n` segment of the `shared` layer plus the wiring that binds it at the
composition root. In Feature-Sliced Design (FSD) a _segment_ is a purpose-named folder inside a
layer; `shared` has segments but no _slices_ (the per-screen or per-entity folders of the layers
above it). The _composition root_ is `src/app/entrypoint`, the only code in `src/` that constructs
concrete objects and publishes them to the rest of the tree. Other code reaches the segment only
through its _public API_, the `index.ts` barrel imported as `@/shared/i18n`. Copy is grouped into
_namespaces_ — one JSON file per locale and namespace — and there are two: `common`, the default,
and `home`.

1. **The instance is built once, at bootstrap.** `src/main.tsx` mounts `App`
   (`src/app/entrypoint/app.tsx`), which renders `AppProviders`. There,
   `const [i18n] = useState(() => createI18n())` builds the application's i18next instance once per
   mount. `createI18n` never touches i18next's global singleton: it calls `createInstance()`,
   registers `LanguageDetector` (from `i18next-browser-languagedetector`) and
   `resourcesToBackend(loadLocaleNamespace)` (from `i18next-resources-to-backend`), and initializes
   synchronously (`initAsync: false`) with `BUNDLED_RESOURCES` inline and
   `partialBundledLanguages: true`, which lets the backend supply whatever the bundle lacks.
2. **Detection picks the locale.** `AppProviders` passes no `locale` option, so the detector
   collects candidate language tags from three sources, highest priority first: the `lng` query
   parameter (`/?lng=ru`), the `app.locale` key in `localStorage`, and the browser's preferred
   languages (`navigator`). i18next takes the first candidate that `supportedLngs` — the registry's
   `SUPPORTED_LOCALES`, `en` and `ru` — accepts; `load: 'languageOnly'` lets a regional tag such as
   `en-GB` count as `en`. When no candidate qualifies it uses `fallbackLng`, which is
   `DEFAULT_LOCALE` (`en`). The winning tag is written back under `app.locale`
   (`caches: ['localStorage']`), so the next visit starts from it. Detection runs only here, when
   the instance is built.
3. **The instance is published before the first render.** Every supported locale's `common`
   namespace is in the bundle, so initialization completes synchronously and the instance already
   holds the shell copy when React first renders. `AppProviders` renders
   `<Suspense fallback={null}>` and, inside it, `<I18nProvider i18n={i18n}>` around the rest of the
   provider tree and the router. `I18nProvider` wraps react-i18next's `I18nextProvider`, so every
   `useTranslation` and `<Trans>` below it resolves against this injected instance, and it mounts
   `DocumentLocaleSync`, which reads `useLocale()` and, in an effect, writes the locale and its text
   direction to `document.documentElement.lang` and `.dir` — replacing the `lang="en"` that
   `index.html` hardcodes.
4. **Components render copy.** A component calls `useTranslation()` for the default `common`
   namespace, or `useTranslation('home')` for another, and renders `t('group.key', options)` or
   `<Trans>`. Anything already in memory resolves synchronously. When a component asks for a
   namespace the active locale does not bundle — today only `home` under `ru` — react-i18next
   suspends it (hands React a promise, so the nearest `Suspense` boundary shows its fallback) and
   asks i18next to load the namespace. The backend calls `loadLocaleNamespace('ru', 'home')`, which
   looks the file up in a build-time `import.meta.glob` map and `import()`s its code-split chunk;
   when the chunk arrives the component renders in Russian. For route components the nearest
   boundary is TanStack Router's own root `Suspense`, whose fallback is the root route's
   `pendingComponent` — none is set, so it renders nothing. The boundary in `AppProviders` covers
   anything that suspends outside the route tree.
5. **A locale change re-renders subscribers.** `useLocale().setLocale(next)` calls
   `i18n.changeLanguage(next)`. Shell copy switches synchronously because `common` is bundled;
   components re-render on i18next's `languageChanged` event, `DocumentLocaleSync` rewrites
   `<html lang dir>`, the detector caches the choice under `app.locale`, and a screen whose
   namespace the new locale does not bundle suspends while it streams. No mounted component calls
   `setLocale` yet (see [Known limitations](#known-limitations)), so today a visitor changes language
   with `?lng=` on a full page load.

**Failure paths.**

- _A lazy namespace fails to load_ — a network error, or a chunk missing after a deploy. i18next
  marks the namespace as failed, react-i18next counts a failed load as settled, and the component
  renders with `fallbackLng` copy — English — instead of staying suspended or throwing. Nothing
  reports the failure, and i18next does not retry a failed namespace for the life of the instance,
  so that screen stays English until the next full page load.
- _An unsupported or hostile locale value_ — `?lng=de`, `?lng=../../../etc/passwd`, a stale
  `app.locale`. `supportedLngs` rejects it before anything is loaded; detection moves on to the next
  candidate, and the tag that wins — never the rejected one — is what gets cached.

**The worked example.** The home page at `/` exercises every pattern a slice needs.
`src/app/routes/index.tsx` reads `appConfig` and renders `HomePage` from `@/pages/home` with `name`,
`mode` and `apiBaseUrl` props. `HomePage` calls `useTranslation('home')` and uses `<Trans>` for two
sentences that carry markup (`environment.mode` and `environment.api`, each with a `<code>` element
supplied through `components`), `t('elapsedLabel')` as the accessible name of an `<output>` (whose
implicit role is `status`), a plural (`t('secondsAdded', { count: elapsedSeconds })`) and plain
button text (`t('addOneSecond')`). The elapsed time itself comes from `formatDuration`
(`@/shared/lib/format-duration`), which turns milliseconds into a fixed `mm:ss` or `hh:mm:ss`
string with no locale input. The project README designates `pages/home` and
`shared/lib/format-duration` as worked examples rather than product code: they exist so that every
gate has something to bite, and are meant to be replaced by the first real slice and helper.

## Architecture

Consumers program against three seams — the hooks and components they depend on — all exported from
`@/shared/i18n`. The first is react-i18next's own API, `useTranslation` and `Trans`, re-exported
unchanged: unlike [`shared/api`](./http-transport.md), which hides axios behind a hand-written `HttpClient` port, this
segment adopts the vendor's React API as the project's own (see
[Design decisions](#design-decisions--trade-offs)). The second is `useLocale`, the project's hook for
the active `Locale`, its text direction and a setter. The third is `I18nProvider`, the injection
adapter that publishes an instance to a subtree. The concrete behind all three is an i18next
instance from the `createI18n` factory, and the composition root binds it in one place:
`AppProviders` constructs it in a `useState` initializer and renders `I18nProvider` with it inside
`Suspense` (see [Composition root](./composition-root.md)); `vitest.setup.ts` is the only other
binding site, for tests. Imports point downward only: `pages`, `features` and `shared/ui/form`
import the `@/shared/i18n` barrel; `shared/i18n` imports nothing from the project outside itself,
only the i18next packages; and in `src/` only `app/entrypoint` imports `createI18n`. ESLint's
`no-restricted-imports` enforces the last two: `i18next`, `react-i18next`,
`i18next-browser-languagedetector` and `i18next-resources-to-backend` are banned in every layer
below `app` and in `app/routes` and `app/router`, except inside `src/shared/i18n/**` (type-only
imports of `i18next` stay allowed everywhere), and `createI18n` is banned on the barrel everywhere
except `app/entrypoint`. steiger's `fsd/no-public-api-sidestep` rejects an import past the barrel
from another layer. [Architecture boundaries](./architecture-boundaries.md) covers the rule set as a
whole.

| Component                                                                                                | Layer                        | Responsibility                                                                                                                        | File                                                   |
| -------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `createI18n`                                                                                             | `shared/i18n`                | Factory: builds an isolated i18next instance with the detector, the lazy backend and the bundled resources, initialized synchronously | `src/shared/i18n/create-i18n.ts`                       |
| `I18nProvider`                                                                                           | `shared/i18n`                | Injection adapter: publishes an instance through `I18nextProvider` and mounts `DocumentLocaleSync`                                    | `src/shared/i18n/i18n-provider.tsx`                    |
| `DocumentLocaleSync`                                                                                     | `shared/i18n` (internal)     | Mirrors the active locale and its direction onto `<html lang>` and `dir`                                                              | `src/shared/i18n/i18n-provider.tsx`                    |
| `useLocale`                                                                                              | `shared/i18n`                | Returns the active `Locale` clamped to the registry, its `dir`, and `setLocale`                                                       | `src/shared/i18n/use-locale.ts`                        |
| `SUPPORTED_LOCALES`, `LOCALES`, `isSupportedLocale`, `DEFAULT_LOCALE`, `NAMESPACES`, `DEFAULT_NAMESPACE` | `shared/i18n`                | Locale registry: codes, endonym labels, text directions, namespaces and defaults                                                      | `src/shared/i18n/registry.ts`                          |
| `BUNDLED_RESOURCES`                                                                                      | `shared/i18n`                | Inline resources — every English namespace plus each locale's `common` — under a `satisfies` constraint                               | `src/shared/i18n/bundled-resources.ts`                 |
| `loadLocaleNamespace`                                                                                    | `shared/i18n`                | Lazy backend: imports any other locale and namespace pair from a build-time `import.meta.glob` map                                    | `src/shared/i18n/lazy-locale-loader.ts`                |
| `CustomTypeOptions` augmentation                                                                         | `shared/i18n`                | Types every namespace and key from the English JSON                                                                                   | `src/shared/i18n/i18next.d.ts`                         |
| Locale JSON                                                                                              | `shared/i18n`                | The copy, one file per locale and namespace                                                                                           | `src/shared/i18n/locales/<locale>/<namespace>.json`    |
| Barrel                                                                                                   | `shared/i18n`                | Public API; re-exports `Trans` and `useTranslation` from `react-i18next`                                                              | `src/shared/i18n/index.ts`                             |
| `AppProviders`                                                                                           | `app/entrypoint`             | Constructs the instance in `useState` and renders `I18nProvider` inside `Suspense`                                                    | `src/app/entrypoint/app-providers.tsx`                 |
| `HomeRoute`                                                                                              | `app/routes`                 | Route module for `/`: passes `appConfig` values to `HomePage` as props                                                                | `src/app/routes/index.tsx`                             |
| `HomePage`                                                                                               | `pages/home · ui`            | Worked example: `<Trans>`, a plural, a translated accessible name                                                                     | `src/pages/home/ui/home-page.tsx`                      |
| `useCredentialsSchema`                                                                                   | `features/sign-in · model`   | Reference `features`-layer consumer: resolves validation messages through `t` for a schema that cannot call a hook itself             | `src/features/sign-in/model/use-credentials-schema.ts` |
| `formatDuration`                                                                                         | `shared/lib/format-duration` | Worked-example helper: milliseconds to `mm:ss` or `hh:mm:ss`                                                                          | `src/shared/lib/format-duration/format-duration.ts`    |
| Global test instance                                                                                     | `outside layers`             | Registers a fresh English instance with `setI18n` before each test                                                                    | `vitest.setup.ts`                                      |
| `I18N_VENDOR_IMPORT_PATHS`, `LOWER_LAYER_IMPORT_PATHS`                                                   | `outside layers`             | Fence the i18next packages into `shared/i18n` and `createI18n` into `app/entrypoint`                                                  | `eslint.config.js`                                     |

## Public surface

Every screen in the app draws its copy from this segment, so the feature's route surface is the
app's whole route surface. `common` is loaded at initialization and is what every screen except the
home page renders; `/` is the only route that reaches for a second namespace, `home`.

| Path             | Auth            | Purpose                                                                                                                                                                             |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | `public`        | Home page, the i18n worked example: `src/app/routes/index.tsx` renders `HomePage`, the only consumer of the `home` namespace                                                        |
| `/sign-in`       | `public`        | `src/app/routes/sign-in.tsx` renders `SignInPage` on the `signIn` keys, including the validation messages `features/sign-in` resolves                                               |
| `/users/$userId` | `authenticated` | `src/app/routes/_authenticated/users.$userId.tsx` renders `UserProfilePage` on the `user` and `userProfile` keys, plus the `signOut` keys `features/sign-out` renders on its button |

Two more render points serve translated copy without a path of their own: the root route's
`notFoundComponent` (`src/app/routes/__root.tsx`) renders `NotFoundPage` on the `notFound` keys, and
the `_authenticated` layout route's `pendingComponent` (`src/app/routes/_authenticated.tsx`) renders
`ResolvingSessionPage` on the `session` keys while the guard resolves. [Routing](./routing.md) owns
the route tree itself.

**`@/shared/i18n`** — the segment's barrel, the only import path for i18n below `app`:

| Export                   | Kind      | Signature                                                                                               | Contract                                                                                                                                                         |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createI18n`             | function  | `createI18n(options?: CreateI18nOptions): i18n`                                                         | Returns a new, initialized i18next instance (`i18n` is i18next's instance type). Construct only in `app/entrypoint`; lint rejects the import elsewhere in `src/` |
| `CreateI18nOptions`      | type      | `{ readonly locale?: Locale; readonly detection?: Partial<LocaleDetectionOptions> }`                    | See [Configuration](#configuration)                                                                                                                              |
| `LocaleDetectionOptions` | type      | `{ readonly order: readonly string[]; readonly caches: readonly string[] }`                             | Detector names to read candidates from, and to persist the chosen tag to                                                                                         |
| `I18nProvider`           | component | props `{ readonly i18n: i18n; readonly children: ReactNode }`                                           | Publishes `i18n` to its subtree and keeps `<html lang dir>` in sync. Render it inside a `Suspense` boundary                                                      |
| `useTranslation`         | hook      | `useTranslation(ns?)` returning `{ t, i18n, ready }`                                                    | react-i18next's hook, re-exported. `t` is typed against the namespace; the component suspends while that namespace loads                                         |
| `Trans`                  | component | `<Trans i18nKey t values components />`                                                                 | react-i18next's component, re-exported, for copy that carries markup                                                                                             |
| `useLocale`              | hook      | `useLocale(): UseLocaleResult`                                                                          | Reads the instance from `I18nProvider` (in tests, from the global one) and never suspends                                                                        |
| `UseLocaleResult`        | type      | `{ readonly locale: Locale; readonly dir: 'ltr' \| 'rtl'; readonly setLocale: (next: Locale) => void }` | `locale` is the resolved language narrowed to `Locale`, else `DEFAULT_LOCALE`; `setLocale` starts `changeLanguage` and returns nothing                           |
| `Locale`                 | type      | `'en' \| 'ru'`                                                                                          | Derived from `SUPPORTED_LOCALES`                                                                                                                                 |
| `DEFAULT_LOCALE`         | constant  | `'en'`                                                                                                  | The fallback locale                                                                                                                                              |

Everything else in the segment is internal: `SUPPORTED_LOCALES`, `LOCALES`, `LocaleDescriptor`,
`TextDirection`, `isSupportedLocale`, `NAMESPACES`, `Namespace`, `DEFAULT_NAMESPACE`,
`BUNDLED_RESOURCES`, `loadLocaleNamespace` and `DocumentLocaleSync` are not exported from the
barrel.

**Namespaces.** Each slice's keys are documented with that slice — see [Sign-in](./sign-in.md),
[Update user name](./update-user-name.md), [User profile](./user-profile.md),
[Authenticated route guard](./route-guard.md), [Routing](./routing.md) and [Forms](./forms.md).

| Namespace          | Bundled for | Loaded lazily for | Top-level key groups and their consumers                                                                                                                                                                                                                                                 |
| ------------------ | ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common` (default) | `en`, `ru`  | none              | `notFound` (`pages/not-found`), `session` (`pages/resolving-session`), `user` and `userProfile` (`pages/user-profile`), `signIn` (`pages/sign-in`, `features/sign-in`), `signOut` (`features/sign-out`), `updateUserName` (`features/update-user-name`), `validation` (`shared/ui/form`) |
| `home`             | `en`        | `ru`              | `environment`, `elapsedLabel`, `addOneSecond`, `secondsAdded` (`pages/home`)                                                                                                                                                                                                             |

**`@/pages/home`** exports `HomePage`, with props
`{ readonly name: string; readonly mode: string; readonly apiBaseUrl: string }`. It renders `name`
as the page's only `<h1>`, the two `environment` sentences, the elapsed-time `<output>` and a
`Button` that adds one second.

**`@/shared/lib/format-duration`** exports `formatDuration(milliseconds: number): string`: `mm:ss`
under an hour, `hh:mm:ss` from an hour on, and a `RangeError` for a negative or non-finite value.

## Configuration

The feature reads no `VITE_*` variable of its own. Its options are the `createI18n` arguments and
the constants in the registry; `AppProviders` calls `createI18n()` with no arguments, so the
application always runs on the defaults, while `vitest.setup.ts` passes
`{ locale: DEFAULT_LOCALE, detection: { order: [], caches: [] } }`.

| Variable / option                          | Default                                        | Meaning                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale` (`CreateI18nOptions`)             | unset                                          | Pins the locale and skips detection. The value is still cached under `app.locale` unless `detection.caches` is `[]`                                                                                                                                                                                   |
| `detection.order` (`CreateI18nOptions`)    | `['querystring', 'localStorage', 'navigator']` | Detector names, highest priority first; `[]` disables detection. Merged shallowly over the default, so overriding `order` keeps the default `caches`. Only `querystring` and `localStorage` have lookup keys set here; another detector name the library supports reads the library's own default key |
| `detection.caches` (`CreateI18nOptions`)   | `['localStorage']`                             | Where the detected or chosen tag is persisted; `[]` disables persistence                                                                                                                                                                                                                              |
| Query parameter (`LOCALE_QUERY_PARAMETER`) | `lng`                                          | A constant in `create-i18n.ts`, not an option. `/?lng=ru` selects Russian on a full page load, and the choice is then cached                                                                                                                                                                          |
| Storage key (`LOCALE_STORAGE_KEY`)         | `app.locale`                                   | A constant in `create-i18n.ts`, not an option. The `localStorage` key detection reads and caching writes                                                                                                                                                                                              |
| `DEFAULT_LOCALE`                           | `'en'`                                         | `fallbackLng`, the locale that ships whole, and the type authority for keys                                                                                                                                                                                                                           |
| `SUPPORTED_LOCALES`                        | `['en', 'ru']`                                 | Passed as `supportedLngs`; defines the `Locale` type                                                                                                                                                                                                                                                  |
| `DEFAULT_NAMESPACE`                        | `'common'`                                     | `defaultNS`, and the only namespace loaded at initialization (`ns`)                                                                                                                                                                                                                                   |
| `VITE_API_BASE_URL`                        | `/v1` when unset or blank                      | Read by `appConfig` only; the home page displays `appConfig.apiBaseUrl` through `environment.api`. Its real role is in [Configuration and environment](./configuration.md)                                                                                                                            |
| `import.meta.env.MODE`                     | Vite's build mode                              | Read by `appConfig` only; the home page displays `appConfig.mode` through `environment.mode`                                                                                                                                                                                                          |

The remaining i18next options are fixed inside `createI18n`: `fallbackLng: DEFAULT_LOCALE`,
`supportedLngs: SUPPORTED_LOCALES`, `load: 'languageOnly'`, `defaultNS: DEFAULT_NAMESPACE`,
`ns: [DEFAULT_NAMESPACE]`, `resources: BUNDLED_RESOURCES`, `partialBundledLanguages: true`,
`initAsync: false` and `interpolation: { escapeValue: false }`.
[Design decisions](#design-decisions--trade-offs) explains the non-obvious ones.

## Usage & extension

### Render copy

Import `useTranslation` from `@/shared/i18n` — never from `react-i18next`, which lint rejects below
`app` — call it with no argument for `common` or with a namespace name, and render `t(key)`. From
`src/pages/resolving-session/ui/resolving-session-page.tsx`:

```tsx
import { useTranslation } from '@/shared/i18n';

export function ResolvingSessionPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('session.resolving')}</h1>
    </main>
  );
}
```

A key is a dotted path into the JSON: `session.resolving` is `{ "session": { "resolving": … } }` in
`common.json`. A typo, or a key missing from the English file, fails `npm run typecheck`. A component
below `app` holds no user-facing string literal; it calls `t()` or renders `<Trans>`.

Adding a key group to a namespace that already exists is two JSON edits and nothing else.
`features/sign-out` added a `signOut` group to `common`, between `signIn` and `session`:
`signOut.action` ("Sign out" in `en/common.json`, "Выйти" in `ru/common.json`) and
`signOut.inProgress` ("Signing out…" / "Выходим…"). `src/shared/i18n/i18next.d.ts` needed no change,
because it types the `common` resource as `typeof enCommon` — the key union is derived from the
English file itself, so both keys became compile-checked the moment they were written. Name a group
for what the control does rather than for the machinery around it: this one is `action` and
`inProgress`, not `signIn`'s `submit` and `submitting`, because the sign-out control is a
`type="button"` that submits no form, and a translator who reads the key without the code would be
told the wrong thing by the form vocabulary.

### Interpolation, plurals and markup

Interpolate with `{{name}}` in the JSON and a matching option. `common.json` holds
`"nameTooLong": "Use at most {{max}} characters."`, which `features/update-user-name` renders with
`t('updateUserName.validation.nameTooLong', { max: MAXIMUM_NAME_LENGTH })`.

A plural is a family of keys with a CLDR plural-category suffix, and the call passes `count` against
the bare key. i18next picks the suffix with `Intl.PluralRules` for the active locale, so each locale
lists its own categories: English has `one` and `other`, Russian has `one`, `few`, `many` and
`other` (`other` covers fractions). The `secondsAdded` family in `en/home.json`:

```json
{
  "secondsAdded_one": "{{count}} second added",
  "secondsAdded_other": "{{count}} seconds added"
}
```

and in `ru/home.json`:

```json
{
  "secondsAdded_one": "Добавлена {{count}} секунда",
  "secondsAdded_few": "Добавлено {{count}} секунды",
  "secondsAdded_many": "Добавлено {{count}} секунд",
  "secondsAdded_other": "Добавлено {{count}} секунды"
}
```

`HomePage` renders it with `t('secondsAdded', { count: elapsedSeconds })`; the typed key is the bare
`secondsAdded`.

When copy contains markup, keep the whole sentence in the JSON and map its tags to elements with
`<Trans>`. `"mode": "mode: <code>{{mode}}</code>"` in `home.json` renders through:

```tsx
<Trans i18nKey="environment.mode" t={t} values={{ mode }} components={{ code: <code /> }} />
```

Pass the `t` returned by `useTranslation('home')`: it binds `<Trans>` to that namespace both at
runtime and in the type of `i18nKey`. Without it, `<Trans>` looks the key up in `common`.

### Locale-aware formatting and domain values

Format dates and numbers with `Intl` against `useLocale().locale`, which is always a supported
`Locale`. From `src/pages/user-profile/ui/user-profile-view.tsx`:

```tsx
const { locale } = useLocale();
const dateFormatter = useMemo(
  () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }),
  [locale],
);
```

Translate a domain value in the view, not in the DTO mapper, by mapping it to a typed key — the same
file does it for `UserRole`:

```tsx
const ROLE_LABEL_KEYS = {
  admin: 'user.roles.admin',
  member: 'user.roles.member',
  viewer: 'user.roles.viewer',
} as const satisfies Record<UserRole, string>;
```

`satisfies Record<UserRole, string>` makes a new `UserRole` member a compile error until it has a
key, and `as const` keeps each value a literal key, so `t(ROLE_LABEL_KEYS[user.role])` is
type-checked. The mapper stays free of i18n, as [User profile](./user-profile.md) describes.

### Copy outside JSX

A validation schema is not a component, so it cannot call `useTranslation`. The slice's schema
factory takes its messages as resolved strings — never `t` — and a sibling hook resolves them in one
place. From `src/features/sign-in/model/use-credentials-schema.ts`:

```ts
import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';

import { createCredentialsSchema } from './credentials-schema';
import type { CredentialsSchema } from './credentials-schema';

export function useCredentialsSchema(): CredentialsSchema {
  const { t } = useTranslation();

  return useMemo(
    () =>
      createCredentialsSchema({
        emailInvalid: t('signIn.validation.emailInvalid'),
        passwordRequired: t('signIn.validation.passwordRequired'),
      }),
    [t],
  );
}
```

Key the memo on `[t]`, not on `i18n.language`; the reason is under
[Design decisions](#design-decisions--trade-offs), and [Forms](./forms.md) covers the schema side.

### Choosing a namespace

`common` is in memory in every locale from the first render: nothing that uses it ever suspends, but
it is part of the initial download for every visitor, once per supported locale. A separate
namespace keeps a screen's copy out of the initial download for every locale except English, at the
cost of one request and one suspension the first time that screen renders in such a locale. Today
every slice except `pages/home` keys its copy into `common`. Copy that must render before anything
can load — the not-found page, the session-resolving screen, the form seam's fallback message —
belongs in `common` regardless.

### Add a namespace

The steps, for a hypothetical `settings` namespace used by a `pages/settings` slice:

1. Add one JSON file per locale. `src/shared/i18n/locales/en/settings.json`:

   ```json
   {
     "title": "Settings"
   }
   ```

   and `src/shared/i18n/locales/ru/settings.json`:

   ```json
   {
     "title": "Настройки"
   }
   ```

2. Register it in `src/shared/i18n/registry.ts`:

   ```ts
   export const NAMESPACES = ['common', 'home', 'settings'] as const;
   ```

3. Bundle it for the default locale in `src/shared/i18n/bundled-resources.ts`, because the default
   locale ships whole:

   ```ts
   import type { ResourceKey } from 'i18next';

   import enCommon from './locales/en/common.json';
   import enHome from './locales/en/home.json';
   import enSettings from './locales/en/settings.json';
   import ruCommon from './locales/ru/common.json';
   import type { DEFAULT_NAMESPACE, Locale, Namespace } from './registry';

   export const BUNDLED_RESOURCES = {
     en: { common: enCommon, home: enHome, settings: enSettings },
     ru: { common: ruCommon },
   } as const satisfies Record<
     Locale,
     Partial<Record<Namespace, ResourceKey>> & Record<typeof DEFAULT_NAMESPACE, ResourceKey>
   >;
   ```

4. Type it in `src/shared/i18n/i18next.d.ts`:

   ```ts
   import type enCommon from './locales/en/common.json';
   import type enHome from './locales/en/home.json';
   import type enSettings from './locales/en/settings.json';
   import type { DEFAULT_NAMESPACE } from './registry';

   declare module 'i18next' {
     interface CustomTypeOptions {
       defaultNS: typeof DEFAULT_NAMESPACE;
       returnNull: false;
       resources: {
         common: typeof enCommon;
         home: typeof enHome;
         settings: typeof enSettings;
       };
     }
   }
   ```

5. Add it to the key-family drift guard in `src/shared/i18n/lazy-locale-loader.test.ts` — the
   imports, then `TRANSLATED_NAMESPACES`:

   ```ts
   import { describe, expect, it } from 'vitest';

   import { loadLocaleNamespace } from './lazy-locale-loader';
   import enCommon from './locales/en/common.json';
   import enHome from './locales/en/home.json';
   import enSettings from './locales/en/settings.json';
   import ruCommon from './locales/ru/common.json';
   import ruHome from './locales/ru/home.json';
   import ruSettings from './locales/ru/settings.json';
   import { DEFAULT_LOCALE, DEFAULT_NAMESPACE, SUPPORTED_LOCALES } from './registry';
   ```

   ```ts
   const TRANSLATED_NAMESPACES = [
     { namespace: 'common', english: enCommon, russian: ruCommon },
     { namespace: 'home', english: enHome, russian: ruHome },
     { namespace: 'settings', english: enSettings, russian: ruSettings },
   ];
   ```

6. Use it from the slice, `src/pages/settings/ui/settings-page.tsx`:

   ```tsx
   import { useTranslation } from '@/shared/i18n';

   export function SettingsPage() {
     const { t } = useTranslation('settings');

     return (
       <main className="mx-auto flex max-w-2xl flex-col items-start gap-6 p-8">
         <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
       </main>
     );
   }
   ```

   exported from the slice's public API, `src/pages/settings/index.ts`:

   ```ts
   export { SettingsPage } from './ui/settings-page';
   ```

`lazy-locale-loader.ts` and `create-i18n.ts` do not change: the glob already matches
`./locales/ru/settings.json`, and `ns` lists only the default namespace, so every other namespace
loads on first use. The compiler enforces steps 2 and 4 — bundling a namespace missing from
`NAMESPACES` is error `TS2353`, and `useTranslation('settings')` does not type-check until
`i18next.d.ts` lists it. Step 3 is not enforced: forgetting the English entry compiles, the loader
refuses English (it ships whole), and the namespace renders its raw keys, which a component test
asserting on copy catches. Step 5 is not enforced either. Routing the new page is covered in
[Routing](./routing.md).

### Add a locale

The steps, for a hypothetical French locale, `fr`:

1. Register the code and its descriptor in `src/shared/i18n/registry.ts`. `label` is the language's
   name in that language; `dir` is `'rtl'` for a right-to-left script:

   ```ts
   export const SUPPORTED_LOCALES = ['en', 'ru', 'fr'] as const;
   ```

   ```ts
   export const LOCALES = {
     en: { label: 'English', dir: 'ltr' },
     ru: { label: 'Русский', dir: 'ltr' },
     fr: { label: 'Français', dir: 'ltr' },
   } as const satisfies Record<Locale, LocaleDescriptor>;
   ```

2. Translate every namespace: `src/shared/i18n/locales/fr/common.json` and
   `src/shared/i18n/locales/fr/home.json`, each with every key of its English counterpart. A plural
   family needs one key per plural category of the locale —
   `new Intl.PluralRules('fr').resolvedOptions().pluralCategories` lists `one`, `many` and `other`.

3. Bundle the new locale's `common` in `src/shared/i18n/bundled-resources.ts`:

   ```ts
   import type { ResourceKey } from 'i18next';

   import enCommon from './locales/en/common.json';
   import enHome from './locales/en/home.json';
   import frCommon from './locales/fr/common.json';
   import ruCommon from './locales/ru/common.json';
   import type { DEFAULT_NAMESPACE, Locale, Namespace } from './registry';

   export const BUNDLED_RESOURCES = {
     en: { common: enCommon, home: enHome },
     ru: { common: ruCommon },
     fr: { common: frCommon },
   } as const satisfies Record<
     Locale,
     Partial<Record<Namespace, ResourceKey>> & Record<typeof DEFAULT_NAMESPACE, ResourceKey>
   >;
   ```

4. Extend the tests: the key-family drift guard in `lazy-locale-loader.test.ts` compares English
   with Russian only, so French needs its own comparison, and a plural-selection case like the
   Russian one in `create-i18n.test.ts` pins the new locale's forms.

Nothing else changes: `supportedLngs` reads `SUPPORTED_LOCALES`, the glob picks up `fr/home.json`,
and `DocumentLocaleSync` writes whatever `dir` the registry holds. Step 1 drives the compiler: until
`LOCALES` and `BUNDLED_RESOURCES` both have an `fr` entry, `npm run typecheck` fails (`TS1360` for a
missing entry, `TS2322` for an entry without `common`), and the `BUNDLED_RESOURCES` entry cannot
compile without `fr/common.json` on disk. Steps 2 (beyond `common`) and 4 are not enforced. One trap:
four test files use `de` as their example of an unsupported code — `create-i18n.test.ts`,
`i18n-provider.test.tsx`, `lazy-locale-loader.test.ts` and `registry.test.ts` — so registering
German means choosing another unsupported code there.

### Add a language switcher

A switcher is a control that calls `useLocale().setLocale(next)`; `DocumentLocaleSync`, every
`useTranslation` consumer and the `app.locale` cache follow on their own. The list of locales and
their endonym labels live in `SUPPORTED_LOCALES` and `LOCALES`, which the barrel does not export
today, so the change that adds the switcher also adds them to `src/shared/i18n/index.ts` — rather
than importing `@/shared/i18n/registry` directly (see [Known limitations](#known-limitations)).
[Architecture boundaries](./architecture-boundaries.md#add-a-slice) walks through building this
exact slice, `features/switch-locale`, end to end, including the steiger override a
single-consumer `features` slice needs.

## Design decisions & trade-offs

- **An injected instance from a factory, not i18next's global singleton.** `createI18n()` calls
  `createInstance()` and returns a fresh instance, in the same factory shape as `createHttpClient`,
  `createQueryClient` and `createAppRouter`: `app/entrypoint` composes the application's one
  instance and each test builds an isolated one, so a language change in one test cannot leak into
  the next. The global that `vitest.setup.ts` registers is a test convenience, not the app's wiring;
  `i18n-provider.test.tsx` proves the injected instance wins over it.
- **i18next's React API is adopted, not wrapped — a deliberate departure from `shared/api`.** The
  transport hides axios behind a hand-written port; this segment re-exports `useTranslation` and
  `Trans` as they are, because a wrapper would have to re-create the generic key inference that
  `CustomTypeOptions` feeds into `t`, `useTranslation` and `<Trans>` — the property that makes keys
  compile-checked. What the barrel buys is one place to patch import paths, not implementation
  independence.
- **The vendor fence is a ban, not an allow-list.** An allow-list such as
  `allowImportNames: ['Trans', 'useTranslation']` on `react-i18next` was probed and rejected, for
  the reason every vendor fence in the repo shares: it leaves the barrel a convention rather than a
  boundary (see [Architecture boundaries](./architecture-boundaries.md#design-decisions--trade-offs)).
  `i18next` alone keeps `allowTypeImports: true`, so a slice may name a type such as `TFunction`
  without reaching the runtime, and `createI18n` is additionally banned on the barrel everywhere
  except `app/entrypoint`.
- **English ships whole; every other locale ships `common` and streams the rest.** `resources`
  holds all English namespaces plus `ru/common` inline, `partialBundledLanguages: true` lets the
  backend coexist with them, and `loadLocaleNamespace` resolves everything else through a dynamic
  `import()` that Vite code-splits per locale and namespace. An English visitor makes no extra
  request and never suspends; a Russian visitor to `/` fetches one chunk, `home-*.js`, of about
  0.63 kB raw / 0.31 kB gzip, which is absent from the initial download. When the segment landed
  (`816d57f`), rendering `/` cost +22.81 kB gzip: +18.37 kB in the entry chunk (112.44 → 130.81) and
  +4.44 kB in the shared `routes-*.js` chunk (0.56 → 5.00), which carries `<Trans>` and the
  `html-parse-stringify` parser it depends on. That second chunk is shared — every page view loads
  it, so the cost is paid by every route that reaches `@/shared/i18n`, not only by `/` — and it is a
  different chunk from the `home-*.js` namespace payload above. Lazily loaded namespaces come on
  top, in chunks of their own.
- **Bundling every locale's `common` is a correctness guarantee, not an optimization.** i18next
  resolves a language only if its store holds some of that language's translations, and the lazy
  glob deliberately excludes `common`. A locale registered without a bundled `common` therefore has
  no reachable shell copy: i18next abandons it and the visitor gets a fully English UI, with no
  error anywhere. The `satisfies Record<Locale, … & Record<typeof DEFAULT_NAMESPACE, ResourceKey>>`
  constraint on `BUNDLED_RESOURCES` turns that mistake into a compile error, and `registry.test.ts`
  asserts it again; do not remove the constraint. The cost is that `common` is in every visitor's
  initial download once per locale — `en/common.json` is 1.6 kB and `ru/common.json` 2.1 kB raw
  today — so each key a slice adds to `common` is paid by every visitor, in every locale.
- **The lazy glob and the static imports are disjoint by construction.** `LAZY_LOCALE_MODULES` globs
  `./locales/*/*.json` minus `!./locales/en/*.json` and `!./locales/*/common.json`, which are
  exactly the files `bundled-resources.ts` imports statically; without the exclusions a file would
  be imported both ways and every build would print the bundler's `INEFFECTIVE_DYNAMIC_IMPORT`
  warning. The default locale appears as the literal `en` because glob patterns must be statically
  analysable and cannot interpolate `DEFAULT_LOCALE`; the test "rejects for the default locale,
  which ships whole" in `lazy-locale-loader.test.ts` fails if the two disagree.
- **The loader is a lookup, not a path builder.** `loadLocaleNamespace` indexes the map Vite builds
  at compile time from the files that exist, and a key that is not in it throws
  `No lazily loadable translations for "<language>/<namespace>".`. Untrusted input never gets that
  far: `supportedLngs` rejects any tag outside `SUPPORTED_LOCALES` before a load is attempted, so
  `?lng=../../../etc/passwd` is skipped exactly like `?lng=de`.
- **Keys are compile-checked, and English is the type authority.** `i18next.d.ts` augments
  `CustomTypeOptions` with `typeof enCommon` and `typeof enHome` as the resource types and
  `defaultNS: typeof DEFAULT_NAMESPACE`, so `t('notFound.titel')` and `useTranslation('hoem')` fail
  `npm run typecheck`, and plural-suffixed keys (`secondsAdded_one`, `secondsAdded_other`) collapse
  to one typed `secondsAdded`. A key that exists only in another locale is not a valid key; a key
  missing from another locale is caught by the drift guard, not the compiler. `strictKeyChecks`
  keeps i18next's default, which relaxes the check for a `t` call that passes `defaultValue`; no
  call in `src/` does. `returnNull: false` pins i18next's default so `t()` is typed as never
  returning `null`.
- **The `import type` lines in `i18next.d.ts` are load-bearing.** They make the file a module, which
  makes `declare module 'i18next'` an augmentation of i18next's types rather than a wholesale
  replacement of them. `moduleDetection: "force"` in `tsconfig.app.json` does not help, because it
  does not apply to declaration files.
- **`registry.ts`, not `locales.ts`.** A sibling `locales/` directory holds the JSON. A file and a
  directory sharing a name would make `from './locales'` and `from './locales/en/common.json'`
  resolve correctly only by file-before-directory precedence, and silently flip the day someone adds
  `locales/index.ts`.
- **Copy carries its own markup; it is never concatenated.** `"mode: <code>{{mode}}</code>"` is one
  complete sentence rendered through `<Trans components={{ code: <code /> }}>`. Handing a translator
  a bare `"mode:"` fragment to reassemble in JSX hardcodes English word order, which is the string
  concatenation this segment exists to remove.
- **`escapeValue: false` is required, and it is not an XSS relaxation.** React escapes every string
  it renders, so leaving i18next's own escaping on would double-escape (`O'Brien` becomes
  `O&#39;Brien`); react-i18next never uses `dangerouslySetInnerHTML`. Two vendor behaviours are
  worth knowing. `<Trans>` parses the result of interpolating its `values` as markup, so a
  user-controlled value can add elements of the kinds `<Trans>` knows — its `components` plus `br`,
  `strong`, `i` and `p` — while any other tag, `<script>` and `<img onerror>` included, renders as
  escaped text; pass user input through `t()` into a text child instead. And i18next warns that
  `$t(...)` nesting over interpolated values can be redirected to another language or namespace; no
  copy here nests. The home page's `<Trans>` values are build-time configuration.
- **`<html lang>` and `dir` follow the registry.** `index.html` hardcodes `lang="en"`;
  `DocumentLocaleSync` inside `I18nProvider` makes it truthful, which WCAG 3.1.1 (Language of Page)
  requires — otherwise a screen reader reads Russian text with English pronunciation rules. It
  writes a process-global with no injection seam, so two `I18nProvider`s would fight over the same
  attributes. That is acceptable for a single-root app; if it stops being true, the fix is to export
  `DocumentLocaleSync` and mount it once at the composition root, not to add a `syncDocument` prop.
- **`useLocale` opts out of Suspense to bound the blast radius; bundled `common` is what prevents a
  blank page.** `DocumentLocaleSync` renders around every screen. If its `useTranslation` call
  suspended while the default namespace was unavailable, it would suspend the provider's whole
  subtree; with `useSuspense: false` it never does, so a missing or slow namespace can hold back
  only the components that asked for it. `i18n-provider.test.tsx` — "renders children even when the
  active locale has no reachable shell copy" — is the test that tells the two apart.
- **`useLocale` returns the clamped resolved locale, not `i18n.language`.** `i18n.language` is the
  requested or detected tag — `ru-RU` after `changeLanguage('ru-RU')`, `en-US` from a browser — and
  is typed `string`, so nothing would stop an unsupported tag reaching `Intl`. `useLocale` narrows
  `resolvedLanguage` with `isSupportedLocale` and falls back to `DEFAULT_LOCALE` before a language
  has resolved. Dates are formatted with `Intl.DateTimeFormat` against that value and no date
  library: `Intl` reads the platform's CLDR data, so Russian dates cost nothing in the bundle. A
  library earns its place when relative time or date arithmetic is needed, behind a
  `shared/lib/format-date` helper, with the domain model unchanged.
- **Detection order is query string, then `localStorage`, then the browser, cached under
  `app.locale`.** `?lng=ru` is what makes a non-English locale reachable, and verifiable in a
  browser, while there is no switcher. The detector caches the tag it detected (`en-US`), not the
  resolved locale (`en`); both resolve to the same language. Because the first visit caches the
  browser's language and storage outranks the browser, a visitor who later changes their browser
  language keeps the stored one until `?lng=` or `setLocale` replaces it. `load: 'languageOnly'`
  collapses every regional tag onto its base language, so regional variants such as British spelling
  would need that option changed. Detection runs only when `createI18n()` builds the instance, so a
  `?lng=` reached through client-side navigation takes effect on the next full page load.
- **Translation JSON is a local, build-time asset, not a wire payload.** It crosses no trust
  boundary and gets no runtime schema validation. Server-supplied display strings are DTO fields,
  mapped into the domain model like any other field (see [HTTP transport](./http-transport.md));
  they do not belong in these namespaces, which are for copy the frontend owns. When the backend
  needs the active locale, send `useLocale().locale` as an `Accept-Language` header through
  `HttpRequestOptions.headers` at the call site — and include it in the query key if it changes the
  response — never by importing i18next inside a mapper. The `BearerTokenSource` port is not the
  place for it: it owns `Authorization` and nothing else. There is no general request-header hook.
- **Validation messages are resolved strings, and their memo keys on `t`.** The schema factory takes
  messages as arguments, so the rules module has no i18n import and is testable with plain literals.
  The resolving hook (`useCredentialsSchema`, `useUserNameChangeSchema`) depends on `[t]` rather
  than `i18n.language` because react-i18next's `t` is already stable per language and namespace
  load, so `[t]` is the honest dependency and needs no suppression. That matters here: the lint
  config runs two exhaustive-deps rules (`react-hooks/exhaustive-deps` and
  `@eslint-react/exhaustive-deps`) with `reportUnusedDisableDirectives` set to error, so a
  single-rule disable comment both fails to silence the second rule and cannot be padded.
- **The crash fallback is the one piece of copy outside `shared/i18n`.** `AppCrashFallback`
  hardcodes English because it renders above `AppProviders`, the component that constructs the i18n
  instance: if i18n is what failed, there is nothing left to translate a message with. See
  [Error handling and reporting](./error-handling.md). Nothing lints for string literals in JSX, so
  the rule that no component below `app` holds one is kept by review.

## Testing

Tests get i18n from `vitest.setup.ts`. Before each test in a jsdom file it clears `localStorage` and
registers a fresh English instance —
`createI18n({ locale: DEFAULT_LOCALE, detection: { order: [], caches: [] } })` — as react-i18next's
global with `setI18n`; after each test it removes `lang` and `dir` from `<html>`. `useTranslation`
falls back to that global when no provider is mounted, which is how `home-page.test.tsx` renders
`<HomePage />` bare and asserts on the copy a user reads (`'Add one second'`, `'0 seconds added'`).
The instance is rebuilt per test so a language change cannot leak into the next test, and its
detection and caching are off so it never reads or writes `app.locale` behind a storage assertion's
back. Those steps sit behind `typeof window !== 'undefined'` because the setup file also runs for
the three `// @vitest-environment node` files, where `localStorage` does not exist. The setup file
as a whole is covered in [Unit and component testing](./unit-testing.md).

| File                                                     | Kind        | What it covers                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/i18n/create-i18n.test.ts`                    | unit        | Synchronous initialization; an explicit `locale` beating detection; switching to `ru` changes shell copy without awaiting, then streams `home`; a stored unsupported `de` falling back to `en`; `en-GB` collapsing to `en`; persistence under `app.locale` and reading it back; Russian plural forms for 1, 3 and 5 |
| `src/shared/i18n/i18n-provider.test.tsx`                 | component   | Rendering children; rendering them when the active locale has no reachable shell copy; the injected instance winning over the global one; `<html lang dir>` set, and updated after `setLocale`                                                                                                                      |
| `src/shared/i18n/use-locale.test.tsx`                    | hook        | Locale and direction; re-render after `setLocale`; `DEFAULT_LOCALE` before a language has resolved                                                                                                                                                                                                                  |
| `src/shared/i18n/registry.test.ts`                       | unit        | The defaults are registered; every locale has a label and a direction; every locale bundles `common`; `isSupportedLocale` accepts every supported code and rejects `de`, `''` and `undefined`                                                                                                                       |
| `src/shared/i18n/lazy-locale-loader.test.ts`             | unit        | Loading `ru/home`; rejecting an unknown language or namespace; rejecting the default locale (the glob drift guard) and `common` in every locale; every English key family present in Russian, plural suffixes stripped                                                                                              |
| `src/app/entrypoint/app.test.tsx`                        | integration | A cold load with `app.locale` set to `ru` renders the Russian home button through the real composition root and sets `<html lang="ru">`                                                                                                                                                                             |
| `src/pages/home/ui/home-page.test.tsx`                   | component   | Heading; the `environment` copy with its `<code>` elements; the elapsed `status` region's name and value; the plural switching from `0 seconds added` to `1 second added`                                                                                                                                           |
| `src/shared/lib/format-duration/format-duration.test.ts` | unit        | `mm:ss` and `hh:mm:ss` at their boundaries; `RangeError` for negative and non-finite input                                                                                                                                                                                                                          |

`home-page.test.tsx` stands up no router, deliberately: it is the executable proof that a page below
`app` reads no route state, so keep it that way. It also queries `heading` at `level: 1` with no
name, so a second `<h1>` would make it throw — the page renders exactly one `<main>` and one `<h1>`,
and a second `<main>` is a landmark ambiguity no gate catches.

```bash
npm test
npx vitest run src/shared/i18n
npx vitest run src/pages/home/ui/home-page.test.tsx
npx vitest run src/app/entrypoint/app.test.tsx
npm run typecheck
npm run test:e2e
```

`npm test` runs the whole Vitest suite. `npm run typecheck` is where a mistyped key, an unlisted
namespace or a locale without bundled `common` fails. `npm run test:e2e` drives the production build
in Chromium with `locale: 'en-US'` pinned in `playwright.config.ts`; `e2e/app-shell.spec.ts` asserts
the not-found page's `common` copy (`Page not found`, `Back to home`) — see
[End-to-end testing](./e2e-testing.md).

## Known limitations

- **No language switcher, and `setLocale` has no runtime caller.** `useLocale().setLocale` is called
  only from `use-locale.test.tsx` and `i18n-provider.test.tsx`; no mounted component renders a
  language control. A visitor can change language only with `?lng=` on a full page load, after
  which the choice is cached. The endonym `label` in `LOCALES` is likewise read only by
  `registry.test.ts`.
- **A failed lazy namespace degrades silently and for the rest of the visit.** The screen falls back
  to English copy, nothing subscribes to i18next's `failedLoading` event, so the `ErrorReporter`
  never hears of it, and i18next does not retry the namespace until the next full page load.
- **Two screens are English in every locale.** `AppCrashFallback`, by design (above), and TanStack
  Router's built-in error component — "Something went wrong!" with a "Show Error" toggle — which
  renders for an uncaught route error because no route sets `errorComponent`. See
  [Error handling and reporting](./error-handling.md).
- **Nothing end to end runs a non-English locale.** `playwright.config.ts` pins `locale: 'en-US'`
  and no spec uses `?lng=` or asserts Russian copy, so the production build's `home-*.js` chunk is
  never fetched under test. The lazy path is exercised only by Vitest (`app.test.tsx`,
  `lazy-locale-loader.test.ts`) through Vite's test transform.
- **Component tests below `app` render English only.** The `createI18n` ban and the `react-i18next`
  ban apply to test files too, so a test in `pages`, `features`, `entities` or `shared` cannot build
  a Russian instance; non-English rendering is tested only inside `src/shared/i18n` and in
  `app.test.tsx`.
- **The drift guard is hand-maintained and compares key families, not plural forms.**
  `TRANSLATED_NAMESPACES` lists `common` and `home` for Russian explicitly, so a new namespace or
  locale is unguarded until it is added. Because plural suffixes are stripped before comparing, a
  locale missing one of its plural forms still passes; only the Russian plural case in
  `create-i18n.test.ts` pins forms, and only for `ru/home`.
- **Deep imports into `shared/i18n` from another `shared` segment are unfenced.** ESLint carries no
  `^@/shared/i18n/` pattern (it has one for `@/shared/api/` and one for `@/shared/observability/`),
  and steiger skips same-layer imports, so a module in `shared/ui` could import
  `@/shared/i18n/registry` with every gate green. A deep import from `pages`, `features` or
  `entities` is rejected by steiger. [Architecture boundaries](./architecture-boundaries.md) covers
  the same gap for `shared/config`.
- **The worked example carries the only lazy namespace, plural and `<Trans>`.** `home` is the only
  namespace any locale loads lazily, `secondsAdded` the only plural, and `HomePage` the only
  `<Trans>` consumer. Retiring `pages/home` touches `bundled-resources.ts`, `registry.ts`
  (`NAMESPACES`), `i18next.d.ts`, `create-i18n.test.ts`, `lazy-locale-loader.test.ts` and
  `app.test.tsx`, which all name the `home` namespace or its copy; move those demonstrations to the
  replacement slice's namespace rather than deleting them.
- **No right-to-left locale has been rendered.** `TextDirection` admits `'rtl'` and
  `DocumentLocaleSync` writes whatever `dir` the registry holds, but both registered locales are
  `ltr`, so no test has rendered `dir="rtl"`.
