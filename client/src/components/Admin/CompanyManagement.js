import React, { useState, useEffect } from 'react';
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
  { key: 'tracking', label: 'Logistics & Courier (Order Tracking, Branches, Delivery)' },
];

const initialForm = () => ({ name: '', email: '', phone: '', address: '', adminName: '', password: '' });

export default function CompanyManagement() {
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmUserDelete, setConfirmUserDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const addToast = useToast();

  const [modal, setModal] = useState(null);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);
  const [editFields, setEditFields] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => { load(); }, []);

  const load = () => api.get('/companies').then(r => setCompanies(r.data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))).catch(() => {});

  const openModal = async (company) => {
    try {
      const { data } = await api.get(`/companies/${company._id}`);
      setModal(data.company);
      setUsers(data.users);
      setModules(data.company.enabledModules || []);
      setChatbotEnabled(!!data.company.chatbotEnabled);
      setEditFields({ name: data.company.name, phone: data.company.phone || '', address: data.company.address || '', pan: data.company.pan || '' });
      setActiveTab('details');
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
    if (!modal) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/companies/${modal._id}`, { enabledModules: modules, chatbotEnabled });
      setModal(data);
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
    if (!modal) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/companies/${modal._id}`, editFields);
      setModal(data);
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
    if (modal && modal._id === id) setModal({ ...modal, isActive: !currentStatus });
    load();
  };

  const toggleUserActive = async (u) => {
    try {
      await api.put(`/users/${u._id}`, { isActive: u.isActive === false });
      const { data } = await api.get(`/companies/${modal._id}`);
      setUsers(data.users);
      addToast('User updated', 'success');
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
                <tr key={c._id} style={{ cursor: 'pointer' }} onClick={() => openModal(c)}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.email}</td>
                  <td><span className="badge badge-info">{c.subscription}</span></td>
                  <td>{(c.enabledModules || []).map(m => <span key={m} className="badge badge-success" style={{ marginRight: 4 }}>{m}</span>)}</td>
                  <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => openModal(c)}>View</button>
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

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 850, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{modal.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`badge ${modal.isActive ? 'badge-success' : 'badge-danger'}`}>{modal.isActive ? 'Active' : 'Inactive'}</span>
                <button className="btn btn-primary btn-sm" onClick={() => enterCompany(modal._id)}>Enter Company</button>
                <button className="btn btn-sm modal-close-x" onClick={() => setModal(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--border)', marginBottom: '1rem' }}>
                {[['details', 'Company Details'], ['modules', 'Modules & Features'], ['users', `Users (${users.length})`]].map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    style={{ padding: '0.5rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: activeTab === key ? 700 : 400, color: activeTab === key ? '#667eea' : '#64748b', borderBottom: activeTab === key ? '2px solid #667eea' : '2px solid transparent', marginBottom: '-2px', fontSize: '0.9rem' }}>
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'details' && (
                <form onSubmit={saveCompany}>
                  <div className="form-grid">
                    <div className="form-group"><label>Name</label><input value={editFields?.name || ''} onChange={e => setEditFields({ ...editFields, name: e.target.value })} /></div>
                    <div className="form-group"><label>Email</label><input value={modal.email || ''} disabled style={{ opacity: 0.6 }} /></div>
                    <div className="form-group"><label>Phone</label><input value={editFields?.phone || ''} onChange={e => setEditFields({ ...editFields, phone: e.target.value })} /></div>
                    <div className="form-group"><label>Address</label><input value={editFields?.address || ''} onChange={e => setEditFields({ ...editFields, address: e.target.value })} /></div>
                    <div className="form-group"><label>PAN</label><input value={editFields?.pan || ''} onChange={e => setEditFields({ ...editFields, pan: e.target.value })} /></div>
                    <div className="form-group"><label>Subscription</label>
                      <select value={modal.subscription || 'free'} onChange={async (e) => {
                        try {
                          const { data } = await api.put(`/companies/${modal._id}`, { subscription: e.target.value });
                          setModal(data);
                          load();
                          addToast('Subscription updated', 'success');
                        } catch (_) { addToast('Failed', 'error'); }
                      }}>
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Premium</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Details'}</button>
                    </div>
                  </div>
                </form>
              )}

              {activeTab === 'modules' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {MODULES.map(m => (
                      <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: modules.includes(m.key) ? '#f0fdf4' : '#f8fafc', border: `1px solid ${modules.includes(m.key) ? '#bbf7d0' : '#e2e8f0'}` }}>
                        <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggleModule(m.key)} style={{ accentColor: '#16a34a' }} />
                        <span>{m.label}</span>
                        {modules.includes(m.key) && <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>ON</span>}
                      </label>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: chatbotEnabled ? '#f0fdf4' : '#f8fafc', border: `1px solid ${chatbotEnabled ? '#bbf7d0' : '#e2e8f0'}` }}>
                    <input type="checkbox" checked={chatbotEnabled} onChange={e => setChatbotEnabled(e.target.checked)} style={{ accentColor: '#16a34a' }} />
                    Enable AI Chatbot Assistant
                  </label>
                  <button className="btn btn-primary" onClick={saveModules} disabled={saving}>{saving ? 'Saving...' : 'Save Modules'}</button>
                </div>
              )}

              {activeTab === 'users' && (
                <div>
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
                            <td>{u.isCompanySuperAdmin ? <span className="badge badge-danger">Company Owner</span> : <span className="badge badge-success">Member</span>}</td>
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
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmDelete} title="Confirm Delete" message={confirmDelete?.message} onConfirm={async () => {
        if (confirmDelete) {
          try {
            await api.delete(`/companies/${confirmDelete.id}`);
            if (modal?._id === confirmDelete.id) setModal(null);
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
            const { data } = await api.get(`/companies/${modal._id}`);
            setUsers(data.users);
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
