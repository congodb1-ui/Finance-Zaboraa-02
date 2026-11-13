import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || '';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || '';

const CHUNK_SIZE = 3180;

function getStorageKey(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname;
  const projectRef = host.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

function buildSsrCookies(supabaseUrl: string, baseUrl: string, session: Session) {
  const key = getStorageKey(supabaseUrl);
  const encoded = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
  const origin = new URL(baseUrl).origin;

  if (encoded.length <= CHUNK_SIZE) {
    return [
      {
        name: key,
        value: encoded,
        url: origin,
        sameSite: 'Lax' as const,
      },
    ];
  }

  const cookies = [];
  for (let i = 0, idx = 0; i < encoded.length; i += CHUNK_SIZE, idx++) {
    cookies.push({
      name: `${key}.${idx}`,
      value: encoded.slice(i, i + CHUNK_SIZE),
      url: origin,
      sameSite: 'Lax' as const,
    });
  }
  return cookies;
}

async function createAuthedTestContext(): Promise<{
  supabase: SupabaseClient;
  userId: string;
  session: Session;
}> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_*) in environment.'
    );
  }
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error(
      'Missing TEST_USER_EMAIL and/or TEST_USER_PASSWORD environment variables.'
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });

  if (error || !data.session || !data.user) {
    throw new Error(
      `Failed to sign in test user (${TEST_USER_EMAIL}): ${error?.message || 'no session returned'}`
    );
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  });

  return {
    supabase: authedClient,
    userId: data.user.id,
    session: data.session,
  };
}

async function signInInBrowser(page: Page, session: Session, hashRoute: string = '#dashboard') {
  const cookies = buildSsrCookies(SUPABASE_URL, BASE_URL, session);
  await page.context().addCookies(cookies);
  await page.goto(`${BASE_URL}/${hashRoute}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15000 });
}

test.describe('Zaboraa Finance — End-to-End Supabase Persistence', () => {
  test('1. Account persists with opening_balance 5000 across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const accountName = `ZTEST_Acct_${Date.now()}`;
    let createdId: string | null = null;

    try {
      await signInInBrowser(page, session, '#accounts');
      await page.getByTestId('add-account-button').click();

      await page.getByPlaceholder('e.g. HDFC Salary Main, SBI Business Current').fill(accountName);
      await page.getByPlaceholder('e.g. HDFC, SBI, ICICI, Paytm').fill('HDFC Test');
      await page.getByRole('button', { name: 'Register Account' }).click();

      await expect(page.getByRole('heading', { name: accountName })).toBeVisible({ timeout: 10000 });

      const { data: created } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('name', accountName)
        .single();

      createdId = created?.id ?? null;
      expect(createdId).toBeTruthy();

      // Persist opening_balance = 5000 on the created account and verify across full reload
      const { error: balErr } = await supabase
        .from('accounts')
        .update({ opening_balance: 5000 })
        .eq('id', createdId!)
        .eq('user_id', userId);
      expect(balErr).toBeNull();

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: accountName })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('₹5,000.00').first()).toBeVisible();
    } finally {
      if (createdId) {
        await supabase.from('accounts').delete().eq('id', createdId).eq('user_id', userId);
      } else {
        await supabase.from('accounts').delete().eq('user_id', userId).eq('name', accountName);
      }
    }
  });

  test('2. Category persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const categoryName = `ZTEST_Cat_${Date.now()}`;
    let createdId: string | null = null;

    try {
      const { data: inserted, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: categoryName,
          color_index: 2,
          is_income: false,
          is_system: false,
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      createdId = inserted?.id ?? null;
      expect(createdId).toBeTruthy();

      await signInInBrowser(page, session, '#budgets');
      await page.reload({ waitUntil: 'networkidle' });

      await page.getByRole('button', { name: /Add Budget|Create Budget/i }).first().click();
      const optionLocator = page.locator('select option', { hasText: categoryName });
      await expect(optionLocator).toHaveCount(1, { timeout: 10000 });
    } finally {
      if (createdId) {
        await supabase.from('categories').delete().eq('id', createdId).eq('user_id', userId);
      }
    }
  });

  test('3. Rule persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const ruleName = `ZTEST_Rule_${Date.now()}`;

    try {
      await signInInBrowser(page, session, '#rules');
      await page.getByRole('button', { name: /Add Rule|Create Your First Rule/i }).first().click();

      await page.getByPlaceholder('e.g. Swiggy Food Delivery').fill(ruleName);
      await page.getByPlaceholder('SWIGGY').fill('TESTPERSIST');
      await page.getByRole('button', { name: 'Save Rule' }).click();

      await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('"TESTPERSIST"')).toBeVisible();
    } finally {
      await supabase
        .from('transaction_rules')
        .delete()
        .eq('user_id', userId)
        .eq('name', ruleName);
    }
  });

  test('4. Budget persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const catName = `ZTEST_BudgetCat_${Date.now()}`;
    let createdCatId: string | null = null;
    let createdBudgetId: string | null = null;

    try {
      // Dedicated custom category avoids colliding with any existing budget for default categories
      const { data: cat, error: catErr } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: catName,
          color_index: 3,
          is_income: false,
          is_system: false,
        })
        .select('id')
        .single();

      expect(catErr).toBeNull();
      createdCatId = cat?.id ?? null;
      expect(createdCatId).toBeTruthy();

      await signInInBrowser(page, session, '#budgets');
      await page.getByRole('button', { name: /Add Budget|Create Budget/i }).first().click();

      const dialog = page.getByRole('dialog');
      await dialog.locator('select').first().selectOption(createdCatId!);
      await dialog.getByPlaceholder('e.g. 15000').fill('25000');
      await dialog.getByRole('button', { name: 'Set Budget' }).click();

      await expect(page.getByRole('heading', { name: catName })).toBeVisible({ timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: catName })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('₹25,000.00').first()).toBeVisible();

      const { data: b } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_id', userId)
        .eq('category_id', createdCatId!)
        .maybeSingle();
      createdBudgetId = b?.id ?? null;
    } finally {
      if (createdBudgetId) {
        await supabase.from('budgets').delete().eq('id', createdBudgetId).eq('user_id', userId);
      } else if (createdCatId) {
        await supabase.from('budgets').delete().eq('category_id', createdCatId).eq('user_id', userId);
      }
      if (createdCatId) {
        await supabase.from('categories').delete().eq('id', createdCatId).eq('user_id', userId);
      }
    }
  });

  test('5. Invoice persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const invNum = `ZTEST-INV-${Date.now()}`;
    const clientName = `ZTEST_Client_${Date.now()}`;

    try {
      await signInInBrowser(page, session, '#invoices');
      await page.getByRole('button', { name: /New Invoice|Create First Invoice/i }).first().click();

      await page.locator('input').first().fill(invNum);
      await page.getByPlaceholder('e.g. Acme Corp India').fill(clientName);
      await page.getByRole('button', { name: 'Save Invoice' }).click();

      await expect(page.getByText(invNum)).toBeVisible({ timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByText(invNum)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(clientName)).toBeVisible();
    } finally {
      await supabase
        .from('invoices')
        .delete()
        .eq('user_id', userId)
        .eq('invoice_number', invNum);
    }
  });

  test('6. Profile saves and persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const { data: originalProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    try {
      await signInInBrowser(page, session, '#settings');
      const nameInput = page.getByPlaceholder('e.g. Wasim Sayyed');
      await expect(nameInput).toBeEnabled({ timeout: 10000 });

      await nameInput.fill('Test Owner');
      await page.getByRole('button', { name: 'Save Profile' }).click();
      await expect(page.getByText(/Profile saved to your encrypted Supabase vault/i)).toBeVisible({
        timeout: 10000,
      });

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByPlaceholder('e.g. Wasim Sayyed')).toHaveValue('Test Owner', {
        timeout: 10000,
      });
    } finally {
      await supabase
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            full_name: originalProfile?.full_name ?? null,
          },
          { onConflict: 'user_id' }
        );
    }
  });

  test('7. AI toggle persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const { data: originalAi } = await supabase
      .from('ai_settings')
      .select('ai_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    try {
      // Ensure starting state is enabled so toggling disables it cleanly
      await supabase
        .from('ai_settings')
        .upsert({ user_id: userId, ai_enabled: true }, { onConflict: 'user_id' });

      await signInInBrowser(page, session, '#settings/ai');
      const toggle = page.getByRole('switch');
      await expect(toggle).toBeEnabled({ timeout: 10000 });
      await expect(toggle).toHaveAttribute('aria-checked', 'true');

      await toggle.click();
      await expect(page.getByText('Status: AI Features Disabled')).toBeVisible({ timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByText('Status: AI Features Disabled')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    } finally {
      await supabase
        .from('ai_settings')
        .upsert(
          {
            user_id: userId,
            ai_enabled: originalAi?.ai_enabled ?? true,
          },
          { onConflict: 'user_id' }
        );
    }
  });

  test('8. Dark mode persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const { data: originalProfile } = await supabase
      .from('profiles')
      .select('dark_mode')
      .eq('user_id', userId)
      .maybeSingle();

    const startDark = Boolean(originalProfile?.dark_mode ?? false);
    const targetDark = !startDark;

    try {
      await signInInBrowser(page, session, '#settings');
      const themeButton = page
        .locator('main button[aria-label*="mode"]')
        .first();
      await expect(themeButton).toBeEnabled({ timeout: 10000 });

      await themeButton.click();
      await expect(page.getByText('Saved to profile')).toBeVisible({ timeout: 10000 });

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const hasDarkClass = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
      );
      expect(hasDarkClass).toBe(targetDark);
    } finally {
      await supabase
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            dark_mode: startDark,
          },
          { onConflict: 'user_id' }
        );
    }
  });

  test('9. Dismissed anomaly persists across reload', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const { data: originalAi } = await supabase
      .from('ai_settings')
      .select('dismissed_anomaly_ids')
      .eq('user_id', userId)
      .maybeSingle();

    try {
      await signInInBrowser(page, session, '#dashboard');

      const dismissButton = page.locator('button[title="Dismiss alert"]').first();
      const isVisible = await dismissButton
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);

      test.skip(!isVisible, 'No live AI anomalies present in test user account to dismiss');

      const initialCount = await page.locator('button[title="Dismiss alert"]').count();
      await dismissButton.click();

      await expect(page.locator('button[title="Dismiss alert"]')).toHaveCount(initialCount - 1, {
        timeout: 10000,
      });

      await page.reload({ waitUntil: 'networkidle' });
      // Wait briefly for anomaly banner load after reload
      await page.waitForTimeout(2000);
      const afterReloadCount = await page.locator('button[title="Dismiss alert"]').count();
      expect(afterReloadCount).toBe(initialCount - 1);
    } finally {
      await supabase
        .from('ai_settings')
        .upsert(
          {
            user_id: userId,
            dismissed_anomaly_ids: originalAi?.dismissed_anomaly_ids ?? [],
          },
          { onConflict: 'user_id' }
        );
    }
  });

  test('10. Logout/login persistence preserves Supabase-backed account', async ({ page }) => {
    const { supabase, userId, session } = await createAuthedTestContext();
    const accountName = `ZTEST_Relogin_${Date.now()}`;

    try {
      await signInInBrowser(page, session, '#accounts');
      await page.getByTestId('add-account-button').click();

      await page.getByPlaceholder('e.g. HDFC Salary Main, SBI Business Current').fill(accountName);
      await page.getByPlaceholder('e.g. HDFC, SBI, ICICI, Paytm').fill('ICICI Test');
      await page.getByRole('button', { name: 'Register Account' }).click();

      await expect(page.getByRole('heading', { name: accountName })).toBeVisible({ timeout: 10000 });

      // Log out
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page.getByRole('button', { name: 'Login with Google' })).toBeVisible({
        timeout: 10000,
      });

      // Sign back in via Supabase session and navigate to #accounts
      const reauth = await createAuthedTestContext();
      await signInInBrowser(page, reauth.session, '#accounts');

      await expect(page.getByRole('heading', { name: accountName })).toBeVisible({ timeout: 10000 });
    } finally {
      await supabase
        .from('accounts')
        .delete()
        .eq('user_id', userId)
        .eq('name', accountName);
    }
  });
});
