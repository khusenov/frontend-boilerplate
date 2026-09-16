# Frontend Boilerplate

[![CI](https://github.com/khusenov/frontend-boilerplate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/khusenov/frontend-boilerplate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-24.15%2B-brightgreen.svg)](./.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.app.json)

A production-shaped React + TypeScript frontend starter built on **Vite**, **TanStack
Router/Query/Form**, **Tailwind CSS v4** and **Zod**, organised as strict Feature-Sliced Design —
with the layer boundaries enforced in CI rather than left to discipline. No component ever sees the
server's shape: every response is validated and mapped into a frontend-owned model in the entity
that owns it.

Clone it, rename it, and start writing features on top of infrastructure that is already done.

## What you get

- **[Architecture](./docs/features/architecture-boundaries.md)** — FSD layers, public-API-only
  imports and vendor fences, enforced by steiger and ESLint rather than by review.
- **[Routing](./docs/features/routing.md)** — TanStack Router, route tree generated from
  `src/app/routes`, typed paths, per-route code splitting, a 404 screen.
- **[App shell](./docs/features/app-shell.md)** — `widgets/app-header` is the reference widget: a
  banner mounted once in the root layout, hosting the locale switcher on every route.
- **[Route guard](./docs/features/route-guard.md)** — a screen is private by living under
  `_authenticated/`; the guard resolves the session before the screen loads.
- **[Session management](./docs/features/session-management.md)** — in-memory access token,
  `httpOnly` refresh cookie, one renewal at a time per tab and across tabs via a Web Lock, query
  cache emptied when a session ends.
- **[Sign-in](./docs/features/sign-in.md)** — the reference credentials form: four outcomes, no
  token in UI code, no password in any cache or error report.
- **[HTTP transport](./docs/features/http-transport.md)** — axios behind an `HttpClient` port,
  schema-checked responses, one `HttpError` type, bearer injection with a single 401 retry.
- **[Entities and DTO mapping](./docs/features/user-profile.md)** — `entities/user` is the reference
  read path: DTO schema, mapper, query factory, a screen in three explicit states.
- **[Write path](./docs/features/update-user-name.md)** — `features/update-user-name` is the
  reference mutation: validated form, command, outbound DTO, `PATCH`, write-through cache update.
- **[Forms](./docs/features/forms.md)** — one `useAppForm` seam over TanStack Form, with
  `aria-invalid`, `aria-describedby` and a blocked second submit by construction.
- **[Design system](./docs/features/design-system.md)** — semantic Tailwind v4 tokens in
  `src/shared/ui/theme.css`, and `Button`, `Input` and `Label` vendored from shadcn/ui.
- **[Internationalization](./docs/features/internationalization.md)** — compiler-checked keys,
  per-locale JSON namespaces fetched on demand when not bundled, English and Russian.
- **[Notifications](./docs/features/notifications.md)** — one `Notifier` port for transient
  feedback, drawn by sonner behind an adapter, recorded as a plain array in tests.
- **[Error handling](./docs/features/error-handling.md)** — a recovery screen for render crashes and
  one `ErrorReporter` port for render, query and mutation failures.
- **[Configuration](./docs/features/configuration.md)** — one module reads `import.meta.env`;
  everything below it takes plain values as props.
- **[Composition root](./docs/features/composition-root.md)** — `src/app/entrypoint` constructs every
  client and binds it to its seam, so no layer below `app` names a vendor.
- **[Unit testing](./docs/features/unit-testing.md)** and
  **[end-to-end testing](./docs/features/e2e-testing.md)** — Vitest and Testing Library at a 90%
  per-file coverage floor, Playwright against the production build.
- **[Production container](./docs/features/deployment.md)** — a two-stage `Dockerfile` serving the
  build from unprivileged nginx: deep-link fallback, immutable assets, a same-origin `/v1` proxy,
  and a strict Content-Security-Policy derived from the build — which the end-to-end suite runs
  under too.
- **[Quality gates](./docs/features/quality-gates.md)** — `npm run audit` chains ten checks; a git
  hook runs it before every push and CI runs it on every pull request, beside Conventional Commits
  checks on every commit message and pull request title.

A working session / sign-in / user-profile slice ships with it. That is deliberate: it is the
reference vertical slice you copy when adding your own feature, documented as such in
[`docs/features/user-profile.md`](./docs/features/user-profile.md) (read) and
[`docs/features/update-user-name.md`](./docs/features/update-user-name.md) (write).

## Use this template

Create your repository from this one — **Use this template** on GitHub, or:

```bash
gh repo create my-app --template khusenov/frontend-boilerplate --private --clone
```

Then make it yours before the first feature:

1. **Rename it** — the places listed under [Renaming the project](#renaming-the-project).
2. **Take ownership of the project files** — the copyright line in [`LICENSE`](./LICENSE); the CI
   badge and the repository links in this README; the two URLs in
   [`.github/ISSUE_TEMPLATE/config.yml`](./.github/ISSUE_TEMPLATE/config.yml) and the Discussions
   link in [`CONTRIBUTING.md`](./CONTRIBUTING.md); the reporting route in
   [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md); and the scope in [`SECURITY.md`](./SECURITY.md),
   which names this template's backend.
3. **Configure the new repository** — it inherits none of this one's settings. From its checkout,
   where `gh` fills in `{owner}` and `{repo}`, apply the committed rulesets, turn on the private
   vulnerability reporting `SECURITY.md` sends reporters to and Dependabot's alerts and fixes, and
   allow squash merges only:

   ```bash
   gh api --method POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
   gh api --method POST repos/{owner}/{repo}/rulesets --input .github/rulesets/version-tags.json
   gh api --method PUT repos/{owner}/{repo}/private-vulnerability-reporting
   gh api --method PUT repos/{owner}/{repo}/vulnerability-alerts
   gh api --method PUT repos/{owner}/{repo}/automated-security-fixes
   gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
     --delete-branch-on-merge --enable-auto-merge --enable-discussions
   ```

   A private repository on GitHub's free plan cannot enforce the rulesets or use private
   vulnerability reporting; [Quality gates](./docs/features/quality-gates.md#make-ci-block-merges)
   explains what still protects it.

4. **Point it at your API** — see [Configuration](#configuration). The shipped slices speak
   [backend-boilerplate](https://github.com/khusenov/backend-boilerplate)'s contract.
5. **Build your first slice from the reference one** — see [Adding a feature](#adding-a-feature).
   Keep the session, sign-in and user-profile slices until yours exist: they are what the steps
   copy.

## Requirements

- **Node 24.15+** — [`.nvmrc`](./.nvmrc) pins the major, `24`, and `nvm use` resolves that to your
  newest 24.x. `engines.node` is `^24.15.0 || >=26.0.0`, the range `jsdom` 30 accepts, which rules
  out Node 25 entirely; `.npmrc` sets `engine-strict=true`, so an unsupported version fails
  `npm install` with `EBADENGINE` instead of only warning.
- **npm 11.16.0**, declared via `packageManager`.
- **Chromium for Playwright**, once per machine: `npx playwright install chromium` (on Linux, add
  `--with-deps`). npm installs Playwright but not the browser it drives.
- **Docker with Compose v2** — optional, only for the production container.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Vite serves the app on <http://localhost:5173>. The `.env` copy changes nothing on its own —
[`.env.example`](./.env.example) repeats the built-in default — but it is the file you edit to point
the app somewhere else.

**With no API running**, the template is still fully explorable:

- `/` renders the home screen with the resolved mode and API base URL.
- `/sign-in` renders, validates and submits; the submission answers _"Sign-in is unavailable right
  now. Try again."_ — the transport, validation and outcome path working end to end.
- `/users/<id>` is private and redirects to `/sign-in`: the guard's refresh cannot reach an API, so
  the session never becomes `authenticated`.
- `npm test` and `npm run test:e2e` pass; neither needs a server.

**Against the backend boilerplate.** [`vite.config.ts`](./vite.config.ts) proxies `/v1` to
`http://localhost:8000`, which is what
[backend-boilerplate](https://github.com/khusenov/backend-boilerplate) serves out of the box — so
every request stays same-origin, with no CORS and no `sameSite` question. Start it, run
`npm run dev`, sign in at `/sign-in` and open `/users/<id>`.

A fresh backend has no users and this app has no sign-up screen, so create the first account
through the API. Registration answers `201` with the new user's `id` and `"status":"pending"`; the
backend refuses to sign in a pending user until the 6-digit code it mails — readable in the
backend's Mailpit at <http://localhost:8025> — is verified:

```bash
curl -s http://localhost:8000/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.test","password":"<8 to 128 characters>"}'
curl -s http://localhost:8000/v1/auth/verify-email -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.test","code":"<the code from Mailpit>"}'
```

Open `/users/<id>` with the `id` exactly as registration returned it: the backend compares a
caller's own id case-sensitively, so an upper-cased copy is someone else's profile and answers
`403`.

This app calls `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`,
`GET /v1/users/:id` and `PATCH /v1/users/:id`; the wire shapes it expects are
[`session-dto.ts`](./src/entities/session/api/session-dto.ts) and
[`user-dto.ts`](./src/entities/user/api/user-dto.ts). `POST /v1/auth/logout` has no wire shape of
its own: it is authenticated by the refresh cookie rather than by a bearer token, sends `{}` as its
body, and must answer `204` with an empty body. It rides the same cookie-bearing client as
`POST /v1/auth/refresh`, and carries the same expectation of the backend — away from the same-origin
dev proxy, a cookie-authenticated `POST` that changes state has to reject cross-site requests, with
`SameSite=Lax` or `Strict` on the refresh cookie or a CSRF token.

For an API anywhere else, either change the proxy target in `vite.config.ts` or set an absolute
`VITE_API_BASE_URL` in an untracked `.env` — see
[Run against a local API](./docs/features/configuration.md#run-against-a-local-api).

**Build and preview:**

```bash
npm run build     # tsc -b, then vite build into dist/
npm run preview   # serves dist/ on http://localhost:4173, with the production security headers
```

**Run the production container:**

```bash
docker compose up --build --wait   # serves the app on http://localhost:8080
docker compose down
```

The container forwards `/v1` to `http://host.docker.internal:8000`, so a backend-boilerplate stack
started with its own `docker compose up --wait` is reachable with no further setup. See
[Deployment](#deployment).

## Renaming the project

Four places carry the name, and only one of them propagates; two more carry the product's
description:

| Where                                                                      | What to change                                                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`src/shared/config/app-config.ts`](./src/shared/config/app-config.ts)     | `appConfig.name` — the app-shell header, the `<h1>` of `/`, and the `<name>:session-refresh` Web Lock |
| [`index.html`](./index.html)                                               | `<title>`                                                                                             |
| [`package.json`](./package.json)                                           | `name`                                                                                                |
| [`src/shared/api/response-schema.ts`](./src/shared/api/response-schema.ts) | `SCHEMA_VENDOR`                                                                                       |
| [`package.json`](./package.json) and [`index.html`](./index.html)          | `description`, and `<meta name="description">`                                                        |

`appConfig.name` is the one that matters beyond cosmetics: Web Locks are scoped per origin, so two
apps built from this template and served from one origin would otherwise queue behind each other's
token refreshes. Changing it also breaks four test files that assert the rendered name — the `<h1>`
of `/` and, in `app.test.tsx`, the app-shell banner: `src/main.test.ts`,
`src/app/entrypoint/app.test.tsx`, `src/app/router/app-router-provider.test.tsx` and
`src/app/router/create-app-router.test.tsx`. Translation files carry no product name, so no locale
needs editing. See
[Rename the app when forking](./docs/features/configuration.md#rename-the-app-when-forking).

## Architecture

`src/` is divided into **layers**, and a module may import only from layers **below** it, through
the importee's public `index.ts` and never through an inner file.

| Layer (`src/…`) | Contains                                                                                   | May import           |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `app`           | Composition root, providers, router, route modules, global styles                          | Everything below     |
| `pages`         | Route-level screens, assembled and router-free                                             | `widgets` and below  |
| `widgets`       | Self-contained blocks shared by several screens — today `app-header`                       | `features` and below |
| `features`      | One user action that changes state                                                         | `entities`, `shared` |
| `entities`      | Business nouns: model, DTO schema, mapper, HTTP calls, value presenters                    | `shared`             |
| `shared`        | `api`, `config`, `i18n`, `lib`, `notifications`, `observability`, `testing`, `theme`, `ui` | Nothing above it     |

`src/main.tsx` sits outside the layer system, so steiger cannot analyse it and a lint rule stands
in: `@/app` is the only `@/` path it may import.

Two rules carry the design:

- **Dependencies point down, through public APIs.** `npm run arch` (steiger) fails the build on a
  wrong-direction import or a sidestep past a barrel, and ESLint's `no-restricted-imports` adds the
  fences steiger cannot express — axios only through `shared/api`, i18next only through
  `shared/i18n`, sonner only through `shared/notifications`, router state only in `app`.
- **No component ever sees a DTO.** A response is validated against its DTO schema and mapped to a
  frontend-owned model inside `entities/*/api`, and the slice's public API exports the model, never
  the DTO. See
  [the DTO → domain model contract](./docs/features/user-profile.md#the-dto--domain-model-contract).

[`docs/architecture-graph.md`](./docs/architecture-graph.md) holds the generated module graph
(`npm run arch:graph` regenerates it),
[`docs/features/architecture-boundaries.md`](./docs/features/architecture-boundaries.md) the full
rule set, and [`docs/README.md`](./docs/README.md) the per-feature documentation index.

## Adding a feature

A capability usually spans several layers. Copy the shape of the user profile rather than inventing
one. In order:

1. **Entity** — `src/entities/<noun>/`: the model in `model/`; in `api/` the DTO schema, the mapper
   and a query or mutation factory, plus a cache helper when a write returns the saved record; and
   in `ui/` any component that presents a model value on its own, as `UserStatusLabel` does. This is
   where the wire shape stops.
   [Add the next entity](./docs/features/user-profile.md#add-the-next-entity)
2. **Feature** — `src/features/<verb-noun>/`: one user action, its state and its UI. Build any form
   through `useAppForm`, never directly on TanStack Form.
   [Add a slice](./docs/features/architecture-boundaries.md#add-a-slice),
   [build a form](./docs/features/forms.md#build-a-form-in-a-feature-slice),
   [add the next write](./docs/features/update-user-name.md#add-the-next-write)
3. **Page** — `src/pages/<screen>/`: composes entities and features into a screen that takes props
   and renders without a router.
4. **Route module** — a file in `src/app/routes/`, under `_authenticated/` if the screen is private.
   The file name is the URL. Commit the regenerated `src/app/router/route-tree.gen.ts` with it.
   [Add a public screen](./docs/features/routing.md#add-a-public-screen),
   [protect a screen](./docs/features/route-guard.md#protect-a-screen)
5. **Translations** — every user-visible string goes through `t()` or `<Trans>` from `@/shared/i18n`,
   with each new key added to **every** locale under `src/shared/i18n/locales/*`.
   [Internationalization](./docs/features/internationalization.md#choosing-a-namespace)
6. **Tests** — co-located `*.test.ts(x)`, queried by role and accessible name. Every source file is
   held at 90% coverage per file, so a slice without tests fails the build. Add an `e2e/*.spec.ts`
   scenario when the change touches the wire contract or the built bundle.
   [Write a component test](./docs/features/unit-testing.md#write-a-component-test),
   [add a scenario](./docs/features/e2e-testing.md#add-a-scenario-to-an-existing-screen)
7. **Docs** — add or update the capability's document under `docs/features/` in the same pull
   request, and regenerate the graph with `npm run arch:graph` if the imports between slices moved.

## Scripts

| Command                           | Purpose                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server with HMR on port 5173                                                                        |
| `npm run build`                   | `tsc -b`, then `vite build` into `dist/`                                                                     |
| `npm run preview`                 | Serve the built `dist/` on port 4173                                                                         |
| `npm test` / `npm run test:watch` | Vitest, single run / watch mode                                                                              |
| `npm run test:coverage`           | Vitest with the 90% per-file coverage gate                                                                   |
| `npm run test:e2e`                | Playwright over the production build in Chromium                                                             |
| `npm run test:e2e:ui`             | Playwright's interactive runner                                                                              |
| `npm run test:e2e:report`         | Open the HTML report from the last end-to-end run                                                            |
| `npm run typecheck`               | `tsc -b --pretty` — types only, no emit                                                                      |
| `npm run lint` / `lint:fix`       | ESLint with `--max-warnings 0` / with `--fix`                                                                |
| `npm run lint:a11y`               | Accessibility rule-list drift check, then oxlint's `jsx-a11y` rules over `src`                               |
| `npm run lint:a11y:fix`           | Regenerate `.oxlintrc.json` from oxlint's schema and format it                                               |
| `npm run format` / `format:check` | Prettier                                                                                                     |
| `npm run arch`                    | steiger's Feature-Sliced Design rules over `./src`                                                           |
| `npm run arch:graph`              | Regenerate `docs/architecture-graph.md`                                                                      |
| `npm run verify:lock`             | `npm ci --dry-run --ignore-scripts` — fails if `package-lock.json` drifted                                   |
| `npm run verify:coverage-scope`   | Fail if a source file escaped coverage measurement                                                           |
| `npm run verify:import-fence`     | Fail if the `@/shared/testing` fence stops blocking production files, or starts blocking tests               |
| `npm run audit:deps`              | `npm audit --omit=dev --audit-level=high`; needs the network, so CI owns it                                  |
| **`npm run audit`**               | **The full gate** — lockfile, format, lint, a11y, types, arch, build, coverage, coverage scope, import fence |

Run `npm run audit` before pushing. It runs every check CI's `Quality gates` job runs; the
end-to-end suite stays outside it, because a gate that builds the app and boots a browser does not
belong in a pre-push hook.

## Configuration

Only variables prefixed `VITE_` reach the client bundle, and every one of them is compiled into
public JavaScript — **nothing secret belongs behind a `VITE_` prefix**. Declare each in
[`env.d.ts`](./env.d.ts) so `import.meta.env` stays typed, and read it through `@/shared/config`
rather than at the call site.

| Variable            | Default | Meaning                                                      |
| ------------------- | ------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `/v1`   | Base URL for API requests. Blank or whitespace ⇒ the default |

The default is a **path**, not an origin: `vite.config.ts` proxies `/v1` to `http://localhost:8000`
in development, which makes every request same-origin and mirrors the reverse-proxy topology a
deployment should use. The `/v1` prefix is load-bearing — the refresh cookie is issued with
`path: '/v1/auth'`, so a base URL missing it produces requests the browser will not attach the
cookie to, and every renewal fails with a 401 that looks exactly like an expired session.

[`.env.example`](./.env.example) is the committed list of variables the app understands; every real
`.env*` file is gitignored. Full details, including how a build for a deployment differs, are in
[configuration](./docs/features/configuration.md).

## Deployment

`npm run build` writes static files to `dist/`; the [`Dockerfile`](./Dockerfile) turns them into a
production image. Its first stage builds the app with Node 24, and its second serves `dist/` from
`nginxinc/nginx-unprivileged` as uid 101 on port 8080:

- every path that is not a file falls back to `index.html`, which is never cached;
- `/assets/*` is cached for a year as `immutable`, and a missing asset is a real `404`;
- `/v1/*` is proxied, path unchanged, to `API_UPSTREAM`, so the browser sees one origin and the
  refresh cookie works exactly as behind the dev proxy;
- every document carries a `Content-Security-Policy` with no `'unsafe-inline'` — the inline theme
  script and the stylesheet sonner injects are admitted by `sha256-` hashes that
  [`scripts/security-headers.ts`](./scripts/security-headers.ts) derives from the build — plus
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` and the two
  cross-origin policies;
- `/healthz` answers `200` for the image's `HEALTHCHECK`.

| Setting             | Where                 | Default                            | Meaning                                                                |
| ------------------- | --------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Build argument        | `/v1`                              | Compiled into the bundle; an absolute URL's origin joins `connect-src` |
| `API_UPSTREAM`      | Container environment | `http://host.docker.internal:8000` | Origin `/v1` is forwarded to; must resolve when the container starts   |
| `WEB_PORT`          | `docker-compose.yml`  | `8080`                             | Host port the `web` service publishes                                  |

```bash
docker build --tag frontend-boilerplate .
docker run --rm --publish 8080:8080 --env API_UPSTREAM=http://api.internal:8000 frontend-boilerplate
```

`npm run preview` sends the same headers, so `npm run test:e2e` fails any scenario whose page
violates the policy, and CI's `Container image` job builds the image, checks it with `curl` and runs
the whole end-to-end suite against it. Terminate TLS — and send `Strict-Transport-Security` — in
front of the container. [Production container](./docs/features/deployment.md) covers the
configuration, other hosts and every trade-off.

## Testing

```bash
npm test                  # Vitest in jsdom — hermetic, no server, no browser
npm run test:coverage     # the same suite with the 90% per-file gate enforced
npm run test:e2e          # Playwright: builds the app, previews it, drives real Chromium
E2E_BASE_URL=http://localhost:8080 npm run test:e2e   # the same suite against a running container
```

The unit suite runs in jsdom against stub ports and MSW handlers, asserts on what a user perceives —
roles, accessible names, copy — and is held at 90% lines, branches, functions and statements **per
file**, with `npm run verify:coverage-scope` proving no file escaped measurement. See
[unit testing](./docs/features/unit-testing.md).

The end-to-end suite serves its own production build on port 4173 and answers the API inside the
browser from stubs that pin their own copy of the wire contract and may not import `src/` — which is
what lets it catch drift the unit suite cannot see. Every scenario also fails if its page violates
the Content-Security-Policy. See [end-to-end testing](./docs/features/e2e-testing.md).

## Quality gates

| When                           | What runs                                                                                                                                                                                              | Scope                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `npm install` / `npm ci`       | The `engine-strict` Node check; lefthook installs the git hooks                                                                                                                                        | The dependency tree       |
| `git commit`                   | Prettier, ESLint, oxlint on staged files, plus glob-gated a11y-config and lockfile checks; commitlint on the message                                                                                   | Staged files, the message |
| `git push`                     | `npm run audit`                                                                                                                                                                                        | The whole working tree    |
| Push or pull request to `main` | `npm run audit`, `npm run test:e2e`, `npm run audit:deps`, and the production container: built, checked with `curl`, and put through the end-to-end suite; for a pull request, commitlint on its title | A clean checkout          |

The gate list lives in `package.json` only, so CI runs exactly the command you run locally. Hooks are
managed by [lefthook](https://github.com/evilmartians/lefthook) and install themselves on
`npm install`; `git commit --no-verify` and `git push --no-verify` skip them, which makes `pre-push`
a strong default rather than a guarantee. A weekly scheduled run repeats `npm run audit:deps` alone.
[Quality gates](./docs/features/quality-gates.md) covers every check, the bundle-size baseline, and
how to add a gate.

## Troubleshooting

**`/users/<id>` bounces to `/sign-in`, and signing in says it is unavailable.** Expected with no
API: the guard resolves the session through `POST /v1/auth/refresh` and a refused connection is not
an authenticated session. Run an API behind the dev proxy — see [Getting started](#getting-started)
— or read
[See a guarded screen locally](./docs/features/route-guard.md#see-a-guarded-screen-locally).

**`npm run typecheck` fails on a route you just added.** The route tree is generated, and `tsc`
reads the committed copy. `npm run dev` or `npx vite build` rewrites
`src/app/router/route-tree.gen.ts`; commit it with the route module. `npm run audit` cannot fix this
for you — `typecheck` runs before `build`, so it fails first.

**`npm run test:e2e` fails before any test runs.** Either the browser is missing —
`npx playwright install chromium` (Linux: add `--with-deps`) — or something already holds port 4173,
usually a leftover `npm run preview`. The suite serves its own build with `--strictPort` and never
reuses a running server.

**`npm install` fails with `EBADENGINE`.** `.npmrc` sets `engine-strict=true`, and the real floor is
Node 24.15 (see [Requirements](#requirements)). `nvm install && nvm use` picks up `.nvmrc`. Note
that the check gates installs, not `npm run`, so an already-populated `node_modules` hides a Node
downgrade until the next fresh install.

**The container exits at once with `host not found in upstream`.** nginx resolves `API_UPSTREAM`
when it starts, and the name did not resolve. With `docker run` on Linux, add
`--add-host=host.docker.internal:host-gateway` for the default upstream; otherwise point
`API_UPSTREAM` at a host the container can resolve. A host that resolves but refuses connections is
no start-up error: `/v1` answers `502`, and the app shows its "unavailable" states.

**`docker compose up` fails with `port is already allocated`.** Something else holds port 8080.
Publish another one: `WEB_PORT=8081 docker compose up --build --wait`.

**Commits and pushes run no checks.** `.git/hooks` is missing them. lefthook writes them from its
own `postinstall`, so any install that did not run it — a skipped `npm install`, or one with `CI`
set — leaves the repo unhooked. Reinstall with `npx lefthook install -f`.

**`npm run audit` fails on formatting you did not touch.** `audit` runs `prettier --check`, not
`--write`, exactly as CI does; the pre-commit hook is what formats staged files. Run
`npm run format`.

## Documentation

One document per capability lives in [`docs/features/`](./docs/features/), indexed by
[`docs/README.md`](./docs/README.md), with the generated module graph in
[`docs/architecture-graph.md`](./docs/architecture-graph.md).

## Contributing

Pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for the setup, the five build
gates, the conventions and the commit format. Run `npm run audit` and `npm run test:e2e` before
opening one. Everyone taking part is expected to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

For anything security related, follow [SECURITY.md](./SECURITY.md) and report privately rather than
opening an issue.

## License

[MIT](./LICENSE)
