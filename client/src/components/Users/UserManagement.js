import React, { useState, useEffect } from 'react';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import api from '../../api';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', groups: [], branch: '' });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detail, setDetail] = useState(null);
  const [branches, setBranches] = useState([]);
  const [allowedGroups, setAllowedGroups] = useState([]);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';

  useEffect(() => { load(); loadBranches(); loadAllowedGroups(); }, []);

  const load = () => api.get('/users').then(r => setUsers(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))).catch(() => {});
  const loadBranches = () => api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
  const loadAllowedGroups = async () => {
    try {
      const { data } = await api.get('/company');
      const MODULE_TO_GROUP = { pos: 'pos', sales: 'pos', emi: 'pos', purchase: 'inventory', accounts: 'accounts', reports: 'accounts', hr: 'hr' };
      const groups = [...new Set((data.enabledModules || []).map(m => MODULE_TO_GROUP[m]).filter(Boolean))];
      setAllowedGroups(groups);
    } catch { setAllowedGroups(['pos', 'inventory', 'accounts']); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, role: form.role, groups: form.groups, branch: form.branch || null };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing._id}`, payload);
      } else {
        await api.post('/users', { ...form, branch: form.branch || null });
      }
      setForm({ name: '', email: '', password: '', role: 'user', groups: [], branch: '' });
      setEditing(null);
      setShowForm(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save user', 'error');
    }
  };

  const edit = (user) => {
    setForm({ name: user.name, email: user.email, password: '', role: user.role, groups: user.groups || [], branch: user.branch?._id || user.branch || '' });
    setEditing(user);
    setShowForm(true);
  };

  const remove = (id) => {
    setConfirmDelete({ id, message: 'Delete this user?' });
  };

  const toggleGroup = (g) => {
    setForm(prev => ({
      ...prev,
      groups: prev.groups.includes(g) ? prev.groups.filter(x => x !== g) : [...prev.groups, g],
    }));
  };

  const GROUP_LABELS = { pos: 'POS (Sales, Customers)', inventory: 'Inventory (Products, Purchases, Suppliers)', accounts: 'Accounting (Vouchers, Ledger, Reports)', hr: 'HR (Employees, Attendance, Payroll, Leave)' };

  return (
    <div>
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', email: '', password: '', role: 'user', groups: [], branch: '' }); }}>
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{editing ? 'Edit User' : 'New User'}</h3>
              <button className="modal-close-x" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div className="form-group"><label>Email *</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                  <div className="form-group"><label>Password {editing && '(leave blank to keep same)'}</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editing} /></div>
                  <div className="form-group"><label>Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select></div>
                  <div className="form-group"><label>Branch</label><select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}>
                    <option value="">None</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select></div>
                </div>
                <div className="form-group"><label>Access Groups</label>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {Object.entries(GROUP_LABELS).filter(([key]) => allowedGroups.includes(key)).map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={form.groups.includes(key)} onChange={() => toggleGroup(key)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th>{isSuperAdmin && <th>Company</th>}<th>Role</th><th>Branch</th><th>Access Groups</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} onClick={() => setDetail(u)} style={{ cursor: 'pointer' }}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  {isSuperAdmin && <td>{u.company?.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No company</span>}</td>}
                  <td><span className={`badge ${u.role === 'super_admin' ? 'badge-danger' : u.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>{u.role}</span></td>
                  <td>{u.branch?.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None</span>}</td>
                  <td>{(u.groups || []).map(g => <span key={g} className="badge badge-success" style={{ marginRight: 4 }}>{g}</span>)}</td>
                  <td><span className={`badge ${u.isActive === false ? 'badge-danger' : 'badge-success'}`}>{u.isActive === false ? 'Inactive' : 'Active'}</span></td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDetail(u)}>View</button>
                    <button className="btn btn-sm" onClick={() => edit(u)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(u._id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={isSuperAdmin ? 8 : 7} className="text-center">No users</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => { if (confirmDelete) { await api.delete(`/users/${confirmDelete.id}`); load(); } setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
      {detail && (
        <EntryDetailsModal
          title={detail.name}
          subtitle="Click row to view user details"
          meta={[
            { label: 'Email', value: detail.email },
            ...(isSuperAdmin ? [{ label: 'Company', value: detail.company?.name || 'None' }] : []),
            { label: 'Role', value: detail.role },
            { label: 'Branch', value: detail.branch?.name || 'None' },
            { label: 'Status', value: detail.isActive === false ? 'Inactive' : 'Active' },
            { label: 'Access Groups', value: (detail.groups || []).join(', ') || 'None' },
            { label: 'Created', value: detail.createdAt ? new Date(detail.createdAt).toLocaleDateString('en-IN') : '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[{ label: 'Groups', value: (detail.groups || []).map(g => <span key={g} className="badge badge-success" style={{ marginRight: 4 }}>{g}</span>) }]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
