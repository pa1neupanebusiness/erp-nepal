import React, { useState, useEffect, useMemo } from 'react';
import { showConfirm } from '../UI/ConfirmDialog';
import api from '../../api';
import { useToast } from '../UI/Toast';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SearchableSelect from '../UI/SearchableSelect';
import { escapeHtml } from '../UI/printEntry';
import { openPrintWindow } from '../UI/printCommon';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const METHOD_STYLES = {
  cash: { label: 'Cash', bg: '#ecfdf5', color: '#047857', icon: '💵' },
  bank: { label: 'Bank', bg: '#eff6ff', color: '#1d4ed8', icon: '🏦' },
  qr: { label: 'QR', bg: '#f5f3ff', color: '#6d28d9', icon: '📱' },
  cheque: { label: 'Cheque', bg: '#fffbeb', color: '#b45309', icon: '📄' },
};

export default function PaymentIn() {
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outstanding, setOutstanding] = useState({ invoices: [], totalDue: 0 });
  const [form, setForm] = useState({ date: adToBsStr(new Date()), customer: '', amount: '', method: 'cash', bank: '', chequeNumber: '', reference: '', note: '' });
  const addToast = useToast();

  const load = () => {
    const params = {};
    if (startDate) params.startDate = bsToADStr(startDate);
    if (endDate) params.endDate = bsToADStr(endDate);
    api.get('/payment-in', { params }).then(r => setItems(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)))).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.customer) {
      api.get('/payment-in/outstanding', { params: { customerId: form.customer } })
        .then(r => setOutstanding(r.data)).catch(() => setOutstanding({ invoices: [], totalDue: 0 }));
    } else {
      setOutstanding({ invoices: [], totalDue: 0 });
    }
  }, [form.customer]);

  const active = items.filter(i => i.status !== 'cancelled');
  const totalAmount = active.reduce((s, i) => s + i.amount, 0);
  const byMethod = active.reduce((acc, i) => {
    acc[i.method] = (acc[i.method] || 0) + i.amount;
    return acc;
  }, {});
  const totalCash = byMethod.cash || 0;
  const totalBank = (byMethod.bank || 0) + (byMethod.qr || 0) + (byMethod.cheque || 0);

  const amount = parseFloat(form.amount) || 0;
  const allocationPreview = useMemo(() => {
    const rows = [];
    let remaining = amount;
    for (const inv of outstanding.invoices) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, inv.due);
      rows.push({ ...inv, apply });
      remaining = Math.round((remaining - apply) * 100) / 100;
    }
    return rows;
  }, [amount, outstanding]);

  const canSubmit = amount > 0 && form.customer;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) { addToast('Select a customer and enter a valid amount', 'error'); return; }
    setSubmitting(true);
    try {
      await api.post('/payment-in', { ...form, date: bsToADStr(form.date), amount });
      addToast('Receipt recorded', 'success');
      setShowForm(false);
      setForm({ date: adToBsStr(new Date()), customer: '', amount: '', method: 'cash', bank: '', chequeNumber: '', reference: '', note: '' });
      setOutstanding({ invoices: [], totalDue: 0 });
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Error recording receipt', 'error'); }
    setSubmitting(false);
  };

  const handleCancel = async (p) => {
    if (!(await showConfirm(`Cancel receipt ${p.receiptNumber}? Allocations will be reversed.`, { danger: true }))) return;
    try {
      await api.post(`/payment-in/${p._id}/cancel`);
      addToast('Receipt cancelled', 'success');
      setDetail(null);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Cancel failed', 'error'); }
  };

  const allocationsRef = (p) => (p.allocations || []).map(a => a.sale?.invoiceNumber || a.emi?.emiNumber || 'On account').join(', ') || '-';

  const printReport = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const company = user.company || {};
    const range = startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Today'}` : 'All time';
    const methodRow = (label, val) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${fmt(val)}</div></div>`;
    const rowsHtml = items.map(p => {
      const ms = METHOD_STYLES[p.method] || METHOD_STYLES.cash;
      return `<tr>
        <td>${escapeHtml(p.receiptNumber)}</td>
        <td>${new Date(p.date).toLocaleDateString('en-IN')}</td>
        <td>${escapeHtml(p.customer?.name || '-')}</td>
        <td>${escapeHtml(ms.label)}${p.bank?.name ? ' - ' + escapeHtml(p.bank.name) : ''}</td>
        <td>${escapeHtml(allocationsRef(p))}</td>
        <td class="text-right">${fmt(p.amount)}</td>
        <td>${escapeHtml(p.status)}</td>
      </tr>`;
    }).join('');

    const bodyHtml = `
      <div class="stat-grid">
        ${methodRow('Receipts', active.length)}
        ${methodRow('Total Received', totalAmount)}
        ${methodRow('Cash', totalCash)}
        ${methodRow('Bank', byMethod.bank || 0)}
        ${methodRow('QR', byMethod.qr || 0)}
        ${methodRow('Cheque', byMethod.cheque || 0)}
      </div>
      <table class="data-table">
        <thead><tr><th>Receipt No</th><th>Date</th><th>Customer</th><th>Method</th><th>Applied To</th><th class="text-right">Amount</th><th>Status</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="7" class="text-center">No receipts found</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5" class="text-right">Total</td><td class="text-right">${fmt(totalAmount)}</td><td></td></tr></tfoot>
      </table>`;

    openPrintWindow({
      title: 'Payment In Report',
      company,
      subtitle: `Period: ${range}`,
      docTitle: 'Payment In Report',
      bodyHtml,
    });
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Payment In (Receipts)</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>Customer receipts and invoice settlement</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={printReport} disabled={active.length === 0}>🖨️ Print Report</button>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Receipt'}</button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem', padding: '0.9rem 1rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>From</label><NepaliDatePicker value={startDate} onChange={setStartDate} /></div>
        <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>To</label><NepaliDatePicker value={endDate} onChange={setEndDate} /></div>
        <button className="btn btn-primary" onClick={load}>Apply Filter</button>
        {(startDate || endDate) && <button className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); setTimeout(load, 0); }}>Clear</button>}
      </div>

      <div className="report-summary" style={{ marginBottom: '1.25rem', gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="summary-card" style={{ borderTop: '3px solid #3b82f6' }}><div className="summary-label">Receipts</div><div className="summary-value">{active.length}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #0f172a' }}><div className="summary-label">Total Received</div><div className="summary-value">{fmt(totalAmount)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #10b981' }}><div className="summary-label">💵 Cash</div><div className="summary-value">{fmt(totalCash)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #1d4ed8' }}><div className="summary-label">🏦 Bank</div><div className="summary-value">{fmt(byMethod.bank || 0)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}><div className="summary-label">📱 QR</div><div className="summary-value">{fmt(byMethod.qr || 0)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #d97706' }}><div className="summary-label">📄 Cheque</div><div className="summary-value">{fmt(byMethod.cheque || 0)}</div></div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card">
          <h3>New Customer Receipt</h3>
          <div className="form-grid">
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
            <div className="form-group"><label>Customer *</label>
              <SearchableSelect options={customers.map(c => ({ value: c._id, label: c.name }))} value={form.customer} onChange={v => setForm({ ...form, customer: v })} placeholder="Search customer..." required />
              {form.customer && outstanding.balance !== undefined && outstanding.balance !== 0 && (
                <div style={{ marginTop: 4, fontSize: '0.8rem', fontWeight: 600, color: outstanding.balance > 0 ? '#dc2626' : '#16a34a' }}>
                  Balance: {fmt(Math.abs(outstanding.balance))} {outstanding.balance > 0 ? 'Dr' : 'Cr'}
                </div>
              )}
            </div>
            <div className="form-group"><label>Amount *</label><input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="form-group"><label>Method</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="qr">QR</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            {form.method === 'bank' && (
              <div className="form-group"><label>Bank</label>
                <select value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })}>
                  <option value="">Select bank</option>
                  {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            {(form.method === 'bank' || form.method === 'cheque') && (
              <div className="form-group"><label>Cheque No.</label><input value={form.chequeNumber} onChange={e => setForm({ ...form, chequeNumber: e.target.value })} placeholder="Cheque number" /></div>
            )}
            <div className="form-group"><label>Reference</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="e.g. invoice no" /></div>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group"><label>Note</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
          </div>

          <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Open Receivables {outstanding.totalDue > 0 && <small className="text-muted">(Total due: {fmt(outstanding.totalDue)})</small>}</h4>
          {outstanding.invoices.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Invoice</th><th className="text-right">Due</th>{amount > 0 && <th className="text-right">Apply</th>}</tr></thead>
                <tbody>
                  {outstanding.invoices.map(inv => (
                    <tr key={inv._id}>
                      <td>{inv.ref} <span className={`badge ${inv.type === 'emi' ? 'badge-info' : 'badge-warning'}`}>{inv.type === 'emi' ? 'EMI' : 'Credit Sale'}</span></td>
                      <td className="text-right">{fmt(inv.due)}</td>
                      {amount > 0 && <td className="text-right">{fmt(allocationPreview.find(a => a._id === inv._id)?.apply || 0)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : form.customer ? <p className="text-muted">No outstanding receivables. Receipt will be recorded on account.</p> : <p className="text-muted">Select a customer to see open invoices.</p>}

          {amount > 0 && outstanding.totalDue > 0 && (
            <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Oldest invoices settled first ({allocationPreview.filter(a => a.apply > 0).length} invoice(s)); excess is kept on account.
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canSubmit || submitting}>{submitting ? 'Saving...' : 'Record Receipt'}</button>
        </form>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Receipt No</th><th>Date</th><th>Customer</th><th>Method</th><th>Applied To</th><th className="text-right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(p => {
                const ms = METHOD_STYLES[p.method] || METHOD_STYLES.cash;
                return (
                <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                  <td style={{ fontWeight: 600 }}>{p.receiptNumber}</td>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>{p.customer?.name || '-'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: ms.bg, color: ms.color, borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>
                      {ms.icon} {ms.label}{p.bank?.name ? ` · ${p.bank.name}` : ''}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#475569', maxWidth: 220 }}>{allocationsRef(p)}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                  <td><span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{p.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-secondary" onClick={(ev) => { ev.stopPropagation(); setDetail(p); }}>View</button>
                      {p.status === 'active' && <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); handleCancel(p); }}>Cancel</button>}
                    </div>
                  </td>
                </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan="8" className="text-center">No receipts found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (() => {
        const p = detail;
        return (
          <EntryDetailsModal
            title={`Receipt - ${p.receiptNumber}`}
            subtitle={p.customer?.name || ''}
            meta={[
              { label: 'Date', value: new Date(p.date).toLocaleDateString('en-IN') },
              { label: 'Method', value: p.method + (p.bank?.name ? ` (${p.bank.name})` : '') },
              { label: 'Cheque', value: p.chequeNumber || '-' },
              { label: 'Amount', value: fmt(p.amount) },
              { label: 'Status', value: p.status },
              { label: 'Reference', value: p.reference || '-' },
              { label: 'Note', value: p.note || '-' },
            ]}
            columns={[
              { key: 'sale', label: 'Invoice', render: (v, row) => row.sale?.invoiceNumber || row.emi?.emiNumber || 'On account' },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => fmt(v) },
            ]}
            rows={p.allocations || []}
            footer={[{ label: 'Total', value: fmt(p.amount) }]}
            actions={p.status === 'active' ? <button className="btn btn-sm btn-danger" onClick={() => handleCancel(p)}>Cancel Receipt</button> : null}
            onClose={() => setDetail(null)}
          />
        );
      })()}
    </div>
  );
}
