import type { Locator, Page } from '@playwright/test';

const COPY = {
  formName: 'Update name',
  firstNameLabel: 'First name',
  lastNameLabel: 'Last name',
  saveButton: 'Save name',
  saved: 'Name updated.',
  failed: 'The name could not be updated.',
  unavailable: 'This profile could not be loaded.',
  firstNameRequired: 'Enter a first name.',
  notificationsRegion: 'Notifications',
} as const;

export interface UserProfilePageObject {
  readonly open: (userId: string) => Promise<void>;
  readonly content: () => Locator;
  readonly displayName: () => Locator;
  readonly firstNameField: () => Locator;
  readonly lastNameField: () => Locator;
  readonly saveButton: () => Locator;
  readonly savedNotice: () => Locator;
  readonly failureNotice: () => Locator;
  readonly unavailableNotice: () => Locator;
  readonly firstNameRequiredError: () => Locator;
}

export function createUserProfilePageObject(page: Page): UserProfilePageObject {
  const form = () => page.getByRole('form', { name: COPY.formName });

  return {
    open: async (userId) => {
      await page.goto(`/users/${userId}`);
    },
    content: () => page.getByRole('main'),
    displayName: () => page.getByRole('heading', { level: 1 }),
    firstNameField: () => form().getByLabel(COPY.firstNameLabel),
    lastNameField: () => form().getByLabel(COPY.lastNameLabel),
    saveButton: () => form().getByRole('button', { name: COPY.saveButton }),
    savedNotice: () =>
      page
        .getByRole('region', { name: new RegExp(`^${COPY.notificationsRegion}\\b`) })
        .getByText(COPY.saved),
    failureNotice: () => page.getByText(COPY.failed),
    unavailableNotice: () => page.getByText(COPY.unavailable),
    firstNameRequiredError: () => form().getByText(COPY.firstNameRequired),
  };
}
