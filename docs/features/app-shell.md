# App shell

> **Status:** Complete · **Layers:** app, widgets, features, shared, outside layers · **Verified against:** `65a99bc`

## Purpose

Every screen in an application shares some chrome that belongs to the application rather than to any
one route — a banner carrying its name, and the controls that are always available. Until this step
the repo had nowhere to put that chrome: a `pages` slice owns exactly one screen, and `src/widgets`
did not exist, so a control needed on every route would have had to be copied into each page. The
app shell opens that place. `widgets/app-header` is a `<header>` banner the root layout mounts once,
above the router outlet, so it renders on every route without any screen knowing about it; it is
also this repo's worked example of the `widgets` layer and the reference for the next block that
belongs to the application instead of to a screen. Its first occupant, `features/switch-locale`,
gives `useLocale().setLocale` its first runtime caller — before it, a visitor could change language
only with a `?lng=` query parameter on a full page load.

## How it works

Four terms from this repo run through the walkthrough. Feature-Sliced Design (FSD) stacks code in
_layers_ — the top-level folders under `src/`, which may import only downward in the order `app` →
`pages` → `widgets` → `features` → `entities` → `shared`. A _slice_ is one screen, block, user
action or business noun inside a layer (`widgets/app-header`, `features/switch-locale`), and a
_segment_ is a purpose-named folder inside a slice (`ui/` for components, `model/` for domain types,
state and hooks). A slice's `index.ts` is its _public API_ — the only file another slice may import.
The _composition root_ is `src/app/entrypoint/**` plus the route modules in `src/app/routes/**`: the
one place that constructs concretes, reads configuration and wires things together
([Composition root](./composition-root.md)).

1. **Bootstrap.** `src/main.tsx` mounts `<App />`. `src/app/entrypoint/app.tsx` wraps `AppProviders`
   in the top-level `ErrorBoundary`; `AppProviders` builds the i18next instance in a `useState` lazy
   initializer (`createI18n()`) and publishes it through `I18nProvider`, then renders
   `AppRouterProvider`, which renders TanStack Router's `RouterProvider`. The shell needs nothing
   else from the provider tree: `LocaleSwitcher` reads i18n through context, and `AppHeader` reads
   no context at all.
2. **The root layout mounts the shell.** `src/app/routes/__root.tsx` declares the root route with
   `createRootRouteWithContext<AppRouterContext>()({ component: RootLayout, notFoundComponent: NotFoundPage })`.
   `RootLayout` renders `<AppHeader appName={appConfig.name} />`, then `<Outlet />`, then
   `TanStackRouterDevtools`. The root route is the ancestor of every route in the generated tree, so
   the banner is rendered once and stays mounted: navigation swaps what the outlet renders beneath
   it, never the header itself.
3. **The widget composes, and decides nothing.** `AppHeader` takes a single prop,
   `readonly appName: string`, and renders a `<header>` containing a `<span>` with that name and
   `<LocaleSwitcher />`. It holds no state, calls no hook and reads no configuration; its whole job
   is layout and composition. `<header>` carries the implicit `banner` ARIA role, which is how every
   test and the end-to-end spec find the shell (`getByRole('banner')`).
4. **The feature reads the current locale.** `LocaleSwitcher` calls `useLocale()` from
   `@/shared/i18n` and destructures `{ locale, setLocale }`. It maps `SUPPORTED_LOCALES`
   (`['en', 'ru']`) to one `Button` each, keyed by the locale code, labelled with the endonym
   `LOCALES[candidate].label` (`English`, `Русский`). The button for the active locale gets
   `variant="default"`, the others `variant="outline"`; every button gets `size="sm"`,
   `aria-pressed={isActive}` and `lang={candidate}`, so assistive technology both reports which one
   is selected and pronounces each label in the language it names.
5. **A click changes the language.** The `onClick` handler calls `setLocale(candidate)`, which is
   `useLocale`'s `useCallback` wrapper around `i18n.changeLanguage(next)`. Three consequences
   follow, and none of them is this feature's code: every `useTranslation` consumer re-renders
   against the new bundle, lazily fetching the namespace if it is not bundled; `DocumentLocaleSync`
   inside `I18nProvider` writes `document.documentElement.lang` and `dir` in an effect; and the
   i18next browser language detector caches the choice in `localStorage` under `app.locale`, so the
   next visit starts in it. [Internationalization](./internationalization.md) owns all three.
6. **The pressed state moves.** `useLocale` recomputes `locale` from `i18n.resolvedLanguage` on the
   re-render, so `isActive` flips for two buttons at once: the new locale becomes `default` and
   `aria-pressed="true"`, the previous one `outline` and `aria-pressed="false"`.
7. **The failure path that matters: an unrecognised language.** `useLocale` guards
   `i18n.resolvedLanguage` with `isSupportedLocale` and falls back to `DEFAULT_LOCALE` (`'en'`).
   Whatever i18next resolved — a regional tag, a cached value from an older build, nothing at
   all — exactly one button is pressed, and the shell never renders a row with no selection.
8. **The failure path the shell is immune to: missing copy.** The header renders no translated
   string. Its only text is the application name, which is configuration, and the locale labels,
   which are endonyms rather than translations. A namespace that fails to load leaves the screen in
   fallback copy but cannot leave the shell half-translated or blank of labels.

## Architecture

The shell defines no port. Sign-in, sign-out and the transport each program against an interface
whose concrete the composition root binds; this feature is composition rather than machinery, and
its only seam is a prop. `AppHeader` receives the application name as `appName` instead of importing
`appConfig`, so the widget has no opinion about where the name comes from and its test needs no
module mocking — the repo's convention that configuration is read at the composition seam and passed
down ([Configuration and environment](./configuration.md)). The one sanctioned exception to that
convention lives elsewhere: `src/entities/session/model/session-token-source.ts` reads `appConfig`
directly to name its single-flight refresh lock. Imports run strictly downward, each crossing
through the importee's public `index.ts`: `src/app/routes/__root.tsx` → `@/widgets/app-header` →
`@/features/switch-locale` → `@/shared/i18n` and `@/shared/ui/button`. The last of those is not a
matter of taste — ESLint's `no-restricted-imports` bans `react-i18next`, `i18next` and its plugins
everywhere outside `src/shared/i18n` (`I18N_VENDOR_IMPORT_PATHS` in `eslint.config.js`), so
`useLocale` is the only way a `features` slice can reach the active language at all
([Architecture boundaries](./architecture-boundaries.md#import-fences)).

| Component                            | Layer                         | Responsibility                                                                                                                                       | File                                                                         |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `RootLayout`, `Route`                | `app/routes`                  | Mounts `<AppHeader appName={appConfig.name} />` above `<Outlet />` on the root route, so the shell renders on every route                            | `src/app/routes/__root.tsx`                                                  |
| `AppProviders`                       | `app/entrypoint`              | Constructs the i18next instance (`createI18n()`) and publishes it through `I18nProvider`, the only context the shell needs                           | `src/app/entrypoint/app-providers.tsx`                                       |
| `appConfig`                          | `shared/config`               | Holds `name`, the string the root layout hands the widget; the only module that reads `import.meta.env`                                              | `src/shared/config/app-config.ts`                                            |
| `AppHeader`, `AppHeaderProps`        | `widgets/app-header · ui`     | The `<header>` banner: the application name beside the shell's controls. Presentational — no state, no hooks, no config                              | `src/widgets/app-header/ui/app-header.tsx`                                   |
| `LocaleSwitcher`                     | `features/switch-locale · ui` | One `Button` per supported locale, labelled with its endonym; calls `setLocale` and reflects the active locale                                       | `src/features/switch-locale/ui/locale-switcher.tsx`                          |
| `useLocale`, `UseLocaleResult`       | `shared/i18n`                 | The published locale abstraction: `{ locale, dir, setLocale }`, hiding i18next behind the vendor fence                                               | `src/shared/i18n/use-locale.ts`                                              |
| `SUPPORTED_LOCALES`, `LOCALES`       | `shared/i18n`                 | The registry the switcher iterates: the locale codes and their endonym labels and text directions                                                    | `src/shared/i18n/registry.ts`                                                |
| `I18nProvider`, `DocumentLocaleSync` | `shared/i18n`                 | Publishes the instance and mirrors the active locale onto `<html lang>` / `<html dir>` after a switch                                                | `src/shared/i18n/i18n-provider.tsx`                                          |
| `Button`, `buttonVariants`           | `shared/ui`                   | The Radix + CVA primitive and its `default` / `outline` variants the switcher selects between                                                        | `src/shared/ui/button/button.tsx`, `src/shared/ui/button/button-variants.ts` |
| `fsd/insignificant-slice` override   | `outside layers`              | Exempts `./src/features/switch-locale/**`, whose one consuming slice is `widgets/app-header` (see [Design decisions](#design-decisions--trade-offs)) | `steiger.config.ts`                                                          |
| `jsx-a11y` rule set                  | `outside layers`              | The 36 accessibility rules that shape the markup — among them `no-redundant-roles` and `prefer-tag-over-role`, which require the semantic `<header>` | `.oxlintrc.json`                                                             |
| `application shell` spec             | `outside layers`              | Asserts the banner is visible in a real browser after a client-side navigation back to `/`                                                           | `e2e/app-shell.spec.ts`                                                      |

## Public surface

### Routes

The shell adds no route of its own. It is mounted by the root route, which is the ancestor of every
route in the generated tree (`src/app/router/route-tree.gen.ts`), so it renders above all of them:

| Path               | Auth            | Purpose                                                                    |
| ------------------ | --------------- | -------------------------------------------------------------------------- |
| `/`                | `public`        | `HomePage` — the placeholder demo screen (`src/app/routes/index.tsx`)      |
| `/sign-in`         | `public`        | `SignInPage` (`src/app/routes/sign-in.tsx`); see [Sign-in](./sign-in.md)   |
| `/users/$userId`   | `authenticated` | `UserProfilePage`, behind the guard on `src/app/routes/_authenticated.tsx` |
| Any unmatched path | `public`        | `NotFoundPage`, the root route's `notFoundComponent`                       |

A route is `authenticated` when its module sits under `src/app/routes/_authenticated/`
([Authenticated route guard](./route-guard.md)). The header is not conditioned on any of this: it is
a sibling of `<Outlet />`, not of a route's component, so nothing in `src/app/routes/**` can opt out
of it and nothing needs to opt in.

### Slice public APIs

`@/widgets/app-header` (`src/widgets/app-header/index.ts`):

| Export      | Kind      | Contract                                                                                                                                                   |
| ----------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppHeader` | component | Props `{ readonly appName: string }`. Renders a `<header>` (implicit `banner` role). Needs an initialized i18n instance above it, for the switcher inside. |

`AppHeaderProps` is deliberately not exported: the props interface is an implementation detail of
the one component the barrel publishes.

`@/features/switch-locale` (`src/features/switch-locale/index.ts`):

| Export           | Kind      | Contract                                                                                                                                                        |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LocaleSwitcher` | component | No props. Renders one button per entry of `SUPPORTED_LOCALES` and drives `useLocale().setLocale`. Needs an initialized i18n instance above it (`I18nProvider`). |

The slice has no `model/` segment and exports nothing else — no hook, no props interface, no
status type. Its whole contract is "render me somewhere and the visitor can change language".

`@/shared/i18n` (`src/shared/i18n/index.ts`), the two exports this feature required the barrel to
add:

| Export              | Kind  | Contract                                                                                                                       |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SUPPORTED_LOCALES` | const | `readonly ['en', 'ru']` — the iteration order, and therefore the left-to-right order of the buttons                            |
| `LOCALES`           | const | `Record<Locale, LocaleDescriptor>`, each `{ readonly label: string; readonly dir: TextDirection }`; the switcher reads `label` |

Before this step the barrel exported `DEFAULT_LOCALE`, the `Locale` type, `useLocale`, `createI18n`,
`I18nProvider` and re-exported `Trans` / `useTranslation`. Publishing the registry through the
barrel rather than importing `@/shared/i18n/registry` keeps the segment's public API a real boundary;
`LocaleDescriptor`, `TextDirection` and `isSupportedLocale` remain internal
([Internationalization](./internationalization.md#public-surface)).

## Configuration

This feature reads no environment variable. `src/shared/config/app-config.ts` is the only module in
the repo that touches `import.meta.env`, and the sole variable declared in `env.d.ts` and
`.env.example` — `VITE_API_BASE_URL` — belongs to the transport, not to the shell. What the shell
does take, it takes as props and as registry constants:

| Variable / option               | Default                                                                           | Meaning                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `appName` prop                  | `appConfig.name`, passed by `RootLayout`                                          | The text in the banner. The widget's only input, and the seam that keeps configuration out of `widgets`          |
| `appConfig.name`                | `'frontend-boilerplate'`, a literal in `src/shared/config/app-config.ts`          | Not environment-driven: renaming the app is an edit to that file, which also renames the session refresh lock    |
| `SUPPORTED_LOCALES`             | `['en', 'ru']` (`src/shared/i18n/registry.ts`)                                    | How many buttons the switcher renders, and in what order                                                         |
| `LOCALES[locale].label`         | `English`, `Русский`                                                              | Each button's accessible name — an endonym, identical in every locale                                            |
| `variant` on the pressed button | `'default'`                                                                       | The selected state: `bg-primary text-primary-foreground` (see [Design decisions](#design-decisions--trade-offs)) |
| `variant` on the others         | `'outline'`                                                                       | The unselected state: `border bg-background shadow-xs`                                                           |
| `size` on every button          | `'sm'` (`h-8 gap-1.5 rounded-md px-3`)                                            | Keeps the row inside the header's `py-4` band                                                                    |
| i18next detection `order`       | `['querystring', 'localStorage', 'navigator']` (`src/shared/i18n/create-i18n.ts`) | Which button is pressed on first paint, before the visitor touches anything                                      |
| i18next detection `caches`      | `['localStorage']`, key `app.locale`                                              | Where a click is remembered, so the choice survives a reload                                                     |
| `lng` query parameter           | absent                                                                            | Overrides the cached choice on a full page load; the pre-shell way to change language                            |

## Usage & extension

### Use it

Nothing to do. The shell is mounted in `src/app/routes/__root.tsx`, so every route already renders
beneath it. `npm run dev` and open any path.

### Add a second occupant to the shell

The header is a composition point: adding a control means composing its slice, not teaching the
widget anything. Assume a new `features/switch-theme` slice whose barrel exports `ThemeToggle`. The
whole change to `src/widgets/app-header/ui/app-header.tsx` is:

```tsx
import { LocaleSwitcher } from '@/features/switch-locale';
import { ThemeToggle } from '@/features/switch-theme';

interface AppHeaderProps {
  readonly appName: string;
}

export function AppHeader({ appName }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
      <span className="text-sm font-semibold tracking-tight">{appName}</span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
```

Add a case to `src/widgets/app-header/ui/app-header.test.tsx` that asserts composition — the control
reachable _through_ the banner, not merely co-present on the page:

```tsx
it('offers the theme toggle inside the banner', () => {
  render(<AppHeader appName="frontend-boilerplate" />);

  const banner = screen.getByRole('banner');

  expect(within(banner).getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
});
```

Two follow-ups are not optional. If the new slice's only consumer is this widget, `npm run arch`
fails with `fsd/insignificant-slice` and the slice's glob joins the override in `steiger.config.ts`.
And if the control is the kind of promise a reader would expect the shell to keep, pin it in
`src/app/entrypoint/app.test.tsx` rather than only in the widget's own test — see
[Testing](#testing) for why.

### Add a second widget

Nothing about the `widgets` layer needs configuring: every glob in `eslint.config.js` already names
it, steiger knows the layer, and `npm run arch:graph` draws it. Create
`src/widgets/app-footer/ui/app-footer.tsx` and `src/widgets/app-footer/index.ts`
(`export { AppFooter } from './ui/app-footer';`), then mount it from the same seam —
`src/app/routes/__root.tsx` in full:

```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { NotFoundPage } from '@/pages/not-found';
import { appConfig } from '@/shared/config';
import { AppFooter } from '@/widgets/app-footer';
import { AppHeader } from '@/widgets/app-header';

import type { AppRouterContext } from '../router/app-router-context';

function RootLayout() {
  return (
    <>
      <AppHeader appName={appConfig.name} />
      <Outlet />
      <AppFooter />
      <TanStackRouterDevtools position="bottom-left" initialIsOpen={false} />
    </>
  );
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
```

A block only one screen renders belongs in that page's `ui/` segment instead; steiger's
`fsd/insignificant-slice` is what enforces the difference.
[Architecture boundaries](./architecture-boundaries.md#add-a-slice) walks the whole sequence,
including the error text each gate prints.

### Add a language to the switcher

The switcher needs no change: it renders whatever the registry holds. Extend
`src/shared/i18n/registry.ts` —

```ts
export const SUPPORTED_LOCALES = ['en', 'ru', 'fr'] as const;

export const LOCALES = {
  en: { label: 'English', dir: 'ltr' },
  ru: { label: 'Русский', dir: 'ltr' },
  fr: { label: 'Français', dir: 'ltr' },
} as const satisfies Record<Locale, LocaleDescriptor>;
```

— and add the locale's JSON files and its `BUNDLED_RESOURCES` entry;
[Internationalization](./internationalization.md#add-a-locale) has the full recipe. A third button
appears, labelled `Français`, with `lang="fr"`, and `npm run typecheck` fails until every registry
entry is complete.

## Design decisions & trade-offs

- **The widget takes `appName` as a prop instead of importing `appConfig`.** Configuration is read
  at the composition seam and passed down — `src/app/routes/__root.tsx` reads `appConfig.name`, the
  widget takes a string. The widget therefore knows nothing about environment, defaults or Vite, and
  `app-header.test.tsx` renders it with a literal and needs no module mock, no
  `vi.stubEnv` and no provider. The convention has exactly one sanctioned exception in this repo,
  `src/entities/session/model/session-token-source.ts`, which reads `appConfig` to name its
  refresh lock; nothing lints the rule, so it is verified by reading (`grep -rn "@/shared/config" src`).
- **`<header>` rather than `<div role="banner">`.** The semantic element carries the `banner` role
  implicitly, and oxlint's `jsx-a11y/no-redundant-roles` and `jsx-a11y/prefer-tag-over-role` (both
  `error` in `.oxlintrc.json`, run by `npm run lint:a11y`) reject the alternative. The payoff is
  that every test and the end-to-end spec address the shell the way assistive technology does, with
  `getByRole('banner')` — an assertion that survives any restructuring of the markup inside.
- **Endonyms, so the feature adds zero translation keys.** `English` and `Русский` come from
  `LOCALES[candidate].label` and are the same in every locale: a language is named in itself, which
  is what a visitor who cannot read the current language needs to see. `en/common.json` and
  `ru/common.json` are untouched by this feature, so there is no copy to keep in sync and no key
  that can drift between the two files as locales are added. A translated label (`Russian` /
  `Русский` depending on the active language) would be actively worse for the one user it matters
  for.
- **`default` / `outline`, not the obvious `secondary` / `ghost`.** The selected state has to be
  distinguishable without reading text, which WCAG 2.2 SC 1.4.11 (Non-text Contrast) puts at 3:1.
  `secondary` paints `bg-secondary` — `oklch(0.97 0 0)` in `src/shared/ui/theme.css` — on the page's
  `oklch(1 0 0)` ground: about **1.09:1**, a difference most people cannot see and some cannot see
  at all, while `ghost` is transparent until hovered, so the unselected buttons are bare text. The
  shipped pair puts `bg-primary` (`oklch(0.205 0 0)`, roughly 18:1 against the same ground) against
  a bordered `bg-background`, so selection reads at a glance. The cost is recorded under
  [Known limitations](#known-limitations): `outline` has a border that `default` does not.
- **No `role="group"`, weighed rather than forced.** A labelled group would tell a screen-reader
  user what the two buttons are for. `<div role="group" aria-label="…">` is rejected by oxlint's
  `jsx-a11y/prefer-tag-over-role`, which wants the semantic element. The element that would
  pass — `<fieldset>` with a visually-hidden `<legend>` — works, and was rejected for a different
  reason: the legend is copy a visitor reads, so it must be translated, which reintroduces the
  `common.json` keys this design exists to avoid, in both locales and in every locale added later.
  The trade is two unlabelled-but-self-describing buttons (each says which language it is, and
  `aria-pressed` says which is active) against a translated label plus permanent key maintenance.
  A `shared/ui/toggle-group` primitive would settle it properly; see
  [Known limitations](#known-limitations).
- **Toggle buttons with `aria-pressed`, not radios.** `aria-pressed` on a `<button>` is the smallest
  markup that conveys selection, needs no `Button` change and no new primitive. Radio semantics
  (`role="radiogroup"` with arrow-key roving focus) model "pick one of a set" more precisely and
  would fix the no-op described under [Known limitations](#known-limitations), but they are a
  primitive's worth of behaviour — roving `tabIndex`, arrow and Home/End handling, focus
  management — which belongs in `shared/ui`, not hand-rolled inside a `features` slice.
- **`switch-locale` is a single-file slice with no `model/` segment.** There is no `use-switch-locale`
  hook because there is nothing for it to encapsulate: `useLocale` from `@/shared/i18n` is already
  the published abstraction, and the ESLint fence that bans `react-i18next` outside `shared/i18n`
  guarantees nothing lower can reach past it. Adding a hook that returned `useLocale()` unchanged
  would be a layer of indirection with no seam behind it.
- **No container / `-view` split either.** `sign-in`, `sign-out` and `update-user-name` each split
  a container from a presentational `-view`, and that pattern is not a blanket rule — it exists to
  isolate state and effect hooks that need providers or asynchronous work, so the view can be
  rendered and asserted against plain props. `LocaleSwitcher` has no mutation, no pending state and
  no outcome to render; its only dependency is the i18n instance that `vitest.setup.ts` installs for
  every test. Splitting it would produce a container that forwards two values and a view with
  nothing to decide.
- **A header, therefore a widget — and the layer arrives with its first slice.** A block composed
  from `features` and shown on more than one screen is what the `widgets` layer is for; a block one
  page renders stays in that page's `ui/` segment. `src/widgets/` was created in the same change as
  `app-header`, never as an empty folder with a `.gitkeep`: the empty directory would have passed
  every gate while advertising structure that did not exist.
- **`fsd/insignificant-slice` is off for `features/switch-locale`, and needs no entry for
  `widgets/app-header`.** steiger flags a slice referenced by exactly one other slice, which the
  switcher is; `npm run arch` prints
  `This slice has only one reference in slice "widgets/app-header". Consider merging them.` The rule
  targets premature slicing, and a feature with one genuine host is not that, so the slice's glob
  joins `sign-in`, `sign-out` and `update-user-name` in the override in `steiger.config.ts` — named
  path by path rather than switching the rule off for `./src/features/**`, so the next
  single-consumer slice is still flagged. `widgets/app-header` needs no exemption at all: its only
  importer is `src/app/routes/__root.tsx`, and `app` is an unsliced layer the rule never counts.
  Once a second slice imports the switcher, delete its entry.
- **Mounted in the root layout, not in each page.** Putting the header in `RootLayout` makes
  "on every route" a structural fact rather than a convention every new screen must remember, and
  keeps the shell mounted across navigations so it neither remounts nor loses state. The cost is
  that no page-level or widget-level test can prove the mount — deleting the `<AppHeader />` line
  leaves every slice test green — which is why the promise is pinned one layer up, in
  `src/app/entrypoint/app.test.tsx`.

## Testing

| File                                                     | Level                 | What it covers                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/switch-locale/ui/locale-switcher.test.tsx` | Component             | Three cases: every supported locale is offered under its own name with the active one `pressed: true` and the other `pressed: false`; clicking `Русский` moves the pressed state to it and off `English`; each button carries the `lang` it names (`en`, `ru`)                                                                  |
| `src/widgets/app-header/ui/app-header.test.tsx`          | Component             | Two cases: the `banner` contains the application name; the switcher is reachable through the banner — the second uses `within(banner)` so it asserts composition rather than co-presence on the page                                                                                                                            |
| `src/app/entrypoint/app.test.tsx`                        | Integration (jsdom)   | Two journeys through the real provider tree and router: `renders the application header with the configured name`, and `switches the application language from the app-shell header`, which clicks `Русский` in the header and then finds the home page's Russian copy (`Добавить секунду`) and `documentElement.lang === 'ru'` |
| `e2e/app-shell.spec.ts`                                  | End-to-end (Chromium) | Visits an unknown path, follows `Back to home`, and asserts `await expect(page.getByRole('banner')).toBeVisible();` after the client-side navigation — the only check that the shell reaches a real browser at all                                                                                                              |

The two cases in `app.test.tsx` are the ones that actually pin this step's promises: deleting the
`<AppHeader />` line from `src/app/routes/__root.tsx` fails them and nothing else, because
`RootLayout` is still invoked and both slice suites render their components directly. Be precise
about their reach, though. `renders the application header with the configured name` renders `<App />`,
which lands on `/`, and asserts `toHaveTextContent('frontend-boilerplate')` — a literal equal to
`appConfig.name`, so replacing `appName={appConfig.name}` with the same hardcoded string in
`__root.tsx` would keep it green. What these tests pin is that the shell is mounted at all, on the
route they render; that it is on _every_ route is structural, a consequence of living in
`__root.tsx` rather than of any assertion.

Both component suites render without an `I18nProvider`, because `vitest.setup.ts` installs an
English instance with `setI18n(createI18n({ locale: DEFAULT_LOCALE, detection: { order: [], caches: [] } }))`
before each test, clears `localStorage`, and strips `lang` / `dir` from `<html>` afterwards. That is
also why the switcher's click test is meaningful in isolation: `setLocale` reaches a real i18next
instance, not a stub.

Coverage is enforced per file — `thresholds.perFile` is `true` at 90% for lines, functions, branches
and statements (`vite.config.ts`) — and both new source files sit at 100%:
`app-header.tsx` at 1/1 lines and 1/1 functions, `locale-switcher.tsx` at 5/5 lines, 3/3 functions
and 2/2 branches, all from their own suites.

```bash
npm test
npx vitest run src/widgets/app-header src/features/switch-locale
npx vitest run src/app/entrypoint/app.test.tsx
npm run test:e2e
npm run lint:a11y
```

`npm run lint:a11y` is the gate behind the markup decisions above: `node scripts/a11y-rules.mjs --check`
compares `.oxlintrc.json` against oxlint's own schema and fails if any `jsx-a11y` rule is missing,
relaxed or stale, then `oxlint --deny-warnings src` runs them. The runners and conventions are described in
[Unit and component testing](./unit-testing.md) and [End-to-end testing](./e2e-testing.md).

## Known limitations

- **Activating the already-pressed button is a no-op, and silently so.**
  `setLocale(currentLocale)` calls `changeLanguage` with the language already active; nothing
  changes and nothing is announced. A screen-reader user who activates the pressed button perceives
  no response at all — the standard argument for radio semantics, where the selected option is not
  separately activatable, over toggle semantics. It is a real cost of the `aria-pressed` choice
  recorded above, not an oversight.
- **The row shifts by about two pixels when the selection moves.** `outline` includes a `border`
  that `default` does not, so a button gains or loses one pixel on each side as it becomes selected
  and the row re-flows. Harmless, but visible if the switch is used repeatedly. A
  `shared/ui/toggle-group` primitive with a consistent box would remove it.
- **On `/` the application name appears twice** — once in the banner and once as `HomePage`'s
  `<h1>`, both from `appConfig.name`. Accepted rather than fixed: `HomePage` is placeholder demo
  content that an adopter replaces with a real screen, and it is the page's `<h1>` that goes, not
  the banner.
- **The shell is now the first tab stop on every route.** It is the first focusable content above
  `<main>`, so keyboard and screen-reader users traverse it before reaching the page. Two buttons do
  not justify a skip link yet; the moment the shell grows navigation, it will need
  `<a href="#main">` as the first focusable element and an `id` on the page's `<main>`.
- **A suspending screen takes the shell down with it.** The application's only `Suspense` boundary
  is `<Suspense fallback={null}>` in `src/app/entrypoint/app-providers.tsx`, and it sits _above_
  `I18nProvider`, the router and therefore the header. `bundled-resources.ts` bundles `ru/common`
  but not `ru/home`, and `HomePage` reads the `home` namespace through a suspending
  `useTranslation('home')`, so a switch to Russian on `/` can blank the banner along with the screen
  until the lazy namespace resolves. The header itself never suspends — `useLocale` passes
  `useSuspense: false` — it is simply inside someone else's boundary. A boundary placed between the
  shell and `<Outlet />` would keep the chrome on screen.
- **A session-aware shell is blocked, not deferred by choice.** Moving `SignOutButton` into the
  header and showing it only while a session is live needs a component below `app` to read session
  status, and nothing publishes it: `src/entities/session/index.ts` exports the `SessionObserver`
  type and `toSessionObserver`, but there is no `SessionObserverProvider` and no `useSessionStatus`
  hook anywhere in `src/`. Header navigation to the signed-in user's own profile is blocked for a
  second reason — `entities/user` exposes only `createUserQueries(httpClient).detail(userId)`, with no
  `/me` query, so nothing knows the current user's id.
- **The no-group-label and no-op-on-active trade-offs both wait on one primitive.** A
  `shared/ui/toggle-group` built on Radix's `ToggleGroup` — `radix-ui` is already a direct
  dependency, and `shared/ui/button` already imports `Slot` from it — would supply group semantics,
  roving focus and a single-selection model, and would retire both trade-offs at once. It does not
  exist today.
- **The shell's composition claim has only one occupant behind it.** A header that hosts exactly one
  feature is not yet evidence that it composes well. A theme toggle is the natural second
  occupant — `src/shared/ui/theme.css` already defines the dark palette — and the first real test of
  the claim.
