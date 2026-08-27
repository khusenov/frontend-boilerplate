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

| Script                  | What it does                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run verify:lock`   | `npm ci --dry-run --ignore-scripts` — fails if `package-lock.json` is out of sync. Works offline.        |
| `npm run dev`           | Vite dev server with HMR.                                                                                |
| `npm run build`         | `tsc -b` (project references) then `vite build` into `dist/`.                                            |
| `npm run preview`       | Serves the built `dist/` locally.                                                                        |
| `npm run typecheck`     | `tsc -b --pretty` — types only, no emit.                                                                 |
| `npm run lint`          | ESLint over the repo with `--max-warnings 0`; warnings fail the run.                                     |
| `npm run lint:fix`      | ESLint with `--fix`.                                                                                     |
| `npm run lint:a11y`     | a11y rule-list drift check, then oxlint accessibility rules over `src`.                                  |
| `npm run lint:a11y:fix` | Regenerates `.oxlintrc.json` from oxlint's schema and formats it.                                        |
| `npm run format`        | Prettier `--write` over the repo.                                                                        |
| `npm run format:check`  | Prettier `--check`; fails on any unformatted file.                                                       |
| `npm run test`          | Vitest, single run.                                                                                      |
| `npm run test:watch`    | Vitest in watch mode.                                                                                    |
| `npm run test:coverage` | Vitest with v8 coverage and the 90% per-file thresholds enforced.                                        |
| `npm run arch`          | steiger over `./src` — Feature-Sliced Design rules.                                                      |
| `npm run audit`         | All eight gates, in order: verify:lock, format:check, lint, lint:a11y, typecheck, arch, build, coverage. |

`npm run audit` is the gate that must be green before anything is committed or merged. It takes
about 11 seconds warm. Every gate in it runs offline; a vulnerability scan
(`npm audit --omit=dev --audit-level=high`) needs the network and therefore belongs to CI.

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

Present today: `app`, `pages`, `shared`. `entities`, `features` and `widgets` arrive with their
first real slice.

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
  declaration-carrying export, because barrels are excluded from coverage and logic placed in one
  escapes measurement. Side effects such as `import './styles/index.css'` belong in the module that
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
  and `app/router`**, which additionally may not import `axios` by name. Everything else calls
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
- **No concrete validator inside `shared/ui/form`.** The seam validates through
  [Standard Schema](https://standardschema.dev), never against `zod` by name, and a `patterns`
  regex on `^(zod|valibot|arktype|yup|joi|superstruct)(/|$)` makes that a lint error rather than an
  intention. It is a pattern rather than a `paths` entry because an exact-name ban on `zod` would
  still let `zod/mini` — the recommended bundle-size escape hatch — straight through. The seam's own
  test files are exempt, because they prove the real Standard Schema path with a real Zod schema.
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

Two files under `src/app` do not follow the table, by convention rather than by oversight:
`routes/__root.tsx` and `routes/index.tsx` follow TanStack's file-name-is-the-URL rule.
`router/route-tree.gen.ts` is generated, and `generatedRouteTree` in `vite.config.ts` is what keeps
its name on the table.

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
| `VITE_API_BASE_URL` | `/api`  | Base URL for API requests. |

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

`shared/api` is the only place that speaks HTTP. It exposes a transport port, a frontend-owned
failure model, and a configured TanStack Query cache — and no axios type at all.

```tsx
const httpClient = useHttpClient();

const things = useQuery({
  queryKey: ['things'],
  queryFn: ({ signal }) => httpClient.get<ThingDto[]>('/things', { signal }),
});
```

Passing the `signal` TanStack Query hands the `queryFn` is what makes a superseded request abort
rather than race; the transport turns that abort into an `HttpError` of kind `canceled`, which the
retry policy then declines to retry.

- **`createHttpClient` is a factory, never a module singleton.** Nothing outside `@/shared/config`
  reads `import.meta.env`; the base URL arrives as a plain string, which is what keeps every
  consumer testable with a literal.
- **`app/entrypoint/app-providers.tsx` owns both client lifetimes,** each held in a `useState` lazy
  initializer so its identity is stable for the component's lifetime. `useMemo` would not do:
  React may discard a memo result, and both clients own live state (an interceptor chain, a query
  cache).
- **`useHttpClient()` is the only sanctioned way to reach the transport.** Two gates hold it, and
  neither is sufficient alone. `no-restricted-imports` blocks `createHttpClient` and
  `createQueryClient` on the barrel route, from all five non-`app` layers **and from `app/routes`
  and `app/router`** — only `app/entrypoint` constructs clients. steiger's
  `fsd/no-public-api-sidestep` blocks the deep route (`@/shared/api/http-client`) — but only from
  another layer, because steiger skips same-layer imports, so a second `no-restricted-imports`
  pattern bans `@/shared/api/*` to stop a `shared/lib` helper sidestepping into a module-level
  singleton. Both gates match the import path, so they are drift protection, not a sandbox: a
  `shared` module writing `../api/http-client` or importing `axios` directly is outside every gate,
  exactly as it is today. `app/routes` and `app/router` do additionally ban `axios` by name. The five
  lower layers could now have that ban blanket-applied too — the `src/shared/i18n/**` carve-out
  added for the i18n vendor ban is the pattern that makes it possible, since a per-segment config
  object can restate the rules for the one segment that must import the library. Doing that for
  axios is deferred, not impossible.
- **Every failure is an `HttpError`** with a `kind` of `canceled`, `client`, `network`, `server`,
  `timeout` or `unknown`. `message` is diagnostic, never display copy — user-facing text is the UI
  layer's job, and putting it here would drag i18n into the transport. Narrow with `isHttpError`;
  the query error type stays `Error`, deliberately un-augmented, because TanStack also throws its
  own `CancelledError` and a `queryFn` can throw anything.
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
- **`getAuthHeaders` is an injected port with no implementation.** It returns a header map rather
  than a token, so it serves a bearer scheme, an API key, a tenant id or a trace header without
  committing to any. Pass nothing and the interceptor is never registered.
- **`get<TResponse>()` is an unchecked assertion, not a guarantee.** Nothing validates that the
  wire payload matches `TResponse`. Runtime validation arrives with the first DTO.

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
  backend it goes as an `Accept-Language` header through `createHttpClient`'s injected header hook,
  never by importing i18next inside a mapper.
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
Validation messages are user-facing copy, which is why the schema is a factory taking `t`.

```ts
// src/features/sign-in/model/sign-in-schema.ts
import type { TFunction } from 'i18next';
import { z } from 'zod';

const MINIMUM_PASSWORD_LENGTH = 8;

export function createSignInSchema(t: TFunction) {
  return z.object({
    email: z.email(t('signIn.email.invalid')),
    password: z.string().min(MINIMUM_PASSWORD_LENGTH, t('signIn.password.tooShort')),
  });
}

export type SignInInput = z.input<ReturnType<typeof createSignInSchema>>;
```

```tsx
// src/features/sign-in/ui/sign-in-form.tsx
import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';
import { useAppForm } from '@/shared/ui/form';

import { createSignInSchema } from '../model/sign-in-schema';
import type { SignInInput } from '../model/sign-in-schema';

export interface SignInFormProps {
  readonly onSubmit: (input: SignInInput) => Promise<void>;
}

export function SignInForm({ onSubmit }: SignInFormProps) {
  const { t } = useTranslation();
  const signInSchema = useMemo(() => createSignInSchema(t), [t]);

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

- **`onSubmit` receives the raw form values, not the schema's output — note the `z.input`.** See the
  no-transform rule under [Rules](#rules); `z.infer<…>` there is a type-lie every future form would
  inherit, and it would propagate straight into the DTO mapper.
- **Three schemas, not one — do not collapse them.** A form-_input_ schema, a wire _DTO_ schema and
  a _domain-model_ parser are three shapes with three reasons to change: the form yields
  `{ email: string; password: string }` from `<input>` values; the DTO is snake-cased server JSON;
  the domain model carries parsed/branded types and no password at all. What may be shared is
  **field-level** refinement — a reusable `emailSchema` composed into all three — never the
  top-level object.
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
  and render the failure (a Query mutation's `error` state is the natural source), or pass
  `onSubmitError` to `form.Form`.
- **Key the schema memo on `t`, not on `i18n.language`.** react-i18next's `t` is already stable per
  language and namespace load, so `[t]` is the honest dependency and needs no suppression — which
  matters, because this repo runs _two_ exhaustive-deps rules and `reportUnusedDisableDirectives`
  means a single-rule disable comment both fails to silence the second and cannot be padded.
- **Binding `TextField` to a non-string field is not a compile error.** `createFormHook` offers
  every registered field component on every field and `useFieldContext<T>()` asserts rather than
  proves `T`, so the seam converts that into a loud runtime `TypeError` instead of silent state
  corruption. Add a `NumberField` / `SelectField` rather than reusing `TextField`. Note there is no
  error boundary in this repo yet, so that throw currently unmounts the React root.
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
  `src/shared/api/http-client.test.ts` declares `// @vitest-environment node`, where `localStorage`
  does not exist — without the guard all 16 tests in that file die on
  `ReferenceError: localStorage is not defined`.
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
  module; a per-file threshold names the file that fell short. Barrels (`src/**/index.ts`) and test
  files are excluded because they contain no logic; `src/app/router/route-tree.gen.ts` is excluded
  because it is _generated_, not because it is logic-free.
- The `text` coverage reporter prints only files below 100%; an empty table means everything
  measured is fully covered.
- Any module that reads `import.meta.env` must be tested with `vi.stubEnv()` plus
  `vi.resetModules()` and a dynamic `import()`. Only `src/shared/config/app-config.ts` reads it;
  keep it that way and no other test needs the pattern.
- `src/main.tsx` is covered by `src/main.test.ts`, which asserts both the `#root` fail-fast guard
  and that the app mounts. React 19 roots flush asynchronously, and mounting the router makes the
  first route match asynchronous too, so the mount assertion wraps the import in `act()` **and**
  the assertion itself in `waitFor`.
- `src/shared/api/http-client.test.ts` declares `// @vitest-environment node` on its first line.
  In jsdom axios picks its `xhr` adapter, and MSW's XHR interceptor ignores `xhr.timeout`, so the
  timeout test would silently _resolve_. The cost is that the file exercises axios's Node adapter
  rather than the browser's; the code-to-kind mapping is unit-tested for both `ECONNABORTED` and
  `ETIMEDOUT` in `axios-error-mapper.test.ts`, which is environment-independent.
- MSW is a dev dependency and is used in Node test mode only. The browser service worker is not
  installed — `npx msw init public/` lands with the first mocked dev-server slice.
- **`src/pages/home/ui/home-page.test.tsx` stands up no router, deliberately.** It is the
  executable proof that a page below `app` reads no route state; keep it that way. `Link` is the
  one exception to router-free pages — it needs a `RouterProvider` ancestor — which makes
  `pages/not-found` the single slice with no co-located test: a standalone one would have to stand
  up a router and would then be testing the router twice. It is covered from
  `src/app/router/create-app-router.test.tsx` instead.
- **Router policy a constant cannot explain is asserted.** `defaultPreloadStaleTime: 0` stops the
  router keeping a 30 s cache of loader results alongside Query's; without the assertion in
  `create-app-router.test.tsx`, deleting the line would pass every gate. The last case in that file
  is the type-safety gate: a `@ts-expect-error` on `<Link to="/definitely-not-a-route">`, which
  fails with `TS2578` the moment the `Register` augmentation stops working.
- A committed `it.skip(...)` fails `npm run lint`: `vitest/no-disabled-tests` is a warning and the
  lint gate runs with `--max-warnings 0`.

Current suite: **27 files, 168 tests, 100% coverage** against the 90% per-file threshold — 225/225
statements, 125/125 branches, 71/71 functions, 218/218 lines.

## Bundle size baseline

Recorded from `npm run build` on the scaffold as committed, with no `.env` present (Vite 8.2.2,
production, 386 modules transformed):

| Asset         | Raw       | Gzip      |
| ------------- | --------- | --------- |
| `index.js`    | 402.23 kB | 130.76 kB |
| `routes-*.js` | 44.63 kB  | 15.57 kB  |
| `index.css`   | 20.15 kB  | 4.39 kB   |
| `home-*.js`   | 0.63 kB   | 0.31 kB   |
| `index.html`  | 0.47 kB   | 0.30 kB   |

Five assets, not three, because `autoCodeSplitting` puts each route's component in a chunk of its
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
`routes-*.js` and `home-*.js` chunks did not move. **The seam ships no JavaScript yet** — its
modules do import `@tanstack/react-form`, but nothing in the entry graph imports `@/shared/ui/form`,
so Rollup tree-shakes the whole group out; `grep -rE 'form-core|_zod' dist/assets/*.js` returns
nothing. The +0.06 kB gzip of JS is the two new `validation.invalid` keys in each locale's bundled
`common`.

The CSS growth is real and is not tree-shaken: Tailwind v4 scans **source files**, not the import
graph, so the utilities on `Input`, `Label` and `TextField` are emitted the moment the files exist —
+1.86 kB raw / +0.27 kB gzip of the total. The remaining +0.30 kB raw / +0.05 kB gzip comes from
**this file**: Tailwind v4's automatic content detection reads every non-gitignored text file in the
project, so the `className` strings in the code samples above are extracted as real candidates.
Recording a CSS baseline here is therefore self-referential — edit the prose around the number and
the number moves. Treat that as a documented quirk, not a leak; suppressing it would mean narrowing
`@source`, which would then need maintaining.

What the first Zod-validated form route will actually cost, bundled with this repo's own toolchain
(Vite 8 / Rolldown, minified, React external, each measured in isolation):

| Bundle                                            | Raw      | Gzip     |
| ------------------------------------------------- | -------- | -------- |
| `@tanstack/react-form` + `@tanstack/react-store`  | 98.50 kB | 21.41 kB |
| `zod` (`z.object` + `z.email` + `z.string().min`) | 78.83 kB | 18.24 kB |
| `zod/mini`, same schema                           | 14.29 kB | 4.49 kB  |

So roughly **+40 kB gzip** for the first form route, of which ~21 kB is the seam. It does not have
to land in the entry chunk — `autoCodeSplitting: true` means a form lands in **its route's chunk** —
and `zod/mini` is the escape hatch if the 18 kB ever matters. Re-measure with `npm run build` when
the first form route lands.

Note that `@tanstack/react-form` requires `@tanstack/react-store@^0.11.0` while
`@tanstack/react-router@1.170.32` declares `@tanstack/react-store@^0.9.3` — a range that cannot
reach it — so npm nests a second copy of **both** `@tanstack/react-store` and `@tanstack/store`,
which is where most of those duplicated bytes are. It resolves itself when TanStack Router widens
its range; nothing needs doing here.

A `.env` shifts the total by a few bytes because Vite inlines the value, so record baselines without
one. Treat a jump against this baseline as a review item, not a build failure — the number is here to
make growth visible.
