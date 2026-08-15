import React, { useState, useEffect } from 'react';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import ConfirmModal from '../UI/ConfirmModal';
import { useToast } from '../UI/Toast';
import api from '../../api';

export default function AccountingExpenses() {
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [items, setItems] = useState([]);
  const [byAccount, setByAccount] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: adToBsStr(new Date()), account: '', description: '', amount: '', paymentMethod: 'cash', bank: '', receiptNumber: '' });
  const [details, setDetails] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [jeDetail, setJeDetail] = useState(null);
  const [banks, setBanks] = useState([]);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';

  useEffect(() => {
    api.get('/accounts').then(r => {
      const expAccs = r.data.filter(a => a.type === 'expense' && a.category === 'operating_expense' && a.isActive !== false);
      setExpenseAccounts(expAccs);
    }).catch(() => {});
    api.get('/banks').then(r => setBanks(r.data || [])).catch(() => {});
    loadByAccount();
  }, []);

  useEffect(() => {
    if (selectedAccount) loadItems(selectedAccount);
  }, [selectedAccount]);

  const loadByAccount = () => {
    api.get('/expenses/by-account').then(r => setByAccount(r.data)).catch(() => {});
  };

  const loadItems = (accountId) => {
    api.get('/expenses', { params: { account: accountId } }).then(r =>
      setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)))
    ).catch(() => {});
  };

  const handleSelectAccount = (accId) => {
    setSelectedAccount(accId);
    setForm(f => ({ ...f, account: accId }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.account) return addToast('Please select an expense account', 'error');
    try {
      await api.post('/expenses', {
        ...form,
        date: bsToADStr(form.date),
        amount: parseFloat(form.amount),
        bank: form.paymentMethod === 'bank' && form.bank ? form.bank : undefined,
      });
      addToast('Expense recorded successfully', 'success');
      setForm({ date: adToBsStr(new Date()), account: form.account, description: '', amount: '', paymentMethod: 'cash', bank: '', receiptNumber: '' });
      setShowForm(false);
      if (selectedAccount) loadItems(selectedAccount);
      loadByAccount();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to record expense', 'error');
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.put(`/expenses/${id}/cancel`);
      addToast('Expense cancelled', 'success');
      setConfirmCancel(null);
      if (selectedAccount) loadItems(selectedAccount);
      loadByAccount();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to cancel', 'error');
    }
  };

  const openLedger = async (accountId) => {
    try {
      const { data } = await api.get(`/accounts/ledger/${accountId}`);
      setLedger(data);
    } catch { addToast('Failed to load ledger', 'error'); }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '-';

  const totalExpenses = items.filter(i => i.status === 'active').reduce((s, i) => s + i.amount, 0);
  const selectedAcc = expenseAccounts.find(a => a._id === selectedAccount);

  return (
    <div>
      <div className="page-header">
        <h1>Expenses</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {selectedAccount && <span className="fiscal-badge">Total: {formatNPR(totalExpenses)}</span>}
          <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setForm(f => ({ ...f, account: selectedAccount })); }}>
            {showForm ? 'Cancel' : 'Record Expense'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label>Select Expense Account</label>
          <SearchableSelect
            options={expenseAccounts.map(a => ({ value: a._id, label: `${a.code} - ${a.name}` }))}
            value={selectedAccount}
            onChange={handleSelectAccount}
            placeholder="Choose an expense account..."
          />
        </div>
      </div>

      {!selectedAccount && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {expenseAccounts.map(acc => {
            const agg = byAccount.find(b => b._id === acc._id);
            return (
              <div key={acc._id} className="card" style={{ cursor: 'pointer', padding: '1rem', borderLeft: agg ? '4px solid #2563eb' : '4px solid #e2e8f0', transition: 'all 0.15s' }}
                onClick={() => handleSelectAccount(acc._id)}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{acc.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{acc.code}</div>
                {agg ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>{formatNPR(agg.total)}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{agg.count} transaction(s)</div>
                  </div>
                ) : (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>No expenses</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedAccount && showForm && (
        <form onSubmit={handleSubmit} className="card form-card" style={{ maxWidth: 600, borderLeft: '4px solid #16a34a' }}>
          <h3>Record Expense - {selectedAcc?.name}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
            <div className="form-group">
              <label>Account</label>
              <div style={{ padding: '0.5rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.85rem' }}>
                {selectedAcc?.code} - {selectedAcc?.name}
              </div>
            </div>
            <div className="form-group"><label>Amount (Rs.) *</label><input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="form-group">
              <label>Payment Method</label>
              <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value, bank: '' })}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </select>
            </div>
            {form.paymentMethod === 'bank' && banks.length > 0 && (
              <div className="form-group">
                <label>Bank Account</label>
                <select value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })}>
                  <option value="">Select bank...</option>
                  {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label>Receipt #</label><input value={form.receiptNumber} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} placeholder="Optional" /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Description *</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required placeholder="What was this expense for?" /></div>
          </div>
          <button type="submit" className="btn btn-primary">Save Expense</button>
        </form>
      )}

      {selectedAccount && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Transactions - {selectedAcc?.code} - {selectedAcc?.name}</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => openLedger(selectedAccount)}>View Full Ledger</button>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th>Receipt</th><th className="text-right">Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map(e => (
                  <tr key={e._id}>
                    <td>{adToBsStr(e.date)}</td>
                    <td>{e.description}</td>
                    <td>{e.receiptNumber || '-'}</td>
                    <td className="text-right"><strong>{formatNPR(e.amount)}</strong></td>
                    <td><span className={`badge ${e.paymentMethod === 'bank' ? 'badge-info' : 'badge-secondary'}`}>{e.paymentMethod}</span></td>
                    <td><span className={`badge ${e.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{e.status}</span></td>
                    <td>
                      {e.status === 'active' && isSuperAdmin && (
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmCancel({ id: e.id || e._id, message: `Cancel this ${formatNPR(e.amount)} expense?` })}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan="7" className="text-center">No expenses for this account</td></tr>}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr><td colSpan="3"><strong>Total</strong></td><td className="text-right"><strong>{formatNPR(totalExpenses)}</strong></td><td colSpan="3"></td></tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {ledger && (
        <EntryDetailsModal
          title="Account Ledger"
          subtitle={ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : ''}
          meta={[
            { label: 'Account', value: ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : '-' },
            { label: 'Type', value: ledger.account?.type || '-' },
            { label: 'Current Balance', value: formatNPR(ledger.currentBalance) },
          ]}
          columns={[
            { key: 'date', label: 'Date', render: fmtDate },
            { key: 'reference', label: 'Reference' },
            { key: 'description', label: 'Description', wide: true },
            { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
            { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
            { key: 'balance', label: 'Balance', align: 'right', render: (v) => formatNPR(v) },
          ]}
          rows={ledger.entries || []}
          footer={[
            { label: 'Total Debit', value: formatNPR((ledger.entries || []).reduce((s, r) => s + r.debit, 0)) },
            { label: 'Total Credit', value: formatNPR((ledger.entries || []).reduce((s, r) => s + r.credit, 0)) },
            { label: 'Closing Balance', value: formatNPR(ledger.currentBalance) },
          ]}
          onRowClick={async (row) => {
            if (!row?._id || row._id === 'opening') return;
            try { const { data } = await api.get(`/journal-entries/${row._id}`); setJeDetail(data); } catch { addToast('Failed to load entry', 'error'); }
          }}
          onClose={() => setLedger(null)}
        />
      )}
      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: new Date(jeDetail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: jeDetail.reference || '-' },
            { label: 'Posted By', value: jeDetail.createdBy?.name || '-' },
          ]}
          columns={[
            { key: 'account', label: 'Account', render: (v) => v ? `${v.code} - ${v.name}` : 'Deleted' },
            { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
            { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
          ]}
          rows={jeDetail.lines || []}
          footer={[
            { label: 'Total Debit', value: formatNPR((jeDetail.lines || []).reduce((s, l) => s + l.debit, 0)) },
            { label: 'Total Credit', value: formatNPR((jeDetail.lines || []).reduce((s, l) => s + l.credit, 0)) },
          ]}
          onClose={() => setJeDetail(null)}
        />
      )}
      <ConfirmModal open={!!confirmCancel} title="Cancel Expense" message={confirmCancel?.message} onConfirm={() => handleCancel(confirmCancel?.id)} onCancel={() => setConfirmCancel(null)} />
    </div>
  );
}
