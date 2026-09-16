# Production container

> **Status:** Complete · **Layers:** outside layers · **Verified against:** `5385d7a`

## Purpose

`npm run build` produces static files, and static files are only half a deployment. Something still
has to answer every deep link with `index.html`, cache the hashed assets for a year and the document
never, forward `/v1` to the API on the one origin the refresh cookie needs, and send a
`Content-Security-Policy` strict enough to matter while still admitting the inline pre-paint theme
script and the stylesheet sonner injects at runtime. Until this capability existed, `SECURITY.md`
handed all of that to whoever deployed the template, and a hand-written policy that missed either
inline resource failed silently: the theme flash came back, the toasts lost their styling, and
every gate stayed green. The container is the template's answer — a two-stage `Dockerfile` that
builds the app and serves it from unprivileged nginx, with a policy derived from the build itself —
and `vite preview` serves the same headers, so the end-to-end suite runs under the production
policy on every pull request.

## How it works

**Build.** `docker build` — or `docker compose up --build` — runs two stages. The `build` stage
starts from `node:24-bookworm-slim`, installs the locked dependencies with
`npm ci --ignore-scripts`, copies the repository minus everything `.dockerignore` lists, and runs
`npm run build` with `VITE_API_BASE_URL` taken from a build argument whose default is `/v1`. It then
runs `node scripts/security-headers.ts nginx dist/index.html`, which prints one
`add_header … always;` directive per header into `security-headers.conf`. The `runtime` stage
starts from `nginxinc/nginx-unprivileged:1.31-alpine` and copies three things: `dist/` to
`/usr/share/nginx/html`, the headers file to `/etc/nginx/snippets/security-headers.conf`, and
`docker/nginx/default.conf.template` to `/etc/nginx/templates/`.

**Start.** The nginx image's entrypoint substitutes every defined environment variable into each
file under `/etc/nginx/templates/` — here only `API_UPSTREAM`, whose image default is
`http://host.docker.internal:8000` — and writes the result to `/etc/nginx/conf.d/default.conf`.
nginx then starts as uid 101 on port 8080 and resolves the upstream's host name once, at start-up.
The image's `HEALTHCHECK` requests `/healthz` every 30 seconds with `wget`.

**Serve.** The server block has four locations:

- `= /healthz` answers `200` with `ok`, unlogged.
- `/v1/` is proxied to `API_UPSTREAM` with the path unchanged, `Host`, `X-Real-IP`,
  `X-Forwarded-For` and `X-Forwarded-Host` set, and `X-Forwarded-Proto` passed through from an
  upstream proxy when one set it, or taken from the request's own scheme when none did.
- `/assets/` serves a file with `Cache-Control: public, max-age=31536000, immutable`, and answers a
  missing one with a plain `404`.
- Every other path is served as a file if one exists and as `/index.html` if not, with
  `Cache-Control: no-cache`.

Both static locations include the security headers, and every `add_header` carries `always`, so an
error page sends them too. Responses of 1 kB or more are gzip-compressed.

**The policy.** `readPolicySources` in `scripts/security-headers.ts` derives three lists, and
`createContentSecurityPolicy` places them into ten directives:

- `script-src 'self'` plus the SHA-256 of every inline `<script>` in the built `index.html` — today
  the pre-paint theme script — and `'report-sample'`;
- `style-src 'self'` plus the SHA-256 of the stylesheet sonner injects, read out of sonner's own
  ESM entry, the SHA-256 of the empty string, and `'report-sample'`;
- `connect-src 'self'` plus the origin of `VITE_API_BASE_URL` when that value is an absolute URL;
- fixed values for the rest: `default-src 'self'`, `img-src 'self' data:`, `font-src 'self'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`.

`createSecurityHeaders` sends that policy with six companions: `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `Permissions-Policy`, `Referrer-Policy`, `X-Content-Type-Options`
and `X-Frame-Options`.

**Preview parity.** When `vite preview` starts, `vite.config.ts` calls the same two functions, with
`dist/index.html` and the `VITE_API_BASE_URL` that `loadEnv` resolves for the preview's mode, and
hands the result to `preview.headers`. `npm run test:e2e` builds and previews, so every scenario
runs under the policy the container sends, and the harness's automatic `policyViolations` fixture
fails any scenario whose page raises a `securitypolicyviolation` event
([End-to-end testing](./e2e-testing.md)). `npm run dev` sends no policy: the dev server injects
inline scripts and styles of its own.

**Failure paths.** An `API_UPSTREAM` whose host name does not resolve stops nginx before it serves
anything — `host not found in upstream "…"` in the container log, and the container exits `1`. One
that resolves but refuses the connection costs only the API: `/v1/` answers `502`, and the app
shows its `unavailable` states. If a sonner upgrade changes how the library injects its CSS, the
build stage — and `vite preview` — fails with
`Expected sonner to inject exactly one stylesheet, found 0.` rather than shipping a policy that
blocks it.

## Architecture

The capability lives entirely outside the Feature-Sliced Design layers: no module under `src/` knows
it exists, and nothing in the app changes when it is replaced. Its single source of truth is
`scripts/security-headers.ts`, a TypeScript module Node 24 runs directly, which serves two consumers
— the `Dockerfile`'s build stage runs it as a command, and `vite.config.ts` imports it — so the
container and the preview cannot send different policies. The runtime configuration is one
environment variable, substituted by the nginx image's own template step; there is no custom
entrypoint.

| Component                                                                             | Layer                        | Responsibility                                                                                                     | File                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `Dockerfile`                                                                          | outside layers · root config | Two stages: build with Node 24, serve with unprivileged nginx; `HEALTHCHECK` on `/healthz`                         | `Dockerfile`                                                   |
| `.dockerignore`                                                                       | outside layers · root config | Keeps dependencies, build output, secrets, version-control and editor state, and the docs out of the build context | `.dockerignore`                                                |
| Server block                                                                          | outside layers · `docker/`   | Health endpoint, `/v1/` proxy, immutable assets, fallback to `index.html`                                          | `docker/nginx/default.conf.template`                           |
| `web` service                                                                         | outside layers · root config | Builds and runs the image locally, with the host reachable as `host.docker.internal`                               | `docker-compose.yml`                                           |
| `createSecurityHeaders`, `createContentSecurityPolicy`                                | outside layers · `scripts/`  | The header set and the policy, from hashes and origins                                                             | `scripts/security-headers.ts`                                  |
| `readPolicySources`, `hashInlineScripts`, `hashSonnerStylesheets`, `toConnectOrigins` | outside layers · `scripts/`  | Derive the policy's sources from the built document, sonner's module and `VITE_API_BASE_URL`                       | `scripts/security-headers.ts`                                  |
| `toNginxDirectives` and the `nginx` command                                           | outside layers · `scripts/`  | Render the headers as `add_header … always;` lines                                                                 | `scripts/security-headers.ts`                                  |
| `createPreviewSecurityHeaders`                                                        | outside layers · root config | Serves the same headers from `vite preview`                                                                        | `vite.config.ts`                                               |
| `policyViolations`, `collectPolicyViolations`                                         | outside layers · `e2e/`      | Fail any end-to-end scenario whose page violates the policy                                                        | `e2e/fixtures/harness.ts`, `e2e/fixtures/policy-violations.ts` |
| `security headers` spec                                                               | outside layers · `e2e/`      | The headers on a deep link, and the pre-paint script running under the policy                                      | `e2e/security-headers.spec.ts`                                 |
| `E2E_BASE_URL`                                                                        | outside layers · root config | Points the suite at a running server instead of building and previewing one                                        | `playwright.config.ts`                                         |
| `Container image` job                                                                 | outside layers · `.github/`  | Builds the image, checks it with `curl`, and runs the end-to-end suite against it                                  | `.github/workflows/ci.yml`                                     |
| `docker` ecosystem                                                                    | outside layers · `.github/`  | Weekly base-image updates, with Node majors ignored so the image stays on the `.nvmrc` line                        | `.github/dependabot.yml`                                       |

## Public surface

### Commands

```sh
docker compose up --build --wait
docker compose down
docker build --tag frontend-boilerplate .
docker run --rm --publish 8080:8080 --add-host=host.docker.internal:host-gateway frontend-boilerplate
node scripts/security-headers.ts nginx dist/index.html
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

`docker compose up --build --wait` returns once the health check passes and serves the app on
<http://localhost:8080>. `--add-host` is what Linux needs for `host.docker.internal`; Docker Desktop
provides the name on its own, and the compose file adds it either way.

### Endpoints

| Path          | Response                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `/healthz`    | `200`, `text/plain`, `ok`; not logged                                                                  |
| `/v1/…`       | Whatever `API_UPSTREAM` answers for the same path; `502` when it refuses the connection                |
| `/assets/…`   | The hashed file with `Cache-Control: public, max-age=31536000, immutable`, or `404`                    |
| Anything else | The file if it exists, otherwise `index.html`, with `Cache-Control: no-cache` and the security headers |

### Headers

| Header                         | Value                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | The ten directives under [How it works](#how-it-works)                                                          |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                   |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                   |
| `Permissions-Policy`           | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()` |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                               |
| `X-Content-Type-Options`       | `nosniff`                                                                                                       |
| `X-Frame-Options`              | `DENY`                                                                                                          |

### `scripts/security-headers.ts`

```ts
export interface ContentSecurityPolicySources {
  readonly scriptHashes: readonly string[];
  readonly styleHashes: readonly string[];
  readonly connectOrigins: readonly string[];
}

export interface PolicySourceLocations {
  readonly indexHtmlPath: string;
  readonly apiBaseUrl: string | undefined;
}

export declare function hashInlineScripts(html: string): string[];
export declare function hashSonnerStylesheets(moduleSource: string): string[];
export declare function toConnectOrigins(apiBaseUrl: string | undefined): string[];
export declare function createContentSecurityPolicy(sources: ContentSecurityPolicySources): string;
export declare function createSecurityHeaders(
  sources: ContentSecurityPolicySources,
): Record<string, string>;
export declare function readPolicySources(
  locations: PolicySourceLocations,
): ContentSecurityPolicySources;
export declare function toNginxDirectives(headers: Record<string, string>): string;
```

Every hash is returned as a ready CSP source, quotes included: `'sha256-…'`. Run as a program, the
module takes `nginx` and the path of a built `index.html`, reads `VITE_API_BASE_URL` from the
environment, and prints the directives; anything else prints its usage and exits `1`.

## Configuration

| Variable / option                       | Default                                                            | Meaning                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` (build argument)    | `/v1`                                                              | Compiled into the bundle ([Configuration and environment](./configuration.md)); when it is an absolute URL, its origin joins `connect-src`. Compose passes the value from the shell or `.env`, falling back to `/v1` |
| `API_UPSTREAM` (runtime environment)    | `http://host.docker.internal:8000`                                 | Where nginx forwards `/v1/`: a scheme, host and port with no path, because a path would change how nginx rewrites the request. The host must resolve when the container starts                                       |
| `WEB_PORT` (compose only)               | `8080`                                                             | The host port the `web` service publishes                                                                                                                                                                            |
| `E2E_BASE_URL` (`playwright.config.ts`) | Unset                                                              | When set, the suite runs against that server and starts none of its own; when unset, it builds and previews on port 4173                                                                                             |
| `preview.headers` (`vite.config.ts`)    | Computed when `vite preview` starts                                | The same headers the container sends, from `dist/index.html` as it is at that moment                                                                                                                                 |
| Base images (`Dockerfile`)              | `node:24-bookworm-slim`, `nginxinc/nginx-unprivileged:1.31-alpine` | The build toolchain and the server, nginx's mainline line; Dependabot proposes their updates weekly                                                                                                                  |

`docker compose` reads the project's `.env` for `${…}` substitution, so a `VITE_API_BASE_URL` set
there for development also reaches the image.

## Usage & extension

### Run the whole stack locally

Start [backend-boilerplate](https://github.com/khusenov/backend-boilerplate) with its own
`docker compose up --wait`, which publishes the API on port 8000, then start this one:

```sh
docker compose up --build --wait
```

Open <http://localhost:8080/sign-in>. Every `/v1` request goes through nginx to
`host.docker.internal:8000`, so the browser sees one origin and the refresh cookie behaves exactly
as it does behind the dev proxy. Create the first account as the root README's
[Getting started](../../README.md#getting-started) shows. If port 8080 is taken, publish another:
`WEB_PORT=8081 docker compose up --build --wait`.

### Point the container at a real API

Set `API_UPSTREAM` to the API's internal origin — `http://api:8000` for a service called `api` on
the same Docker network, or an internal load balancer's origin:

```sh
docker run --publish 8080:8080 --env API_UPSTREAM=http://api.internal.example.com:8000 frontend-boilerplate
```

The API sees nginx as its client, so configure it to trust the proxy's forwarded headers;
backend-boilerplate calls that setting `TRUST_PROXY`. Without it, every visitor shares one
rate-limit bucket.

### Put TLS in front

Terminate TLS in a load balancer or ingress in front of the container and let it set
`X-Forwarded-Proto`, which nginx forwards unchanged. Send `Strict-Transport-Security` from that
terminator, not from this image, and serve the API behind the same terminator so the backend's
`Secure` refresh cookie is sent.

### Allow another source

A new third-party origin — an analytics script, an image CDN, a font host — is a change to one
list. Add it to the matching directive in `createContentSecurityPolicy`, for example
`['img-src', ["'self'", 'data:', 'https://images.example.com']]`, then run `npm run test:e2e`: the
`policyViolations` guard names any directive that still blocks something. Rebuild the image to ship
the change.

### Admit a library that injects styles

When a dependency starts injecting a `<style>` element or an inline script at runtime, every
end-to-end scenario fails with a message such as
`style-src-elem blocked inline: [data-sonner-toaster][dir=ltr],html[dir=lt`. Either load the
library's CSS through Vite instead, where `'self'` already covers it, or hash the injected text the
way `hashSonnerStylesheets` does, from the library's own module rather than a copy, so an upgrade
cannot leave the hash behind.

### Serve the build without this image

Any server works if it keeps the four rules above: fall back to `index.html` for paths that are not
files, cache `/assets/` immutably, revalidate the document, and send the security headers. For
nginx, `node scripts/security-headers.ts nginx dist/index.html` prints the header block to include;
for anything else, `createSecurityHeaders` returns them as a plain object. Keep `/v1` on the app's
origin or site, for the reasons [Session management](./session-management.md) gives.

## Design decisions & trade-offs

- **Hashes, never `'unsafe-inline'`.** A policy exists to stop injected script, and
  `'unsafe-inline'` in `script-src` would admit exactly that. The theme script has to be inline — an
  external script costs a round trip before the first paint, which is the flash it exists to prevent
  — so its hash is the only way to keep both. Styles get the same treatment rather than the common
  `style-src 'unsafe-inline'` shortcut, because injected CSS can still exfiltrate data through
  attribute selectors.
- **Derived from the build, not written down.** Both inline resources change: the theme script with
  `index.html`, the toast stylesheet with every sonner release. A hash typed into a config file
  would go stale on the next edit and fail silently in production. Computing it from
  `dist/index.html` and from sonner's own module keeps it exact, and parsing sonner's
  `__insertCSS("…")` call fails the build loudly when the library changes how it injects, instead of
  shipping a policy that blocks it.
- **The empty stylesheet is allowed on purpose.** sonner appends its `<style>` element to `<head>`
  before it fills it, and the browser checks the element at both moments. Without the SHA-256 of the
  empty string, every page load reports a violation for the empty element even though the filled
  stylesheet then passes on its own hash. An empty style applies nothing, so allowing it costs no
  protection.
- **`'report-sample'` is on.** It changes no decision the browser makes; it makes the browser
  include the first 40 characters of a blocked inline resource in the violation, which is what
  turns a guard failure into a message that says what was blocked.
- **One module, two servers.** The container and `vite preview` read the same functions, so the
  preview the end-to-end suite drives sends the production policy. A violation is functionally
  silent — a blocked theme script or toast stylesheet leaves every assertion about text and roles
  green — so the guard runs in every scenario rather than in one dedicated spec: sonner injects its
  CSS on every page load, and any regression surfaces wherever it happens.
- **Unprivileged nginx on Alpine.** The image runs as uid 101, listens on 8080 — a port that needs
  no privilege — and ships the environment-variable template step already, so the repository adds no
  entrypoint script. It tracks nginx's mainline line — an odd minor such as 1.31, the line the
  official image's `latest` tag follows — so fixes reach the image first, and whichever newer line
  Dependabot proposes next, mainline or stable, can be taken without an ignore rule. Caddy or a Node server would have served the files just as well, but nginx's
  `try_files` and header semantics are the ones most platforms document, and the official
  unprivileged variant is maintained by the nginx team.
- **The upstream is resolved once, at start-up.** A literal `proxy_pass` host is resolved when nginx
  starts, through the system resolver, which also reads the `/etc/hosts` entry `--add-host` writes;
  a misconfigured `API_UPSTREAM` therefore fails the container immediately and visibly. The cost is
  that an upstream whose address changes needs a container restart. A `resolver` directive would
  re-resolve at request time, but it cannot read `/etc/hosts`, which would break
  `host.docker.internal` on Linux.
- **The document revalidates, the assets never do.** `no-cache` lets a browser keep `index.html` but
  ask with its ETag every time, so a deploy is picked up on the next load; hashed assets never
  change under their name, so a year and `immutable` spare every revisit their requests. A missing
  asset answers `404` rather than `index.html`: a tab still running the previous build then fails
  its chunk request cleanly, and the router's `lazyRouteComponent` reloads the page once
  ([Routing](./routing.md)), where an HTML body served as JavaScript would fail with a MIME-type
  error instead.
- **No `Strict-Transport-Security`, no `upgrade-insecure-requests`, no
  `Cross-Origin-Embedder-Policy`.** The first two belong to whatever terminates TLS, and would be
  wrong on the plain-HTTP localhost this image serves; the third would block every cross-origin
  image or script a deployment later adds, unless each opts in with CORP.
- **The API base URL is a build argument.** Vite compiles `VITE_API_BASE_URL` into the bundle, so it
  cannot be a runtime variable without a runtime configuration file the app does not have. The
  default same-origin build is still portable: it calls `/v1` on whatever origin serves it, and only
  `API_UPSTREAM`, a runtime variable, differs between environments.
- **The image is built and tested, not published.** A registry, a tagging scheme, a signing policy
  and the architectures to build for are each project's own decisions; CI proves the image works on
  every pull request and leaves publishing to the project that adopts it.
- **The build stage installs without scripts.** `npm ci --ignore-scripts` skips lefthook's
  `postinstall`, which would install git hooks into a throwaway layer; no dependency the build needs
  has an install script ([Quality gates](./quality-gates.md)).

## Testing

| What                                                                       | Where                          | What it proves                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The violation guard                                                        | `e2e/fixtures/harness.ts`      | Every one of the ten scenarios fails if its page raises a `securitypolicyviolation`; with the theme or sonner hash removed, all of them report the blocked directive                                                                                   |
| `serves every document with the production security headers`               | `e2e/security-headers.spec.ts` | A deep link answers with `script-src` and `style-src` carrying hashes, `frame-ancestors 'none'`, `object-src 'none'`, `nosniff`, the referrer policy and `DENY`                                                                                        |
| `runs the pre-paint theme script under the policy before any bundle loads` | `e2e/security-headers.spec.ts` | With every `/assets/*.js` request aborted and `app.theme` stored as `dark`, `<html>` still gets the `dark` class and `color-scheme` — only the inline script could have set them                                                                       |
| The `Container image` job                                                  | `.github/workflows/ci.yml`     | The image builds; it reports healthy; a deep link returns the app with the policy and `no-cache`; an entry chunk is cached immutably; a missing asset is a `404`; `/v1` is proxied (a `502` with nothing listening); the whole suite passes against it |

```sh
npm run test:e2e
npx playwright test e2e/security-headers.spec.ts
docker compose up --build --wait
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
docker compose down
```

The first command runs the suite against `vite preview`, which sends the same policy; the last
three repeat it against the container, as CI's `Container image` job does.

## Known limitations

- **The policy knows sonner by name.** `hashSonnerStylesheets` parses one library's build output.
  Another library that injects styles or scripts needs the same treatment, and only the end-to-end
  guard reports the need.
- **The image is built for one API topology.** An absolute `VITE_API_BASE_URL` is compiled in, so
  each API origin needs its own image; only the default same-origin build is portable.
- **`vite preview` reads the hashes once.** It computes its headers when it starts, so a rebuild
  while it runs serves the new `index.html` under the old script hash until the preview restarts.
- **The health check ignores the API.** `/healthz` proves nginx is serving; it says nothing about
  `API_UPSTREAM`, which the app reports on its own screens.
- **One architecture per build.** CI builds for the runner's `linux/amd64`, and a local build
  targets the machine it runs on; a multi-architecture image needs `platforms` on the build step.
- **nginx defaults elsewhere.** Request bodies are capped at nginx's default 1 MB, logs use its
  default text format on standard output and error, and nothing rate-limits requests before they
  reach the API.
- **The guard sees the document only.** `policyViolations` listens on the page's `document`; a
  violation inside a worker would go unreported, and the app starts none today.
