import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

export default function EmployeeList() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '', nationality: '', address: '', city: '', nationalId: '', taxId: '', bankName: '', bankAccountNumber: '', bankBranch: '', hireDate: '', department: '', designation: '', employmentType: 'full-time', workLocation: '', shift: '', workingHoursPerWeek: 40, status: 'active' });

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/hr/employees');
      setEmployees(res.data.sort((a, b) => new Date(b.hireDate || b.createdAt || 0) - new Date(a.hireDate || a.createdAt || 0)));
    } catch (err) {
      console.error('Failed to fetch employees', err);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/hr/employees', { ...form, dateOfBirth: form.dateOfBirth ? bsToADStr(form.dateOfBirth) : '', hireDate: form.hireDate ? bsToADStr(form.hireDate) : '' });
      setShowForm(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '', nationality: '', address: '', city: '', nationalId: '', taxId: '', bankName: '', bankAccountNumber: '', bankBranch: '', hireDate: '', department: '', designation: '', employmentType: 'full-time', workLocation: '', shift: '', workingHoursPerWeek: 40, status: 'active' });
      fetchEmployees();
    } catch (err) {
      console.error('Failed to add employee', err);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Employees</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Employee'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '12px' }}>Add New Employee</h3>
          <div className="form-row">
            <div className="form-group"><label>First Name *</label><input name="firstName" value={form.firstName} onChange={handleChange} required /></div>
            <div className="form-group"><label>Last Name *</label><input name="lastName" value={form.lastName} onChange={handleChange} required /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Email *</label><input type="email" name="email" value={form.email} onChange={handleChange} required /></div>
            <div className="form-group"><label>Phone</label><input name="phone" value={form.phone} onChange={handleChange} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Date of Birth</label><NepaliDatePicker name="dateOfBirth" value={form.dateOfBirth} onChange={v => setForm({ ...form, dateOfBirth: v })} /></div>
            <div className="form-group"><label>Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Address</label><input name="address" value={form.address} onChange={handleChange} /></div>
          <div className="form-row">
            <div className="form-group"><label>City</label><input name="city" value={form.city} onChange={handleChange} /></div>
            <div className="form-group"><label>National ID</label><input name="nationalId" value={form.nationalId} onChange={handleChange} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Department</label><input name="department" value={form.department} onChange={handleChange} /></div>
            <div className="form-group"><label>Position</label><input name="designation" value={form.designation} onChange={handleChange} /></div>
          </div>
            <div className="form-group"><label>Employment Type</label>
              <select name="employmentType" value={form.employmentType} onChange={handleChange}>
                <option value="full-time">Full Time</option>
                <option value="part-time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
                <option value="intern">Intern</option>
              </select>
            </div>
          <div className="form-row">
            <div className="form-group"><label>Hire Date *</label><NepaliDatePicker name="hireDate" value={form.hireDate} onChange={v => setForm({ ...form, hireDate: v })} required /></div>
            <div className="form-group"><label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
                <option value="resigned">Resigned</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Bank Name</label><input name="bankName" value={form.bankName} onChange={handleChange} /></div>
            <div className="form-group"><label>Bank Account</label><input name="bankAccountNumber" value={form.bankAccountNumber} onChange={handleChange} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Add Employee</button>
        </form>
      )}

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Type</th>
              <th>Hire Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp._id} onClick={() => setDetail(emp)} style={{ cursor: 'pointer' }}>
                <td>{emp.employeeId}</td>
                <td>{emp.firstName} {emp.lastName}</td>
                <td>{emp.email}</td>
                <td>{emp.department || '-'}</td>
                <td>{emp.designation || '-'}</td>
                <td>{emp.employmentType}</td>
                <td>{emp.hireDate ? adToBsStr(emp.hireDate) : '-'}</td>
                <td><span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{emp.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <EntryDetailsModal
          title={`${detail.firstName} ${detail.lastName}`}
          subtitle="Click row to view employee details"
          meta={[
            { label: 'Employee ID', value: detail.employeeId || '-' },
            { label: 'Email', value: detail.email || '-' },
            { label: 'Phone', value: detail.phone || '-' },
            { label: 'Department', value: detail.department || '-' },
            { label: 'Designation', value: detail.designation || '-' },
            { label: 'Employment Type', value: detail.employmentType || '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[
            { label: 'Address', value: detail.address || '-' },
            { label: 'City', value: detail.city || '-' },
            { label: 'National ID', value: detail.nationalId || '-' },
            { label: 'Tax ID', value: detail.taxId || '-' },
            { label: 'Bank', value: detail.bankName ? `${detail.bankName} ${detail.bankAccountNumber ? '(' + detail.bankAccountNumber + ')' : ''}` : '-' },
            { label: 'Hire Date', value: detail.hireDate ? adToBsStr(detail.hireDate) : '-' },
            { label: 'Status', value: detail.status || '-' },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
