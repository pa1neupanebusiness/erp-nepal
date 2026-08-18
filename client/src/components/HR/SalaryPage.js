import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

export default function SalaryPage() {
  const [salaries, setSalaries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selectMode, setSelectMode] = useState('all');
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [payrollType, setPayrollType] = useState('monthly');
  const [form, setForm] = useState({
    payPeriod: 'monthly',
    payDate: adToBsStr(new Date()),
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    mealAllowance: 0,
    communicationAllowance: 0,
    otherAllowances: '',
    overtimeHours: 0,
    overtimeRate: 0,
    deductions: '',
    bonus: 0,
    status: 'draft',
  });

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchSalaries(), fetchEmployees()]);
      setLoading(false);
    };
    load();
  }, []);

  const fetchSalaries = async () => {
    try {
      const res = await api.get('/hr/salary');
      setSalaries(res.data.sort((a, b) => new Date(b.payDate || b.createdAt || 0) - new Date(a.payDate || a.createdAt || 0)));
    } catch (err) {
      console.error('Failed to fetch salaries', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/hr/employees');
      setEmployees(res.data);
    } catch (err) {
      console.error('Failed to fetch employees', err);
    }
  };

  const handleEmployeeSelect = (id) => {
    if (selectedEmployees.includes(id)) {
      setSelectedEmployees(selectedEmployees.filter(eid => eid !== id));
    } else {
      setSelectedEmployees([...selectedEmployees, id]);
    }
  };

  const handleSelectAll = () => {
    if (selectMode === 'all') {
      setSelectedEmployees([]);
      setSelectMode('none');
    } else {
      setSelectedEmployees(employees.map(e => e._id));
      setSelectMode('all');
    }
  };

  const handleSelectIndividual = () => {
    setSelectMode('individual');
    setSelectedEmployees([]);
  };

  const getSelectedEmployees = () => {
    if (selectMode === 'all') return employees;
    return employees.filter(e => selectedEmployees.includes(e._id));
  };

  const calculatePayroll = (emp) => {
    const basic = Number(form.basicSalary) || 0;
    const housing = Number(form.housingAllowance) || 0;
    const transport = Number(form.transportAllowance) || 0;
    const meal = Number(form.mealAllowance) || 0;
    const communication = Number(form.communicationAllowance) || 0;
    const otherAllowances = form.otherAllowances
      ? form.otherAllowances.split(',').reduce((sum, a) => {
          const amount = Number(a.split(':')[1]) || 0;
          return sum + amount;
        }, 0)
      : 0;
    const overtimeHours = Number(form.overtimeHours) || 0;
    const overtimeRate = Number(form.overtimeRate) || 0;
    const overtimePay = overtimeHours * overtimeRate;
    const bonus = Number(form.bonus) || 0;

    const deductions = form.deductions
      ? form.deductions.split(';').reduce((sum, d) => {
          const amount = Number(d.split(',')[1]) || 0;
          return sum + amount;
        }, 0)
      : 0;

    const gross = basic + housing + transport + meal + communication + otherAllowances + overtimePay + bonus;
    const totalDeductions = deductions;
    const netSalary = gross - totalDeductions;

    return { gross, totalDeductions, netSalary, overtimePay };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const targetEmployees = getSelectedEmployees();
      for (const emp of targetEmployees) {
        const payroll = calculatePayroll(emp);
        await api.post('/hr/salary', {
          employee: emp._id,
          payPeriod: form.payPeriod,
          payDate: bsToADStr(form.payDate),
          basicSalary: Number(form.basicSalary) || 0,
          housingAllowance: Number(form.housingAllowance) || 0,
          transportAllowance: Number(form.transportAllowance) || 0,
          mealAllowance: Number(form.mealAllowance) || 0,
          communicationAllowance: Number(form.communicationAllowance) || 0,
          otherAllowances: form.otherAllowances
            ? form.otherAllowances.split(',').map(a => {
                const [name, amount] = a.split(':');
                return { name: name.trim(), amount: Number(amount.trim()) || 0 };
              })
            : [],
          overtimeHours: Number(form.overtimeHours) || 0,
          overtimeRate: Number(form.overtimeRate) || 0,
          overtimePay: payroll.overtimePay,
          deductions: form.deductions
            ? form.deductions.split(';').map(d => {
                const parts = d.split(',');
                return { name: parts[0]?.trim() || '', amount: Number(parts[1]) || 0, reason: parts[2]?.trim() || '' };
              })
            : [],
          bonus: Number(form.bonus) || 0,
          grossSalary: payroll.gross,
          totalDeductions: payroll.totalDeductions,
          netSalary: payroll.netSalary,
          status: form.status,
        });
      }
      setShowForm(false);
      setForm({
        payPeriod: 'monthly', payDate: adToBsStr(new Date()), basicSalary: 0, housingAllowance: 0,
        transportAllowance: 0, mealAllowance: 0, communicationAllowance: 0,
        otherAllowances: '', overtimeHours: 0, overtimeRate: 0, deductions: '', bonus: 0, status: 'draft',
      });
      setSelectedEmployees([]);
      setSelectMode('all');
      fetchSalaries();
    } catch (err) {
      console.error('Failed to process payroll', err);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Payroll</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Process Payroll'}
        </button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Process Payroll</h3>
              <button className="modal-close-x" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Payroll Type</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className={`btn ${payrollType === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPayrollType('monthly'); setForm({ ...form, payPeriod: 'monthly' }); }}>Monthly</button>
              <button type="button" className={`btn ${payrollType === 'biweekly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPayrollType('biweekly'); setForm({ ...form, payPeriod: 'bi-weekly' }); }}>Bi-Weekly</button>
              <button type="button" className={`btn ${payrollType === 'weekly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPayrollType('weekly'); setForm({ ...form, payPeriod: 'weekly' }); }}>Weekly</button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Pay Date *</label>
              <NepaliDatePicker name="payDate" value={form.payDate} onChange={v => setForm({ ...form, payDate: v })} required />
            </div>
            <div className="form-group">
              <label>Pay Period</label>
              <select name="payPeriod" value={form.payPeriod} onChange={handleChange}>
                <option value="monthly">Monthly</option>
                <option value="bi-weekly">Bi-Weekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label>Employee Selection</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" className={`btn ${selectMode === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={handleSelectAll}>
                {selectMode === 'all' ? '✓ All' : 'Select All'}
              </button>
              <button type="button" className={`btn ${selectMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`} onClick={handleSelectIndividual}>
                {selectMode === 'individual' ? '✓ Individual' : 'Individual'}
              </button>
            </div>
            {selectMode === 'individual' && (
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', background: 'var(--card-hover)' }}>
                {employees.map(emp => (
                  <label key={emp._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(emp._id)}
                      onChange={() => handleEmployeeSelect(emp._id)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    {emp.firstName} {emp.lastName} ({emp.employeeId}) - {emp.department || 'No Dept'} / {emp.designation || 'No Position'}
                  </label>
                ))}
              </div>
            )}
            {selectMode === 'all' && (
              <div style={{ fontSize: '13px', color: '#94a3b8', padding: '8px' }}>
                Processing payroll for all {employees.length} employees
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group"><label>Basic Salary</label><input type="number" name="basicSalary" value={form.basicSalary} onChange={handleChange} min={0} /></div>
            <div className="form-group"><label>Housing Allowance</label><input type="number" name="housingAllowance" value={form.housingAllowance} onChange={handleChange} min={0} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Transport Allowance</label><input type="number" name="transportAllowance" value={form.transportAllowance} onChange={handleChange} min={0} /></div>
            <div className="form-group"><label>Meal Allowance</label><input type="number" name="mealAllowance" value={form.mealAllowance} onChange={handleChange} min={0} /></div>
          </div>
          <div className="form-group"><label>Communication Allowance</label><input type="number" name="communicationAllowance" value={form.communicationAllowance} onChange={handleChange} min={0} /></div>
          <div className="form-group"><label>Other Allowances (name:amount, comma separated)</label>
            <input name="otherAllowances" value={form.otherAllowances} onChange={handleChange} placeholder="e.g. Bonus:5000, Commission:2000" />
          </div>
          <div className="form-row">
            <div className="form-group"><label>Overtime Hours</label><input type="number" name="overtimeHours" value={form.overtimeHours} onChange={handleChange} min={0} /></div>
            <div className="form-group"><label>OT Rate</label><input type="number" name="overtimeRate" value={form.overtimeRate} onChange={handleChange} min={0} /></div>
          </div>
          <div className="form-group"><label>Deductions (name:amount:reason, semicolon separated)</label>
            <input name="deductions" value={form.deductions} onChange={handleChange} placeholder="e.g. Loan:5000:Monthly; Advance:2000:Advance" />
          </div>
          <div className="form-row">
            <div className="form-group"><label>Bonus</label><input type="number" name="bonus" value={form.bonus} onChange={handleChange} min={0} /></div>
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>

          {employees.length > 0 && (
            <div style={{ background: 'var(--card-hover)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>Payroll Summary:</strong>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Employees: {getSelectedEmployees().length} | Period: {form.payPeriod} | Pay Date: {form.payDate || 'Not set'}
              </div>
            </div>
          )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Process Payroll</button>
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
              <th>Period</th>
              <th>Pay Date</th>
              <th>Basic</th>
              <th>Allowances</th>
              <th>OT</th>
              <th>Gross</th>
              <th>Deductions</th>
              <th>Net</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {salaries.map(s => (
              <tr key={s._id} onClick={() => setDetail(s)} style={{ cursor: 'pointer' }}>
                <td>{s.employee?.firstName} {s.employee?.lastName}</td>
                <td>{s.payPeriod}</td>
                <td>{s.payDate ? adToBsStr(s.payDate) : '-'}</td>
                <td>{s.basicSalary?.toLocaleString() || 0}</td>
                <td>{(s.housingAllowance + s.transportAllowance + s.mealAllowance + s.communicationAllowance).toLocaleString()}</td>
                <td>{s.overtimePay?.toLocaleString() || 0}</td>
                <td><strong>{s.grossSalary?.toLocaleString() || 0}</strong></td>
                <td>{s.totalDeductions?.toLocaleString() || 0}</td>
                <td><strong>{s.netSalary?.toLocaleString() || 0}</strong></td>
                <td><span className={`badge ${s.status === 'paid' ? 'badge-success' : s.status === 'approved' ? 'badge-info' : s.status === 'draft' ? 'badge-secondary' : 'badge-warning'}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <EntryDetailsModal
          title={`Payroll - ${detail.employee?.firstName || ''} ${detail.employee?.lastName || ''}`}
          subtitle="Click row to view payroll breakdown"
          meta={[
            { label: 'Period', value: detail.payPeriod || '-' },
            { label: 'Pay Date', value: detail.payDate ? adToBsStr(detail.payDate) : '-' },
            { label: 'Status', value: detail.status || '-' },
            { label: 'Employee ID', value: detail.employee?.employeeId || '-' },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Amount', key: 'value', align: 'right', render: v => Number(v || 0).toLocaleString() },
          ]}
          rows={[
            { label: 'Basic Salary', value: detail.basicSalary },
            { label: 'Housing Allowance', value: detail.housingAllowance },
            { label: 'Transport Allowance', value: detail.transportAllowance },
            { label: 'Meal Allowance', value: detail.mealAllowance },
            { label: 'Communication Allowance', value: detail.communicationAllowance },
            { label: 'Overtime Pay', value: detail.overtimePay },
            { label: 'Bonus', value: detail.bonus },
            { label: 'Gross Salary', value: detail.grossSalary },
            { label: 'Total Deductions', value: detail.totalDeductions },
            { label: 'Net Salary', value: detail.netSalary },
          ]}
          footer={[{ label: 'Net Salary', value: detail.netSalary, render: v => Number(v || 0).toLocaleString() }]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}