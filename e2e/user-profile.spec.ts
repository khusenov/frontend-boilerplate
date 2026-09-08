import { expect, test } from './fixtures/harness';
import { SERVER_ERROR_STATUS } from './fixtures/http-contract';
import type { UserWireRecord } from './fixtures/user-stub';
import { createUserProfilePageObject } from './page-objects/user-profile-page-object';

const ADA: UserWireRecord = {
  id: 'u_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.test',
  role: 'ADMIN',
  created_at: '2024-01-05T12:00:00.000Z',
};

test.describe('user profile', () => {
  test.beforeEach(({ userStub }) => {
    userStub.seed(ADA);
  });

  test('renders the mapped domain model from the wire payload', async ({ page }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open(ADA.id);

    await expect(profile.displayName()).toHaveText('Ada Lovelace');
    await expect(profile.content()).toContainText('ada@example.test');
    await expect(profile.content()).toContainText('Administrator');
    await expect(profile.content()).toContainText('January 5, 2024');
  });

  test('saves a new name and shows the refetched profile', async ({ page, userStub }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open(ADA.id);
    await profile.firstNameField().fill('Augusta');
    await profile.saveButton().click();

    await expect(profile.savedNotice()).toBeVisible();
    await expect(profile.displayName()).toHaveText('Augusta Lovelace');
    expect(userStub.namePatches()).toEqual([{ first_name: 'Augusta', last_name: 'Lovelace' }]);
  });

  test('trims the submitted name before it reaches the wire', async ({ page, userStub }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open(ADA.id);
    await profile.firstNameField().fill('   Augusta   ');
    await profile.saveButton().click();

    await expect(profile.savedNotice()).toBeVisible();
    expect(userStub.namePatches()).toEqual([{ first_name: 'Augusta', last_name: 'Lovelace' }]);
  });

  test('reports a rejected save without discarding what was typed', async ({ page, userStub }) => {
    const profile = createUserProfilePageObject(page);

    userStub.failNextNameUpdate(SERVER_ERROR_STATUS);

    await profile.open(ADA.id);
    await profile.lastNameField().fill('Byron');
    await profile.saveButton().click();

    await expect(profile.failureNotice()).toBeVisible();
    await expect(profile.lastNameField()).toHaveValue('Byron');
    await expect(profile.displayName()).toHaveText('Ada Lovelace');
  });

  test('blocks a blank first name before it reaches the network', async ({ page, userStub }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open(ADA.id);
    await profile.firstNameField().fill('   ');
    await profile.saveButton().click();

    await expect(profile.firstNameRequiredError()).toBeVisible();
    expect(userStub.namePatches()).toEqual([]);
  });

  test('shows the unavailable state when the profile does not exist', async ({ page }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open('u_missing');

    await expect(profile.unavailableNotice()).toBeVisible();
  });

  test('keeps the form operable by keyboard alone', async ({ page }) => {
    const profile = createUserProfilePageObject(page);

    await profile.open(ADA.id);
    await profile.firstNameField().focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('Augusta');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    await expect(profile.saveButton()).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(profile.savedNotice()).toBeVisible();
  });
});
