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
  Landmark,
  DollarSign,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Calendar,
  Check,
  XCircle,
  BarChart3,
} from 'lucide-react';
import type { BankAccount, BankTransaction } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function BankAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [accModal, setAccModal] = useState(false);
  const [txModal, setTxModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deleteAccId, setDeleteAccId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [showStatement, setShowStatement] = useState(false);
  const [stmtMonth, setStmtMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [accForm, setAccForm] = useState({
    account_name: '',
    bank_name: '',
    account_number: '',
    opening_balance: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().split('T')[0],
    transaction_type: 'Deposit' as 'Deposit' | 'Withdrawal' | 'Transfer',
    description: '',
    amount: '',
    to_account_id: '',
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      loadTransactions(selectedAccount.id);
    }
  }, [selectedAccount]);

  async function loadAccounts() {
    const { data } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
    if (data) {
      setAccounts(data);
      if (!selectedAccount && data.length > 0) setSelectedAccount(data[0]);
    }
  }

  async function loadTransactions(accountId: string) {
    const { data } = await supabase
      .from('bank_transactions')
      .select('*')
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .order('date', { ascending: true });
    if (data) {
      // Recompute balance_after for display for the selected account
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      let bal = account.opening_balance;
      const sorted = data.map((t) => {
        if (t.transaction_type === 'Deposit') {
          if (t.account_id === accountId) bal += t.amount;
        } else if (t.transaction_type === 'Withdrawal') {
          if (t.account_id === accountId) bal -= t.amount;
        } else if (t.transaction_type === 'Transfer') {
          if (t.account_id === accountId) bal -= t.amount;
          if (t.to_account_id === accountId) bal += t.amount;
        }
        return { ...t, balance_after: Number(bal.toFixed(2)) };
      });
      setTransactions(sorted);
    }
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (search && !a.account_name.toLowerCase().includes(search.toLowerCase()) && !a.bank_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [accounts, search]);

  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      if (txSearch && !t.description.toLowerCase().includes(txSearch.toLowerCase()) && !t.transaction_type.toLowerCase().includes(txSearch.toLowerCase())) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      return true;
    });
  }, [transactions, txSearch, dateFrom, dateTo]);

  const paginatedTx = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredTx.slice(start, start + perPage);
  }, [filteredTx, page]);

  const totalPages = Math.ceil(filteredTx.length / perPage) || 1;

  const totalBankBalance = useMemo(() => accounts.filter((a) => a.status === 'Active').reduce((s, a) => s + (a.current_balance || 0), 0), [accounts]);
  const totalCash = useMemo(() => {
    const bankTotal = accounts.filter((a) => a.status === 'Active').reduce((s, a) => s + (a.current_balance || 0), 0);
    return bankTotal;
  }, [accounts]);

  const openAddAccount = () => {
    setEditingAccount(null);
    setAccForm({ account_name: '', bank_name: '', account_number: '', opening_balance: '', status: 'Active' });
    setAccModal(true);
  };

  const openEditAccount = (a: BankAccount) => {
    setEditingAccount(a);
    setAccForm({
      account_name: a.account_name,
      bank_name: a.bank_name,
      account_number: a.account_number,
      opening_balance: String(a.opening_balance),
      status: a.status as 'Active' | 'Inactive',
    });
    setAccModal(true);
  };

  const handleSaveAccount = async () => {
    if (!accForm.account_name || !accForm.bank_name || !accForm.account_number || !accForm.opening_balance) return;
    setSaving(true);
    const payload = {
      account_name: accForm.account_name,
      bank_name: accForm.bank_name,
      account_number: accForm.account_number,
      opening_balance: Number(accForm.opening_balance),
      current_balance: Number(accForm.opening_balance),
      status: accForm.status,
    };
    if (editingAccount) {
      const { data } = await supabase.from('bank_accounts').update(payload).eq('id', editingAccount.id).select().single();
      if (data) {
        await logAudit('bank_accounts', editingAccount.id, 'UPDATE', editingAccount as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>, user!.id);
        setAccounts((prev) => prev.map((a) => (a.id === editingAccount.id ? data : a)));
        if (selectedAccount?.id === editingAccount.id) setSelectedAccount(data);
      }
    } else {
      const { data } = await supabase.from('bank_accounts').insert(payload).select().single();
      if (data) {
        await logAudit('bank_accounts', data.id, 'INSERT', null, data as unknown as Record<string, unknown>, user!.id);
        setAccounts((prev) => [data, ...prev]);
        if (!selectedAccount) setSelectedAccount(data);
      }
    }
    setSaving(false);
    setAccModal(false);
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccId) return;
    const acc = accounts.find((a) => a.id === deleteAccId);
    const { error } = await supabase.from('bank_accounts').delete().eq('id', deleteAccId);
    if (!error) {
      if (acc) await logAudit('bank_accounts', deleteAccId, 'DELETE', acc as unknown as Record<string, unknown>, null, user!.id);
      setAccounts((prev) => prev.filter((a) => a.id !== deleteAccId));
      if (selectedAccount?.id === deleteAccId) {
        setSelectedAccount(null);
        setTransactions([]);
      }
    }
    setDeleteAccId(null);
  };

  const openAddTx = () => {
    setTxForm({
      date: new Date().toISOString().split('T')[0],
      transaction_type: 'Deposit',
      description: '',
      amount: '',
      to_account_id: '',
    });
    setTxModal(true);
  };

  const handleSaveTx = async () => {
    if (!selectedAccount || !txForm.description || !txForm.amount || isNaN(Number(txForm.amount))) return;
    const amount = Number(txForm.amount);
    if (amount <= 0) return;
    setSaving(true);

    const txType = txForm.transaction_type;
    let fromBalance = selectedAccount.current_balance;
    let toBalance = 0;
    let toAccount: BankAccount | null = null;

    if (txType === 'Withdrawal' && fromBalance < amount) {
      alert('Insufficient balance');
      setSaving(false);
      return;
    }
    if (txType === 'Transfer') {
      if (!txForm.to_account_id || txForm.to_account_id === selectedAccount.id) {
        alert('Please select a different destination account');
        setSaving(false);
        return;
      }
      if (fromBalance < amount) {
        alert('Insufficient balance for transfer');
        setSaving(false);
        return;
      }
      toAccount = accounts.find((a) => a.id === txForm.to_account_id) || null;
      if (toAccount) toBalance = toAccount.current_balance;
    }

    // Insert main transaction
    const { data: txData } = await supabase.from('bank_transactions').insert({
      account_id: selectedAccount.id,
      to_account_id: txType === 'Transfer' ? txForm.to_account_id : null,
      date: txForm.date,
      transaction_type: txType,
      description: txForm.description,
      amount,
      balance_after: txType === 'Deposit' ? fromBalance + amount : fromBalance - amount,
    }).select().single();

    if (txData) {
      await logAudit('bank_transactions', txData.id, 'INSERT', null, txData as unknown as Record<string, unknown>, user!.id);
    }

    // Update account balances
    if (txType === 'Deposit') {
      const newBal = fromBalance + amount;
      await supabase.from('bank_accounts').update({ current_balance: newBal }).eq('id', selectedAccount.id);
      setAccounts((prev) => prev.map((a) => (a.id === selectedAccount.id ? { ...a, current_balance: newBal } : a)));
      setSelectedAccount((prev) => prev ? { ...prev, current_balance: newBal } : prev);
    } else if (txType === 'Withdrawal') {
      const newBal = fromBalance - amount;
      await supabase.from('bank_accounts').update({ current_balance: newBal }).eq('id', selectedAccount.id);
      setAccounts((prev) => prev.map((a) => (a.id === selectedAccount.id ? { ...a, current_balance: newBal } : a)));
      setSelectedAccount((prev) => prev ? { ...prev, current_balance: newBal } : prev);
    } else if (txType === 'Transfer' && toAccount) {
      const newFromBal = fromBalance - amount;
      const newToBal = toBalance + amount;
      await supabase.from('bank_accounts').update({ current_balance: newFromBal }).eq('id', selectedAccount.id);
      await supabase.from('bank_accounts').update({ current_balance: newToBal }).eq('id', toAccount.id);
      setAccounts((prev) => prev.map((a) => {
        if (a.id === selectedAccount.id) return { ...a, current_balance: newFromBal };
        if (a.id === toAccount!.id) return { ...a, current_balance: newToBal };
        return a;
      }));
      setSelectedAccount((prev) => prev ? { ...prev, current_balance: newFromBal } : prev);
      // Insert counter-party transaction record
      const { data: txToData } = await supabase.from('bank_transactions').insert({
        account_id: toAccount.id,
        to_account_id: selectedAccount.id,
        date: txForm.date,
        transaction_type: 'Transfer',
        description: `Transfer received from ${selectedAccount.account_name}: ${txForm.description}`,
        amount,
        balance_after: newToBal,
      }).select().single();
      if (txToData) {
        await logAudit('bank_transactions', txToData.id, 'INSERT', null, txToData as unknown as Record<string, unknown>, user!.id);
      }
    }

    await loadTransactions(selectedAccount.id);
    setSaving(false);
    setTxModal(false);
  };

  const exportExcel = () => {
    if (!selectedAccount) return;
    const rows = filteredTx.map((t) => ({
      Date: t.date,
      Type: t.transaction_type,
      Description: t.description,
      Amount: t.amount,
      'Balance After': t.balance_after,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedAccount.account_name);
    XLSX.writeFile(wb, `${selectedAccount.account_name.replace(/\s+/g, '_')}_transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = () => {
    if (!selectedAccount) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Bank Statement: ${selectedAccount.account_name}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Bank: ${selectedAccount.bank_name} | Account: ${selectedAccount.account_number}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);
    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Type', 'Description', 'Amount', 'Balance After']],
      body: filteredTx.map((t) => [
        t.date,
        t.transaction_type,
        t.description,
        `$${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$${t.balance_after.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      ]),
    });
    doc.save(`${selectedAccount.account_name.replace(/\s+/g, '_')}_statement_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrint = () => window.print();

  const statementData = useMemo(() => {
    if (!showStatement || !selectedAccount) return [];
    return filteredTx.filter((t) => t.date.startsWith(stmtMonth));
  }, [showStatement, filteredTx, stmtMonth, selectedAccount]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bank Accounts</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage bank accounts, transactions, and transfers</p>
        </div>
        <button
          onClick={openAddAccount}
          className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Cash in Hand</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${totalCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary-50 dark:bg-secondary-900/20 flex items-center justify-center">
            <PiggyBank className="w-5 h-5 text-secondary-600 dark:text-secondary-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Bank Balance</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Active Accounts</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {accounts.filter((a) => a.status === 'Active').length}
            </p>
          </div>
        </div>
      </div>

      {/* Account Balances */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Individual Bank Balances</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              onClick={() => { setSelectedAccount(a); setPage(1); setTxSearch(''); setDateFrom(''); setDateTo(''); }}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                selectedAccount?.id === a.id
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-500'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{a.account_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.bank_name}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  a.status === 'Active'
                    ? 'bg-secondary-50 text-secondary-700 dark:bg-secondary-900/20 dark:text-secondary-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {a.status === 'Active' ? <Check className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                  {a.status}
                </span>
              </div>
              <p className="text-lg font-bold mt-2 text-gray-900 dark:text-white">
                ${a.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Acc: {a.account_number}</p>
            </div>
          ))}
          {accounts.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 col-span-full text-center py-4">No bank accounts. Add one to get started.</p>
          )}
        </div>
      </div>

      {/* Selected Account Transactions */}
      {selectedAccount && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedAccount.account_name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedAccount.bank_name} — {selectedAccount.account_number}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Current Balance</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    ${selectedAccount.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Opening</p>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ${selectedAccount.opening_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Controls */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={txSearch}
                  onChange={(e) => { setTxSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Filter className="w-4 h-4" /> Filters
              </button>
              <button
                onClick={() => setShowStatement(!showStatement)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" /> Statement
              </button>
              <button
                onClick={exportExcel}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button
                onClick={exportPDF}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={openAddTx}
                className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Transaction
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

          {/* Statement Panel */}
          {showStatement && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bank Statement</h3>
                <input
                  type="month"
                  value={stmtMonth}
                  onChange={(e) => setStmtMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              {statementData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                        <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Date</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.map((t) => (
                        <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{t.date}</td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              t.transaction_type === 'Deposit'
                                ? 'bg-secondary-50 text-secondary-700 dark:bg-secondary-900/20 dark:text-secondary-400'
                                : t.transaction_type === 'Withdrawal'
                                ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                                : 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                            }`}>
                              {t.transaction_type === 'Deposit' && <ArrowDown className="w-3 h-3" />}
                              {t.transaction_type === 'Withdrawal' && <ArrowUp className="w-3 h-3" />}
                              {t.transaction_type === 'Transfer' && <ArrowLeftRight className="w-3 h-3" />}
                              {t.transaction_type}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{t.description}</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                            ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                            ${t.balance_after.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No transactions for this period.</p>
              )}
            </div>
          )}

          {/* Transactions Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTx.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{t.date}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          t.transaction_type === 'Deposit'
                            ? 'bg-secondary-50 text-secondary-700 dark:bg-secondary-900/20 dark:text-secondary-400'
                            : t.transaction_type === 'Withdrawal'
                            ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                            : 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        }`}>
                          {t.transaction_type === 'Deposit' && <ArrowDown className="w-3 h-3" />}
                          {t.transaction_type === 'Withdrawal' && <ArrowUp className="w-3 h-3" />}
                          {t.transaction_type === 'Transfer' && <ArrowLeftRight className="w-3 h-3" />}
                          {t.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{t.description}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                        ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                        ${t.balance_after.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {paginatedTx.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">No transactions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {((page - 1) * perPage) + 1} - {Math.min(page * perPage, filteredTx.length)} of {filteredTx.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{page} / {totalPages}</span>
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
      )}

      {/* Account Modal */}
      {accModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editingAccount ? 'Edit Account' : 'Add Bank Account'}</h3>
              <button onClick={() => setAccModal(false)} className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Name</label>
                <input
                  type="text"
                  value={accForm.account_name}
                  onChange={(e) => setAccForm((f) => ({ ...f, account_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. Main Business Account"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name</label>
                <input
                  type="text"
                  value={accForm.bank_name}
                  onChange={(e) => setAccForm((f) => ({ ...f, bank_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. Meezan Bank"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Number</label>
                <input
                  type="text"
                  value={accForm.account_number}
                  onChange={(e) => setAccForm((f) => ({ ...f, account_number: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={accForm.opening_balance}
                  onChange={(e) => setAccForm((f) => ({ ...f, opening_balance: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={accForm.status}
                  onChange={(e) => setAccForm((f) => ({ ...f, status: e.target.value as 'Active' | 'Inactive' }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setAccModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccount}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingAccount ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {txModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Transaction</h3>
              <button onClick={() => setTxModal(false)} className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  value={txForm.date}
                  onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Type</label>
                <select
                  value={txForm.transaction_type}
                  onChange={(e) => setTxForm((f) => ({ ...f, transaction_type: e.target.value as 'Deposit' | 'Withdrawal' | 'Transfer', to_account_id: '' }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="Deposit">Deposit</option>
                  <option value="Withdrawal">Withdrawal</option>
                  <option value="Transfer">Transfer</option>
                </select>
              </div>
              {txForm.transaction_type === 'Transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Account</label>
                  <select
                    value={txForm.to_account_id}
                    onChange={(e) => setTxForm((f) => ({ ...f, to_account_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="">Select destination account</option>
                    {accounts.filter((a) => a.id !== selectedAccount?.id && a.status === 'Active').map((a) => (
                      <option key={a.id} value={a.id}>{a.account_name} ({a.bank_name})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={txForm.description}
                  onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Enter description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={txForm.amount}
                  onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="0.00"
                />
              </div>
              {selectedAccount && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Available Balance: ${selectedAccount.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setTxModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTx}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirm */}
      {deleteAccId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">All transactions will be deleted. This cannot be undone.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteAccId(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
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
