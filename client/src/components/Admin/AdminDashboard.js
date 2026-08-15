import React, { useState, useEffect } from 'react';
import { showConfirm } from '../UI/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../UI/Toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const SUB_COLORS = { free: '#64748b', basic: '#2563eb', premium: '#d97706' };
const SUB_LABELS = { free: 'Free', basic: 'Basic', premium: 'Premium' };

export default function AdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState({ name: '', email: '', phone: '', pan: '', city: '', country: 'nepal', adminName: '', password: '' });
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'user', groups: [] });
  const [backups, setBackups] = useState({});
  const [backingUp, setBackingUp] = useState(null);
  const [backupAllLoading, setBackupAllLoading] = useState(false);
  const addToast = useToast();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { loadCompanies(); }, []);

  const loadCompanies = async () => {
    try {
      const { data } = await api.get('/companies');
      setCompanies(data || []);
    } catch { addToast('Failed to load companies', 'error'); }
    setLoading(false);
  };

  const loadCompanyDetail = async (id) => {
    try {
      const { data } = await api.get(`/companies/${id}`);
      setCompanyDetail(data);
      setSelectedCompany(id);
    } catch { addToast('Failed to load company details', 'error'); }
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCompany) {
        const payload = { ...companyForm };
        delete payload.password;
        delete payload.adminName;
        await api.put(`/companies/${editingCompany._id}`, payload);
        addToast('Company updated', 'success');
      } else {
        await api.post('/companies', companyForm);
        addToast('Company created', 'success');
      }
      setShowCompanyForm(false);
      setEditingCompany(null);
      setCompanyForm({ name: '', email: '', phone: '', pan: '', city: '', country: 'nepal', adminName: '', password: '' });
      loadCompanies();
    } catch (err) { addToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const payload = { ...userForm };
        if (!payload.password) delete payload.password;
        await api.put(`/companies/${selectedCompany}/users/${editingUser._id}`, payload);
        addToast('User updated', 'success');
      } else {
        await api.post(`/companies/${selectedCompany}/users`, userForm);
        addToast('User created', 'success');
      }
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ name: '', email: '', password: '', role: 'user', groups: [] });
      loadCompanyDetail(selectedCompany);
    } catch (err) { addToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDeleteUser = async (userId) => {
    if (!(await showConfirm('Delete this user?', { danger: true }))) return;
    try {
      await api.delete(`/companies/${selectedCompany}/users/${userId}`);
      addToast('User deleted', 'success');
      loadCompanyDetail(selectedCompany);
    } catch (err) { addToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const enterCompany = (company) => {
    localStorage.setItem('selectedCompany', JSON.stringify(company._id));
    window.location.href = '/';
  };

  const handleBackupCompany = async (companyId, companyName) => {
    setBackingUp(companyId);
    try {
      const { data } = await api.post(`/backup/company/${companyId}`);
      addToast(`Backup created: ${data.backupName}`, 'success');
      loadBackups(companyId);
    } catch (err) {
      addToast(err.response?.data?.message || 'Backup failed', 'error');
    }
    setBackingUp(null);
  };

  const handleBackupAll = async () => {
    if (!(await showConfirm('Backup all companies?'))) return;
    setBackupAllLoading(true);
    try {
      const { data } = await api.post('/backup/all');
      const succeeded = data.results.filter(r => r.success).length;
      const failed = data.results.filter(r => !r.success).length;
      addToast(`Backup complete: ${succeeded} succeeded, ${failed} failed`, succeeded > 0 ? 'success' : 'error');
    } catch (err) {
      addToast(err.response?.data?.message || 'Backup all failed', 'error');
    }
    setBackupAllLoading(false);
  };

  const loadBackups = async (companyId) => {
    try {
      const { data } = await api.get(`/backup/company/${companyId}`);
      setBackups(prev => ({ ...prev, [companyId]: data }));
    } catch (err) {
      console.error('Failed to load backups');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) return <div className="page-container"><p>Loading...</p></div>;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>🏢 Super Admin Dashboard</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>Manage all companies and users</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCompanyForm(true); setEditingCompany(null); setCompanyForm({ name: '', email: '', phone: '', pan: '', city: '', country: 'nepal', adminName: '', password: '' }); }}>+ New Company</button>
        <button className="btn btn-secondary" onClick={handleBackupAll} disabled={backupAllLoading} style={{ marginLeft: '0.5rem' }}>{backupAllLoading ? 'Backing up...' : 'Backup All'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #3b82f6' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Companies</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{companies.length}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #16a34a' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Active</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{companies.filter(c => c.isActive).length}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #d97706' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Paid</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{companies.filter(c => c.subscription !== 'free').length}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem 1rem', borderTop: '3px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Users</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6' }}>{companies.reduce((s, c) => s + (c.userCount || 0), 0)}</div>
        </div>
      </div>

      {showCompanyForm && (
        <div className="card form-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #3b82f6' }}>
          <h3>{editingCompany ? `Edit: ${editingCompany.name}` : 'New Company'}</h3>
          <form onSubmit={handleCompanySubmit}>
            <div className="form-grid">
              <div className="form-group"><label>Company Name *</label><input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group"><label>Email *</label><input type="email" value={companyForm.email} onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))} required disabled={!!editingCompany} /></div>
              <div className="form-group"><label>Phone</label><input value={companyForm.phone} onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label>PAN</label><input value={companyForm.pan} onChange={e => setCompanyForm(f => ({ ...f, pan: e.target.value }))} /></div>
              <div className="form-group"><label>City</label><input value={companyForm.city} onChange={e => setCompanyForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div className="form-group"><label>Country</label><input value={companyForm.country} onChange={e => setCompanyForm(f => ({ ...f, country: e.target.value }))} /></div>
              {!editingCompany && <>
                <div className="form-group"><label>Admin Name *</label><input value={companyForm.adminName} onChange={e => setCompanyForm(f => ({ ...f, adminName: e.target.value }))} required /></div>
                <div className="form-group"><label>Admin Password *</label><input type="password" value={companyForm.password} onChange={e => setCompanyForm(f => ({ ...f, password: e.target.value }))} required minLength={6} /></div>
              </>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">{editingCompany ? 'Update' : 'Create Company'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowCompanyForm(false); setEditingCompany(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {showUserForm && (
        <div className="card form-card" style={{ marginBottom: '1rem', borderLeft: '4px solid #8b5cf6' }}>
          <h3>{editingUser ? `Edit User: ${editingUser.name}` : 'Add User'}</h3>
          <form onSubmit={handleUserSubmit}>
            <div className="form-grid">
              <div className="form-group"><label>Name *</label><input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group"><label>Email *</label><input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} required disabled={!!editingUser} /></div>
              <div className="form-group"><label>{editingUser ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} required={!editingUser} minLength={6} /></div>
              <div className="form-group"><label>Role</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">{editingUser ? 'Update' : 'Add User'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowUserForm(false); setEditingUser(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: selectedCompany ? '0 0 400px' : '1', overflow: 'auto', maxHeight: '70vh' }}>
          <div className="card-header"><strong>Companies</strong></div>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Name</th><th>Users</th><th>Plan</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c._id} style={{ cursor: 'pointer', background: selectedCompany === c._id ? '#f0f9ff' : '' }} onClick={() => loadCompanyDetail(c._id)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{c.shortName || c._id.toString().slice(-8)} | {c.email}</div>
                    </td>
                    <td><span className="badge badge-info">{c.userCount || 0}</span></td>
                    <td><span className="badge" style={{ background: SUB_COLORS[c.subscription] + '20', color: SUB_COLORS[c.subscription], border: `1px solid ${SUB_COLORS[c.subscription]}40` }}>{SUB_LABELS[c.subscription] || c.subscription}</span></td>
                    <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.2rem' }}>
                        <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setEditingCompany(c); setCompanyForm({ name: c.name, email: c.email, phone: c.phone || '', pan: c.pan || '', city: c.city || '', country: c.country || 'nepal', adminName: '', password: '' }); setShowCompanyForm(true); }}>Edit</button>
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); enterCompany(c); }}>Enter →</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && <tr><td colSpan="5" className="text-center">No companies yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {selectedCompany && companyDetail && (
          <div className="card" style={{ flex: 1, overflow: 'auto', maxHeight: '70vh' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{companyDetail.company.name}</strong>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {companyDetail.company.email} | {companyDetail.company.country} | {SUB_LABELS[companyDetail.company.subscription]}
                  {companyDetail.company.companyUrl && <span> | <a href={companyDetail.company.companyUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>{companyDetail.company.companyUrl}</a></span>}
                </div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => { setShowUserForm(true); setEditingUser(null); setUserForm({ name: '', email: '', password: '', role: 'user', groups: [] }); }}>+ Add User</button>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Groups</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {companyDetail.users.map(u => (
                    <tr key={u._id}>
                      <td style={{ fontWeight: 600 }}>{u.name}{u.isCompanySuperAdmin && <span className="badge badge-warning" style={{ marginLeft: 4, fontSize: '0.6rem' }}>ADMIN</span>}</td>
                      <td>{u.email}</td>
                      <td><span className="badge badge-info">{u.role}</span></td>
                      <td>{(u.groups || []).map(g => <span key={g} className="badge badge-secondary" style={{ marginRight: 2 }}>{g}</span>)}</td>
                      <td><span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        {!u.isCompanySuperAdmin && (
                          <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setEditingUser(u); setUserForm({ name: u.name, email: u.email, password: '', role: u.role, groups: u.groups || [] }); setShowUserForm(true); }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleDeleteUser(u._id)}>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {companyDetail.users.length === 0 && <tr><td colSpan="6" className="text-center">No users</td></tr>}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong>Backups</strong>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => handleBackupCompany(selectedCompany, companyDetail.company.name)} disabled={backingUp === selectedCompany}>
                    {backingUp === selectedCompany ? 'Backing up...' : 'Backup Now'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => loadBackups(selectedCompany)}>Refresh</button>
                </div>
              </div>
              {(backups[selectedCompany] || []).length > 0 ? (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead><tr><th>Backup Name</th><th>Size</th></tr></thead>
                    <tbody>
                      {backups[selectedCompany].map((b, i) => (
                        <tr key={i}>
                          <td>{b.name}</td>
                          <td>{formatSize(b.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>No backups yet. Click "Refresh" to load.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
