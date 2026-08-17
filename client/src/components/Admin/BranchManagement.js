import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import { adToBsStr } from '../UI/NepaliDatePicker';

export default function BranchManagement() {
  const addToast = useToast();
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editBranch, setEditBranch] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '', selectedUsers: [] });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  useEffect(() => { load(); loadUsers(); }, []);

  const load = () => api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
  const loadUsers = () => api.get('/users').then(r => setUsers(r.data.filter(u => u.isActive !== false))).catch(() => {});

  const startCreate = () => {
    setEditBranch(null);
    setForm({ name: '', address: '', phone: '', email: '', selectedUsers: [] });
    setShowForm(true);
  };

  const startEdit = (b) => {
    setEditBranch(b);
    setForm({
      name: b.name,
      address: b.address || '',
      phone: b.phone || '',
      email: b.email || '',
      selectedUsers: (b.users || []).map(u => u._id),
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name) return addToast('Branch name is required', 'error');
    setSaving(true);
    try {
      if (editBranch) {
        await api.put(`/branches/${editBranch._id}`, {
          name: form.name, address: form.address, phone: form.phone, email: form.email, userIds: form.selectedUsers,
        });
        addToast('Branch updated', 'success');
      } else {
        await api.post('/branches', {
          name: form.name, address: form.address, phone: form.phone, email: form.email, userIds: form.selectedUsers,
        });
        addToast('Branch created', 'success');
      }
      setShowForm(false);
      setEditBranch(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save branch', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/branches/${confirmDelete}`);
      setConfirmDelete(null);
      load();
      addToast('Branch deleted', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to delete branch', 'error');
    }
  };

  const toggleUserSelection = (userId) => {
    setForm(prev => ({
      ...prev,
      selectedUsers: prev.selectedUsers.includes(userId)
        ? prev.selectedUsers.filter(u => u !== userId)
        : [...prev.selectedUsers, userId],
    }));
  };

  const assignedBranch = (userId) => {
    const b = branches.find(br => (br.users || []).some(u => (u._id || u) === userId));
    return b ? b.name : null;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Branch Management <span className="badge badge-info">{branches.length}</span></h1>
        {isAdmin && <button className="btn btn-primary" onClick={showForm ? () => { setShowForm(false); setEditBranch(null); } : startCreate}>{showForm ? 'Cancel' : 'Add Branch'}</button>}
      </div>

      {isAdmin && showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{editBranch ? 'Edit Branch' : 'New Branch'}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>Assign Users to Branch</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              {users.map(u => (
                <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', opacity: (assignedBranch(u._id) && !form.selectedUsers.includes(u._id)) ? 0.5 : 1 }}>
                  <input type="checkbox" checked={form.selectedUsers.includes(u._id)} onChange={() => toggleUserSelection(u._id)} />
                  <span>{u.name}</span>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({u.role})</span>
                  {assignedBranch(u._id) && !form.selectedUsers.includes(u._id) && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>in {assignedBranch(u._id)}</span>}
                </label>
              ))}
              {users.length === 0 && <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No users available</p>}
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : (editBranch ? 'Update Branch' : 'Create Branch')}</button>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Address</th><th>Phone</th><th>Users</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b._id}>
                  <td><strong>{b.name}</strong></td>
                  <td>{b.address || '-'}</td>
                  <td>{b.phone || '-'}</td>
                  <td><span className="badge badge-info">{(b.users || []).length}</span></td>
                  <td>{adToBsStr(new Date(b.createdAt))}</td>
                  <td className="action-cell">
                    {isAdmin && <>
                      <button className="btn btn-sm" onClick={() => startEdit(b)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(b._id)}>Delete</button>
                    </>}
                  </td>
                </tr>
              ))}
              {branches.length === 0 && <tr><td colSpan="6" className="text-center">No branches created yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {branches.map(b => (
        <div key={b._id} className="card" style={{ marginTop: '1rem' }}>
          <h4>{b.name} — Users ({(b.users || []).length})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(b.users || []).map(u => (
              <span key={u._id || u} className="badge badge-success" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
                {typeof u === 'string' ? u : u.name} {typeof u === 'object' && u.role && <span style={{ color: '#94a3b8' }}>({u.role})</span>}
              </span>
            ))}
            {(!b.users || b.users.length === 0) && <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No users assigned</span>}
          </div>
        </div>
      ))}

      <ConfirmModal open={!!confirmDelete} title="Delete Branch" message="Are you sure? Users will be unassigned from this branch." onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
