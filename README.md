# frontend-boilerplate

A React + TypeScript starting point wired for Feature-Sliced Design, typed linting, accessibility
linting, architectural linting, and a coverage-gated test suite. Every quality gate runs from one
command: `npm run audit`.

## Requirements

- Node.js `>=24.0.0`
- npm `11.16.0` (declared via `packageManager`)

`.npmrc` sets `engine-strict=true`, so `npm install` and `npm ci` **fail** with `EBADENGINE` on a
Node older than the `engines.node` floor instead of only warning. It does not gate `npm run`.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

`/users/:id` is a live demo route and the reference `entities` slice. It renders its alert state
until `VITE_API_BASE_URL` points at an API serving `GET /v1/users/:id`; the shape it expects is
`src/entities/user/api/user-dto.ts`.

## Stack

| Concern             | Choice                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| UI                  | React 19                                                                       |
| Routing             | TanStack Router 1, file-based route generation                                 |
| HTTP transport      | axios 1                                                                        |
| Server state        | TanStack Query 5                                                               |
| Forms               | TanStack Form 1, `createFormHook` composition                                  |
| Schema validation   | Zod 4, consumed through Standard Schema                                        |
| i18n                | i18next 26 + react-i18next 17, browser language detector, resources-to-backend |
| Devtools            | TanStack Query + TanStack Router devtools                                      |
| Language            | TypeScript 6.0 (strict, `verbatimModuleSyntax`)                                |
| Build / dev         | Vite 8, `@vitejs/plugin-react`, `@tanstack/router-plugin`                      |
| Linting             | ESLint 10 flat config + typescript-eslint 8                                    |
| React / JSX         | `@eslint-react/eslint-plugin`                                                  |
| Router / Query lint | `@tanstack/eslint-plugin-router`, `@tanstack/eslint-plugin-query`              |
| Accessibility       | oxlint, `jsx-a11y` rules only                                                  |
| Import order        | `eslint-plugin-import-x`                                                       |
| Formatting          | Prettier 3                                                                     |
| Architecture        | steiger + `@feature-sliced/steiger-plugin`                                     |
| Tests               | Vitest 4 + Testing Library + jsdom                                             |
| API mocking (tests) | MSW 2                                                                          |
| Coverage            | `@vitest/coverage-v8`, 90% per-file thresholds                                 |

### Why TypeScript is pinned to `~6.0.x`

TypeScript 7 is published, but it breaks the lint gate outright: ESLint exits with code 2 having run
zero rules, dying at module load inside the duplicated `@typescript-eslint` tree that TS 7 leaves
behind. `tsc` itself compiles this codebase fine on TS 7; only the linter breaks. The install does
not fail either, but it prints `ERESOLVE overriding peer dependency` dozens of times, leaves
duplicated `@typescript-eslint/*` trees, and makes `npm ls typescript` exit 1.

`~6.0.2` therefore means "the newest TypeScript the linter can actually run on". Widen it only after
typescript-eslint ships a release whose supported range includes it — check with
`npm view typescript-eslint peerDependencies`.

### Why two linters

ESLint is the primary linter and owns everything type-aware, including JSX correctness via
`@eslint-react/eslint-plugin`. oxlint is present for exactly one reason: `eslint-plugin-jsx-a11y`
has not been published since October 2024 and its peer range stops at ESLint 9. A `package.json`
`overrides` entry does make it install and work under ESLint 10, but that pins the accessibility
gate to an unmaintained plugin. oxlint's `jsx-a11y` plugin has no ESLint peer dependency at all and
is actively released. `.oxlintrc.json` enables 36 `jsx-a11y` rules and turns oxlint's own
`correctness` category off, so the two linters overlap by zero rules.

That rule list is generated, not hand-maintained: `scripts/a11y-rules.mjs` reads oxlint's own JSON
schema. `npm run lint:a11y` runs it with `--check` first and fails if the schema has a `jsx-a11y`
rule the config lacks, if a rule is relaxed below `error`, or if the config names a rule the schema
no longer has — so an oxlint upgrade cannot silently leave new a11y rules off. `npm run
lint:a11y:fix` regenerates the file.

## Scripts

| Script                          | What it does                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run verify:lock`           | `npm ci --dry-run --ignore-scripts` — fails if `package-lock.json` is out of sync. Works offline.    |
| `npm run dev`                   | Vite dev server with HMR.                                                                            |
| `npm run build`                 | `tsc -b` (project references) then `vite build` into `dist/`.                                        |
| `npm run preview`               | Serves the built `dist/` locally.                                                                    |
| `npm run typecheck`             | `tsc -b --pretty` — types only, no emit.                                                             |
| `npm run lint`                  | ESLint over the repo with `--max-warnings 0`; warnings fail the run.                                 |
| `npm run lint:fix`              | ESLint with `--fix`.                                                                                 |
| `npm run lint:a11y`             | a11y rule-list drift check, then oxlint accessibility rules over `src`.                              |
| `npm run lint:a11y:fix`         | Regenerates `.oxlintrc.json` from oxlint's schema and formats it.                                    |
| `npm run format`                | Prettier `--write` over the repo.                                                                    |
| `npm run format:check`          | Prettier `--check`; fails on any unformatted file.                                                   |
| `npm run test`                  | Vitest, single run.                                                                                  |
| `npm run test:watch`            | Vitest in watch mode.                                                                                |
| `npm run test:coverage`         | Vitest with v8 coverage and the 90% per-file thresholds enforced.                                    |
| `npm run test:e2e`              | Playwright over the production build in Chromium. Not part of `audit`; CI runs it as its own job.    |
| `npm run test:e2e:ui`           | Playwright's interactive UI runner.                                                                  |
| `npm run test:e2e:report`       | Opens the HTML report from the last `test:e2e` run.                                                  |
| `npm run arch`                  | steiger over `./src` — Feature-Sliced Design rules.                                                  |
| `npm run audit`                 | Runs every gate in sequence. The list lives in the `audit` script in `package.json` — read it there. |
| `npm run verify:coverage-scope` | Fails if any source file escaped coverage measurement. Runs last in `audit`.                         |
| `npm run audit:deps`            | `npm audit --omit=dev --audit-level=high`. Needs the network; runs in CI, not in `audit`.            |

`npm run audit` is the gate that must be green before anything is committed or merged. It takes
about 11 seconds warm. Every gate in it runs offline; a vulnerability scan
(`npm audit --omit=dev --audit-level=high`) needs the network and therefore belongs to CI.

## Automated enforcement

Every gate in `npm run audit` runs at three points:

| When                          | What runs                                                                          | Scope                            |
| ----------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| `pre-commit`                  | prettier, eslint, oxlint, plus glob-gated a11y-config and lockfile checks          | staged files only                |
| `pre-push`                    | `npm run audit`                                                                    | whole repository                 |
| pull request / push to `main` | `npm run audit` and `npm run test:e2e` (blocking), `npm run audit:deps` (advisory) | whole repository, clean checkout |

Hooks are managed by [lefthook](https://github.com/evilmartians/lefthook). They install themselves on
`npm install` via the package's own postinstall, which skips when `CI` is set. To reinstall by hand:
`npx lefthook install -f`.

CI runs the same `npm run audit` you run locally, so the gate list lives in `package.json` only —
plus a second, parallel `End-to-end tests` job running `npm run test:e2e`. That one is deliberately
outside `audit`: a gate that builds the app and boots a browser does not belong in a pre-push hook.
See [End-to-end tests](#end-to-end-tests).

Hooks can be bypassed with `git commit --no-verify` / `git push --no-verify`, so `pre-push` is a
strong default rather than a guarantee.

CI always runs and cannot be skipped, but it only _blocks_ a merge once `Quality gates` and
`Dependency audit` are set as required status checks on `main`. That requires a public repository or
GitHub Pro; while this repo is private on the free plan, CI is advisory and `pre-push` is the real
gate.

## Architecture — Feature-Sliced Design

Layers, from lowest to highest. A module may only import from layers **below** it.

| Layer      | Purpose                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `shared`   | Framework-agnostic building blocks: `ui`, `lib`, `api`, `config`, `i18n`. |
| `entities` | Business nouns and their models, DTO mappers, and presentation.           |
| `features` | Single user actions that change state.                                    |
| `widgets`  | Compositions of entities and features into self-contained page blocks.    |
| `pages`    | Route-level screens assembled from widgets, features, and entities.       |
| `app`      | Composition root: providers, routing, global styles, the shell.           |

Present today: `app`, `pages`, `features`, `entities`, `shared`. `widgets` arrives with its first
real slice.

`pages/home` and `shared/lib/format-duration` are worked examples, not product code. They exist so
that every gate has something to bite. Replace them with the first real slice and helper.
`pages/not-found` is a second `pages` slice and, unlike `home`, is **not** a throwaway — it is the
router's 404 screen and stays.

### Rules

- **Downward imports only.** `features` may use `entities` and `shared`; `entities` may not reach
  into `features`. steiger's `fsd/forbidden-imports` enforces this.
- **Public API only.** Import a slice through its `index.ts` barrel (`@/pages/home`), never through
  an inner file (`@/pages/home/ui/home-page`). steiger's `fsd/no-public-api-sidestep` enforces this
  for files inside a layer.
- **Group `shared/lib` and `shared/ui` helpers into folders.** `shared/lib/format-duration/` with
  its own `index.ts`, not a flat `shared/lib/format-duration.ts`. steiger only enforces the public
  API of these two segments at the folder level; a flat file is unprotected.
- **Import the group, not the segment.** `@/shared/lib/format-duration`, never a `@/shared/lib`
  segment barrel. `shared/lib` and `shared/ui` have no segment `index.ts`: one that re-exported
  every helper would grow a line per helper and would give each symbol two sanctioned import paths.
  steiger does not require an index on these two segments, so `no-restricted-imports` bans the bare
  segment path instead.
- **Configuration is read at the composition seam, not at the leaf.** `app/entrypoint/app.tsx` and
  the route modules under `app/routes` are the composition seam; no module outside `app` reads
  `@/shared/config`. They pass flat scalars down as props. A page or widget that reads `appConfig`
  itself becomes untestable without `vi.stubEnv()` and unusable with a different value, so keep the
  read at the top and the props narrow. This one is a convention — nothing lints it.
- **Barrels re-export, they do not execute.** A barrel contains `export` statements and nothing
  else. `no-restricted-syntax` on `src/**/index.ts` rejects any other statement and any
  declaration-carrying export, because the barrel is the slice public API — logic placed here is
  unreachable through the slice contract and untestable in isolation. Side effects such as `import './styles/index.css'` belong in the module that
  owns them — the global stylesheet is imported by `app/entrypoint/app.tsx`, not by the `app` barrel
  and not by `src/main.tsx`.
- **`src/main.tsx` is outside the layer system.** steiger does not analyse it, so a
  `no-restricted-imports` block stands in: `@/app` is the only `@/` path it may import, and relative
  imports that reach into a directory are banned outright.
- **Create a layer only when it has real content.** Add a layer directory in the same commit as the
  first slice that lives in it. An empty directory holding only a `.gitkeep` does pass steiger, but
  it advertises structure that does not exist.
- **Slices, then segments.** Inside `entities`, `features`, `widgets`, and `pages`, the first level
  is a slice (`pages/home/`), the second is a segment (`ui/`, `model/`, `api/`, `lib/`). `shared`
  and `app` have segments but no slices.
- **Avoid the forbidden segment names.** `fsd/segments-by-purpose` rejects roughly seventy segment
  directory names, including `providers`, `store`, `context`, `hooks`, `types`, `constants`,
  `utils`, `helpers`, `components`, `services`, `schemas`, `validators`, `assets`, `modals`,
  `selectors`, `actions` and `reducers`. `BAD_NAMES` in
  `@feature-sliced/steiger-plugin/dist/index.js` is the source of truth. It checks directories
  only, so these concepts are fine as files (`shared/api/http-client-context.ts`).
- **API data is mapped, never leaked.** The frontend owns its own models; responses arrive as DTOs
  and are converted by explicit mappers before crossing into `model`.
- **Transport lives in `shared/api`,** which owns its own injection adapter (context + provider).
  No axios type appears in its public API; every failure leaves it as an `HttpError`. Construct the
  client only in `app/entrypoint` — `no-restricted-imports` blocks `createHttpClient` and
  `createQueryClient` across all five non-`app` layers, `shared` included, **and from `app/routes`
  and `app/router`**. Importing `axios` by name is banned across those same layers too, with a
  carve-out for `src/shared/api/**`, the one segment that must import it. Everything else calls
  `useHttpClient()`; route and router modules receive the transport through the router context.
- **Display copy lives in `shared/i18n`, and the instance is constructed in `app/entrypoint`.**
  No component below `app` holds a user-facing string literal; it calls `t()` or renders `<Trans>`,
  both re-exported from `@/shared/i18n`. `no-restricted-imports` bans `i18next`, `react-i18next`,
  `i18next-browser-languagedetector` and `i18next-resources-to-backend` outright across the five
  non-`app` layers **and** from `app/routes` and `app/router`, with a carve-out for
  `src/shared/i18n/**` — the segment that has to import them. A ban rather than an allow-list of
  blessed export names, because an allow-list leaves the barrel a convention rather than a
  boundary: `allowImportNames: ['Trans', 'useTranslation']` lets a page import `useTranslation`
  from `react-i18next` with no error at all. `createI18n` is additionally blocked on the
  `@/shared/i18n` barrel route everywhere except `app/entrypoint`.
- **Forms are built through `shared/ui/form`, which is the only module that knows TanStack Form.**
  `no-restricted-imports` bans `@tanstack/react-form` across the five non-`app` layers **and** from
  `app/routes` and `app/router`, with `allowTypeImports: true` — a slice that splits a long form
  into sections has to name the `form` object's type in a prop, and that is the same bargain
  `shared/i18n` strikes with `i18next`. A `patterns` regex additionally bans
  `@tanstack/form-core` and `@tanstack/react-store`, because `paths[].name` is an exact-specifier
  match and would leave the sibling packages as an open route to the same API. `src/shared/ui/form`
  is exempt, and its exemption block must stay the **last** block matching those files: flat config
  replaces rather than merges `no-restricted-imports` options, so a `src/shared/**` block appended
  below would silently kill it and nothing tests the flat config.
- **No concrete validator inside `shared/ui/form` or `shared/api`.** Both seams validate through
  [Standard Schema](https://standardschema.dev), never against `zod` by name, and a `patterns`
  regex on `^(zod|valibot|arktype|yup|joi|superstruct)(/|$)` makes that a lint error rather than an
  intention. It is a pattern rather than a `paths` entry because an exact-name ban on `zod` would
  still let `zod/mini` straight through — and `zod/mini` is not a loophole but a supported choice:
  the escape hatch for the form seam, and the default for DTO schemas. Both seams' own test files
  are exempt: they prove the real Standard Schema path with a real Zod schema.
- **Error boundaries are built through `shared/ui/error-boundary`, the only module that knows
  `react-error-boundary`.** `no-restricted-imports` bans the package across every block that fences
  a vendor — the five non-`app` layers, `app/routes`, `app/router`, and `src/main.tsx` — plus the
  generic `src/**` block, which is what covers `app/entrypoint`. `src/shared/ui/error-boundary` is
  exempt, and like the form block its exemption must stay after the `src/{...,shared}/**` block for
  the same replace-not-merge reason; its glob does not overlap `src/shared/ui/form/**`, so the two
  exemptions coexist. The seam forwards only `FallbackComponent`, never `fallbackRender`: the
  vendor calls a `fallbackRender` function directly inside its own class `render()`, so the
  fallback gets no fiber and any hook it calls throws _Invalid hook call_ from a position no
  boundary can catch.
- **Every `form.Subscribe` / `useSelector` selector returns a scalar.** TanStack Store compares
  selector results referentially (`defaultCompare` is `a === b`) and `form.Subscribe` exposes no
  `compare` option, so a selector returning `{ canSubmit, isSubmitting }` allocates a fresh object
  on every store change and re-renders its subtree on every keystroke anywhere in the form.
  Subscribe twice rather than returning a pair.
- **A submit button is never disabled for invalidity, only while submitting.** Disabling it removes
  the only keyboard route to the error announcement: errors are revealed on blur-or-submit, so an
  untouched invalid form would show nothing while offering no way forward. Pressing submit runs
  validation, marks every field touched and reveals every error. `submit-button.test.tsx` pins this.
- **A form-validator schema does not transform.** TanStack Form validates against the Standard
  Schema but hands `onSubmit` the raw values, so the value type is `z.input<…>`, never `z.infer<…>`
  (an alias for `z.output<…>`). The compiler catches only the loud half — `FormValidateOrFn`
  constrains the schema's _input_, so `z.coerce.number()` on a string field is a compile error,
  while `.trim()`, `.toLowerCase()`, `.default()` and `.catch()` pass silently and would send
  untransformed data on toward the DTO mapper. If a slice needs parsing, call `schema.parse(value)`
  inside `onSubmit` before mapping to the domain model.
- **Routing lives in `app`, and route modules are thin adapters.** URL→component wiring sits in
  `app/routes` (file-based: the file name is the URL), router construction and policy in
  `app/router`. A route module reads route state and config, then hands plain props to a page.
  Below `app` the only importable router API is `<Link>` — anything that reads route state
  (`useParams`, `useSearch`, `useNavigate`, `getRouteApi`, …) stays in `app/routes`.
  `no-restricted-imports` enforces this as an allow-list, so a router export added in a future
  minor is banned by default rather than silently permitted. A `shared/ui` link wrapper that needs
  a router _type_ widens the entry with `allowTypeImports: true`, not with a new allowed name.
- **The router context carries only app-wide ports.** `AppRouterContext` holds the `HttpClient`
  port and the `QueryClient` — things a loader needs injected because they vary by environment or
  must be swappable in a test. A dependency only one subtree needs arrives through that subtree's
  `beforeLoad` return value, which the router merges into the child context. Module singletons such
  as `appConfig` are imported directly rather than threaded through. Every route inherits the root
  context, so a member added there is a dependency forced on routes that will never use it.
- **The route tree is generated and committed.** `src/app/router/route-tree.gen.ts` is written by
  `@tanstack/router-plugin`; it is linted, formatted and coverage-excluded, but it is **not**
  gitignored — `npm run typecheck` runs `tsc -b` with no Vite in the process, so an ignored tree is
  an immediate failure on a fresh clone. Only `npm run dev` and `npx vite build` regenerate it;
  `npm run build` and `npm run audit` cannot, because `tsc -b` runs first and aborts. So adding a
  route is two steps: write `src/app/routes/<path>.tsx`, then run `npx vite build` (or leave the
  dev server running) and commit the regenerated tree. A stale tree is a hard `typecheck` failure,
  never a silent one.
- **A page renders exactly one `<main>` and exactly one `<h1>`.** `home-page.test.tsx` queries
  `heading, { level: 1 }` with no name and would throw on a second `<h1>`; a second `<main>` is a
  landmark ambiguity that no gate catches.
- **The app is an SPA, so the host must rewrite unmatched paths to `/index.html`** (nginx
  `try_files`, Netlify `_redirects`, an S3 error document, a GitHub Pages `404.html`). Vite's dev
  server and `vite preview` both do this automatically, which is exactly why forgetting it is
  invisible until production, where every deep link 404s.

## File naming

| Kind                 | Convention                                               | Example                                                  |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Every file           | `kebab-case`                                             | `src/shared/lib/format-duration/format-duration.ts`      |
| React component file | `kebab-case.tsx`, one `PascalCase` export named after it | `src/pages/home/ui/home-page.tsx` exports `HomePage`     |
| Barrel / public API  | `index.ts`                                               | `src/shared/lib/format-duration/index.ts`                |
| Global stylesheet    | `index.css`                                              | `src/app/styles/index.css`                               |
| Test                 | Co-located `*.test.ts(x)`                                | `src/shared/lib/format-duration/format-duration.test.ts` |
| End-to-end spec      | `e2e/**/*.spec.ts`, not co-located                       | `e2e/user-profile.spec.ts`                               |

Four files under `src/app` do not follow the table, by convention rather than by oversight:
`routes/__root.tsx`, `routes/index.tsx`, `routes/users.$userId.tsx` and its co-located
`routes/users.$userId.test.tsx` follow TanStack's file-name-is-the-URL rule.
`router/route-tree.gen.ts` is generated, and `generatedRouteTree` in `vite.config.ts` is what keeps
its name on the table.

The `.spec` suffix is the one sanctioned departure from `*.test.ts(x)`, and it is load-bearing: it
says at a glance that a file runs in a real browser against the built bundle rather than in jsdom,
and `e2e/` sits outside `src/` because the suite observes the deployed artefact rather than
belonging to a layer. Page objects are named `*-page-object.ts` under `e2e/page-objects/` so that
neither the folder nor the exported symbol can be mistaken for the FSD `pages` layer.

- Tests sit next to the code they cover, never in a parallel `__tests__` tree.
- Components are styled with Tailwind utilities against the semantic tokens declared in
  `src/shared/ui/theme.css` — `bg-primary`, `text-muted-foreground` — never literal palette values.
  A `shared/ui` primitive **that has variants** owns them in a sibling `*-variants.ts` through
  `cva`. One that has none does not get an empty `cva` wrapper — `Input` is styled inline and
  gains the file the day it gains a second variant.

## Import order

Enforced by `import-x/order`: builtin → external → internal (`@/…`) → parent → sibling → index,
alphabetised within each group, blank line between groups. `npm run lint:fix` reorders value
imports automatically.

Side-effect imports (stylesheets) are **not** ordered by the rule — by convention they go last, but
nothing enforces it, and `--fix` will not move code across one.

## Environment variables

Only variables prefixed `VITE_` reach the client bundle. Declare each one in `env.d.ts` so
`import.meta.env` stays typed, and read it through `@/shared/config` rather than touching
`import.meta.env` at the call site. Never put a secret behind a `VITE_` prefix — it is compiled
into the public bundle and is readable by every visitor.

| Variable            | Default | Meaning                    |
| ------------------- | ------- | -------------------------- |
| `VITE_API_BASE_URL` | `/v1`   | Base URL for API requests. |

The default is a **path**, not an origin, and `vite.config.ts` proxies `/v1` to
`http://localhost:8000` in development. That makes every request same-origin — no CORS, no
preflight on the recovery path, no `sameSite` question — and mirrors the reverse-proxy topology a
production deployment should use. The `/v1` prefix is load-bearing rather than cosmetic: the
refresh cookie is issued with `path: '/v1/auth'`, so a base URL missing it produces requests the
browser refuses to attach the cookie to, and every renewal then fails with a 401 that looks exactly
like an expired session.

`env.d.ts` opts into `ViteTypeOptions.strictImportMetaEnv`. Without it Vite's `ImportMetaEnv`
extends `Record<string, any>` and a misspelled variable type-checks clean; with it, the typo is a
`tsc` error. Keep the block.

Blank and whitespace-only values fall back to the default — `VITE_API_BASE_URL=` in a `.env` is an
ordinary state, and `??` alone would bake an empty string into the bundle.

`.env.example` is committed and is the list of variables the app understands. Every real `.env*`
file is gitignored.

Vite loads `.env` files in **test** and **build** runs too, so a developer's local `.env` would
otherwise change what the suite asserts and what ends up in the bundle. `src/shared/config` is the
single module that reads `import.meta.env`, and `src/shared/config/app-config.test.ts` is the single
test file that pins it with `vi.stubEnv()` plus `vi.resetModules()` and a dynamic `import()`.
Everything downstream takes the resolved values as props and is tested with plain literals, with
one sanctioned exception: `src/app/routes/index.tsx` reads `appConfig` directly, because a route
module is a composition seam, and it is exercised against real config values through the router
tests.

## Data layer

`shared/api` is the only place that speaks HTTP. It exposes a transport port, a response-schema
port, a credential port, a frontend-owned failure model, and a configured TanStack Query cache —
and no axios type at all. That last clause still holds after the credential port arrived:
`BearerTokenSource` is two plain functions, and `attachBearerToken` — the one module that names
`AxiosInstance` — is deliberately absent from the barrel.

```tsx
const httpClient = useHttpClient();

const things = useQuery({
  queryKey: ['things'],
  queryFn: ({ signal }) => httpClient.get('/things', { signal, schema: thingDtoListSchema }),
});
```

Passing the `signal` TanStack Query hands the `queryFn` is what makes a superseded request abort
rather than race; the transport turns that abort into an `HttpError` of kind `canceled`, which the
retry policy then declines to retry.

- **`createHttpClient` is a factory, never a module singleton.** Nothing outside `@/shared/config`
  reads `import.meta.env`; the base URL arrives as a plain string, which is what keeps every
  consumer testable with a literal.
- **`app/entrypoint/app-providers.tsx` owns every client lifetime,** each held in a `useState` lazy
  initializer so its identity is stable for the component's lifetime. `useMemo` would not do:
  React may discard a memo result, and each of them owns live state (an interceptor chain, a query
  cache, an in-memory access token). The transport is built by
  `app/entrypoint/create-authenticated-transport.ts`, which composes the two HTTP clients and the
  session collaborators behind one call.
- **`useHttpClient()` is the only sanctioned way to reach the transport.** Three gates hold it, and
  none is sufficient alone. `no-restricted-imports` blocks `createHttpClient` and
  `createQueryClient` on the barrel route, from all five non-`app` layers **and from `app/routes`
  and `app/router`** — only `app/entrypoint` constructs clients. steiger's
  `fsd/no-public-api-sidestep` blocks the deep route (`@/shared/api/http-client`) — but only from
  another layer, because steiger skips same-layer imports, so a second `no-restricted-imports`
  pattern bans `@/shared/api/*` to stop a `shared/lib` helper sidestepping into a module-level
  singleton. All three of those match the import path, so they are drift protection, not a
  sandbox: a `shared` module writing `../api/http-client` is outside every gate. Importing `axios`
  by name, however, is now banned from all five lower layers as well as from `app/routes` and
  `app/router`. The `src/shared/i18n/**` carve-out is the pattern that made it possible: a
  per-segment config object restates the rules for `src/shared/api/**`, the one segment that must
  import the library, and a second block after it re-exempts that segment's own tests from the
  validator ban. Two honest gaps remain — the `app` layer outside `routes`/`router`
  (`app/entrypoint`, the `app` barrel) and `src/main.tsx` are covered by no axios ban, and no
  import rule can stop `fetch` or `XMLHttpRequest`. Drift protection, still not a sandbox.
- **Every failure is an `HttpError`** with a `kind` of `canceled`, `client`, `network`, `server`,
  `timeout`, `unknown` or `validation`. `message` is diagnostic, never display copy — user-facing
  text is the UI layer's job, and putting it here would drag i18n into the transport. Narrow with
  `isHttpError`; the query error type stays `Error`, deliberately un-augmented, because TanStack
  also throws its own `CancelledError` and a `queryFn` can throw anything.
- **Cache defaults:** 30 s `staleTime`, 5 min `gcTime`, and up to 2 retries — for `network`,
  `timeout` and `server` failures plus HTTP 429 only. Mutations never retry, because they are not
  assumed idempotent. `createQueryClient(overrides)` merges per group, so a test can set
  `retry: false` without losing `gcTime`.
- **`allowAbsoluteUrls: false`** forces every request under `baseURL`. Without it axios ignores
  `baseURL` for an absolute URL while the auth interceptor still attaches credentials — one
  `${userSuppliedUrl}` away from shipping a bearer token to a third-party host. A different host
  needs a second client, deliberately.
- **Credentials are redacted from serialized errors.** The original `AxiosError` is kept on
  `HttpError.cause` for diagnostics, and `AxiosError.toJSON()` serializes `config` in full, so a
  reporter that walks the cause chain would otherwise ship `Authorization: Bearer <jwt>` offsite.
  `redact` builds a snapshot for serialization only and never touches the outgoing request.
  `authorization`, `cookie` and `set-cookie` are redacted by default; a custom scheme names its own
  secret through `redactedHeaders`.
- **`bearerTokenSource` is the credential port, and it owns `Authorization` alone.** Pass nothing
  and neither interceptor is registered. Pass one and the client sends `Authorization: Bearer
<token>` on every request, and on a `401` renews once, replays the request through the request
  interceptor so the replay carries the _new_ token, and returns the replayed response to the
  caller. The port is `getToken()` plus `renewToken(staleToken)`; `renewToken` receives the token
  the failed request actually carried, so the source can tell "my credential expired" from "someone
  else already replaced it". A caller-supplied `Authorization` header is overridden — on this
  client the header belongs to the source.
- **Interceptor registration order is a correctness requirement.** `attachBearerToken` registers
  before `normalizeErrors` so its error handler receives the raw `AxiosError` — the only value that
  still carries `config`, and therefore the only value that can be replayed. Swap the two and ten
  tests redden; `attach-bearer-token.test.ts` names one of them after the reason.
- **The renewal itself lives in `entities/session`, not here.** The transport knows one HTTP fact —
  "a 401 means ask for a fresh bearer token, once" — and `bearerTokenRenewed`, stamped on the
  replay config, is what stops a second 401 looping. It survives axios's `mergeConfig`, which a
  `WeakSet` keyed on the config object would not: axios hands the replay a merged clone.
- **`renewToken` is called through a guard.** `BearerTokenSource` is an interface anyone may
  implement, and a foreign implementation that rejects must not escape as a non-`HttpError` into
  React Query, so a rejected renewal is converted to "no token" and the request fails with its
  original 401. `getToken` totality is contractual and unguarded, deliberately.
- **`sendCookies` is off by default** and is named for what it does rather than for axios's
  `withCredentials`, the same way `baseUrl` and `timeoutMilliseconds` are. Only the client that
  calls `/auth/refresh` turns it on. Cookie behaviour is browser-only, so no test in this repo
  asserts it — `http-client.test.ts` runs under the Node adapter, where the flag is a no-op.
- **Every request carries a response schema.** All five verbs take a required `schema` in their
  config — a `ResponseSchema<T>`, which is the Standard Schema interface, so each slice picks its own
  validator and `shared/api` never imports one. The body is validated before it leaves the transport,
  so a `TResponse` assertion is no longer expressible. A mismatch rejects as an `HttpError` of kind
  `validation` carrying `issues` of `{ path, message }`; `payload` is `null` there, deliberately, so
  an unmodelled body is never copied into an error that gets logged. Validation failures are never
  retried. `noContentSchema` covers a `204`. A schema that itself throws or rejects is a bug on our
  side, not contract drift, so it normalizes to kind `unknown` with the original error on `cause` —
  which keeps the rule that `issues` is non-empty only when the response body is at fault.
- **Every schema in `src/` uses `zod/mini` — DTO and form alike.** Measured on this repo, the same
  object schema costs ≈17 kB gzip with classic `zod` against ≈3.2 kB with `zod/mini` — about 5×,
  on a ~2.2 kB floor for any mini schema. That ratio holds wherever the schema lands, and an
  entity's DTO schema is reached by every route touching that entity **through its `loader`**,
  which is the half `autoCodeSplitting` cannot split — so it lands in the entry chunk every page
  view loads. Measured on `entities/user`, `routes-*.js` did not change size at all. The rule
  once exempted forms, on the reasoning that `autoCodeSplitting` confines a form to one route's
  chunk and classic `zod`'s chainable wrappers read better in long refined validators.
  `features/update-user-name` retired that exemption: the feature's route chunk **already**
  carries the entity's `zod/mini` DTO schema, so reaching for classic `zod` beside it would ship
  both validator runtimes into the same chunk — paying the ≈17 kB to avoid a syntax preference.
  The same argument had always applied to a field-level schema shared with a DTO; it applies to
  every schema. `zod/mini` composes functionally: `zm.nullable(zm.string())`, never
  `zm.string().nullable()`, and refinements go through `.check(zm.refine(predicate, message))`.
  Response-validation messages are developer-facing diagnostics, never display copy; form
  messages are copy, and reach the schema as resolved strings — see [Forms](#forms). (The table
  under **Bundle size baseline** reports 18.24 / 4.49 kB for the same packages: it measures each
  schema bundled in isolation with React external, not a marginal delta.)
- **`src/entities/user` is the reference implementation.** It is the canonical DTO → mapper →
  domain example, in both directions: `api/user-dto.ts` holds the wire shape the server owns
  (`snake_case` keys, a split name, uppercase role constants, a timestamp as a string), and
  `model/user.ts` holds the shape the frontend owns (`camelCase`, a lowercase role union, a real
  `Date`, a branded `UserId`, and no dependency on any library). `api/user-mapper.ts` holds the
  pure functions between them — no I/O, no clock, no i18n: `toUser` inbound and
  `toUpdateUserNameDto` outbound. **`User.displayName` is a cached projection of `firstName` and
  `lastName` whose sole author is `toUser`** — no module outside the mapper may construct or alter
  a `User`, and a fixture must keep the three fields consistent, which no type can enforce.
  `api/user-queries.ts` gives the read's cache key and fetcher one home through `queryOptions()`,
  `api/user-mutations.ts` gives the write its `mutationOptions()` **and the invalidation those
  keys imply**, because which queries a user write invalidates is the entity's own knowledge; each
  depends on the narrowest port it uses — `Pick<HttpClient, 'get'>` and `Pick<HttpClient, 'patch'>`
  — rather than the whole five-verb interface. `api/user-resource-path.ts` is the one builder both
  reach for, so the dot-segment guard cannot be applied to reads and forgotten on writes. **An
  entity's `index.ts` exports the domain model and the slice's collaborator factories, never the
  DTO type, its schema, a mapper, a path builder or a query-key object**: all of those are absent
  from the barrel by design, so no module outside `entities/user/api/` can name the wire shape.
  Copy this slice for the next entity.
- **`entities/session` is the same anatomy with a different surface.** `model/` holds the branded
  `AccessToken`, the `RefreshResult` union, the in-memory `AccessTokenStore` and the renewal policy
  in `session-token-source.ts`; `api/` holds the wire schema, the mapper and the one HTTP call.
  Its barrel publishes three collaborator factories — `createAccessTokenStore`, `createSessionApi`,
  `createSessionTokenSource` — and no domain model and no TanStack option factory, because nothing
  above it renders a session yet. The prohibitions are unchanged: the DTO, its schema, the mapper
  and `SessionWriteClient` all stay inside the slice.
- **The access token lives in a closure variable — never `localStorage`, never `sessionStorage`.**
  Anything readable by JavaScript is readable by injected JavaScript; an in-memory token limits an
  XSS payload to the current page lifetime instead of handing it a live credential to exfiltrate.
  Durability comes from the `httpOnly` refresh cookie, which script cannot read by construction.
  The cost is stated plainly: a page reload wipes the token, so the first authenticated request
  after every load is a guaranteed `401` + refresh + replay — one extra round trip, and a 401 in
  every devtools and APM trace. A boot-time refresh can hide it later.
- **Renewal is de-duplicated origin-wide, not module-wide.** `shared/lib/single-flight` collapses
  concurrent callers in one tab onto a single promise and serializes across tabs on a Web Lock.
  Both layers matter: because the token is deliberately in memory, _every_ tab boots with an empty
  store and fires a bare first request, so two restored tabs 401 simultaneously and present the
  same refresh cookie — the precise input a backend with refresh-token reuse detection answers by
  revoking the whole token family and signing the user out everywhere. `navigator.locks` needs a
  secure context; feature detection degrades to the in-tab guarantee. Rename `appConfig.name` when
  you fork this template — it is the origin-wide lock namespace.
- **An ended session never renews again.** `AccessTokenStore.hasEnded()` is a latch, not
  decoration. Once the credential is rejected every later request goes out bare and comes back
  401, and with only a token comparison to go on `null === null` would match and fire another
  refresh — ten sequential requests, ten refresh calls. The latch clears when something writes a
  token, which is what makes re-login work. A `401` from `/auth/refresh` is the only outcome that
  ends the session; a 500, a dropped connection or a wire-shape mismatch is `unavailable` — this
  attempt failed, the session did not. Collapsing those two is how boilerplates sign users out
  every time the API restarts.
- **Two clients, not one.** `app/entrypoint/create-authenticated-transport.ts` builds the
  authenticated client with the bearer interceptor and a second, unauthenticated client — the only
  one with `sendCookies: true` — for `/auth/refresh`. A single client would recurse: refresh
  returns 401, the interceptor catches it, calls refresh, forever. It is a composition rule
  enforced at one site and asserted by a test, not a type-level guarantee. `createAuthenticatedTransport`
  returns an object rather than a bare `HttpClient` so the deferred login and route-guard steps can
  add the token store additively.
- **Deploying the API to a different registrable domain silently drops the refresh cookie.**
  `sameSite: 'strict'` is a site-level rule that `withCredentials` cannot override. Serve the API
  under the same site as the app — which is what the dev proxy models — or change the cookie
  policy on the backend.

## Internationalization

`shared/i18n` owns every user-facing string the frontend authors. `createI18n()` is a factory in the
shape of `createHttpClient` / `createQueryClient` / `createAppRouter`: `app/entrypoint` composes one
instance, each test builds an isolated one.

```tsx
const { t } = useTranslation('home');

<output aria-label={t('elapsedLabel')}>{formatDuration(elapsed)}</output>
<p>{t('secondsAdded', { count: seconds })}</p>
<Trans i18nKey="environment.mode" t={t} values={{ mode }} components={{ code: <code /> }} />
```

- **Keys are compile-checked.** `src/shared/i18n/i18next.d.ts` augments i18next's
  `CustomTypeOptions` with the English JSON as the resource type, so `t('notFound.titel')` and
  `useTranslation('hoem')` are `tsc` errors, and plural-suffixed keys (`secondsAdded_one` /
  `secondsAdded_other`) collapse to one typed `secondsAdded`. **English is the type authority** — a
  key that exists only in another locale is not a valid key. That file's `import type` statements
  are load-bearing: they are what make it a module, which is what makes `declare module 'i18next'`
  an augmentation rather than a wholesale replacement. `moduleDetection: "force"` does not help,
  because it does not apply to declaration files.
- **The default locale ships whole; every other locale ships its `common` namespace and streams the
  rest.** `resources` holds all English namespaces plus `ru/common` inline,
  `partialBundledLanguages: true` lets a backend coexist with them, and `resourcesToBackend`
  resolves everything else through a dynamic `import()` that Vite code-splits per
  locale-and-namespace. An English visitor pays no extra request and never suspends.
- **Bundling every locale's `common` is a correctness guarantee, not an optimization.** The lazy
  glob deliberately excludes it, so a locale registered without a bundled `common` has _no_
  reachable shell copy: i18next abandons the language and the user gets a fully English UI — with
  every gate still green. `BUNDLED_RESOURCES` is therefore constrained with
  `satisfies Record<Locale, … & Record<typeof DEFAULT_NAMESPACE, ResourceKey>>`, which turns that
  into a `TS1360` compile error. Do not remove the constraint.
- **Adding a locale touches four places, three of them compile-enforced:** the code in
  `SUPPORTED_LOCALES`, a descriptor in `LOCALES`, its JSON under `locales/<code>/`, and its `common`
  entry in `BUNDLED_RESOURCES`. Adding a namespace costs a JSON file per locale, an entry in
  `NAMESPACES`, an import plus a `BUNDLED_RESOURCES` entry for the default locale, and an
  `import type` plus a `resources` entry in `i18next.d.ts`.
- **`registry.ts` is named that, not `locales.ts`,** because a sibling `locales/` directory holds
  the JSON. A file and a directory sharing a name would make `from './locales'` and
  `from './locales/en/common.json'` resolve correctly only by file-before-directory precedence, and
  silently flip the day someone adds `locales/index.ts`.
- **The lazy glob excludes what is statically imported.** `'!./locales/en/*.json'` and
  `'!./locales/*/common.json'` keep the dynamic and static sets disjoint; without them every build
  prints Rollup's `INEFFECTIVE_DYNAMIC_IMPORT`. The exclusion repeats the default locale as a
  literal because glob patterns must be statically analysable and cannot interpolate
  `DEFAULT_LOCALE` — `lazy-locale-loader.test.ts` carries the drift guard that fails if the two
  disagree.
- **Copy carries its own markup; it is never concatenated.** `"mode: <code>{{mode}}</code>"` is one
  complete sentence rendered through `<Trans components={{ code: <code /> }}>`. Handing a
  translator a bare `"mode:"` fragment to reassemble in JSX hardcodes English word order and is the
  same string-concatenation anti-pattern this segment exists to remove.
- **`escapeValue: false` is required here and is not an XSS relaxation.** React escapes every
  interpolated child before it reaches the DOM; leaving i18next's own escaping on double-escapes
  (`O'Brien` → `O&#39;Brien`). react-i18next uses no `dangerouslySetInnerHTML`.
- **`<html lang>` and `dir` are driven from the registry.** `index.html` hardcodes `lang="en"`;
  `DocumentLocaleSync` inside `I18nProvider` makes it truthful, which is a WCAG 3.1.1 requirement —
  otherwise a screen reader announces Russian text with English pronunciation rules. It writes a
  process-global with no injection seam, so two `I18nProvider`s would fight over the same
  attributes; that is acceptable for a single-root app, and the fix if it stops being true is to
  export `DocumentLocaleSync` and mount it at the composition root, not to add a `syncDocument`
  prop.
- **`useSuspense: false` in `useLocale` bounds the blast radius; it is not what prevents the blank
  page.** Bundled `common` is what prevents the blank page. What the option buys is the degraded
  case: when a namespace is genuinely unreachable — a failed chunk fetch, a bad deploy, a locale
  registered without its `common` — the app renders in English instead of rendering nothing.
  `i18n-provider.test.tsx` has the test that discriminates between the two.
- **Untrusted locale input is filtered before anything loads.** `supportedLngs` runs before any
  dynamic import and Vite's dynamic-import-vars restricts the glob to a known file set, so
  `?lng=de`, `?lng=../../../etc/passwd` and `?lng=en-GB` all resolve safely — the first two to
  English with nothing written to storage, the last to `en` via `load: 'languageOnly'`.
- **Detection order is querystring → `localStorage` → navigator, cached to `localStorage` under
  `app.locale`.** `?lng=ru` is what makes the whole thing verifiable in a browser without a
  locale-switcher UI, which is deliberately deferred to the step that brings `shared/ui`. Note that
  i18next caches the _detected_ tag (`en-US`), not the resolved locale (`en`); both round-trip to
  the same language.
- **Translation JSON is a local build-time asset, not a wire payload.** It crosses no trust
  boundary and needs no runtime schema validation. Server-supplied display strings are DTO fields
  and get mapped into the domain model like any other field — they do not belong in these
  namespaces, which are for copy the frontend owns. When the active locale needs to reach the
  backend it goes as an `Accept-Language` header in `HttpRequestOptions.headers` at the call site,
  never by importing i18next inside a mapper. `bearerTokenSource` is not the place for it: that
  port owns `Authorization` and nothing else. A general request-header hook is future work if one
  is wanted.
- **The re-export of `useTranslation` and `Trans` adopts i18next's API as this project's own, and
  that is a deliberate departure from `shared/api`.** The transport hides axios entirely behind a
  hand-written port; i18n does not, because a wrapper would sever the `CustomTypeOptions` type
  inference that is the reason for choosing i18next 26. What the import gate buys is a single point
  at which to patch import paths — not implementation independence.

## Forms

`shared/ui/form` is the accessibility seam every form goes through. It composes TanStack Form's
`createFormHook` into `useAppForm`, whose returned `form` object carries pre-bound components: a
consumer writes `<field.TextField label="Email" />` and cannot forget `aria-invalid`,
`aria-describedby`, the `role="alert"` container or the submit-pending state.

The schema **factory** lives at module scope in the slice's `model` segment, so it is importable and
testable; the component receives its side effect as a prop and therefore renders and nothing else.
Validation messages are user-facing copy, so the factory takes them as **resolved strings** — never
`t` itself. That keeps the rules module free of any i18n import, testable with plain literals, and
declared as a **Standard Schema port** rather than a Zod type, so the consuming component depends
on the interface and the validator stays swappable. A sibling hook resolves the copy in one place.
`src/features/update-user-name` is the worked example; a second form would read the same way.

```ts
// src/features/sign-in/model/sign-in-schema.ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import * as zm from 'zod/mini';

export const MINIMUM_PASSWORD_LENGTH = 8;

export interface SignInMessages {
  readonly emailInvalid: string;
  readonly passwordTooShort: string;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export type SignInSchema = StandardSchemaV1<SignInInput, SignInInput>;

function isLongEnough(value: string): boolean {
  return value.length >= MINIMUM_PASSWORD_LENGTH;
}

export function createSignInSchema(messages: SignInMessages): SignInSchema {
  return zm.object({
    email: zm.email(messages.emailInvalid),
    password: zm.string().check(zm.refine(isLongEnough, messages.passwordTooShort)),
  });
}
```

```ts
// src/features/sign-in/model/use-sign-in-schema.ts
import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';

import { createSignInSchema, MINIMUM_PASSWORD_LENGTH } from './sign-in-schema';
import type { SignInSchema } from './sign-in-schema';

export function useSignInSchema(): SignInSchema {
  const { t } = useTranslation();

  return useMemo(
    () =>
      createSignInSchema({
        emailInvalid: t('signIn.email.invalid'),
        passwordTooShort: t('signIn.password.tooShort', { min: MINIMUM_PASSWORD_LENGTH }),
      }),
    [t],
  );
}
```

```tsx
// src/features/sign-in/ui/sign-in-form.tsx
import { useTranslation } from '@/shared/i18n';
import { useAppForm } from '@/shared/ui/form';

import type { SignInInput } from '../model/sign-in-schema';
import { useSignInSchema } from '../model/use-sign-in-schema';

export interface SignInFormProps {
  readonly onSubmit: (input: SignInInput) => Promise<void>;
}

export function SignInForm({ onSubmit }: SignInFormProps) {
  const { t } = useTranslation();
  const signInSchema = useSignInSchema();

  const form = useAppForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: signInSchema },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="email" label={t('signIn.email.label')} type="email" />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              autoComplete="current-password"
              label={t('signIn.password.label')}
              type="password"
            />
          )}
        </form.AppField>
        <form.SubmitButton pendingLabel={t('signIn.pending')}>
          {t('signIn.submit')}
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
```

- **`onSubmit` receives the raw form values, not the schema's output.** See the no-transform rule
  under [Rules](#rules); typing the schema `StandardSchemaV1<TInput, TInput>` states that in the
  port itself. Declaring an output type the input cannot produce is a type-lie every future form
  would inherit, and it would propagate straight into the DTO mapper.
- **Three schemas, not one — do not collapse them.** A form-_input_ schema, a wire _DTO_ schema and
  a _domain-model_ parser are three shapes with three reasons to change: the form yields
  `{ email: string; password: string }` from `<input>` values; the DTO is snake-cased server JSON;
  the domain model carries parsed/branded types and no password at all. What may be shared is
  **field-level** refinement — a reusable `emailSchema` composed into all three — never the
  top-level object. Every schema — form, DTO or shared field — is authored in `zod/mini`; see the
  schema convention under [Data layer](#data-layer).
- **Errors reveal on blur, or after the first submit attempt — never on `isTouched`.**
  `FormApi.setFieldValue` sets `isTouched` on the **first keystroke**, so an `isTouched` gate
  announces "Enter a valid email address" mid-word and re-fires assertively as the user types.
  `isBlurred` alone is also wrong: `handleSubmit` marks every field touched but not blurred, so a
  user who types and presses Enter would see nothing. The rule lives in `use-field-aria.ts` and
  `use-field-reveal.ts`, and a new field type reuses it rather than re-deriving it.
- **Invalidity is read from `meta.isValid`, never from the message count.** A validator can emit an
  error the seam cannot stringify; deriving invalidity from `messages.length` would render
  `aria-invalid="false"` and no alert while `canSubmit` stayed false — the user clicks submit and
  nothing happens, forever, with no message anywhere. The injected `t('validation.invalid')`
  fallback guarantees the alert is never empty.
- **The slice's `onSubmit` should not reject.** `form.Form` catches the submit promise so a
  rejection can never become an unhandled rejection — which matters because `vitest run` exits 1 on
  one while still reporting every test green — but a swallowed error is still a silent failure. Until
  server-error mapping wires `HttpError` into `setErrorMap`, catch inside the slice's own `onSubmit`
  and render the failure, or pass `onSubmitError` to `form.Form`. **Pick one per form; do not wire
  both.** A mutation-backed form reports failure through mutation state — `use-update-user-name.ts`
  awaits `mutateAsync` so `isSubmitting` tracks the request, then swallows the rejection because
  `status` already carries the failure and the UI already renders it; letting it propagate would
  report the same failure twice. `onSubmitError` is for submit failures the mutation state does not
  model.
- **Key the schema memo on `t`, not on `i18n.language`.** react-i18next's `t` is already stable per
  language and namespace load, so `[t]` is the honest dependency and needs no suppression — which
  matters, because this repo runs _two_ exhaustive-deps rules and `reportUnusedDisableDirectives`
  means a single-rule disable comment both fails to silence the second and cannot be padded.
- **Binding `TextField` to a non-string field is not a compile error.** `createFormHook` offers
  every registered field component on every field and `useFieldContext<T>()` asserts rather than
  proves `T`, so the seam converts that into a loud runtime `TypeError` instead of silent state
  corruption. Add a `NumberField` / `SelectField` rather than reusing `TextField`. That throw is
  caught by the `ErrorBoundary` at the composition root, so it replaces the app with
  `AppCrashFallback` rather than unmounting the React root — loud, which is the point, but still a
  whole-app failure from one mis-bound field.
- **Form-level validation fans out re-renders and reveals.** With `validators: { onChange: schema }`
  one validator recomputes the whole error map, so a keystroke in one field re-renders every field —
  and a field that was blurred while empty flips to `aria-invalid="true"` mid-keystroke in a field
  you are not touching. Both are arguably correct and both disappear with per-field `validators`,
  which is the escape hatch on a large or announcement-sensitive form.
- **There is no focus management after a failed submit.** Focus stays on the submit button and two
  invalid fields queue two assertive announcements. A WCAG error summary — a list of links targeting
  `#fieldId` — is the standard remedy, which is why `useFieldAria` accepts a caller `id` and merges
  a caller `aria-describedby` rather than discarding them.

Only `useAppForm`, `TextFieldProps` and `TextFieldInputType` are exported. The components are
meaningful only inside `<form.AppForm>` / `<form.AppField>`, where `createFormHook` supplies their
context, so exporting them as values would advertise a way to render them broken. `withForm`,
`withFieldGroup`, `useTypedAppFormContext` and `extendForm` are deliberately not destructured from
`createFormHook` — each needs a second form to be worth explaining.

## Testing

- Vitest runs in `jsdom` with `globals: false` — import `describe`, `it`, and `expect` from
  `vitest` explicitly.
- `vitest.setup.ts` has six responsibilities, all applying to every test file: it registers
  `@testing-library/jest-dom` matchers, calls `cleanup()` after each test, stubs a global
  `scrollTo`, builds a fresh English i18n instance before each test and registers it with
  `setI18n`, clears `localStorage` before each test, and removes `lang`/`dir` from
  `<html>` after each test. The `scrollTo` stub is there because `scrollRestoration` makes
  router-core call a bare `scrollTo`, which jsdom does not implement — without it every run prints
  seven `Not implemented: Window's scrollTo()` lines that read like a regression.
- **The last three of those are guarded by `typeof window !== 'undefined'`, and the guard is
  mandatory.** Setup files run for every test file regardless of its environment, and
  three files declare `// @vitest-environment node`, where `localStorage` does not exist — without
  the guard all 16 tests in `src/shared/api/http-client.test.ts` die on
  `ReferenceError: localStorage is not defined`, and so do the other two files.
- **The globally-registered i18n instance is a test convenience, not the app's wiring.** The
  application receives its instance by explicit injection through `I18nProvider`; the global exists
  so a page test can render `<HomePage />` with no provider and still get real English copy, which
  is what lets assertions be written against the copy a user reads. It is constructed in
  `beforeEach` rather than at module scope so a test that changes the language cannot leak into the
  next one, and detection and caching are both disabled on it so the persistence assertions in
  `create-i18n.test.ts` stay meaningful rather than vacuously true.
- Query by accessible role and name (`getByRole('button', { name: 'Add one second' })`) rather than
  by test id, so tests fail when accessibility regresses. Provider components render no roles of
  their own, so their assertions use `getByText`; the query-by-role rule is about the UI layer,
  where roles exist.
- Coverage thresholds are 90% for lines, functions, branches, and statements, applied **per file**
  (`thresholds.perFile`). A global threshold lets a well-covered codebase absorb one untested
  module; a per-file threshold names the file that fell short. Only test files, `.d.ts` declarations,
  and the generated `src/app/router/route-tree.gen.ts` are excluded. Barrels _are_ measured: they
  re-export and nothing else, so they carry zero coverable statements and score 100% — and if logic
  ever lands in one, it is measured rather than exempt.
- The `text` coverage reporter prints only files below 100%; an empty table means everything
  measured is fully covered.
- Any module that reads `import.meta.env` must be tested with `vi.stubEnv()` plus
  `vi.resetModules()` and a dynamic `import()`. Only `src/shared/config/app-config.ts` reads it;
  keep it that way and no other test needs the pattern.
- `src/main.tsx` is covered by `src/main.test.ts`, which asserts both the `#root` fail-fast guard
  and that the app mounts. React 19 roots flush asynchronously, and mounting the router makes the
  first route match asynchronous too, so the mount assertion wraps the import in `act()` **and**
  the assertion itself in `waitFor`.
- Three files declare `// @vitest-environment node` on their first line:
  `src/shared/api/http-client.test.ts`, `src/shared/api/attach-bearer-token.test.ts` and
  `src/app/entrypoint/create-authenticated-transport.test.ts` — every test that drives a real
  request through MSW. In jsdom axios picks its `xhr` adapter, and MSW's XHR interceptor ignores
  `xhr.timeout`, so the timeout test would silently _resolve_. The cost is that these files
  exercise axios's Node adapter rather than the browser's; the code-to-kind mapping is unit-tested
  for both `ECONNABORTED` and `ETIMEDOUT` in `axios-error-mapper.test.ts`, which is
  environment-independent. Node ≥ 22 also ships a real `LockManager`, so the composition test
  genuinely acquires an origin-wide Web Lock rather than a stub.
- MSW is a dev dependency and is used in Node test mode only. The browser service worker is not
  installed — `npx msw init public/` lands with the first mocked dev-server slice.
- **`src/pages/home/ui/home-page.test.tsx` stands up no router, deliberately.** It is the
  executable proof that a page below `app` reads no route state; keep it that way. `Link` is the
  one exception to router-free pages — it needs a `RouterProvider` ancestor — which makes
  `pages/not-found` the single slice with no co-located test: a standalone one would have to stand
  up a router and would then be testing the router twice. It is covered from
  `src/app/router/create-app-router.test.tsx`, and end-to-end from `e2e/app-shell.spec.ts`, which
  reaches it through the real route tree in the built bundle.
- **Router policy a constant cannot explain is asserted.** `defaultPreloadStaleTime: 0` stops the
  router keeping a 30 s cache of loader results alongside Query's; without the assertion in
  `create-app-router.test.tsx`, deleting the line would pass every gate. The last case in that file
  is the type-safety gate: a `@ts-expect-error` on `<Link to="/definitely-not-a-route">`, which
  fails with `TS2578` the moment the `Register` augmentation stops working.
- A committed `it.skip(...)` fails `npm run lint`: `vitest/no-disabled-tests` is a warning and the
  lint gate runs with `--max-warnings 0`.

Current unit and component suite: **46 files, 299 tests, 100% coverage** against the 90% per-file
threshold — 422/422 statements, 193/193 branches, 152/152 functions, 412/412 lines across 87
measured files (21 of which — the barrels and three type-only modules — carry no coverable
statements). The browser suite is counted separately and measured by nothing; see
[End-to-end tests](#end-to-end-tests).

## End-to-end tests

Playwright drives a real Chromium against the **production build**. Eight scenarios across two spec
files under `e2e/`.

| Script                    | What it does                                             |
| ------------------------- | -------------------------------------------------------- |
| `npm run test:e2e`        | Builds, previews, and runs the suite headless.           |
| `npm run test:e2e:ui`     | The interactive runner, for writing and debugging specs. |
| `npm run test:e2e:report` | Opens the HTML report from the last run.                 |

**It tests the build, not the dev server.** `webServer.command` is `npm run build && vite preview`,
because the gap this suite exists to close is precisely "the built bundle is unverified": minified
output, the route tree as generated by the Vite plugin rather than by the test-mode config,
`import.meta.env` inlined, and both devtools overlays absent because they no-op in production.

**The build is hermetic.** Vite loads `.env` files during `build` and gives real `process.env`
`VITE_*` variables precedence over them, so `webServer.env` pins `VITE_API_BASE_URL=/v1`. Without
that pin a developer with `VITE_API_BASE_URL=http://localhost:8000/api` in an untracked `.env`
would build a bundle whose requests miss the stub entirely, fall through to `vite preview`'s SPA
history fallback, receive `200 text/html`, fail `userDtoSchema`, and surface as "this profile could
not be loaded" — the wrong diagnosis, on a machine-dependent basis.

**The network is stubbed in the browser, not in the app.** `page.route` intercepts at Chromium's
network layer, so no mocking machinery reaches the production bundle and `src/main.tsx` needs no
branch. MSW was the alternative and was rejected for exactly that reason: its browser mode needs a
service worker registered from application code plus `mockServiceWorker.js` in `public/`.

**The suite never imports `src/`, by construction.** `e2e/fixtures/user-stub.ts` declares the wire
shape as its own `UserWireRecord`, deliberately duplicating `src/entities/user/api/user-dto.ts`.
Sharing that type would make a wire-field rename update both sides at once and keep the suite green
while production broke — a single declaration cannot detect its own drift. The fence is mechanical,
not conventional: a `no-restricted-imports` rule over `e2e/**` rejects `@/**` and `**/src/**`, and
`tsconfig.e2e.json` omits the `@/*` path alias so the aliased form also fails `npm run typecheck`.

What that catches and what it does not: it catches the application **tightening** away from the
wire — a renamed or retyped field. It does not catch the wire **loosening** away from the
application; if the server makes a field optional, the pinned copy keeps sending the old shape and
nothing fails. That needs a contract artefact generated from the server (OpenAPI or Pact).

**Locators and copy live in `e2e/page-objects/`.** Seven scenarios drive the profile form, so
`'Save name'` and `'First name'` would otherwise appear at four or five sites each. Everything is
queried by role, label, or visible text — never a `data-testid`, a CSS class, or a generated id,
because `TextField` derives its control id from `useId()` and the label association is the real
contract. `e2e/app-shell.spec.ts` queries two strings once each and keeps them inline: the rule is
extract at the second call site, not the first.

**`npm run audit` deliberately excludes it.** `audit` is the `pre-push` hook and must stay fast; a
gate that builds the app and boots a browser belongs in CI, which runs `End-to-end tests` as its own
job in parallel with `Quality gates`. Run it locally before opening a pull request.

Playwright's `test-results/`, `playwright-report/` and `blob-report/` are ignored by git, by
Prettier, and by ESLint. All three matter: the HTML report is a single multi-hundred-kilobyte line
that fails `format:check`, and a recorded trace copies real `.js` files into `playwright-report/`
that belong to no TypeScript project and hard-fail `projectService`. Either one blocks every push
until the directory is deleted.

## Bundle size baseline

Recorded from `npm run build` on the scaffold as committed, with no `.env` present (Vite 8.2.2,
production, 561 modules transformed):

| Asset                | Raw       | Gzip      |
| -------------------- | --------- | --------- |
| `index.js`           | 454.93 kB | 148.52 kB |
| `routes-*.js`        | 12.01 kB  | 5.08 kB   |
| `index.css`          | 21.18 kB  | 4.60 kB   |
| `users._userId-*.js` | 86.12 kB  | 22.74 kB  |
| `home-*.js`          | 0.63 kB   | 0.31 kB   |
| `index.html`         | 0.47 kB   | 0.30 kB   |

Six assets, not three, because `autoCodeSplitting` puts each route's component in a chunk of its
own. The hashed `routes-*.js` chunk is the `/` route; a second route adds another. Styling is a
single `index.css`: components carry Tailwind utilities rather than their own stylesheets, so no
route chunk emits CSS of its own.
`home-*.js` is the Russian `home` namespace, code-split by the i18n backend's dynamic `import()`;
it is fetched only by a non-English visitor to `/` and is absent from the entry chunk.

**i18n cost, measured against the pre-i18n scaffold:** the entry chunk grew 344.60 → 402.27 kB raw
and 112.44 → 130.81 kB gzip (+18.37 kB gzip), and the shared `routes-*.js` chunk — which every page
view loads — grew 1.02 → 11.86 kB raw and 0.56 → 5.00 kB gzip (+4.44 kB gzip), because `<Trans>`
and its `html-parse-stringify` dependency land there. **Real added cost to render `/` is
+22.81 kB gzip.** Every locale's `common` namespace is bundled into the entry rather than lazily
loaded, at about 0.22 kB gzip each; that is a correctness guarantee, not an oversight — see
[Internationalization](#internationalization).

The entry JS is React 19, axios, TanStack Query and TanStack Router plus the scaffold's few
components — +153.19 kB raw / +52.01 kB gzip over the 191.41 kB / 60.43 kB React-only baseline, of
which routing is +77.81 kB raw / +26.38 kB gzip against the pre-router 266.79 kB / 86.06 kB figure.
That is the price of typed links, typed route context and per-route code-splitting; weigh it against
a 1.5 kB router before assuming it is free.

Both devtools packages are in `dependencies` and cost ~0.02 kB gzipped each:
`@tanstack/react-query-devtools` and `@tanstack/react-router-devtools` both have a production entry
of `process.env.NODE_ENV !== 'development' ? () => null : Real`, which the bundler eliminates — no
lazy-loading ceremony and no `import.meta.env.DEV` guard needed. The production bundle contains zero
matches for `router-devtools-core`.

Note what the split does **not** buy on a first visit: `dist/index.html` preloads only the entry
chunk, so the landing route costs one extra round trip for its own chunk. `defaultPreload: 'intent'`
covers every subsequent route by starting the fetch on link hover, but it cannot help the first one.

**Form seam cost, measured against the pre-form tree:** the entry chunk grew 402.12 → 402.23 kB raw
and 130.70 → 130.76 kB gzip, `index.css` grew 17.99 → 20.15 kB raw and 4.07 → 4.39 kB gzip, and the
`routes-*.js` and `home-*.js` chunks did not move. **The seam shipped no JavaScript when it
landed** — its modules do import `@tanstack/react-form`, but nothing in the entry graph imported
`@/shared/ui/form`, so Rollup tree-shook the whole group out. The +0.06 kB gzip of JS is the two
new `validation.invalid` keys in each locale's bundled `common`. That changed with
`features/update-user-name`, the seam's first consumer — see **First write path cost** below.

The CSS growth is real and is not tree-shaken: Tailwind v4 scans **source files**, not the import
graph, so the utilities on `Input`, `Label` and `TextField` are emitted the moment the files exist —
+1.86 kB raw / +0.27 kB gzip of the total. The remaining +0.30 kB raw / +0.05 kB gzip comes from
**this file**: Tailwind v4's automatic content detection reads every non-gitignored text file in the
project, so the `className` strings in the code samples above are extracted as real candidates.
Recording a CSS baseline here is therefore self-referential — edit the prose around the number and
the number moves. Treat that as a documented quirk, not a leak; suppressing it would mean narrowing
`@source`, which would then need maintaining. (The table above now records 20.61 / 4.50 kB. The
`index.css` figures here and in the paragraph above are the delta measured when the form seam
landed, and are left as they are.)

**Validation seam cost, measured against the pre-validation tree:** the entry chunk grew
402.23 → 403.10 kB raw and 130.76 → 131.03 kB gzip (+0.27 kB gzip). `index.css`, `routes-*.js` and
`home-*.js` did not move in size, and `index.css` additionally keeps its content hash, so the CSS
is byte-identical before and after; the `routes-*.js` hash does change, as a cascade from the entry
chunk's. Unlike the form seam this one **does** ship: `app-providers.tsx` constructs the client, so
`response-schema.ts` and `validation-error-mapper.ts` sit in the entry graph.
`@standard-schema/spec` contributes nothing — it is types-only, its `dist/index.js` is 0 bytes, and
`verbatimModuleSyntax` erases the import.

**Reference entity slice cost, measured against the pre-`entities` tree:** the entry chunk grew
403.10 → 416.41 kB raw and 131.03 → 135.82 kB gzip — **≈ +4.8 kB gzip**, which is `zod/mini`
plus the `entities/user` modules. `routes-*.js` did not move at all (44.63 / 15.57 kB), which is the
measurement that corrects the [Data layer](#data-layer) prediction: the DTO schema reaches the
entry chunk through the route `loader`, the half `autoCodeSplitting` cannot split, not through the
shared routes chunk. The new `users._userId-*.js` chunk (9.80 / 3.60 kB) is the route's component
half, fetched only by a visitor to `/users/:id`. `index.css` grew 20.18 → 20.61 kB raw and
4.40 → 4.50 kB gzip: Tailwind v4 scans source, so `max-w-2xl`, `tracking-tight`,
`text-muted-foreground` and `text-destructive` on the two new components are emitted the moment the
files exist.

**First write path cost, measured against the pre-`features` tree:** `features/update-user-name` is
the first non-test consumer of `shared/ui/form`, so this is where the form seam starts shipping.
The `users._userId-*.js` route chunk grew 9.80 → 86.12 kB raw and 3.59 → 22.74 kB gzip
(**+19.15 kB gzip**), the entry chunk grew 451.07 → 453.06 kB raw and 146.94 → 147.71 kB gzip
(+0.77 kB gzip), `index.css` grew 21.00 → 21.18 kB raw and 4.56 → 4.60 kB gzip, `routes-*.js` did
not change size, and modules transformed went 479 → 550.

Of the route chunk's +19.15 kB, the `zod/mini` command schema is ~1 kB and **TanStack Form plus
the field components are ~18 kB** — that, not the 1 kB validator choice, is the dominant bundle
decision in this step. Two things make it acceptable. `autoCodeSplitting` confines the cost to the
lazily loaded `users.$userId` route chunk — verified: `grep -lE 'submissionAttempts'
dist/assets/*.js` matches that chunk and nothing else, and the entry chunk has zero matches — so
initial page load grows by under 1 kB. And the ~18 kB is paid once and amortises across every form
the template grows; a second form adds its own schema and fields, not another copy of the seam.

The projection below was written before that measurement and is left as the isolated per-package
reference it always was — bundled with this repo's own toolchain (Vite 8 / Rolldown, minified,
React external, each measured in isolation):

| Bundle                                            | Raw      | Gzip     |
| ------------------------------------------------- | -------- | -------- |
| `@tanstack/react-form` + `@tanstack/react-store`  | 98.50 kB | 21.41 kB |
| `zod` (`z.object` + `z.email` + `z.string().min`) | 78.83 kB | 18.24 kB |
| `zod/mini`, same schema                           | 14.29 kB | 4.49 kB  |

That projected roughly **+40 kB gzip** for the first form route, of which ~21 kB is the seam. The
measured figure is +19.15 kB, about half — because the projection assumed classic `zod` (18.24 kB)
where the slice uses `zod/mini`, and because a real slice validates two string fields rather than
the whole per-package surface. Both halves of the prediction's shape held: the cost landed in the
route's own chunk, and `zod/mini` was indeed the escape hatch — it is now the rule for every
schema in `src/`, not an exception.

Note that `@tanstack/react-form` requires `@tanstack/react-store@^0.11.0` while
`@tanstack/react-router@1.170.32` declares `@tanstack/react-store@^0.9.3` — a range that cannot
reach it — so npm nests a second copy of **both** `@tanstack/react-store` and `@tanstack/store`,
which is where most of those duplicated bytes are. It resolves itself when TanStack Router widens
its range; nothing needs doing here.

**Bearer token source cost, measured against the pre-auth tree:** the entry chunk grew
453.06 → 454.93 kB raw and 147.71 → 148.52 kB gzip — **+0.81 kB gzip, all of it first-party**, and
modules transformed went 550 → 561. `index.css`, `routes-*.js`, `users._userId-*.js` and
`home-*.js` did not move. **Zero bytes of new vendor code**: axios interceptors already provide the
request and response hooks, and the Web Locks API is the platform's own cross-tab mutex, so the
whole mechanism — the credential port, the two interceptors, the single-flight primitive and the
`entities/session` slice — is code this repo owns. `axios-auth-refresh` (unmaintained) and
`axios-retry` (which solves retry-on-5xx, not token custody) were both rejected: either would still
leave de-duplication and token custody here, in exchange for a dependency and an opaque interceptor
ordering.

A `.env` shifts the total by a few bytes because Vite inlines the value, so record baselines without
one. Treat a jump against this baseline as a review item, not a build failure — the number is here to
make growth visible.
