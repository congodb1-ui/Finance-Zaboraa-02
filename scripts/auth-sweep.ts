import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_APP_URL || 'https://finance.zaboraa.com';

const API_ENDPOINTS = [
  { path: '/api/export', method: 'GET' },
  { path: '/api/backup', method: 'GET' },
  { path: '/api/gmail/status', method: 'GET' },
  { path: '/api/analytics/reports', method: 'GET' },
  { path: '/api/payment-instructions', method: 'POST' },
  { path: '/api/payment-instructions/dummy-id', method: 'PATCH' },
  { path: '/api/payment-instructions/dummy-id/reveal', method: 'POST' },
  { path: '/api/upload', method: 'POST' },
  { path: '/api/upload/finalize', method: 'POST' },
  { path: '/api/transactions/dummy-id', method: 'PATCH' },
  { path: '/api/gmail/connect', method: 'POST' },
  { path: '/api/gmail/disconnect', method: 'POST' },
  { path: '/api/gmail/settings', method: 'PATCH' },
  { path: '/api/gmail/sync', method: 'POST' },
  { path: '/api/analytics/generate', method: 'POST' },
  { path: '/api/ai/test', method: 'POST' },
  { path: '/api/ai/anomalies', method: 'POST' },
  { path: '/api/ai/chat', method: 'POST' },
  { path: '/api/ai/monthly-report', method: 'POST' },
  { path: '/api/ai/categorize', method: 'POST' },
  { path: '/api/profile/pan', method: 'POST' },
];

export async function runAuthSweep() {
  console.log(`Running Auth Sweep against ${BASE_URL}...`);
  const openRoutes: string[] = [];

  for (const ep of API_ENDPOINTS) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.status !== 401 && res.status !== 403) {
        openRoutes.push(`${ep.method} ${ep.path} (Status: ${res.status})`);
      }
    } catch (err: any) {
      console.error(`Failed to reach ${ep.path}:`, err?.message);
    }
  }

  const passed = openRoutes.length === 0;
  console.log(`Auth Sweep Result: ${passed ? 'PASSED (0 unauthenticated routes accessible)' : 'FAILED'}`);
  if (!passed) {
    console.error('Open routes detected:', openRoutes);
  }
  return { passed, openRoutes };
}

if (process.argv[1]?.endsWith('auth-sweep.ts')) {
  runAuthSweep();
}
