import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Receipt,
  TrendingUp,
  TrendingDown,
  Search,
  ArrowRight,
  Landmark,
  Wallet,
  PiggyBank,
} from 'lucide-react';
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
import type { Client, Expense, ClientTransaction, BankAccount } from '../lib/supabase';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [clientsRes, expensesRes, txRes, bankRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('client_transactions').select('*').order('date', { ascending: false }).limit(50),
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: false }),
    ]);
    if (clientsRes.data) setClients(clientsRes.data);
    if (expensesRes.data) setExpenses(expensesRes.data);
    if (txRes.data) setTransactions(txRes.data);
    if (bankRes.data) setBankAccounts(bankRes.data);
    setLoading(false);
  }

  const totalBankBalance = useMemo(() => bankAccounts.filter((a) => a.status === 'Active').reduce((s, a) => s + (a.current_balance || 0), 0), [bankAccounts]);
  const totalCashInHand = useMemo(() => totalBankBalance, [totalBankBalance]);

  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses]);

  const monthlyExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const key = e.date.slice(0, 7);
      map[key] = (map[key] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [expenses]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + (e.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);

  const clientBalances = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((t) => {
      map[t.client_id] = t.balance;
    });
    return clients.map((c) => ({
      name: c.name,
      balance: map[c.id] || 0,
      id: c.id,
    }));
  }, [clients, transactions]);

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 10);
  }, [transactions]);

  const filteredSearch = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return recentTransactions.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        String(t.debit).includes(q) ||
        String(t.credit).includes(q)
    );
  }, [search, recentTransactions]);

  const chartColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Overview of your accounting system</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none w-full sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{clients.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Expenses</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-error-50 dark:bg-error-900/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-error-600 dark:text-error-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Debits</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${transactions.reduce((s, t) => s + (t.debit || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-warning-50 dark:bg-warning-900/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-warning-600 dark:text-warning-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Credits</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${transactions.reduce((s, t) => s + (t.credit || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-secondary-50 dark:bg-secondary-900/20 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Cash in Hand</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${totalCashInHand.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-accent-600 dark:text-accent-400" />
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Bank Balance</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    ${totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <PiggyBank className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Search Results */}
          {search.trim() && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Search Results</h3>
              {filteredSearch.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No transactions found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredSearch.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{t.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t.date}</p>
                      </div>
                      <div className="text-right">
                        {t.debit > 0 && (
                          <p className="text-sm font-medium text-warning-600 dark:text-warning-400">
                            -${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        {t.credit > 0 && (
                          <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                            +${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">Bal: ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly Expenses</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyExpenses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Expense by Category</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={chartColors[i % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {categoryData.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: chartColors[i % chartColors.length] }} />
                    <span className="text-gray-600 dark:text-gray-300">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Client Balances */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Client Balances</h3>
              <button
                onClick={() => navigate('/clients')}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {clientBalances.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate('/clients')}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                  <p
                    className={`text-lg font-bold mt-1 ${
                      c.balance >= 0 ? 'text-secondary-600 dark:text-secondary-400' : 'text-error-600 dark:text-error-400'
                    }`}
                  >
                    ${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Bank Balances */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bank Balances</h3>
              <button
                onClick={() => navigate('/banks')}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {bankAccounts.map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate('/banks')}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.account_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.status === 'Active'
                        ? 'bg-secondary-50 text-secondary-700 dark:bg-secondary-900/20 dark:text-secondary-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.bank_name}</p>
                  <p className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
                    ${a.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
              {bankAccounts.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 col-span-full text-center py-4">No bank accounts added yet.</p>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
              <button
                onClick={() => navigate('/clients')}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
              >
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Client</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Debit</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Credit</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{t.date}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                        {clients.find((c) => c.id === t.client_id)?.name || 'Unknown'}
                      </td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{t.description}</td>
                      <td className="py-2 px-3 text-right text-warning-600 dark:text-warning-400">
                        {t.debit > 0 ? `$${t.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-secondary-600 dark:text-secondary-400">
                        {t.credit > 0 ? `$${t.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                        ${t.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {recentTransactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">
                        No transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
