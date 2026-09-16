# Forms

> **Status:** Complete · **Layers:** features, shared, outside layers · **Verified against:** `33ee487`

## Purpose

Every form repeats four problems: holding controlled field state, deciding when a validation error
may appear, wiring that error to assistive technology (`aria-invalid`, `aria-describedby`, a
`role="alert"` container), and a pending state that blocks a second submit. Solved form by form,
each answer drifts. `src/shared/ui/form` solves them once behind a _seam_ — the repo also says
_port_: a type the rest of the code programs against while the concrete implementation is chosen
elsewhere, so what sits behind it can change without touching its consumers. The type here is the
surface of one hook, `useAppForm`, and TanStack Form is the concrete behind it: a form writes
`<field.TextField label="Email" />` and gets the wiring by construction, with no way to leave it
out. `src/shared/ui/form` is also the only place that imports TanStack Form, and it names no
validator, so both the form library and the schema library stay replaceable.

## How it works

The sign-in form at `/sign-in` is the running example; the name form on `/users/$userId` takes the
same path. Both live in a _slice_: Feature-Sliced Design (FSD) stacks the codebase in _layers_
(`app`, `pages`, `widgets`, `features`, `entities`, `shared`, each importing only from the ones
below it), and a slice is one folder for one user action inside the `features` layer — here
`src/features/sign-in` and `src/features/update-user-name`, the seam's only consumers today —
which the rest of the app reaches only through its public `index.ts` barrel. A third slice shares
that layer, `src/features/sign-out`, and uses none of this: it submits no form, so it calls no
`useAppForm`, declares no schema and renders no `SubmitButton`. Each of the two form slices splits
its form the same way: a _container_ (`SignInForm`, `UpdateUserNameForm`) calls the slice's
action hook — `useSignIn` or `useUpdateUserName`, the hook that owns the mutation — and its schema
hook, then renders a presentational _view_ (`SignInFormView`, `UpdateUserNameFormView`) with four
named props: `schema` unchanged, the hook's `submit` as the view's `onSubmit`, the hook's
`dismissOutcome` as `onEdited`, and an `outcome` node the container builds from the hook's `status`
— `outcome={<SignInAlert status={status} />}` in sign-in,
`outcome={<UpdateUserNameOutcome status={status} />}` in the name form. `UpdateUserNameForm` passes
a fifth prop, `defaultValues`, to prefill its two inputs from the loaded user. The view creates the
form and places the `outcome` node inside it after the submit button — the _outcome slot_. That
container/view split is this repo's convention rather than something FSD requires;
[Usage & extension](#build-a-form-in-a-feature-slice) shows the container in full and walks through
each prop, and [Sign-in](./sign-in.md) and
[Update user name (write path)](./update-user-name.md) document the two slices themselves.

1. **The slice builds its schema.** The container `SignInForm` calls `useCredentialsSchema()`,
   which resolves the rule messages with `t('signIn.validation.emailInvalid')` and
   `t('signIn.validation.passwordRequired')` and memoises `createCredentialsSchema(messages)` on
   `[t]`. The result is a `CredentialsSchema` — `StandardSchemaV1<Credentials, Credentials>`, a
   [Standard Schema](https://standardschema.dev): the vendor-neutral validator interface, an object
   whose `~standard.validate()` returns either a value or a list of issues — built with `zod/mini`.
   The container passes it to `SignInFormView` as `schema`, alongside `onSubmit`, `onEdited` and
   `outcome`.
2. **The view creates the form.** `SignInFormView` calls `useAppForm` with `defaultValues`,
   `validators: { onChange: schema }`, `listeners: { onChange: onEdited }` and an `onSubmit` that
   forwards `value` to the container's `submit`. `useAppForm` is TanStack Form's `useForm`,
   extended by `createFormHook` with `AppForm`, `AppField` and the seam's `Form` and
   `SubmitButton`.
3. **The tree renders.** `<form.AppForm>` publishes the form API through `formContext`.
   `<form.Form>` renders `<form noValidate>`. Each `<form.AppField name="email">` publishes that
   field's API through `fieldContext` and passes its render prop a `field` that carries
   `field.TextField`. `TextField` renders `Label`, `Input`, an optional description and — only
   while the field is invalid — an error container, taking its ids and ARIA state from
   `useFieldReveal`, which delegates to `useFieldAria`. `<form.SubmitButton>` subscribes to the
   form's `isSubmitting`.
4. **Typing validates silently.** `TextField` forwards each change to `field.handleChange`, and
   TanStack Form runs the form-level `onChange` validator over the whole values object: it
   recognises the Standard Schema by its `~standard` property, groups the issues by path and stores
   each field's issues in that field's meta — `meta.errors` is the flattened list and
   `meta.isValid` is whether it is empty. The form's `listeners.onChange` calls `onEdited`, which
   clears a settled sign-in outcome. Nothing is announced yet: `useFieldAria` reveals an error only
   when `(isBlurred || hasSubmitted) && !isValid`.
5. **Blur reveals.** `field.handleBlur` sets `isBlurred`. It runs no validator here — both shipped
   forms validate on change only — but an error the last change computed is now shown: the control
   gets `aria-invalid="true"`, the error container (`role="alert"`) lists one `<li>` per message
   produced by `toFieldErrorMessages`, and the container's id joins `aria-describedby` after any
   description id.
6. **Submit.** Enter in a field, or a click on `SubmitButton` (a real `type="submit"` button),
   fires the native submit event. `Form` calls `event.preventDefault()` and `form.handleSubmit()`.
   TanStack Form counts the attempt in `submissionAttempts` — `useFieldReveal` turns
   `submissionAttempts > 0` into `hasSubmitted`, so every invalid field reveals at once — and marks
   every field touched. Unless the form is already known to be invalid, it then sets
   `isSubmitting` and runs the validators for the `submit` cause, which include the `onChange`
   ones. An invalid form stops there and sends nothing. A valid one has `onSubmit` called with the
   raw field values, and `isSubmitting` holds until that promise settles — the window in which
   `SubmitButton` is disabled, carries `aria-busy="true"` and shows its `pendingLabel`.

**Failure paths.**

- _The request fails._ Both shipped slices' `submit` awaits `mutateAsync` and swallows the
  rejection (`.catch(() => undefined)`), because the mutation status already drives the outcome slot
  the container passes in — `SignInAlert` in sign-in, `UpdateUserNameOutcome` in the name form.
  `handleSubmit` resolves, the button re-enables and the typed values stay in place.
- _A slice's `onSubmit` rejects anyway._ `FormApi` rethrows the rejection from `handleSubmit`;
  `Form` catches it and calls `onSubmitError` when one is passed, and otherwise drops it. It never
  becomes an unhandled rejection.
- _A field is bound to a non-string value._ `TextField` throws a `TypeError` naming the field
  during render. Inside a route that error is caught by TanStack Router, not by the app's error
  boundary — see [Known limitations](#known-limitations).

## Architecture

Consumers program against one hook, `useAppForm`, reached through the group's _public API_ — its
`index.ts` barrel, `@/shared/ui/form`, which also exports the `TextFieldProps` and
`TextFieldInputType` types. TanStack Form is the concrete behind it, and it is bound inside the seam
rather than at the _composition root_ (`src/app/entrypoint/**`, where the app constructs its
clients and publishes them through providers; see [Composition root](./composition-root.md)):
`use-app-form.ts` calls `createFormHook` once, at
module scope, to pre-bind `TextField`, `Form` and `SubmitButton` to the contexts that
`form-contexts.ts` creates, and there is no client lifetime or provider to wire. The seam's only
runtime dependency on the provider tree is the i18n instance that `TextField` reads through
`useTranslation()`, published by `I18nProvider` in `src/app/entrypoint/app-providers.tsx` (see
[Internationalization](./internationalization.md)). The validator is a second seam: `useAppForm`
accepts any Standard Schema, so what a slice hands it is again a port — a schema type rather than
a library — and the concrete behind that port, a `zod/mini` schema, lives in the `model` _segment_
(a folder named for what its contents are _for_ rather than what they are: `ui/` for components,
`model/` for domain types, state, hooks and validation schemas, `api/` for DTOs, mappers and HTTP
calls, `lib/` for slice-local helpers; `fsd/segments-by-purpose` rejects essence names such as
`hooks/` or `schemas/`) of each consuming slice. Imports point downward only: a slice's `ui`
segment imports `@/shared/ui/form`; the seam imports the `@/shared/ui/button`, `@/shared/ui/input`
and `@/shared/ui/label` groups and the `@/shared/i18n` segment; `@tanstack/react-form` is imported
nowhere else, and `eslint.config.js` fences both the vendor and the validator (see
[Architecture boundaries](./architecture-boundaries.md)).

| Component                                                                              | Layer                               | Responsibility                                                                                                                                                | File                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `useAppForm`                                                                           | `shared/ui/form`                    | The seam: the `createFormHook` output that pre-binds `TextField` as a field component and `Form` and `SubmitButton` as form components                        | `src/shared/ui/form/use-app-form.ts`                                                                                                   |
| `fieldContext`, `formContext`, `useFieldContext`, `useFormContext`                     | `shared/ui/form`                    | Contexts from `createFormHookContexts()` through which the pre-bound components reach the current field and form                                              | `src/shared/ui/form/form-contexts.ts`                                                                                                  |
| `Form`                                                                                 | `shared/ui/form`                    | `<form noValidate>` whose submit handler prevents navigation, runs `handleSubmit()` and routes a rejection to `onSubmitError`                                 | `src/shared/ui/form/form.tsx`                                                                                                          |
| `SubmitButton`                                                                         | `shared/ui/form`                    | A `type="submit"` `Button` that is disabled and `aria-busy`, and shows its `pendingLabel`, only while `isSubmitting`                                          | `src/shared/ui/form/submit-button.tsx`                                                                                                 |
| `TextField`                                                                            | `shared/ui/form`                    | Label, input, optional description and error list bound to one string field; throws on a non-string value                                                     | `src/shared/ui/form/text-field.tsx`                                                                                                    |
| `useFieldReveal`                                                                       | `shared/ui/form`                    | Reads `submissionAttempts > 0` from the form store and passes it to `useFieldAria` as `hasSubmitted`                                                          | `src/shared/ui/form/use-field-reveal.ts`                                                                                               |
| `useFieldAria`                                                                         | `shared/ui/form`                    | Vendor-free reveal policy: `isInvalid`, the control, description and error ids, the merged `aria-describedby` and the display messages                        | `src/shared/ui/form/use-field-aria.ts`                                                                                                 |
| `toFieldErrorMessages`                                                                 | `shared/ui/form`                    | Turns unknown validator errors (strings, Standard Schema issues) into unique, non-blank messages                                                              | `src/shared/ui/form/field-error-messages.ts`                                                                                           |
| `validation.invalid`                                                                   | `shared/i18n`                       | The fallback message for an invalid field whose errors yield no text                                                                                          | `src/shared/i18n/locales/en/common.json`, `src/shared/i18n/locales/ru/common.json`                                                     |
| `Input`, `Label`, `Button`                                                             | `shared/ui`                         | Design-system primitives the seam renders (see [Design system](./design-system.md))                                                                           | `src/shared/ui/input/input.tsx`, `src/shared/ui/label/label.tsx`, `src/shared/ui/button/button.tsx`                                    |
| `createCredentialsSchema`, `useCredentialsSchema`                                      | `features/sign-in · model`          | Worked example: sign-in rules as a Standard Schema, their messages resolved in the hook (see [Sign-in](./sign-in.md))                                         | `src/features/sign-in/model/credentials-schema.ts`, `src/features/sign-in/model/use-credentials-schema.ts`                             |
| `SignInFormView`                                                                       | `features/sign-in · ui`             | Worked example: a view built from `useAppForm`, named with `aria-label`                                                                                       | `src/features/sign-in/ui/sign-in-form-view.tsx`                                                                                        |
| `createUserNameChangeSchema`, `useUserNameChangeSchema`                                | `features/update-user-name · model` | Second worked example, with a length limit (`MAXIMUM_NAME_LENGTH`) interpolated into its message (see [Update user name (write path)](./update-user-name.md)) | `src/features/update-user-name/model/user-name-change-schema.ts`, `src/features/update-user-name/model/use-user-name-change-schema.ts` |
| `UpdateUserNameFormView`                                                               | `features/update-user-name · ui`    | Second view: prefilled `defaultValues`, named by a visible heading through `aria-labelledby`                                                                  | `src/features/update-user-name/ui/update-user-name-form-view.tsx`                                                                      |
| `FORM_VENDOR_IMPORT_PATHS`, `FORM_VENDOR_IMPORT_PATTERNS`, `VALIDATOR_IMPORT_PATTERNS` | `outside layers`                    | Lint fences: TanStack Form only inside the seam, no concrete validator inside it                                                                              | `eslint.config.js`                                                                                                                     |

## Public surface

The seam is infrastructure and serves no route of its own. Two routes render it today:

| Path             | Auth          | Purpose                                                                                                          |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/sign-in`       | public        | `SignInForm` from `features/sign-in`, through `pages/sign-in`                                                    |
| `/users/$userId` | authenticated | `UpdateUserNameForm` from `features/update-user-name`, through `pages/user-profile`, once the profile has loaded |

`src/shared/ui/form/index.ts` is the whole contract:

```ts
export type { TextFieldInputType, TextFieldProps } from './text-field';
export { useAppForm } from './use-app-form';
```

Everything else in the group — `Form`, `SubmitButton` and `TextField` as values, `FormProps`,
`SubmitButtonProps`, `useFieldAria`, `useFieldReveal`, `toFieldErrorMessages` and their types — is
internal. The components are reachable only as members of the object `useAppForm` returns.

**`useAppForm(options)`** accepts TanStack Form's `useForm` options and returns its form API —
`form.Subscribe`, `form.state`, `form.reset()`, `form.handleSubmit()` and the rest — extended with
the members below. The shipped forms use four options: `defaultValues` (which also fixes the value
type every field name is checked against), `validators: { onChange: schema }`,
`listeners: { onChange }` and `onSubmit: ({ value }) => Promise<void>`. A later change to
`defaultValues`, such as a refetched record, replaces the values only while the form is untouched.

| Member              | Props                                                                                                                                                                                                                | Contract                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `form.AppForm`      | `children`                                                                                                                                                                                                           | Publishes the form through `formContext`. Every seam component renders inside it; outside it `useFormContext()` throws.                                                                                                                                                                                                                                                     |
| `form.Form`         | `FormProps`: every `<form>` prop except `noValidate` and `onSubmit`, plus `onSubmitError?: (error: unknown) => void`                                                                                                 | Renders `<form noValidate>`; on submit calls `preventDefault()` and `form.handleSubmit()`, and routes a rejection to `onSubmitError`. Name every form with `aria-label` or `aria-labelledby`: a `<form>` is exposed as a `form` landmark only with an accessible name, and the tests and page objects find forms by that role and name.                                     |
| `form.AppField`     | `name` (a field path in the form's values), optional field-level `validators`, `children: (field) => ReactNode`                                                                                                      | Publishes the field through `fieldContext`; the `field` passed to `children` carries `field.TextField`.                                                                                                                                                                                                                                                                     |
| `form.SubmitButton` | `SubmitButtonProps`: the non-`asChild` `Button` props without `aria-busy`, `asChild` and `type`, plus required `children: ReactNode` and optional `pendingLabel?: ReactNode`                                         | Always `type="submit"`. While `isSubmitting` it is disabled, carries `aria-busy="true"` and renders `pendingLabel` in place of `children` when one is given. A caller `disabled` is OR-ed in; `variant` and `size` pass through.                                                                                                                                            |
| `field.TextField`   | `TextFieldProps`: the `Input` props without `aria-invalid`, `defaultValue`, `name`, `onBlur`, `onChange` and `value`, plus required `label: string`, optional `description?: string` and `type?: TextFieldInputType` | Binds one string field. A caller `id` becomes the control id and roots the other two (`<id>-description`, `<id>-error`); without one the control id is React's `useId()` plus `-control`. A caller `aria-describedby` is appended after the seam's own ids, never replacing them. Every other `<input>` prop — `autoComplete`, `inputMode`, `placeholder` — passes through. |

`TextFieldInputType` is `'email' | 'password' | 'search' | 'tel' | 'text' | 'url'`. Optional props
are typed `T | undefined`, so under the repo's `exactOptionalPropertyTypes` a caller can forward a
possibly-undefined value as it is.

The seam owns one copy key: `validation.invalid` in the `common` namespace ("This value is
invalid." / "Некорректное значение."), shown when a field is invalid but none of its errors can be
turned into text.

## Configuration

None. The seam reads no `VITE_*` variable and takes nothing from the composition root:
`createFormHook` runs once at module scope in `use-app-form.ts`, and each form's behaviour is set by
the `useAppForm` options its slice passes.

## Usage & extension

### Build a form in a feature slice

The walkthrough below builds a hypothetical `features/sign-up` slice the way the two shipped form
slices are built — [Sign-in](./sign-in.md) and
[Update user name (write path)](./update-user-name.md) are the reference. The form's value type is
the entity's domain type (`Credentials` from `@/entities/session`), never a DTO.

**Step 1 — the rules,** in `src/features/sign-up/model/sign-up-schema.ts`: a module-scope factory
in the `model` segment, typed as the Standard Schema port and taking resolved messages. The email
predicate trims only to test the value; the value itself is left for the outbound mapper to
normalise.

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import * as zm from 'zod/mini';

import type { Credentials } from '@/entities/session';

export const MINIMUM_PASSWORD_LENGTH = 12;

const EMAIL_FORMAT = zm.email();

export interface SignUpMessages {
  readonly emailInvalid: string;
  readonly passwordTooShort: string;
}

export type SignUpSchema = StandardSchemaV1<Credentials, Credentials>;

function isEmailAddress(value: string): boolean {
  return zm.safeParse(EMAIL_FORMAT, value.trim()).success;
}

function isLongEnough(value: string): boolean {
  return value.length >= MINIMUM_PASSWORD_LENGTH;
}

export function createSignUpSchema(messages: SignUpMessages): SignUpSchema {
  return zm.object({
    email: zm.string().check(zm.refine(isEmailAddress, messages.emailInvalid)),
    password: zm.string().check(zm.refine(isLongEnough, messages.passwordTooShort)),
  });
}
```

**Step 2 — the copy,** in `src/features/sign-up/model/use-sign-up-schema.ts`: a sibling hook that
resolves the messages once and memoises the schema on `[t]`.

```ts
import { useMemo } from 'react';

import { useTranslation } from '@/shared/i18n';

import { createSignUpSchema, MINIMUM_PASSWORD_LENGTH } from './sign-up-schema';
import type { SignUpSchema } from './sign-up-schema';

export function useSignUpSchema(): SignUpSchema {
  const { t } = useTranslation();

  return useMemo(
    () =>
      createSignUpSchema({
        emailInvalid: t('signUp.email.invalid'),
        passwordTooShort: t('signUp.password.tooShort', { min: MINIMUM_PASSWORD_LENGTH }),
      }),
    [t],
  );
}
```

**Step 3 — the keys,** merged into `src/shared/i18n/locales/en/common.json` (first block) and
`src/shared/i18n/locales/ru/common.json` (second block). `t` keys are type-checked against the
English file, so steps 2 and 4 do not compile until it has them. Both shipped slices key their
copy flat (`signIn.email`); a form whose fields carry several messages each nests it, as here.

```json
{
  "signUp": {
    "formLabel": "Create account",
    "email": {
      "label": "Email",
      "invalid": "Enter a valid email address."
    },
    "password": {
      "label": "Password",
      "hint": "Use at least {{min}} characters.",
      "tooShort": "This password is shorter than {{min}} characters."
    },
    "submit": "Create account",
    "submitting": "Creating account…"
  }
}
```

```json
{
  "signUp": {
    "formLabel": "Регистрация",
    "email": {
      "label": "Электронная почта",
      "invalid": "Введите корректный адрес электронной почты."
    },
    "password": {
      "label": "Пароль",
      "hint": "Не менее {{min}} символов.",
      "tooShort": "Пароль короче {{min}} символов."
    },
    "submit": "Зарегистрироваться",
    "submitting": "Регистрация…"
  }
}
```

**Step 4 — the view,** in `src/features/sign-up/ui/sign-up-form.tsx`. The password hint uses
`description`, which `TextField` links through `aria-describedby` ahead of any error.

```tsx
import type { Credentials } from '@/entities/session';
import { useTranslation } from '@/shared/i18n';
import { useAppForm } from '@/shared/ui/form';

import { MINIMUM_PASSWORD_LENGTH } from '../model/sign-up-schema';
import { useSignUpSchema } from '../model/use-sign-up-schema';

const EMPTY_CREDENTIALS: Credentials = { email: '', password: '' };

interface SignUpFormProps {
  readonly onSubmit: (credentials: Credentials) => Promise<void>;
}

export function SignUpForm({ onSubmit }: SignUpFormProps) {
  const { t } = useTranslation();
  const schema = useSignUpSchema();
  const form = useAppForm({
    defaultValues: EMPTY_CREDENTIALS,
    validators: { onChange: schema },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form.AppForm>
      <form.Form aria-label={t('signUp.formLabel')} className="grid gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField autoComplete="username" label={t('signUp.email.label')} type="email" />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              autoComplete="new-password"
              description={t('signUp.password.hint', { min: MINIMUM_PASSWORD_LENGTH })}
              label={t('signUp.password.label')}
              type="password"
            />
          )}
        </form.AppField>
        <form.SubmitButton pendingLabel={t('signUp.submitting')}>
          {t('signUp.submit')}
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
```

**Step 5 — the slice's public API,** in `src/features/sign-up/index.ts`: the component and nothing
else.

```ts
export { SignUpForm } from './ui/sign-up-form';
```

Four things the sketch leaves to the caller, and how the shipped slices handle them:

- **The container/view split.** The sketch is one component; each shipped form is two. The sketch
  plays the _view_ — the half that owns `useAppForm` and the markup — and a _container_ sits beside
  it in the same `ui` segment, calls the action hook, and passes the view four named props. Split
  the sketch and it becomes `ui/sign-up-form-view.tsx` exporting `SignUpFormView`,
  `ui/sign-up-form.tsx` holds the new container, and step 5's barrel exports the container.
  `src/features/sign-in/ui/sign-in-form.tsx` is that container in full:

  ```tsx
  import { useCredentialsSchema } from '../model/use-credentials-schema';
  import { useSignIn } from '../model/use-sign-in';

  import { SignInAlert } from './sign-in-alert';
  import { SignInFormView } from './sign-in-form-view';

  interface SignInFormProps {
    readonly onSignedIn: () => void;
  }

  export function SignInForm({ onSignedIn }: SignInFormProps) {
    const { dismissOutcome, status, submit } = useSignIn({ onSignedIn });
    const schema = useCredentialsSchema();

    return (
      <SignInFormView
        onEdited={dismissOutcome}
        onSubmit={submit}
        outcome={<SignInAlert status={status} />}
        schema={schema}
      />
    );
  }
  ```

  `schema` reaches the view unchanged and goes straight into `validators: { onChange: schema }`;
  the `useSignUpSchema()` call the sketch makes in step 4 moves up into the container, and the view
  takes the schema as a prop typed `SignUpSchema`. `onSubmit` is the hook's `submit`. `onEdited`
  is the hook's `dismissOutcome`, which the view binds to `listeners: { onChange: onEdited }` so
  the first edit clears a settled result. `outcome` is a rendered node — here
  `<SignInAlert status={status} />` — that the view places inside the form after the submit button.
  `UpdateUserNameForm` passes the same four plus `defaultValues`, taken from the loaded user. The
  point of the split is that the view names no mutation and no Query type: it takes a schema and
  two callbacks, renders, and can be reasoned about on its own.

- **The `onSubmit` a caller passes must not reject.** The container passes the action hook's
  `submit`, which awaits the mutation and swallows its rejection (`.catch(() => undefined)`)
  because the mutation status already renders the failure through `outcome`. Where no mutation
  state models a failure, pass `onSubmitError` to `form.Form` instead — one or the other per form,
  never both.
- **A value that must be transformed.** `onSubmit` receives the raw field values, never the
  schema's output. A slice that needs the parsed value — trimmed, lower-cased, coerced — has to
  validate once more itself inside `onSubmit`, as the bullet on transforms under
  [Design decisions & trade-offs](#design-decisions--trade-offs) sets out; both shipped form slices
  avoid the question by normalising in their outbound mapper instead.
- **The architecture check.** steiger's `fsd/insignificant-slice` flags a slice with exactly one
  consuming slice; `steiger.config.ts` switches it off by path for the four slices the `features`
  layer holds today — `sign-in`, `sign-out`, `switch-locale` and `update-user-name` — and a new
  single-consumer slice needs the same entry (see
  [Architecture boundaries](./architecture-boundaries.md)).

### Add a field component to the seam

`TextField` is the only field component, and it binds strings only. A number, a boolean or a choice
from a list needs its own component inside `src/shared/ui/form`, modelled on `text-field.tsx`:

1. Build the control from a design-system primitive — add one under `src/shared/ui/<group>` first
   if none fits (see [Design system](./design-system.md)) — the way `TextField` builds on `Input`
   and `Label`.
2. Read the field with `useFieldContext<unknown>()` and narrow its value loudly, as `toTextValue`
   does, because the generic only asserts the type.
3. Call `useFieldReveal(field, options)` with `describedBy`, `fallbackMessage`
   (`t('validation.invalid')`), `hasDescription` and `id`, and wire what it returns:
   `Label htmlFor={aria.controlId}`; the control's `id={aria.controlId}`,
   `aria-invalid={aria.isInvalid}` and `aria-describedby={aria.describedBy}`, plus
   `name={field.name}` and `onBlur={field.handleBlur}`; a description with
   `id={aria.descriptionId}`; and, while `aria.isInvalid`, a `role="alert"` container with
   `id={aria.errorId}` listing `aria.messages`. Reusing the hook is what keeps the reveal rule
   identical across field types.
4. Register it next to `TextField` in the `fieldComponents` object of `use-app-form.ts`; every
   `<form.AppField>` then offers it as `field.<Name>`.
5. Export its props type from `index.ts` only if slices must name it, as `TextFieldProps` is; never
   export the component value.
6. Test it through `useAppForm` in a co-located `*.test.tsx`, as `text-field.test.tsx` does. The
   per-file coverage threshold (90%) applies to the new file.

## Design decisions & trade-offs

- **TanStack Form, composed through `createFormHook`.** `createFormHook` returns components
  pre-bound to the form and field contexts, which is the decisive property: a slice writes
  `<field.TextField label="Email" />` and cannot forget `aria-invalid`, `aria-describedby`, the
  `role="alert"` container or the pending state. TanStack Form is also headless, matches the
  TanStack Router and Query stack already in use, and validates Standard Schema natively, so no
  adapter sits between it and the validator. react-hook-form was rejected: its uncontrolled,
  ref-based model composes worse with router loaders and Query mutations, and it validates through
  a separate resolver layer (`@hookform/resolvers`) rather than taking a schema directly. Zod 4 was
  preferred to Valibot for its ecosystem, once Zod 4 had closed most of the bundle-size gap that
  was Valibot's main argument.
- **Only the seam imports TanStack Form.** In `eslint.config.js`, `FORM_VENDOR_IMPORT_PATHS` bans
  `@tanstack/react-form` in the five layers below `app` and in `app/routes` and `app/router`, and
  `FORM_VENDOR_IMPORT_PATTERNS` bans `@tanstack/form-core` and `@tanstack/react-store` as well,
  because a `paths` entry matches one exact specifier and would leave the sibling packages open as
  a route to the same API. Type-only imports of `@tanstack/react-form` stay allowed
  (`allowTypeImports: true`) so a slice can name a TanStack Form type in a prop — the same bargain
  `shared/i18n` strikes with `i18next`. `src/shared/ui/form` is exempt through its own block. Flat
  config replaces rather than merges `no-restricted-imports` options, so that block must stay the
  last one matching the seam's files; the comment above it warns that a `src/shared/**` block
  appended below "would silently kill that form exemption", and nothing tests that ordering.
  (`verify:import-fence`, the one flat-config gate, covers only the `@/shared/testing` fence.)
- **The seam never names a validator.** `VALIDATOR_IMPORT_PATTERNS`
  (`^(zod|valibot|arktype|yup|joi|superstruct)(/|$)`) applies to the seam's non-test files, and to
  `shared/api`'s, so the Standard Schema dependency is enforced rather than intended. It is a
  pattern, not a `paths` entry, because an exact ban on `zod` would let `zod/mini` through. The
  seam's tests are exempt and validate with real `zod` schemas: they prove the actual Standard
  Schema path, and they fail loudly if TanStack Form changes the error shape the seam reads, where
  a mocked validator would let the form silently render no message.
- **A slice owns its schema, as a factory of resolved messages.** The rules sit at module scope in
  the slice's `model` segment (`createCredentialsSchema`, `createUserNameChangeSchema`) and take
  their messages as plain strings, never `t`. The rules module therefore imports no i18n, its tests
  pass string literals and call `schema['~standard'].validate()` directly, and user-facing copy
  stays in `shared/i18n` with all other display text. A sibling hook (`useCredentialsSchema`,
  `useUserNameChangeSchema`) resolves the copy in one place. The factory returns the port itself —
  `StandardSchemaV1<Credentials, Credentials>`, the Standard Schema type rather than a Zod type —
  so the view depends on that interface rather than on Zod, and it receives the schema as a prop:
  it renders and does nothing else.
- **The schema memo depends on `[t]`.** react-i18next hands out a new `t` only when the language or
  its loaded resources change, so `[t]` rebuilds the schema exactly when its messages would change.
  It is also the dependency the linter accepts without a suppression: a memo keyed on
  `i18n.language` that calls `t` is flagged by both exhaustive-deps rules the repo runs
  (`react-hooks/exhaustive-deps` and `@eslint-react/exhaustive-deps`), and `npm run lint` fails on
  warnings.
- **A form schema validates; it never transforms.** TanStack Form runs the schema but calls
  `onSubmit` with the raw field values (`form.state.values`), never the schema's output. Typing the
  port `StandardSchemaV1<T, T>` states this in the type: a type-changing transform such as
  `zm.pipe(zm.string(), zm.transform(Number))` no longer compiles, while a same-type overwrite such
  as `zm.trim()` or `zm.toLowerCase()` still type-checks and is silently discarded — TanStack's own
  `FormValidateOrFn` constrains only the schema's input. The shipped schemas therefore trim inside
  predicates without changing the value (`isEmailAddress` in sign-in; `isPresent` and
  `isWithinLimit` in update-user-name), and normalisation happens in the outbound mapper:
  `toSignInRequestDto` trims and lowercases the email, and `toUpdateUserNameDto` trims both names.
  A slice that genuinely needs the parsed value runs the schema itself inside its own `onSubmit`,
  before mapping to the domain model: `const result = await schema['~standard'].validate(value);`,
  then narrow on `result.issues` before reading `result.value`. That is the shape both schema test
  files already use, and the `await` is required rather than cosmetic: the port lets `validate()`
  return either a result or a promise of one. The call is `~standard.validate()` rather than
  `schema.parse(value)`: a slice holds its schema as the port type `StandardSchemaV1<T, T>`, which
  declares no `parse` method, even though the `zod/mini` object behind it happens to have one.
  Transforming a field into a _different_ type additionally means widening that exported type past
  `StandardSchemaV1<T, T>`, which TanStack Form still accepts, since `FormValidateOrFn<TFormData>`
  is `FormValidateFn<TFormData> | StandardSchemaV1<TFormData, unknown>`.
- **Three schemas, not one.** The form-input schema, the wire DTO schema and the domain model have
  three reasons to change. For the name form, the form schema validates `UserNameChange` as typed
  into two inputs, `userDtoSchema` in `entities/user/api/user-dto.ts` describes the server's
  `snake_case` JSON (`first_name`, `last_name`), and `User` is the domain model with a branded
  `UserId` and a `displayName`. When two of them need the same rule, share a field-level refinement;
  never share the top-level object.
- **Every shipped schema uses `zod/mini`.** The `zod/mini` runtime already ships in the
  `schemas-*.js` chunk that `index.html` preloads, so a form schema written with it costs only its
  own code; classic `zod` beside it would add a second validator runtime, and that runtime is a
  multiple, not a rounding error. Bundled in isolation with the repo's own toolchain (Vite 8 /
  Rolldown, minified, React external), an object schema of `z.object` + `z.email` +
  `z.string().min` comes out around 79 kB raw / 18 kB gzip with classic `zod` against roughly
  14 kB / 4.5 kB with `zod/mini` — about 5× the raw bytes and 4× the gzipped bytes for the same
  rules. Read the ratio rather than the decimals: no benchmark is checked into the repo, and the
  absolute figures move with the bundler and the `zod` version (`^4.4.3` here).
  `zod/mini` composes functionally: `zm.string().check(zm.refine(predicate, message))`, and
  `zm.nullable(zm.string())` where classic `zod` would chain `.nullable()`. The rule is a
  convention, not a lint: `VALIDATOR_IMPORT_PATTERNS` covers only `shared/ui/form` and
  `shared/api`, so a feature slice importing classic `zod` passes `npm run lint`. The seam's own
  tests use classic `zod`; tests never ship.
- **Errors reveal on blur, or after the first submit attempt — never on `isTouched`.**
  `setFieldValue` sets `isTouched` on the first keystroke, so an `isTouched` gate would announce
  "Enter a valid email address." mid-word and fire again as the user types. `isBlurred` alone is
  also wrong: `handleSubmit` marks every field touched but not blurred, so a user who types and
  presses Enter would see nothing. The rule is split in two so the next field component reuses it
  instead of re-deriving it: `useFieldAria` is pure and vendor-free and receives `hasSubmitted` as
  an option, and `useFieldReveal` is the thin composer that reads it from the form store.
- **Invalidity comes from `meta.isValid`, never from the message count.** A validator can produce
  an error the seam cannot stringify, such as a bare `{ code: 'too_small' }`. Deriving invalidity
  from `messages.length` would render `aria-invalid="false"` and no alert while the form still
  refused to submit: a click that does nothing, with no message anywhere. The fallback message is
  injected — `TextField` passes `t('validation.invalid')` — rather than hard-coded, so the hook
  holds no copy. `toFieldErrorMessages` also de-duplicates, which collapses the same message
  arriving from two validators and keeps the list's React keys unique.
- **The submit button is disabled only while submitting, never for invalidity.** Errors reveal on
  blur or submit, so an untouched invalid form shows nothing; disabling the button would remove the
  only keyboard route to the error announcement. Pressing it runs validation and reveals every
  error. `submit-button.test.tsx` pins this ("stays enabled while the form is invalid so clicking it
  surfaces the errors"), because it is the behaviour most likely to be "fixed" back into a bug.
- **Every `form.Subscribe` or `useSelector` selector returns a scalar.** Both compare selector
  results with `===` (`defaultCompare` in `@tanstack/react-store`), and `form.Subscribe` exposes no
  `compare` option, so a selector returning `{ canSubmit, isSubmitting }` builds a new object on
  every store change and re-renders its subtree on every keystroke anywhere in the form. Subscribe
  twice instead; `SubmitButton` selects `state.isSubmitting` and `useFieldReveal` selects
  `state.submissionAttempts > 0`.
- **`Form` owns `noValidate` and the submit handler.** `FormProps` omits both, so a slice cannot
  re-enable native validation, whose browser bubbles would pre-empt the schema's messages, or
  bypass the `preventDefault()` that keeps the document from navigating. `Form` catches the promise
  `handleSubmit()` returns instead of voiding it: `FormApi` rethrows whatever `onSubmit` rejects
  with, and an unhandled rejection makes `vitest run` exit 1 while still reporting every test green.
  `.catch()` satisfies `@typescript-eslint/no-floating-promises` as well as `void` would, and routes
  the error to the optional `onSubmitError` instead of discarding it.
- **A slice's `onSubmit` reports failure through its own state, never by rejecting.** A rejection
  that `Form` drops is still a silent failure. Mutation-backed forms await `mutateAsync` so
  `isSubmitting` tracks the request, then swallow the rejection, because the mutation status
  already carries the failure and the outcome slot renders it; letting it propagate as well would
  report the same failure twice. `onSubmitError` is for failures no mutation state models.
- **`TextField` reads its value as `unknown` and narrows loudly.** `createFormHook` offers every
  registered field component on every field, and `useFieldContext<T>()` asserts `T` rather than
  proving it, so `field.TextField` on a number field compiles. Asserting `string` would push strings
  into a numeric field silently; `toTextValue` throws a `TypeError` naming the field instead —
  `TextField requires a string field, but "age" holds number.` in the test that pins it.
  `undefined` and `null` render as an empty control, since both are ordinary values for an optional
  field. `type` is narrowed to `TextFieldInputType`, the six text-entry types, so `TextField`
  cannot become a number, checkbox or date control; a non-string field gets its own component.
- **Form-level validation fans out.** With `validators: { onChange: schema }`, every keystroke
  re-runs the whole-object schema, and each field holding an error receives a new error array and
  re-renders, even when the keystroke was in another field. A field blurred while still empty
  therefore flips to `aria-invalid="true"` as soon as the user types in a different one. Both
  effects are defensible, and both disappear with field-level `validators` on `form.AppField` —
  the escape hatch for a large or announcement-sensitive form.
- **The public API is one hook and two types.** The components mean something only inside
  `<form.AppForm>` and `<form.AppField>`, where `createFormHook` supplies their context — outside,
  `useFormContext()` and `useFieldContext()` throw — so exporting them as values would advertise a
  way to render them broken. `use-app-form.ts` destructures only `useAppForm` from
  `createFormHook`, so its `withForm`, `withFieldGroup`, `useTypedAppFormContext` and `extendForm`
  are unreachable; neither shipped form needs them. The same boundary is why a pending action
  outside a form cannot borrow `SubmitButton`: it calls `useFormContext()` and would throw outside
  `<form.AppForm>`, so `src/features/sign-out/ui/sign-out-button-view.tsx` renders a plain `Button`
  with `variant="outline"` and repeats the pending triple itself — `aria-busy={isSigningOut}`,
  `disabled={isSigningOut}`, and a label that swaps `t('signOut.action')` for
  `t('signOut.inProgress')`. The convention travels; the component does not.
- **The seam costs one lazily loaded chunk, shared by every form.** On a production build at
  `1c193c6`, TanStack Form, the seam's components and the `Input` and `Label` primitives they
  render sit in one `form-*.js` chunk of 74.03 kB raw / 19.06 kB gzip. Almost all of that is the
  library, not the validation: when the seam first started shipping — with
  `features/update-user-name`, its first non-test consumer — the route chunk that carried it then
  grew by 19.15 kB gzip, of which the `zod/mini` schema was ~1 kB and TanStack Form plus the field
  components ~18 kB. The form library's own weight, not the `zod/mini`-versus-classic-`zod` choice
  one bullet up, is the dominant bundle decision in this seam. `index.html` does not preload that
  chunk — the entry names it only in its `__vite__mapDeps` table — so it is fetched when a
  visitor navigates to `/sign-in` or `/users/$userId`, whose route chunks import that one copy
  (`grep -lE 'submissionAttempts' dist/assets/*.js` matches it alone). `autoCodeSplitting` in
  `vite.config.ts` keeps it out of the entry. The cost is paid once and amortised: the whole
  `/sign-in` route chunk — the `features/sign-in` slice and its page — is 2.60 kB raw / 1.15 kB
  gzip. TanStack Router 1.170.32 depends on `@tanstack/react-store@^0.9.3` and TanStack Form on
  `^0.11.0`, so npm installs a second copy of `@tanstack/react-store` and `@tanstack/store` under
  `node_modules/@tanstack/react-form`; that resolves when the router widens its range. The seam's
  CSS is not lazy: Tailwind v4 scans the files under `src` rather than the import graph, so the
  utilities on `TextField`, `Input` and `Label` are in `index.css` on every page.

## Testing

The seam's tests are co-located in `src/shared/ui/form/`. The three component tests render small
harnesses through `useAppForm`, so the real contexts and the real TanStack Form store are in play,
and two of them (`submit-button.test.tsx`, `text-field.test.tsx`) validate with a real `zod`
schema; the other two test the pure pieces directly. `vitest.setup.ts` registers an English i18n
instance with `setI18n` before each test, which is how `TextField` resolves `validation.invalid`
without a provider.

- `form.test.tsx` — `Form`: native validation is off (`novalidate`); submitting runs `onSubmit`
  and the native submit event arrives `defaultPrevented`; a caller class is forwarded; a rejecting
  submit reaches `onSubmitError`; and with or without `onSubmitError`, no `unhandledRejection` is
  emitted.
- `submit-button.test.tsx` — `SubmitButton`: submits the enclosing form; stays enabled while the
  form is invalid and surfaces the errors when clicked; forwards `variant`; honours a caller
  `disabled`; while a submit is in flight it is disabled, `aria-busy="true"` and shows
  `pendingLabel`, or keeps its children when there is none.
- `text-field.test.tsx` — `TextField`: the control is reachable by its label; an untouched field has
  no `aria-describedby` and `aria-invalid="false"`; a description is linked; nothing is revealed
  while an invalid value is typed; blur reveals the schema message and links it after the
  description; pressing submit untouched reveals every field's error; simultaneous failures render
  one list item each; a corrected value clears the alert; valid values are submitted; `undefined`
  and `null` render empty; a non-string value throws the `TypeError` naming the field.
- `use-field-aria.test.ts` — `useFieldAria` in isolation: the reveal matrix (neither blurred nor
  submitted, blurred, submitted, valid), description-before-error ordering, a caller
  `describedBy` appended rather than replacing, every id rooted on a caller `id`, and the fallback
  message when no error can be stringified.
- `field-error-messages.test.ts` — `toFieldErrorMessages`: non-array input, plain strings,
  Standard Schema issues, de-duplication across validators, and blank, `null`, non-string and
  missing messages dropped.

`use-app-form.ts`, `form-contexts.ts` and `use-field-reveal.ts` have no test file of their own:
every component harness goes through them, and `text-field.test.tsx`'s untouched-submit case is
what exercises `useFieldReveal`'s `submissionAttempts` selector. The seam's consumers add their own
coverage — `src/features/sign-in/ui/sign-in-form.test.tsx` and
`src/features/update-user-name/ui/update-user-name-form.test.tsx`, which render each container and
so exercise its view, and
`credentials-schema.test.ts` and `user-name-change-schema.test.ts` for the rules — and
`e2e/user-profile.spec.ts` drives the name form in a real browser: saving, a padded name
trimmed before it reaches the wire, a blank first name blocked before any request with its
message shown, a failed save that keeps the typed values, and keyboard-only operation. See
[Unit and component testing](./unit-testing.md) and [End-to-end testing](./e2e-testing.md) for
the harnesses.

Commands:

- `npm test` runs the whole Vitest suite.
- `npx vitest run src/shared/ui/form` runs the seam's five test files; name one file to run it
  alone, e.g. `npx vitest run src/shared/ui/form/text-field.test.tsx`.
- `npm run test:coverage` runs the suite against the 90% per-file thresholds in `vite.config.ts`.
- `npm run test:e2e` runs Playwright over the production build;
  `npx playwright test e2e/user-profile.spec.ts` runs only the spec that drives the name form.

## Known limitations

- **Several props have no runtime caller.** `Form`'s `onSubmitError` and `TextField`'s
  `description` are used by no shipped form; only `form.test.tsx` and `text-field.test.tsx`
  exercise them. The same holds for `SubmitButton`'s `disabled` and `variant` (only
  `submit-button.test.tsx`) and for a caller `id` or `aria-describedby` on `TextField`, which only
  `use-field-aria.test.ts` covers, at the hook level.
- **`TextField` is the only field component.** There is no number, checkbox, select or textarea
  field, and `TextFieldInputType` admits text-entry types only.
- **No focus management after a failed submit.** Focus stays on the submit button, and every
  invalid field renders its own `role="alert"` container in the same update. No error summary
  component exists; `useFieldAria` accepts a caller `id` and merges a caller `aria-describedby` so
  one can link to each control (`#<id>`) when it is built.
- **Server errors are not mapped onto fields.** Nothing in `src/` calls `setErrorMap`, so an
  `HttpError` from a submit never marks a field invalid; failures surface only through the slice's
  outcome slot.
- **A render error thrown by a field does not reach the app's error boundary.** No route
  declares an `errorComponent`, and `createAppRouter` sets no `defaultErrorComponent` or
  `disableGlobalCatchBoundary`, so the `CatchBoundary` that TanStack Router's `Matches` renders
  around the matched route tree catches a `TextField` `TypeError` first. The router's built-in
  `ErrorComponent` ("Something went wrong!") replaces the route's content; `AppCrashFallback` is
  not shown, and because nothing sets `defaultOnCatch` either, `reportError` never receives the
  error. See [Error handling and reporting](./error-handling.md).
- **Revealed messages keep their language until the form validates again.** A locale change
  rebuilds the schema (the memo is keyed on `t`) and `useForm` hands the new validators to the form
  on the next render, but TanStack Form's `update` does not re-run validation, so messages already
  on screen stay in the previous language until the next keystroke or submit. No mounted component
  changes the locale today.
- **Long forms cannot be split into typed sections through the seam.** `withForm` and
  `withFieldGroup` are not exposed, so a slice that wants section components has to type a `form`
  prop itself with a type-only import from `@tanstack/react-form`, the one form of that import the
  lint fence allows outside the seam.
