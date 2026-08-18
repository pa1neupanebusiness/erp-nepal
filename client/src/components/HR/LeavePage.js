import React, { useState, useEffect } from 'react';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import api from '../../api';

export default function LeavePage() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ employee: '', leaveType: 'annual', startDate: adToBsStr(new Date()), endDate: adToBsStr(new Date()), totalDays: 0, halfDayStart: false, halfDayEnd: false, reason: '' });
  const [employees, setEmployees] = useState([]);

  useEffect(() => { fetchLeaves(); fetchEmployees(); }, []);

  const fetchLeaves = async () => {
    try {
      const res = await api.get('/hr/leave');
      setLeaves(res.data.sort((a, b) => new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0)));
    } catch (err) {
      console.error('Failed to fetch leaves', err);
    }
    setLoading(false);
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/hr/employees');
      setEmployees(res.data);
    } catch (err) {
      console.error('Failed to fetch employees', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const start = new Date(bsToADStr(form.startDate));
      const end = new Date(bsToADStr(form.endDate));
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      await api.post('/hr/leave', { ...form, startDate: bsToADStr(form.startDate), endDate: bsToADStr(form.endDate), totalDays: days });
      setShowForm(false);
      setForm({ employee: '', leaveType: 'annual', startDate: adToBsStr(new Date()), endDate: adToBsStr(new Date()), totalDays: 0, halfDayStart: false, halfDayEnd: false, reason: '' });
      fetchLeaves();
    } catch (err) {
      console.error('Failed to create leave', err);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleApprove = async (id, status) => {
    try {
      await api.put(`/hr/leave/${id}`, { status });
      fetchLeaves();
    } catch (err) {
      console.error('Failed to update leave', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Leave Management</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Apply Leave'}
        </button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Apply Leave</h3>
              <button className="modal-close-x" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group"><label>Employee *</label>
                  <SearchableSelect
                    options={employees.map(e => ({ value: e._id, label: `${e.firstName} ${e.lastName}` }))}
                    value={form.employee}
                    onChange={v => setForm({ ...form, employee: v })}
                    required
                    placeholder="Search employee..."
                  />
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Leave Type *</label>
                    <select name="leaveType" value={form.leaveType} onChange={handleChange}>
                      <option value="annual">Annual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="personal">Personal Leave</option>
                      <option value="maternity">Maternity Leave</option>
                      <option value="paternity">Paternity Leave</option>
                      <option value="unpaid">Unpaid Leave</option>
                      <option value="casual">Casual Leave</option>
                      <option value="compensatory">Compensatory Off</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Start Date *</label><NepaliDatePicker name="startDate" value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} required /></div>
                  <div className="form-group"><label>End Date *</label><NepaliDatePicker name="endDate" value={form.endDate} onChange={v => setForm({ ...form, endDate: v })} required /></div>
                </div>
                <div className="form-group"><label>Reason</label><textarea name="reason" value={form.reason} onChange={handleChange} rows={3} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Apply Leave</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Start</th>
              <th>End</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l._id} onClick={() => setDetail(l)} style={{ cursor: 'pointer' }}>
                <td>{l.employee?.firstName} {l.employee?.lastName}</td>
                <td>{l.leaveType}</td>
                <td>{adToBsStr(l.startDate)}</td>
                <td>{adToBsStr(l.endDate)}</td>
                <td>{l.totalDays}</td>
                <td>{l.reason || '-'}</td>
                <td><span className={`badge ${l.status === 'approved' ? 'badge-success' : l.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{l.status}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  {l.status === 'pending' && (
                    <>
                      <button className="btn btn-sm btn-success" onClick={() => handleApprove(l._id, 'approved')}>Approve</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleApprove(l._id, 'rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <EntryDetailsModal
          title={`Leave - ${detail.employee?.firstName || ''} ${detail.employee?.lastName || ''}`}
          subtitle="Click row to view leave details"
          meta={[
            { label: 'Leave Type', value: detail.leaveType || '-' },
            { label: 'Start Date', value: adToBsStr(detail.startDate) },
            { label: 'End Date', value: adToBsStr(detail.endDate) },
            { label: 'Total Days', value: detail.totalDays },
            { label: 'Status', value: detail.status || '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[
            { label: 'Reason', value: detail.reason || '-' },
            { label: 'Half Day Start', value: detail.halfDayStart ? 'Yes' : 'No' },
            { label: 'Half Day End', value: detail.halfDayEnd ? 'Yes' : 'No' },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
