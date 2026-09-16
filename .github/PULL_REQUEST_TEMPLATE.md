## What and why

<!-- What changes, and what problem it solves. Link any related issue; screenshot any UI change. -->

## Notes for the reviewer

<!-- Trade-offs, alternatives you rejected, anything you are unsure about. Delete if empty. -->

## Checklist

- [ ] `npm run audit` passes locally
- [ ] `npm run test:e2e` passes (it runs outside the audit)
- [ ] Changes to the `Dockerfile`, `docker/` or security headers also pass against the container
- [ ] Tests cover the new behaviour (every source file is held at 90%)
- [ ] Imports follow the FSD layer order and go through each slice's public API (`npm run arch`)
- [ ] New UI passes `npm run lint:a11y` and works with the keyboard alone
- [ ] New translation keys exist in every locale under `src/shared/i18n/locales/`
- [ ] API data reaches components only through a DTO mapper into a frontend model
- [ ] Affected documentation under `docs/features/` is updated
- [ ] The title follows Conventional Commits without a scope — the squash merge commits it to `main`
