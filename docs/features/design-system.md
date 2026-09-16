# Design system

> **Status:** Complete · **Layers:** app, pages, widgets, features, shared, outside layers · **Verified against:** `5c55de1`

## Purpose

Every screen needs the same few controls and the same colours. Without a shared vocabulary for
them, each _slice_ — one screen or business noun in this Feature-Sliced Design codebase — invents
its own button, spacing scale and colour literals, and that drift cannot be undone once several
slices have each done it their own way. The design system gives the app one set: semantic
_tokens_ — named CSS custom properties such as `--primary` — declared in
`src/shared/ui/theme.css` and compiled by Tailwind CSS v4 into utility classes such as `bg-primary`,
and a kit of accessible _primitives_ — `Button`, `Input` and `Label` — styled only through those
tokens, two of them over Radix (`Label` renders Radix's `Label.Root`, and `Button` renders Radix's
`Slot.Root` in `asChild` mode) and `Input` over the native element. The primitives are vendored from
shadcn/ui: their source was copied into `src/shared/ui` and is owned by this repository, so they
live in `shared` — the bottom _layer_ of that architecture, which every layer above may import and
which may import none of them — under the same public-API and lint rules as any other module.

## How it works

The system has two halves that meet only in class names: a stylesheet compiled once at build time,
and components that emit class strings at render time.

1. **The build compiles one stylesheet.** `src/app/entrypoint/app.tsx` imports `../styles/index.css`
   for its side effect, and the `tailwindcss()` plugin registered in `vite.config.ts` compiles it.
   The file's first line, `@import '../../shared/ui/theme.css'`, pulls in everything the system
   defines: `@import 'tailwindcss' source('../../')` — Tailwind's reset and utility engine, told to
   look for class names in `src/` only — then the `dark` custom variant, the light token set on
   `:root`, the dark set on `.dark`, and an `@theme inline` block that registers each token with
   Tailwind (`--color-primary: var(--primary)`, `--radius-md: calc(var(--radius) - 2px)`).
   `index.css` then adds a CSS `@layer base` block: every element takes the `border` token as its
   border colour and the `ring` token at half opacity as its outline colour, and `body` gets
   `min-h-dvh bg-background text-foreground antialiased`.
2. **Only the classes found in `src/` are emitted.** Tailwind reads every file under `src/` as text —
   test files included — and emits a rule for each string that names a real utility. The output is a
   single `index-*.css`, linked from `index.html` and shared by every route; no route chunk carries
   CSS of its own.
3. **A primitive turns props into a class string.** When `HomePage` renders its `Button`, `Button`
   fills in `variant` and `size` as `'default'`, asks `buttonVariants` — a function built with CVA
   (class-variance-authority) — for the base classes plus the chosen variant's and size's classes
   plus the caller's `className`, and passes the result through `cn`, which runs clsx and then
   tailwind-merge so that a caller's utility replaces the conflicting default instead of sitting
   beside it. It renders a `<button type="button">` with those classes and three styling
   hooks: `data-slot="button"`, `data-variant` and `data-size`. With `asChild`, it renders Radix's
   `Slot.Root` instead, which merges the classes and hooks into its single child element, so a link
   stays a link. `Input` and `Label` work the same way with a fixed class list and no variants.
4. **The browser resolves tokens when it paints.** Because the theme block is `inline`, each token
   utility compiles to a direct variable reference — the build emits
   `.bg-primary{background-color:var(--primary)}` — so an element paints with whichever token set
   applies to it: `:root` today, the `.dark` set beneath an ancestor carrying the `dark` class.
   Interaction states are CSS on the same class list: `hover:`, `focus-visible:` (the `ring` colour
   on the border plus a 3px ring at half opacity), `disabled:` (no pointer events, half opacity) and
   `aria-invalid:` (a `destructive` border, kept while focused, and a `destructive` tint on the focus
   ring). The last is how `TextField` shows an invalid field: it sets `aria-invalid` on `Input`, and
   the styling follows. `TextField` belongs to the form _seam_ — _seam_ and _port_ are this repo's
   two names for one idea, a type that consumers program against while the concrete behind
   it is chosen elsewhere ([Composition root](./composition-root.md) covers the pattern; the form
   seam itself is [Forms](./forms.md)).

**Failure paths.**

- _A bare `Button` inside a `<form>`._ It renders `type="button"`, so activating it does not submit —
  the one place `Button` deliberately differs from a native `<button>`, whose default type is
  `submit`. A submit control passes `type="submit"`; in a form built on the form seam,
  `form.SubmitButton` already does.
- _`asChild` without exactly one element child._ Radix's `Slot` throws during render when it is given
  children that are not a single React element. `ButtonProps` narrows `children` to `ReactElement`
  in the `asChild` branch, so a literal `<Button asChild>Docs</Button>` is a type error before it can
  throw.
- _A class that is not a utility._ A misspelt class, or one naming a token that does not exist,
  compiles to nothing: Tailwind emits no rule, no gate reports it, and the element is silently
  unstyled. `eslint.config.js` loads no Tailwind plugin, and the Prettier plugin sorts class names
  without validating them.

## Architecture

In Feature-Sliced Design (FSD) a _layer_ is a top-level folder under `src/` — `app`, `pages`,
`widgets`, `features`, `entities`, `shared`, top to bottom — and a module imports only from the
layers below its own; a _slice_ is one screen, reusable block or business noun inside a layer
(`pages/home`, `widgets/app-header`, `entities/user`); a _segment_ is a purpose-named folder holding
one kind of code (`ui/` for components, `lib/` for helpers, `model/`, `api/`); and a _public API_ is
an `index.ts` barrel, the only file other modules may import through. The kit lives in `shared`, the
bottom layer, and every layer above it draws on it: `app`, `pages` and `features` import its groups
directly, while `widgets` — the layer this repository opened with `widgets/app-header` — reaches
them one step removed, by composing the `features/switch-locale` slice that renders the `Button`s.
`shared` is divided into segments and has no slices; its `ui` and `lib` segments are divided further
into _groups_, one folder per primitive or helper, and each group's `index.ts` barrel is its public
API: the only path other modules may import (`@/shared/ui/button`, never a file inside the group and
never the bare `@/shared/ui`). The kit defines no runtime port and needs no provider. Its contract
with consumers is those barrels plus a vocabulary of token names that components consume as class
strings; the concretes behind it — Radix's `Slot` and `Label` from the `radix-ui` package, CVA, clsx
and tailwind-merge — are imported directly inside the groups, and Tailwind v4 is a build-time
compiler. The _composition root_ (`src/app/entrypoint/**`, where the app constructs its concretes
and binds them to seams; see [Composition root](./composition-root.md)) therefore binds nothing
here: its one part is `app.tsx` importing the global stylesheet. Dependencies point downward in both
languages — `app/styles/index.css` imports `shared/ui/theme.css`, the primitives import
`@/shared/lib/cn`, and consumers import the primitives' barrels — and the one edge no tool sees, a
class name such as `bg-primary` tying a component to a token, points downward too, because the
tokens live in `shared` (see [Design decisions](#design-decisions--trade-offs)). `eslint.config.js`
enforces the group paths with `no-restricted-imports` patterns;
[Architecture boundaries](./architecture-boundaries.md) covers those fences.

In the table below, the `Layer` column names a module's layer and, where it helps, its segment
(`shared/ui`, `app/entrypoint`) or its slice and segment (`pages/home · ui` is the `ui` segment of
the `pages/home` slice). `outside layers` marks a file that sits outside the `src/` hierarchy the
layers describe — for this feature, the root configuration files that compile, sort and generate its
code; the same value covers `src/main.tsx` and `e2e/`, which belong to no layer either.

| Component                                   | Layer                         | Responsibility                                                                                                                                                                                                                              | File                                                                        |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Token sets, `dark` variant, `@theme inline` | `shared/ui`                   | Imports Tailwind with detection scoped to `src/`, declares the light (`:root`) and dark (`.dark`) tokens, redefines `dark:` and registers the tokens as Tailwind theme values                                                               | `src/shared/ui/theme.css`                                                   |
| Global stylesheet                           | `app/styles`                  | Imports the theme by relative path and adds the base layer: token border and outline colours on every element, page background and text colour on `body`                                                                                    | `src/app/styles/index.css`                                                  |
| `App`                                       | `app/entrypoint`              | Loads the stylesheet with a side-effect import at bootstrap                                                                                                                                                                                 | `src/app/entrypoint/app.tsx`                                                |
| `Button`, `ButtonProps`                     | `shared/ui/button`            | A `<button type="button">` or, with `asChild`, a Radix `Slot.Root`, carrying `buttonVariants` classes resolved through `cn` and the `data-slot`, `data-variant` and `data-size` hooks                                                       | `src/shared/ui/button/button.tsx`                                           |
| `buttonVariants`                            | `shared/ui/button`            | The CVA class map: base classes, six variants, eight sizes, `default` for both                                                                                                                                                              | `src/shared/ui/button/button-variants.ts`                                   |
| `Input`, `InputProps`                       | `shared/ui/input`             | An `<input>` defaulting to `type="text"`, styled inline, with focus, disabled and `aria-invalid` states                                                                                                                                     | `src/shared/ui/input/input.tsx`                                             |
| `Label`, `LabelProps`                       | `shared/ui/label`             | Radix's `Label.Root` — a `<label>` — with the kit's text classes                                                                                                                                                                            | `src/shared/ui/label/label.tsx`                                             |
| `cn`                                        | `shared/lib/cn`               | `twMerge(clsx(inputs))`: conditional class composition with Tailwind conflict resolution                                                                                                                                                    | `src/shared/lib/cn/cn.ts`                                                   |
| `tailwindcss()`                             | `outside layers`              | The `@tailwindcss/vite` plugin that compiles the stylesheet, registered in every mode                                                                                                                                                       | `vite.config.ts`                                                            |
| Tailwind Prettier options                   | `outside layers`              | Loads `prettier-plugin-tailwindcss` and points it at the entry stylesheet and at the `cn` and `cva` calls it sorts                                                                                                                          | `.prettierrc.json`                                                          |
| shadcn CLI settings                         | `outside layers`              | Tells the registry CLI where the tokens live and which groups its components and `cn` import map to                                                                                                                                         | `components.json`                                                           |
| `baseUrl`, `paths`                          | `outside layers`              | A root-level `@/*` alias for the shadcn CLI; `tsc -b` compiles nothing from this solution-style file                                                                                                                                        | `tsconfig.json`                                                             |
| Group import patterns                       | `outside layers`              | Ban a bare `@/shared/ui` or `@/shared/lib` import and any import of a file inside a group                                                                                                                                                   | `eslint.config.js`                                                          |
| `AppCrashFallback`                          | `app/entrypoint`              | Consumer: the crash screen's retry `Button`, which is why `Button` ships in the eager bundle (see [Error handling and reporting](./error-handling.md))                                                                                      | `src/app/entrypoint/app-crash-fallback.tsx`                                 |
| `HomePage`                                  | `pages/home · ui`             | Consumer: the home screen's `Button` and token text colours                                                                                                                                                                                 | `src/pages/home/ui/home-page.tsx`                                           |
| `AppHeader`                                 | `widgets/app-header · ui`     | Consumer at one remove: the app-shell banner `__root.tsx` mounts above the `<Outlet />`, composing `LocaleSwitcher` and so putting the kit's `Button` on every route; it imports no primitive itself (see [App shell](./app-shell.md))      | `src/widgets/app-header/ui/app-header.tsx`                                  |
| `LocaleSwitcher`                            | `features/switch-locale · ui` | Consumer: one `size="sm"` `Button` per supported locale — the kit's only caller of a non-default size — with `variant` switched between `default` (active) and `outline` (inactive) (see [Internationalization](./internationalization.md)) | `src/features/switch-locale/ui/locale-switcher.tsx`                         |
| `SignOutButtonView`                         | `features/sign-out · ui`      | Consumer: the profile screen's sign-out control, fixed to `variant="outline"`; internal to the slice, which exports `SignOutButton`                                                                                                         | `src/features/sign-out/ui/sign-out-button-view.tsx`                         |
| `SubmitButton`, `TextField`                 | `shared/ui/form`              | Consumers: the form seam's submit control is a `Button`; its text field renders `Label` and `Input` (see [Forms](./forms.md))                                                                                                               | `src/shared/ui/form/submit-button.tsx`, `src/shared/ui/form/text-field.tsx` |

## Public surface

The design system serves no route of its own. The base layer in `index.css` styles every screen, and
`AppHeader` — the `widgets/app-header` banner that `src/app/routes/__root.tsx` mounts above the
`<Outlet />` — puts `LocaleSwitcher`'s row of `Button`s at the top of every route, the kit's first
component to render on every screen. Each route then adds its own:

| Path               | Auth                     | Purpose                                                                                                                                                                             |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every route        | public and authenticated | `LocaleSwitcher`, inside the `AppHeader` banner, renders one `size="sm"` `Button` per supported locale: `variant="default"` for the active locale, `variant="outline"` for the rest |
| `/`                | public                   | `HomePage` renders a `Button` below the header                                                                                                                                      |
| `/sign-in`         | public                   | The sign-in form renders `Label` and `Input` through `field.TextField`, and a `Button` through `form.SubmitButton`                                                                  |
| `/users/$userId`   | authenticated            | `SignOutButtonView` renders a `Button` with `variant="outline"` above the profile content, and the name form renders the same components once the profile has loaded                |
| anything unmatched | public                   | `NotFoundPage`, the root route's `notFoundComponent`, renders no primitive of its own, so the header's locale `Button`s are the only kit components on the screen                   |

Outside the route tree, `AppCrashFallback` renders a `Button` when the root error boundary catches a
crash — in place of the whole tree, header included, because the boundary in
`src/app/entrypoint/app.tsx` wraps the router.

Four group barrels are the whole programmatic contract:

| Group                  | Import path          | Exports                                        |
| ---------------------- | -------------------- | ---------------------------------------------- |
| `src/shared/ui/button` | `@/shared/ui/button` | `Button`, `buttonVariants`, type `ButtonProps` |
| `src/shared/ui/input`  | `@/shared/ui/input`  | `Input`, type `InputProps`                     |
| `src/shared/ui/label`  | `@/shared/ui/label`  | `Label`, type `LabelProps`                     |
| `src/shared/lib/cn`    | `@/shared/lib/cn`    | `cn`                                           |

**`Button`** takes `ButtonProps`, a union discriminated on `asChild`:

```ts
export type ButtonProps = VariantProps<typeof buttonVariants> &
  (
    | ({ asChild?: false | undefined } & ComponentProps<'button'>)
    | ({ asChild: true } & Omit<ComponentProps<typeof Slot.Root>, 'children'> & {
          children: ReactElement;
        })
  );
```

| Prop        | Values                                                                               | Default     | Effect                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant`   | `'default'`, `'destructive'`, `'outline'`, `'secondary'`, `'ghost'`, `'link'`        | `'default'` | Colour treatment; echoed in `data-variant`                                                                                                                                                                                                               |
| `size`      | `'default'`, `'xs'`, `'sm'`, `'lg'`, `'icon'`, `'icon-xs'`, `'icon-sm'`, `'icon-lg'` | `'default'` | Height and padding (`h-9 px-4 py-2` by default); the four `icon` sizes are square; echoed in `data-size`                                                                                                                                                 |
| `asChild`   | `true`, or `false` / absent                                                          | absent      | `true` renders the single child element, carrying the button's classes and hooks, instead of a `<button>`. The other props become `Slot.Root`'s — HTML attributes, with no `disabled`, `type` or `href` — so element-specific attributes go on the child |
| `type`      | the native attribute                                                                 | `'button'`  | Without `asChild` only                                                                                                                                                                                                                                   |
| `className` | a class string                                                                       | none        | Merged through `cn`, so it wins a conflict with a variant or size class                                                                                                                                                                                  |

Every other prop of the chosen branch is forwarded to the element. `VariantProps` also admits `null`
for `variant` and `size`: CVA then emits none of that dimension's classes, and React omits the
`null` data attribute.

**`buttonVariants`** is the CVA function behind `Button`: called with an optional
`{ variant, size, className }` (or `class`), it returns the class string. It appends `className`
without resolving conflicts, so wrap the call in `cn` to override a variant class. It is exported
for an element that needs the button's look without rendering through `Button`; nothing outside the
group calls it today.

**`Input`** takes `InputProps`, which is `ComponentProps<'input'>`: every native input prop,
forwarded. `type` defaults to `'text'`, `className` is merged through `cn`, and the element carries
`data-slot="input"`. It is `h-9` and full width, with `text-base` below the `md` breakpoint and
`text-sm` from it; `aria-invalid` turns its border and focus ring `destructive`.

**`Label`** takes `LabelProps`, which is `ComponentProps<typeof LabelPrimitive.Root>` — Radix's
label props. It renders a `<label data-slot="label">`; associate it with a control through `htmlFor`
and the control's `id`. Radix cancels the text selection a double-click on the label would start,
unless the click lands on a nested button, input, select or textarea.

**`cn(...inputs: ClassValue[]): string`** accepts anything clsx accepts — strings, `false`, `null`,
`undefined`, arrays and `{ 'p-8': isWide }` objects — joins the truthy classes, and resolves
Tailwind conflicts in favour of the last: `cn('px-2', 'px-4')` returns `'px-4'`.

**Tokens.** Each colour token is a pair of declarations — one on `:root`, one on `.dark` —
registered in `@theme inline` as `--color-<name>`, which gives every colour utility family
(`bg-`, `text-`, `border-`, `ring-`, `outline-` and the rest) a `<name>` value, with an opacity
modifier where one is needed (`ring-ring/50`). The colours are OKLCH and neutral (zero chroma)
except `destructive`.

| Token                                                      | Utilities                                                                                                | Used for today                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `background`, `foreground`                                 | `bg-background`, `text-foreground`                                                                       | Page surface and text (the `body` base rule); the `outline` button's surface                                        |
| `primary`, `primary-foreground`                            | `bg-primary`, `text-primary-foreground`, `text-primary`                                                  | The `default` button; `link` variant text; text selection inside `Input`                                            |
| `secondary`, `secondary-foreground`                        | `bg-secondary`, `text-secondary-foreground`                                                              | The `secondary` button variant                                                                                      |
| `muted`, `muted-foreground`                                | `text-muted-foreground`, `placeholder:text-muted-foreground`                                             | Secondary copy: descriptions, input placeholders, the profile view's field names; `bg-muted` has no consumer        |
| `accent`, `accent-foreground`                              | `hover:bg-accent`, `hover:text-accent-foreground`                                                        | Hover surface of the `outline` and `ghost` variants                                                                 |
| `destructive`                                              | `text-destructive`, `bg-destructive`, `aria-invalid:border-destructive`                                  | Error text, invalid controls, the `destructive` variant                                                             |
| `border`                                                   | `border-border`                                                                                          | Default border colour of every element, set in the base layer                                                       |
| `input`                                                    | `border-input`                                                                                           | `Input`'s border; the `outline` variant's surfaces under `.dark`                                                    |
| `ring`                                                     | `focus-visible:border-ring`, `focus-visible:ring-ring/50`, `outline-ring`                                | Focus indicators, and every element's default outline colour at half opacity                                        |
| `card`, `card-foreground`, `popover`, `popover-foreground` | `bg-card`, `text-popover-foreground`                                                                     | No consumer yet                                                                                                     |
| `--radius` (`0.625rem`)                                    | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`: the radius minus 4px, minus 2px, as is, plus 4px | `rounded-md`, on `Button` and `Input`                                                                               |
| `--font-sans`                                              | Tailwind's default font family                                                                           | All text: the system stack `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, so no web font is downloaded |

**Variant and hooks.** `dark:` is redefined as `@custom-variant dark (&:is(.dark *))`: it matches an
element beneath an ancestor with the `dark` class, instead of Tailwind's default
`prefers-color-scheme: dark` media query. `data-slot` on all three primitives, and `data-variant`
and `data-size` on `Button`, are styling hooks a parent can select — `[data-slot='button']`,
`[data-variant='outline']` — without reaching into the component. No stylesheet or component
selects them yet; the tests read `data-variant` and `data-size`.

## Configuration

The kit reads no `VITE_*` variable and takes nothing from the composition root. Its settings live in
the theme, in tool configuration and in the component defaults:

| Variable / option                                        | Default                                                                                                | Meaning                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source()` on `@import 'tailwindcss'` (`theme.css`)      | `'../../'`, which resolves to `src/`                                                                   | Where Tailwind looks for class names. Without it, Tailwind v4 scans every non-ignored file from the project root, `README.md` and `docs/` included            |
| `@custom-variant dark` (`theme.css`)                     | `(&:is(.dark *))`                                                                                      | What `dark:` utilities match: a `.dark` ancestor, not the operating-system preference                                                                         |
| `dark` class name (`theme.css`)                          | `dark`                                                                                                 | The one literal the kit owns and `shared/theme` mirrors in `DARK_THEME_CLASS_NAME`; the storage key and media query belong to the composition root instead    |
| `color-scheme` (`theme.css`)                             | `light` on `:root`, `dark` on `.dark`                                                                  | The scheme native controls and scrollbars use, bound to the active token set                                                                                  |
| `--radius` (`theme.css`)                                 | `0.625rem`                                                                                             | Base corner radius; `--radius-sm`, `--radius-md`, `--radius-lg` and `--radius-xl` derive from it                                                              |
| `--font-sans` (`theme.css`)                              | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`                                             | Default font family                                                                                                                                           |
| `tailwindcss()` (`vite.config.ts`)                       | registered in every mode                                                                               | Compiles `src/app/styles/index.css`                                                                                                                           |
| `plugins` (`.prettierrc.json`)                           | `["prettier-plugin-tailwindcss"]`                                                                      | Sorts utility classes whenever Prettier writes — `npm run format` and the pre-commit hook — and makes `npm run format:check` fail on an unsorted class string |
| `tailwindStylesheet` (`.prettierrc.json`)                | `./src/app/styles/index.css`                                                                           | The entry the plugin loads to learn the theme, and with it the sort order                                                                                     |
| `tailwindFunctions` (`.prettierrc.json`)                 | `["cn", "cva"]`                                                                                        | Calls whose string arguments are sorted like a `className`                                                                                                    |
| `style`, `tailwind.baseColor` (`components.json`)        | `new-york`, `neutral`                                                                                  | The registry style and palette `shadcn add` draws from                                                                                                        |
| `tailwind.css` (`components.json`)                       | `src/shared/ui/theme.css`                                                                              | The stylesheet the CLI treats as the theme, where it writes a component's CSS variables                                                                       |
| `tailwind.cssVariables` (`components.json`)              | `true`                                                                                                 | Registry components are themed through the token utilities rather than literal palette classes                                                                |
| `tailwind.config`, `tailwind.prefix` (`components.json`) | `""`, `""`                                                                                             | No JavaScript config — Tailwind v4 is configured in CSS — and unprefixed utilities                                                                            |
| `rsc`, `tsx` (`components.json`)                         | `false`, `true`                                                                                        | No `"use client"` directive in generated files; TypeScript output                                                                                             |
| `aliases` (`components.json`)                            | `components` and `ui` → `@/shared/ui`; `utils` → `@/shared/lib/cn`; `lib` and `hooks` → `@/shared/lib` | Where the CLI writes files and which `cn` import it emits                                                                                                     |
| `iconLibrary` (`components.json`)                        | `lucide`                                                                                               | The icon package registry components import — not installed (see [Known limitations](#known-limitations))                                                     |
| `baseUrl`, `paths` (`tsconfig.json`)                     | `.`, `{ "@/*": ["./src/*"] }`                                                                          | The alias the shadcn CLI resolves `@/` with                                                                                                                   |
| `variant`, `size` (`Button`)                             | `'default'`, `'default'`                                                                               | Also `buttonVariants`' `defaultVariants`                                                                                                                      |
| `type` (`Button`)                                        | `'button'`                                                                                             | The native `type` when `asChild` is not set                                                                                                                   |
| `type` (`Input`)                                         | `'text'`                                                                                               | The native `type`                                                                                                                                             |

## Usage & extension

### Style a component with the kit

- Import a primitive by its group path — `@/shared/ui/button`, never `@/shared/ui/button/button` or
  the bare `@/shared/ui`; `npm run lint` rejects both.
- Colour with token utilities (`bg-primary`, `text-muted-foreground`, `border-input`), never palette
  literals such as `bg-neutral-900` or `text-[#171717]`. A colour the tokens lack becomes a token
  first.
- Pass layout and overrides through `className`. The primitives merge it with `cn`, so
  `className="w-full"` adds to the defaults and `className="px-8"` replaces the conflicting `px-4`
  instead of competing with it.
- Give every submitting `Button` an explicit `type="submit"`. Inside a form built on `useAppForm`,
  use `form.SubmitButton` and `field.TextField` rather than raw `Button`, `Input` and `Label`: the
  form seam wires the ARIA attributes and the pending state (see [Forms](./forms.md)).
- To give a link the look of a button, wrap it in `<Button asChild>`: the element stays a link, with
  its role, `href` and keyboard behaviour, and takes the button's classes. Put extra classes on
  `Button`, not on the child — `Slot` joins the child's `className` after its own without resolving
  conflicts.

`NotFoundPage` (`src/pages/not-found/ui/not-found-page.tsx`) renders no class at all today. Rebuilt
with the kit, as below, its link keeps the role and name that `e2e/app-shell.spec.ts` looks up —
`getByRole('link', { name: 'Back to home' })`. `Link` is the one `@tanstack/react-router` export a
module below `app` may import (see [Routing](./routing.md)).

```tsx
import { Link } from '@tanstack/react-router';

import { useTranslation } from '@/shared/i18n';
import { Button } from '@/shared/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('notFound.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('notFound.description')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('notFound.backToHome')}</Link>
      </Button>
    </main>
  );
}
```

### Add a semantic token

A token is three edits to `src/shared/ui/theme.css`. Add the declarations to the existing blocks
rather than to new ones, so each set stays readable in one place. A `success` pair, for example —
first into `:root`:

```css
:root {
  --success: oklch(0.5 0.13 150);
  --success-foreground: oklch(0.985 0 0);
}
```

then into `.dark`:

```css
.dark {
  --success: oklch(0.72 0.15 150);
  --success-foreground: oklch(0.145 0 0);
}
```

and into `@theme inline`, which is what creates the utilities:

```css
@theme inline {
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
}
```

`bg-success`, `text-success-foreground`, `border-success` and the rest of the family now exist, and
the build emits `.bg-success{background-color:var(--success)}`. The example pairs measure 5.4:1
(light) and 8.5:1 (dark) by the WCAG contrast formula. No gate measures colour, so measure a new pair
before committing it; 4.5:1 is the minimum for text.

### Add a primitive

A primitive is a group folder under `src/shared/ui` with its component, its tests and an `index.ts`.
The walkthrough adds a hypothetical `Badge` with variants, one of them on the `success` token above.

**Step 1 — the class map,** in `src/shared/ui/badge/badge-variants.ts`. It sits in a `.ts` file
beside the component (see [Design decisions](#design-decisions--trade-offs)).

```ts
import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-success text-success-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
```

Every variant keeps the base's 1px border, so all four badges have the same box. `outline` gives it
the `border` token's colour; CVA only concatenates, so both `border-transparent` and `border-border`
reach the component, and the `cn` call in step 2 drops the first.

**Step 2 — the component,** in `src/shared/ui/badge/badge.tsx`: a named `BadgeProps` type, the
caller's class merged through `cn`, and the same hooks `Button` exposes.

```tsx
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';

import { badgeVariants } from './badge-variants';

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, className }))}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
}
```

**Step 3 — the public API,** in `src/shared/ui/badge/index.ts`. Export the class map too only when
an element outside the group needs the look, as `buttonVariants` is.

```ts
export { Badge } from './badge';
export type { BadgeProps } from './badge';
```

**Step 4 — the tests,** in `src/shared/ui/badge/badge.test.tsx`, pinning the default, the agreement
between hook and classes, and the override — the three contracts `button.test.tsx` pins for `Button`.

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('exposes the resolved variant as a styling hook', () => {
    render(<Badge>New</Badge>);

    expect(screen.getByText('New')).toHaveAttribute('data-variant', 'default');
  });

  it('keeps the data attribute and the emitted classes in agreement', () => {
    render(<Badge variant="success">Paid</Badge>);

    const badge = screen.getByText('Paid');
    expect(badge).toHaveAttribute('data-variant', 'success');
    expect(badge).toHaveClass('bg-success');
  });

  it('resolves a caller class against the base class instead of concatenating', () => {
    render(<Badge className="px-3">Beta</Badge>);

    const badge = screen.getByText('Beta');
    expect(badge).toHaveClass('px-3');
    expect(badge).not.toHaveClass('px-2');
  });
});
```

Then run `npx vitest run src/shared/ui/badge`, `npm run lint`, `npm run arch` (steiger rejects a
`shared/ui` folder without an `index.ts`) and `npm run format` (which sorts the new classes), or
`npm run audit` for every gate at once. Land a primitive in the same change as its first consumer:
exported and tested but rendered by nothing, it is dormant plumbing — yet its classes ship in
`index.css` from the moment the file exists.

A primitive without variants skips step 1 and styles its element inline with `cn`, as `Input` and
`Label` do.

### Add a variant or size to an existing primitive

Add a key to the `variant` or `size` map in `src/shared/ui/button/button-variants.ts` — for
instance `success: 'bg-success text-success-foreground hover:bg-success/90'` once the token exists.
`ButtonProps` derives its unions from the map through `VariantProps<typeof buttonVariants>`, so
`<Button variant="success">` type-checks at once and renders `data-variant="success"`; the
`defaultVariants` entry and the destructuring defaults in `button.tsx` stay `'default'`. Add a case
to `button.test.tsx` in the shape of "keeps the data attribute and the emitted classes in
agreement". A primitive with no map yet (`Input`, `Label`) gets its `*-variants.ts` with its second
variant: the inline classes become the `cva` base, and the variants sit beside them, as in
`badge-variants.ts`.

### Pull a component from the shadcn registry

The shadcn CLI is not a project dependency: `npx shadcn@latest add <component>` downloads it and
needs the network. It writes registry code that has to be brought into this repository's shape by
hand.

1. Run `npx shadcn@latest add badge`. With the aliases in `components.json`, the component lands as
   a flat file, `src/shared/ui/badge.tsx`.
2. Move it into a group: `src/shared/ui/badge/badge.tsx` plus an `index.ts` that re-exports the
   component and its props type. A flat file escapes the public-API rule, because steiger ignores
   loose files in `shared/ui`. A hook the CLI writes lands flat in `src/shared/lib` (the `hooks`
   alias) and moves into a group folder the same way.
3. Normalise it to house style: a named export and an exported `…Props` type; `import type` for
   types; `cn` from `@/shared/lib/cn` (`npm run lint` flags a deep path such as
   `@/shared/lib/cn/index`); Radix from `radix-ui`, the only Radix package in `package.json`; any
   `cva` map moved into a `*-variants.ts`; literal palette classes replaced with tokens; and
   `type = 'button'` as the default of any native `<button>`.
4. If the component brings CSS variables, check that each landed in the `:root`, `.dark` and
   `@theme inline` blocks of `theme.css`, as in [Add a semantic token](#add-a-semantic-token). If it
   imports `lucide-react`, that package has to be installed first (see
   [Known limitations](#known-limitations)).
5. Run `ls src/shared/ui/*.tsx`; it must print nothing. The commit that introduced the kit
   (`59a4d2c`) records that adding a component which depends on an existing primitive re-emits that
   primitive as a flat file — `shadcn add sidebar` writes `src/shared/ui/button.tsx` beside
   `src/shared/ui/button/` — and a flat file wins module resolution over the folder's `index.ts`,
   reverting the barrel, the `cn` import and the `type` default. steiger passes with both present,
   and the deep-import ban cannot see the swap because the import path does not change (see
   [Architecture boundaries](./architecture-boundaries.md)). Delete the flat file.
6. Add the co-located test and run the gates, as in [Add a primitive](#add-a-primitive).

### Switch the theme

The `dark` class on an ancestor of the content — in this app always `<html>` — drives both
mechanisms at once: the `.dark` block redefines every colour token, which the cascade carries to its
descendants, and every `dark:` utility starts to match. The variant matches descendants only
(`:is(.dark *)`), so a `dark:` utility on the element that carries the class does not apply to that
element.

Nothing in the kit puts the class there. `shared/theme` does, and it is the only thing that should —
read and change the theme through its hook rather than touching `classList` yourself:

```tsx
import { useTheme } from '@/shared/theme';

const { preference, resolved, setPreference } = useTheme();
```

`preference` is `'system' | 'light' | 'dark'` and `resolved` is the `'light' | 'dark'` the page is
actually painting. Setting a preference persists it and re-paints; leaving it at `'system'` follows
the operating system live. See [Composition root](./composition-root.md) for how the seam is wired
and how `index.html` paints the first frame before React exists.

**Do not set `<html>`'s class or `style.colorScheme` directly.** An inline `style` on `<html>`
outranks every rule in `theme.css`, where `color-scheme` is declared without `!important` on both
`:root` and `.dark`. Toggle the class alone and the browser's own canvas, scrollbars, `<select>`
popups and date pickers stay pinned to whatever scheme was set at load: the page goes dark while
the native chrome stays light. That is why applying a theme is one operation in this codebase —
`createDocumentThemeApplier` always writes both — and why `src/app/entrypoint/theme-bootstrap.test.ts`
holds the two implementations to byte-identical output.

## Design decisions & trade-offs

- **Vendored shadcn/ui on Tailwind v4, not a component library.** The shadcn CLI copies component
  source into the repository and is not a runtime dependency. That is the decisive property: FSD
  needs the code in `shared/ui`, behind this repository's public-API and lint rules, and a packaged
  library's components cannot be placed in a layer. MUI and Ant Design were rejected for exactly
  that reason. CSS Modules alone offer no variant system and no token pipeline, and Tailwind v3
  would have needed a JavaScript config and `tailwindcss-animate`, both superseded by v4's CSS-first
  `@theme`. Radix supplies the behaviour underneath — `Slot`'s prop merging and `Label`'s selection
  handling today. The cost of owning the source is that registry fixes do not arrive with a
  dependency update; a primitive is re-pulled and re-normalised by hand.
- **Tokens live in `shared/ui/theme.css`, not in `app/styles`.** `Button`'s `bg-primary` and
  `rounded-md` resolve to `--primary` and `--radius`. Declared in `app`, the tokens would make
  `shared` depend on a higher layer through a channel neither steiger nor ESLint can see, because
  the dependency travels in CSS strings rather than in the import graph. `app/styles/index.css`
  keeps only what a composition root should do: activate the system for the document and apply the
  base layer. `theme.css` is a loose file rather than a group folder because steiger's
  `fsd/public-api` rule reports a `shared/ui` folder without an `index.ts` ("This top-level folder
  in shared/ui is missing a public API") but ignores loose files, and a barrel beside a stylesheet
  that is reached through a CSS `@import` would be dead code.
- **Tokens are registered `inline`.** `@theme inline` makes each utility reference the raw token,
  `var(--primary)`, instead of an intermediate `--color-primary` custom property. A plain `@theme`
  would declare `--color-primary: var(--primary)` on `:root`, where the `var()` is resolved once and
  then inherited as a finished value, so a `.dark` set on an element below `:root` could never reach
  it. The consequence for authors: the `--color-*` names do not exist at runtime, so an arbitrary
  value or inline style reads `var(--primary)`, never `var(--color-primary)`.
- **`dark:` follows a class, not the operating system.** The `.dark` token set is scoped to a class,
  so `@custom-variant dark (&:is(.dark *))` puts the `dark:` utilities on the same switch. Under
  Tailwind's default media-query variant, a visitor whose system prefers dark would get
  `dark:bg-input/30` and `dark:bg-destructive/60` layered over the light tokens.
- **`color-scheme` is bound to each token set.** `:root` declares `light` and `.dark` declares
  `dark`, instead of `color-scheme: light dark` on the root. The latter lets the browser draw dark
  scrollbars and native controls around a light page for a visitor whose system prefers dark, which
  is exactly the mismatch the bound declarations avoid. Neither declaration carries `!important`, so
  an inline `style` on `<html>` outranks both — which is why the only writer of that inline style,
  `createDocumentThemeApplier`, sets it on every application rather than only at boot, and why it
  moves the class and the scheme together (see [Switch the theme](#switch-the-theme)).
- **`--ring` is darker than the registry's.** `oklch(0.45 0 0)` measures 7.4:1 against white, where
  the registry's value measures 2.59:1 — below the 3:1 that WCAG 2.2 success criterion 1.4.11
  requires of a focus indicator. The indicator it protects is the 1px `focus-visible:border-ring` on
  a bordered control (`Input`, the `outline` variant); the 3px `ring-ring/50` halo was judged
  decorative. No gate can see colour, so nothing would have caught the registry's value. The
  borderless variants are the gap (see [Known limitations](#known-limitations)).
- **The locale switcher marks its selection with `default` over `outline`, not `secondary` over
  `ghost`.** `LocaleSwitcher` asks for a `variant` in both directions —
  `variant={isActive ? 'default' : 'outline'}` — where the obvious pairing for a selected chip would
  be `secondary` over `ghost`. That pairing fails in this theme: `--secondary` is `oklch(0.97 0 0)`
  against a `--background` of `oklch(1 0 0)`, about 1.09:1, far below the 3:1 that WCAG 2.2 success
  criterion 1.4.11 (Non-text Contrast) requires of a control's state, so the selected language would
  be effectively invisible to a sighted user and `aria-pressed` would carry the selection for
  assistive technology alone. `default` is `bg-primary`, about 18:1 against the same background, and
  `outline` gives the unselected locales a visible box without a fill. The cost is geometric:
  `outline` carries a border that `default` does not, so an unselected button is about two pixels
  wider than the selected one and the row's controls shift by that much as the selection moves.
- **Three corrections to the registry's `Button`.** First, `type` defaults to `'button'`: the
  registry sets none, so a bare `<Button>` inside a `<form>` would be `type="submit"` and submit it;
  `button.test.tsx` pins the inversion. Second, `ButtonProps` is a discriminated union on `asChild`.
  The registry's `ComponentProps<'button'> & { asChild?: boolean }` lets
  `<Button asChild disabled><a /></Button>` type-check and render `<a disabled>`: the link stays
  focusable and clickable, and `disabled:pointer-events-none` never matches, because `:disabled`
  does not apply to a link. The union rejects `disabled` and `type` wherever `asChild` is the literal
  `true`; an `asChild` typed `boolean` still gets through, a limit of TypeScript's narrowing. Third,
  `children` narrows to `ReactElement` in the `asChild` branch — what `Slot` requires at runtime —
  instead of the stock `ReactNode`.
- **A pending action outside a form repeats the triple rather than reusing `SubmitButton`.**
  `SubmitButton` reads its pending state from `useFormContext()` through a `form.Subscribe` on
  `state.isSubmitting`, so it renders only inside a `useAppForm` tree ([Forms](./forms.md)).
  `SignOutButtonView` has no form — one control over one mutation — so it carries the same three
  pending signals on a plain `Button` itself: `aria-busy`, `disabled` and a label swapped from
  `signOut.action` to `signOut.inProgress`. It also stops short of `SubmitButton`'s prop spread:
  `SubmitButtonProps` is `PlainButtonProps` minus the four props the form owns (`aria-busy`,
  `asChild`, `children`, `type`) and forwards `...buttonProps`, so a caller may choose a `variant`,
  while `SignOutButtonView` accepts only `isSigningOut` and `onSignOut` and fixes
  `variant="outline"`, because no caller needs a different one yet. The cost is that the pending
  triple now lives in two places; a third would be the trigger to lift it into `shared/ui`.
- **Variants live in a sibling `*-variants.ts`, and only where there are variants.**
  `react-refresh/only-export-components` rejects a non-component export from a component file, and
  the `vite` preset's `allowConstantExport` admits only literal-like initialisers, which a `cva()`
  call is not. The rule scans only `.jsx` and `.tsx` files, so moving the map into
  `button-variants.ts` satisfies it without a disable comment. It is also the right split: a class
  map is design data, and `buttonVariants` is exported so an element that is not a `Button` can
  borrow the look. `Input` and `Label` have no variants and no `cva` wrapper — an empty one would be
  abstraction with no second case — so a primitive gains the file with its second variant.
- **`cn` resolves conflicts instead of concatenating.** Concatenation leaves `px-4 px-8` on the
  element, and the stylesheet's rule order, not the caller's intent, decides which wins. `cn` runs
  tailwind-merge after clsx, so the last conflicting utility survives; `button.test.tsx`,
  `input.test.tsx` and `label.test.tsx` each pin that a caller's class replaces the default. The
  price was about 7 kB gzip of tailwind-merge, measured when the kit landed (`59a4d2c`). `Slot` does
  not use it: in `asChild` mode the child's own `className` is joined, not merged.
- **`Label` omits the registry's `peer-disabled:` classes.** They need a preceding sibling marked
  `peer`, and `Label` renders before its control, so they would never match — and they would encode
  an assumption about markup `Label` does not control.
- **`Input` keeps 16px text on narrow screens.** `text-base` applies below the `md` breakpoint and
  `md:text-sm` above it: iOS Safari zooms the page when a focused input's text is smaller than 16px.
- **Class detection is scoped to `src/`.** Without `source('../../')`, Tailwind v4 scans every
  non-ignored file from the project root, and the prose in `README.md` was minting utilities such as
  `.container`, `.transition` and `.uppercase` that no component used — 1.25 kB raw / 0.22 kB gzip
  of dead CSS — while the stylesheet's size moved with every documentation edit. `24f6071` added the
  argument: `index.css` fell from 21.18 to 19.93 kB raw, and its hash became stable across
  documentation-only changes. `src/` is the whole real surface and the class names in this document
  do not ship. `index.html` is the one file outside it that names a class — its pre-paint script
  calls `classList.add('dark')` — and that is harmless: `.dark` is authored in `theme.css`, not
  minted from a scan, so the page needs no scanning to reach it. The flip side is that _every_
  string under `src/` is scanned, test files included, so a junk fixture value that happens to be a
  real utility name (`sepia`, `inline`, `grid`, `truncate`, `container`) emits a dead rule into the
  shipped stylesheet. The theme tests use `'twilight'` for that reason.
- **The stylesheet is global and follows the source, not the import graph.** Every utility found
  under `src/` ships in the one `index-*.css` on every page, whether or not the page renders it.
  `Input` and `Label` are code-split into the lazily loaded `form-*.js` chunk, yet their utilities
  are in `index.css` from the first visit (+1.86 kB raw / +0.27 kB gzip together with `TextField`'s
  when the form seam landed). Unused variants ship too — `bg-secondary`, `size-10` and the `dark:`
  rules are all in the stylesheet — and so do classes that appear only in tests: `h-12` (in
  `input.test.tsx`) and `px-8` (in `button.test.tsx`). With the app-shell header rendering on every
  route, the stylesheet is 20.19 kB raw / 4.44 kB gzip. The trade is one cacheable file and no
  per-route CSS request.
- **The JavaScript is a fixed cost, paid in the eager bundle.** When the kit landed (`59a4d2c`),
  rendering `/` cost +14.4 kB gzip: the shared routes chunk grew from 5.00 to 15.57 kB gzip, about
  7 kB of it tailwind-merge, and the stylesheet from 0.42 to 4.07 kB gzip. The vendors are paid
  once; further primitives add only their own code. `radix-ui` tree-shakes: the build contains
  `Slot` and `Label` and no other Radix primitive. At `1c193c6`, Rollup places `Button`,
  `buttonVariants`, `cn` and their vendors in a shared `button-*.js` chunk together with i18next
  (103.10 kB raw / 34.15 kB gzip in all), which the entry chunk imports statically and `index.html`
  preloads, so they load on every page. `Button` belongs in that eager graph regardless:
  `AppCrashFallback`, imported statically by `app.tsx`, renders one. `Input` and `Label`, with
  Radix's label, travel in the lazily loaded `form-*.js` chunk with the form seam.
- **The Prettier plugin sorts classes, and the theme import stays relative.**
  `prettier-plugin-tailwindcss` orders utilities in `className` attributes and `@apply`, and —
  through `tailwindFunctions` — in the string arguments of `cn` and `cva` calls, where the densest
  class strings live; a `clsx` call would be left unsorted. The plugin loads `tailwindStylesheet` to
  learn the theme and resolves that file's `@import`s with its own resolver, which knows nothing of
  the `@/` alias. Vite compiles `@import '@/shared/ui/theme.css'` to byte-identical CSS, but every
  Prettier run then fails with `Can't resolve '@/shared/ui/theme.css'`, taking
  `npm run format:check`, and with it `npm run audit`, down. Hence the relative
  `@import '../../shared/ui/theme.css'`.
- **The shadcn CLI gets its alias at the repository root.** `59a4d2c` records that the CLI resolves
  `@/` from the root `tsconfig.json`, following `extends` but not `references`, while this
  repository's root config is solution-style and the alias otherwise lives in `tsconfig.app.json`;
  without the root `baseUrl` and `paths`, the CLI exits 0, reports a created file and writes it into
  a literal `@` directory at the repository root. The root file lists no files of its own
  (`"files": []`), so `tsc -b` compiles nothing from it and the entry changes no build.
- **The group import rules hold for every primitive the CLI adds.** Importing a file inside a
  `shared/ui` or `shared/lib` group — the pattern `^@/shared/(lib|ui)/[^/]+/.+` — is a lint error.
  It catches both a CLI-emitted `@/shared/lib/cn/index` and the worse
  `@/shared/ui/button/button-variants`, and it is declared three times in `eslint.config.js` (the
  `src/**` block, `LOWER_LAYER_IMPORT_PATTERNS` and the `src/app/{routes,router}/**` block) because
  flat config replaces `no-restricted-imports` options rather than merging them. Separately,
  `@typescript-eslint/no-unused-vars` runs with `ignoreRestSiblings: true`, which is what lets
  `Button` destructure `asChild` out of its props to keep it off the DOM.

## Testing

The kit's tests are co-located with each group and run in Vitest on jsdom with Testing Library. They
assert behaviour and the class contract, not appearance.

| File                                   | Level     | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/ui/button/button.test.tsx` | Component | Rendered with its accessible name; `type="button"` by default, so a click inside a `<form>` does not submit it; an explicit `type` honoured; a caller `px-8` replacing the default `px-4`; `data-variant` and `data-size` reporting the defaults, and `data-variant="secondary"` agreeing with `bg-secondary`; the click handler called, and not called while `disabled`; `asChild` rendering the child `<a>` with its `href`, no `type` and no `button` in the document |
| `src/shared/ui/input/input.test.tsx`   | Component | `type="text"` by default; an explicit `type` honoured; a caller `h-12` replacing the default `h-9`; `aria-invalid` forwarded so the destructive styles can apply                                                                                                                                                                                                                                                                                                         |
| `src/shared/ui/label/label.test.tsx`   | Component | The control is reachable by the label's text; clicking the label focuses the control; a caller `text-base` replacing the default `text-sm`                                                                                                                                                                                                                                                                                                                               |
| `src/shared/lib/cn/cn.test.ts`         | Unit      | Joining; dropping falsy values; the last of two conflicting utilities winning; conflicts resolved across conditional object inputs                                                                                                                                                                                                                                                                                                                                       |

Consumers exercise the primitives in context: `src/shared/ui/form/submit-button.test.tsx` checks
that a caller `variant` reaches the rendered `Button`, `src/pages/home/ui/home-page.test.tsx` and
`src/app/entrypoint/app-crash-fallback.test.tsx` click their `Button` by role and name,
`src/features/sign-out/ui/sign-out-button.test.tsx` finds its `Button` by role and name and pins the
pending state — disabled, `aria-busy="true"`, the label now `Signing out…` —
`src/features/switch-locale/ui/locale-switcher.test.tsx` reads each locale's `Button` by role, name
and `pressed` state, `src/widgets/app-header/ui/app-header.test.tsx` looks one of them up inside the
`banner` role, `src/app/entrypoint/app.test.tsx` clicks the header's `Русский` button on a mounted
app and waits for the language to change, and `e2e/user-profile.spec.ts` ("keeps the form operable
by keyboard alone") tabs from an `Input` to the save `Button` and presses Enter in Chromium, over
the production build. See [Unit and component testing](./unit-testing.md) and
[End-to-end testing](./e2e-testing.md) for the harnesses.

The 90% per-file coverage thresholds in `vite.config.ts` apply to `button.tsx`,
`button-variants.ts`, `input.tsx`, `label.tsx` and `cn.ts`; the stylesheets are not measured. Branch
coverage says nothing about defaulted props: under v8, a default parameter's branch counts as
covered as soon as the function runs, whether or not the default fires. That is why each default —
`type="button"`, `type="text"`, `data-variant="default"` — has a test of its own.

Commands:

- `npm test` runs the whole Vitest suite.
- `npx vitest run src/shared/ui/button src/shared/ui/input src/shared/ui/label src/shared/lib/cn`
  runs the kit's four test files; name one file to run it alone, e.g.
  `npx vitest run src/shared/ui/button/button.test.tsx`.
- `npm run test:coverage` runs the suite against the per-file thresholds.
- `npm run test:e2e` runs Playwright over the production build;
  `npx playwright test e2e/user-profile.spec.ts` runs only the keyboard-driven profile spec.
- `npm run format:check` fails on class strings the Prettier plugin would reorder.

## Known limitations

- **No user-facing theme control ships yet.** `shared/theme` resolves and applies a theme, and an
  explicit preference can be set through `useTheme().setPreference`, but no rendered control calls
  it: a visitor gets their operating system's scheme and cannot override it from the page. The
  switcher, its translated labels and a Playwright spec are the next step. No component test renders
  under `.dark` either — the primitives' `dark:` variants are exercised by the stylesheet, not by an
  assertion.
- **Most of `Button`'s API still has no runtime caller.** The six call sites — `HomePage`,
  `AppCrashFallback`, `LocaleSwitcher`, `SignOutButtonView`, and `SubmitButton` as rendered by
  `SignInFormView` and `UpdateUserNameFormView` — reach two of the six variants (`default`, and
  `outline` from `SignOutButtonView` and from `LocaleSwitcher`'s inactive locales) and two of the
  eight sizes (`default`, and `sm` from `LocaleSwitcher`), so no runtime path renders `destructive`,
  `secondary`, `ghost` or `link`, nor the six remaining sizes — `xs`, `lg`, `icon`, `icon-xs`,
  `icon-sm` and `icon-lg`. Tests render only `secondary` among them (`button.test.tsx`,
  `submit-button.test.tsx`) and no size but the default. `asChild` has no runtime caller either
  (`SubmitButtonProps` omits it) and only `button.test.tsx` exercises it, and `buttonVariants` is
  imported nowhere outside its group. Their classes still ship: the strings in the eager
  `button-*.js` chunk, the utilities in `index.css`.
- **The declared icon library is not installed.** `components.json` names `lucide` as its
  `iconLibrary`, but `lucide-react` is in neither `package.json` nor `package-lock.json`, so a
  registry component that imports its icons does not compile until the package is added. The
  `[&_svg]` rules in `buttonVariants` and the `icon`, `icon-xs`, `icon-sm` and `icon-lg` sizes have
  no icon to style today.
- **Focus is faint on borderless buttons and on invalid inputs.** Only `Input` and the `outline`
  variant have a border, so on `default` — the variant every shipped call site but
  `SignOutButtonView` renders, `LocaleSwitcher` included for the active locale — and on
  `destructive`, `secondary`, `ghost` and `link`, `focus-visible:border-ring` colours a zero-width
  border. The visible indicator there is the 3px `ring-ring/50` halo: about 2.3:1 against the white
  `--background` and 7.7:1 against the `default` fill, by the same computation that gives `--ring`
  its 7.4:1. `59a4d2c` calls the 1px border the compliant indicator and the halo decorative; on
  these variants the halo is the only one. `SignOutButtonView` and `LocaleSwitcher`'s inactive
  locales are the exceptions among the shipped buttons: the `outline` variant carries `border`, so
  `focus-visible:border-ring` has a real 1px border to colour. On an `Input` with `aria-invalid`,
  the `aria-invalid:border-destructive` rule comes after `focus-visible:border-ring` in the
  stylesheet with equal specificity, so focus leaves the border destructive and adds only a
  `ring-destructive/20` halo, about 1.4:1 against white.
- **One literal colour.** The `destructive` variant sets `text-white`, a palette value and the one
  exception to the tokens-only rule, because the theme declares no `--destructive-foreground`. It
  stays white under `.dark` too, over `dark:bg-destructive/60`.
- **Accessibility lint does not see through the primitives.** oxlint's `jsx-a11y` rules check the
  intrinsic elements inside `button.tsx`, `input.tsx` and `label.tsx`, not their call sites:
  `.oxlintrc.json` maps no components (oxlint's `settings["jsx-a11y"].components`), so a `<label>`
  without `htmlFor` or an empty `<button>` is reported while the same mistake written as `<Label>`
  or `<Button>` is not. `scripts/a11y-rules.mjs` regenerates `.oxlintrc.json` from scratch, so a
  `settings` block added by hand would be dropped by the next `npm run lint:a11y:fix`. See
  [Quality gates](./quality-gates.md).
- **Nothing guards appearance.** Tests assert roles, attributes and a handful of class names. There
  is no visual-regression check — Playwright captures screenshots only on failure — and no component
  workshop rendering the variants side by side, so a token or class change that alters how a screen
  looks passes every gate.
