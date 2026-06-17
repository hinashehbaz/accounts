import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Client = {
  id: string;
  name: string;
  created_at: string;
};

export type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  remarks: string | null;
  bank_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientTransaction = {
  id: string;
  client_id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  bank_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  performed_by: string;
  performed_at: string;
};

export type UserRole = {
  id: string;
  user_id: string;
  role: 'admin' | 'staff';
  created_at: string;
};

export type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  opening_balance: number;
  current_balance: number;
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
};

export type BankTransaction = {
  id: string;
  account_id: string;
  to_account_id: string | null;
  date: string;
  transaction_type: 'Deposit' | 'Withdrawal' | 'Transfer';
  description: string;
  amount: number;
  balance_after: number;
  created_at: string;
};
