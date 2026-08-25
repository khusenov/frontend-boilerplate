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

| Concern       | Choice                                          |
| ------------- | ----------------------------------------------- |
| UI            | React 19                                        |
| Language      | TypeScript 6.0 (strict, `verbatimModuleSyntax`) |
| Build / dev   | Vite 8 with `@vitejs/plugin-react`              |
| Linting       | ESLint 10 flat config + typescript-eslint 8     |
| React / JSX   | `@eslint-react/eslint-plugin`                   |
| Accessibility | oxlint, `jsx-a11y` rules only                   |
| Import order  | `eslint-plugin-import-x`                        |
| Formatting    | Prettier 3                                      |
| Architecture  | steiger + `@feature-sliced/steiger-plugin`      |
| Tests         | Vitest 4 + Testing Library + jsdom              |
| Coverage      | `@vitest/coverage-v8`, 90% per-file thresholds  |

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
about 6 seconds warm. Every gate in it runs offline; a vulnerability scan
(`npm audit --omit=dev --audit-level=high`) needs the network and therefore belongs to CI.

## Architecture — Feature-Sliced Design

Layers, from lowest to highest. A module may only import from layers **below** it.

| Layer      | Purpose                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `shared`   | Framework-agnostic building blocks: `ui`, `lib`, `api`, `config`.      |
| `entities` | Business nouns and their models, DTO mappers, and presentation.        |
| `features` | Single user actions that change state.                                 |
| `widgets`  | Compositions of entities and features into self-contained page blocks. |
| `pages`    | Route-level screens assembled from widgets, features, and entities.    |
| `app`      | Composition root: providers, routing, global styles, the shell.        |

Present today: `app`, `pages`, `shared`. `entities`, `features` and `widgets` arrive with their
first real slice.

`pages/home` and `shared/lib/format-duration` are worked examples, not product code. They exist so
that every gate has something to bite. Replace them with the first real slice and helper.

### Rules

- **Downward imports only.** `features` may use `entities` and `shared`; `entities` may not reach
  into `features`. steiger's `fsd/forbidden-imports` enforces this.
- **Public API only.** Import a slice through its `index.ts` barrel (`@/pages/home`), never through
  an inner file (`@/pages/home/ui/HomePage`). steiger's `fsd/no-public-api-sidestep` enforces this
  for files inside a layer.
- **Group `shared/lib` and `shared/ui` helpers into folders.** `shared/lib/format-duration/` with
  its own `index.ts`, not a flat `shared/lib/format-duration.ts`. steiger only enforces the public
  API of these two segments at the folder level; a flat file is unprotected.
- **Import the group, not the segment.** `@/shared/lib/format-duration`, never a `@/shared/lib`
  segment barrel. `shared/lib` and `shared/ui` have no segment `index.ts`: one that re-exported
  every helper would grow a line per helper and would give each symbol two sanctioned import paths.
  steiger does not require an index on these two segments, so `no-restricted-imports` bans the bare
  segment path instead.
- **Configuration is read at the composition seam, not at the leaf.** `app/entrypoint/App.tsx` is
  the only component that imports `@/shared/config`; it passes flat scalars down as props. A page or
  widget that reads `appConfig` itself becomes untestable without `vi.stubEnv()` and unusable with a
  different value, so keep the read at the top and the props narrow.
- **Barrels re-export, they do not execute.** A barrel contains `export` statements and nothing
  else. `no-restricted-syntax` on `src/**/index.ts` rejects any other statement and any
  declaration-carrying export, because barrels are excluded from coverage and logic placed in one
  escapes measurement. Side effects such as `import './styles/index.css'` belong in the module that
  owns them — the global stylesheet is imported by `app/entrypoint/App.tsx`, not by the `app` barrel
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
  only, so these concepts are fine as files (`app/entrypoint/providers.tsx`).
- **API data is mapped, never leaked.** The frontend owns its own models; responses arrive as DTOs
  and are converted by explicit mappers before crossing into `model`.

## File naming

| Kind                 | Convention                | Example                                                  |
| -------------------- | ------------------------- | -------------------------------------------------------- |
| React component file | `PascalCase.tsx`          | `src/pages/home/ui/HomePage.tsx`                         |
| Component stylesheet | Component's name, `.css`  | `src/pages/home/ui/HomePage.css`                         |
| Everything else      | `kebab-case.ts`           | `src/shared/lib/format-duration/format-duration.ts`      |
| Barrel / public API  | `index.ts`                | `src/shared/lib/format-duration/index.ts`                |
| Global stylesheet    | `index.css`               | `src/app/styles/index.css`                               |
| Test                 | Co-located `*.test.ts(x)` | `src/shared/lib/format-duration/format-duration.test.ts` |

- A component's stylesheet takes the component's name so the pair moves and renames together.
- Tests sit next to the code they cover, never in a parallel `__tests__` tree.
- CSS class names use BEM-ish block/element pairs scoped to the component: `.home`, `.home__env`.

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
Everything downstream takes the resolved values as props and is tested with plain literals.

## Testing

- Vitest runs in `jsdom` with `globals: false` — import `describe`, `it`, and `expect` from
  `vitest` explicitly.
- `vitest.setup.ts` registers `@testing-library/jest-dom` matchers and calls `cleanup()` after each
  test.
- Query by accessible role and name (`getByRole('button', { name: 'Add one second' })`) rather than
  by test id, so tests fail when accessibility regresses.
- Coverage thresholds are 90% for lines, functions, branches, and statements, applied **per file**
  (`thresholds.perFile`). A global threshold lets a well-covered codebase absorb one untested
  module; a per-file threshold names the file that fell short. Barrels (`src/**/index.ts`) and test
  files are excluded because they contain no logic.
- The `text` coverage reporter prints only files below 100%; an empty table means everything
  measured is fully covered.
- Any module that reads `import.meta.env` must be tested with `vi.stubEnv()` plus
  `vi.resetModules()` and a dynamic `import()`. Only `src/shared/config/app-config.ts` reads it;
  keep it that way and no other test needs the pattern.
- `src/main.tsx` is covered by `src/main.test.ts`, which asserts both the `#root` fail-fast guard
  and that the app mounts. React 19 roots flush asynchronously, so the mount assertion wraps the
  import in `act()`.
- A committed `it.skip(...)` fails `npm run lint`: `vitest/no-disabled-tests` is a warning and the
  lint gate runs with `--max-warnings 0`.

Current suite: **5 files, 19 tests, 100% coverage** against the 90% per-file threshold — 30/30
statements, 12/12 branches, 6/6 functions, 29/29 lines.

## Bundle size baseline

Recorded from `npm run build` on the scaffold as committed, with no `.env` present (Vite 8.2.2,
production, 24 modules transformed):

| Asset        | Raw       | Gzip     |
| ------------ | --------- | -------- |
| `index.js`   | 191.41 kB | 60.43 kB |
| `index.css`  | 0.61 kB   | 0.35 kB  |
| `index.html` | 0.47 kB   | 0.30 kB  |

The JS figure is essentially React 19 plus the scaffold's few components. A `.env` shifts it by a
few bytes because Vite inlines the value, so record baselines without one. Treat a jump against
this baseline as a review item, not a build failure — the number is here to make growth visible.
