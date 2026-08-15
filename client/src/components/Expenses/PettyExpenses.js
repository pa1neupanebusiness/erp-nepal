import React, { useState, useEffect } from 'react';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { useToast } from '../UI/Toast';
import { printPettyExpense } from '../UI/printPettyExpense';
import { printHtmlDocument } from '../UI/printCommon';
import api from '../../api';

export default function PettyExpenses() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [form, setForm] = useState({ date: adToBsStr(new Date()), account: '', category: '', description: '', amount: '', paymentMethod: 'cash', receiptNumber: '' });
  const [showForm, setShowForm] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [company, setCompany] = useState({});
  const addToast = useToast();

  useEffect(() => {
    load();
    api.get('/expenses/categories').then(r => setCategories(r.data)).catch(() => {});
    api.get('/accounts').then(r => {
      const accs = (r.data || []).filter(a => a.type === 'expense' && a.isActive !== false);
      setExpenseAccounts(accs);
      const misc = accs.find(a => /miscellaneous/i.test(a.name));
      if (misc) setForm(f => (f.account ? f : { ...f, account: misc._id }));
    }).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
  }, []);

  const load = () => api.get('/expenses').then(r => setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.account) return addToast('Please select an expense account', 'error');
    if (parseFloat(form.amount) > 25000) return addToast('Petty cash per transaction cannot exceed Rs. 25,000', 'error');
    try {
      await api.post('/expenses', {
        ...form,
        date: bsToADStr(form.date),
        amount: parseFloat(form.amount),
        bank: form.paymentMethod === 'bank' && form.bank ? form.bank : undefined,
      });
      addToast('Expense recorded successfully', 'success');
      const misc = expenseAccounts.find(a => /miscellaneous/i.test(a.name));
      setForm({ date: adToBsStr(new Date()), account: misc ? misc._id : '', category: '', description: '', amount: '', paymentMethod: 'cash', bank: '', receiptNumber: '' });
      setShowForm(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to record expense', 'error');
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const total = items.filter(i => i.status === 'active').reduce((s, i) => s + i.amount, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Petty Expenses (Sano Kharcha)</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className="fiscal-badge">Total: {formatNPR(total)}</span>
          <button className="btn btn-secondary" onClick={() => {
            const el = document.querySelector('table.table');
            if (el) printHtmlDocument(el.outerHTML, 'Petty Expenses');
          }}>Print</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Add Expense'}</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 500 }}>
          <h3>New Petty Expense</h3>
          <div className="form-grid">
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
            <div className="form-group"><label>Expense Account</label>
              <SearchableSelect
                options={expenseAccounts.map(a => ({ value: a._id, label: `${a.code} - ${a.name}` }))}
                value={form.account}
                onChange={v => setForm({ ...form, account: v })}
                required
                placeholder="Select expense account..."
              />
            </div>
            <div className="form-group"><label>Category</label>
              <SearchableSelect
                options={categories.map(c => ({ value: c, label: c }))}
                value={form.category}
                onChange={v => setForm({ ...form, category: v })}
                placeholder="Select category..."
              />
            </div>
            <div className="form-group"><label>Amount (Rs.)</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
            <div className="form-group"><label>Receipt #</label><input value={form.receiptNumber} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Save Expense</button>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Receipt</th><th>Status</th></tr></thead>
          <tbody>
            {items.map(e => (
              <tr key={e._id} onClick={() => setDetailsId(e._id)} style={{ cursor: 'pointer' }}>
                <td>{adToBsStr(e.date)}</td>
                <td><span className="badge badge-info">{e.category}</span></td>
                <td>{e.description}</td>
                <td className="text-danger"><strong>{formatNPR(e.amount)}</strong></td>
                <td>{e.paymentMethod}</td>
                <td>{e.receiptNumber || '-'}</td>
                <td><span className={`badge ${e.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{e.status}</span></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="7" className="text-center">No expenses recorded</td></tr>}
          </tbody>
        </table>
      </div>
      {detailsId && (() => {
        const e = items.find(x => x._id === detailsId);
        if (!e) return null;
        return (
          <EntryDetailsModal
            title="Petty Expense"
            subtitle={e.category}
            meta={[
              { label: 'Date', value: adToBsStr(e.date) },
              { label: 'Category', value: e.category },
              { label: 'Amount', value: formatNPR(e.amount) },
              { label: 'Payment', value: e.paymentMethod },
              { label: 'Receipt', value: e.receiptNumber || '-' },
              { label: 'Status', value: e.status },
            ]}
            columns={[{ key: 'description', label: 'Description', wide: true }]}
            rows={[{ description: e.description }]}
            onPrint={() => printPettyExpense(e, company)}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
    </div>
  );
}
