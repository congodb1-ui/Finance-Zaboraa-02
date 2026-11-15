import React from 'react';
import type { SelfTransferPairRow, Transaction } from '../../types/transactions';
import { formatINR } from '../../types/design-system';
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Inbox,
  Check,
  X,
} from 'lucide-react';

interface TransfersTableProps {
  pairs: SelfTransferPairRow[];
  onSelectTransaction: (tx: Transaction) => void;
  onReviewPair: (pair: SelfTransferPairRow, approve: boolean) => Promise<void>;
}

export const TransfersTable: React.FC<TransfersTableProps> = ({
  pairs,
  onSelectTransaction,
  onReviewPair,
}) => {
  if (pairs.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
          <Inbox className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-semibold text-base text-slate-800 dark:text-slate-200">
          No self-transfers detected yet
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          Inter-account transfers between your owner-operated accounts are automatically matched by IMPS/UPI reference or NEFT/RTGS name fallback and excluded from income & expense totals.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            Self-Transfer Pairs
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-500">
            {pairs.length} transfer{pairs.length === 1 ? '' : 's'} (excluded from income &amp; expense)
          </span>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
        {pairs.map((pair) => {
          const primaryTx = pair.debitTx || pair.creditTx;
          const fromLabel = pair.debitTx?.account?.name || 'Pending Source';
          const toLabel = pair.creditTx?.account?.name || 'Pending Destination';
          return (
            <div
              key={pair.id}
              onClick={() => primaryTx && onSelectTransaction(primaryTx)}
              className="p-4 space-y-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-tabular text-xs text-slate-500 font-medium">
                  {pair.txn_date}
                </span>
                <span className="font-heading font-bold text-sm font-tabular text-slate-900 dark:text-white">
                  {formatINR(pair.amount)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 flex-wrap">
                <span className={pair.debitTx ? '' : 'italic text-amber-600 dark:text-amber-400'}>
                  {fromLabel}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className={pair.creditTx ? '' : 'italic text-amber-600 dark:text-amber-400'}>
                  {toLabel}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-slate-500 truncate">
                  {pair.ref_no ? `Ref: ${pair.ref_no}` : 'No ref number'}
                </span>
                {pair.status === 'linked' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    Linked Pair
                  </span>
                )}
                {pair.status === 'pending_pair' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium">
                    <Clock className="w-3 h-3" />
                    Pending Pair
                  </span>
                )}
                {pair.status === 'review' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Needs Review
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <th className="py-2.5 px-4 whitespace-nowrap">Date</th>
              <th className="py-2.5 px-4 min-w-[260px]">Debit Account → Credit Account</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Narration</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Ref Number</th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">Amount</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Pair Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {pairs.map((pair) => {
              const primaryTx = pair.debitTx || pair.creditTx;
              const fromName = pair.debitTx?.account?.name;
              const toName = pair.creditTx?.account?.name;

              return (
                <tr
                  key={pair.id}
                  data-testid="transfer-pair-row"
                  onClick={() => primaryTx && onSelectTransaction(primaryTx)}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 whitespace-nowrap font-tabular text-slate-700 dark:text-slate-300">
                    {pair.txn_date}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 font-medium">
                      {fromName ? (
                        <span className="text-slate-900 dark:text-white">{fromName}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 italic">
                          Pending debit leg
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      {toName ? (
                        <span className="text-slate-900 dark:text-white">{toName}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 italic">
                          Pending credit leg
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-[260px] truncate">
                    {primaryTx?.description || 'Self Transfer'}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                    {pair.ref_no || <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>

                  <td className="py-3 px-4 text-right whitespace-nowrap font-tabular font-semibold text-slate-900 dark:text-white">
                    {formatINR(pair.amount)}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {pair.status === 'linked' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Linked Pair
                      </span>
                    )}
                    {pair.status === 'pending_pair' && (
                      <span
                        title="Only one side imported so far — upload the counterpart statement to complete the pair"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                      >
                        <Clock className="w-3 h-3" />
                        Pending Pair
                      </span>
                    )}
                    {pair.status === 'review' && (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                          <AlertTriangle className="w-3 h-3" />
                          Review
                        </span>
                        <button
                          type="button"
                          onClick={() => onReviewPair(pair, true)}
                          title="Confirm self-transfer pair"
                          className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onReviewPair(pair, false)}
                          title="Not a self-transfer — unlink"
                          className="p-1 rounded bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-100 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
