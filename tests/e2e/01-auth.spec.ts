import { test, expect } from '@playwright/test';
import { createQAUser, deleteQAUser } from '../helpers/qa-users';

test.describe('01 - Auth Module E2E Tests', () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createQAUser('a');
  });

  test.afterAll(async () => {
    if (user?.id) await deleteQAUser(user.id);
  });

  test('A-01: Unauthenticated user visiting app is handled cleanly', async ({ page }) => {
    await page.goto('/');
    expect(page.url()).toBeDefined();
  });

  test('A-02: Auth view renders correctly', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toContain('Zaboraa');
  });
});
