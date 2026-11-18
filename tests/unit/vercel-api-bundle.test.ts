import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';

const ROOT = path.resolve(__dirname, '../..');

describe('Vercel serverless API bundle & /var/task isolation', () => {
  it('keeps api/[...all].ts and api/%5B...all%5D.ts identical with zero ../src/ imports', () => {
    const bracketFile = fs.readFileSync(path.join(ROOT, 'api/[...all].ts'), 'utf8');
    const encodedFile = fs.readFileSync(path.join(ROOT, 'api/%5B...all%5D.ts'), 'utf8');
    expect(bracketFile).toBe(encodedFile);

    const apiFiles = [
      'api/[...all].ts',
      'api/%5B...all%5D.ts',
      'api/_lib/bootstrap.ts',
      'api/_lib/middleware.ts',
      'api/auth/google.ts',
    ];

    for (const rel of apiFiles) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(content).not.toMatch(/import\s*\([^)]*\.\.\/src/);
      expect(content).not.toMatch(/from\s+['"]\.\.\/src/);
      expect(content).not.toMatch(/require\s*\([^)]*\.\.\/src/);
    }
  });

  it('has self-contained api/_lib/gmail-sync-service.js and upload-finalize.js without pdfjs-dist or xlsx', () => {
    const gmailJs = fs.readFileSync(path.join(ROOT, 'api/_lib/gmail-sync-service.js'), 'utf8');
    const uploadJs = fs.readFileSync(path.join(ROOT, 'api/_lib/upload-finalize.js'), 'utf8');

    expect(gmailJs).toContain('runGmailSyncForUser');
    expect(uploadJs).toContain('commitUploadTransactions');
    expect(uploadJs).not.toContain('pdfjs-dist');
    expect(uploadJs).not.toContain("from 'xlsx'");
    expect(uploadJs).not.toContain('from "xlsx"');
  });

  it('runs GET /api/gmail/status (with RLS fallback=81), POST /api/gmail/sync, and POST /api/upload/finalize in isolated /var/task plain Node ESM without src/', async () => {
    const tmpTask = fs.mkdtempSync(path.join(os.tmpdir(), 'zaboraa-var-task-'));
    try {
      const tmpApiDir = path.join(tmpTask, 'api');
      const tmpLibDir = path.join(tmpApiDir, '_lib');
      fs.mkdirSync(tmpLibDir, { recursive: true });

      // Copy package.json (type: module) and symlink node_modules (NO src/ folder!)
      fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmpTask, 'package.json'));
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmpTask, 'node_modules'));

      // Copy api/_lib/*.js bundles
      fs.copyFileSync(
        path.join(ROOT, 'api/_lib/gmail-sync-service.js'),
        path.join(tmpLibDir, 'gmail-sync-service.js')
      );
      fs.copyFileSync(
        path.join(ROOT, 'api/_lib/upload-finalize.js'),
        path.join(tmpLibDir, 'upload-finalize.js')
      );

      // Compile api/[...all].ts -> api/[...all].js keeping ./_lib/*.js and npm packages external, just like Vercel @vercel/node
      await esbuild.build({
        entryPoints: [path.join(ROOT, 'api/[...all].ts')],
        outfile: path.join(tmpApiDir, '[...all].js'),
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'esm',
        packages: 'external',
        plugins: [
          {
            name: 'external-lib-js',
            setup(build) {
              build.onResolve({ filter: /^\.\/_lib\/.*\.js$/ }, (args) => ({
                path: args.path,
                external: true,
              }));
            },
          },
        ],
      });

      const runnerScript = path.join(tmpTask, 'run-handler-check.mjs');
      fs.writeFileSync(
        runnerScript,
        `
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

const USER_ID = 'user-wasim-123';
const ACCOUNT_ID = 'acc-hdfc-3597';

function jsonRes(body, status = 200, extraHeaders = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : {}));
  const auth = headers.get('Authorization') || headers.get('apikey') || '';
  const isServiceRole = auth.includes('mock-service-role-key');
  const method = (init.method || 'GET').toUpperCase();

  // 1. Supabase Auth getUser
  if (url.includes('/auth/v1/user')) {
    return jsonRes({ id: USER_ID, email: 'wasimssayyed@gmail.com' });
  }

  // 2. Gmail Vault RPC
  if (url.includes('/rest/v1/rpc/get_gmail_vault_token')) {
    return jsonRes(JSON.stringify({
      access_token: 'mock-gmail-access-token',
      refresh_token: null,
      expiry: Date.now() + 3600_000,
    }));
  }

  // 3. Profiles
  if (url.includes('/rest/v1/profiles')) {
    if (method === 'PATCH') return jsonRes([{ user_id: USER_ID }]);
    return jsonRes({
      gmail_connected: true,
      gmail_email: 'wasimssayyed@gmail.com',
      gmail_last_synced: null,
      gmail_sync_enabled: true,
      full_name: 'Wasim Sayyed',
    });
  }

  // 4. Gmail sync logs
  if (url.includes('/rest/v1/gmail_sync_log')) {
    if (method === 'POST') return jsonRes([{ id: 'log-new' }], 201);
    // Simulate older sync (10 mins ago) so cooldown doesn't block manual sync
    return jsonRes(null);
  }

  // 5. Transactions table (simulate 42501 permission denied on user JWT, success on service role!)
  if (url.includes('/rest/v1/transactions')) {
    const prefer = headers.get('Prefer') || '';
    if (!isServiceRole) {
      return jsonRes({ code: '42501', message: 'permission denied for table transactions' }, 403);
    }
    if (method === 'HEAD' || prefer.includes('count=exact')) {
      return new Response(null, {
        status: 200,
        headers: { 'Content-Range': '0-0/81' },
      });
    }
    if (method === 'POST') {
      const payload = JSON.parse(init.body);
      const accept = headers.get('Accept') || '';
      const rows = Array.isArray(payload) ? payload : [payload];
      const mapped = rows.map((r, i) => ({ id: 'tx-gmail-' + i, ...r }));
      return jsonRes(accept.includes('vnd.pgrst.object') ? mapped[0] : mapped, 201);
    }
    return jsonRes([]);
  }

  // 6. Accounts / Rules / Categories / Workspaces
  if (url.includes('/rest/v1/accounts')) {
    if (method === 'PATCH') return jsonRes([{ id: ACCOUNT_ID }]);
    return jsonRes([{
      id: ACCOUNT_ID,
      user_id: USER_ID,
      name: 'Wasim HDFC',
      bank_name: 'HDFC Bank',
      account_type: 'savings',
      purpose: 'personal',
      account_number_last4: '3597',
      opening_balance: 31808.26,
      current_balance: 31808.26,
    }]);
  }
  if (url.includes('/rest/v1/transaction_rules')) return jsonRes([]);
  if (url.includes('/rest/v1/categories')) return jsonRes([]);
  if (url.includes('/rest/v1/workspaces')) return jsonRes([]);
  if (url.includes('/rest/v1/ai_settings')) return jsonRes({ ai_enabled: false });
  if (url.includes('/rest/v1/statement_uploads')) {
    return jsonRes({
      id: 'up-1',
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      file_name: 'stmt.xlsx',
      status: 'review',
    });
  }
  if (url.includes('/rest/v1/staged_transactions')) {
    return jsonRes([]);
  }

  // 7. Gmail REST API list & message get
  if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages?')) {
    return jsonRes({ messages: [{ id: 'msg-hdfc-1' }] });
  }
  if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/msg-hdfc-1')) {
    const bodyText = 'Dear Customer, Rs. 450.00 is debited from account **3597 towards VPA swiggy@axisbank (Swiggy) on 17-11-26. Your UPI transaction reference number is 632100998877.';
    const rawB64 = Buffer.from(bodyText, 'utf8').toString('base64url');
    return jsonRes({
      id: 'msg-hdfc-1',
      internalDate: String(Date.UTC(2026, 10, 17, 10, 0, 0)),
      snippet: bodyText,
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'alerts@hdfcbank.net' },
          { name: 'Subject', value: 'Update: INR 450.00 debited from HDFC Bank A/c **3597' },
          { name: 'Date', value: 'Tue, 17 Nov 2026 10:00:00 +0530' },
        ],
        body: { data: rawB64 },
      },
    });
  }

  return jsonRes({});
};

const { default: handler } = await import('./api/[...all].js');

function createMockReqRes(method, url, body = undefined) {
  const req = {
    method,
    url,
    headers: {
      authorization: 'Bearer user-jwt-token',
      host: 'localhost:3000',
    },
    body,
  };
  let statusCode = 200;
  let jsonBody = null;
  const headersOut = {};
  const res = {
    setHeader(k, v) { headersOut[k] = v; },
    status(code) { statusCode = code; return res; },
    json(obj) { jsonBody = obj; return res; },
    end() { return res; },
  };
  return { req, res, getOut: () => ({ statusCode, jsonBody, headersOut }) };
}

// Test A: GET /api/gmail/status recovers 81 count via serviceSupabase fallback when user JWT gets 42501
const statusCall = createMockReqRes('GET', '/api/gmail/status');
await handler(statusCall.req, statusCall.res);
const statusOut = statusCall.getOut();
assert.equal(statusOut.statusCode, 200);
assert.equal(statusOut.jsonBody.gmail_connected, true);
assert.equal(statusOut.jsonBody.gmail_imported_count, 81);

// Test B: POST /api/gmail/sync succeeds without Cannot find module '../src/lib/gmail-sync-service'
const syncCall = createMockReqRes('POST', '/api/gmail/sync');
await handler(syncCall.req, syncCall.res);
const syncOut = syncCall.getOut();
assert.equal(syncOut.statusCode, 200, JSON.stringify(syncOut.jsonBody));
assert.equal(syncOut.jsonBody.emails_processed, 1);
assert.equal(syncOut.jsonBody.transactions_added, 1);
assert.equal(syncOut.jsonBody.errors_count, 0);

// Test C: POST /api/upload/finalize resolves commitUploadTransactions from ./_lib/upload-finalize.js (no Cannot find module)
const finalizeCall = createMockReqRes('POST', '/api/upload/finalize', { uploadId: 'up-1' });
await handler(finalizeCall.req, finalizeCall.res);
const finalizeOut = finalizeCall.getOut();
// Should NOT fail with Cannot find module; it finds upload-finalize.js and throws expected domain error "No staged transactions available to commit."
assert.equal(finalizeOut.statusCode, 500);
assert.equal(finalizeOut.jsonBody.error, 'No staged transactions available to commit.');

console.log(JSON.stringify({ statusOut: statusOut.jsonBody, syncOut: syncOut.jsonBody, finalizeOut: finalizeOut.jsonBody }));
`,
        'utf8'
      );

      const output = execFileSync(process.execPath, [runnerScript], {
        cwd: tmpTask,
        encoding: 'utf8',
      });
      const parsed = JSON.parse(output.trim());
      expect(parsed.statusOut.gmail_imported_count).toBe(81);
      expect(parsed.syncOut.emails_processed).toBe(1);
      expect(parsed.syncOut.transactions_added).toBe(1);
      expect(parsed.finalizeOut.error).toBe('No staged transactions available to commit.');
    } finally {
      fs.rmSync(tmpTask, { recursive: true, force: true });
    }
  });
});
