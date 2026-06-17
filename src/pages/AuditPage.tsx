import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search,
  Calendar,
  User,
  Trash2,
  Pencil,
  Plus,
} from 'lucide-react';
import type { AuditLog } from '../lib/supabase';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(500);
    if (data) setLogs(data);
  }

  const filtered = logs.filter((log) => {
    if (search && !log.table_name.toLowerCase().includes(search.toLowerCase()) && !log.action.toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter && log.action !== actionFilter) return false;
    if (tableFilter && log.table_name !== tableFilter) return false;
    return true;
  });

  const tables = Array.from(new Set(logs.map((l) => l.table_name)));
  const actions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Trail</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Track all changes made to the system</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Tables</option>
            {tables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Time</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Table</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Action</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Record</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">User</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(log.performed_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {log.table_name}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.action === 'INSERT'
                        ? 'bg-secondary-50 text-secondary-700 dark:bg-secondary-900/20 dark:text-secondary-400'
                        : log.action === 'UPDATE'
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
                    }`}>
                      {log.action === 'INSERT' && <Plus className="w-3 h-3" />}
                      {log.action === 'UPDATE' && <Pencil className="w-3 h-3" />}
                      {log.action === 'DELETE' && <Trash2 className="w-3 h-3" />}
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs font-mono">
                    {log.record_id.slice(0, 8)}...
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {log.performed_by.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs max-w-xs truncate">
                    {log.new_data ? JSON.stringify(log.new_data).slice(0, 60) : log.old_data ? JSON.stringify(log.old_data).slice(0, 60) : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500 dark:text-gray-400">No audit logs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
