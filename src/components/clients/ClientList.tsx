import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ClientForm } from './ClientForm';
import { createClient as createSupabaseClient } from '../../lib/supabase/client';
import {
  getClients,
  getClientIdsWithInvoices,
  deleteClient,
} from '../../lib/actions/clients';
import { countryCodeToFlag, getCountryByCode } from '../../lib/data/countries';
import { getCurrencyByCode } from '../../lib/data/currencies';
import type { Client } from '../../types/invoicing';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react';

export const ClientList: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientIdsWithInvoices, setClientIdsWithInvoices] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadClients = async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const [list, linkedIds] = await Promise.all([
        getClients(supabase),
        getClientIdsWithInvoices(supabase),
      ]);
      setClients(list);
      setClientIdsWithInvoices(linkedIds);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Failed to load clients.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleOpenNew = () => {
    setEditingClient(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setIsFormOpen(true);
  };

  const handleSaved = (saved: Client) => {
    setClients((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      const next = exists
        ? prev.map((c) => (c.id === saved.id ? saved : c))
        : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setIsFormOpen(false);
    setEditingClient(null);
    setBanner({
      type: 'success',
      text: editingClient
        ? `Updated ${saved.name}.`
        : `Client ${saved.name} created.`,
    });
  };

  const handleDeleteClick = (client: Client) => {
    if (clientIdsWithInvoices.has(client.id)) {
      setConfirmDeleteId(null);
      setBanner({
        type: 'error',
        text: 'Client has invoices — cannot delete',
      });
      return;
    }
    setConfirmDeleteId(client.id);
  };

  const handleConfirmDelete = async (client: Client) => {
    setDeletingId(client.id);
    setBanner(null);
    try {
      const supabase = createSupabaseClient();
      await deleteClient(supabase, client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setConfirmDeleteId(null);
      setBanner({ type: 'success', text: `Deleted ${client.name}.` });
    } catch (err: any) {
      const msg: string = err?.message || 'Failed to delete client.';
      if (msg.toLowerCase().includes('existing invoices')) {
        setClientIdsWithInvoices((prev) => {
          const next = new Set(prev);
          next.add(client.id);
          return next;
        });
        setBanner({ type: 'error', text: 'Client has invoices — cannot delete' });
      } else {
        setBanner({ type: 'error', text: msg });
      }
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const countryName = getCountryByCode(c.country)?.name || '';
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      c.default_currency.toLowerCase().includes(q) ||
      countryName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Zaboraa Finance</span>
            <span>·</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Client Directory
            </span>
          </div>
          <h2 className="font-heading font-bold text-2xl text-slate-900 dark:text-white tracking-tight">
            Clients
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage billing contacts, countries, and default currencies for domestic and export invoices.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenNew}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          New Client
        </Button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            banner.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-[11px] underline cursor-pointer opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <CardTitle>Client Directory</CardTitle>
            <span className="text-xs text-slate-500 font-mono">
              ({clients.length})
            </span>
          </div>

          {clients.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name, country, currency..."
                className="w-full py-1.5 pl-8 pr-3 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Loading clients...</span>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-3">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p>No clients yet. Add your first client.</p>
              <Button size="sm" variant="secondary" onClick={handleOpenNew}>
                Add Client
              </Button>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No clients match your filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Name</th>
                  <th className="py-2.5 px-4 font-medium">Company</th>
                  <th className="py-2.5 px-4 font-medium">Country</th>
                  <th className="py-2.5 px-4 font-medium">Default Currency</th>
                  <th className="py-2.5 px-4 font-medium">Email</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredClients.map((client) => {
                  const countryObj = getCountryByCode(client.country);
                  const currencyObj = getCurrencyByCode(client.default_currency);
                  const hasInvoices = clientIdsWithInvoices.has(client.id);
                  const isConfirming = confirmDeleteId === client.id;

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        <div>{client.name}</div>
                        {client.city && (
                          <div className="text-[11px] text-slate-400">{client.city}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {client.company_name || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {client.country ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span>{countryCodeToFlag(client.country)}</span>
                            <span>{countryObj?.name || client.country}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">
                          {client.default_currency}
                        </span>
                        {currencyObj && (
                          <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                            — {currencyObj.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {client.email || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-1 rounded-lg">
                            <span className="text-[11px] text-red-800 dark:text-red-200 font-medium">
                              Delete {client.name}?
                            </span>
                            <button
                              type="button"
                              onClick={() => handleConfirmDelete(client)}
                              disabled={deletingId === client.id}
                              className="px-2 py-0.5 text-[11px] font-medium rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
                            >
                              {deletingId === client.id ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === client.id}
                              className="px-2 py-0.5 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(client)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded cursor-pointer"
                              title="Edit client"
                              aria-label={`Edit ${client.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(client)}
                              className={`p-1.5 rounded cursor-pointer ${
                                hasInvoices
                                  ? 'text-slate-300 dark:text-slate-600 hover:text-amber-600'
                                  : 'text-slate-400 hover:text-red-500'
                              }`}
                              title={
                                hasInvoices
                                  ? 'Client has invoices — cannot delete'
                                  : 'Delete client'
                              }
                              aria-label={`Delete ${client.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ClientForm
        isOpen={isFormOpen}
        initialData={editingClient}
        onClose={() => {
          setIsFormOpen(false);
          setEditingClient(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
};
