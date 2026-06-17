import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Shield,
  Pencil,
  Search,
  Users,
} from 'lucide-react';
import type { UserRole } from '../lib/supabase';

interface UserWithRole {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const { data: rolesData } = await supabase.from('user_roles').select('*');
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const rolesMap = new Map<string, 'admin' | 'staff'>();
    if (rolesData) {
      rolesData.forEach((r: UserRole) => rolesMap.set(r.user_id, r.role));
    }
    const list: UserWithRole[] = (usersData?.users || []).map((u: { id: string; email?: string; created_at: string }) => ({
      id: u.id,
      email: u.email || '',
      role: rolesMap.get(u.id) || 'staff',
      created_at: u.created_at,
    }));
    setUsers(list);
  }

  const toggleRole = async (targetId: string, currentRole: 'admin' | 'staff') => {
    setSaving(true);
    const newRole = currentRole === 'admin' ? 'staff' : 'admin';
    const { data: existing } = await supabase.from('user_roles').select('*').eq('user_id', targetId).single();
    if (existing) {
      await supabase.from('user_roles').update({ role: newRole }).eq('user_id', targetId);
    } else {
      await supabase.from('user_roles').insert({ user_id: targetId, role: newRole });
    }
    setUsers((prev) => prev.map((u) => (u.id === targetId ? { ...u, role: newRole } : u)));
    setEditingId(null);
    setSaving(false);
  };

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage users and their roles</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Role</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Joined</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin'
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setEditingId(u.id)}
                      className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500 dark:text-gray-400">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Role</h3>
            <div className="space-y-3">
              {(['staff', 'admin'] as const).map((role) => {
                const target = users.find((u) => u.id === editingId);
                const isCurrent = target?.role === role;
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(editingId, target?.role || 'staff')}
                    disabled={saving || isCurrent}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                      isCurrent
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {role === 'admin' ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                    <div>
                      <p className="font-medium capitalize">{role}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {role === 'admin' ? 'Full access to all features' : 'Limited access, no admin features'}
                      </p>
                    </div>
                    {isCurrent && <span className="ml-auto text-xs font-medium text-primary-600 dark:text-primary-400">Current</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setEditingId(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
