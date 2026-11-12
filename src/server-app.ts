import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';

import { testGeminiConnection } from './lib/ai/gemini-client';
import { detectAnomaliesWithAI, getCachedAnomalies } from './lib/ai/anomalies';
import { askYourDataChat } from './lib/ai/chat';
import { generateMonthlyReportWithAI } from './lib/ai/monthly-report';
import { categorizeTransactionsWithAI } from './lib/ai/categorize';
import {
  getTransactions,
  applyAICategorizations,
  getAllTransactions,
  getITRSummaryData,
  commitUploadTransactions,
  updateTransaction,
} from './lib/actions/transactions';
import { getCategories } from './lib/actions/categories';
import { getAccounts } from './lib/actions/accounts';
import type { Transaction } from './types/transactions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export async function runServer() {
  const app = express();
  const PORT = 3000;
  const HOST = '0.0.0.0';

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // --- API Routes ---

  // 1. Gemini Test Connection
  app.post('/api/ai/test', async (_req: Request, res: Response) => {
    try {
      const result = await testGeminiConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message || 'Error occurred while testing Gemini connection.',
      });
    }
  });

  // 2. Anomaly Detection
  app.post('/api/ai/anomalies', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.body?.forceRefresh === true;

      if (!forceRefresh) {
        const cached = getCachedAnomalies();
        if (cached.length > 0) {
          return res.json({ success: true, anomalies: cached, fromCache: true });
        }
      }

      const ledger = await getTransactions({
        page: 1,
        pageSize: 150,
        filters: {
          startDate: '2024-04-01',
          endDate: '2028-03-31',
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      });

      const anomalies = await detectAnomaliesWithAI(ledger.transactions);

      res.json({
        success: true,
        anomalies,
        count: anomalies.length,
      });
    } catch (err: any) {
      console.error('Anomalies API error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Error running anomaly detection.',
      });
    }
  });

  // 3. Ask-Your-Data Chat
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    try {
      const question = (req.body?.question || '').trim();

      if (!question) {
        return res.status(400).json({ error: 'Question string is required.' });
      }

      const result = await askYourDataChat(question);

      res.json({
        success: true,
        answer: result.answer,
        queryParams: result.queryParams,
        dataSummary: result.dataSummary,
      });
    } catch (err: any) {
      console.error('Chat API error:', err);
      res.status(500).json({
        success: false,
        error: 'AI is currently unavailable. Try again later.',
        details: err.message,
      });
    }
  });

  // 4. Monthly Financial Report
  app.post('/api/ai/monthly-report', async (req: Request, res: Response) => {
    try {
      const month = req.body?.month;
      const report = await generateMonthlyReportWithAI(month);

      res.json({
        success: true,
        report,
      });
    } catch (err: any) {
      console.error('Monthly report API route error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to generate monthly AI report.',
      });
    }
  });

  // 5. Automated AI Categorization
  app.post('/api/ai/categorize', async (req: Request, res: Response) => {
    try {
      const { transactionIds, uploadId } = req.body || {};

      const ledger = await getTransactions({
        page: 1,
        pageSize: 200,
        filters: {
          startDate: '2024-04-01',
          endDate: '2028-03-31',
          accountIds: [],
          categoryIds: [],
          workspaceId: 'all',
          txnType: 'all',
          search: '',
        },
      });

      let targetTxns: Transaction[] = ledger.transactions;
      if (Array.isArray(transactionIds) && transactionIds.length > 0) {
        targetTxns = targetTxns.filter((t: Transaction) => transactionIds.includes(t.id));
      } else if (uploadId) {
        targetTxns = targetTxns.filter((t: Transaction) => t.upload_id === uploadId);
      } else {
        targetTxns = targetTxns.filter((t: Transaction) => !t.category_id);
      }

      if (targetTxns.length === 0) {
        return res.json({
          success: true,
          message: 'No eligible uncategorized transactions found.',
          summary: {
            totalProcessed: 0,
            autoAppliedHigh: 0,
            autoAppliedMedium: 0,
            needsReviewLow: 0,
          },
        });
      }

      const categories = await getCategories();
      const summary = await categorizeTransactionsWithAI(targetTxns, categories);

      if (summary.results.length > 0) {
        await applyAICategorizations(summary.results);
      }

      res.json({
        success: true,
        summary,
      });
    } catch (err: any) {
      console.error('Categorize API Route error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error during AI categorization.',
      });
    }
  });

  // 6. Financial Export (Excel & CSV)
  app.get('/api/export', async (req: Request, res: Response) => {
    try {
      const format = (req.query.format as string) || 'xlsx';
      const fy = (req.query.fy as string) || 'FY2026-27';
      const workspace = (req.query.workspace as string) || 'all';

      if (format === 'tally') {
        return res.status(501).json({
          error: 'TALLY_EXPORT_COMING_SOON',
          message: 'Tally XML export is coming in a future update.',
        });
      }

      let startDate = '2026-04-01';
      let endDate = '2027-03-31';
      if (fy === 'FY2025-26') {
        startDate = '2025-04-01';
        endDate = '2026-03-31';
      } else if (fy === 'FY2024-25') {
        startDate = '2024-04-01';
        endDate = '2025-03-31';
      }

      const [allTxns, accounts, categories, itrData] = await Promise.all([
        getAllTransactions(),
        getAccounts(),
        getCategories(),
        getITRSummaryData({ startDate, endDate }),
      ]);

      let filteredTxns = allTxns.filter((t) => t.txn_date >= startDate && t.txn_date <= endDate);
      if (workspace && workspace !== 'all') {
        filteredTxns = filteredTxns.filter((t) => {
          if (workspace === 'Personal') return t.workspace_id === 'ws_personal';
          if (workspace === 'Business') return t.workspace_id === 'ws_business';
          if (workspace === 'Mixed') return t.workspace_id === 'ws_mixed';
          return t.workspace_id === workspace;
        });
      }

      const todayStr = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        const csvRows = filteredTxns.map((t) => ({
          'Transaction ID': t.id,
          Date: t.txn_date,
          Description: t.description,
          'Raw Description': t.raw_description || '',
          Account: t.account?.name || '',
          'Bank Name': t.account?.bank_name || '',
          Category: t.category?.name || 'Uncategorized',
          Workspace: t.workspace?.name || 'Personal',
          'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : '',
          'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : '',
          'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : '',
          'Reference / UTR': t.reference_number || '',
          'Is Transfer': t.is_transfer ? 'YES' : 'NO',
          'Transfer Pair ID': t.transfer_pair_id || '',
          'Transaction Type': t.txn_type || '',
          Tags: (t.tags || []).join('; '),
          Notes: t.notes || '',
          'Is Manual': t.is_manual ? 'YES' : 'NO',
        }));

        const worksheet = XLSX.utils.json_to_sheet(csvRows);
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="zaboraa-transactions-${fy}-${todayStr}.csv"`
        );
        return res.send(csvContent);
      }

      // Excel workbook
      const workbook = XLSX.utils.book_new();

      const txnSheetRows = filteredTxns.map((t) => ({
        'Transaction ID': t.id,
        Date: t.txn_date,
        Description: t.description,
        'Raw Description': t.raw_description || '',
        Account: t.account?.name || '',
        'Bank Name': t.account?.bank_name || '',
        Category: t.category?.name || 'Uncategorized',
        Workspace: t.workspace?.name || 'Personal',
        'Debit Amount': t.debit !== null && t.debit !== undefined ? Number(t.debit) : null,
        'Credit Amount': t.credit !== null && t.credit !== undefined ? Number(t.credit) : null,
        'Account Balance': t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
        'Reference / UTR': t.reference_number || '',
        'Is Transfer': t.is_transfer ? 'YES' : 'NO',
        'Transfer Pair ID': t.transfer_pair_id || '',
        'Transaction Type': t.txn_type || '',
        Tags: (t.tags || []).join('; '),
        Notes: t.notes || '',
        'Is Manual': t.is_manual ? 'YES' : 'NO',
      }));
      const sheet1 = XLSX.utils.json_to_sheet(txnSheetRows);
      sheet1['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Transactions');

      const itrRows = itrData.lineItems.map((item) => ({
        Section: item.section,
        'Line Item': item.lineItem,
        'Amount (INR)': Number(item.amount),
      }));
      const sheet2 = XLSX.utils.json_to_sheet(itrRows);
      sheet2['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet2, 'ITR Summary');

      const catMap = new Map<string, { debits: number; credits: number; count: number }>();
      for (const t of filteredTxns) {
        const cName = t.category?.name || 'Uncategorized';
        const cur = catMap.get(cName) || { debits: 0, credits: 0, count: 0 };
        cur.debits += t.debit ?? 0;
        cur.credits += t.credit ?? 0;
        cur.count += 1;
        catMap.set(cName, cur);
      }
      const catRows = Array.from(catMap.entries()).map(([cName, data]) => ({
        Category: cName,
        'Total Debit Outflows (INR)': Math.round(data.debits * 100) / 100,
        'Total Credit Inflows (INR)': Math.round(data.credits * 100) / 100,
        'Transaction Count': data.count,
      }));
      const sheet3 = XLSX.utils.json_to_sheet(catRows);
      sheet3['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Category Breakdown');

      const accSummaryRows = accounts.map((acc) => {
        const accTxns = filteredTxns.filter((t) => t.account_id === acc.id);
        let totalC = 0;
        let totalD = 0;
        for (const tx of accTxns) {
          totalC += tx.credit ?? 0;
          totalD += tx.debit ?? 0;
        }
        const openBal = acc.opening_balance ?? 0;
        const closing = openBal + totalC - totalD;

        return {
          'Account Nickname': acc.name,
          'Bank Name': acc.bank_name,
          'Account Type': acc.account_type,
          'Opening Balance (INR)': Number(openBal),
          'Total Credits (INR)': Math.round(totalC * 100) / 100,
          'Total Debits (INR)': Math.round(totalD * 100) / 100,
          'Closing Balance (INR)': Math.round(closing * 100) / 100,
        };
      });
      const sheet4 = XLSX.utils.json_to_sheet(accSummaryRows);
      sheet4['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, sheet4, 'Account Summary');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="zaboraa-export-${fy}-${todayStr}.xlsx"`
      );
      res.send(buffer);
    } catch (err: any) {
      console.error('Export route error:', err);
      res.status(500).json({ error: err.message || 'Internal error generating financial export.' });
    }
  });

  // 7. Finalize Upload Import
  app.post('/api/upload/finalize', async (req: Request, res: Response) => {
    try {
      const { upload_id, replace_previous_id } = req.body || {};
      if (!upload_id) {
        return res.status(400).json({ error: 'upload_id is required.' });
      }

      const result = await commitUploadTransactions(upload_id, replace_previous_id);
      res.json(result);
    } catch (err: any) {
      console.error('Finalize upload error:', err);
      res.status(500).json({ error: err.message || 'Internal error finalizing statement upload.' });
    }
  });

  // 8. Update Transaction
  app.patch('/api/transactions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: 'Transaction id is required.' });
      }

      const body = req.body || {};
      if (body.debit !== undefined || body.credit !== undefined || body.balance !== undefined) {
        return res.status(400).json({
          error: 'Transaction amounts are sacred and non-editable after import.',
        });
      }

      const updated = await updateTransaction(id, {
        category_id: body.category_id,
        workspace_id: body.workspace_id,
        tags: body.tags,
        notes: body.notes,
        txn_type: body.txn_type,
        is_transfer: body.is_transfer,
        transfer_pair_id: body.transfer_pair_id,
      });

      res.json(updated);
    } catch (err: any) {
      console.error('Update transaction error:', err);
      res.status(500).json({ error: err.message || 'Internal error updating transaction.' });
    }
  });

  // --- Frontend Serving (Vite dev middleware or Static dist) ---
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(ROOT_DIR, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(ROOT_DIR, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      root: ROOT_DIR,
      server: {
        middlewareMode: true,
        host: HOST,
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Zaboraa Finance server running on http://${HOST}:${PORT}`);
  });
}
