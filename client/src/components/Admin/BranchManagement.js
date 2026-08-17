import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useToast } from '../UI/Toast';
import ConfirmModal from '../UI/ConfirmModal';
import { adToBsStr } from '../UI/NepaliDatePicker';

const POSITIONS = ['Manager', 'Supervisor', 'Staff', 'Driver', 'Helper', 'Accountant'];

export default function BranchManagement() {
  const addToast = useToast();
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editBranch, setEditBranch] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailOrders, setDetailOrders] = useState([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffUser, setNewStaffUser] = useState('');
  const [newStaffPosition, setNewStaffPosition] = useState('Staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [confirmRemoveStaff, setConfirmRemoveStaff] = useState(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';

  useEffect(() => { load(); loadUsers(); }, []);

  const load = () => api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
  const loadUsers = () => api.get('/users').then(r => setUsers(r.data.filter(u => u.isActive !== false))).catch(() => {});

  const startCreate = () => {
    setEditBranch(null);
    setForm({ name: '', address: '', phone: '', email: '' });
    setShowForm(true);
  };

  const startEdit = (b) => {
    setEditBranch(b);
    setForm({ name: b.name, address: b.address || '', phone: b.phone || '', email: b.email || '' });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name) return addToast('Branch name is required', 'error');
    setSaving(true);
    try {
      if (editBranch) {
        await api.put(`/branches/${editBranch._id}`, { name: form.name, address: form.address, phone: form.phone, email: form.email });
        addToast('Branch updated', 'success');
      } else {
        await api.post('/branches', { name: form.name, address: form.address, phone: form.phone, email: form.email });
        addToast('Branch created', 'success');
      }
      setShowForm(false);
      setEditBranch(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save branch', 'error');
    } finally { setSaving(false); }
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

  const openDetail = async (b) => {
    try {
      const { data } = await api.get(`/branches/${b._id}`);
      setDetail(data.branch);
      setDetailOrders(data.orders || []);
      setShowAddStaff(false);
    } catch (_) { addToast('Failed to load branch', 'error'); }
  };

  const handleAddStaff = async () => {
    if (!newStaffUser) return addToast('Select a user', 'error');
    setAddingStaff(true);
    try {
      const { data } = await api.put(`/branches/${detail._id}/add-staff`, { userId: newStaffUser, position: newStaffPosition });
      setDetail(data);
      setShowAddStaff(false);
      setNewStaffUser('');
      setNewStaffPosition('Staff');
      load();
      loadUsers();
      addToast('Staff added', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to add staff', 'error');
    } finally { setAddingStaff(false); }
  };

  const handleRemoveStaff = async (userId) => {
    try {
      const { data } = await api.put(`/branches/${detail._id}/remove-staff`, { userId });
      setDetail(data);
      load();
      loadUsers();
      addToast('Staff removed', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove staff', 'error');
    }
    setConfirmRemoveStaff(null);
  };

  const unassignedUsers = users.filter(u => !u.branch || (detail && (detail.users || []).some(bu => (bu._id || bu) === u._id)));

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
          <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : (editBranch ? 'Update Branch' : 'Create Branch')}</button>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Address</th><th>Phone</th><th>Staff</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b._id} onClick={() => openDetail(b)} style={{ cursor: 'pointer' }}>
                  <td><strong>{b.name}</strong></td>
                  <td>{b.address || '-'}</td>
                  <td>{b.phone || '-'}</td>
                  <td><span className="badge badge-info">{(b.users || []).length}</span></td>
                  <td>{adToBsStr(new Date(b.createdAt))}</td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
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

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 750, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{detail.name}</h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {isAdmin && <button className="btn btn-sm btn-primary" onClick={() => { setShowAddStaff(!showAddStaff); setNewStaffUser(''); setNewStaffPosition('Staff'); }}>{showAddStaff ? 'Cancel' : '+ Add Staff'}</button>}
                <button className="btn btn-sm modal-close-x" onClick={() => setDetail(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Address</span><br /><strong>{detail.address || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Phone</span><br /><strong>{detail.phone || '-'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '0.8rem' }}>Email</span><br /><strong>{detail.email || '-'}</strong></div>
              </div>

              {isAdmin && showAddStaff && (
                <div style={{ padding: '0.75rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Add Staff to {detail.name}</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                      <label>Select User</label>
                      <select value={newStaffUser} onChange={e => setNewStaffUser(e.target.value)}>
                        <option value="">Choose user...</option>
                        {unassignedUsers.map(u => (
                          <option key={u._id} value={u._id}>{u.name} ({u.email}){u.branch ? ' — in another branch' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
                      <label>Position</label>
                      <select value={newStaffPosition} onChange={e => setNewStaffPosition(e.target.value)}>
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={handleAddStaff} disabled={addingStaff}>{addingStaff ? 'Adding...' : 'Add'}</button>
                  </div>
                </div>
              )}

              <h4 style={{ marginBottom: '0.5rem' }}>Assigned Staff ({(detail.users || []).length})</h4>
              {(detail.users || []).length > 0 ? (
                <div className="table-responsive" style={{ marginBottom: '1rem' }}>
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Groups</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead>
                    <tbody>
                      {detail.users.map(u => (
                        <tr key={u._id}>
                          <td><strong>{u.name}</strong></td>
                          <td>{u.email}</td>
                          <td>{u.branchPosition || <span style={{ color: '#94a3b8' }}>-</span>}</td>
                          <td>{(u.groups || []).map(g => <span key={g} className="badge badge-success" style={{ marginRight: 2 }}>{g}</span>)}</td>
                          <td><span className={`badge ${u.isActive === false ? 'badge-danger' : 'badge-success'}`}>{u.isActive === false ? 'Inactive' : 'Active'}</span></td>
                          {isAdmin && <td className="action-cell"><button className="btn btn-sm btn-danger" onClick={() => setConfirmRemoveStaff({ userId: u._id, name: u.name })}>Remove</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>No staff assigned to this branch</p>
              )}

              <h4 style={{ marginBottom: '0.5rem' }}>Recent Orders ({detailOrders.length})</h4>
              {detailOrders.length > 0 ? (
                <div className="table-responsive">
                  <table className="table">
                    <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Driver</th><th>Updated</th></tr></thead>
                    <tbody>
                      {detailOrders.map(o => (
                        <tr key={o._id}>
                          <td><strong>{o.orderNumber}</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{o.trackingNumber || '-'}</span></td>
                          <td>{o.customer?.name || o.customerName || '-'}</td>
                          <td><span className={`badge badge-info`}>{o.status}</span></td>
                          <td>{o.driver?.name || <span style={{ color: '#f59e0b' }}>Unassigned</span>}</td>
                          <td>{new Date(o.updatedAt).toLocaleDateString('en-GB')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#94a3b8' }}>No orders for this branch</p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmDelete} title="Delete Branch" message="Are you sure? Users will be unassigned from this branch." onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
      <ConfirmModal open={!!confirmRemoveStaff} title="Remove Staff" message={`Remove ${confirmRemoveStaff?.name} from this branch?`} onConfirm={() => handleRemoveStaff(confirmRemoveStaff?.userId)} onCancel={() => setConfirmRemoveStaff(null)} />
    </div>
  );
}
