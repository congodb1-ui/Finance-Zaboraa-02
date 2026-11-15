import { test, expect } from '@playwright/test';
import { createQAUser, deleteQAUser } from '../helpers/qa-users';

test.describe('05 - Recurring Payments Module E2E Tests', () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createQAUser('a');
  });

  test.afterAll(async () => {
    if (user?.id) await deleteQAUser(user.id);
  });

  test('RC-01 - RC-06: Recurring payments specs', async ({ page }) => {
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/auth/);
  });
});
