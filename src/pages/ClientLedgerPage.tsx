import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import {
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  Printer,
  Pencil,
  Trash2,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Client, ClientTransaction, BankAccount } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ClientLedgerPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    debit: '',
    credit: '',
    bank_account_id: '',
  });

  useEffect(() => {
    loadClients();
    loadBankAccounts();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadTransactions(selectedClient.id);
    }
  }, [selectedClient]);

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').order('name');
    if (data) {
      setClients(data);
      if (!selectedClient && data.length > 0) setSelectedClient(data[0]);
    }
  }

  async function loadBankAccounts() {
    const { data } = await supabase.from('bank_accounts').select('*').eq('status', 'Active').order('account_name');
    if (data) setBankAccounts(data);
  }

  async function loadTransactions(clientId: string) {
    const { data } = await supabase
      .from('client_transactions')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: true });
    if (data) setTransactions(data);
  }

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      return true;
    });
  }, [transactions, search, dateFrom, dateTo]);

  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / perPage) || 1;

  const clientTotals = useMemo(() => {
    const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
    const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);
    const currentBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
    return { totalDebit, totalCredit, currentBalance };
  }, [transactions]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '',
      debit: '',
      credit: '',
      bank_account_id: '',
    });
    setModalOpen(true);
  };

  const openEdit = (t: ClientTransaction) => {
    setEditing(t);
    setForm({
      date: t.date,
      description: t.description,
      debit: t.debit > 0 ? String(t.debit) : '',
      credit: t.credit > 0 ? String(t.credit) : '',
      bank_account_id: t.bank_account_id || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedClient) return;
    if (!form.description) return;
    const debit = Number(form.debit || 0);
    const credit = Number(form.credit || 0);
    if (debit === 0 && credit === 0) return;
    setSaving(true);

    const payload = {
      client_id: selectedClient.id,
      date: form.date,
      description: form.description,
      debit,
      credit,
      balance: 0,
      bank_account_id: form.bank_account_id || null,
    };

    if (editing) {
      const { data } = await supabase.from('client_transactions').update(payload).eq('id', editing.id).select().single();
      if (data) {
        await logAudit('client_transactions', editing.id, 'UPDATE', editing as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>, user!.id);
        await recalculateBalances(selectedClient.id);
      }
    } else {
      const { data } = await supabase.from('client_transactions').insert(payload).select().single();
      if (data) {
        await logAudit('client_transactions', data.id, 'INSERT', null, data as unknown as Record<string, unknown>, user!.id);
        await recalculateBalances(selectedClient.id);
      }
      // Credit bank account if receiving payment
      if (credit > 0 && form.bank_account_id) {
        const acc = bankAccounts.find((a) => a.id === form.bank_account_id);
        if (acc) {
          const newBal = acc.current_balance + credit;
          await supabase.from('bank_accounts').update({ current_balance: newBal }).eq('id', acc.id);
          await supabase.from('bank_transactions').insert({
            account_id: acc.id,
            date: form.date,
            transaction_type: 'Deposit',
            description: `Client Payment from ${selectedClient.name}: ${form.description}`,
            amount: credit,
            balance_after: newBal,
          });
          setBankAccounts((prev) => prev.map((a) => (a.id === acc.id ? { ...a, current_balance: newBal } : a)));
        }
      }
    }
    setSaving(false);
    setModalOpen(false);
  };

  const recalculateBalances = async (clientId: string) => {
    const { data } = await supabase
      .from('client_transactions')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: true });
    if (!data) return;
    let balance = 0;
    const updates: { id: string; balance: number }[] = [];
    for (const t of data) {
      balance += (t.debit || 0) - (t.credit || 0);
      updates.push({ id: t.id, balance: Number(balance.toFixed(2)) });
    }
    for (const u of updates) {
      await supabase.from('client_transactions').update({ balance: u.balance }).eq('id', u.id);
    }
    setTransactions(data.map((t, i) => ({ ...t, balance: updates[i].balance })));
  };

  const handleDelete = async () => {
    if (!deleteId || !selectedClient) return;
    const tx = transactions.find((t) => t.id === deleteId);
    const { error } = await supabase.from('client_transactions').delete().eq('id', deleteId);
    if (!error) {
      if (tx) {
        await logAudit('client_transactions', deleteId, 'DELETE', tx as unknown as Record<string, unknown>, null, user!.id);
      }
      await recalculateBalances(selectedClient.id);
    }
    setDeleteId(null);
  };

  const exportExcel = () => {
    if (!selectedClient) return;
    const rows = filtered.map((t) => ({
      Date: t.date,
      Description: t.description,
      Debit: t.debit || 0,
      Credit: t.credit || 0,
      Balance: t.balance,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedClient.name);
    XLSX.writeFile(wb, `${selectedClient.name.replace(/\s+/g, '_')}_ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = () => {
    if (!selectedClient) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Client Ledger: ${selectedClient.name}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Description', 'Debit', 'Credit', 'Balance']],
      body: filtered.map((t) => [
        t.date,
        t.description,
        t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
        t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
        `$${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      ]),
    });
    doc.save(`${selectedClient.name.replace(/\s+/g, '_')}_ledger_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Client Ledger</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage client transactions and running balances</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={exportPDF}
            className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={openAdd}
            className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Entry
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Client Sidebar */}
        <div className="lg:w-64 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4" /> Clients
              </h3>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setPage(1); setSearch(''); setDateFrom(''); setDateTo(''); }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
                    selectedClient?.id === c.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary-600'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'
                  }`}
                >
                  <p className={`text-sm font-medium ${selectedClient?.id === c.id ? 'text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {c.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Client Header */}
          {selectedClient && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedClient.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Ledger Transactions</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Debit</p>
                    <p className="text-lg font-bold text-warning-600 dark:text-warning-400">
                      ${clientTotals.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Credit</p>
                    <p className="text-lg font-bold text-secondary-600 dark:text-secondary-400">
                      ${clientTotals.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                    <p className={`text-lg font-bold ${clientTotals.currentBalance >= 0 ? 'text-gray-900 dark:text-white' : 'text-error-600 dark:text-error-400'}`}>
                      ${clientTotals.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Filter className="w-4 h-4" /> Filters
              </button>
            </div>
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Transactions Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Debit</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Credit</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{t.date}</td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.description}</td>
                      <td className="py-3 px-4 text-right">
                        {t.debit > 0 ? (
                          <span className="inline-flex items-center gap-1 text-warning-600 dark:text-warning-400 font-medium">
                            <ArrowUp className="w-3 h-3" />
                            ${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {t.credit > 0 ? (
                          <span className="inline-flex items-center gap-1 text-secondary-600 dark:text-secondary-400 font-medium">
                            <ArrowDown className="w-3 h-3" />
                            ${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                        ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(t.id)}
                            className="p-1.5 rounded-lg text-error-500 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500 dark:text-gray-400">
                        {selectedClient ? 'No transactions found.' : 'Select a client to view ledger.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {((page - 1) * perPage) + 1} - {Math.min(page * perPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Edit Transaction' : 'Add Transaction'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Enter description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Debit</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.debit}
                    onChange={(e) => setForm((f) => ({ ...f, debit: e.target.value, credit: '' }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Credit</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.credit}
                    onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value, debit: '' }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Receiving Bank Account</label>
                <select
                  value={form.bank_account_id}
                  onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">None (Cash)</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_name} — {a.bank_name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Enter either debit or credit, not both.</p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Transaction?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">This will recalculate all balances. This action cannot be undone.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-error-600 text-white text-sm font-medium hover:bg-error-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
