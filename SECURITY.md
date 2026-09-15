# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report privately through GitHub: go to the **Security** tab → **Report a vulnerability**. That opens
a private advisory visible only to you and the maintainers.

Include the affected file or route, what an attacker can achieve, and the steps to reproduce it.
You can expect an initial response within seven days.

## Scope

This is a project template. It is intended to be forked and deployed by others, so a weak default,
a missing guard, or a documentation example that is insecure if copied verbatim all count as valid
findings.

Particularly in scope:

- Token handling and the sign-in and refresh flow (`src/entities/session/**`,
  `src/features/sign-in/**`, `src/shared/api/**`)
- Cross-site scripting — API data, a translation, or the URL reaching the page as markup or script
- Open redirects — navigation to a destination taken from the URL or from an API response
- Client-side path traversal — a route parameter reaching an API request path unencoded
- Tokens, credentials, or personal data reaching browser storage, a URL, the console, or the error
  reporter (`src/shared/observability/**`)
- Vulnerable dependencies that ship in the production bundle

Out of scope:

- The backend API itself. Report those through the
  [backend-boilerplate security policy](https://github.com/khusenov/backend-boilerplate/blob/main/SECURITY.md).
- The fixed tokens and records in `e2e/fixtures/**`. They are stubs the end-to-end suite serves in
  place of an API, never real credentials.
- Reaching an `_authenticated` route by tampering with the client. The route guard only decides
  what to render; the API decides what a caller may read or change.
- Findings that require an attacker to already run script in the page or control the browser.
- Vulnerabilities in dependencies that are already covered by an open Dependabot pull request.

## How the session is handled

The access token lives only in memory, in the session store
(`src/entities/session/model/session-store.ts`), and is never written to `localStorage`,
`sessionStorage`, or a cookie. The authenticated HTTP client attaches it as an
`Authorization: Bearer` header (`src/shared/api/attach-bearer-token.ts`). The refresh token is the
backend's HTTP-only cookie, which this app never reads; only the unauthenticated client, which calls
`/auth/login` and `/auth/refresh`, opts into cross-origin cookies.

A reload therefore starts without an access token and recovers one with a refresh. Until the
session ends, a `401` renews the token and replays the request once. Refreshes are single-flight
within a tab and serialized across tabs with the Web Locks API where available, because the backend
rotates the refresh cookie on every use and revokes the session if a used one comes back. A `401`
from `/auth/refresh` ends the session, and leaving an authenticated session clears the TanStack
Query cache.

## For anyone deploying this template

Holding the token in memory keeps it from outliving the tab, but it cannot stop script running in
the page from using the session. Before deploying:

- Send a strict `Content-Security-Policy` header — neither `index.html` nor the build sets one
- Keep secrets out of `VITE_*` variables — Vite inlines them into the bundle every visitor downloads
- Serve the app over HTTPS from the same site as the API instead of relaxing the backend's
  `SameSite=Strict` refresh cookie
- Scrub what a real reporter sends before it replaces the console one in
  `src/app/entrypoint/app-error-reporter.ts`: an `HttpError` keeps the response body as `payload`,
  and its Axios `cause` redacts the `Authorization` header only when serialized as JSON
