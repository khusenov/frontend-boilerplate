# Notifications

> **Status:** Complete · **Layers:** app, features, shared, outside layers · **Verified against:** `9a7d7af`

## Purpose

A successful action often deserves a word — "Name updated." — that nobody has to act on and that
should not push the layout around. Before this capability existed, each feature that wanted one
invented its own inline live region, with its own markup and its own dismissal rule, and the next
feature would have copied it or imported a toast library straight into a component. The
`shared/notifications` segment gives that transient feedback one port, `Notifier`, beside the
repository's other cross-cutting ports (`HttpClient`, `ErrorReporter`, `ThemeController`): a
feature raises a message through `useNotifier()` without knowing that sonner draws it, a test reads
what was raised from an array, and swapping the toast library is a change to one adapter and one
composition-root binding.

## How it works

**Binding.** `src/app/entrypoint/app-notifier.ts` is a single expression:
`notify = toSafeNotifier(createSonnerNotifier())`. `App` passes it to `AppProviders` as the
`notifier` prop, and `AppProviders` renders `NotifierProvider notifier={notifier}` innermost, around
`children`, so every screen below the router can reach it
([Composition root](./composition-root.md)).

**Mounting the region.** `AppProviders` also renders `NotificationViewport` once, inside
`I18nProvider` and outside the router. The viewport is sonner's `Toaster`, configured with a close
button, a six-second duration, the `bottom-right` position, an accessible region name translated
from `notifications.regionLabel` and a close-button name from `notifications.close`. Its surface
takes its colours from the design system through sonner's own custom properties
(`--normal-bg`, `--normal-text`, `--normal-border`, `--gray2`, `--gray5` pointed at `--popover`,
`--popover-foreground`, `--border` and `--accent`), so it follows the `.dark` class without any
JavaScript ([Design system](./design-system.md)).

**Raising a message.** A component or hook calls `useNotifier()` and invokes the function it
returns with an `AppNotification` — `{ message }`, nothing else. `useNotifier` reads
`NotifierContext` with React's `use` and throws
`useNotifier must be called inside a NotifierProvider` when no provider is above it. The value it
returns is the provider's `toSafeNotifier`-wrapped notifier, so calling it never throws: a notifier
that throws synchronously, or that returns a promise which later rejects, is reported with
`console.error('the notifier failed', failure)` and swallowed. The sonner adapter then calls
`toast.success(message)`, and the message appears in the region, where it stays for six seconds or
until the close button dismisses it.

**The reference consumer.** `useUpdateUserName` takes the already translated `savedMessage` as an
option — `UpdateUserNameForm` resolves `t('updateUserName.saved')` — so the model hook imports no
i18n. It awaits the mutation, returns early if it rejected, and only then calls
`notify({ message: savedMessage })`. A failed save raises nothing: failures stay inline, beside the
form, in `UpdateUserNameAlert`'s `role="alert"` paragraph
([Update user name](./update-user-name.md)).

**Failure paths.** A notifier that throws or rejects is logged and contained, so the action that
raised the message still completes. A component rendered with no `NotifierProvider` above it fails
at once with the `useNotifier` error, which is what the route tests saw until they wrapped their
provider stacks. A `NotificationViewport` hoisted above `I18nProvider` fails silently instead: with
no i18n instance in the browser the region ships as `notifications.regionLabel alt+T` in every
locale, which only the end-to-end locator notices.

## Architecture

The segment follows the repository's port-and-adapter shape: `notifier.ts` declares types only,
`sonner-notifier.ts` is the one module that calls sonner's `toast`, `notifier-context.ts` and
`notifier-provider.tsx` publish the port to React, `to-safe-notifier.ts` is a decorator that makes
any notifier safe to call, and `notification-viewport.tsx` is the one component that renders
sonner's `Toaster`. The composition root, `src/app/entrypoint`, is the only code that constructs a
notifier or mounts the viewport. ESLint enforces both halves: `sonner` may be imported only under
`src/shared/notifications/**`, and below `app` the barrel lets through only `AppNotification`,
`Notifier`, `NotifierProvider` and `useNotifier` — an allow-list, so a second adapter added to the
barrel stays fenced without another rule edit. The segment itself may not import `@/shared/theme`
at all, which keeps the decision that the toast follows the theme through CSS, never through
JavaScript, enforced rather than documented
([Architecture boundaries](./architecture-boundaries.md)).

| Component                                                           | Layer                        | Responsibility                                                                                              | File                                                                                            |
| ------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AppNotification`, `Notifier`                                       | `shared/notifications`       | The port: a message, and a function that raises one                                                         | `src/shared/notifications/notifier.ts`                                                          |
| `NotifierContext`, `useNotifier`                                    | `shared/notifications`       | Reads the notifier from React context; throws outside a provider                                            | `src/shared/notifications/notifier-context.ts`                                                  |
| `NotifierProvider`                                                  | `shared/notifications`       | Publishes a notifier, wrapped by `toSafeNotifier` and memoised on the prop                                  | `src/shared/notifications/notifier-provider.tsx`                                                |
| `toSafeNotifier`                                                    | `shared/notifications`       | Catches a throwing or rejecting notifier and logs the failure to the console                                | `src/shared/notifications/to-safe-notifier.ts`                                                  |
| `createSonnerNotifier`                                              | `shared/notifications`       | The adapter: `toast.success(message)`                                                                       | `src/shared/notifications/sonner-notifier.ts`                                                   |
| `NotificationViewport`                                              | `shared/notifications`       | sonner's `Toaster`: region and close-button names, duration, position, theme tokens, the focus ring         | `src/shared/notifications/notification-viewport.tsx`                                            |
| `notify`                                                            | `app/entrypoint`             | The one binding of a concrete notifier                                                                      | `src/app/entrypoint/app-notifier.ts`                                                            |
| `App`, `AppProviders`                                               | `app/entrypoint`             | Prop-inject `notify`, mount `NotificationViewport` inside `I18nProvider`, nest `NotifierProvider` innermost | `src/app/entrypoint/app.tsx`, `src/app/entrypoint/app-providers.tsx`                            |
| `useUpdateUserName`, `UpdateUserNameForm`                           | `features/update-user-name`  | The reference consumer: raises the translated saved message once the mutation resolves                      | `src/features/update-user-name/model/use-update-user-name.ts`, `…/ui/update-user-name-form.tsx` |
| `notifications.*` copy                                              | `shared/i18n`                | The region label and the close-button label, in `en` and `ru`                                               | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json`              |
| `createRecordingNotifier`, `notifications`                          | `shared/testing`             | A notifier that records every message and delegates; the harness returns the record                         | `src/shared/testing/create-recording-notifier.ts`, `src/shared/testing/create-test-harness.tsx` |
| `NOTIFICATIONS_VENDOR_IMPORT_PATHS` and the construction allow-list | outside layers · root config | Fence `sonner` into the segment and keep construction in `app`                                              | `eslint.config.js`                                                                              |
| `savedNotice()`                                                     | outside layers · `e2e/`      | Finds a message inside the region by its anchored, case-sensitive name                                      | `e2e/page-objects/user-profile-page-object.ts`                                                  |

## Public surface

The capability serves no route. `@/shared/notifications` exports:

| Export                 | Kind      | Signature                                                       | Importable |
| ---------------------- | --------- | --------------------------------------------------------------- | ---------- |
| `AppNotification`      | Type      | `interface { readonly message: string }`                        | Everywhere |
| `Notifier`             | Type      | `(notification: AppNotification) => void`                       | Everywhere |
| `useNotifier`          | Hook      | `() => Notifier`; throws outside a `NotifierProvider`           | Everywhere |
| `NotifierProvider`     | Component | `{ readonly notifier: Notifier; readonly children: ReactNode }` | Everywhere |
| `NotificationViewport` | Component | No props                                                        | `app` only |
| `createSonnerNotifier` | Factory   | `() => Notifier`                                                | `app` only |
| `toSafeNotifier`       | Decorator | `(notify: Notifier) => Notifier`                                | `app` only |

`NotifierContext` is internal to the segment. The payload is called `AppNotification` rather than
`Notification` so it cannot shadow the DOM's global `Notification` in any module that imports it.

| Key                         | English       | Russian             | Rendered by                                                |
| --------------------------- | ------------- | ------------------- | ---------------------------------------------------------- |
| `notifications.regionLabel` | Notifications | Уведомления         | The region's accessible name, to which sonner adds `alt+T` |
| `notifications.close`       | Close toast   | Закрыть уведомление | Each toast's close button                                  |

## Configuration

| Variable / option                                  | Default                                         | Meaning                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `TOAST_DURATION_MS` (`notification-viewport.tsx`)  | `6000`                                          | How long a message stays; longer than Playwright's five-second assertion poll, so an end-to-end check cannot race a disappearing toast |
| `TOAST_POSITION` (`notification-viewport.tsx`)     | `'bottom-right'`                                | Where the region sits                                                                                                                  |
| `TOAST_THEME_TOKENS` (`notification-viewport.tsx`) | sonner's properties → the design tokens         | The toast surface, text, border and close-button hover colours                                                                         |
| `FOCUS_RING` (`notification-viewport.tsx`)         | `focus-visible:ring-2! focus-visible:ring-ring` | The keyboard focus ring on a toast and its close button; `!` because sonner's stylesheet is unlayered and would otherwise win          |
| `notifier` (`AppProviders` prop)                   | `notify` from `app-notifier.ts`                 | The notifier the whole tree receives                                                                                                   |
| `notifier` (`renderWithProviders` option)          | A recorder around a no-op                       | The notifier a test's tree receives; whatever is passed is still recorded                                                              |

The capability reads no environment variable.

## Usage & extension

### Raise a message from a feature

Resolve the copy where translation already happens, and raise it only once the action has
succeeded:

```tsx
import { useMutation } from '@tanstack/react-query';

import { useNotifier } from '@/shared/notifications';

export function useArchiveAction(archive: () => Promise<void>, archivedMessage: string) {
  const notify = useNotifier();
  const mutation = useMutation({ mutationFn: archive });

  return async () => {
    try {
      await mutation.mutateAsync();
    } catch {
      return;
    }

    notify({ message: archivedMessage });
  };
}
```

Keep failures out of the notifier: a failure is actionable and has to stay beside the control that
produced it, as `UpdateUserNameAlert` does.

### Assert a message in a test

`renderWithProviders` and `renderHookWithProviders` return `notifications`, every `AppNotification`
raised during the render, and never mount the viewport, so no test grows a toast it did not ask for:

```tsx
const { notifications, user } = renderWithProviders(<UpdateUserNameForm user={ada} />, {
  httpClient,
});

await user.click(screen.getByRole('button', { name: 'Save name' }));

await waitFor(() => {
  expect(notifications).toStrictEqual([{ message: 'Name updated.' }]);
});
```

A test that renders `NotificationViewport` itself must dismiss every toast in `afterEach` with
`toast.dismiss()` inside `act()`: sonner keeps its toasts in a module-level store that replays
still-active ones to each new subscriber, and Testing Library's `cleanup()` only unmounts. The two
test files under `src/shared/notifications` that render sonner do exactly that.

### Replace sonner

Write a second adapter in `src/shared/notifications` that returns a `Notifier`, export it from the
barrel, and bind it in `src/app/entrypoint/app-notifier.ts` in place of `createSonnerNotifier()`;
replace `NotificationViewport`'s body with the new library's region. Nothing below `app` changes,
and the ESLint allow-list keeps the new factory out of every other layer without an edit. If the
new library injects styles or scripts at runtime, the production Content-Security-Policy has to
admit them — the end-to-end suite fails with the blocked directive until it does
([Production container](./deployment.md)).

### Add a kind of message

`AppNotification` carries a message only, on purpose. A second kind — a warning, say — is a change
to the port: add a discriminating field to `AppNotification`, map it to the library's call in the
adapter, and give every consumer the new field. Keep failures that need action out of it.

## Design decisions & trade-offs

- **A port, not a library call.** The toast library is a vendor choice like axios or i18next, so it
  sits behind a port and a fence like them. A component that called `toast()` directly would couple
  every feature to sonner and make "was a message raised?" answerable only by rendering sonner.
- **sonner.** It is the toast library shadcn/ui itself moved to, MIT-licensed, dependency-free,
  accessible — a labelled region, a close button and a keyboard shortcut — and themeable through
  custom properties. Its cost is size and one runtime stylesheet: it adds about 9 kB gzip to the
  entry chunk, most of it a 14,916-byte CSS string that it injects into `document.head` when the
  module loads, outside Vite's CSS pipeline ([Quality gates](./quality-gates.md)).
- **Safe by construction, twice.** `NotifierProvider` wraps whatever it is given in
  `toSafeNotifier`, so a consumer is protected no matter what a composition site passes, and
  `app-notifier.ts` wraps its binding too, so the value is safe even outside a provider. The
  decorator also catches a rejecting thenable: `Notifier` returns `void`, and TypeScript's
  void-return bivariance lets an `async` function satisfy it, whose rejection would otherwise
  escape the `try` unhandled.
- **The message arrives translated.** The port carries text, not keys, so the notifier stays
  independent of i18n and a model hook stays free of `useTranslation`: the UI component resolves
  the copy and passes it down, as `UpdateUserNameForm` does with `savedMessage`.
- **Success is transient, failure is inline.** A toast disappears and lands away from the control
  that caused it, which suits a confirmation with nothing to act on and fails a message that asks
  for a correction. The reference slice therefore uses both channels, one for each.
- **The viewport sits inside `I18nProvider`.** `createI18n` never registers `initReactI18next`, so
  `useTranslation` outside the provider has no instance and returns keys; the viewport's position
  in `AppProviders` is the one ordering in that stack that matters.
- **Theme through CSS only.** sonner's own `theme` prop would need the resolved theme in JavaScript;
  pointing its custom properties at the design tokens lets the `.dark` class do the work, and the
  segment is fenced off from `@/shared/theme` so nobody wires the prop back in.
- **The focus ring is `!important`.** sonner's unlayered stylesheet outranks Tailwind's
  `@layer utilities`, so its low-contrast 20%-black ring won until the utility was marked
  important; the solid ring measures 7.44:1 and 5.83:1 against the light and dark popover surfaces
  ([Design system](./design-system.md)).
- **Tests read a record, not a toast.** The shared harness always installs a recording notifier, so
  a consumer test asserts the exact `AppNotification` list and never depends on sonner's timing or
  its module-level store.

## Testing

| File                                                      | What it covers                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/notifications/to-safe-notifier.test.ts`       | Forwards a notification; logs a throwing notifier instead of rethrowing; logs a rejecting async notifier instead of leaving the rejection unhandled; keeps forwarding after a failure |
| `src/shared/notifications/notifier-context.test.tsx`      | The provider renders its children and swallows a throwing notifier; `useNotifier` delivers to the nearest provider, resolves the innermost of two, and throws with none               |
| `src/shared/notifications/sonner-notifier.test.tsx`       | A message renders into a mounted viewport; two messages both render                                                                                                                   |
| `src/shared/notifications/notification-viewport.test.tsx` | The region and the close button carry their translated names, and both rename when the locale changes                                                                                 |
| `src/app/entrypoint/app-providers.test.tsx`               | `AppProviders` provides the injected notifier, and mounts the region with its translated accessible name                                                                              |
| `src/features/update-user-name/**/*.test.tsx`             | Exactly one message after a successful save, none after a failed one, read from the harness's `notifications`                                                                         |
| `e2e/user-profile.spec.ts`                                | Saving a name shows `Name updated.` inside the region named `Notifications`, located by an anchored, case-sensitive name that fails if the viewport loses its translation             |

```sh
npx vitest run src/shared/notifications
npx vitest run src/features/update-user-name
npm run test:e2e -- e2e/user-profile.spec.ts
```

## Known limitations

- **One kind of message.** Every notification is a sonner success toast; there is no warning,
  error, action button or custom duration per message.
- **Nothing throttles or deduplicates.** Two identical messages raised in quick succession render
  as two toasts.
- **The region's name carries sonner's shortcut.** sonner appends its `alt+T` hotkey to the
  accessible name, so the region is announced as "Notifications alt+T"; the label is not fully the
  app's to choose.
- **Unit tests cannot see a misplaced viewport.** `vitest.setup.ts` installs a global i18n instance,
  so a viewport hoisted above `I18nProvider` still renders translated names under Vitest; only the
  end-to-end locator catches it.
