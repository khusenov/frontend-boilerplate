# Configuration and environment

> **Status:** Complete · **Layers:** app, pages, entities, shared, outside layers · **Verified against:** `1c193c6`

## Purpose

A single-page app ships as static files, so the settings it runs with — above all, where its API
lives — are fixed when Vite builds it. This feature decides how those settings get in and how far
they reach: `src/shared/config` is the only module that reads `import.meta.env`, it trims and
defaults what it finds into a typed `appConfig`, and the top of the component tree hands those
values down as plain strings, so no component depends on the build environment and each one can be
tested with a literal. Around it sit the files that decide what a build sees — `env.d.ts`,
`.env.example`, the `.env*` rules in `.gitignore`, the dev proxy in `vite.config.ts` and the
end-to-end pin in `playwright.config.ts` — and one rule no tool can enforce: nothing secret belongs
in a `VITE_` variable, because every one the app reads is compiled into the public bundle.

## How it works

Feature-Sliced Design (FSD) splits `src/` into _layers_ — `app`, `pages`, `widgets`, `features`,
`entities`, `shared` — and a module imports only from layers strictly below its own (the Import
Rule). `app` and `shared` are divided into _segments_, purpose-named folders; the layers between
them into _slices_, one folder per screen, user action or business noun. `src/shared/config` is a
segment, and other code reaches it only through its _public API_, the `index.ts` barrel imported as
`@/shared/config`, which exports `appConfig` and nothing else. Values leave it at the _composition
seam_: the _composition root_ `src/app/entrypoint`, where the app constructs its concrete objects,
together with the route modules under `src/app/routes`.

1. **Vite resolves the environment when it starts.** Every Vite process runs in a _mode_ —
   `development` for `npm run dev`, `production` for `npm run build`, `test` under Vitest — and
   reads `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` from the repository root. A
   later file overrides an earlier one, and a variable already set in the process environment
   overrides them all. Only keys prefixed `VITE_` reach `import.meta.env`, next to Vite's built-ins
   such as `MODE`; `env.d.ts` declares the one key the app reads, `VITE_API_BASE_URL`, as an
   optional string.
2. **`app-config.ts` normalizes once per page load.** At bootstrap, loading `src/main.tsx` pulls in
   `App` and, through it, `src/shared/config/app-config.ts`, which is evaluated once: it trims
   `VITE_API_BASE_URL` — an absent value becomes `''` — and exports `appConfig`, a constant with
   three fields: `name`, the literal `'frontend-boilerplate'`; `mode`, which is
   `import.meta.env.MODE`; and `apiBaseUrl`, the trimmed value, or `DEFAULT_API_BASE_URL` (`'/v1'`)
   when the trimmed value is empty. The dev server hands each module the values it loaded at
   startup; a production build compiles them in, so `dist/` contains no `import.meta.env` at all. In
   today's build `appConfig` sits in a chunk of its own, `dist/assets/app-config-*.js`, which both
   the entry chunk and the `/` route's chunk import — open it after `npm run build` to see exactly
   what the build resolved.
3. **The composition seam passes the values down — with one exception below it.** Exactly three
   modules in `src/` import `appConfig`. Two of them make up the composition seam:
   - `App` (`src/app/entrypoint/app.tsx`) passes `appConfig.apiBaseUrl` to `AppProviders` as its
     `apiBaseUrl` prop. `AppProviders` calls `createAuthenticatedTransport(apiBaseUrl)` once, in a
     `useState` initializer, and that factory gives the string to both HTTP clients as `baseUrl`,
     which becomes axios's `baseURL`. Every API path is joined beneath it: with the default, the
     session refresh is `POST /v1/auth/refresh` and a profile read is `GET /v1/users/{id}`.
     [HTTP transport](./http-transport.md) covers the clients.
   - `HomeRoute` (`src/app/routes/index.tsx`) passes all three fields to `HomePage` as its `name`,
     `mode` and `apiBaseUrl` props. The page renders `name` as its heading and the other two through
     the `home` namespace's `environment.mode` and `environment.api` strings
     ([Internationalization](./internationalization.md)), so `npm run dev` shows
     `mode: development · api: /v1` under the heading.
   - **The third reader is a documented exception, not part of the seam:**
     `src/entities/session/model/session-token-source.ts` sits in the `entities` layer and imports
     `appConfig` itself, building `REFRESH_TASK_NAME` from `appConfig.name` when the module loads.
     The result, `frontend-boilerplate:session-refresh`, is the name of the Web Lock —
     `navigator.locks`, a mutex shared by every tab of an origin — under which token refreshes run
     one at a time ([Session management](./session-management.md)). Nothing lints the
     composition-seam convention, so this import passes every gate; it is the one existing
     exception rather than a pattern to copy ([Design decisions](#design-decisions--trade-offs)).
4. **In development, the dev server forwards the API.** A base URL that is a path resolves against
   the page's own origin, so with the default every API request goes to the Vite dev server
   (`http://localhost:5173` by default). `server.proxy` in `vite.config.ts` forwards every path
   under `/v1`, unchanged, to `http://localhost:8000`, where backend-boilerplate — the API this
   template pairs with — listens by default. To the browser the API is same-origin: no CORS, no
   preflight, and the refresh cookie the API sets with `path: '/v1/auth'` is stored as the dev
   server's own and sent back on the next `/v1/auth/refresh`. `npm run preview` forwards the same
   way, because `vite.config.ts` sets no `preview.proxy` and Vite falls back to `server.proxy`.
5. **In the end-to-end suite, the build is pinned.** Playwright's `webServer` runs
   `npm run build && npm run preview -- --port 4173 --strictPort` (`PREVIEW_PORT` is `4173`) with
   `webServer.env` set to `{ VITE_API_BASE_URL: API_PREFIX }`. `API_PREFIX` — `'/v1'`, in
   `e2e/fixtures/http-contract.ts` — is also what the stubs build their `**/v1/**` route pattern
   from, and they answer every such request inside the browser
   ([End-to-end testing](./e2e-testing.md)).

**Failure paths.**

- _A blank value._ `VITE_API_BASE_URL=` in a `.env`, or a value of nothing but spaces, counts as
  unset and yields `/v1`. Without that check `''` would be compiled into the bundle; axios ignores
  an empty `baseURL`, so every request would go to a bare path such as `/auth/refresh` on the
  page's origin.
- _No API behind the proxy._ With nothing listening on port 8000, the dev server answers each
  proxied request with `502` and prints `http proxy error` in the terminal. The app reads that as an
  unavailable API: a guarded route sends the visitor to `/sign-in`
  ([Authenticated route guard](./route-guard.md)) and a sign-in attempt answers `unavailable`
  ([Sign-in](./sign-in.md)).
- _A base URL without the `/v1` segment_ — an API published under `/api` by a rewriting proxy, say.
  Requests reach the API, but the browser withholds the refresh cookie from every path outside
  `/v1/auth`, so the refresh is answered `401` and every session looks expired.
  [Session management](./session-management.md) owns the cookie rules.

## Architecture

A _seam_ — the repo's word, used interchangeably with _port_ — is the type a consumer programs
against, so that whatever sits behind it can change; for configuration the seam is deliberately
plain data. Below the composition seam nothing programs
against `appConfig`: each consumer declares the scalar it needs — the `apiBaseUrl: string` prop of
`AppProviders`, the `baseUrl` parameter of `createAuthenticatedTransport`, the `baseUrl` option of
`createHttpClient`, the three `readonly` string props of `HomePage` — and receives it from above.
The one concrete source of those values is `appConfig`, a module constant in `shared/config` that
imports nothing and is the only reader of `import.meta.env`, and the composition seam binds it:
`app/entrypoint/app.tsx` and `app/routes/index.tsx` read it and pass flat values down
([Composition root](./composition-root.md)). Every import points downward, as the Import Rule
requires: `app` → `shared/config`, plus `entities/session` → `shared/config` in
`session-token-source.ts`, the one reader below `app`. That import passes both gates —
`eslint.config.js` has no `no-restricted-imports` entry for `@/shared/config`, and steiger's
`fsd/forbidden-imports` rejects only upward and same-layer cross-slice imports — so reading
configuration at the composition seam is a convention, not a fence
([Architecture boundaries](./architecture-boundaries.md)); check it with
`grep -rn "@/shared/config" src`. What steiger does reject is a deep import past the barrel, such as
`@/shared/config/app-config`, from any layer above `shared` (`fsd/no-public-api-sidestep`).

| Component                          | Layer                      | Responsibility                                                                                                               | File                                                   |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `appConfig`                        | `shared/config`            | The resolved settings — `name`, `mode`, `apiBaseUrl` — built by the only module in `src/` that reads `import.meta.env`       | `src/shared/config/app-config.ts`                      |
| `DEFAULT_API_BASE_URL`             | `shared/config` (internal) | `'/v1'`, used when `VITE_API_BASE_URL` is unset, empty or whitespace-only                                                    | `src/shared/config/app-config.ts`                      |
| Barrel                             | `shared/config`            | Public API: re-exports `appConfig`                                                                                           | `src/shared/config/index.ts`                           |
| `ImportMetaEnv`, `ViteTypeOptions` | `outside layers`           | Declare `VITE_API_BASE_URL` as an optional string; `strictImportMetaEnv` turns a read of an undeclared key into a type error | `env.d.ts`                                             |
| Variable template                  | `outside layers`           | The committed list of variables: `VITE_API_BASE_URL=/v1`                                                                     | `.env.example`                                         |
| `# Env` rules                      | `outside layers`           | Ignore `.env` and `.env.*`; re-include `.env.example`                                                                        | `.gitignore`                                           |
| `server.proxy`                     | `outside layers`           | Forwards `/v1` to `http://localhost:8000` under `npm run dev` and, by fallback, `npm run preview`                            | `vite.config.ts`                                       |
| `webServer.env`                    | `outside layers`           | Pins `VITE_API_BASE_URL` to `API_PREFIX` for the build the end-to-end suite runs against                                     | `playwright.config.ts`                                 |
| `API_PREFIX`                       | `outside layers`           | `'/v1'`: the pinned base URL and the root of the stubs' `API_ROUTE_PATTERN`                                                  | `e2e/fixtures/http-contract.ts`                        |
| `App`                              | `app/entrypoint`           | Reads `appConfig.apiBaseUrl` and passes it to `AppProviders`                                                                 | `src/app/entrypoint/app.tsx`                           |
| `AppProviders`                     | `app/entrypoint`           | Takes `apiBaseUrl` as a prop and builds the transport with it once, in `useState`                                            | `src/app/entrypoint/app-providers.tsx`                 |
| `createAuthenticatedTransport`     | `app/entrypoint`           | Gives the base URL to both HTTP clients as `baseUrl`                                                                         | `src/app/entrypoint/create-authenticated-transport.ts` |
| `createHttpClient`                 | `shared/api`               | Turns `baseUrl` into axios's `baseURL` ([HTTP transport](./http-transport.md))                                               | `src/shared/api/http-client.ts`                        |
| `HomeRoute`                        | `app/routes`               | Reads all three fields and passes them to `HomePage` as props                                                                | `src/app/routes/index.tsx`                             |
| `HomePage`                         | `pages/home · ui`          | Receives `name`, `mode` and `apiBaseUrl` as `readonly` string props and displays them                                        | `src/pages/home/ui/home-page.tsx`                      |
| `REFRESH_TASK_NAME`                | `entities/session · model` | `appConfig.name` plus `:session-refresh`, the refresh lock's name; the one read of `appConfig` below `app`                   | `src/entities/session/model/session-token-source.ts`   |

## Public surface

This feature serves no route. Its contract is one export, one variable, and the files and scripts
that decide what a build sees. The home page at `/` prints `mode` and `apiBaseUrl`, which makes it
the quickest way to check what a running build resolved.

### `@/shared/config`

`appConfig` is declared `as const`, so its type is
`{ readonly name: 'frontend-boilerplate'; readonly mode: string; readonly apiBaseUrl: string }` —
read-only at compile time; the object itself is not frozen. `DEFAULT_API_BASE_URL` and
`configuredApiBaseUrl` are private to `app-config.ts`.

| Field        | Type                     | Source                       | Value                                                                                                                                                                                                                                        |
| ------------ | ------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | `'frontend-boilerplate'` | A literal in `app-config.ts` | The heading of `/` and the namespace of the refresh lock. Code, not environment: changing it is a commit                                                                                                                                     |
| `mode`       | `string`                 | `import.meta.env.MODE`       | `development` under `npm run dev`; `production` in `npm run build` output, and so under `npm run preview` and the end-to-end suite; `test` under Vitest. Nothing branches on it: `HomeRoute` passes it to `HomePage`, which only displays it |
| `apiBaseUrl` | `string`                 | `VITE_API_BASE_URL`          | The variable, trimmed — or `'/v1'` when it is unset, empty or whitespace-only                                                                                                                                                                |

### Files

| File                                                     | In git                                       | Role                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local` | No: `.gitignore` ignores `.env` and `.env.*` | Per-machine values, read by `npm run dev`, `npm run build` and `npm test`                                                                       |
| `.env.example`                                           | Yes: `!.env.example` re-includes it          | The committed list of variables the app understands. Vite never reads it; copy it to `.env`                                                     |
| `env.d.ts`                                               | Yes                                          | Declares each variable on `ImportMetaEnv` and turns on `strictImportMetaEnv`; `tsconfig.app.json` includes it, so the types cover all of `src/` |
| `src/shared/config/app-config.ts`                        | Yes                                          | Reads, normalizes and exports every setting                                                                                                     |
| `vite.config.ts`                                         | Yes                                          | The `/v1` dev proxy                                                                                                                             |
| `playwright.config.ts`                                   | Yes                                          | The end-to-end pin                                                                                                                              |

### Scripts

| Script             | Mode          | What the app sees                                                                                                                                                 |
| ------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`      | `development` | `.env`, `.env.local`, `.env.development`, `.env.development.local`; `/v1` proxied to `http://localhost:8000`. Changing one of those files restarts the dev server |
| `npm run build`    | `production`  | `.env`, `.env.local`, `.env.production`, `.env.production.local`, compiled into `dist/`                                                                           |
| `npm run preview`  | As built      | `dist/` exactly as the last build left it; `/v1` proxied as under `npm run dev`                                                                                   |
| `npm test`         | `test`        | `.env`, `.env.local`, `.env.test`, `.env.test.local`: Vitest copies their `VITE_*` values into the test environment                                               |
| `npm run test:e2e` | `production`  | A fresh build with `VITE_API_BASE_URL` pinned to `/v1`, whatever the `.env` files say                                                                             |

`npm run audit` runs `npm run build` and the unit suite the same way; in CI no `.env` file exists,
so both see the defaults ([Quality gates](./quality-gates.md)).

## Configuration

| Variable / option                                          | Default                                                            | Meaning                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL`                                        | `/v1` (`DEFAULT_API_BASE_URL`), also when empty or whitespace-only | Base URL of every API request: a path on the app's own origin, such as `/v1`, or an absolute URL, such as `https://api.example.com/v1`. Trimmed, then exposed as `appConfig.apiBaseUrl`. axios drops trailing slashes when it joins the base and a path, so `/v1/` behaves like `/v1`. Keep the `/v1` segment — the refresh cookie depends on it ([Session management](./session-management.md)) |
| `import.meta.env.MODE`                                     | Set by Vite: `development`, `production` or `test`                 | Exposed as `appConfig.mode`. The same mode is what `vite.config.ts` compares (`mode === 'test'`) to leave the router plugin out of Vitest runs ([Routing](./routing.md))                                                                                                                                                                                                                         |
| `appConfig.name`                                           | `'frontend-boilerplate'`                                           | A literal, not a variable: the heading of `/` and the refresh-lock namespace                                                                                                                                                                                                                                                                                                                     |
| `strictImportMetaEnv` (`ViteTypeOptions` in `env.d.ts`)    | On                                                                 | Removes the `Record<string, any>` fallback from `ImportMetaEnv`, so reading an undeclared key fails `tsc`                                                                                                                                                                                                                                                                                        |
| `server.proxy['/v1']` (`vite.config.ts`)                   | `'http://localhost:8000'`                                          | Dev-server forwarding of every request path under `/v1`, unchanged, to a local API. It reads no environment variable                                                                                                                                                                                                                                                                             |
| `preview.proxy` (`vite.config.ts`)                         | Unset, so `server.proxy` applies                                   | `npm run preview` forwards `/v1` the same way                                                                                                                                                                                                                                                                                                                                                    |
| `webServer.env.VITE_API_BASE_URL` (`playwright.config.ts`) | `API_PREFIX` (`'/v1'`)                                             | The base URL of the build the end-to-end suite runs against                                                                                                                                                                                                                                                                                                                                      |
| `envDir`, `envPrefix` (`vite.config.ts`)                   | Unset: the repository root, `VITE_`                                | Where Vite looks for `.env` files, and the prefix a key needs to reach `import.meta.env`                                                                                                                                                                                                                                                                                                         |

For a given mode Vite reads `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local`, in that
order; a later file wins, and a variable already in the process environment — a shell export, a CI
variable, Playwright's `webServer.env` — wins over every file. The parser trims unquoted values and
keeps quoted ones as written; a value from the process environment reaches `app-config.ts`
untouched, and only its `.trim()` cleans it. `playwright.config.ts` also reads `CI` from
`node:process`, which turns on `forbidOnly` and two `retries` for the browser suite rather than
configuring the app — see [End-to-end testing](./e2e-testing.md).

## Usage & extension

### Run against a local API

The default needs no `.env` file. Start an API on `http://localhost:8000` that serves its routes
under `/v1` — backend-boilerplate does both out of the box — and run `npm run dev`; the proxy keeps
every request same-origin. `.env.example` repeats the default today, so `cp .env.example .env`
changes nothing until you edit the copy.

For an API somewhere else, either change the proxy target in `vite.config.ts` — the proxy reads no
environment variable, so this is an edit to a committed file — or bypass the proxy with an absolute
base URL in an untracked `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:9000/v1
```

That makes the API cross-origin: it must allow the app's origin with credentials, and the cookie
rules in [Session management](./session-management.md) apply. The dev server restarts itself when
one of its mode's `.env` files changes, and the new value applies from the next page load.

### Build for a deployment

A build freezes whatever `VITE_API_BASE_URL` it sees, so pick the topology before building. Two
terms separate the options, and they are not synonyms. An _origin_ is a scheme, host and port
together: `https://app.example.com` and `https://api.example.com` are two origins, and so are
`https://app.example.com` and `https://app.example.com:8443`. A _site_ is wider — the scheme plus
the **registrable domain**, which is the public suffix (`com`, `co.uk`, `github.io`) plus the single
label in front of it. So `app.example.com` and `api.example.com` are one site, `example.com`, while
`app.other.com` is a second site. The refresh cookie is scoped to the site rather than to the
origin, which is what makes the second option below workable at all.

- **Same origin — the default.** Serve `dist/` and forward `/v1`, path unchanged, to the API from
  the same origin, as the dev proxy does. Build with no variable at all; the resulting `dist/` runs
  unmodified on every host with that routing, plus the fallback to `index.html` every deep link
  needs ([Routing](./routing.md)).
- **Another origin on the same site** — same registrable domain, different host or port. Set the
  variable in the build environment:

  ```sh
  VITE_API_BASE_URL=https://api.example.com/v1 npm run build
  ```

  Keep the `/v1` path, and keep the API on the app's registrable domain: the refresh cookie is
  `sameSite: 'strict'`, so the browser attaches it only when the request's target site matches the
  site of the page in the address bar. An app on `app.example.com` may therefore call
  `api.example.com`; move the API to `api.other.com` and the browser withholds the cookie with no
  error of any kind — the refresh is answered `401` and every session looks expired
  ([Session management](./session-management.md)). Each API origin needs its own build.

In today's build the resolved values are visible in `dist/assets/app-config-*.js`; check them there
before shipping.

### Add a variable

Every new variable takes the same five steps. The example adds a hypothetical `VITE_SUPPORT_EMAIL`
for a hypothetical `/support` page.

1. Declare it in `env.d.ts`, optional like `VITE_API_BASE_URL` because it may be absent;
   `strictImportMetaEnv` rejects any read of it until this line exists:

   ```ts
   /// <reference types="vite/client" />

   interface ViteTypeOptions {
     strictImportMetaEnv: unknown;
   }

   interface ImportMetaEnv {
     readonly VITE_API_BASE_URL?: string;
     readonly VITE_SUPPORT_EMAIL?: string;
   }
   ```

2. List it in `.env.example` with a harmless example value — the file is committed, and a `VITE_`
   value is public anyway:

   ```dotenv
   VITE_API_BASE_URL=/v1
   VITE_SUPPORT_EMAIL=support@example.com
   ```

3. Normalize it in `src/shared/config/app-config.ts`. With a second variable the trim-and-fall-back
   step earns a name, so every variable treats a blank value the same way:

   ```ts
   const DEFAULT_API_BASE_URL = '/v1';
   const DEFAULT_SUPPORT_EMAIL = 'support@example.com';

   function orDefault(configured: string | undefined, fallback: string): string {
     const trimmed = configured?.trim() ?? '';

     return trimmed === '' ? fallback : trimmed;
   }

   export const appConfig = {
     name: 'frontend-boilerplate',
     mode: import.meta.env.MODE,
     apiBaseUrl: orDefault(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL),
     supportEmail: orDefault(import.meta.env.VITE_SUPPORT_EMAIL, DEFAULT_SUPPORT_EMAIL),
   } as const;
   ```

4. Pin it in `src/shared/config/app-config.test.ts`, inside `describe('appConfig')`, where
   `loadConfig()` — a dynamic `import('./app-config')` that re-evaluates the module after
   `vi.stubEnv()`, since `appConfig` is computed once when its module loads — and the `afterEach`
   reset already exist:

   ```ts
   it('uses VITE_SUPPORT_EMAIL when it is set', async () => {
     vi.stubEnv('VITE_SUPPORT_EMAIL', 'help@example.test');

     await expect(loadConfig()).resolves.toMatchObject({ supportEmail: 'help@example.test' });
   });

   it('falls back to the default support email when VITE_SUPPORT_EMAIL is blank', async () => {
     vi.stubEnv('VITE_SUPPORT_EMAIL', '   ');

     await expect(loadConfig()).resolves.toMatchObject({ supportEmail: 'support@example.com' });
   });
   ```

5. Read it at the composition seam and pass it down. The route module reads `appConfig`, as
   `src/app/routes/index.tsx` does for `HomePage`; the page declares
   `readonly supportEmail: string`, never imports `@/shared/config`, and is tested with a literal.
   In `src/app/routes/support.tsx`:

   ```tsx
   import { createFileRoute } from '@tanstack/react-router';

   import { SupportPage } from '@/pages/support';
   import { appConfig } from '@/shared/config';

   function SupportRoute() {
     return <SupportPage supportEmail={appConfig.supportEmail} />;
   }

   export const Route = createFileRoute('/support')({
     component: SupportRoute,
   });
   ```

   Then regenerate the route tree with `npx vite build` ([Routing](./routing.md)). A value the
   composition root needs itself, as it needs `apiBaseUrl`, is read in `src/app/entrypoint/app.tsx`
   and passed on as a prop or a factory argument instead.

### Keep reads at the composition seam

- Import `appConfig` only in `src/app/entrypoint/app.tsx` and in route modules under
  `src/app/routes`, and only through the barrel, `@/shared/config`.
- Below `app`, take the value as a prop or a factory argument. No lint rule stops a module in the
  `pages`, `features` or `entities` layer from importing `@/shared/config`, so the rule holds only
  as long as review holds it;
  `session-token-source.ts` is the one existing exception
  ([Design decisions](#design-decisions--trade-offs)).
- Read `import.meta.env` nowhere but `src/shared/config`. A second reader would need the
  `vi.stubEnv()` + `vi.resetModules()` + dynamic `import()` pattern in its own tests, and would
  treat blank values its own way.

### Change the API prefix

The backend owns the prefix — backend-boilerplate declares it as `API_V1_PREFIX` and scopes the
refresh cookie to `<prefix>/auth` — so a new API version means editing every place the frontend
spells `/v1`:

- `DEFAULT_API_BASE_URL` in `src/shared/config/app-config.ts`, plus the three fallback cases in
  `src/shared/config/app-config.test.ts`;
- `VITE_API_BASE_URL` in `.env.example`;
- the `server.proxy` key in `vite.config.ts`;
- `API_PREFIX` in `e2e/fixtures/http-contract.ts`, which moves the end-to-end pin and
  `API_ROUTE_PATTERN` together;
- `USER_RESOURCE_PATTERN` in `e2e/fixtures/user-stub.ts`, a regular expression with its own `/v1`.

### Rename the app when forking

`appConfig.name` namespaces the refresh lock, and Web Locks are per origin: two apps built from this
template and served from one origin would otherwise queue behind each other's refreshes. Change it
in `src/shared/config/app-config.ts`. It is also the heading of `/`, so update the four tests that
assert that heading's text — `src/main.test.ts`, `src/app/entrypoint/app.test.tsx`,
`src/app/router/app-router-provider.test.tsx` and `src/app/router/create-app-router.test.tsx`;
`src/pages/home/ui/home-page.test.tsx` passes the name as a literal and needs no change. Three other
copies of the name do not follow `appConfig.name` and change separately: the `<title>` in
`index.html`, `name` in `package.json`, and `SCHEMA_VENDOR` in `src/shared/api/response-schema.ts`.

## Design decisions & trade-offs

- **One module reads the environment, and it normalizes on the way in.** `app-config.ts` is the only
  code in `src/` that touches `import.meta.env`; it trims, falls back and hands out plain strings.
  Normalization therefore happens once instead of at every call site, `env.d.ts` types a single
  reader, and only `app-config.test.ts` needs the `vi.stubEnv()` + `vi.resetModules()` + dynamic
  `import()` pattern that module-evaluated configuration demands — everything downstream is tested
  with literals. The same reasoning makes `createHttpClient` a factory that takes `baseUrl` as a
  string rather than a module singleton that reads configuration itself
  ([HTTP transport](./http-transport.md)).
- **Values flow down as props from the composition seam — by convention.** A page or widget
  component that imported `appConfig` could get a different value in a test only by stubbing the
  environment or mocking the module, and could never render two values side by side; reading at the
  top and passing narrow props avoids both, which is why `HomePage` takes three strings and
  `home-page.test.tsx` renders it with neither a router nor an environment stub. Route modules are
  part of the seam, not an exception to it: `src/app/routes/index.tsx` is where `HomePage` gets its
  props, and the router tests exercise it against the real values. The rule is not linted, and it
  has one real exception: `session-token-source.ts` in `entities/session` reads `appConfig.name`
  when the module loads. The exception is cheap because `name` is a literal no environment changes,
  so no test of the token source has anything to stub; its cost is that the lock namespace is fixed
  per bundle — `CreateSessionTokenSourceOptions` accepts only `store` and `refresh`.
- **Build-time values, no runtime configuration.** Vite compiles each value into the bundle, so the
  app knows its API before any of its code runs: `AppProviders` builds the transport synchronously
  in a `useState` initializer, with no configuration request to await before the first render and
  no global for the host to inject. The cost is that changing a value means rebuilding. The
  path-shaped default takes most of the sting out: `/v1` resolves against whatever origin serves the
  page, so one `dist/` runs on every host that forwards `/v1` to the API, and only a cross-origin
  API needs a build per environment. Because the value is compiled in, it also changes the bundle's
  bytes, which is why bundle-size baselines are recorded with no `.env` present. The module itself
  costs next to nothing: in today's build `appConfig` is an 86-byte chunk that `index.html`
  preloads.
- **The default is a path, and the path is `/v1`.** The default was `/api` until `224db35` moved it
  to `/v1` and added the dev proxy in the same change. A path keeps every request same-origin
  behind a reverse proxy — the dev server's in development, the production host's in production —
  and `/v1` is not cosmetic: backend-boilerplate issues the refresh cookie with `path: '/v1/auth'`,
  so a base URL whose public path differs sends the refresh without its cookie, and every renewal
  fails with a `401` indistinguishable from an expired session
  ([Session management](./session-management.md)).
- **Blank means unset, and values are trimmed.** An empty assignment such as `VITE_API_BASE_URL=` is
  an ordinary state for a hand-edited `.env`, and `??` alone would keep the empty string and compile
  it into the bundle. The `.env` parser already trims unquoted values, so `.trim()` exists for the
  values it does not touch: quoted ones, and variables from the process environment — a shell export
  or a CI variable — which arrive verbatim. The fallback check runs on the trimmed value, so a value
  of nothing but whitespace counts as blank.
- **`strictImportMetaEnv`, and the variable is optional.** Without the `ViteTypeOptions` block,
  Vite's `ImportMetaEnv` extends `Record<string, any>`, and `import.meta.env.VITE_API_BASEURL`
  type-checks as `any`; with it, `tsc` fails with TS2551 and suggests `VITE_API_BASE_URL`. Declaring
  the key `?: string` is the honest type — the variable may be absent — and it is what makes
  `app-config.ts` handle `undefined`. The block has been in place since the bootstrap commit,
  `816267d`; its cost is that a variable must be declared before it can be read, which is the point.
- **A dev proxy, not CORS.** Pointing the app straight at `http://localhost:8000/v1` would make the
  API cross-origin: it would have to allow the dev origin with credentials, and every request that
  carries `Authorization` or a JSON body would pay a CORS preflight — the refresh that recovers a
  session included. The proxy removes all of that, and it models the reverse-proxy topology the
  default assumes in production. It exists only in the two Vite servers; a production host has to
  provide the same routing.
- **The end-to-end build is pinned through the stubs' own constant.** `webServer.env` takes its
  value from `API_PREFIX`, so the base URL the bundle calls and the `**/v1/**` pattern the stubs
  intercept cannot drift apart. The pin beats a developer's untracked `.env`, because Vite lets the
  process environment win over env files, and a shell export, because Playwright spreads
  `webServer.env` over the environment it inherits; `reuseExistingServer: false` refuses to run
  against a server already listening on port 4173, which may have been built with other values.
  Without the pin, a local `.env` would retarget the bundle's requests past the stubs and turn
  machine-specific settings into failures that read as application bugs — the harness commit,
  `5f69818`, confirmed the suite still passes against a deliberately conflicting `.env`
  ([End-to-end testing](./e2e-testing.md)).
- **Only the template is committed.** `.gitignore` ignores `.env` and every `.env.*` — mode files
  such as `.env.production` included — and re-includes `.env.example`, which makes it the one
  committed record of the variables the app understands. Values for a real deployment belong in the
  build environment, not in the repository.
- **No secrets, by construction.** Every `VITE_*` value a build reads is compiled into files every
  visitor downloads, and a variable without the prefix is invisible to `src/` rather than protected.
  The frontend has no secret to keep: its credentials arrive at runtime — the access token held in
  memory, the refresh token in an `httpOnly` cookie — and never pass through configuration
  ([Session management](./session-management.md)).

## Testing

Unit tests sit beside the modules they cover ([Unit and component testing](./unit-testing.md)):

| Test file                                                                                                                                         | What it proves                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/config/app-config.test.ts`                                                                                                            | A set `VITE_API_BASE_URL` is used; unset, empty and whitespace-only values fall back to `/v1`; surrounding whitespace is trimmed; `mode` is `test` under Vitest                           |
| `src/pages/home/ui/home-page.test.tsx`                                                                                                            | The page renders whichever `name`, `mode` and `apiBaseUrl` it is given — `production` and `https://api.example.test` included — from literals, with no router and no environment stub     |
| `src/app/entrypoint/create-authenticated-transport.test.ts`                                                                                       | Given the literal base `https://api.test`, both clients send their requests beneath it: the MSW server errors on any request its handlers, all registered under that origin, do not match |
| `src/app/entrypoint/app.test.tsx`, `src/app/router/create-app-router.test.tsx`, `src/app/router/app-router-provider.test.tsx`, `src/main.test.ts` | Render `/` through the real `HomeRoute`, and so through the real `appConfig`, and find its `name`, `frontend-boilerplate`, as the heading                                                 |
| `e2e/**/*.spec.ts`                                                                                                                                | Run against a production build pinned to `VITE_API_BASE_URL=/v1`. The stubs answer only requests under `/v1`, so a build whose base URL lost the prefix fails every spec that loads data  |

`appConfig` is computed when its module is evaluated, so each case in `app-config.test.ts` stubs the
variable with `vi.stubEnv()` and then imports the module afresh through `loadConfig()`, a dynamic
`import('./app-config')`; `afterEach` calls `vi.unstubAllEnvs()` and `vi.resetModules()` so the next
case evaluates it again. Every case that asserts on `apiBaseUrl` sets the variable explicitly —
`undefined` for the unset case — because Vitest copies `VITE_*` values from a developer's `.env`
into the test environment. The `/api` that `home-page.test.tsx` and `app-providers.test.tsx` pass as
`apiBaseUrl` is an arbitrary literal (it was the default before `224db35`); nothing there depends on
the real value.

```sh
npm test
npx vitest run src/shared/config/app-config.test.ts
npm run test:e2e
```

Gaps: no test ties `App` to `appConfig.apiBaseUrl`. `app-config.test.ts` proves the field honours
the variable, but the end-to-end pin sets the same `/v1` the default produces, so a build that
ignored the variable would still pass. The dev proxy has no test at all: the end-to-end stubs answer
every `/v1` request inside the browser, so none reaches the preview server's proxy.

## Known limitations

- **The composition-seam rule is unenforced.** ESLint has no rule for `@/shared/config` and steiger
  accepts any downward import, so a module in the `pages`, `features` or `entities` layer that
  imports `appConfig` passes every gate; `src/entities/session/model/session-token-source.ts`
  already does. The only check is
  `grep -rn "@/shared/config" src`.
- **The value is not validated.** `app-config.ts` trims and falls back, nothing more: any non-blank
  string becomes axios's `baseURL`, so a typo in `VITE_API_BASE_URL` builds cleanly and surfaces
  only when requests fail at runtime.
- **The prefix has no single source.** `/v1` is spelled out in the five places listed under
  [Change the API prefix](#change-the-api-prefix); only `API_PREFIX` feeds more than one consumer.
- **No production routing ships.** The same-origin topology the default relies on exists only in
  `vite.config.ts`, which configures `npm run dev` and `npm run preview`; the repository contains no
  host or reverse-proxy configuration for a deployment.
