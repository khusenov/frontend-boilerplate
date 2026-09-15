# Contributing

Thanks for taking the time to contribute.

## Getting set up

See [Getting started](./README.md#getting-started) in the README. The step people miss is
`npx playwright install chromium` — npm installs Playwright but not the browser it drives, so
`npm run test:e2e` fails on a fresh clone until you run it. Use the Node version in `.nvmrc` —
`.npmrc` sets `engine-strict=true`, so an older one fails `npm install`.

## Before you open a pull request

```bash
npm run audit
npm run test:e2e
```

`npm run audit` runs lockfile verification, formatting, lint, the accessibility lint, typecheck, the
Feature-Sliced Design rules, the production build, and unit tests with coverage — exactly what
CI's `Quality gates` job runs. The end-to-end suite is too slow for the pre-push hook, so it stays
outside `audit` and CI runs it as a separate job.

It checks formatting rather than rewriting it, so it fails on drift the way CI does. The pre-commit
hook is what formats your staged files; the pre-push hook runs `npm run audit`.

If `npm run test:e2e` will not start, something holds port 4173 — usually a leftover
`npm run preview`. The suite serves its own build and never reuses a running server.

## What the build enforces

Five gates fail the build, and none of them are negotiable in review.
[Quality gates](./docs/features/quality-gates.md) covers each, with the hooks and CI that run them.

- **Architecture.** `npm run arch` runs steiger's Feature-Sliced Design rules: a module imports only
  from layers below it, through a public `index.ts`. ESLint's `no-restricted-imports` adds the
  fences steiger cannot express: vendor libraries are reached only through the `shared` segment
  that wraps them (`axios` through `shared/api`, i18next through `shared/i18n`), and route state
  stays in `app/routes`.
- **Coverage.** Every source file is held at 90% lines, branches, functions and statements — per
  file, not on average — and `npm run verify:coverage-scope` fails if one escaped measurement.
- **Types.** `tsc -b` under a strict configuration, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Route paths and translation keys are typed too.
- **Accessibility.** `npm run lint:a11y` runs oxlint's `jsx-a11y` rules over `src`, after a drift
  check that `.oxlintrc.json` still enables every one of them at `error`.
- **Format and lint.** Prettier, and ESLint with `--max-warnings 0` — a warning fails the build.
  Import order is enforced by `import-x/order` and fixed by `npm run lint:fix`.

## Conventions

Each links to the document that holds the full rules.

- **Boundaries.** Name every file in kebab-case and co-locate tests as `*.test.ts(x)`. Layers,
  public APIs, import fences and import order are in
  [architecture boundaries](./docs/features/architecture-boundaries.md).
- **API data.** It never leaves `entities/*/api` untranslated: each response is validated against
  its DTO schema and mapped to a frontend-owned model there, and the slice's public API exports the
  model, never the DTO. See [user profile](./docs/features/user-profile.md).
- **Copy.** Every user-visible string goes through i18n (`t()` or `<Trans>` from `@/shared/i18n`),
  with each new key in every locale under `src/shared/i18n/locales/*`. See
  [internationalization](./docs/features/internationalization.md).
- **Tests.** Query by role and accessible name, not test ids, and make new UI work with the keyboard
  alone. End-to-end specs run against the production build and never import `src/`. See
  [unit testing](./docs/features/unit-testing.md) and
  [end-to-end testing](./docs/features/e2e-testing.md).
- **Comments.** Next to none — names and types carry the meaning. A comment is for what a reader
  would otherwise get wrong: a non-obvious invariant, a workaround, a link to an issue.

## Adding a feature

A capability usually spans several layers, and the user profile is the reference: `entities/user`
maps the API, `features/update-user-name` is the user action, `pages/user-profile` composes them,
and `src/app/routes/_authenticated/users.$userId.tsx` mounts the page. Copy that shape rather than
inventing a new one; [docs/features/user-profile.md](./docs/features/user-profile.md) documents it.

A route is private only under `_authenticated/`, and no gate notices one filed elsewhere. Commit the
regenerated `src/app/router/route-tree.gen.ts` with a new route: `npm run dev` or `npx vite build`
writes it; `npm run audit` cannot.

## Commits

The history uses [Conventional Commits](https://www.conventionalcommits.org/) without a scope: an
imperative, lowercase subject that names the slice or segment when the change lives in one.

```
feat: add the DTO to domain model contract in entities/user
refactor: name every file in kebab-case
ci: enforce every quality gate on commit, push, and pull request
```

Write the body to explain **why**: what was missing or broken and what it cost, then the change, its
trade-offs and anything load-bearing. Close with the evidence — audit and end-to-end results.
Rationale belongs in the commit message, not in code comments.

## Documentation

Feature documentation lives in `docs/features/` — one document per capability, not per `features`
slice — and is indexed by [docs/README.md](./docs/README.md). If you change behaviour a document
describes, update it in the same pull request and set its **Verified against** SHA to the commit you
checked it against (`git rev-parse --short HEAD`). If you change the imports between slices,
regenerate [docs/architecture-graph.md](./docs/architecture-graph.md) with `npm run arch:graph`
rather than editing it by hand.

## Reporting bugs and requesting features

Open an issue using one of the forms; questions go to
[Discussions](https://github.com/khusenov/frontend-boilerplate/discussions). For anything security
related, follow [SECURITY.md](./SECURITY.md) instead — do not open a public issue.
