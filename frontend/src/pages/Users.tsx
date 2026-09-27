import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import type { User } from '../types';
import toast from 'react-hot-toast';
import { UserPlus, Trash2, Shield, ShieldOff, X, Loader2, Users as UsersIcon } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import PageContainer from '../components/ui/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import IconButton from '../components/ui/IconButton';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [deleteUserCode, setDeleteUserCode] = useState<string | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try { const res = await api.get('/users/'); setUsers(res.data); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!email || !fullName || !password) { toast.error('All fields are required'); return; }
    setCreating(true);
    try {
      await api.post('/users/', { email, full_name: fullName, password, role });
      toast.success('User created');
      setShowCreate(false); setEmail(''); setFullName(''); setPassword('');
      loadUsers();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to create user'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (user: User) => {
    try {
      await api.patch(`/users/${user.public_code}`, { is_active: !user.is_active });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      loadUsers();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to update user'); }
  };

  const handleDelete = async (code: string) => {
    try { await api.delete(`/users/${code}`); toast.success('User deleted'); loadUsers(); }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
    finally { setDeleteUserCode(null); }
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const avatarColors = ['from-brand-400 to-accent-400', 'from-emerald-400 to-teal-400', 'from-amber-400 to-orange-400', 'from-pink-400 to-rose-400', 'from-blue-400 to-cyan-400'];

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
            <UserPlus size={16} /> Add User
          </button>
        }
      />

      {/* Create Dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="card-static p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="section-title">Create User</h3>
                <IconButton icon={X} label="Close create user form" size="sm" onClick={() => setShowCreate(false)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                  <input id="user-name" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" placeholder="John Doe" />
                </div>
                <div>
                  <label htmlFor="user-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="john@company.com" />
                </div>
                <div>
                  <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 mb-1.5">Temporary Password</label>
                  <input id="user-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Min 8 characters" />
                </div>
                <div>
                  <label htmlFor="user-role" className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                  <select id="user-role" value={role} onChange={e => setRole(e.target.value)} className="input-field">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">User will be required to change password on first login.</p>
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={handleCreate} disabled={creating} className="btn-primary">
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {creating ? 'Creating…' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-static p-4 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2"><div className="skeleton h-4 w-32" /><div className="skeleton h-3 w-48" /></div>
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No users yet"
          description="Invite teammates so they can create and send campaigns"
          iconTone="bg-gray-100"
          iconColor="text-gray-500"
          action={
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
              <UserPlus size={16} /> Add User
            </button>
          }
        />
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
          {users.map((user, idx) => (
            <motion.div key={user.public_code} variants={item}
              className="card group p-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} flex items-center justify-center text-white text-xs font-bold shadow-md flex-shrink-0`}>
                {initials(user.full_name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900 truncate">{user.full_name}</span>
                  <span className="font-mono text-[11px] text-gray-500">{user.public_code}</span>
                  <span className={`badge ring-0 ${user.role === 'admin' ? 'badge-purple' : 'badge-gray'}`}>
                    {user.role === 'admin' ? <Shield size={10} /> : <ShieldOff size={10} />}
                    {user.role}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>

              {/* Status */}
              <span className={`badge ring-0 ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {user.is_active ? 'Active' : 'Inactive'}
              </span>

              {/* Date */}
              <span className="text-xs text-gray-500 hidden lg:block w-24 text-right">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-1 ml-auto sm:ml-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => toggleActive(user)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    user.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {user.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <IconButton icon={Trash2} label={`Delete ${user.full_name}`} tone="danger" size="sm" onClick={() => setDeleteUserCode(user.public_code)} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <ConfirmDialog
        open={deleteUserCode !== null}
        title="Delete User"
        message="Are you sure you want to delete this user? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteUserCode && handleDelete(deleteUserCode)}
        onCancel={() => setDeleteUserCode(null)}
      />
    </PageContainer>
  );
}
