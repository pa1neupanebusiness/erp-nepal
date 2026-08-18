import React, { useState, useEffect } from 'react';
import SearchableSelect from '../UI/SearchableSelect';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { useToast } from '../UI/Toast';
import { printEntry } from '../UI/printEntry';
import api from '../../api';

const INCOME_CATEGORIES = ['Grants & Funding', 'Commissions', 'Sponsorship', 'Investment'];

export default function OtherIncome() {
  const [items, setItems] = useState([]);
  const [banks, setBanks] = useState([]);
  const [company, setCompany] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [manualNo, setManualNo] = useState(false);
  const addToast = useToast();

  const emptyItem = { category: '', amount: '' };
  const [form, setForm] = useState({
    incomeNo: '',
    date: adToBsStr(new Date()),
    items: [{ ...emptyItem }],
    paymentMethod: 'cash',
    bank: '',
    remarks: '',
    attachments: [],
  });

  useEffect(() => {
    load();
    api.get('/banks').then(r => setBanks(r.data || [])).catch(() => {});
    api.get('/company').then(r => setCompany(r.data)).catch(() => {});
    loadNextNo();
  }, []);

  const load = () =>
    api.get('/other-incomes')
      .then(r => setItems(r.data || []))
      .catch(() => {});

  const loadNextNo = () =>
    api.get('/other-incomes/next-no')
      .then(r => { if (!manualNo) setForm(f => ({ ...f, incomeNo: r.data.nextNo })); })
      .catch(() => {});

  const resetForm = () => {
    setForm({
      incomeNo: '',
      date: adToBsStr(new Date()),
      items: [{ ...emptyItem }],
      paymentMethod: 'cash',
      bank: '',
      remarks: '',
      attachments: [],
    });
    setEditingId(null);
    setManualNo(false);
    loadNextNo();
  };

  const handleItemChange = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  };

  const addItemRow = () => {
    setForm(f => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  };

  const removeItemRow = (idx) => {
    setForm(f => {
      if (f.items.length <= 1) return f;
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = form.items.filter(i => i.category && parseFloat(i.amount) > 0);
    if (validItems.length === 0) return addToast('Please add at least one income item', 'error');

    const payload = {
      date: bsToADStr(form.date),
      items: validItems.map(i => ({ category: i.category, amount: parseFloat(i.amount) })),
      paymentMethod: form.paymentMethod,
      bank: (form.paymentMethod === 'bank' || form.paymentMethod === 'cheque') ? form.bank : undefined,
      remarks: form.remarks,
      attachments: form.attachments,
      manualNo: manualNo ? form.incomeNo : undefined,
    };

    try {
      if (editingId) {
        await api.put(`/other-incomes/${editingId}`, payload);
        addToast('Income updated successfully', 'success');
      } else {
        await api.post('/other-incomes', payload);
        addToast('Income recorded successfully', 'success');
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save income', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setForm({
      incomeNo: item.incomeNo,
      date: adToBsStr(item.date),
      items: item.items.length > 0
        ? item.items.map(i => ({ category: i.category, amount: String(i.amount) }))
        : [{ ...emptyItem }],
      paymentMethod: item.paymentMethod || 'cash',
      bank: item.bank?._id || item.bank || '',
      remarks: item.remarks || '',
      attachments: item.attachments || [],
    });
    setManualNo(true);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Cancel this income entry?')) return;
    try {
      await api.delete(`/other-incomes/${id}`);
      addToast('Income cancelled', 'success');
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to cancel', 'error');
    }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (i.incomeNo || '').toLowerCase().includes(q) ||
      (i.remarks || '').toLowerCase().includes(q) ||
      i.items?.some(it => (it.category || '').toLowerCase().includes(q))
    );
  });

  const total = filtered.filter(i => i.status === 'active').reduce((s, i) => s + (i.totalAmount || 0), 0);

  const handlePrint = (item) => {
    printEntry({
      title: 'Other Income',
      subtitle: item.incomeNo,
      meta: [
        { label: 'Date', value: adToBsStr(item.date) },
        { label: 'Payment', value: item.paymentMethod },
        { label: 'Total', value: formatNPR(item.totalAmount) },
        { label: 'Remarks', value: item.remarks || '-' },
      ],
      columns: [
        { key: 'category', label: 'Category' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: (item.items || []).map(i => ({
        category: i.category,
        amount: formatNPR(i.amount),
      })),
      footer: [{ label: 'Total', value: formatNPR(item.totalAmount) }],
    });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Other Income ({filtered.length})</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 200, fontSize: '0.875rem' }}
          />
          <span className="fiscal-badge">Total: {formatNPR(total)}</span>
          <button
            className="btn btn-primary"
            onClick={() => { resetForm(); setShowForm(!showForm); }}
          >
            {showForm ? 'Cancel' : '+ Add Income'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 700 }}>
          <h3>{editingId ? 'Edit Income' : 'New Other Income'}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Income No</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={form.incomeNo}
                  onChange={e => setForm({ ...form, incomeNo: e.target.value })}
                  disabled={!manualNo}
                  style={{ flex: 1 }}
                />
                <label style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={manualNo}
                    onChange={e => {
                      setManualNo(e.target.checked);
                      if (!e.target.checked) loadNextNo();
                    }}
                    style={{ marginRight: 4 }}
                  />
                  Manual
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>Date</label>
              <NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} />
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Income Items</label>
              <button type="button" className="btn btn-secondary" onClick={addItemRow} style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}>
                + Add Income Item
              </button>
            </div>

            {form.items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <div style={{ flex: 2 }}>
                  <SearchableSelect
                    options={INCOME_CATEGORIES.map(c => ({ value: c, label: c }))}
                    value={item.category}
                    onChange={v => handleItemChange(idx, 'category', v)}
                    placeholder="Select category..."
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={item.amount}
                    onChange={e => handleItemChange(idx, 'amount', e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', border: '1px solid #cbd5e1', borderRadius: 8 }}
                  />
                </div>
                {form.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem' }}
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <div style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Total: {formatNPR(form.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: '0.75rem' }}>
            <div className="form-group">
              <label>Payment Method</label>
              <select
                className="form-control"
                value={form.paymentMethod}
                onChange={e => setForm({ ...form, paymentMethod: e.target.value, bank: '' })}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="cheque">Cheque</option>
                <option value="digital">Digital</option>
              </select>
            </div>

            {(form.paymentMethod === 'bank' || form.paymentMethod === 'cheque') && (
              <div className="form-group">
                <label>Bank</label>
                <SearchableSelect
                  options={banks.map(b => ({
                    value: b._id,
                    label: b.accountNumber ? `${b.name} (${b.accountNumber})` : b.name,
                  }))}
                  value={form.bank}
                  onChange={v => setForm({ ...form, bank: v })}
                  placeholder="Select bank..."
                />
              </div>
            )}

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Remarks</label>
              <textarea
                className="form-control"
                rows={2}
                value={form.remarks}
                onChange={e => setForm({ ...form, remarks: e.target.value })}
                placeholder="Optional remarks..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              style={{ background: '#10b981', color: '#fff', border: 'none' }}
            >
              {editingId ? 'Update Income' : 'Save Income'}
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Inc No</th>
              <th>Category</th>
              <th>Date</th>
              <th>Payment Mode</th>
              <th>Total Amount</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inc => (
              <tr key={inc._id}>
                <td><strong>{inc.incomeNo}</strong></td>
                <td>
                  {(inc.items || []).map((it, i) => (
                    <span key={i} className="badge badge-info" style={{ marginRight: 4 }}>{it.category}</span>
                  ))}
                </td>
                <td>{adToBsStr(inc.date)}</td>
                <td>
                  <span className="badge badge-success">
                    {inc.paymentMethod === 'bank' ? 'Bank' : inc.paymentMethod === 'cheque' ? 'Cheque' : inc.paymentMethod === 'digital' ? 'Digital' : 'Cash'}
                  </span>
                </td>
                <td className="text-danger"><strong>{formatNPR(inc.totalAmount)}</strong></td>
                <td>{inc.remarks || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => handleEdit(inc)}>
                      Edit
                    </button>
                    {inc.status === 'active' && (
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#ef4444', color: '#fff' }} onClick={() => handleDelete(inc._id)}>
                        Delete
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => handlePrint(inc)}>
                      Print
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="text-center">No income entries found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
