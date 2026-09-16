# Unit and component testing

> **Status:** Complete · **Layers:** app, pages, widgets, features, entities, shared, outside layers · **Verified against:** `d6deb01`

## Purpose

Every source file in this template must reach 90% test coverage before a push goes through, and the
tests that provide it sit beside the code they cover and run in seconds. To make that possible, the
harness standardizes the parts each test would otherwise reinvent: a DOM, the assertion matchers, an
English translation instance, browser state that is clean at the start of every test, and one
coverage policy with an independent check that no source file slipped out of it. This feature is
that harness — the `test` block of `vite.config.ts`, `vitest.setup.ts`, the shared render harness in
`src/shared/testing`, the coverage-scope gate in `scripts/verify-coverage-scope.mjs`, the
import-fence gate in `scripts/verify-import-fence.mjs` and the lint rules for test files — together
with the conventions its tests follow: assert on what a user perceives (roles, accessible names, copy), and
hand every unit its collaborators through the providers, props and factory arguments it already
accepts. Browser tests against the production build are a separate harness, described in
[End-to-end testing](./e2e-testing.md).

## How it works

Vitest runs the unit and component suite inside Node. Most files get **jsdom**, a simulated browser
`window`, `document` and `localStorage`, so React components render and Testing Library can query
them. The few tests that must drive real HTTP requests run in plain Node with **MSW** (Mock Service
Worker), which intercepts requests at the network layer and answers them from handlers. There is no
`vitest.config.ts`: Vitest loads `vite.config.ts`, whose `defineConfig` is imported from
`vitest/config` so the `test` block is typed, and it therefore resolves modules the way the app
does — `resolve.tsconfigPaths: true` maps `@/` imports to `src/`, and the `react()` and
`tailwindcss()` plugins apply.

A run starts from `npm test` (`vitest run`), `npm run test:watch` (`vitest`) or
`npm run test:coverage` (`vitest run --coverage`). The lefthook `pre-push` hook and the CI
`Quality gates` job run the coverage variant inside `npm run audit`, immediately followed by
`npm run verify:coverage-scope` (see [Quality gates](./quality-gates.md)).

1. **The config is evaluated in `test` mode.** Vitest sets Vite's mode to `test`, so the config
   function's `mode === 'test'` check drops `routerPlugin` — the TanStack Router route-tree
   generator and code splitter — from `plugins`. Route modules are imported as written, and the
   router is built from the committed `src/app/router/route-tree.gen.ts`.
2. **Test files are collected from `src/` only.** `include: ['src/**/*.{test,spec}.{ts,tsx}']`
   finds every co-located test; the Playwright specs under `e2e/` are never collected.
3. **Each file gets its environment.** `environment: 'jsdom'` applies to every file except those
   that open with a `// @vitest-environment node` comment. Exactly three do —
   `src/shared/api/http-client.test.ts`, `src/shared/api/attach-bearer-token.test.ts` and
   `src/app/entrypoint/create-authenticated-transport.test.ts` — and they are also the only files
   that use MSW.
4. **`vitest.setup.ts` prepares every file, whatever its environment.** At module level it imports
   `@testing-library/jest-dom/vitest`, which adds the DOM matchers (`toBeInTheDocument`,
   `toHaveTextContent`, `toHaveAttribute`, `toBeDisabled` and the rest) to Vitest's `expect`, and it
   replaces two globals jsdom does not provide adequately: `scrollTo` becomes a `vi.fn()`, and
   `matchMedia` becomes a factory returning a `MediaQueryList`-shaped object that reports
   `matches: false` and `vi.fn()` listeners. The `matchMedia` stub is deliberately as narrow as
   `createSystemThemeSource`: it carries `addEventListener`/`removeEventListener` and not the
   deprecated `addListener`/`removeListener` pair, so no test can pass against a contract the
   adapter does not use. Reporting a light system preference is what keeps every pre-existing
   assertion unchanged. Its hooks do the rest; the browser-only steps sit behind the
   `isBrowserEnvironment` constant, `typeof window !== 'undefined'`:
   - before each test, in jsdom only: `localStorage.clear()`, then
     `setI18n(createI18n({ locale: DEFAULT_LOCALE, detection: { order: [], caches: [] } }))`, which
     registers a fresh English i18next instance as react-i18next's global instance;
   - after each test: `cleanup()`, which unmounts everything Testing Library's `render` mounted,
     and, in jsdom only, removal of the `lang`, `dir`, `class` and `style` attributes from `<html>`.
     The first two are the locale's, the last two the theme's; all four are hygiene rather than a
     capability, since a test that asserts on `<html>` must not inherit the previous test's state.
5. **The tests run.** With `globals: false`, each file imports `describe`, `it`, `expect`, `vi` and
   the lifecycle hooks from `vitest`. A component test renders its unit with `render`, supplies
   collaborators through the props, providers or factory arguments the unit already accepts, drives
   it with `userEvent`, and asserts on roles, accessible names and copy. `useTranslation` falls back
   to the global instance from step 4 when no `I18nProvider` is mounted, so rendered copy is real
   English.
6. **With `--coverage`, every source file is measured and judged on its own.** The `v8` provider
   reads the coverage V8 records natively, with no instrumentation step. It measures
   `src/**/*.{ts,tsx}` — including files no test imports — minus test files, `.d.ts` declarations
   and the generated route tree. The `text` reporter prints a table to the terminal; the `lcov`
   reporter writes `coverage/lcov.info` and an HTML report in `coverage/lcov-report/`. With
   `thresholds.perFile: true`, every measured file must reach 90% of its lines, functions, branches
   and statements.
7. **The scope gate cross-checks the report.** `npm run verify:coverage-scope` runs
   `scripts/verify-coverage-scope.mjs`, which collects the `SF:` (source file) records of
   `coverage/lcov.info`, globs `src/**/*.{ts,tsx}` minus test files, declarations and the generated
   route tree, and prints `Coverage scope verified: <count> source files measured.` when every
   expected file was measured.

**Failure paths.**

- _A file misses a threshold._ Vitest prints one line per failing metric and file —
  `ERROR: Coverage for <metric> (<actual>%) does not meet global threshold (90%) for <file>` — and
  `npm run test:coverage` exits 1 even though every test passed. `npm test` checks no threshold.
- _A source file escapes measurement._ A `coverage.exclude` pattern that matches more than intended
  removes the file from the report, so no threshold can ever fail for it. The gate prints
  `These source files escaped coverage measurement:`, lists each file, explains the
  unanchored-matching hazard described under [Design decisions](#design-decisions--trade-offs) and
  exits 1. Run with no report on disk, it prints
  ``No coverage report found. Run `npm run test:coverage` first.`` and exits 1.
- _A promise rejects with no handler._ Vitest reports it under `Unhandled Rejection` and
  `vitest run` exits 1, while the summary still counts every test as passed next to an `Errors`
  line. This is why `Form` in `shared/ui/form` catches its submit promise rather than voiding it
  (see [Forms](./forms.md)).

## Architecture

The harness defines no runtime port of its own; it leans on the production ones. In the running app
the _composition root_ — `src/app/entrypoint`, the only code in `src/` that constructs concrete
objects and publishes them to the rest of the tree (see [Composition root](./composition-root.md)) —
binds implementations to _ports_ (the repo's word, used interchangeably with _seam_, for a type that
consumers program against while the implementation is chosen elsewhere): `HttpClient`,
`SessionStarter`, `SessionEnder`, `SessionResolver`. It publishes them through providers, factory
arguments and the router context. A test is a small composition root of its own: it passes test
doubles through those same channels — a plain object typed as `HttpClient` inside
`HttpClientProvider`, a recording `SessionStarter` inside `SessionStarterProvider`, an object with a
`signOut` method inside `SessionEnderProvider`, a `context` and a memory history passed to
`createAppRouter` — so a port change breaks its doubles at compile time, exactly as it breaks the
concretes.

A double satisfies the port's _type_, not its behavioural contract, and `SessionEnder` is where that
gap is widest. Its type is one member, `signOut: () => Promise<SignOutOutcome>`, so the inert literal
the route tests use — `{ signOut: () => Promise.resolve({ status: 'signed-out' } as const) }` —
compiles, and is enough for a test that only needs the tree to mount. The real port promises more:
the local session is ended before the promise settles, down every path, including the one where the
request rejects. That is what the `finally` in `createSessionEnder`
(`src/entities/session/model/session-ender.ts`) exists for, and no stub can show it. It is proven
where the real implementation runs — `src/entities/session/model/session-ender.test.ts` counts the
`end()` calls on a resolving, an `unavailable` and a rejecting request, and
`src/app/entrypoint/create-authenticated-transport.test.ts` signs in against MSW and asserts the
observer moves `authenticated` → `anonymous` even when `/auth/logout` answers `500`. Read a stub as
scaffolding for the unit under test, never as evidence about the port it stands in for.

Each test file sits in the same Feature-Sliced Design (FSD) _slice_ (a per-screen or per-entity
folder of a layer) or _segment_ (a purpose-named folder such as `ui/` or `api/`) as the
module it covers, and is held to that layer's import rules: it imports its unit by relative path,
reaches other slices only through their _public API_ (the slice's `index.ts` barrel), and the
ESLint fences apply to it, with three test-specific carve-outs listed under
[Public surface](#public-surface). The harness itself sits outside the layers — root config,
`vitest.setup.ts` and `scripts/` — where neither steiger (`steiger ./src`) nor any
`no-restricted-imports` block (each matches files under `src/` or `e2e/`) reaches. That is what
lets the setup file import `setI18n` from `react-i18next` and call `createI18n`, both of which lint
rejects in every layer below `app`. [Architecture boundaries](./architecture-boundaries.md) covers
the rule set as a whole.

| Component                                                      | Layer                       | Responsibility                                                                                                                                                                 | File                                                                                                                                           |
| -------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `test` block                                                   | `outside layers`            | jsdom by default, `globals: false`, the setup file, collection from `src/`, `css.include` for `theme.css?raw`, `v8` coverage with 90% per-file thresholds                      | `vite.config.ts`                                                                                                                               |
| `mode === 'test'` plugin gate                                  | `outside layers`            | Leaves `routerPlugin` out of every Vitest run                                                                                                                                  | `vite.config.ts`                                                                                                                               |
| `routeFileIgnorePattern`                                       | `outside layers`            | `'\\.test\\.tsx?$'` keeps route tests co-located in `src/app/routes/` out of the generated route tree                                                                          | `vite.config.ts`                                                                                                                               |
| Setup file                                                     | `outside layers`            | jest-dom matchers, the `scrollTo` and `matchMedia` stubs, a per-test `localStorage` reset and English i18n instance, `cleanup()`, the `<html lang dir class style>` reset      | `vitest.setup.ts`                                                                                                                              |
| Render harness                                                 | `shared/testing`            | `renderWithProviders` and `renderHookWithProviders`: the three shared providers, caller-supplied wrappers, a ready `userEvent` instance                                        | `src/shared/testing/render-with-providers.tsx`, `create-test-harness.tsx`                                                                      |
| Collaborator factories                                         | `shared/testing`            | `createHttpClientStub` (every unstubbed verb rejects by name), `parseStubResponse` (a stub body through the transport's own parser) and `createTestQueryClient` (retries off)  | `src/shared/testing/create-http-client-stub.ts`, `src/shared/testing/parse-stub-response.ts`, `src/shared/testing/create-test-query-client.ts` |
| Import-fence gate                                              | `outside layers`            | Gate 10: proves `import-x/no-restricted-paths` keeps `@/shared/testing` out of production files and out of nothing else                                                        | `scripts/verify-import-fence.mjs`, `eslint.config.js`                                                                                          |
| Coverage-scope gate (`measuredFiles`, `measurableSourceFiles`) | `outside layers`            | Fails when a source file is missing from `coverage/lcov.info`                                                                                                                  | `scripts/verify-coverage-scope.mjs`                                                                                                            |
| Vitest lint block                                              | `outside layers`            | `vitest.configs.recommended` over `src/**/*.test.{ts,tsx}`                                                                                                                     | `eslint.config.js`                                                                                                                             |
| Test-file import carve-outs                                    | `outside layers`            | The `src/shared/api/**/*.test.{ts,tsx}` block and the `ignores` on the `shared/ui/form` and `shared/ui/error-boundary` blocks; `shared/notifications` deliberately has neither | `eslint.config.js`                                                                                                                             |
| `include` (`src`, `env.d.ts`, `vitest.setup.ts`)               | `outside layers`            | Puts tests and the setup file — and with it the jest-dom matcher types — under `npm run typecheck`                                                                             | `tsconfig.app.json`                                                                                                                            |
| Test scripts                                                   | `outside layers`            | `test`, `test:watch`, `test:coverage`, `verify:coverage-scope`; `audit` ends with the last two                                                                                 | `package.json`                                                                                                                                 |
| Entry-point test                                               | `outside layers`            | The `#root` fail-fast guard and a real mount of `App` under `act` and `waitFor`                                                                                                | `src/main.test.ts`                                                                                                                             |
| `createAuthenticatedTransport` test                            | `app/entrypoint`            | Node environment and MSW: the two-client composition end to end, with a real Web Lock                                                                                          | `src/app/entrypoint/create-authenticated-transport.test.ts`                                                                                    |
| `LocaleSwitcher` test                                          | `features/switch-locale`    | One control per supported locale under its endonym, the pressed state following the active locale, and the `lang` tag on each button                                           | `src/features/switch-locale/ui/locale-switcher.test.tsx`                                                                                       |
| `AppHeader` test                                               | `widgets/app-header`        | The `banner` landmark naming the app, and the switcher reachable `within` it — composition, not co-presence                                                                    | `src/widgets/app-header/ui/app-header.test.tsx`                                                                                                |
| `createAppRouter` test                                         | `app/router`                | The real route tree over a memory history; asserts the routing policy; the `@ts-expect-error` link gate                                                                        | `src/app/router/create-app-router.test.tsx`                                                                                                    |
| `HomePage` test                                                | `pages/home · ui`           | A router-free, provider-free component test: the proof that a page reads no route state                                                                                        | `src/pages/home/ui/home-page.test.tsx`                                                                                                         |
| `SignInForm` test                                              | `features/sign-in · ui`     | `renderWithProviders` with a `SessionStarterProvider` wrapper; validation, outcomes and a keyboard-only sign-in                                                                | `src/features/sign-in/ui/sign-in-form.test.tsx`                                                                                                |
| `useSignOut` test                                              | `features/sign-out · model` | `renderHookWithProviders` with one wrapper: the caller is notified `onSettled`, so even a rejecting port resolves                                                              | `src/features/sign-out/model/use-sign-out.test.tsx`                                                                                            |
| `SignOutButton` test                                           | `features/sign-out · ui`    | A `SessionEnder` stubbed through `SessionEnderProvider`: the idle label, the busy disabled button, and no second request while one is in flight                                | `src/features/sign-out/ui/sign-out-button.test.tsx`                                                                                            |
| `createSessionEnder` and `useSessionEnder` tests               | `entities/session · model`  | The factory's `finally` counted on every path; the context/provider pair and its throw outside a provider                                                                      | `src/entities/session/model/session-ender.test.ts`, `src/entities/session/model/session-ender-context.test.tsx`                                |
| `toUser` and `toUpdateUserNameRequestDto` test                 | `entities/user · api`       | A pure unit test of the DTO mappers                                                                                                                                            | `src/entities/user/api/user-mapper.test.ts`                                                                                                    |
| `createHttpClient` and `attachBearerToken` tests               | `shared/api`                | Node environment and MSW: a real axios stack, from headers to error normalization                                                                                              | `src/shared/api/http-client.test.ts`, `src/shared/api/attach-bearer-token.test.ts`                                                             |
| `appConfig` test                                               | `shared/config`             | `vi.stubEnv`, `vi.resetModules()` and a dynamic `import()` around the one module that reads `import.meta.env`                                                                  | `src/shared/config/app-config.test.ts`                                                                                                         |

## Public surface

This is a developer-facing feature. Its surface is the scripts, the per-file environment directive,
the guarantees the setup file gives every test, and the lint and coverage contracts.

**Scripts** (`package.json`):

| Command                         | Runs                                     | Contract                                                                                                        |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm test`                      | `vitest run`                             | The whole suite, once. No coverage and no thresholds                                                            |
| `npm run test:watch`            | `vitest`                                 | Watch mode: re-runs the tests affected by each saved change                                                     |
| `npm run test:coverage`         | `vitest run --coverage`                  | The whole suite with `v8` coverage; exits 1 if any measured file is below 90% on any metric; writes `coverage/` |
| `npm run verify:coverage-scope` | `node scripts/verify-coverage-scope.mjs` | Exits 1 if the report is missing or a source file is absent from it; run it after `npm run test:coverage`       |
| `npm run audit`                 | every gate in sequence                   | Ends with `npm run test:coverage && npm run verify:coverage-scope` (see [Quality gates](./quality-gates.md))    |

**Per-file environment.** A `// @vitest-environment node` comment at the top of a test file runs
that file in plain Node instead of jsdom. All three files that use it put it on line 1.

**What every test can rely on** (`vitest.setup.ts`):

| Guarantee                                                                                        | Applies to                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| The jest-dom matchers are on `expect`, and typed for every file in `tsconfig.app.json`           | Every file                                                    |
| `scrollTo` is a `vi.fn()`                                                                        | Every file, until a `vi.unstubAllGlobals()` call in that file |
| `matchMedia` returns a `MediaQueryList`-shaped object reporting `matches: false`                 | Every file, until a `vi.unstubAllGlobals()` call in that file |
| Everything `render` mounted is unmounted after each test                                         | Every file                                                    |
| `localStorage` is empty when each test starts                                                    | jsdom files                                                   |
| react-i18next's global instance is a fresh `en` instance with detection and caching disabled     | jsdom files, rebuilt before each test                         |
| `<html>` carries no `lang`, `dir`, `class` or `style` attribute left behind by the previous test | jsdom files                                                   |

**Lint contract for test files** (`eslint.config.js`). The `recommended` config of
`@vitest/eslint-plugin` applies to `src/**/*.test.{ts,tsx}`:

| Rule                                                                                                                                                         | Severity                                              | Rejects                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest/expect-expect`                                                                                                                                       | error                                                 | A test body with no expectation                                                                                                                         |
| `vitest/no-focused-tests`                                                                                                                                    | error                                                 | A focused test (`.only`)                                                                                                                                |
| `vitest/no-disabled-tests`                                                                                                                                   | warn, fatal under `npm run lint`'s `--max-warnings 0` | A disabled test, such as one declared with `it.skip`                                                                                                    |
| `vitest/no-commented-out-tests`                                                                                                                              | error                                                 | A commented-out test                                                                                                                                    |
| `vitest/no-conditional-expect`                                                                                                                               | error                                                 | An `expect` that runs only under a condition                                                                                                            |
| `vitest/no-standalone-expect`                                                                                                                                | error                                                 | An `expect` outside an `it` or `test` block                                                                                                             |
| `vitest/no-identical-title`                                                                                                                                  | error                                                 | Two tests or suites with the same title                                                                                                                 |
| `vitest/valid-expect`, `vitest/valid-expect-in-promise`                                                                                                      | error                                                 | Malformed `expect()` usage, and a promise whose chain carries expectations but is neither awaited nor returned                                          |
| `vitest/valid-title`, `vitest/valid-describe-callback`                                                                                                       | error                                                 | Invalid test titles and `describe` callbacks                                                                                                            |
| `vitest/prefer-called-exactly-once-with`                                                                                                                     | error                                                 | `toHaveBeenCalledOnce()` paired with `toHaveBeenCalledWith()` where `toHaveBeenCalledExactlyOnceWith()` says both                                       |
| `vitest/no-unneeded-async-expect-function`                                                                                                                   | error                                                 | An unnecessary `async` wrapper around a promise handed to `expect`                                                                                      |
| `vitest/no-import-node-test`, `vitest/no-mocks-import`, `vitest/no-interpolation-in-snapshots`, `vitest/require-local-test-context-for-concurrent-snapshots` | error                                                 | Importing `node:test`, importing from a `__mocks__` directory, interpolation in snapshots, and concurrent snapshot tests without the local test context |

Test files also get every rule the rest of `src/**` gets. That includes the type-aware
`@typescript-eslint/no-floating-promises`, so an un-awaited `user.click` call fails lint, and the
`no-restricted-imports` fences of their layer, with three carve-outs for tests:

- `src/shared/api/**/*.test.{ts,tsx}` has its own block, placed after the `src/shared/api/**` block,
  that lifts the validator ban: the segment's tests build real Zod schemas to prove the transport
  accepts one, while its production code may not import a validator.
- The `src/shared/ui/form/**` and `src/shared/ui/error-boundary/**` blocks carry an `ignores` for
  their own tests, which leaves those tests under the general lower-layer block: form tests may
  import `zod` but not `@tanstack/react-form` values, and error-boundary tests may not import
  `react-error-boundary`. They reach the vendor only through the module under test.

`src/shared/notifications/**` carries **no** such `ignores`, deliberately: its two sonner-rendering
test files import `toast` to call `toast.dismiss()` in `afterEach`, because sonner's store is a
module-level singleton that replays every still-active toast to each new subscriber and Testing
Library's `cleanup()` unmounts the viewport without dismissing them. Without that reset a toast from
one test is replayed into the next test's viewport and a role query throws
`found multiple elements`.

**Coverage-scope gate contract** (`scripts/verify-coverage-scope.mjs`). A _source file_ is any
`src/**/*.{ts,tsx}` file except `*.test.ts(x)` and `*.spec.ts(x)` files, `*.d.ts` declarations and
`src/app/router/route-tree.gen.ts`.

| Situation                             | Output                                                                                                              | Exit code |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| `coverage/lcov.info` does not exist   | ``No coverage report found. Run `npm run test:coverage` first.``                                                    | 1         |
| A source file has no `SF:` record     | `These source files escaped coverage measurement:`, the sorted list, and the picomatch note naming `vite.config.ts` | 1         |
| Every source file has an `SF:` record | `Coverage scope verified: <count> source files measured.`                                                           | 0         |

## Configuration

The harness reads no `VITE_*` variable. Under Vitest, `import.meta.env.MODE` is `'test'` — the
value the `mode === 'test'` plugin gate sees and `appConfig.mode` reports, as `app-config.test.ts`
asserts — and a test that needs a particular `VITE_API_BASE_URL` sets it with `vi.stubEnv` (see
[Configuration and environment](./configuration.md)). The `test.*` options, `plugins` and
`routeFileIgnorePattern` are set in `vite.config.ts`, the directive in the test file itself, and the
scope-gate constants in `scripts/verify-coverage-scope.mjs`; nothing is passed from the composition
root.

| Variable / option                                                          | Default                                                                              | Meaning                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `test.environment`                                                         | `'jsdom'`                                                                            | The DOM every file runs in, unless it opts out with the directive below                                             |
| `// @vitest-environment node`                                              | absent                                                                               | Per-file directive: run this file in plain Node. Used by the three MSW files only                                   |
| `test.globals`                                                             | `false`                                                                              | No global `describe`, `it` or `expect`; every file imports them from `vitest`                                       |
| `test.setupFiles`                                                          | `['./vitest.setup.ts']`                                                              | Runs in every test file, in either environment, before its tests                                                    |
| `test.include`                                                             | `['src/**/*.{test,spec}.{ts,tsx}']`                                                  | Which files are tests; nothing outside `src/` is collected                                                          |
| `test.coverage.provider`                                                   | `'v8'`                                                                               | V8's native coverage, through `@vitest/coverage-v8`                                                                 |
| `test.coverage.reporter`                                                   | `['text', 'lcov']`                                                                   | A terminal table, plus `coverage/lcov.info` (read by the scope gate) and the HTML report in `coverage/lcov-report/` |
| `test.coverage.include`                                                    | `['src/**/*.{ts,tsx}']`                                                              | Every source file is measured, including files no test imports                                                      |
| `test.coverage.exclude`                                                    | `['src/**/*.{test,spec}.{ts,tsx}', '**/*.d.ts', 'src/app/router/route-tree.gen.ts']` | Matched unanchored (picomatch `contains: true`), so a pattern ending `.ts` also matches its `.tsx` sibling          |
| `test.coverage.thresholds.perFile`                                         | `true`                                                                               | Thresholds apply to each file, not to the total                                                                     |
| `test.coverage.thresholds.lines`, `.functions`, `.branches`, `.statements` | `90`                                                                                 | The minimum percentage on each metric, for every measured file                                                      |
| `plugins` when `mode === 'test'`                                           | `[react(), tailwindcss()]`                                                           | `routerPlugin` is left out of Vitest runs                                                                           |
| `routeFileIgnorePattern` (router plugin)                                   | `'\\.test\\.tsx?$'`                                                                  | Route tests under `src/app/routes/` are not treated as route modules                                                |
| `LCOV_REPORT_PATH` (scope gate)                                            | `coverage/lcov.info`                                                                 | The report the gate reads, resolved from the script's own location                                                  |
| `SOURCE_GLOB` (scope gate)                                                 | `'src/**/*.{ts,tsx}'`                                                                | What the gate expects to be measured, before its filters                                                            |
| `TEST_FILE_PATTERN` (scope gate)                                           | `/\.(test\|spec)\.tsx?$/`                                                            | Test files, filtered out                                                                                            |
| `DECLARATION_FILE_SUFFIX` (scope gate)                                     | `'.d.ts'`                                                                            | Declarations, filtered out                                                                                          |
| `GENERATED_ROUTE_TREE` (scope gate)                                        | `'src/app/router/route-tree.gen.ts'`                                                 | The generated route tree, filtered out                                                                              |

## Usage & extension

### Run tests

```sh
npm test
npx vitest run src/features/sign-in
npx vitest run src/shared/api/http-client.test.ts
npx vitest run src/features/sign-in -t 'keyboard'
npx vitest run 'src/app/routes/_authenticated/users.$userId.test.tsx'
npm run test:watch
npm run test:coverage && npm run verify:coverage-scope
```

`npx vitest run <path>` takes a file or a folder; `-t` (`--testNamePattern`) narrows the run to
tests whose full name matches. Quote a route test's path: unquoted, the shell expands `$userId` to
an empty string. Vitest strips types without checking them, so a type error in a test surfaces in
`npm run typecheck`, not in `npm test`.

Add `--coverage` only to a whole-suite run. `coverage.include` covers every source file, so a run
of one test file reports every file it does not exercise as under threshold and exits 1.

The `text` table lists every measured file. Rows reading `0` in every column are the barrels and
type-only modules: they have nothing to cover, the `v8` provider scores 0 of 0 as 100% against a
threshold, and they pass. When Vitest detects an AI coding agent in the environment (through
`std-env`, for example `CLAUDECODE` or `AI_AGENT`), it adds `skipFull: true` to the `text` reporter
and appends a `text-summary`, so an agent sees an empty table when everything is fully covered.

### Write a component test

Put the test beside its module, named after it: `format-duration.test.ts` next to
`format-duration.ts`, `.tsx` when the file contains JSX. There is no `__tests__` tree, and the
`.spec` suffix belongs to the end-to-end suite. Import the unit by relative path and anything from
another slice through its public API, as that layer's production code must. A route test sits
beside its route module in `src/app/routes/` and follows TanStack's file naming
(`_authenticated.test.tsx`, `_authenticated/users.$userId.test.tsx`); `routeFileIgnorePattern`
keeps it out of the route tree.

Query by role and accessible name, by label for form controls, or by visible text, and drive
interactions with `userEvent.setup()`. From `src/pages/home/ui/home-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HomePage } from './home-page';

describe('HomePage', () => {
  it('renders the application name as the heading', () => {
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('frontend-boilerplate');
  });

  it('advances the elapsed status region by one second per click', async () => {
    const user = userEvent.setup();
    render(<HomePage name="frontend-boilerplate" mode="test" apiBaseUrl="/api" />);

    await user.click(screen.getByRole('button', { name: 'Add one second' }));

    expect(screen.getByRole('status')).toHaveTextContent('00:01');
  });
});
```

No router and no `I18nProvider` is mounted: `HomePage` takes props, and its copy comes from the
global English instance. Use `findBy*` queries for anything that appears asynchronously,
`queryBy*` to assert absence, `within` to scope a query to one region, and `waitFor` for an
effect that is not in the DOM, such as a recorded call. No test in `src/` uses a test id,
`fireEvent` or fake timers; timing is exercised with short real delays.

### Give the unit its collaborators

A unit below `app` receives its collaborators as props, providers or factory arguments, so a test
passes doubles through the same channel. From `src/features/sign-in/ui/sign-in-form.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SessionStarterProvider } from '@/entities/session';
import type { Credentials, SessionStarter, SignInOutcome } from '@/entities/session';
import { renderWithProviders } from '@/shared/testing';

import { SignInForm } from './sign-in-form';

function createRecordingStarter(
  outcome: SignInOutcome,
  attempts: Credentials[] = [],
): SessionStarter {
  return {
    signIn: (credentials) => {
      attempts.push(credentials);

      return Promise.resolve(outcome);
    },
  };
}

function renderForm(sessionStarter: SessionStarter) {
  const onSignedIn = vi.fn();

  const { user } = renderWithProviders(<SignInForm onSignedIn={onSignedIn} />, {
    wrappers: [
      ({ children }) => (
        <SessionStarterProvider sessionStarter={sessionStarter}>{children}</SessionStarterProvider>
      ),
    ],
  });

  return { onSignedIn, user };
}

async function fillIn(user: UserEvent, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
}

describe('SignInForm', () => {
  it('announces a rejection without revealing which field was wrong', async () => {
    const { onSignedIn, user } = renderForm(createRecordingStarter({ status: 'rejected' }));

    await fillIn(user, 'ada@example.test', 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('signs in from the keyboard alone', async () => {
    const attempts: Credentials[] = [];
    const { user } = renderForm(createRecordingStarter({ status: 'signed-in' }, attempts));

    await user.tab();
    await user.keyboard('ada@example.test');
    await user.tab();
    await user.keyboard('correct horse');
    await user.tab();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(attempts).toStrictEqual([{ email: 'ada@example.test', password: 'correct horse' }]);
    });
  });
});
```

The pattern generalizes:

- **Render through the shared harness, and add only the providers the unit also reads.**
  `renderWithProviders` from `@/shared/testing` mounts the three providers every test needs — a
  fresh `QueryClient` with retries off, so no cache state crosses tests and a failure settles at
  once, an `HttpClientProvider` over a stub whose every verb rejects by name, and a
  `NotifierProvider` over a recording notifier the result exposes as `notifications`. Anything above
  that is
  named at the call site through `wrappers`, so a unit's extra dependencies stay visible exactly
  where it renders. The [section below](#the-shared-render-harness) covers the segment.
- **Type every double as its port.** A plain object annotated as the port, such as `SessionStarter`
  here or `HttpClient` in the page and route tests, is checked by the compiler like the concrete it
  replaces. Give a method the test must never reach a rejecting stub instead of omitting it, so an
  unexpected call fails loudly rather than resolving `undefined`:

  ```ts
  const notCalled = (): Promise<never> =>
    Promise.reject(toHttpError(new Error('The router tests perform no HTTP calls.')));

  const httpClient: HttpClient = {
    get: notCalled,
    post: notCalled,
    put: notCalled,
    patch: notCalled,
    delete: notCalled,
  };
  ```

  `toHttpError` comes from `@/shared/api`, so an unexpected call rejects with the same `HttpError`
  the real transport produces and the unit's own error path — not a `TypeError` — is what the test
  observes. `src/app/router/create-app-router.test.tsx` declares exactly that by hand; every test
  outside `app` gets the same shape from `createHttpClientStub`, overriding only the verbs it
  exercises. A stub that returns data answers through `parseStubResponse`, which runs the
  transport's own `parseResponse` over the fixture, so a wire-shape mismatch still fails the test —
  with the `HttpError` kind and issues the axios client would raise — see
  [HTTP transport](./http-transport.md#test-a-consumer-without-a-network).

- **Test a hook with `renderHookWithProviders`.**
  `src/features/sign-in/model/use-sign-in.test.tsx` passes `SessionStarterProvider` as its one
  wrapper and calls `result.current.submit(ada)` inside `act()`. A context/provider pair is tested the same way,
  including the hook throwing outside its provider (`src/shared/api/http-client-provider.test.tsx`).
- **Drive a route through the real route tree.** Route and router tests call
  `createAppRouter({ context, history: createMemoryHistory({ initialEntries: ['/sign-in'] }) })` and
  render `<RouterProvider router={router} />`, so the URL, the guards and the page are the ones the
  app ships. Only `app/routes` and `app/router` tests can do this: below `app`, lint allows `Link`
  alone from `@tanstack/react-router`. Because the real screens mount, the render tree owes them
  their providers — every hook any reachable screen calls needs one above the `RouterProvider`,
  or the render throws:

  | Provider                 | Needed when the test…                         | Because                                                                                   |
  | ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
  | `QueryClientProvider`    | renders any route that queries or mutates     | A fresh `QueryClient`, so no cache state crosses tests                                    |
  | `HttpClientProvider`     | renders any route below the guard             | `useUserProfile` reads the transport with `useHttpClient()`                               |
  | `SessionStarterProvider` | follows the redirect to `/sign-in`            | `/sign-in` renders `SignInForm`, whose `useSignIn` calls `useSessionStarter()`            |
  | `SessionEnderProvider`   | renders `/users/$userId` or `UserProfilePage` | The profile renders `SignOutButton`, whose `useSignOut` calls `useSessionEnder()`         |
  | `NotifierProvider`       | renders `/users/$userId` or `UserProfilePage` | The profile renders `UpdateUserNameForm`, whose `useUpdateUserName` calls `useNotifier()` |

  `src/app/routes/_authenticated.test.tsx` and
  `src/app/routes/_authenticated/users.$userId.test.tsx` mount all five, nesting
  `NotifierProvider` innermost, exactly as `AppProviders` does; a missing provider surfaces as
  `useSessionEnder must be called inside a SessionEnderProvider` or
  `useNotifier must be called inside a NotifierProvider` thrown out of the first render, not as a
  failed assertion.

### The shared render harness

`src/shared/testing` is the one place the provider stack is written down. It exports six things:

| Export                    | What it gives the test                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderWithProviders`     | Testing Library's `render`, plus `httpClient`, `notifications`, `queryClient` and a `userEvent` instance already set up                                                                                                                                         |
| `renderHookWithProviders` | The same for `renderHook`; it returns no `user`, because a hook test has no DOM to drive                                                                                                                                                                        |
| `createHttpClientStub`    | A full `HttpClient` whose every verb rejects with an `HttpError` naming the verb, minus the ones the caller overrides                                                                                                                                           |
| `parseStubResponse`       | `parseStubResponse(schema, body)`: the stub body run through the transport's own `parseResponse`, so a double resolves the schema's output or rejects exactly as the real client does. Only `shared/api` and `shared/testing` may import `parseResponse` itself |
| `createRecordingNotifier` | A `Notifier` that records every `AppNotification` into a readable array and then delegates to the one it wraps                                                                                                                                                  |
| `createTestQueryClient`   | A `QueryClient` with query and mutation retries off, so a failure settles at once                                                                                                                                                                               |

Both helpers take `httpClient`, `notifier`, `queryClient` and `wrappers`, all optional, and pass
every other option through to Testing Library unchanged. `renderWithProviders` also takes
`userEventOptions`. The harness mounts `NotifierProvider` but never `NotificationViewport`, so no
test grows a toast it did not ask for; a test asserts on the `notifications` array instead.

```tsx
const { user, httpClient } = renderWithProviders(<SignOutButton onSignedOut={onSignedOut} />, {
  wrappers: [
    ({ children }) => (
      <SessionEnderProvider sessionEnder={sessionEnder}>{children}</SessionEnderProvider>
    ),
  ],
});
```

**Why `wrappers` exists rather than a `withSession` flag.** The harness lives in `shared`, the
bottom layer, so it may not import `@/entities/session` — steiger's `fsd/forbidden-imports` and the
`no-restricted-imports` block on `src/{entities,features,widgets,pages,shared}/**` both forbid it —
and it may not import `@tanstack/react-router` either. It therefore cannot know that session
providers or routers exist. Instead it composes the three genuinely universal providers and takes any
further provider as a component: the layers that own those providers inject them downward. The
constraint is the linters'; the inversion is the answer to it. `wrappers[0]` is the outermost, so
order matters when one wrapper reads another's context, and each is mounted as its own component
rather than called inline, which is what gives it its own fiber and its own hook order.

**It uses Testing Library's `wrapper` option, not a `<TestProviders>` element.** Only under
`wrapper` does `rerender(newUi)` re-apply the providers instead of replacing the whole tree;
`render-with-providers.test.tsx` regression-tests exactly that.

**No i18n provider.** `vitest.setup.ts` already installs a global English instance in a `beforeEach`,
so translations resolve without one, and `createI18n` is lint-banned outside `app/entrypoint`.

**Only test files may import it.** The segment pulls in `@testing-library/react` and
`@testing-library/user-event`, both devDependencies, so an `import` from a production module would
ship Testing Library into the bundle with nothing to stop it — `tsc`, `vite build` and steiger all
pass on such an import. `import-x/no-restricted-paths` in `eslint.config.js` blocks it, exempting
`*.test.{ts,tsx}` and the segment itself, and `npm run verify:import-fence` (gate 10) proves the
fence is still live in both directions. That gate is not decoration: the rule needs an `import-x`
resolver that understands `.ts`/`.tsx` and the `@/` mapping, and without one it resolves nothing and
passes silently.

**The four router tests do not use it.** `src/app/router/**` and `src/app/routes/**` build a
`createMemoryHistory` router alongside their providers, and only `app` may import
`@tanstack/react-router`, so their harness would have to live in `app` and compose on top of this
one. They keep their hand-built stacks for now.

### Drive real HTTP through MSW

Use MSW only when the HTTP exchange itself is the behaviour under test — headers, interceptors,
timeouts, status mapping. That confines it to `shared/api` and `app/entrypoint`, the only places a
real client may be constructed; below them lint bans `createHttpClient`, and tests stub the port
instead. Declare the node environment on line 1, fail on any request without a handler, and reset
handlers between tests. From `src/shared/api/http-client.test.ts`:

```ts
// @vitest-environment node
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createHttpClient } from './http-client';

const BASE_URL = 'https://api.test';

const idSchema = z.object({ id: z.string() });

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('createHttpClient', () => {
  it('resolves the validated body of a successful request', async () => {
    server.use(http.get(`${BASE_URL}/things`, () => HttpResponse.json({ id: 'a' })));
    const client = createHttpClient({ baseUrl: BASE_URL });

    await expect(client.get('/things', { schema: idSchema })).resolves.toStrictEqual({ id: 'a' });
  });
});
```

Each test registers its handlers with `server.use`, and `server.resetHandlers()` removes them
afterwards, so no test inherits another's responses. The one failure family MSW cannot reach is
covered by the pattern below.

### Synthesize an adapter-level failure MSW cannot produce

MSW answers at the network boundary, so it can only hand the interceptor failures a real response
can express. Some branches guard shapes that never come from a response at all — in
`src/shared/api/attach-bearer-token.ts`, `isReplayableUnauthorized` also rejects a `401` whose
`config` is `undefined`, and the interceptor normalizes a rejection that is not an axios error.
To reach those, drop both MSW and `createHttpClient`, build a bare axios instance whose adapter
rejects with the exact error shape, attach the interceptor to it, and assert on what the interceptor
did. `src/shared/api/attach-bearer-token.test.ts` does this for its last two cases:

```ts
const { source, renewTokenSpy } = createSourceStub(() => 'token-1', neverRenews);
const instance = axios.create({
  adapter: () => Promise.reject(new Error('the adapter is broken')),
});
attachBearerToken(instance, source);

const failure = await instance.request({ url: PROTECTED_PATH }).catch((error: unknown) => error);

expect(isHttpError(failure)).toBe(true);
expect(failure).toMatchObject({ kind: 'unknown' });
expect(renewTokenSpy).not.toHaveBeenCalled();
```

The sibling case builds an `AxiosError` with `AxiosError.ERR_BAD_REQUEST` and a `401` response but no
request `config`, and asserts that `renewTokenSpy` was never called — the request is rejected rather
than replayed. Both stay inside `shared/api`: `attachBearerToken` is a segment-internal collaborator
imported relatively (`./attach-bearer-token`, not from the `@/shared/api` barrel), and lint fences
`axios` to this segment. Reach for the pattern only for these adapter-level shapes; every exchange a
handler can serve stays on MSW, where the request really travels the axios stack that ships.

### Test a module that reads `import.meta.env`

`appConfig` is computed when its module is first imported, so its test stubs the variable, imports
the module afresh, and restores both afterwards. From `src/shared/config/app-config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig() {
  const { appConfig } = await import('./app-config');
  return appConfig;
}

describe('appConfig', () => {
  it('uses VITE_API_BASE_URL when it is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');

    await expect(loadConfig()).resolves.toMatchObject({
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('falls back to /v1 when VITE_API_BASE_URL is unset', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);

    await expect(loadConfig()).resolves.toMatchObject({ apiBaseUrl: '/v1' });
  });
});
```

`src/shared/config/app-config.ts` is the only module in `src/` that reads `import.meta.env`; keep
it that way and no other test needs this pattern. `src/main.test.ts` uses the same
`vi.resetModules()` and dynamic `import()` for a different reason: `src/main.tsx` mounts the app as
a side effect of being imported. That test wraps the import in `act()` and asserts the rendered
heading through `waitFor` — see [Design decisions](#design-decisions--trade-offs) for why both are
needed.

### Pin a compile-time contract

A `// @ts-expect-error` line turns a type guarantee into a failing gate. The last case of
`src/app/router/create-app-router.test.tsx`:

```tsx
it('rejects a link to a path outside the generated route tree', () => {
  // @ts-expect-error a URL that no route file declares must not type-check
  const brokenLink = <Link to="/definitely-not-a-route">broken</Link>;

  expect(brokenLink).toBeDefined();
});
```

The directive is enforced by `npm run typecheck`, not by Vitest. If the `Register` augmentation in
`src/app/router/create-app-router.ts` stops working, the link type-checks, the directive is unused,
and `tsc` fails with `TS2578`.

### Spy on a factory the unit constructs itself

Reserve module mocking for the composition root, where a unit builds its own collaborators and so
offers no injection point to pass a double through. Wrap the real factory rather than replacing it,
and name the module with an `import()` expression instead of a string path, so `importOriginal` is
typed against the real module. From `src/app/router/app-router-provider.test.tsx`, which counts how
often `AppRouterProvider` builds its router:

```tsx
vi.mock(import('./create-app-router'), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, createAppRouter: vi.fn(actual.createAppRouter) };
});
```

`src/app/entrypoint/app-providers.test.tsx` wraps `createAuthenticatedTransport` the same way and
substitutes a controllable transport with `mockReturnValueOnce`; `src/app/entrypoint/app.test.tsx`
calls `vi.doMock` on `./app-providers`, then `vi.resetModules()` and a dynamic `import('./app')`, to
make `AppProviders` throw.

### Change the setup file

`vitest.setup.ts` runs in every test file, so a line added there is a rule for the whole suite:

- Anything that touches `window`, `document` or `localStorage` goes after the `isBrowserEnvironment`
  check, or the three node-environment files fail before their first assertion.
- Per-test state is created in `beforeEach` or reset in `afterEach`, never held at module scope,
  so one test cannot leak into the next — the reason the i18n instance is rebuilt before each test.
- A jsdom gap belongs here only when code that any test may mount runs into it, as the router's
  scroll restoration does with `scrollTo` and `createSystemThemeSource` does with `matchMedia`,
  which jsdom 30 does not implement at all. Otherwise stub it in the test that needs it with
  `vi.stubGlobal` and restore it with `vi.unstubAllGlobals()` in `afterEach`, as
  `src/shared/lib/single-flight/single-flight.test.ts` does with `navigator` — and see
  [Known limitations](#known-limitations) for what that call also restores.

### Add a coverage exclusion

Exclude as little as possible: a module that should not be tested usually should not exist, and a
barrel or type-only module passes without an exclusion. When a file genuinely cannot be measured —
generated code is the one case today — edit both lists, following the generated route tree. In
`vite.config.ts`:

```ts
exclude: ['src/**/*.{test,spec}.{ts,tsx}', '**/*.d.ts', 'src/app/router/route-tree.gen.ts'],
```

and in `scripts/verify-coverage-scope.mjs`, a named constant and one more filter in
`measurableSourceFiles()`:

```js
const GENERATED_ROUTE_TREE = 'src/app/router/route-tree.gen.ts';
```

```js
function measurableSourceFiles() {
  return globSync(SOURCE_GLOB, { cwd: PROJECT_ROOT })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => !TEST_FILE_PATTERN.test(path))
    .filter((path) => !path.endsWith(DECLARATION_FILE_SUFFIX))
    .filter((path) => path !== GENERATED_ROUTE_TREE);
}
```

Prefer an exact path to a glob, remember that every exclude pattern matches unanchored, and run
`npm run test:coverage && npm run verify:coverage-scope`: the gate lists any file the new pattern
swallowed by accident.

## Design decisions & trade-offs

- **Vitest reuses `vite.config.ts`, minus the router plugin.** One config means tests resolve and
  transform modules exactly as the app does: the `@/` alias, the React transform, Tailwind. The
  exception is load-bearing. Outside production builds, `tanstackRouter`'s code splitter appends an
  `if (import.meta.hot)` hot-module-replacement block to the route modules it transforms;
  `import.meta.hot` is undefined under Vitest, so the statements inside could never run and would
  count as uncovered against each route module's per-file threshold, which a route module of a few
  statements cannot absorb. The cost is that the `autoCodeSplitting` transform never runs under
  Vitest; only the production bundle, driven by the end-to-end suite, exercises the split output.
- **`globals: false`.** Every test imports its API from `vitest`. The alternative, `globals: true`,
  would need `vitest/globals` in the `types` of `tsconfig.app.json`, and because that project also
  compiles every production module in `src/`, `describe`, `it` and `expect` would then type-check
  in production code too. The cost: Testing Library registers its automatic cleanup only when a
  global `afterEach` exists, so `vitest.setup.ts` calls `cleanup()` itself; without that line every
  rendered tree would stay mounted into the next test.
- **jsdom by default; plain Node only where MSW drives a real axios stack.** A single default keeps
  the rule simple, and most tests render React. The transport tests opt out because under jsdom
  axios selects its `xhr` adapter — its default adapter order is `['xhr', 'http', 'fetch']` and
  jsdom defines `XMLHttpRequest` — and MSW's XHR interception never enforces `xhr.timeout`. Run
  under jsdom, the timeout case in `http-client.test.ts` (a 20 ms client timeout against a handler
  that waits 200 ms) resolves with the body instead of rejecting as `timeout`. The cost is that
  these files exercise axios's Node adapter, not the browser's: the mapping of both `ECONNABORTED`
  and `ETIMEDOUT` to the `timeout` kind is unit-tested environment-independently in
  `src/shared/api/axios-error-mapper.test.ts`, and the browser adapter is covered only end to end.
  The environment also changes which path `singleFlight` takes: current Node 24 releases — the line
  `.nvmrc` pins — expose `navigator.locks` and jsdom does not, so
  `create-authenticated-transport.test.ts` acquires a real Web Lock while every jsdom test runs the
  lock-free path. `single-flight.test.ts` stubs `navigator` to pin both
  (see [Session management](./session-management.md)).
- **MSW, not a mocked axios adapter.** The transport tests send requests through a real axios
  instance, so interceptors, cancellation, header handling and status mapping are the code that
  ships, and MSW answers at the network boundary. `onUnhandledRequest: 'error'` turns a request no
  handler expects into a failure rather than a silent pass-through. MSW is a dev dependency used
  only through `setupServer` from `msw/node`: no browser service worker is installed (`public/`
  holds only `favicon.svg`; `npx msw init public/` would add one if the dev server ever needs mocked
  responses), and the end-to-end suite stubs the network with Playwright's `page.route` instead
  ([End-to-end testing](./e2e-testing.md)).
- **Doubles go through ports; module mocking is a composition-root tool.** Below `app` every unit
  receives its collaborators, so a test hands it plain objects typed against the port, and a port
  change fails `npm run typecheck` in every double at once. Module mocking appears only in tests of
  `app/entrypoint` and `app/router`: `vi.mock` in `app-providers.test.tsx` and
  `app-router-provider.test.tsx`, whose units construct their collaborators in `useState`
  initializers and so offer no injection point — and even there it wraps the real factory to count
  or redirect calls rather than replacing it — and `vi.doMock` in `app.test.tsx`, which swaps in an
  `AppProviders` that throws so the crash fallback can be observed (see
  [Error handling and reporting](./error-handling.md)).
- **A global English i18n instance, rebuilt before every test.** The application receives its
  instance by explicit injection through `I18nProvider`, and nothing in `src/` calls `setI18n`: the
  global is a test convenience, not the app's wiring. It exists so a page, form or view test can
  render with no provider and still get real English copy, which is what lets assertions be written
  against the text a user reads. It is built in `beforeEach` rather than at module scope so a test
  that changes the language cannot leak into the next, and with detection and caching off it never
  reads or writes the `app.locale` storage key, so storage assertions such as those in
  `src/shared/i18n/create-i18n.test.ts` see only what the instance under test did. The cost: the
  `createI18n` and `react-i18next` import bans apply to test files, so a test below `app` cannot
  build a non-English instance ([Internationalization](./internationalization.md)).
- **The browser-only setup steps are guarded, and the guard is mandatory.** Setup files run for
  every test file whatever its environment. In the node environment `window` is undefined and
  `localStorage.clear()` throws `ReferenceError: localStorage is not defined`, so without
  `isBrowserEnvironment` every test in the three MSW files would fail before its first assertion.
  `cleanup()` and the two `vi.stubGlobal` calls are harmless in Node and run unguarded.
- **`matchMedia` is stubbed once, and it is a hard requirement, not cosmetics.** jsdom 30 leaves
  `window.matchMedia` undefined, and `AppProviders` builds a `SystemThemeSource` from it on its
  first render — so without the stub every test that mounts the composition root would throw rather
  than merely log. The stub reports `matches: false`, i.e. a light system preference, which is why
  adding it changed no existing assertion.
- **`scrollTo` is stubbed once, for the whole suite.** `createAppRouter` sets
  `scrollRestoration: true`, and the router's scroll restoration calls a bare `scrollTo`, which
  jsdom does not implement: each call prints `Not implemented: Window's scrollTo() method` to the
  console. The tests stay green, but a green run full of errors reads like a regression, and every
  test that mounts the router would trip it.
- **Assertions target what a user perceives.** Queries by role and accessible name
  (`getByRole('button', { name: 'Add one second' })`) or by label fail when accessibility
  regresses — a button that loses its name, a status region that loses its role — which a test id
  would not notice. `userEvent` dispatches the whole event sequence a person produces (focus, key
  and pointer events), which is what lets `sign-in-form.test.tsx` prove a keyboard-only sign-in. Two
  refinements: provider components render no roles of their own, so provider tests assert with
  `getByText('child content')`; and a test that renders a guarded route names the heading it waits
  for, because `ResolvingSessionPage` — the guard's pending screen — has an `<h1>` of its own, and
  an unnamed `findByRole('heading', { level: 1 })` would resolve against it the moment it paints.
- **A page below `app` is tested without a router.** `home-page.test.tsx` renders `HomePage` with
  no router, deliberately: it is the executable proof that a page reads no route state, so keep it
  that way. `src/pages/resolving-session/ui/resolving-session-page.test.tsx` is the same kind of
  test. Two page slices have no co-located test, for different reasons. `pages/not-found` renders a
  `Link`, which needs a `RouterProvider` ancestor, and a test under `src/pages/` could not import
  one — lint allows only `Link` from `@tanstack/react-router` below `app` — so it is covered through
  the real route tree by `create-app-router.test.tsx` and end to end by `e2e/app-shell.spec.ts`.
  `pages/sign-in` is a
  heading around `SignInForm`, whose behaviour is tested in its own slice, and
  `src/app/routes/sign-in.test.tsx` renders the page through the real route tree — its heading, a
  rejected sign-in, and `onSignedIn` navigating home; a co-located test would stand up the same
  providers to assert nothing those suites do not.
- **The entry-point test mounts for real, and waits twice.** `src/main.tsx` renders `<App />` inside
  `StrictMode` through `createRoot(rootElement).render(...)`, and a React 19 root flushes that
  render asynchronously; the mounted `App` reaches `AppRouterProvider`, whose `RouterProvider`
  resolves its first route match asynchronously too. An assertion placed straight after the dynamic
  `import()` would therefore read an empty `#root`, so `src/main.test.ts` wraps the import in
  `act()`, which flushes the pending React work, and asserts the mounted `<h1>` through `waitFor`,
  which retries until that first match has painted.
- **Thresholds are per file, at 90% on all four metrics.** A global threshold lets a well-covered
  codebase absorb one untested module; a per-file threshold names the file that fell short. The
  threshold applies to source files, not to test files: a module may earn its coverage through
  another module's test, as `src/shared/ui/form/use-app-form.ts` does through the form component
  tests ([Forms](./forms.md)).
- **The exclusion list is minimal, and barrels are measured.** Vitest matches `coverage.exclude`
  with picomatch's `contains: true`, which makes every pattern an unanchored match against the
  absolute path, so a pattern ending `.ts` also matches its `.tsx` sibling. An earlier barrel
  exclusion, `src/**/index.ts`, silently excluded `src/app/routes/index.tsx` as well, so the
  per-file threshold never evaluated that route module. Commit `ad0bca2` found it, deleted the
  pattern rather than rewriting it — a cleverer list only moves where the hazard bites — and added
  the scope gate so the hole cannot reopen unnoticed. Barrels never needed excluding:
  `no-restricted-syntax` keeps every `src/**/index.ts` a pure re-export barrel with no coverable
  statements, so it cannot fail a threshold, and if logic ever lands in one it is measured rather
  than exempt.
- **The scope gate restates the policy instead of importing it.** `verify-coverage-scope.mjs`
  carries its own list of what is not measured (`TEST_FILE_PATTERN`, `DECLARATION_FILE_SUFFIX`,
  `GENERATED_ROUTE_TREE`) rather than reading `coverage.exclude`: a cross-check derived from the
  thing it checks proves nothing. The cost is that a genuine new exclusion is edited in both files,
  which is why the failure message names `vite.config.ts`. It parses the `SF:` records of
  `coverage/lcov.info` rather than a JSON summary because `JSON.parse` returns `any`, and
  `scripts/**/*.mjs` is linted with the type-aware rules (`recommendedTypeChecked` with
  `projectService`), so a JSON-based gate fails `@typescript-eslint/no-unsafe-argument` and takes
  the lint gate down with it.
- **Routing policy a constant cannot explain is asserted.** `create-app-router.test.tsx` asserts
  `defaultPreload: 'intent'`, `defaultPreloadStaleTime: 0`, `defaultPendingMs: 300`,
  `defaultPendingMinMs: 300` and `scrollRestoration: true`, so deleting one of those lines fails a
  test instead of silently restoring a vendor default. `defaultPreloadStaleTime: 0` stops the
  router keeping its own 30-second cache of loader results beside TanStack Query's; the two 300 ms
  values set how long a pending guarded route stays blank before `ResolvingSessionPage` appears and
  how long that page then holds, where the vendor defaults of 1000 ms and 500 ms would leave a cold
  load of a guarded route blank for up to a second. [Routing](./routing.md) owns the policy itself.
- **Disabled and focused tests cannot be committed.** `vitest/no-focused-tests` is an error, and
  `vitest/no-disabled-tests`, a warning in the recommended config, is fatal because `npm run lint`
  runs with `--max-warnings 0`. The lefthook `pre-commit` lint job passes the same flag for staged
  files, so a committed `it.skip` is rejected before it reaches `pre-push`.

## Testing

Only `src/shared/testing` is covered by tests of its own — `create-http-client-stub.test.ts`,
`parse-stub-response.test.ts` and `render-with-providers.test.tsx`, nineteen cases between them.
For the rest of the harness the suite is the test. With the user wire-contract change applied, that
suite is **85 test files and 562 tests**; `npm run test:coverage` reports 100% statements, branches,
functions and lines, and `npm run verify:coverage-scope` then prints
`Coverage scope verified: 158 source files measured.` The 90% per-file thresholds are the floor the
gate enforces, not a description of where the suite stands.

Each setup responsibility is load-bearing for specific files:

- The jest-dom import: every `toBeInTheDocument`-style assertion, and the matcher types that
  `npm run typecheck` checks.
- The global i18n instance: without it react-i18next has no instance to fall back to and `t`
  returns the key, so every test that renders translated copy without a provider —
  `home-page.test.tsx`, `resolving-session-page.test.tsx` and `sign-in-form.test.tsx` among them —
  would render keys such as `addOneSecond` where it asserts copy such as `Add one second`.
  `src/shared/i18n/i18n-provider.test.tsx` proves the reverse, that an injected instance wins over
  the global, so the global cannot mask a provider missing from a test that mounts one.
- `cleanup()`: without it, earlier renders stay mounted and role queries find duplicates.
- The `localStorage` and `<html>` resets: `src/app/entrypoint/app.test.tsx` stores `app.locale` as
  `ru` and leaves `<html lang="ru">`, and `app-providers.test.tsx` stores `app.theme` as `dark` and
  leaves `<html class="dark" style="color-scheme: dark">`, either of which would otherwise leak into
  the tests after it.
- The `isBrowserEnvironment` guard: the three node-environment files fail without it.
- The `scrollTo` stub: without it the router and route tests stay green but print jsdom's
  not-implemented error.
- The `matchMedia` stub: without it every file that mounts `AppProviders` or the real `App` —
  `app-providers.test.tsx`, `app.test.tsx` and `src/main.test.ts` — throws in
  `createSystemThemeSource()` rather than merely logging.

The coverage configuration is checked on every audit by `npm run verify:coverage-scope`. The CI
`Quality gates` job uploads `coverage/` as the `coverage` artifact, kept for 7 days, even when the
audit fails.

```sh
npm test
npx vitest run src/shared/api
npx vitest run src/pages/home/ui/home-page.test.tsx
npm run test:coverage
npm run verify:coverage-scope
npm run lint
npm run typecheck
npm run test:e2e
```

`npm test` runs the whole Vitest suite and `npx vitest run <path>` one file or folder.
`npm run test:coverage` adds the 90% per-file thresholds, and `npm run verify:coverage-scope` then
proves every source file was measured. `npm run lint` applies the Vitest rules, and
`npm run typecheck` catches type errors in tests along with the `@ts-expect-error` gate.
`npm run test:e2e` runs the Playwright suite against the production build; see
[End-to-end testing](./e2e-testing.md).

## Known limitations

- **A `*.spec.ts(x)` file under `src/` is only half supported.** Vitest collects it, and both the
  coverage exclusion and the scope gate skip it, but the ESLint Vitest block matches only
  `src/**/*.test.{ts,tsx}` and `routeFileIgnorePattern` only `\.test\.tsx?$`. A `.spec` file under
  `src/` therefore runs without the Vitest lint rules, and one under `src/app/routes/` would be
  picked up as a route module by the generator. Use `.test` under `src/`.
- **The setup file earns coverage that no assertion made.** `createI18n` runs before every jsdom
  test, so `src/shared/i18n/create-i18n.ts` and the modules it imports are executed in every run:
  `src/shared/lib/cn/cn.test.ts` run alone already covers every statement, function and line of
  `create-i18n.ts`. For those modules the per-file threshold cannot tell a tested file from one the
  setup merely executed; only their own tests do.
- **v8 scores an unexercised default as covered.** With the `v8` provider, a default parameter or
  a destructuring default reports its branch covered as soon as the function runs, whether or not
  the default ever fired. The 90% branch threshold therefore carries no signal for defaults; a
  default that matters needs its own assertion. `Button` destructures
  `const { asChild, type = 'button', ...buttonProps } = props` in
  `src/shared/ui/button/button.tsx`, and `button.test.tsx` pins that default with "defaults to type
  button so it never submits an enclosing form".
- **The MSW lifecycle is copied into each file.** All three node-environment files create their own
  `setupServer()` with the same `beforeAll`, `afterEach` and `afterAll` hooks. `shared/testing`
  deliberately does not cover them — they render no React and share nothing with the provider
  problem — so a new MSW-driven file repeats the block.
- **`vi.unstubAllGlobals()` also removes the setup file's `scrollTo` and `matchMedia` stubs** for
  the rest of that file — module-scope stubs are not reinstalled between tests.
  `single-flight.test.ts` and the theme adapter tests call it after each test and mount neither the
  router nor `AppProviders`, so it is harmless today, but a file that does both prints jsdom's
  not-implemented error on every navigation, or throws in `createSystemThemeSource()`, unless it
  re-stubs. `theme-bootstrap.test.ts` drops both deliberately and renders no React.
- **The harness's `QueryClient` is not production's.** `createTestQueryClient` is a bare client with
  retries off, while `createQueryClient` runs `staleTime: 30_000`, `gcTime: 300_000` and a
  `shouldRetryQuery` policy. Component tests therefore see refetch-on-mount behaviour production does
  not, and a change to the shared query policy in `shared/api` is felt by no test. Closing the gap
  means reusing `createQueryClient` behind a lint exemption, which would change the behaviour of
  every migrated test at once; it is worth its own step.
- **`wrappers` nests only inside the two built-in providers.** A caller cannot place anything above
  `QueryClientProvider` or `HttpClientProvider` — notably the `Suspense` boundary `AppProviders` puts
  between them, or an `ErrorBoundary` around the query provider. Nothing needs that today; a second,
  outer seam can be added when something does.
- **Five test files each hand-write a one-line session-provider wrapper.** A `withSessionEnder`
  helper in `entities/session` would remove the repetition and the fence would not block it, but it
  would put test-only exports into a runtime public API, which is a decision of its own.
- **Almost nothing tests the lint configuration.** `verify:import-fence` covers one rule — the
  `@/shared/testing` fence and the `import-x` resolver it rests on — and nothing else. The comment
  above the order-sensitive blocks in `eslint.config.js` still holds for the rest: flat config
  replaces `no-restricted-imports` options rather than merging them, so a block appended later that
  also matches test files would swap their fences wholesale, and a relaxation would pass every gate.
  The test-file carve-outs are verified only by today's files linting clean.
