import React, { useState, useEffect } from 'react';
import { showConfirm } from '../UI/ConfirmDialog';
import { useToast } from '../UI/Toast';
import api from '../../api';
import { openPrintWindow } from '../UI/printCommon';
import { TimestampToggle } from '../../utils/timeService';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const printBankLedger = (bank, txns) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const company = user.company || {};
  const rows = (txns || []).map(t => `
    <tr>
      <td>${new Date(t.date).toLocaleDateString('en-IN')}</td>
      <td>${esc(t.reference || '-')}</td>
      <td>${esc(t.description || '-')}</td>
      <td class="text-right">${t.type === 'inflow' ? fmt(t.amount) : ''}</td>
      <td class="text-right">${t.type === 'outflow' ? fmt(t.amount) : ''}</td>
      <td class="text-right" style="font-weight:bold;">${fmt(t.balance)}</td>
    </tr>`).join('');

  const bodyHtml = `
    <div class="meta-list">
      <div class="meta-item"><span class="mlabel">Current Balance</span><span class="mvalue">${fmt(bank.balance)}</span></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Reference</th><th>Particulars</th><th class="text-right">Inflow (Rs.)</th><th class="text-right">Outflow (Rs.)</th><th class="text-right">Balance (Rs.)</th></tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center">No transactions</td></tr>'}
        <tr class="tfoot-row"><td colspan="3">Current Balance</td><td></td><td></td><td class="text-right">${fmt(bank.balance)}</td></tr>
      </tbody>
    </table>`;

  openPrintWindow({
    title: `Bank Ledger - ${bank.name}`,
    company,
    subtitle: `${bank.name}${bank.accountNumber ? ' (A/C ' + bank.accountNumber + ')' : ''}`,
    docTitle: 'Bank Ledger',
    bodyHtml,
  });
};

export default function Banks() {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', accountNumber: '', branch: '', initialBalance: 0 });
  const [saving, setSaving] = useState(false);
  const [selectedBank, setSelectedBank] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [journalDetail, setJournalDetail] = useState(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const addToast = useToast();

  const load = () => {
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm({ name: '', accountNumber: '', branch: '', initialBalance: 0 }); setEditing(null); };

  const openTxDetail = async (t) => {
    try {
      const { data } = await api.get('/journal-entries/' + t._id);
      setJournalDetail(data);
    } catch (_) {
      setJournalDetail({
        reference: t.reference,
        description: t.description,
        date: t.date,
        lines: [{ debit: t.debit, credit: t.credit, account: { code: '', name: t.type === 'inflow' ? 'Inflow' : 'Outflow' } }],
        createdBy: { name: t.createdBy },
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { addToast('Bank name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/banks/${editing}`, { name: form.name, accountNumber: form.accountNumber, branch: form.branch, balance: parseFloat(form.initialBalance) || 0 });
        addToast('Bank updated', 'success');
      } else {
        await api.post('/banks', { name: form.name, accountNumber: form.accountNumber, branch: form.branch, initialBalance: parseFloat(form.initialBalance) || 0 });
        addToast('Bank created', 'success');
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Failed to save bank', 'error'); }
    setSaving(false);
  };

  const startEdit = (e, b) => {
    e.stopPropagation();
    setForm({ name: b.name, accountNumber: b.accountNumber || '', branch: b.branch || '', initialBalance: b.balance || 0 });
    setEditing(b._id);
    setShowForm(true);
  };

  const handleDelete = async (e, b) => {
    e.stopPropagation();
    if (!(await showConfirm('Delete bank "' + b.name + '"? This will not delete its journal history.', { danger: true }))) return;
    try {
      await api.delete('/banks/' + b._id);
      addToast('Bank deleted', 'success');
      if (selectedBank && selectedBank._id === b._id) { setSelectedBank(null); setTransactions([]); }
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Delete failed', 'error'); }
  };

  const openTransactions = async (b) => {
    if (selectedBank && selectedBank._id === b._id) { setSelectedBank(null); setTransactions([]); return; }
    setSelectedBank(b);
    setTxLoading(true);
    try {
      const { data } = await api.get('/banks/' + b._id + '/transactions');
      setTransactions(data.transactions || []);
    } catch (_) { setTransactions([]); }
    setTxLoading(false);
  };

  const totalBalance = banks.reduce((s, b) => s + (b.balance || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Banks</h2>
          <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '2px' }}>
            Combined bank balance: {fmt(totalBalance)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { if (!showForm) resetForm(); setShowForm(!showForm); }}>
          {showForm ? 'Cancel' : '+ New Bank'}
        </button>
        <TimestampToggle />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card">
          <h3>{editing ? 'Edit Bank' : 'New Bank'}</h3>
          <div className="form-grid">
            <div className="form-group"><label>Bank Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g., Nabil Bank" /></div>
            <div className="form-group"><label>Account Number</label><input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} placeholder="e.g., 0130101010101" /></div>
            <div className="form-group"><label>Branch</label><input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} placeholder="e.g., Durbarmarg" /></div>
            <div className="form-group"><label>{editing ? 'Adjust Balance (Rs.)' : 'Initial Balance (Rs.)'}</label><input type="number" step="0.01" value={form.initialBalance} onChange={e => setForm({ ...form, initialBalance: e.target.value })} placeholder="0" /></div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : (editing ? 'Update Bank' : 'Create Bank')}</button>
        </form>
      )}

      <div className="card">
        <div className="report-summary" style={{ marginBottom: '1rem' }}>
          <div className="summary-card"><div className="summary-label">Banks</div><div className="summary-value">{banks.length}</div></div>
          <div className="summary-card"><div className="summary-label">Total Balance</div><div className="summary-value">{fmt(totalBalance)}</div></div>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Bank Name</th><th>Account Number</th><th>Branch</th><th className="text-right">Balance</th><th></th></tr></thead>
            <tbody>
              {banks.map(b => (
                <React.Fragment key={b._id}>
                  <tr style={{ cursor: 'pointer', background: selectedBank && selectedBank._id === b._id ? '#f0f9ff' : undefined }} onClick={() => openTransactions(b)}>
                    <td>
                      <span style={{ marginRight: '0.5rem', fontSize: '0.7rem' }}>{selectedBank && selectedBank._id === b._id ? '\u25BC' : '\u25B6'}</span>
                      {b.name}
                    </td>
                    <td>{b.accountNumber || '-'}</td>
                    <td>{b.branch || '-'}</td>
                    <td className="text-right">{fmt(b.balance)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={(e) => startEdit(e, b)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={(e) => handleDelete(e, b)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                  {selectedBank && selectedBank._id === b._id && (
                    <tr>
                      <td colSpan="5" style={{ padding: 0, background: '#f8fafc' }}>
                        <div style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Transaction History - {b.name}</h4>
                             <button className="btn btn-sm btn-secondary" onClick={() => printBankLedger(b, transactions)} disabled={txLoading || transactions.length === 0}>Print Ledger</button>
                             <button className="btn btn-sm btn-secondary" onClick={() => setNewestFirst(s => !s)}>{newestFirst ? 'Show Oldest' : 'Show Latest'}</button>
                          </div>
                          {txLoading ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>Loading transactions...</div>
                          ) : transactions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>No transactions found for this bank.</div>
                          ) : (
                            <div className="table-responsive">
                              <table className="table" style={{ fontSize: '0.85rem' }}>
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Reference</th>
                                    <th>Description</th>
                                    <th className="text-right">Inflow (+)</th>
                                    <th className="text-right">Outflow (-)</th>
                                    <th className="text-right">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...(newestFirst ? [...transactions].reverse() : transactions)].map((t, i) => (
                                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => openTxDetail(t)}>
                                      <td>{new Date(t.date).toLocaleDateString('en-IN')}</td>
                                      <td>{t.reference || '-'}</td>
                                      <td>{t.description || '-'}</td>
                                      <td className="text-right" style={{ color: t.type === 'inflow' ? '#16a34a' : undefined }}>{t.type === 'inflow' ? fmt(t.amount) : ''}</td>
                                      <td className="text-right" style={{ color: t.type === 'outflow' ? '#dc2626' : undefined }}>{t.type === 'outflow' ? fmt(t.amount) : ''}</td>
                                      <td className="text-right" style={{ fontWeight: 600 }}>{fmt(t.balance)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="total-row">
                                    <td colSpan="3"><strong>Current Balance</strong></td>
                                    <td className="text-right"><strong>{fmt(b.balance)}</strong></td>
                                    <td></td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {banks.length === 0 && <tr><td colSpan="5" className="text-center">No banks yet. Create one to track bank balances.</td></tr>}
            </tbody>
            {banks.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="3"><strong>Total</strong></td>
                  <td className="text-right"><strong>{fmt(totalBalance)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {journalDetail && (
        <div className="modal-overlay" onClick={() => setJournalDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3>Journal Entry - {journalDetail.reference || ''}</h3>
              <button className="btn btn-sm modal-close-x" onClick={() => setJournalDetail(null)}>{'\u00D7'}</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <div><span className="text-muted">Date: </span><strong>{journalDetail.date ? new Date(journalDetail.date).toLocaleDateString('en-IN') : '-'}</strong></div>
                <div><span className="text-muted">Description: </span><strong>{journalDetail.description || '-'}</strong></div>
                <div><span className="text-muted">Created By: </span><strong>{journalDetail.createdBy?.name || '-'}</strong></div>
              </div>
              <div className="table-responsive">
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead><tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
                  <tbody>
                    {(journalDetail.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td>{l.account?.code ? l.account.code + ' - ' : ''}{l.account?.name || '-'}</td>
                        <td className="text-right" style={{ color: l.debit > 0 ? '#16a34a' : undefined }}>{l.debit > 0 ? fmt(l.debit) : '-'}</td>
                        <td className="text-right" style={{ color: l.credit > 0 ? '#dc2626' : undefined }}>{l.credit > 0 ? fmt(l.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
