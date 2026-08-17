import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import api from '../../api';

const MODULES = [
  { key: 'pos', label: 'POS & Refunds' },
  { key: 'sales', label: 'Sales (Invoices, Payment In, Returns)' },
  { key: 'emi', label: 'EMI' },
  { key: 'purchase', label: 'Purchase & Store' },
  { key: 'accounts', label: 'Accounting' },
  { key: 'reports', label: 'Reports' },
  { key: 'hr', label: 'HR & Payroll' },
  { key: 'settings', label: 'Admin Settings' },
  { key: 'tracking', label: 'Order Tracking' },
];

const initialForm = () => ({ name: '', email: '', phone: '', address: '', adminName: '', password: '' });

export default function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [editFields, setEditFields] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmUserDelete, setConfirmUserDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const addToast = useToast();
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = () => api.get('/companies').then(r => setCompanies(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))).catch(() => {});

  const viewDetails = async (id) => {
    try {
      const { data } = await api.get(`/companies/${id}`);
      setSelected(data.company);
      setUsers(data.users);
      setModules(data.company.enabledModules || []);
      setChatbotEnabled(!!data.company.chatbotEnabled);
      setEditFields({ name: data.company.name, phone: data.company.phone || '', address: data.company.address || '', pan: data.company.pan || '' });
    } catch (err) {
      addToast('Failed to load company details', 'error');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/companies', form);
      setShowForm(false);
      setForm(initialForm());
      load();
      addToast('Company created', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create company', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveModules = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/companies/${selected._id}`, { enabledModules: modules, chatbotEnabled });
      setSelected(data);
      load();
      addToast('Modules updated', 'success');
    } catch (err) {
      addToast('Failed to update modules', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCompany = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/companies/${selected._id}`, editFields);
      setSelected(data);
      load();
      addToast('Company updated', 'success');
    } catch (err) {
      addToast('Failed to update company', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    await api.put(`/companies/${id}`, { isActive: !currentStatus });
    load();
  };

  const toggleUserActive = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { isActive: u.isActive === false });
      viewDetails(selected._id);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update user', 'error');
    }
  };

  const remove = (id) => {
    setConfirmDelete({ id, message: 'Delete this company and ALL of its data (users, sales, purchases, accounts, HR)? This cannot be undone.' });
  };

  const removeUser = (u) => {
    setConfirmUserDelete({ id: u._id, message: `Delete user "${u.name}" (${u.email})?` });
  };

  const enterCompany = (id) => {
    localStorage.setItem('selectedCompany', JSON.stringify(id));
    window.location.href = '/';
  };

  const toggleModule = (key) => {
    setModules(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Companies <span className="badge badge-info">{companies.length}</span></h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Company'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card form-card">
          <h3>New Company</h3>
          <div className="form-grid">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="form-group"><label>Email *</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="form-group"><label>Admin Name *</label><input value={form.adminName} onChange={e => setForm({ ...form, adminName: e.target.value })} required /></div>
            <div className="form-group"><label>Admin Password *</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Company'}</button>
        </form>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Subscription</th><th>Enabled Modules</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c._id} className={selected?._id === c._id ? 'row-warning' : ''}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td><span className="badge badge-info">{c.subscription}</span></td>
                  <td>{(c.enabledModules || []).map(m => <span key={m} className="badge badge-success" style={{ marginRight: 4 }}>{m}</span>)}</td>
                  <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="action-cell">
                    <button className="btn btn-sm" onClick={() => viewDetails(c._id)}>View</button>
                    <button className="btn btn-sm" onClick={() => enterCompany(c._id)} title="Enter this company as super admin">Enter</button>
                    <button className="btn btn-sm" onClick={() => toggleStatus(c._id, c.isActive)}>{c.isActive ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(c._id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && <tr><td colSpan="6" className="text-center">No companies</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <button className="btn btn-primary" onClick={() => enterCompany(selected._id)}>Enter Company</button>
            </div>

            <form onSubmit={saveCompany} className="form-grid">
              <div className="form-group"><label>Name</label><input value={editFields?.name || ''} onChange={e => setEditFields({ ...editFields, name: e.target.value })} /></div>
              <div className="form-group"><label>Phone</label><input value={editFields?.phone || ''} onChange={e => setEditFields({ ...editFields, phone: e.target.value })} /></div>
              <div className="form-group"><label>Address</label><input value={editFields?.address || ''} onChange={e => setEditFields({ ...editFields, address: e.target.value })} /></div>
              <div className="form-group"><label>PAN</label><input value={editFields?.pan || ''} onChange={e => setEditFields({ ...editFields, pan: e.target.value })} /></div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Company'}</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0 }}>Enabled Modules</h4>
              <button className="btn btn-primary" onClick={saveModules} disabled={saving}>{saving ? 'Saving...' : 'Save Modules'}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {MODULES.map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', marginTop: '0.75rem' }}>
              <input type="checkbox" checked={chatbotEnabled} onChange={e => setChatbotEnabled(e.target.checked)} />
              Enable AI Chatbot Assistant for this company
            </label>
          </div>

          <div className="card">
            <h4 style={{ marginBottom: '0.5rem' }}>Users ({users.length})</h4>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Type</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u._id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td><span className={`badge ${u.role === 'super_admin' ? 'badge-danger' : u.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>{u.role}</span></td>
                      <td>{u.isCompanySuperAdmin ? <span className="badge badge-danger">Company Owner (hidden)</span> : <span className="badge badge-success">Member</span>}</td>
                      <td><span className={`badge ${u.isActive === false ? 'badge-danger' : 'badge-success'}`}>{u.isActive === false ? 'Inactive' : 'Active'}</span></td>
                      <td className="action-cell">
                        <button className="btn btn-sm" onClick={() => toggleUserActive(u)}>{u.isActive === false ? 'Activate' : 'Deactivate'}</button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeUser(u)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan="6" className="text-center">No users</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => {
        if (confirmDelete) {
          try {
            await api.delete(`/companies/${confirmDelete.id}`);
            if (selected?._id === confirmDelete.id) setSelected(null);
            load();
            addToast('Company deleted', 'success');
          } catch (err) {
            addToast('Failed to delete company', 'error');
          }
        }
        setConfirmDelete(null);
      }} onCancel={() => setConfirmDelete(null)} />

      <ConfirmModal open={!!confirmUserDelete} title="Confirm Delete" message={confirmUserDelete?.message} onConfirm={async () => {
        if (confirmUserDelete) {
          try {
            await api.delete(`/users/${confirmUserDelete.id}`);
            viewDetails(selected._id);
            addToast('User deleted', 'success');
          } catch (err) {
            addToast(err.response?.data?.message || 'Failed to delete user', 'error');
          }
        }
        setConfirmUserDelete(null);
      }} onCancel={() => setConfirmUserDelete(null)} />
    </div>
  );
}
