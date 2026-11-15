import 'dotenv/config';

interface RouteCheck {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
}

// Every protected Express route in src/server-app.ts (excludes public /api/auth/google)
const PROTECTED_ROUTES: RouteCheck[] = [
  { method: 'POST', path: '/api/ai/test', body: {} },
  { method: 'POST', path: '/api/ai/anomalies', body: {} },
  { method: 'POST', path: '/api/ai/chat', body: { question: 'test' } },
  { method: 'POST', path: '/api/ai/monthly-report', body: {} },
  { method: 'POST', path: '/api/ai/categorize', body: {} },
  { method: 'GET', path: '/api/export' },
  { method: 'POST', path: '/api/upload', body: {} },
  { method: 'POST', path: '/api/upload/finalize', body: { upload_id: '00000000-0000-0000-0000-000000000000' } },
  { method: 'PATCH', path: '/api/transactions/00000000-0000-0000-0000-000000000000', body: { notes: 'test' } },
  { method: 'GET', path: '/api/backup' },
  { method: 'POST', path: '/api/payment-instructions', body: { label: 'test', beneficiary_name: 'test', currency: 'USD' } },
  { method: 'PATCH', path: '/api/payment-instructions/00000000-0000-0000-0000-000000000000', body: { label: 'test' } },
  { method: 'POST', path: '/api/payment-instructions/00000000-0000-0000-0000-000000000000/reveal', body: {} },
  { method: 'POST', path: '/api/profile/pan', body: { pan: 'ABCDE1234F' } },
];

async function main() {
  const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  console.log(`Running unauthenticated auth sweep against ${baseUrl} (${PROTECTED_ROUTES.length} routes)...\n`);

  const results: Array<{
    method: string;
    path: string;
    status: number | string;
    expected: number;
    result: 'PASS' | 'FAIL';
  }> = [];

  for (const route of PROTECTED_ROUTES) {
    const url = `${baseUrl}${route.path}`;
    try {
      const res = await fetch(url, {
        method: route.method,
        headers:
          route.method === 'GET'
            ? { Accept: 'application/json' }
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: route.method === 'GET' ? undefined : JSON.stringify(route.body ?? {}),
      });

      const passed = res.status === 401;
      results.push({
        method: route.method,
        path: route.path,
        status: res.status,
        expected: 401,
        result: passed ? 'PASS' : 'FAIL',
      });
    } catch (err: any) {
      results.push({
        method: route.method,
        path: route.path,
        status: err?.message || 'FETCH_ERROR',
        expected: 401,
        result: 'FAIL',
      });
    }
  }

  console.table(results);

  const failures = results.filter((r) => r.result === 'FAIL');
  if (failures.length > 0) {
    console.error(`\nAUTH SWEEP FAILED: ${failures.length} route(s) did not return 401.`);
    process.exit(1);
    return;
  }

  console.log(`\nAUTH SWEEP PASSED: All ${results.length} protected routes returned HTTP 401 without a token.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled error in auth-sweep.ts:', err);
  process.exit(1);
});
