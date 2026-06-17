import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
  Receipt,
  BarChart3,
} from 'lucide-react';
import type { Client, Expense, ClientTransaction } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function ReportsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'client' | 'expense' | 'monthly' | 'datewise' | 'statement'>('client');
  const [selectedClient, setSelectedClient] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statementClient, setStatementClient] = useState('');
  const [statementMonth, setStatementMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsRes, expensesRes, txRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('client_transactions').select('*').order('date', { ascending: false }),
    ]);
    if (clientsRes.data) setClients(clientsRes.data);
    if (expensesRes.data) setExpenses(expensesRes.data);
    if (txRes.data) setTransactions(txRes.data);
    setLoading(false);
  }

  const clientReportData = useMemo(() => {
    if (!selectedClient) return [];
    return transactions.filter((t) => t.client_id === selectedClient);
  }, [transactions, selectedClient]);

  const expenseReportData = useMemo(() => {
    if (!dateFrom && !dateTo) return expenses;
    return expenses.filter((e) => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      return true;
    });
  }, [expenses, dateFrom, dateTo]);

  const monthlyReportData = useMemo(() => {
    const map: Record<string, { expenses: number; debit: number; credit: number; count: number }> = {};
    expenses.forEach((e) => {
      const m = e.date.slice(0, 7);
      if (!map[m]) map[m] = { expenses: 0, debit: 0, credit: 0, count: 0 };
      map[m].expenses += e.amount;
      map[m].count += 1;
    });
    transactions.forEach((t) => {
      const m = t.date.slice(0, 7);
      if (!map[m]) map[m] = { expenses: 0, debit: 0, credit: 0, count: 0 };
      map[m].debit += t.debit || 0;
      map[m].credit += t.credit || 0;
    });
    return Object.entries(map)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [expenses, transactions]);

  const dateWiseData = useMemo(() => {
    const map: Record<string, { expenses: number; debit: number; credit: number }> = {};
    expenses.forEach((e) => {
      if (!map[e.date]) map[e.date] = { expenses: 0, debit: 0, credit: 0 };
      map[e.date].expenses += e.amount;
    });
    transactions.forEach((t) => {
      if (!map[t.date]) map[t.date] = { expenses: 0, debit: 0, credit: 0 };
      map[t.date].debit += t.debit || 0;
      map[t.date].credit += t.credit || 0;
    });
    return Object.entries(map)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [expenses, transactions]);

  const statementData = useMemo(() => {
    if (!statementClient) return [];
    return transactions.filter((t) => {
      if (t.client_id !== statementClient) return false;
      if (statementMonth && !t.date.startsWith(statementMonth)) return false;
      return true;
    });
  }, [transactions, statementClient, statementMonth]);

  const statementClientObj = useMemo(() => {
    return clients.find((c) => c.id === statementClient);
  }, [clients, statementClient]);

  const statementTotals = useMemo(() => {
    const totalDebit = statementData.reduce((s, t) => s + (t.debit || 0), 0);
    const totalCredit = statementData.reduce((s, t) => s + (t.credit || 0), 0);
    const balance = statementData.length > 0 ? statementData[statementData.length - 1].balance : 0;
    return { totalDebit, totalCredit, balance };
  }, [statementData]);

  const chartColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

  const exportExcel = (data: unknown[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = (title: string, headers: string[], rows: (string | number)[][], filename: string) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    autoTable(doc, { startY: 35, head: [headers], body: rows });
    doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const tabs = [
    { key: 'client' as const, label: 'Client Ledger', icon: Users },
    { key: 'expense' as const, label: 'Expense Report', icon: Receipt },
    { key: 'monthly' as const, label: 'Monthly Report', icon: BarChart3 },
    { key: 'datewise' as const, label: 'Date-wise Report', icon: Calendar },
    { key: 'statement' as const, label: 'Client Statement', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Generate and export financial reports</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              activeTab === t.key
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Client Ledger Report */}
          {activeTab === 'client' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none flex-1"
                >
                  <option value="">Select a client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      exportPDF(
                        `Client Ledger: ${clients.find((c) => c.id === selectedClient)?.name || ''}`,
                        ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
                        clientReportData.map((t) => [
                          t.date,
                          t.description,
                          t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
                          t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
                          `$${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                        ]),
                        'client_ledger'
                      )
                    }
                    disabled={!selectedClient}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={() =>
                      exportExcel(
                        clientReportData.map((t) => ({
                          Date: t.date,
                          Description: t.description,
                          Debit: t.debit || 0,
                          Credit: t.credit || 0,
                          Balance: t.balance,
                        })),
                        'client_ledger'
                      )
                    }
                    disabled={!selectedClient}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
              </div>
              {selectedClient && (
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
                        </tr>
                      </thead>
                      <tbody>
                        {clientReportData.map((t) => (
                          <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.date}</td>
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.description}</td>
                            <td className="py-3 px-4 text-right text-warning-600 dark:text-warning-400">
                              {t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-3 px-4 text-right text-secondary-600 dark:text-secondary-400">
                              {t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                              ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        {clientReportData.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No transactions found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Expense Report */}
          {activeTab === 'expense' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row gap-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="To"
                />
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() =>
                      exportPDF(
                        'Expense Report',
                        ['Date', 'Category', 'Description', 'Amount', 'Payment Method'],
                        expenseReportData.map((e) => [
                          e.date,
                          e.category,
                          e.description,
                          `$${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                          e.payment_method,
                        ]),
                        'expense_report'
                      )
                    }
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={() =>
                      exportExcel(
                        expenseReportData.map((e) => ({
                          Date: e.date,
                          Category: e.category,
                          Description: e.description,
                          Amount: e.amount,
                          'Payment Method': e.payment_method,
                        })),
                        'expense_report'
                      )
                    }
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Category</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Description</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseReportData.map((e) => (
                        <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{e.date}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400">
                              {e.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{e.description}</td>
                          <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                            ${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{e.payment_method}</td>
                        </tr>
                      ))}
                      {expenseReportData.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No expenses found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Expense by Category</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const map: Record<string, number> = {};
                          expenseReportData.forEach((e) => {
                            map[e.category] = (map[e.category] || 0) + e.amount;
                          });
                          return Object.entries(map).map(([name, value]) => ({ name, value }));
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {(() => {
                          const map: Record<string, number> = {};
                          expenseReportData.forEach((e) => {
                            map[e.category] = (map[e.category] || 0) + e.amount;
                          });
                          return Object.entries(map).map((_, i) => (
                            <Cell key={i} fill={chartColors[i % chartColors.length]} />
                          ));
                        })()}
                      </Pie>
                      <Tooltip formatter={(v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Monthly Report */}
          {activeTab === 'monthly' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly Summary</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyReportData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                      <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                      <Bar dataKey="debit" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Debits" />
                      <Bar dataKey="credit" fill="#22c55e" radius={[4, 4, 0, 0]} name="Credits" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Month</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Expenses</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Debits</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Credits</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Net Flow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyReportData.map((m) => (
                        <tr key={m.month} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300 font-medium">{m.month}</td>
                          <td className="py-3 px-4 text-right text-error-600 dark:text-error-400">
                            ${m.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-warning-600 dark:text-warning-400">
                            ${m.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-secondary-600 dark:text-secondary-400">
                            ${m.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                            ${(m.credit - m.debit - m.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {monthlyReportData.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No data available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Date-wise Report */}
          {activeTab === 'datewise' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <button
                  onClick={() =>
                    exportPDF(
                      'Date-wise Report',
                      ['Date', 'Expenses', 'Debits', 'Credits'],
                      dateWiseData
                        .filter((d) => {
                          if (dateFrom && d.date < dateFrom) return false;
                          if (dateTo && d.date > dateTo) return false;
                          return true;
                        })
                        .map((d) => [
                          d.date,
                          `$${d.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                          `$${d.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                          `$${d.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                        ]),
                      'datewise_report'
                    )
                  }
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 ml-auto"
                >
                  <FileText className="w-4 h-4" /> PDF
                </button>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Expenses</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Debits</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Credits</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateWiseData
                        .filter((d) => {
                          if (dateFrom && d.date < dateFrom) return false;
                          if (dateTo && d.date > dateTo) return false;
                          return true;
                        })
                        .map((d) => (
                          <tr key={d.date} className="border-b border-gray-100 dark:border-gray-700/50">
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{d.date}</td>
                            <td className="py-3 px-4 text-right text-error-600 dark:text-error-400">
                              ${d.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right text-warning-600 dark:text-warning-400">
                              ${d.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right text-secondary-600 dark:text-secondary-400">
                              ${d.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                              ${(d.credit - d.debit - d.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      {dateWiseData.filter((d) => {
                        if (dateFrom && d.date < dateFrom) return false;
                        if (dateTo && d.date > dateTo) return false;
                        return true;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No data found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Client Statement */}
          {activeTab === 'statement' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row gap-3">
                <select
                  value={statementClient}
                  onChange={(e) => setStatementClient(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none flex-1"
                >
                  <option value="">Select a client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="month"
                  value={statementMonth}
                  onChange={(e) => setStatementMonth(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() =>
                      exportPDF(
                        `Statement: ${statementClientObj?.name || ''} - ${statementMonth}`,
                        ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
                        statementData.map((t) => [
                          t.date,
                          t.description,
                          t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
                          t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-',
                          `$${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                        ]),
                        'client_statement'
                      )
                    }
                    disabled={!statementClient}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={() =>
                      exportExcel(
                        statementData.map((t) => ({
                          Date: t.date,
                          Description: t.description,
                          Debit: t.debit || 0,
                          Credit: t.credit || 0,
                          Balance: t.balance,
                        })),
                        'client_statement'
                      )
                    }
                    disabled={!statementClient}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={!statementClient}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Print
                  </button>
                </div>
              </div>
              {statementClient && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{statementClientObj?.name}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Statement for {statementMonth}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Total Debit</p>
                          <p className="text-sm font-bold text-warning-600 dark:text-warning-400">
                            ${statementTotals.totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Total Credit</p>
                          <p className="text-sm font-bold text-secondary-600 dark:text-secondary-400">
                            ${statementTotals.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Balance</p>
                          <p className={`text-sm font-bold ${statementTotals.balance >= 0 ? 'text-gray-900 dark:text-white' : 'text-error-600 dark:text-error-400'}`}>
                            ${statementTotals.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                          <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Description</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Debit</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Credit</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementData.map((t) => (
                          <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.date}</td>
                            <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.description}</td>
                            <td className="py-3 px-4 text-right text-warning-600 dark:text-warning-400">
                              {t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-3 px-4 text-right text-secondary-600 dark:text-secondary-400">
                              {t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                              ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        {statementData.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No transactions for this period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
