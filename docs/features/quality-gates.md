# Quality gates

> **Status:** Complete · **Layers:** outside layers · **Verified against:** `6cf48b8`

## Purpose

This template's rules — Feature-Sliced Design boundaries, typed and accessible code, DTO mapping,
per-file test coverage — are only as real as the checks that enforce them, and a check a developer
has to remember to run protects nothing. This feature chains every check into one command,
`npm run audit`, and runs it automatically: a lefthook git hook runs it before every push, and the
GitHub Actions workflow runs it on every push and pull request to `main`, beside the end-to-end
suite. Around it sit the guards that keep the toolchain itself trustworthy: a lockfile sync check,
an enforced Node version, a reviewed list of dependency install scripts, a weekly audit of
production dependencies, Dependabot updates grouped so that packages which must move together are
judged by CI in a single run, and a Conventional Commits check on every commit message and every
pull request title.

## How it works

Terms used throughout: a **gate** is a command that exits non-zero when the repository breaks a
rule; a **git hook** is a script git runs before an operation and that can abort it;
[lefthook](https://github.com/evilmartians/lefthook) installs the hooks and runs the **jobs**
declared in `lefthook.yml`; a **staged** file is one added to git's index for the next commit; a
CI **job** is one unit of `.github/workflows/ci.yml` that GitHub Actions runs on a fresh virtual
machine. Everything here lives outside the Feature-Sliced Design **layers** (`src/app` down to
`src/shared`; see [Architecture boundaries](./architecture-boundaries.md)) — in root configuration,
`scripts/` and `.github/` — and nothing in `src/` imports it: the gates inspect `src/` from outside.

The gates run at four points, each wider than the last:

| When                           | What runs                                                                                                                                                         | Scope                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `npm install` / `npm ci`       | The `engine-strict` Node check; lefthook installs its hooks                                                                                                       | The dependency tree       |
| `git commit`                   | `pre-commit`: Prettier, ESLint and oxlint, plus glob-gated drift and lockfile checks; `commit-msg`: commitlint                                                    | Staged files, the message |
| `git push`                     | `pre-push`: `npm run audit`                                                                                                                                       | The whole working tree    |
| Push or pull request to `main` | CI: `npm run audit`, `npm run test:e2e`, the production container, `npm run audit:deps`, and — for a pull request — its title; weekly, `npm run audit:deps` alone | A clean checkout          |

**Install.** `.npmrc` sets `engine-strict=true`, so `npm install` and `npm ci` stop with
`EBADENGINE` on a Node version that an `engines` field rejects, instead of printing a warning and
carrying on. It gates installs only: `npm run <script>` is not checked, so once `node_modules`
exists a Node downgrade runs `npm run dev`, `npm run build` and `npm run audit` unnoticed until the
next fresh install — or until CI, which always installs from scratch. lefthook's own `postinstall`
(`node_modules/lefthook/postinstall.js`) then runs `lefthook install -f`, which writes
`.git/hooks/pre-commit`, `.git/hooks/commit-msg` and `.git/hooks/pre-push`. It returns without
installing when `CI` is set (unless `LEFTHOOK` is set too), and it catches its own failure, so
installing the hooks can never fail an install. That `postinstall` runs because `package.json`'s
`allowScripts` approves it: npm 11.16 reads the field as advisory and prints every dependency whose
install script it does not cover, and its documentation announces that a later release will refuse
to run such scripts. The field approves `lefthook` and `unrs-resolver`, whose script checks the
native binding `eslint-plugin-import-x`'s resolver loads, and denies `msw`, whose script only copies
a browser worker this repository never configures, and `fsevents`, which ships its binary prebuilt.

**Commit.** The `pre-commit` hook hands over to lefthook, which first sets aside the unstaged part of
any partially staged file — so every job sees exactly the content being committed — and restores it
afterwards. It then runs five jobs, one after another in declared order. A job whose `glob` matches
no staged file is skipped; every other job runs even when an earlier one failed, and any failure
aborts the commit:

1. `format` — Prettier rewrites the staged files and lefthook re-stages them (`stage_fixed: true`).
2. `lint` — ESLint over the staged `*.{ts,tsx,js,mjs}` files; a warning fails it.
3. `a11y` — oxlint's accessibility rules over the staged files under `src/`.
4. `a11y-rules-drift` — when `.oxlintrc.json` or `scripts/a11y-rules.mjs` is staged, checks the
   rule list against oxlint's schema.
5. `lockfile` — when `package.json` or `package-lock.json` is staged, checks that the two agree.

**Commit message.** Once the message is written, the `commit-msg` hook runs
`commitlint --edit` against `commitlint.config.ts`: the rules of `@commitlint/config-conventional`
— a known type, a lower-case subject, a 100-character header, blank lines before the body and the
footer — plus `scope-empty`, because the history uses Conventional Commits without a scope. A
subject such as `feat(user): Add a thing` is rejected twice, for its scope and for its capital.

**Push.** The `pre-push` hook runs `npm run audit`: ten gates chained with `&&`, so the first
failure stops the run and aborts the push.

| #   | Script                  | Runs                                                                | Fails when                                                              | Scope                                                          |
| --- | ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `verify:lock`           | `npm ci --dry-run --ignore-scripts`                                 | `package-lock.json` no longer matches `package.json`                    | The lockfile                                                   |
| 2   | `format:check`          | `prettier --check .`                                                | A file differs from Prettier's output                                   | Every file Prettier does not ignore                            |
| 3   | `lint`                  | `eslint . --max-warnings 0`                                         | Any ESLint error or warning                                             | `**/*.{js,mjs,ts,tsx}` minus ESLint's `ignores`                |
| 4   | `lint:a11y`             | `node scripts/a11y-rules.mjs --check && oxlint --deny-warnings src` | `.oxlintrc.json` has drifted from oxlint's schema, or any a11y finding  | `src`                                                          |
| 5   | `typecheck`             | `tsc -b --pretty`                                                   | A type error in any of the three TypeScript projects                    | `src`, root configs, `scripts`, `e2e`                          |
| 6   | `arch`                  | `steiger ./src`                                                     | A Feature-Sliced Design rule is broken                                  | `src`                                                          |
| 7   | `build`                 | `tsc -b && vite build`                                              | The production bundle does not build                                    | The app                                                        |
| 8   | `test:coverage`         | `vitest run --coverage`                                             | A test fails, or a file drops below 90% on any coverage metric          | `src/**/*.{test,spec}.{ts,tsx}`                                |
| 9   | `verify:coverage-scope` | `node scripts/verify-coverage-scope.mjs`                            | A source file is missing from the coverage report                       | `src/**/*.{ts,tsx}` minus tests, `.d.ts` and the route tree    |
| 10  | `verify:import-fence`   | `node scripts/verify-import-fence.mjs`                              | The `@/shared/testing` fence stopped firing, or started firing in tests | Two probe files written into `src/shared/config`, then deleted |

The static checks come first and the build and tests last. `build` is the only gate that runs the
Vite plugins: `vite.config.ts` drops `@tanstack/router-plugin` in test mode, so route-tree
generation and `autoCodeSplitting` are exercised under `audit` only here. `verify:coverage-scope`
has to follow `test:coverage`, because it reads the `coverage/lcov.info` that run writes.
`verify:import-fence` is appended rather than inserted, so every earlier gate keeps its number.

**Push or pull request to `main`.** `.github/workflows/ci.yml` starts four jobs on
`ubuntu-latest`, each from a fresh checkout with the Node version read from `.nvmrc`:

- `Quality gates` runs `npm ci`, then `npm run audit` — the command the hook ran — and uploads
  `coverage/` as the `coverage` artifact.
- `End-to-end tests` runs `npm ci`, installs Chromium with
  `npx playwright install --with-deps chromium`, runs `npm run test:e2e` against the production
  build, and uploads `playwright-report/` (see [End-to-end testing](./e2e-testing.md)).
- `Container image` builds the production image with `docker/build-push-action` and a GitHub
  Actions layer cache, starts it, waits for its health check, asserts with `curl` that a deep link
  returns the app with the security headers, that a hashed asset is cached immutably, that a missing
  asset is a `404` and that `/v1` is proxied, then runs `npm run test:e2e` against the container
  with `E2E_BASE_URL` set (see [Production container](./deployment.md)).
- `Dependency audit` runs `npm run audit:deps` — `npm audit --omit=dev --audit-level=high` —
  without installing anything.

A second workflow, `.github/workflows/pull-request-title.yml`, runs on every pull request to `main`
that is opened, edited, reopened or pushed to. Its `Conventional title` job installs with
`npm ci --ignore-scripts` and pipes the title through `commitlint`: pull requests are squash-merged,
so the title becomes the commit subject on `main`, and this is the only check that sees it. The
title reaches the shell through an environment variable, never through an expression interpolated
into the script, so a crafted title cannot inject a command.

Every Monday at 06:00 UTC (`cron: '0 6 * * 1'`) the workflow runs again on `main` with only
`Dependency audit`: the other three jobs carry `if: github.event_name != 'schedule'`.

**Dependency updates.** Dependabot (`.github/dependabot.yml`) opens npm update pull requests every
Monday, grouped by package family, Docker base-image update pull requests every Monday, and GitHub
Actions update pull requests monthly, every one titled `chore: bump …` so that its title passes the
same commit rules. They reach CI like any other pull request — and only CI, because Dependabot's
commits never pass through a local hook.

**When a gate fails.** A hook prints the failing job or step; rerun the same npm script to
reproduce it, fix the cause, and commit or push again. CI fails exactly where the `pre-push` hook
would, because it runs the same script, so `npm run audit` on a clean tree reproduces a
`Quality gates` failure. The hooks can be bypassed (`--no-verify`, `LEFTHOOK=0`), which is why CI
runs everything again — and CI blocks a merge only once the repository requires its checks; see
[Make CI block merges](#make-ci-block-merges).

## Architecture

The feature has no runtime seam — no type that consumers program against while its concrete
implementation is constructed elsewhere and bound to it at the composition root,
`src/app/entrypoint` (see [Composition root](./composition-root.md)) — because nothing in `src/`
imports it and it imports nothing from `src/`. Its one contract is the `audit` script in
`package.json`, the only place the gate list is written down; commit-message rules live apart from
it, in `commitlint.config.ts`, which the `commit-msg` hook and the title workflow both read. The two
automated callers — lefthook's `pre-push` job and CI's `Quality gates` job — run it by name and
never re-list its steps, so adding, removing or reordering a gate is a one-line edit that every
enforcement point picks up. Each gate is a standalone tool with its own root configuration, and
together they enforce the architecture rules on `src` from outside it: steiger and ESLint's
`no-restricted-imports` fences hold the layer and public-API rules (see
[Architecture boundaries](./architecture-boundaries.md)), `tsc` the types, Vitest the per-file
coverage (see [Unit and component testing](./unit-testing.md)) and Playwright the built bundle (see
[End-to-end testing](./e2e-testing.md)). Every file below lives outside the layers.

| Component                                | Layer                        | Responsibility                                                                                                       | File                                                               |
| ---------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `audit`                                  | outside layers · root config | The ordered gate list, and the only one; `pre-push` and `Quality gates` run it by name                               | `package.json`                                                     |
| `engines`, `packageManager`              | outside layers · root config | Declare Node `^24.15.0                                                                                               |                                                                    | >=26.0.0`and npm`11.16.0` | `package.json` |
| `engine-strict`                          | outside layers · root config | Turns an `engines` mismatch into an install failure                                                                  | `.npmrc`                                                           |
| `.nvmrc`                                 | outside layers · root config | Node major `24`, read by `nvm` and by `actions/setup-node`                                                           | `.nvmrc`                                                           |
| `pre-commit`                             | outside layers · root config | The five staged-file jobs: `format`, `lint`, `a11y`, `a11y-rules-drift`, `lockfile`                                  | `lefthook.yml`                                                     |
| `commit-msg`                             | outside layers · root config | The `commitlint` job: `commitlint --edit` on the message being committed                                             | `lefthook.yml`                                                     |
| `config`                                 | outside layers · root config | Conventional Commits rules: `@commitlint/config-conventional` plus `scope-empty`                                     | `commitlint.config.ts`                                             |
| `pre-push`                               | outside layers · root config | The `audit` job: `npm run audit`                                                                                     | `lefthook.yml`                                                     |
| `install`                                | outside layers · vendor      | lefthook's `postinstall`: runs `lefthook install -f`, skipped under `CI`                                             | `node_modules/lefthook/postinstall.js`                             |
| `allowScripts`                           | outside layers · root config | The reviewed install scripts: `lefthook` and `unrs-resolver` allowed, `msw` and `fsevents` denied                    | `package.json`                                                     |
| `quality-gates`                          | outside layers · CI          | `Quality gates`: `npm ci`, `npm run audit`, the `coverage` artifact                                                  | `.github/workflows/ci.yml`                                         |
| `e2e`                                    | outside layers · CI          | `End-to-end tests`: Chromium, `npm run test:e2e`, the `playwright-report` artifact                                   | `.github/workflows/ci.yml`                                         |
| `container`                              | outside layers · CI          | `Container image`: builds and starts the production image, checks it with `curl`, runs `npm run test:e2e` against it | `.github/workflows/ci.yml`                                         |
| `dependency-audit`                       | outside layers · CI          | `Dependency audit`: `npm run audit:deps` on pushes, pull requests and the weekly schedule                            | `.github/workflows/ci.yml`                                         |
| `conventional-title`                     | outside layers · CI          | `Conventional title`: `commitlint` over the pull request title the squash merge will commit                          | `.github/workflows/pull-request-title.yml`                         |
| `updates`                                | outside layers · CI          | Grouped npm (weekly), Docker base-image (weekly) and GitHub Actions (monthly) update pull requests                   | `.github/dependabot.yml`                                           |
| `rulesets`                               | outside layers · CI          | The `main` and `version tags` rulesets as JSON, for `gh api` to apply                                                | `.github/rulesets/main.json`, `.github/rulesets/version-tags.json` |
| `tseslint.config`                        | outside layers · root config | The ESLint flat config: type-aware rules, React, TanStack, Vitest, import order, import fences                       | `eslint.config.js`                                                 |
| `rules`                                  | outside layers · root config | The 36 `jsx-a11y` rules at `error`, with oxlint's `correctness` category off                                         | `.oxlintrc.json`                                                   |
| `schemaRuleNames`, `generate`, `check`   | outside layers · scripts     | Derives `.oxlintrc.json` from oxlint's JSON schema; `--check` fails on drift                                         | `scripts/a11y-rules.mjs`                                           |
| `measurableSourceFiles`, `measuredFiles` | outside layers · scripts     | Diffs the source tree against `coverage/lcov.info`                                                                   | `scripts/verify-coverage-scope.mjs`                                |
| `defineConfig`                           | outside layers · root config | steiger with `fsd.configs.recommended` and one `fsd/insignificant-slice` override                                    | `steiger.config.ts`                                                |
| `.prettierrc.json`                       | outside layers · root config | Formatting options and the Tailwind class-sorting plugin                                                             | `.prettierrc.json`                                                 |
| `.prettierignore`                        | outside layers · root config | Keeps tool-owned files out of Prettier; the `docs/*` allow-list re-admits the published docs                         | `.prettierignore`                                                  |
| `references`                             | outside layers · root config | Solution file that ties the three TypeScript projects together for `tsc -b`                                          | `tsconfig.json`                                                    |
| `include`                                | outside layers · root config | One TypeScript project each: the app, the Node-side config and scripts, the end-to-end suite                         | `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.e2e.json`     |
| `test.coverage`                          | outside layers · root config | v8 coverage, the `lcov` reporter and the 90% per-file thresholds `test:coverage` enforces                            | `vite.config.ts`                                                   |
| `arch:graph`                             | outside layers · root config | Regenerates `docs/architecture-graph.md` with dependency-cruiser; not a gate                                         | `package.json`                                                     |

## Public surface

This feature serves no route. Its contract is the npm scripts a developer runs, the hooks and CI
jobs that run them, and the configuration files a developer extends.

### npm scripts

Every script in `package.json`:

| Script                  | Runs                                                                | Role                                                                                                         |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `verify:lock`           | `npm ci --dry-run --ignore-scripts`                                 | Gate 1 of `audit`, and the `lockfile` pre-commit job: validates the lockfile without touching `node_modules` |
| `verify:coverage-scope` | `node scripts/verify-coverage-scope.mjs`                            | Gate 9                                                                                                       |
| `verify:import-fence`   | `node scripts/verify-import-fence.mjs`                              | Gate 10, the last of `audit`: proves the `@/shared/testing` import fence is live                             |
| `audit:deps`            | `npm audit --omit=dev --audit-level=high`                           | CI's `Dependency audit`; it needs the network, so it is not part of `audit`                                  |
| `dev`                   | `vite`                                                              | Dev server with HMR; also regenerates the route tree                                                         |
| `build`                 | `tsc -b && vite build`                                              | Gate 7: type-checks, then bundles into `dist/`                                                               |
| `preview`               | `vite preview`                                                      | Serves `dist/`; Playwright's web server runs it                                                              |
| `typecheck`             | `tsc -b --pretty`                                                   | Gate 5: types only — every project sets `noEmit`                                                             |
| `lint`                  | `eslint . --max-warnings 0`                                         | Gate 3                                                                                                       |
| `lint:fix`              | `eslint . --fix`                                                    | Applies ESLint's auto-fixes, import order included                                                           |
| `lint:a11y`             | `node scripts/a11y-rules.mjs --check && oxlint --deny-warnings src` | Gate 4: the rule-list drift check, then the accessibility rules                                              |
| `lint:a11y:fix`         | `node scripts/a11y-rules.mjs && prettier --write .oxlintrc.json`    | Regenerates `.oxlintrc.json` from oxlint's schema, then formats it                                           |
| `format`                | `prettier --write .`                                                | Rewrites formatting across the repository                                                                    |
| `format:check`          | `prettier --check .`                                                | Gate 2                                                                                                       |
| `test`                  | `vitest run`                                                        | The unit and component suite, once                                                                           |
| `test:watch`            | `vitest`                                                            | The same suite in watch mode                                                                                 |
| `test:coverage`         | `vitest run --coverage`                                             | Gate 8: the suite with v8 coverage and the per-file thresholds                                               |
| `test:e2e`              | `playwright test`                                                   | Playwright over the production build; CI's `End-to-end tests`, not part of `audit`                           |
| `test:e2e:ui`           | `playwright test --ui`                                              | Playwright's interactive runner                                                                              |
| `test:e2e:report`       | `playwright show-report`                                            | Opens the HTML report of the last `test:e2e` run                                                             |
| `arch`                  | `steiger ./src`                                                     | Gate 6                                                                                                       |
| `arch:graph`            | Below                                                               | Regenerates `docs/architecture-graph.md`; not a gate                                                         |
| `audit`                 | Below                                                               | Runs gates 1 to 10 in order                                                                                  |

`audit`:

```sh
npm run verify:lock && npm run format:check && npm run lint && npm run lint:a11y && npm run typecheck && npm run arch && npm run build && npm run test:coverage && npm run verify:coverage-scope && npm run verify:import-fence
```

`arch:graph`, as the shell receives it (`package.json` stores the backslashes JSON-escaped):

````sh
{ echo '```mermaid'; depcruise src --no-config --ts-config tsconfig.app.json --include-only '^src' --exclude '\.test\.tsx?$' --output-type mermaid --collapse '^src/[^/]+/[^/]+'; echo '```'; } > docs/architecture-graph.md
````

It runs dependency-cruiser without a rule file (`--no-config`) — the graph is a picture, not a gate
— resolves the `@/*` alias through `tsconfig.app.json`, keeps only modules under `src`, drops test
files, and collapses every module into its `src/<layer>/<slice-or-segment>` folder, so the graph
shows edges between slices and segments; files directly under a layer or `src/` (`src/main.tsx`,
`src/app/index.ts`) stay as their own nodes. The Mermaid fence makes GitHub render the result.

### Git hooks

`lefthook.yml` declares `min_version: 2.1.0` and `assert_lefthook_installed: true`, and sets none of
`parallel`, `piped` or `glob_matcher`: jobs run sequentially, a failure does not stop the jobs after
it, and every `glob` uses lefthook's default `gobwas` matcher, in which `*` also matches `/`.

| Hook         | Job                | `glob`                                      | `run`                                                                                         |
| ------------ | ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pre-commit` | `format`           | None — every staged file                    | `npx --no-install prettier --write --ignore-unknown {staged_files}`, with `stage_fixed: true` |
| `pre-commit` | `lint`             | `'*.{ts,tsx,js,mjs}'`                       | `npx --no-install eslint --max-warnings 0 --no-warn-ignored {staged_files}`                   |
| `pre-commit` | `a11y`             | `'src/*.{ts,tsx}'`                          | `npx --no-install oxlint --deny-warnings {staged_files}`                                      |
| `pre-commit` | `a11y-rules-drift` | `'{.oxlintrc.json,scripts/a11y-rules.mjs}'` | `node scripts/a11y-rules.mjs --check`                                                         |
| `pre-commit` | `lockfile`         | `'{package.json,package-lock.json}'`        | `npm run verify:lock`                                                                         |
| `commit-msg` | `commitlint`       | None                                        | `npx --no-install commitlint --edit {1}`, where `{1}` is the file git wrote the message to    |
| `pre-push`   | `audit`            | None                                        | `npm run audit`                                                                               |

`npx --no-install` never downloads a missing tool; the job fails instead. `{staged_files}` expands to
the staged paths the job's `glob` admits.

### CI workflow

`.github/workflows/ci.yml` (workflow `CI`) triggers on `push` to `main`, `pull_request` to `main`,
and `schedule` with `cron: '0 6 * * 1'`. It sets `permissions: contents: read` for every job, and
`concurrency` with `group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}` and
`cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Every job runs on `ubuntu-latest`,
checks out with `actions/checkout@v7` and `persist-credentials: false`, and sets up Node with
`actions/setup-node@v7`, `node-version-file: .nvmrc` and `cache: npm` — the `container` job only
after it has built and checked the image. No step reads a secret.

| Job                | Name               | Events                       | Steps after checkout and Node setup                                                                                                                                                                                                                               | Timeout | Artifact                                                             |
| ------------------ | ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `quality-gates`    | `Quality gates`    | Push, pull request           | `npm ci`, `npm run audit`, upload                                                                                                                                                                                                                                 | 15 min  | `coverage` from `coverage/`, kept 7 days                             |
| `e2e`              | `End-to-end tests` | Push, pull request           | `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, upload                                                                                                                                                                               | 20 min  | `playwright-report` from `playwright-report/`, kept 7 days           |
| `container`        | `Container image`  | Push, pull request           | `docker/setup-buildx-action@v4`, `docker/build-push-action@v7` with a GitHub Actions cache, `docker run`, a health wait, four `curl` assertions, then Node setup, `npm ci`, Chromium and `npm run test:e2e` with `E2E_BASE_URL`, upload; `docker logs` on failure | 20 min  | `playwright-report-container` from `playwright-report/`, kept 7 days |
| `dependency-audit` | `Dependency audit` | Push, pull request, schedule | `npm run audit:deps`                                                                                                                                                                                                                                              | 10 min  | None                                                                 |

All three uploads use `actions/upload-artifact@v7` with `if: ${{ !cancelled() }}` and
`if-no-files-found: ignore`.

### Helper scripts

`scripts/a11y-rules.mjs` reads the rule names under `definitions.DummyRuleMap.properties` in
`node_modules/oxlint/configuration_schema.json` and keeps those prefixed `jsx-a11y/`:

| Invocation                                                          | Effect                                                                                                                                                | Output                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/a11y-rules.mjs` (run through `npm run lint:a11y:fix`) | Rewrites `.oxlintrc.json`: `$schema`, `plugins: ['jsx-a11y']`, `categories: { correctness: 'off' }`, and every `jsx-a11y/` rule, sorted, at `'error'` | `36 jsx-a11y rules written to .oxlintrc.json`                                                                                                                                                                                                                                |
| `node scripts/a11y-rules.mjs --check`                               | Compares the `jsx-a11y/` entries of `.oxlintrc.json` with the schema                                                                                  | In sync, exit 0: `.oxlintrc.json is in sync: 36 jsx-a11y rules.` Otherwise exit 1, one line per rule — `missing from .oxlintrc.json:`, `not set to "error":` or `no longer in the oxlint schema:` — then ``Run `node scripts/a11y-rules.mjs` to regenerate .oxlintrc.json.`` |

`scripts/verify-coverage-scope.mjs` (run as `npm run verify:coverage-scope`) cross-checks
`coverage/lcov.info` against the source tree so a `coverage.exclude` pattern that swallows a
file cannot hide it from the 90% threshold; a clean run of today's tree prints
`Coverage scope verified: 158 source files measured.`
[Unit and component testing](./unit-testing.md) owns the gate's full contract, including its
failure output.

### Lint rule sources

Where each ESLint rule set in `eslint.config.js` applies. The `no-restricted-imports` fences and the
barrel rule are explained in [Architecture boundaries](./architecture-boundaries.md).

| Files                                                                                            | Rule sets                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**/*.{js,mjs,ts,tsx}`                                                                           | `js.configs.recommended`; typescript-eslint `recommendedTypeChecked` and `stylisticTypeChecked`, typed through `projectService: true`; `consistent-type-imports` (`prefer: 'type-imports'`, `fixStyle: 'separate-type-imports'`), `no-import-type-side-effects`, `no-floating-promises`, `no-misused-promises`; `import-x/order` (builtin, external, internal `^@/`, parent, sibling, index; blank line between groups; alphabetized) |
| `src/**/*.{ts,tsx}`, `vitest.setup.ts`                                                           | `@eslint-react/eslint-plugin` `recommended-typescript`, `eslint-plugin-react-hooks` `recommended`, `eslint-plugin-react-refresh` `vite`; browser globals; `import-x/resolver-next`, the TypeScript-aware resolver — without it every path-based `import-x` rule silently skips `src/`                                                                                                                                                 |
| `src/**/*.{ts,tsx}`                                                                              | TanStack Query and TanStack Router `flat/recommended`; `@typescript-eslint/no-unused-vars` with `ignoreRestSiblings: true`; the `no-restricted-imports` fences                                                                                                                                                                                                                                                                        |
| `src/**/*.test.{ts,tsx}`                                                                         | `@vitest/eslint-plugin` `recommended`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/**/*.{ts,tsx}` minus `*.test.{ts,tsx}` and `src/shared/testing/**`                          | `import-x/no-restricted-paths`: nothing in the production graph may import `@/shared/testing`, which is devDependency-backed. Verified by gate 10                                                                                                                                                                                                                                                                                     |
| `src/app/routes/**/*.tsx`                                                                        | `react-refresh/only-export-components` off: every route module exports a `Route` constant beside its components                                                                                                                                                                                                                                                                                                                       |
| `src/**/index.ts`                                                                                | `no-restricted-syntax`: a barrel may only import and re-export                                                                                                                                                                                                                                                                                                                                                                        |
| `eslint.config.js`, `vite.config.ts`, `steiger.config.ts`, `scripts/**/*.mjs`, `scripts/**/*.ts` | Node globals                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `steiger.config.ts`                                                                              | `no-unsafe-argument` and `no-unsafe-assignment` off: steiger's types resolve to `any`, because its `.d.ts` needs `@steiger/toolkit`, whose `vitest` peer stops at 3                                                                                                                                                                                                                                                                   |
| `e2e/**/*.ts`, `playwright.config.ts`                                                            | `no-restricted-imports`: nothing from `src`                                                                                                                                                                                                                                                                                                                                                                                           |
| Every file                                                                                       | `linterOptions.reportUnusedDisableDirectives: 'error'`; `eslint-config-prettier` last, switching off every rule Prettier owns; global `ignores` for `.claude`, `dist`, `coverage`, `node_modules`, `playwright-report`, `test-results`, `blob-report` and `src/app/router/route-tree.gen.ts`                                                                                                                                          |

### TypeScript projects

`tsconfig.json` is a solution file: `"files": []` and three `references`, which `tsc -b` builds in
turn. Every project sets `noEmit: true` — Vite, not `tsc`, produces JavaScript — keeps its
incremental build info in `node_modules/.tmp/`, and shares one strictness set: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`,
`verbatimModuleSyntax`, `erasableSyntaxOnly` and `forceConsistentCasingInFileNames`.

| Project              | `include`                                                                                        | Differs in                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.app.json`  | `src`, `env.d.ts`, `vitest.setup.ts`                                                             | `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `lib` with `DOM`, `types: ["vite/client"]`, `paths` `@/*` → `./src/*`                                                                                                                                                                                                            |
| `tsconfig.node.json` | `vite.config.ts`, `steiger.config.ts`, `eslint.config.js`, `scripts/**/*.mjs`, `scripts/**/*.ts` | `module` and `moduleResolution: "nodenext"`, `types: ["node"]`, `allowImportingTsExtensions`, `allowJs: true` with `checkJs: false`: the JavaScript files join the project for ESLint's typed rules without being type-checked, while the TypeScript scripts — which Node 24 runs directly — are type-checked like any other source |
| `tsconfig.e2e.json`  | `playwright.config.ts`, `e2e`                                                                    | `moduleResolution: "bundler"`, `types: ["node"]`, and no `paths`, so an `@/…` import fails to resolve (see [End-to-end testing](./e2e-testing.md))                                                                                                                                                                                  |

The root `tsconfig.json` also declares `baseUrl` and `paths` (`@/*` → `./src/*`) for tools that read
only the root file instead of following `references`, such as the shadcn CLI configured by
`components.json` (see [Design system](./design-system.md)). `tsc -b` compiles nothing from the root
file itself, so this duplicate does not affect type-checking.

### Dependabot groups

Every entry in `.github/dependabot.yml` sets `commit-message.prefix: chore`, so pull request titles
read `chore: bump …` — lower-case, because Dependabot copies the capitalisation of the repository's
recent commits. The `npm` entry (`directory: /`, weekly on Monday, `open-pull-requests-limit: 5`)
ignores two kinds of update: semver-major releases of `@types/node`, which follow the Node line
`.nvmrc` pins rather than the newest Node, and semver-major and semver-minor releases of
`typescript`, which move only when `typescript-eslint`'s peer range — `>=4.8.4 <6.1.0` today —
admits them. It declares five groups. A dependency joins the first group it matches;
a named group carries every update type, majors included; a dependency no group matches is updated
in a pull request of its own.

| Group             | Matches                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `tanstack`        | `@tanstack/*` — including both TanStack ESLint plugins, which match here first   |
| `eslint`          | `eslint`, `eslint-*`, `@eslint/*`, `@eslint-react/*`, `typescript-eslint`        |
| `build-and-test`  | `vite`, `@vitejs/*`, `vitest`, `@vitest/*`, `@testing-library/*`, `jsdom`, `msw` |
| `react`           | `react`, `react-dom`, `@types/react`, `@types/react-dom`                         |
| `minor-and-patch` | Every other dependency, for `update-types: ['minor', 'patch']` only              |

The `docker` entry (`directory: /`) runs weekly on Monday for the two base images in the
`Dockerfile`, and ignores semver-major updates of `node`, so the build stage stays on the Node line
`.nvmrc` pins. The `github-actions` entry (`directory: /`) runs monthly, without groups.

## Configuration

No `VITE_*` variable changes what a gate checks. The environment variables and options below are
everything the pipeline reads; `VITE_API_BASE_URL` matters only when recording the bundle baseline.

| Variable / option                                                                                                 | Default                                                                                                                                           | Meaning                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI` (environment)                                                                                                | `true` on GitHub Actions; unset locally                                                                                                           | lefthook's `postinstall` skips `lefthook install` while it is truthy, unless `LEFTHOOK` is truthy too; Playwright also reads it (see [End-to-end testing](./e2e-testing.md))                                                                |
| `LEFTHOOK` (environment)                                                                                          | Unset                                                                                                                                             | `LEFTHOOK=0` makes both installed hooks exit 0 without running a job                                                                                                                                                                        |
| `VITE_API_BASE_URL` (environment or `.env`)                                                                       | Unset                                                                                                                                             | Inlined into the bundle by Vite; leave it unset when recording the baseline (see [Configuration and environment](./configuration.md))                                                                                                       |
| `engines.node` (`package.json`)                                                                                   | `^24.15.0                                                                                                                                         |                                                                                                                                                                                                                                             | >=26.0.0` | The supported Node range: the narrowest range any installed dependency declares, `jsdom` 30's, so the root states the floor that installs actually enforce |
| `engine-strict` (`.npmrc`)                                                                                        | `true` (npm's own default is `false`)                                                                                                             | Any installed package whose `engines` rejects the running Node fails `npm install` and `npm ci` with `EBADENGINE`; it does not gate `npm run <script>`, so a Node downgrade after install is caught only on the next fresh install or in CI |
| `.nvmrc`                                                                                                          | `24`                                                                                                                                              | The Node major for `nvm use` and for CI's `node-version-file`                                                                                                                                                                               |
| `packageManager` (`package.json`)                                                                                 | `npm@11.16.0`                                                                                                                                     | The declared npm version                                                                                                                                                                                                                    |
| `typescript` (`devDependencies`)                                                                                  | `~6.0.2`                                                                                                                                          | Held inside typescript-eslint's peer range; see [Design decisions](#design-decisions--trade-offs)                                                                                                                                           |
| `min_version` (`lefthook.yml`)                                                                                    | `2.1.0`                                                                                                                                           | The oldest lefthook binary allowed to run the hooks                                                                                                                                                                                         |
| `assert_lefthook_installed` (`lefthook.yml`)                                                                      | `true`                                                                                                                                            | A hook that cannot find the lefthook binary exits 1 instead of letting the commit or push through                                                                                                                                           |
| `glob_matcher` (`lefthook.yml`)                                                                                   | Unset, so `gobwas`                                                                                                                                | The engine for every job's `glob`                                                                                                                                                                                                           |
| `stage_fixed` (`format` job)                                                                                      | `true`                                                                                                                                            | Re-stage the files Prettier rewrote                                                                                                                                                                                                         |
| `--max-warnings 0` (ESLint), `--deny-warnings` (oxlint)                                                           | Always passed                                                                                                                                     | A warning fails the gate                                                                                                                                                                                                                    |
| `linterOptions.reportUnusedDisableDirectives` (`eslint.config.js`)                                                | `'error'`                                                                                                                                         | An `eslint-disable` comment that suppresses nothing fails `lint`                                                                                                                                                                            |
| `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth`, `arrowParens`, `endOfLine` (`.prettierrc.json`) | `true`, `true`, `'all'`, `100`, `2`, `'always'`, `'lf'`                                                                                           | The house formatting                                                                                                                                                                                                                        |
| `plugins`, `tailwindStylesheet`, `tailwindFunctions` (`.prettierrc.json`)                                         | `['prettier-plugin-tailwindcss']`, `./src/app/styles/index.css`, `['cn', 'cva']`                                                                  | Sorts Tailwind classes in `className` attributes and inside `cn(...)` and `cva(...)` calls, against the app's stylesheet                                                                                                                    |
| `coverage.thresholds` (`vite.config.ts`)                                                                          | `perFile: true`; `lines`, `functions`, `branches`, `statements` at `90`                                                                           | What `test:coverage` enforces (see [Unit and component testing](./unit-testing.md))                                                                                                                                                         |
| `fsd/insignificant-slice` (`steiger.config.ts`)                                                                   | `'off'` for `./src/features/sign-in/**`, `./src/features/sign-out/**`, `./src/features/switch-locale/**` and `./src/features/update-user-name/**` | The one override of the `recommended` preset: each of these features has exactly one consuming slice, which is what the rule flags (see [Architecture boundaries](./architecture-boundaries.md))                                            |
| `on.schedule` (`ci.yml`)                                                                                          | `cron: '0 6 * * 1'`                                                                                                                               | The weekly run: Mondays at 06:00 UTC, `Dependency audit` only                                                                                                                                                                               |
| `timeout-minutes` (`ci.yml`)                                                                                      | `15`, `20`, `10`                                                                                                                                  | Caps for `quality-gates`, `e2e` and `dependency-audit`                                                                                                                                                                                      |
| `retention-days` (`ci.yml`)                                                                                       | `7`                                                                                                                                               | How long the `coverage` and `playwright-report` artifacts are kept                                                                                                                                                                          |
| `--omit=dev`, `--audit-level=high` (`audit:deps`)                                                                 | Always passed                                                                                                                                     | Audit production dependencies only; fail on a `high` or `critical` advisory                                                                                                                                                                 |
| `schedule.interval` (`dependabot.yml`)                                                                            | `weekly` on `monday` for npm; `monthly` for GitHub Actions                                                                                        | Update cadence                                                                                                                                                                                                                              |
| `open-pull-requests-limit` (`dependabot.yml`)                                                                     | `5`, which is also Dependabot's default                                                                                                           | The most npm update pull requests open at once                                                                                                                                                                                              |

## Usage & extension

### Run the gates before you push

`npm run audit` is what must be green before anything is committed or merged; it is exactly what CI's
`Quality gates` job runs, and it needs no network. The end-to-end suite runs beside it in CI but not
in the hook, so run it yourself before opening a pull request:

```sh
npm run audit
npm run test:e2e
```

To rehearse a hook without committing or pushing, run it through lefthook; `pre-commit` acts on
whatever is staged, exactly as a commit would:

```sh
npx lefthook run pre-commit
npx lefthook run pre-push
```

If the hooks are missing — a clone installed with `--ignore-scripts`, or a hand-edited
`.git/hooks` — reinstall them with `npx lefthook install -f`. `git commit --no-verify`,
`git push --no-verify` and `LEFTHOOK=0` skip them; CI still runs.

### Fix what a gate reports

| Failing gate                                  | Fix                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:lock` or the `lockfile` job           | Run `npm install` and commit `package-lock.json` together with `package.json`                                                                                                                                                                                                            |
| `format:check`                                | `npm run format`, or stage the files: the `format` job rewrites them                                                                                                                                                                                                                     |
| `lint`                                        | `npm run lint:fix` for the fixable rules, import order among them; the rest by hand                                                                                                                                                                                                      |
| `lint:a11y`, drift lines                      | After an oxlint upgrade, `npm run lint:a11y:fix`, then commit `.oxlintrc.json`                                                                                                                                                                                                           |
| `lint:a11y`, a finding                        | Fix the markup; a genuine exception gets an inline suppression (below)                                                                                                                                                                                                                   |
| `typecheck`, after adding or renaming a route | `npx vite build` (or `npm run dev`) regenerates `src/app/router/route-tree.gen.ts`; commit it. `audit` cannot, because `tsc -b` fails before `vite build` runs (see [Routing](./routing.md))                                                                                             |
| `arch`                                        | See [Architecture boundaries](./architecture-boundaries.md)                                                                                                                                                                                                                              |
| `build`                                       | `tsc -b` passed as gate 5 and runs again first, so the error is `vite build`'s: read the Rollup/Vite message and fix the reported module or plugin config. This is the only gate that runs the Vite plugins, so a route-tree or code-splitting failure surfaces here and nowhere earlier |
| `test:coverage`                               | Add tests until the file clears 90% (see [Unit and component testing](./unit-testing.md))                                                                                                                                                                                                |
| `verify:coverage-scope`                       | A pattern in `coverage.exclude` in `vite.config.ts` swallowed a source file — typically a `.ts` pattern that also matches a `.tsx` file; narrow it                                                                                                                                       |
| `verify:import-fence`                         | The `import-x` resolver or the `no-restricted-paths` block in `eslint.config.js` moved or lost its `basePath`; the message says which direction failed                                                                                                                                   |
| `audit:deps`                                  | Upgrade the vulnerable package, usually by merging Dependabot's pull request                                                                                                                                                                                                             |

### Add a gate

1. Write the check as an npm script that exits non-zero on failure and needs no network — `audit`
   runs inside a git hook. A check that needs the network belongs in its own CI job, like
   `Dependency audit`.
2. Insert it into `audit`: static checks before `build`, anything that reads test output after
   `test:coverage`.
3. Nothing else: the `pre-push` hook and the `Quality gates` job both run `audit` by name.
4. Optionally mirror a fast, per-file version in `pre-commit` — a job with a `glob` and a
   `{staged_files}` command. Under the default `gobwas` matcher `*` matches across `/`, so
   `src/*.ts` covers every depth and `src/**/*.ts` skips files directly in `src/`.

For example, a gate that fails when the committed dependency graph no longer matches the imports,
once `docs/architecture-graph.md` is tracked:

```json
{
  "scripts": {
    "verify:arch-graph": "npm run arch:graph && git diff --exit-code -- docs/architecture-graph.md",
    "audit": "npm run verify:lock && npm run format:check && npm run lint && npm run lint:a11y && npm run typecheck && npm run arch && npm run verify:arch-graph && npm run build && npm run test:coverage && npm run verify:coverage-scope"
  }
}
```

`arch:graph` rewrites the file in place, so a failing run leaves the regenerated graph in the working
tree, ready to commit.

### Put a new root file under the type-aware linters

ESLint lints every `**/*.{js,mjs,ts,tsx}` file with typed rules resolved through `projectService`,
so each such file must belong to one of the three TypeScript projects; a file in none fails
`npm run lint` with a project-service parse error. New Node scripts belong in `scripts/`, as `.mjs`
or — when another module imports them, as `vite.config.ts` imports `scripts/security-headers.ts` —
as `.ts` with erasable syntax only, which Node 24 runs without a build step; `tsconfig.node.json`
and ESLint's Node-globals block already cover both. A new root-level config file needs both entries
— for a hypothetical `knip.config.ts`, `tsconfig.node.json`'s `include` becomes:

```json
{
  "include": [
    "vite.config.ts",
    "steiger.config.ts",
    "eslint.config.js",
    "scripts/**/*.mjs",
    "scripts/**/*.ts",
    "commitlint.config.ts",
    "knip.config.ts"
  ]
}
```

and, if the file uses Node globals, the matching block in `eslint.config.js` becomes:

```js
export default [
  {
    files: [
      'eslint.config.js',
      'vite.config.ts',
      'steiger.config.ts',
      'scripts/**/*.mjs',
      'scripts/**/*.ts',
      'knip.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
];
```

The snippet shows only that block; in `eslint.config.js` it sits in place inside the existing
`tseslint.config(...)` call, where `globals` is already imported.

### Upgrade the toolchain

**oxlint.** A new oxlint release can add `jsx-a11y` rules; the drift check makes the audit fail
until the config adopts them:

```sh
npm install --save-dev oxlint@latest
npm run lint:a11y
npm run lint:a11y:fix
npm run lint:a11y
```

The first `lint:a11y` prints a `missing from .oxlintrc.json:` line per new rule; after
`lint:a11y:fix` the second passes (and may report findings the new rules make). Commit `package.json`,
`package-lock.json` and `.oxlintrc.json` together. Prefer `npm run lint:a11y:fix` to the bare
`node scripts/a11y-rules.mjs` that the drift message suggests: the script writes arrays one element
per line, which fails `format:check` until Prettier has run over the file.

**TypeScript.** Check the linter's supported range first, then move the `typescript` range in
`package.json` to one inside it, run `npm install`, and confirm that the tree is valid and the gates
pass — `npm ls typescript` exits 1 when any installed package's peer range rejects the version:

```sh
npm view typescript-eslint peerDependencies
npm ls typescript
npm run audit
```

**Grouped packages.** When a new family of packages must move in step — a Storybook setup, say — add
a group before `minor-and-patch`, because a dependency joins the first group it matches. The `npm`
entry then reads:

```yaml
- package-ecosystem: npm
  directory: /
  schedule:
    interval: weekly
    day: monday
  open-pull-requests-limit: 5
  groups:
    tanstack:
      patterns: ['@tanstack/*']
    eslint:
      patterns: ['eslint', 'eslint-*', '@eslint/*', '@eslint-react/*', 'typescript-eslint']
    build-and-test:
      patterns: ['vite', '@vitejs/*', 'vitest', '@vitest/*', '@testing-library/*', 'jsdom', 'msw']
    react:
      patterns: ['react', 'react-dom', '@types/react', '@types/react-dom']
    storybook:
      patterns: ['storybook', '@storybook/*']
    minor-and-patch:
      update-types: ['minor', 'patch']
```

### Suppress one accessibility finding

Every `jsx-a11y` rule is on at `error` and the drift check keeps it there, so an exception lives in
the code, where review sees it — an inline oxlint directive for that one line:

```tsx
export function SearchField() {
  // oxlint-disable-next-line jsx-a11y/no-autofocus
  return <input autoFocus aria-label="Search" />;
}
```

ESLint treats the directive as an ordinary comment, so `reportUnusedDisableDirectives` does not
apply to it.

### Regenerate the architecture graph

After changing which slices or segments import each other, run `npm run arch:graph` and commit
`docs/architecture-graph.md` rather than editing it by hand. The script and the
`dependency-cruiser` devDependency it shells out to are both committed, so a fresh clone runs it
straight after `npm ci`:

```sh
npm run arch:graph
```

The generated output is already Prettier-clean, and the `docs/*` allow-list in `.prettierignore`
re-admits the file, so `format:check` holds the regenerated graph to the same formatting as code
instead of skipping it.

### Measure the bundle

No gate limits bundle size; the baseline below makes growth visible, and a jump against it is a
review item, not a failure. It was recorded from `npm run build` once `entities/user` had been
re-pinned to backend-boilerplate's contract, with no `.env` present — Vite 8.2.2, production mode,
620 modules transformed, ten entries in Vite's size table beside the copied `public/favicon.svg`:

| Asset                | Raw       | Gzip      | Loaded                                                                                     |
| -------------------- | --------- | --------- | ------------------------------------------------------------------------------------------ |
| `index-*.js`         | 363.72 kB | 117.94 kB | Up front: the entry script, including sonner and the CSS string it injects at module scope |
| `button-*.js`        | 103.52 kB | 34.34 kB  | Up front (`modulepreload`): the `shared/ui` primitives and i18next                         |
| `session-*.js`       | 33.13 kB  | 11.43 kB  | Up front (`modulepreload`): `zod/mini`, TanStack Query's core and `entities/session`       |
| `index-*.css`        | 20.55 kB  | 4.46 kB   | Up front: the single stylesheet                                                            |
| `index.html`         | 1.37 kB   | 0.64 kB   | The document, including the inline pre-paint theme script Vite does not minify             |
| `form-*.js`          | 74.03 kB  | 19.06 kB  | With `/sign-in` or `/users/$userId`: TanStack Form and the fields                          |
| `routes-*.js`        | 12.01 kB  | 5.09 kB   | With `/`: the home page                                                                    |
| `users._userId-*.js` | 12.78 kB  | 4.56 kB   | With `/users/$userId`                                                                      |
| `sign-in-*.js`       | 2.57 kB   | 1.14 kB   | With `/sign-in`                                                                            |
| `home-*.js`          | 0.63 kB   | 0.31 kB   | On demand: the Russian `home` namespace                                                    |

The three chunks `dist/index.html` loads up front total 500.37 kB raw and 163.71 kB gzip, plus the
stylesheet. Re-pinning the user entity moved them by less than 1 kB: the write-through cache helper
lands in the entry chunk, and `zm.uuid()` adds 0.22 kB gzip to `session-*.js`. sonner accounts for
nearly all of the entry chunk's jump from `5c55de1`'s 328.83 kB / 108.55 kB: most of it is 14,916
bytes of minified CSS that sonner inlines as a JavaScript string and injects into `document.head` at
module-evaluation time, which never passes through Vite's CSS pipeline and cannot be preloaded. The
rest is fetched on navigation: `autoCodeSplitting` gives each route component a chunk of its own,
and modules that two routes share are hoisted into shared chunks — `form-*.js` is imported by both
`sign-in-*.js` and `users._userId-*.js`. Why each chunk weighs what it does belongs to the
capability that owns it: [Design system](./design-system.md), [Forms](./forms.md),
[Internationalization](./internationalization.md), [Routing](./routing.md) and
[Session management](./session-management.md).

To re-measure, build without a `.env` and read Vite's size table. Vite inlines `VITE_API_BASE_URL`,
so a value changes the bytes and can change the chunk layout — with it set to `/v1` at `65a99bc` the
layout holds at the same ten entries, but `button-*.js` grows to 103.34 kB (34.27 kB gzip) and every
content hash moves except the stylesheet's and `home-*.js`'s, the only two files that neither carry
the inlined value nor import a chunk that does. The second command lists what `index.html` loads up
front; the third finds the chunk that carries a module by grepping for a string unique to it
(`submissionAttempts` is TanStack Form's, and matches `form-*.js` only):

```sh
npm run build
grep -oE 'assets/[^"]+\.(js|css)' dist/index.html
grep -lE 'submissionAttempts' dist/assets/*.js
```

To price one change, compare against a fresh build of its parent rather than against this table,
which drifts whenever a commit changes the bundle without re-recording it:

```sh
git worktree add ../frontend-boilerplate-baseline HEAD~1
(cd ../frontend-boilerplate-baseline && npm ci --ignore-scripts && npm run build)
git worktree remove ../frontend-boilerplate-baseline
```

`--ignore-scripts` stops lefthook's `postinstall` from reinstalling the repository's git hooks, which
every worktree shares, from the throwaway tree; nothing the build needs has an install script.

### Make CI block merges

CI reports on every pull request, but only the repository's settings can make it stop a merge, and
a repository created from this template inherits none of them. `.github/rulesets/main.json` is the
ruleset this repository applies to `main`, kept in the tree so a new project can apply the same
one: pull requests only, squash merges, a linear history, no force push or deletion, repository
administrators allowed to bypass, and four required checks — `Quality gates`, `End-to-end tests`,
`Container image` and `Conventional title`. `Dependency audit` stays optional, for the reason given
under [Design decisions](#design-decisions--trade-offs). `.github/rulesets/version-tags.json`
protects `v*` release tags from being moved or deleted. GitHub reads neither file; apply them from
the repository's own checkout, where `gh` fills in `{owner}` and `{repo}`:

```sh
gh api --method POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
gh api --method POST repos/{owner}/{repo}/rulesets --input .github/rulesets/version-tags.json
```

A repository that also turns on CodeQL's default setup can require its `CodeQL` check too, as this
one does. Require that summary check, not the per-language `Analyze (…)` jobs: CodeQL skips a pull
request that changes nothing it analyzes — a lockfile bump, say — and then only the summary reports,
as skipped, which satisfies the rule, while the `Analyze` checks never appear and would block the
pull request for good. The summary is also the check that fails when a pull request introduces an
alert; the analysis jobs pass either way. Rulesets on a private repository are enforced only on a
paid GitHub plan, so a private project on the free plan keeps CI advisory and `pre-push` as its real
gate.

## Design decisions & trade-offs

- **One gate list, called by name.** `audit` in `package.json` is the only place the gates are
  listed; the `pre-push` job and the `Quality gates` job both run `npm run audit` instead of
  restating its steps in YAML, where the local and CI lists would drift apart. The cost is
  granularity: CI runs the ten gates in one job, so a formatting slip and a failing test both
  surface as one red `Quality gates` check, and the log says which.
- **Cheapest checks first, at every level.** `pre-commit` touches only staged files and fixes
  formatting itself; `pre-push` runs the whole-program gates a staged-file check cannot see — types,
  Feature-Sliced Design rules, the build, the tests; CI repeats them on a clean checkout, which
  catches what a working tree hides, such as an untracked file a local run relied on. Inside `audit`
  the static checks precede `build` and the tests, so the common failures surface in seconds.
- **The end-to-end suite stays out of `audit`.** A gate that builds the app and boots a browser does
  not belong in a pre-push hook that runs on every push. CI runs it as a separate job in parallel
  with `Quality gates`, so a pull request gets both results at once rather than one after the other.
- **lefthook, not husky plus lint-staged.** One dependency and one YAML file replace two dependencies
  and shell scripts, with staged-file templating, re-staging, per-job globs and glob-gated skips
  built in. The lint-staged guarantee that matters most is kept: lefthook 2 sets aside the unstaged
  hunks of a partially staged file while the jobs run and restores them afterwards. Verified with
  the installed 2.1.10: after staging one hunk of a file, the `format` job formatted and committed
  that hunk only, and the unstaged one came back untouched.
- **Hooks install through lefthook's own `postinstall`, with no `prepare` script.** The
  `postinstall` already runs `lefthook install -f`, skips itself under `CI` and swallows its own
  failure. A `prepare` script would duplicate it, would not skip on CI, would drop the `-f` that lets
  installation proceed when `core.hooksPath` is set, and would fail `npm install` wherever `.git` is
  absent — a tarball install, or a Docker layer that copies only `package*.json`.
- **A missing hook fails loudly.** With `assert_lefthook_installed: true`, the generated hook exits 1
  with `Can't find lefthook in PATH` when the binary is gone — after deleting `node_modules`, say —
  instead of letting the commit through unchecked; `min_version: 2.1.0` rejects an older binary.
- **Three load-bearing lines in `lefthook.yml`.** `--no-warn-ignored` on `lint` is required:
  `src/app/router/route-tree.gen.ts` is tracked, regenerated with every route change and listed in
  ESLint's `ignores`, and passing it explicitly makes ESLint warn
  `File ignored because of a matching ignore pattern`, which `--max-warnings 0` turns into a failure
  — without the flag, every commit that adds or renames a route would be rejected. The `format` job
  has no `glob` and passes `--ignore-unknown`, so `.prettierignore` and Prettier's own parsers decide
  what it formats, exactly as they do for `format:check`; an extension whitelist would drift from
  that set. And the `a11y` glob is `src/*.{ts,tsx}`, not `src/**/*.{ts,tsx}`: under `gobwas`, `*`
  matches across `/` while `**` requires at least one directory, so the intuitive pattern silently
  skips `src/main.tsx`. `glob_matcher: doublestar` is no fix, because it is global and the `lint`
  glob relies on `*` matching across `/`.
- **`npm ci` in CI, `verify:lock` everywhere else.** `npm ci` installs exactly the lockfile and
  refuses one that disagrees with `package.json`, so in CI the `verify:lock` step repeats a check
  already made. It earns its place locally: `npm ci --dry-run` runs the same validation without
  touching `node_modules`, and `--ignore-scripts` keeps lifecycle scripts out of a check — which is
  why the `lockfile` job can run on every commit that stages a manifest.
- **Two linters, zero overlap.** ESLint is the primary linter and owns everything type-aware, JSX
  correctness included through `@eslint-react/eslint-plugin`. oxlint is here for accessibility
  alone: `eslint-plugin-jsx-a11y` was last published in October 2024 (6.10.2) with a peer range of
  `eslint: ^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9`, which stops short of the ESLint 10 this
  repository runs, and forcing it in with an `overrides` entry would pin the accessibility gate to an
  unmaintained plugin. oxlint's `jsx-a11y` rules ship inside oxlint, need no ESLint peer, and are
  actively released. `.oxlintrc.json` enables only `jsx-a11y` rules and turns oxlint's default
  `correctness` category off, so no rule runs in both linters.
- **The accessibility rule list is generated, not curated.** It is every `jsx-a11y` rule oxlint's
  schema lists, all at `error`. A curated list goes stale with each oxlint release, silently leaving
  new rules off; the drift check fails the audit until `npm run lint:a11y:fix` adopts them, and
  equally fails a hand edit that relaxes or deletes a rule. The cost is that no rule can be relaxed
  in config — an exception is an inline directive in the code, visible in review.
- **TypeScript is pinned to `~6.0.x` because the lint gate cannot run on anything newer.**
  typescript-eslint declares the peer `typescript: >=4.8.4 <6.1.0` — the installed 8.67.0 does, and
  so did its newest release when this document was verified — and `~6.0.2`, which means
  `>=6.0.2 <6.1.0`, is the widest range inside it. TypeScript 7 is published; a reproduction at this
  commit with `typescript@7.0.2` shows what installing it does. `npm install` succeeds while printing
  `ERESOLVE overriding peer dependency` 68 times, nests duplicate `@typescript-eslint/*` packages
  (for example under `node_modules/typescript-eslint/node_modules/@typescript-eslint/`), and leaves
  `npm ls typescript` exiting 1 with `ELSPROBLEMS`. `tsc -b` still passes, but `npm run lint` dies at
  module load with exit code 2 —
  `TypeError: Cannot read properties of undefined (reading 'Intrinsic')`, thrown from `ts-api-utils`
  — having run no rule. Widen the range only after `npm view typescript-eslint peerDependencies`
  admits the new version.
- **`verify:coverage-scope` restates the exclusion policy instead of reading it.** Vitest matches
  `coverage.exclude` with picomatch `contains: true`, which makes every pattern an unanchored
  substring match, so a pattern ending `.ts` also excludes its `.tsx` sibling — a per-file threshold
  that silently stops evaluating a file. The script derives the expected file set on its own and
  diffs it against the report; a check computed from `vite.config.ts` would inherit the very mistake
  it exists to catch. The cost is that a genuine new exclusion takes two edits, which is why the
  failure message names `vite.config.ts`. The script parses lcov's plain `SF:` lines rather than
  calling `JSON.parse` on a JSON summary, whose `any` result would trip the type-aware
  `no-unsafe-*` rules that lint `scripts/**/*.mjs`. Barrels need no exclusion at all:
  `no-restricted-syntax` keeps every `src/**/index.ts` free of statements, so they have nothing to
  cover and cannot fail a threshold.
- **`Dependency audit` is a separate job that installs nothing and should never be required.**
  `npm audit` resolves from `package-lock.json`, so the job skips `npm ci`. It fails whenever a
  high-severity advisory is published against a production dependency — with no change on this side
  — so requiring it would freeze every merge, including the pull request that bumps the vulnerable
  package, until a fixed version exists. The weekly schedule surfaces new advisories on weeks nobody
  pushes; the other two jobs skip scheduled runs because the code has not changed. `--omit=dev`
  limits it to the dependencies that ship in the bundle, and `--audit-level=high` sets the severity
  that fails it.
- **Least privilege and bounded runs.** `permissions: contents: read` leaves the workflow token
  able to read the repository and nothing else. `persist-credentials: false` keeps
  `actions/checkout` from writing that token into `.git/config`, where the dependency lifecycle
  scripts `npm ci` runs next could read it. `timeout-minutes` caps each job, and no step reads a
  secret, so pull requests from forks and from Dependabot, which GitHub runs without secrets, go
  through the same jobs. Node comes from `.nvmrc` through `node-version-file` rather than a second
  version pinned in YAML. Artifact uploads run under `!cancelled()`, so a failed run still leaves its
  coverage or Playwright report for seven days, and `if-no-files-found: ignore` keeps a run that
  failed before producing them from reporting a second error.
- **Superseded pull-request runs are cancelled; `main` runs are not.** The concurrency group is the
  workflow plus the pull request's source branch (`github.head_ref`) or, for pushes and the schedule,
  the ref. `cancel-in-progress` is true only for `pull_request` events, so a new push to a pull
  request stops the stale run, while a run on `main` always finishes. GitHub still keeps at most one
  pending run per group and replaces it with a newer one.
- **Dependabot groups follow peer coupling.** Packages whose peer ranges tie them together arrive in
  one pull request, so CI judges the combination that will actually be installed:
  `@vitest/coverage-v8` 4.1.11 requires `vitest` at exactly `4.1.11`, `react-dom` 19.2.8 requires
  `react` `^19.2.8`, and `@tanstack/router-plugin` requires `@tanstack/react-router` `^1.170.32`.
  `minor-and-patch` comes last as the catch-all for everything else, so the named groups claim their
  packages first; a major release outside the named groups arrives alone, where it can be reviewed
  on its own.
- **engine-strict makes the Node floor a failure, not a warning.** Without it npm prints
  `EBADENGINE` and installs anyway, and the mismatch surfaces later as an obscure runtime error. With
  it the install stops at once. `.nvmrc` holds only the major, `24`, so CI's `setup-node` takes the
  newest 24.x release.
- **Prettier owns every tracked text file except two, and the published docs have joined them.**
  Prettier 3 reads `.gitignore` as well as `.prettierignore`, so git-ignored paths such as `.env` or
  `docs/next-step.md` are skipped anyway, and the build-output, editor and agent entries in
  `.prettierignore` restate `.gitignore`. The entries that change behaviour are the tracked files
  another tool writes and would rewrite on its next run — `package-lock.json` (npm) and
  `src/app/router/route-tree.gen.ts` (the router plugin). `docs` is the third, and the one that
  moved most recently: as a bare directory entry, which is what `1c193c6` still had, it makes
  `format` and `format:check` skip the whole tree, published documentation included. `5cd3351`
  replaced that line with a `docs/*` allow-list plus four negations — `!docs/README.md`,
  `!docs/architecture-graph.md`, `!docs/features/` and `!docs/features/**` — which holds the
  published documentation to the formatting gate like code while leaving any other file dropped
  into `docs/` out of it. `!docs/features/` is the load-bearing negation: a pattern cannot re-admit
  a file inside a directory an earlier pattern excluded, so the directory has to be un-ignored
  before its contents can be — drop that line and every file under `docs/features/` falls back out
  of the gate, while dropping the broader `!docs/features/**` changes nothing.

## Testing

The pipeline has no co-located tests of its own. Vitest collects only
`src/**/*.{test,spec}.{ts,tsx}`, so neither `scripts/*.mjs` nor `eslint.config.js`, `lefthook.yml`
or the workflow is under test — `eslint.config.js` says as much about its order-sensitive
`no-restricted-imports` blocks: "nothing tests the flat config". One narrow exception now exists:
gate 10, `verify:import-fence`, lints a pair of throwaway probe files to prove the
`@/shared/testing` fence and the `import-x` resolver it depends on are both live. Block ordering
for `no-restricted-imports` remains untested. The gates are otherwise verified by running
them, and every push runs all of them. What they execute is documented elsewhere: the Vitest suite
and its coverage policy in [Unit and component testing](./unit-testing.md), the Playwright suite in
[End-to-end testing](./e2e-testing.md).

| Command                                         | What it proves                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run audit`                                 | All ten gates pass, in CI's order                                                              |
| `npx lefthook run pre-commit`                   | The five commit jobs pass on what is staged                                                    |
| `npx lefthook run pre-push`                     | The push hook passes                                                                           |
| `node scripts/a11y-rules.mjs --check`           | `.oxlintrc.json` matches the installed oxlint: `.oxlintrc.json is in sync: 36 jsx-a11y rules.` |
| `npm run test:coverage`                         | The suite passes with 90% per file, and writes `coverage/lcov.info`                            |
| `npm run verify:coverage-scope`                 | Every source file was measured: `Coverage scope verified: 158 source files measured.` today    |
| `npm run verify:import-fence`                   | The `@/shared/testing` fence blocks production files and exempts test files                    |
| `npm test`                                      | The unit and component suite, without coverage                                                 |
| `npx vitest run src/shared/lib/format-duration` | One folder or file of it                                                                       |
| `npm run test:e2e`                              | Playwright over the production build                                                           |
| `npm run audit:deps`                            | No `high` or `critical` advisory against a production dependency; needs the network            |

To see a gate bite before trusting it, break it on purpose and revert: set
`"jsx-a11y/no-autofocus"` to `"warn"` in `.oxlintrc.json` and `node scripts/a11y-rules.mjs --check`
prints `not set to "error": jsx-a11y/no-autofocus` and exits 1; delete `coverage/` and
`npm run verify:coverage-scope` prints ``No coverage report found. Run `npm run test:coverage` first.``
and exits 1; stage a misformatted file and `npx lefthook run pre-commit` rewrites and re-stages it.
In CI, the `coverage` and `playwright-report` artifacts keep each run's evidence for seven days.

## Known limitations

- **CI blocks a merge only where a ruleset says so.** Required status checks live in the GitHub
  repository settings, not in code: `.github/rulesets/main.json` describes them, but a repository
  created from the template starts unprotected until someone applies it, and administrators can
  bypass it by design (see [Make CI block merges](#make-ci-block-merges)). The git hooks are the
  only gates that refuse on their own, and they can be skipped: the generated
  `.git/hooks/pre-commit` exits 0 at once when `LEFTHOOK` is `0`, and `--no-verify` skips it
  entirely. Dependabot's commits never meet the hooks at all.
- **The Node range is kept in step by hand.** `engine-strict` enforces the `engines` field of every
  installed package, not only the root's (`#checkEngineAndPlatform` in npm's `@npmcli/arborist`), so
  `engines.node` repeats the narrowest range a dependency declares — `jsdom` 30's
  `^22.22.2 || ^24.15.0 || >=26.0.0`, minus the Node 22 line `.nvmrc` does not use.
  `dependency-cruiser` 18.2.0 (`^22||^24||>=26`) and its dependency `watskeburt` 6.0.0
  (`^22.13||^24||>=26`) sit inside that range. A dependency update that narrows it further fails
  `npm ci` with the dependency's own `EBADENGINE` until the root is edited to match, and because
  `engine-strict` gates installs rather than `npm run`, an already-populated `node_modules` hides a
  Node downgrade until the next `npm install` or `npm ci`.
- **The npm version is declared, not enforced.** `engines` names no `npm` range, so `engine-strict`
  never checks it, and `packageManager` (`npm@11.16.0`) has effect only where Corepack is enabled.
- **`pre-push` audits the working tree, not the commits being pushed.** lefthook sets unstaged
  changes aside for `pre-commit` only, so `npm run audit` sees every uncommitted edit and untracked
  file on disk: a push can pass on a fix that was never committed, or fail on unrelated work in
  progress. CI's clean checkout is the authoritative verdict.
- **`Dependency audit` sees production dependencies only, at `high` and above.** Advisories against
  the build and test toolchain, and `moderate` or `low` ones against anything, never fail it.
  Dependabot's version updates still cover development dependencies.
- **The accessibility drift check has blind spots.** It compares only the `jsx-a11y/` entries of
  `.oxlintrc.json`: re-enabling the `correctness` category, which would overlap ESLint, or adding a
  rule from another plugin passes it. Inline `oxlint-disable` directives are gated by nothing —
  `lint:a11y` passes no option that reports unused ones. And its failure message recommends the bare
  `node scripts/a11y-rules.mjs`, whose output fails `format:check` until Prettier has run.
- **No test covers the gate configuration.** The order-sensitive `no-restricted-imports` blocks in
  `eslint.config.js` can be disabled by a block appended after them — the file's own comment warns
  that "a src/shared/\*\* block appended below would silently kill that form exemption" — and no test
  would notice; the same holds for `lefthook.yml`, the workflow and both scripts.
- **ESLint also lints project copies under `.claude/`.** `.gitignore` and `.prettierignore` exclude
  `.claude`, but ESLint's `ignores` does not, so `npm run lint` also lints any copy of the project
  there — such as a Claude Code worktree under `.claude/worktrees/` — against that copy's own
  `tsconfig.json`, and a broken copy fails the gate.
- **The architecture graph can go stale.** No gate checks that `docs/architecture-graph.md` matches
  the imports (see [Add a gate](#add-a-gate) for one way to add it), so it can drift from them
  between two runs. `arch:graph` also needs a POSIX shell: its `{ …; } > file` group is not valid in
  `cmd.exe`, the script shell npm uses by default on Windows.
- **Bundle size is not gated.** No script compares the build against a budget; the baseline under
  [Measure the bundle](#measure-the-bundle) is informational and must be re-recorded by hand.
- **Nothing but review holds the TypeScript pin.** `.github/dependabot.yml` has no `ignore` entry for
  `typescript`, so a Dependabot pull request that moves the range past `~6.0.x` is possible; judge it
  against `npm view typescript-eslint peerDependencies`, not only against a green run.
