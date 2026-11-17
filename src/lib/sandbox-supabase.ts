// SANDBOX-ONLY IN-MEMORY SUPABASE STUB — REMOVE BEFORE PRODUCTION DEPLOYMENT
// Used ONLY when VITE_SUPABASE_URL is unconfigured/placeholder and sandbox login is active.

import type { User } from '@supabase/supabase-js';
import {
  SANDBOX_DEFAULT_USER,
  getSandboxSession,
  clearSandboxSession,
} from './sandbox-auth';
import { ALLOWED_AUTO_CATEGORIES } from './auto-categorize/constants';

const DB_STORAGE_KEY = 'zaboraa_sandbox_db_v1';

type Row = Record<string, any>;
type TableMap = Record<string, Row[]>;

function uuid(prefix: string, idx: number): string {
  const hex = idx.toString(16).padStart(12, '0');
  const p = prefix.padStart(8, '0').slice(0, 8);
  return `${p}-0000-4000-8000-${hex}`;
}

function buildSeedData(userId: string): TableMap {
  const now = new Date().toISOString();
  const wsPersonalId = uuid('10000001', 1);
  const wsBusinessId = uuid('10000001', 2);
  const wsMixedId = uuid('10000001', 3);

  const accHdfcId = uuid('20000001', 1);
  const accIciciId = uuid('20000001', 2);
  const accKotakCcId = uuid('20000001', 3);

  const catSalaryId = uuid('30000001', 1);
  const catConsultingId = uuid('30000001', 2);
  const catSoftwareId = uuid('30000001', 3);
  const catFoodId = uuid('30000001', 4);
  const catRentId = uuid('30000001', 5);
  const catUtilitiesId = uuid('30000001', 6);
  const catTravelId = uuid('30000001', 7);
  const catTransferId = uuid('30000001', 8);

  const clientId = uuid('40000001', 1);
  const bizProfileId = uuid('50000001', 1);
  const payInstrId = uuid('60000001', 1);
  const invoiceId = uuid('70000001', 1);
  const uploadId = uuid('80000001', 1);

  return {
    profiles: [
      {
        id: uuid('00000001', 1),
        user_id: userId,
        full_name: 'Wasim Sayyed',
        email: 'wasimssayyed@gmail.com',
        phone: '+91 98200 00000',
        address: 'Mumbai, Maharashtra, India',
        default_fy: '2026-27',
        dark_mode: false,
        pan_encrypted: null,
        last_backup_at: null,
        gmail_connected: false,
        gmail_email: null,
        gmail_last_synced: null,
        gmail_sync_enabled: true,
        created_at: now,
        updated_at: now,
      },
    ],
    ai_settings: [
      {
        id: uuid('00000002', 1),
        user_id: userId,
        ai_enabled: true,
        feature_toggles: {},
        monthly_report_last_run_at: null,
        monthly_report_cache: null,
        dismissed_anomaly_ids: [],
        created_at: now,
        updated_at: now,
      },
    ],
    workspaces: [
      {
        id: wsPersonalId,
        user_id: userId,
        name: 'Personal',
        description: 'Personal household & savings',
        color_index: 0,
        is_default: true,
        created_at: now,
      },
      {
        id: wsBusinessId,
        user_id: userId,
        name: 'Business',
        description: 'Freelance & consulting operations',
        color_index: 2,
        is_default: false,
        created_at: now,
      },
      {
        id: wsMixedId,
        user_id: userId,
        name: 'Mixed',
        description: 'Shared personal & business expenses',
        color_index: 4,
        is_default: false,
        created_at: now,
      },
    ],
    categories: [
      {
        id: catSalaryId,
        user_id: userId,
        name: 'Consulting & Retainers',
        icon: 'Briefcase',
        color_index: 2,
        is_income: true,
        is_system: true,
        created_at: now,
      },
      {
        id: catConsultingId,
        user_id: userId,
        name: 'Export Services Income',
        icon: 'Globe',
        color_index: 3,
        is_income: true,
        is_system: true,
        created_at: now,
      },
      {
        id: catSoftwareId,
        user_id: userId,
        name: 'Cloud & SaaS Subscriptions',
        icon: 'Cloud',
        color_index: 0,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      {
        id: catFoodId,
        user_id: userId,
        name: 'Food & Dining',
        icon: 'Utensils',
        color_index: 5,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      {
        id: catRentId,
        user_id: userId,
        name: 'Rent & Coworking',
        icon: 'Home',
        color_index: 1,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      {
        id: catUtilitiesId,
        user_id: userId,
        name: 'Utilities & Telecom',
        icon: 'Zap',
        color_index: 6,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      {
        id: catTravelId,
        user_id: userId,
        name: 'Travel & Commute',
        icon: 'Plane',
        color_index: 7,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      {
        id: catTransferId,
        user_id: userId,
        name: 'Self Transfer',
        icon: 'ArrowLeftRight',
        color_index: 8,
        is_income: false,
        is_system: true,
        created_at: now,
      },
      ...ALLOWED_AUTO_CATEGORIES.map((spec, idx) => ({
        id: uuid('30000002', idx + 1),
        user_id: userId,
        name: spec.name,
        icon: spec.icon,
        color_index: spec.color_index,
        is_income: spec.is_income,
        is_system: true,
        created_at: now,
      })),
    ],
    accounts: [
      {
        id: accHdfcId,
        user_id: userId,
        name: 'HDFC Savings',
        bank_name: 'HDFC Bank',
        account_type: 'savings',
        account_number_last4: '4821',
        currency: 'INR',
        is_active: true,
        color_index: 0,
        purpose: 'personal',
        ifsc: 'HDFC0000123',
        opening_balance: 385000,
        opening_date: '2026-04-01',
        operated_by_owner: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: accIciciId,
        user_id: userId,
        name: 'ICICI Business Current',
        bank_name: 'ICICI Bank',
        account_type: 'current',
        account_number_last4: '9104',
        currency: 'INR',
        is_active: true,
        color_index: 2,
        purpose: 'business',
        ifsc: 'ICIC0000456',
        opening_balance: 640000,
        opening_date: '2026-04-01',
        operated_by_owner: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: accKotakCcId,
        user_id: userId,
        name: 'Kotak Zen Credit Card',
        bank_name: 'Kotak Mahindra Bank',
        account_type: 'credit_card',
        account_number_last4: '3312',
        currency: 'INR',
        is_active: true,
        color_index: 5,
        purpose: 'personal',
        opening_balance: 0,
        credit_limit: 250000,
        billing_cycle_day: 18,
        payment_due_day: 5,
        operated_by_owner: true,
        created_at: now,
        updated_at: now,
      },
    ],
    statement_uploads: [
      {
        id: uploadId,
        user_id: userId,
        account_id: accHdfcId,
        file_name: 'hdfc_fy26_27_sample.csv',
        file_hash: 'sandbox-seed-hash-001',
        file_type: 'csv',
        file_size_bytes: 4096,
        storage_path: `${userId}/2026-11/hdfc_fy26_27_sample.csv`,
        parser_version: 'hdfc-v2',
        status: 'imported',
        row_count: 8,
        imported_count: 8,
        duplicate_count: 0,
        statement_period_start: '2026-04-05',
        statement_period_end: '2026-11-10',
        imported_at: now,
        created_at: now,
      },
    ],
    staged_transactions: [],
    transactions: [
      {
        id: uuid('90000001', 1),
        user_id: userId,
        account_id: accIciciId,
        category_id: catConsultingId,
        workspace_id: wsBusinessId,
        upload_id: uploadId,
        txn_date: '2026-11-02',
        description: 'Stripe Payout - Acme Cloud Retainer',
        raw_description: 'NEFT CR-STRIPE INDIA-ACME RETAINER',
        debit: null,
        credit: 245000,
        balance: 885000,
        reference_number: 'UTR2611028831',
        txn_type: 'income',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['retainer', 'export'],
        created_at: now,
      },
      {
        id: uuid('90000001', 2),
        user_id: userId,
        account_id: accIciciId,
        category_id: catSoftwareId,
        workspace_id: wsBusinessId,
        upload_id: uploadId,
        txn_date: '2026-11-04',
        description: 'AWS Cloud Services India',
        raw_description: 'POS 4532XXXX AWS MUMBAI',
        debit: 14850,
        credit: null,
        balance: 870150,
        reference_number: 'AWS261104',
        txn_type: 'expense',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['infra', 'deductible'],
        created_at: now,
      },
      {
        id: uuid('90000001', 3),
        user_id: userId,
        account_id: accIciciId,
        category_id: catRentId,
        workspace_id: wsBusinessId,
        upload_id: uploadId,
        txn_date: '2026-11-05',
        description: 'WeWork BKC Studio Desk',
        raw_description: 'IMPS-WEWORK INDIA-DESK NOV',
        debit: 28000,
        credit: null,
        balance: 842150,
        reference_number: 'IMPS63091122',
        txn_type: 'expense',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['office'],
        created_at: now,
      },
      {
        id: uuid('90000001', 4),
        user_id: userId,
        account_id: accHdfcId,
        category_id: catFoodId,
        workspace_id: wsPersonalId,
        upload_id: uploadId,
        txn_date: '2026-11-06',
        description: 'Swiggy Instamart Groceries',
        raw_description: 'UPI-SWIGGY-INSTAMART-4421',
        debit: 2480,
        credit: null,
        balance: 382520,
        reference_number: 'UPI63109921',
        txn_type: 'expense',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['groceries'],
        created_at: now,
      },
      {
        id: uuid('90000001', 5),
        user_id: userId,
        account_id: accHdfcId,
        category_id: catUtilitiesId,
        workspace_id: wsPersonalId,
        upload_id: uploadId,
        txn_date: '2026-11-07',
        description: 'Airtel Fiber & Postpaid',
        raw_description: 'UPI-AIRTEL-FIBER-MUMBAI',
        debit: 1999,
        credit: null,
        balance: 380521,
        reference_number: 'UPI63115509',
        txn_type: 'expense',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['utilities'],
        created_at: now,
      },
      {
        id: uuid('90000001', 6),
        user_id: userId,
        account_id: accKotakCcId,
        category_id: catTravelId,
        workspace_id: wsMixedId,
        upload_id: uploadId,
        txn_date: '2026-11-08',
        description: 'IndiGo Mumbai–Bengaluru Flight',
        raw_description: 'INTERGLOBE AVIATION INDIGO',
        debit: 8650,
        credit: null,
        balance: -8650,
        reference_number: 'CC63120041',
        txn_type: 'expense',
        is_transfer: false,
        is_self_transfer: false,
        is_manual: false,
        status: 'confirmed',
        tags: ['travel'],
        created_at: now,
      },
      {
        id: uuid('90000001', 7),
        user_id: userId,
        account_id: accIciciId,
        category_id: catTransferId,
        workspace_id: wsPersonalId,
        upload_id: uploadId,
        txn_date: '2026-11-09',
        description: 'Self Transfer to HDFC Savings',
        raw_description: 'NEFT-SELF-HDFC-4821',
        debit: 100000,
        credit: null,
        balance: 742150,
        reference_number: 'SELF26110901',
        txn_type: 'transfer',
        is_transfer: true,
        is_self_transfer: true,
        transfer_pair_id: uuid('90000001', 8),
        is_manual: false,
        status: 'confirmed',
        tags: [],
        created_at: now,
      },
      {
        id: uuid('90000001', 8),
        user_id: userId,
        account_id: accHdfcId,
        category_id: catTransferId,
        workspace_id: wsPersonalId,
        upload_id: uploadId,
        txn_date: '2026-11-09',
        description: 'Self Transfer from ICICI Current',
        raw_description: 'NEFT CR-SELF-ICICI-9104',
        debit: null,
        credit: 100000,
        balance: 480521,
        reference_number: 'SELF26110901',
        txn_type: 'transfer',
        is_transfer: true,
        is_self_transfer: true,
        transfer_pair_id: uuid('90000001', 7),
        is_manual: false,
        status: 'confirmed',
        tags: [],
        created_at: now,
      },
    ],
    budgets: [
      {
        id: uuid('a0000001', 1),
        user_id: userId,
        category_id: catFoodId,
        workspace_id: wsPersonalId,
        fy_year: '2026-27',
        period: 'monthly',
        amount: 15000,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuid('a0000001', 2),
        user_id: userId,
        category_id: catSoftwareId,
        workspace_id: wsBusinessId,
        fy_year: '2026-27',
        period: 'monthly',
        amount: 25000,
        created_at: now,
        updated_at: now,
      },
    ],
    recurring_transactions: [
      {
        id: uuid('b0000001', 1),
        user_id: userId,
        account_id: accIciciId,
        category_id: catRentId,
        workspace_id: wsBusinessId,
        description: 'WeWork Studio Desk',
        amount: 28000,
        txn_type: 'expense',
        frequency: 'monthly',
        next_due_date: '2026-12-05',
        last_seen_date: '2026-11-05',
        is_active: true,
        notes: 'Monthly coworking desk retainer',
        created_at: now,
        updated_at: now,
      },
      {
        id: uuid('b0000001', 2),
        user_id: userId,
        account_id: accHdfcId,
        category_id: catUtilitiesId,
        workspace_id: wsPersonalId,
        description: 'Airtel Fiber Plan',
        amount: 1999,
        txn_type: 'expense',
        frequency: 'monthly',
        next_due_date: '2026-12-07',
        last_seen_date: '2026-11-07',
        is_active: true,
        notes: null,
        created_at: now,
        updated_at: now,
      },
    ],
    transaction_rules: [
      {
        id: uuid('c0000001', 1),
        user_id: userId,
        name: 'Swiggy & Zomato -> Food & Dining',
        priority: 10,
        is_active: true,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'SWIGGY',
        set_category: catFoodId,
        set_workspace: wsPersonalId,
        set_txn_type: null,
        set_tags: ['food'],
        created_at: now,
        updated_at: now,
      },
      {
        id: uuid('c0000001', 2),
        user_id: userId,
        name: 'AWS -> Cloud & SaaS',
        priority: 20,
        is_active: true,
        match_field: 'description',
        match_type: 'contains',
        match_value: 'AWS',
        set_category: catSoftwareId,
        set_workspace: wsBusinessId,
        set_txn_type: null,
        set_tags: ['infra'],
        created_at: now,
        updated_at: now,
      },
    ],
    business_profiles: [
      {
        id: bizProfileId,
        user_id: userId,
        company_name: 'Zaboraa Consulting',
        logo_path: null,
        address: 'BKC, Mumbai 400051, Maharashtra, India',
        country: 'IN',
        email: 'wasimssayyed@gmail.com',
        phone: '+91 98200 00000',
        website: null,
        gstin: '27AAAAA0000A1Z5',
        iec: null,
        lut_number: 'AD270426000001A',
        lut_date: '2026-04-01',
        default_currency: 'INR',
        invoice_prefix: 'ZAB-',
        next_invoice_no: 2,
        default_payment_terms_days: 15,
        default_notes: 'Thank you for your business.',
        default_footer: 'LUT Export under Section 16 of IGST Act.',
        created_at: now,
        updated_at: now,
      },
    ],
    clients: [
      {
        id: clientId,
        user_id: userId,
        name: 'Acme Billing Team',
        company_name: 'Acme Cloud Systems Inc.',
        country: 'US',
        address: '548 Market St, San Francisco, CA',
        city: 'San Francisco',
        email: 'billing@acmecloud.example',
        phone: null,
        tax_id: 'US-EIN-94-0000000',
        default_currency: 'USD',
        payment_terms_days: 15,
        notes: null,
        created_at: now,
        updated_at: now,
      },
    ],
    payment_instructions: [
      {
        id: payInstrId,
        user_id: userId,
        label: 'ICICI Business Current (INR)',
        beneficiary_name: 'Zaboraa Consulting',
        bank_name: 'ICICI Bank',
        bank_address: 'BKC Branch, Mumbai, India',
        account_number_encrypted: null,
        last4: '9104',
        iban_encrypted: null,
        swift_bic: 'ICICINBBCTS',
        ifsc: 'ICIC0000456',
        intermediary_bank: null,
        currency: 'INR',
        is_default: true,
        created_at: now,
        updated_at: now,
      },
    ],
    invoices: [
      {
        id: invoiceId,
        user_id: userId,
        client_id: clientId,
        client_name: 'Acme Cloud Systems Inc.',
        client_email: 'billing@acmecloud.example',
        payment_instruction_id: payInstrId,
        invoice_number: 'ZAB-2026-001',
        status: 'paid',
        issue_date: '2026-11-01',
        due_date: '2026-11-15',
        currency: 'INR',
        exchange_rate: 1,
        inr_equivalent: 245000,
        country: 'US',
        tax_percent: 0,
        tax_label: 'IGST (0% LUT Export)',
        subtotal: 245000,
        total: 245000,
        amount_received: 245000,
        inr_received: 245000,
        paid_at: '2026-11-02',
        linked_transaction_id: uuid('90000001', 1),
        seller_snapshot: {
          company_name: 'Zaboraa Consulting',
          address: 'BKC, Mumbai 400051, Maharashtra, India',
          country: 'IN',
          email: 'wasimssayyed@gmail.com',
          gstin: '27AAAAA0000A1Z5',
          lut_number: 'AD270426000001A',
        },
        client_snapshot: {
          name: 'Acme Billing Team',
          company_name: 'Acme Cloud Systems Inc.',
          country: 'US',
          address: '548 Market St, San Francisco, CA',
          email: 'billing@acmecloud.example',
        },
        bank_snapshot: {
          label: 'ICICI Business Current (INR)',
          beneficiary_name: 'Zaboraa Consulting',
          bank_name: 'ICICI Bank',
          last4: '9104',
          ifsc: 'ICIC0000456',
          currency: 'INR',
        },
        line_items: [
          {
            id: 'li-seed-1',
            description: 'Cloud Architecture & Advisory (Nov 2026)',
            quantity: 1,
            unit_price: 245000,
            discount: 0,
            rate: 245000,
            amount: 245000,
          },
        ],
        notes: 'LUT Export under Section 16 of IGST Act.',
        created_at: now,
        updated_at: now,
      },
    ],
    analytics_reports: [],
    audit_log: [],
    gmail_sync_log: [],
    auto_categorization_batches: [],
  };
}

let serverMemoryDb: TableMap | null = null;

function migrateSandboxDb(db: TableMap): { db: TableMap; changed: boolean } {
  let changed = false;

  if (Array.isArray(db.transaction_rules)) {
    db.transaction_rules = db.transaction_rules.map((r) => {
      if (
        r.match_type === undefined ||
        (r.category_id && !r.set_category) ||
        (r.workspace_id && !r.set_workspace) ||
        (r.tags && !r.set_tags)
      ) {
        changed = true;
        return {
          ...r,
          match_type: r.match_type || r.match_operator || 'contains',
          set_category: r.set_category !== undefined ? r.set_category : (r.category_id ?? null),
          set_workspace: r.set_workspace !== undefined ? r.set_workspace : (r.workspace_id ?? null),
          set_txn_type: r.set_txn_type !== undefined ? r.set_txn_type : null,
          set_tags: r.set_tags !== undefined ? r.set_tags : (r.tags ?? null),
          updated_at: r.updated_at || r.created_at || new Date().toISOString(),
        };
      }
      return r;
    });
  }

  if (Array.isArray(db.budgets)) {
    db.budgets = db.budgets.map((b) => {
      if (!b.fy_year && b.financial_year) {
        changed = true;
        return {
          ...b,
          fy_year: b.financial_year,
          updated_at: b.updated_at || b.created_at || new Date().toISOString(),
        };
      }
      return b;
    });
  }

  if (Array.isArray(db.recurring_transactions)) {
    db.recurring_transactions = db.recurring_transactions.map((rec) => {
      if (!rec.description && rec.title) {
        changed = true;
        return {
          ...rec,
          description: rec.title,
          last_seen_date: rec.last_seen_date ?? null,
          notes: rec.notes ?? null,
          updated_at: rec.updated_at || rec.created_at || new Date().toISOString(),
        };
      }
      return rec;
    });
  }

  if (Array.isArray(db.business_profiles)) {
    db.business_profiles = db.business_profiles.map((bp) => {
      if (bp.company_name === undefined && bp.business_name !== undefined) {
        changed = true;
        return {
          ...bp,
          company_name: bp.business_name,
          next_invoice_no: bp.next_invoice_no ?? bp.next_invoice_number ?? 1,
          default_payment_terms_days: bp.default_payment_terms_days ?? 15,
        };
      }
      return bp;
    });
  }

  if (Array.isArray(db.clients)) {
    db.clients = db.clients.map((c) => {
      if (c.company_name === undefined && c.company !== undefined) {
        changed = true;
        return {
          ...c,
          company_name: c.company,
          tax_id: c.tax_id ?? c.gstin ?? null,
          payment_terms_days: c.payment_terms_days ?? 15,
        };
      }
      return c;
    });
  }

  if (Array.isArray(db.payment_instructions)) {
    db.payment_instructions = db.payment_instructions.map((pi) => {
      if (pi.beneficiary_name === undefined && pi.account_holder_name !== undefined) {
        changed = true;
        return {
          ...pi,
          beneficiary_name: pi.account_holder_name,
          last4: pi.last4 ?? pi.account_number_last4 ?? null,
          ifsc: pi.ifsc ?? pi.ifsc_code ?? null,
        };
      }
      return pi;
    });
  }

  if (Array.isArray(db.invoices)) {
    db.invoices = db.invoices.map((inv) => {
      if (inv.total === undefined && inv.total_amount !== undefined) {
        changed = true;
        return {
          ...inv,
          total: inv.total_amount,
          amount_received: inv.amount_received ?? inv.amount_paid ?? 0,
          client_name: inv.client_name || 'Client',
          tax_percent: inv.tax_percent ?? 0,
          tax_label: inv.tax_label || 'Tax',
          line_items: Array.isArray(inv.line_items)
            ? inv.line_items.map((li: any, idx: number) => ({
                id: li.id || `li-${idx + 1}`,
                rate: li.rate ?? li.unit_price ?? 0,
                ...li,
              }))
            : [],
        };
      }
      return inv;
    });
  }

  if (!Array.isArray(db.auto_categorization_batches)) {
    db.auto_categorization_batches = [];
    changed = true;
  }

  if (Array.isArray(db.categories)) {
    const ownerUserId = db.profiles?.[0]?.user_id || SANDBOX_DEFAULT_USER.id;
    const existingNames = new Set(
      db.categories.map((c) => String(c.name || '').trim().toLowerCase())
    );
    const now = new Date().toISOString();
    ALLOWED_AUTO_CATEGORIES.forEach((spec, idx) => {
      if (!existingNames.has(spec.name.toLowerCase())) {
        db.categories.push({
          id: uuid('30000002', idx + 1),
          user_id: ownerUserId,
          name: spec.name,
          icon: spec.icon,
          color_index: spec.color_index,
          is_income: spec.is_income,
          is_system: true,
          created_at: now,
        });
        changed = true;
      }
    });
  }

  return { db, changed };
}

function loadDb(): TableMap {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TableMap;
        const { db, changed } = migrateSandboxDb(parsed);
        if (changed) {
          saveDb(db);
        }
        return db;
      }
    } catch {
      // fallback to seed
    }
    const seed = buildSeedData(SANDBOX_DEFAULT_USER.id);
    try {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(seed));
    } catch {
      // ignore
    }
    return seed;
  }

  if (!serverMemoryDb) {
    serverMemoryDb = buildSeedData(SANDBOX_DEFAULT_USER.id);
  }
  return serverMemoryDb;
}

function saveDb(db: TableMap): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // ignore
    }
  } else {
    serverMemoryDb = db;
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sbx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hydrateRelations(row: Row, selectExpr: string, db: TableMap): Row {
  const cloned = { ...row };
  const joins = [
    { rel: 'accounts', fks: ['account_id'] },
    { rel: 'categories', fks: ['category_id', 'set_category'] },
    { rel: 'workspaces', fks: ['workspace_id', 'set_workspace'] },
    { rel: 'statement_uploads', fks: ['upload_id'] },
    { rel: 'clients', fks: ['client_id'] },
    { rel: 'payment_instructions', fks: ['payment_instruction_id'] },
  ];

  for (const { rel, fks } of joins) {
    if (selectExpr.includes(`${rel}(`)) {
      const fkVal = fks.map((k) => row[k]).find((v) => Boolean(v));
      if (fkVal) {
        const targetTable = db[rel] || [];
        cloned[rel] = targetTable.find((r) => r.id === fkVal) || null;
      }
    }
  }
  return cloned;
}

function matchesCondition(row: Row, col: string, op: string, val: any): boolean {
  const rv = row[col];
  switch (op) {
    case 'eq':
      return rv === val;
    case 'neq':
      return rv !== val;
    case 'gt':
      return rv !== null && rv !== undefined && rv > val;
    case 'gte':
      return rv !== null && rv !== undefined && rv >= val;
    case 'lt':
      return rv !== null && rv !== undefined && rv < val;
    case 'lte':
      return rv !== null && rv !== undefined && rv <= val;
    case 'is':
      return val === null ? rv === null || rv === undefined : rv === val;
    case 'in':
      return Array.isArray(val) ? val.includes(rv) : false;
    case 'ilike': {
      const pattern = String(val || '').replace(/%/g, '').toLowerCase();
      return String(rv || '').toLowerCase().includes(pattern);
    }
    case 'like': {
      const pattern = String(val || '').replace(/%/g, '');
      return String(rv || '').includes(pattern);
    }
    case 'contains':
      if (Array.isArray(rv) && Array.isArray(val)) {
        return val.every((v) => rv.includes(v));
      }
      return false;
    default:
      return true;
  }
}

function parseOrExpression(row: Row, expr: string): boolean {
  const clauses = expr.split(',').map((c) => c.trim()).filter(Boolean);
  return clauses.some((clause) => {
    const parts = clause.split('.');
    if (parts.length < 3) return false;
    const col = parts[0];
    const op = parts[1];
    const rawVal = parts.slice(2).join('.');
    let parsedVal: any = rawVal;
    if (rawVal === 'true') parsedVal = true;
    else if (rawVal === 'false') parsedVal = false;
    else if (rawVal === 'null') parsedVal = null;
    return matchesCondition(row, col, op, parsedVal);
  });
}

class SandboxQueryBuilder implements PromiseLike<any> {
  private table: string;
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectExpr = '*';
  private selectOpts: { count?: string; head?: boolean } = {};
  private writePayload: any = null;
  private upsertOpts: { onConflict?: string } = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitNum: number | null = null;
  private rangeTuple: [number, number] | null = null;
  private expectSingle: 'single' | 'maybeSingle' | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', options: { count?: string; head?: boolean } = {}) {
    if (this.op === 'select') {
      this.selectExpr = columns;
      this.selectOpts = options;
    } else {
      this.selectExpr = columns;
    }
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.writePayload = rows;
    return this;
  }

  update(patch: Row) {
    this.op = 'update';
    this.writePayload = patch;
    return this;
  }

  upsert(rows: Row | Row[], options: { onConflict?: string } = {}) {
    this.op = 'upsert';
    this.writePayload = rows;
    this.upsertOpts = options;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'eq', val));
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'neq', val));
    return this;
  }

  gt(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'gt', val));
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'gte', val));
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'lt', val));
    return this;
  }

  lte(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'lte', val));
    return this;
  }

  is(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'is', val));
    return this;
  }

  in(col: string, vals: any[]) {
    this.filters.push((r) => matchesCondition(r, col, 'in', vals));
    return this;
  }

  ilike(col: string, val: string) {
    this.filters.push((r) => matchesCondition(r, col, 'ilike', val));
    return this;
  }

  like(col: string, val: string) {
    this.filters.push((r) => matchesCondition(r, col, 'like', val));
    return this;
  }

  contains(col: string, val: any) {
    this.filters.push((r) => matchesCondition(r, col, 'contains', val));
    return this;
  }

  not(col: string, op: string, val: any) {
    this.filters.push((r) => !matchesCondition(r, col, op, val));
    return this;
  }

  or(expr: string) {
    this.filters.push((r) => parseOrExpression(r, expr));
    return this;
  }

  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, ascending: opts.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.limitNum = n;
    return this;
  }

  range(from: number, to: number) {
    this.rangeTuple = [from, to];
    return this;
  }

  single() {
    this.expectSingle = 'single';
    return this;
  }

  maybeSingle() {
    this.expectSingle = 'maybeSingle';
    return this;
  }

  private execute() {
    const db = loadDb();
    if (!db[this.table]) {
      db[this.table] = [];
    }
    const tableRows = db[this.table];
    const now = new Date().toISOString();

    let resultRows: Row[] = [];

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload];
      const inserted = incoming.map((item) => ({
        id: item.id || generateId(),
        created_at: item.created_at || now,
        updated_at: item.updated_at || now,
        ...item,
      }));
      db[this.table] = [...tableRows, ...inserted];
      saveDb(db);
      resultRows = inserted;
    } else if (this.op === 'upsert') {
      const incoming = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload];
      const conflictCols = (this.upsertOpts.onConflict || 'id')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const updatedList: Row[] = [];
      for (const item of incoming) {
        const idx =
          conflictCols.length > 0 && conflictCols.every((c) => item[c] !== undefined)
            ? db[this.table].findIndex((r) => conflictCols.every((c) => r[c] === item[c]))
            : -1;
        if (idx >= 0) {
          db[this.table][idx] = { ...db[this.table][idx], ...item, updated_at: now };
          updatedList.push(db[this.table][idx]);
        } else {
          const created = {
            id: item.id || generateId(),
            created_at: item.created_at || now,
            updated_at: now,
            ...item,
          };
          db[this.table].push(created);
          updatedList.push(created);
        }
      }
      saveDb(db);
      resultRows = updatedList;
    } else if (this.op === 'update') {
      const updatedList: Row[] = [];
      db[this.table] = tableRows.map((row) => {
        if (this.filters.every((fn) => fn(row))) {
          const next = { ...row, ...this.writePayload, updated_at: now };
          updatedList.push(next);
          return next;
        }
        return row;
      });
      saveDb(db);
      resultRows = updatedList;
    } else if (this.op === 'delete') {
      const deleted: Row[] = [];
      db[this.table] = tableRows.filter((row) => {
        if (this.filters.every((fn) => fn(row))) {
          deleted.push(row);
          return false;
        }
        return true;
      });
      saveDb(db);
      resultRows = deleted;
    } else {
      resultRows = tableRows.filter((row) => this.filters.every((fn) => fn(row)));
    }

    const totalCount = resultRows.length;

    if (this.orders.length > 0) {
      resultRows = [...resultRows].sort((a, b) => {
        for (const ord of this.orders) {
          const av = a[ord.col];
          const bv = b[ord.col];
          if (av === bv) continue;
          if (av === null || av === undefined) return ord.ascending ? 1 : -1;
          if (bv === null || bv === undefined) return ord.ascending ? -1 : 1;
          if (av < bv) return ord.ascending ? -1 : 1;
          return ord.ascending ? 1 : -1;
        }
        return 0;
      });
    }

    if (this.rangeTuple) {
      const [from, to] = this.rangeTuple;
      resultRows = resultRows.slice(from, to + 1);
    } else if (this.limitNum !== null) {
      resultRows = resultRows.slice(0, this.limitNum);
    }

    const hydrated = resultRows.map((r) => hydrateRelations(r, this.selectExpr, db));

    if (this.expectSingle === 'single') {
      if (hydrated.length === 0) {
        return { data: null, error: { message: 'Row not found' }, count: totalCount };
      }
      return { data: hydrated[0], error: null, count: totalCount };
    }

    if (this.expectSingle === 'maybeSingle') {
      return { data: hydrated[0] || null, error: null, count: totalCount };
    }

    if (this.selectOpts.head) {
      return { data: null, error: null, count: totalCount };
    }

    return {
      data: hydrated,
      error: null,
      count: this.selectOpts.count === 'exact' ? totalCount : undefined,
    };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createSandboxSupabaseClient(overrideUser?: User) {
  const resolveUser = (): User | null => {
    if (overrideUser) return overrideUser;
    return getSandboxSession()?.user || null;
  };

  return {
    auth: {
      async getUser() {
        const u = resolveUser();
        return { data: { user: u }, error: null };
      },
      async getSession() {
        const s = getSandboxSession();
        return {
          data: {
            session: s
              ? {
                  access_token: s.access_token,
                  refresh_token: s.refresh_token,
                  expires_at: s.expires_at,
                  token_type: 'bearer',
                  user: s.user,
                }
              : null,
          },
          error: null,
        };
      },
      onAuthStateChange(_cb: any) {
        return {
          data: {
            subscription: {
              unsubscribe() {},
            },
          },
        };
      },
      async signOut() {
        clearSandboxSession();
        return { error: null };
      },
      async setSession() {
        return { data: { user: resolveUser(), session: null }, error: null };
      },
    },
    from(table: string) {
      return new SandboxQueryBuilder(table);
    },
    storage: {
      from(_bucket: string) {
        return {
          async upload(path: string) {
            return { data: { path }, error: null };
          },
          async remove() {
            return { data: [], error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `/sandbox-storage/${path}` } };
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: `/sandbox-storage/${path}` }, error: null };
          },
        };
      },
    },
    async rpc(fnName: string, args: Record<string, any> = {}) {
      if (fnName === 'allocate_invoice_number') {
        const db = loadDb();
        const userId = args.p_user_id || resolveUser()?.id;
        const bp = (db.business_profiles || []).find((p) => p.user_id === userId);
        if (!bp) {
          return { data: null, error: { message: 'No business profile configured' } };
        }
        const num = Number(bp.next_invoice_number || 1);
        bp.next_invoice_number = num + 1;
        saveDb(db);
        const prefix = bp.invoice_prefix || 'INV-';
        const formatted = `${prefix}2026-${String(num).padStart(3, '0')}`;
        return { data: formatted, error: null };
      }
      return { data: null, error: null };
    },
  };
}
