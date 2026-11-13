import React, { useState, useEffect } from 'react';
import { ITRSummaryTable } from '../../../../components/reports/ITRSummaryTable';
import { WorkspaceBreakdown, WorkspaceData } from '../../../../components/reports/WorkspaceBreakdown';
import { ExportButtons } from '../../../../components/reports/ExportButtons';
import { ExportInvoicesSection } from '../../../../components/reports/ExportInvoicesSection';
import { getITRSummaryData } from '../../../../lib/actions/transactions';
import { getInvoicesV2 } from '../../../../lib/actions/invoicesV2';
import { createClient as createSupabaseClient } from '../../../../lib/supabase/client';
import type { InvoiceV2 } from '../../../../types/invoicing';
import { FileText, Calendar, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Select } from '../../../../components/ui/Select';

export default function ITRReportPage() {
  const [selectedFY, setSelectedFY] = useState<string>('FY2025-26');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<{
    lineItems: any[];
    workspaces: WorkspaceData[];
  }>({
    lineItems: [],
    workspaces: [],
  });
  const [invoices, setInvoices] = useState<InvoiceV2[]>([]);

  const fyOptions = [
    { value: 'FY2025-26', label: 'FY 2025–26 (AY 2026–27)' },
    { value: 'FY2024-25', label: 'FY 2024–25 (AY 2025–26)' },
    { value: 'FY2026-27', label: 'FY 2026–27 (Current)' },
  ];

  const getFYDateRange = (fy: string) => {
    switch (fy) {
      case 'FY2024-25':
        return { startDate: '2024-04-01', endDate: '2025-03-31' };
      case 'FY2025-26':
        return { startDate: '2025-04-01', endDate: '2026-03-31' };
      case 'FY2026-27':
        return { startDate: '2026-04-01', endDate: '2027-03-31' };
      default:
        return { startDate: '2025-04-01', endDate: '2026-03-31' };
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadReport = async () => {
      setIsLoading(true);
      try {
        const range = getFYDateRange(selectedFY);
        const supabase = createSupabaseClient();
        const [data, invs] = await Promise.all([
          getITRSummaryData(range),
          getInvoicesV2(supabase).catch(() => [] as InvoiceV2[]),
        ]);
        if (isMounted) {
          setReportData(data);
          setInvoices(invs);
        }
      } catch (err) {
        console.error('Failed to load ITR report data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadReport();
    return () => {
      isMounted = false;
    };
  }, [selectedFY]);

  const currentRange = getFYDateRange(selectedFY);

  return (
    <div className="space-y-6">
      {/* Sticky Header with FY Selector and Export Buttons */}
      <div className="sticky top-0 z-20 -mx-4 -mt-6 px-4 py-4 mb-2 bg-slate-50/90 dark:bg-[#0B1120]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
            <span>Reports & Tax Filings</span>
            <span>•</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
              Indian Financial Year
            </span>
          </div>
          <h1 className="font-heading font-bold text-2xl text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            ITR Summary & Tax Schedule
          </h1>
        </div>

        {/* Action Controls: FY Selector & Export Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-52">
            <Select
              value={selectedFY}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedFY(e.target.value)}
              options={fyOptions}
              className="text-xs py-1.5"
            />
          </div>

          <ExportButtons fy={selectedFY} workspace="all" />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-500">Aggregating Indian ITR schedules and workspace figures...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Structured ITR Summary Table */}
          <ITRSummaryTable lineItems={reportData.lineItems} fy={selectedFY} />

          {/* Section 2: Workspace Breakdown (Personal | Business | Mixed) */}
          <WorkspaceBreakdown workspaces={reportData.workspaces} />

          {/* Section 3: Export / Foreign Invoices Subsection (Batch 10H) */}
          <ExportInvoicesSection
            invoices={invoices}
            fyLabel={selectedFY}
            startDate={currentRange.startDate}
            endDate={currentRange.endDate}
          />
        </div>
      )}
    </div>
  );
}
