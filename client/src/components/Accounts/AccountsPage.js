import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../UI/Toast';
import api from '../../api';
import DownloadBtn from '../DownloadBtn';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SearchableSelect from '../UI/SearchableSelect';
import Banks from './Banks';
import { formatDate as fmtDate } from '../UI/printEntry';
import { showConfirm } from '../UI/ConfirmDialog';
import { printHtmlDocument } from '../UI/printCommon';
import { ADToBS } from 'bikram-sambat-js';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [showBalance, setShowBalance] = useState(false);
  const [balanceForm, setBalanceForm] = useState({ account: '', amount: '', remarks: '' });
  const [loading, setLoading] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [ledgers, setLedgers] = useState({});
  const [journalDetail, setJournalDetail] = useState(null);
  const [jdLoading, setJdLoading] = useState(false);
  const addToast = useToast();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const company = user.company || {};
  const countryNames = {
    nepal: 'Nepal', india: 'India', usa: 'USA', uk: 'UK', australia: 'Australia',
    canada: 'Canada', germany: 'Germany', france: 'France', japan: 'Japan',
    singapore: 'Singapore', uae: 'UAE', southafrica: 'South Africa',
    newzealand: 'New Zealand', ireland: 'Ireland',
  };
  const taxLabels = {
    nepal: 'VAT', india: 'GST', usa: 'Sales Tax', uk: 'VAT', australia: 'GST',
    canada: 'GST/HST', germany: 'USt', france: 'TVA', japan: 'Tax',
    singapore: 'GST', uae: 'VAT', southafrica: 'VAT', newzealand: 'GST', ireland: 'VAT',
  };
  const countryName = countryNames[company.country] || company.country || 'Nepal';
  const currencySymbol = company.currencySymbol || 'रू';
  const currencyCode = company.currency || 'NPR';
  const taxLabel = taxLabels[company.country] || 'VAT';
  const taxRate = company.vatRate != null ? `${company.vatRate}%` : '';

  const load = () => api.get('/accounts').then(r => setAccounts(r.data));
  useEffect(() => { api.post('/accounts/recalculate-balances').then(() => load()).catch(() => load()); }, []);

  const groupByType = (type) => accounts.filter(a => a.type === type && a.isActive);
  const formatNPR = (n) => (currencySymbol || '') + ' ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const typeLabels = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses', contra_asset: 'Contra Assets', contra_revenue: 'Contra Revenue' };

  const assetAccounts = accounts.filter(a => a.type === 'asset' && a.isActive);

  const handleSetBalance = async (e) => {
    e.preventDefault();
    if (!balanceForm.remarks.trim()) { addToast('Remarks are required', 'error'); return; }
    setLoading(true);
    try {
      await api.post('/accounts/opening-balance', {
        accountId: balanceForm.account,
        amount: parseFloat(balanceForm.amount),
        remarks: balanceForm.remarks,
      });
      setShowBalance(false);
      setBalanceForm({ account: '', amount: '', remarks: '' });
      load();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to set initial balance', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLedger = async (accountId) => {
    if (ledgers[accountId]) return;
    try {
      const { data } = await api.get(`/accounts/ledger/${accountId}`);
      setLedgers(prev => ({ ...prev, [accountId]: data }));
    } catch (err) {
      addToast('Failed to load ledger', 'error');
    }
  };

  const handleAccountClick = (a) => {
    setDetailsId(a._id);
    loadLedger(a._id);
  };

  const detailAccount = detailsId ? ledgers[detailsId] : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Chart of Accounts</h2>
          <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '2px' }}>
            {countryName} · {currencyCode} {currencySymbol && `(${currencySymbol})`}
            {taxRate ? ` · ${taxLabel} ${taxRate}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <DownloadBtn endpoint="accounts" label="PDF" type="pdf" filename="chart_of_accounts" />
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const el = document.getElementById('journal-print-area');
            if (el) printHtmlDocument(el.outerHTML, 'Chart of Accounts');
          }}>Print</button>
          {accounts.length > 0 && <button className="btn btn-secondary" onClick={() => setShowBalance(!showBalance)}>
            {showBalance ? 'Cancel' : 'Set Initial Balance'}
          </button>}
        </div>
      </div>
      {showBalance && (
        <form onSubmit={handleSetBalance} className="card form-card">
          <h3>Set Initial Balance</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Account *</label>
              <SearchableSelect
                options={assetAccounts.map(a => ({ value: a._id, label: `${a.code} - ${a.name}` }))}
                value={balanceForm.account}
                onChange={v => setBalanceForm({ ...balanceForm, account: v })}
                required
                placeholder="Search account..."
              />
            </div>
            <div className="form-group">
              <label>Amount (Rs.) *</label>
              <input type="number" step="0.01" min="0" value={balanceForm.amount} onChange={e => setBalanceForm({ ...balanceForm, amount: e.target.value })} required />
            </div>
          </div>
          <div className="form-group">
            <label>Remarks / Source *</label>
            <textarea value={balanceForm.remarks} onChange={e => setBalanceForm({ ...balanceForm, remarks: e.target.value })} required placeholder="e.g., Opening balance from previous year, Cash deposit from owner, etc." rows={2} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Posting...' : 'Post Opening Balance'}
          </button>
        </form>
      )}
      <div className="card">
        {Object.entries(typeLabels).filter(([t]) => groupByType(t).length > 0).map(([type, label]) => (
          <div key={type} className="account-group">
            <h4 className="account-group-title">{label}</h4>
          <table className="table" id="journal-print-area">
              <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th>Category</th><th>Balance</th><th></th></tr></thead>
              <tbody>
                {groupByType(type).map(a => {
                  return (
                    <tr key={a._id} onClick={() => handleAccountClick(a)} style={{ cursor: 'pointer' }}>
                      <td>{a.code}</td><td>{a.name}</td>
                      <td>{a.type}</td><td>{a.category || '-'}</td>
                      <td>{formatNPR(a.balance)}</td>
                      <td><button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); handleAccountClick(a); }}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="text-center" style={{ padding: '2rem' }}>
            <p>No chart of accounts exists for this company.</p>
            <button className="btn btn-primary" onClick={async () => {
              try { await api.post('/accounts/seed'); window.location.reload(); }
              catch (e) { addToast(e.response?.data?.message || 'Error', 'error'); }
            }}>Seed Chart of Accounts ({countryName})</button>
          </div>
        )}
      </div>
      {detailAccount && (() => {
        const l = detailAccount;
        const td = (l.entries || []).reduce((s, e) => s + (e.debit || 0), 0);
        const tc = (l.entries || []).reduce((s, e) => s + (e.credit || 0), 0);
        const handleLedgerRowClick = async (row) => {
          if (!row._id || row._id === 'opening') return;
          setJdLoading(true);
          try {
            const { data } = await api.get('/journal-entries/' + row._id);
            setJournalDetail(data);
          } catch (_) { setJournalDetail(null); }
          setJdLoading(false);
        };
        return (
          <>
          <EntryDetailsModal
            title="Ledger Details"
            subtitle={l.account ? l.account.code + ' - ' + l.account.name : ''}
            meta={[
              { label: 'Account', value: l.account ? l.account.code + ' - ' + l.account.name : '-' },
              { label: 'Type', value: l.account?.type || '-' },
              { label: 'Category', value: l.account?.category || '-' },
              { label: 'Current Balance', value: formatNPR(l.currentBalance) },
              { label: 'Total Due', value: formatNPR(l.totalDue || 0) },
              { label: 'Entries', value: (l.entries || []).length + '' },
            ]}
            columns={[
              { key: 'date', label: 'Date', render: fmtDate },
              { key: 'reference', label: 'Reference' },
              { key: 'description', label: 'Description', wide: true },
              { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
              { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
              { key: 'balance', label: 'Balance', align: 'right', render: (v) => formatNPR(v) },
              { key: 'totalDue', label: 'Total Due', align: 'right', render: (v) => formatNPR(v) },
            ]}
            rows={l.entries || []}
            onRowClick={handleLedgerRowClick}
            footer={[
              { label: 'Total Debit', value: formatNPR(td) },
              { label: 'Total Credit', value: formatNPR(tc) },
              { label: 'Closing Balance', value: formatNPR(l.currentBalance) },
            ]}
            onClose={() => { setDetailsId(null); setJournalDetail(null); }}
          />
          {journalDetail && (
            <div className="modal-overlay" onClick={() => setJournalDetail(null)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
                <div className="modal-header">
                  <h3>Journal Entry - {journalDetail.reference || ''}</h3>
                  <button className="btn btn-sm modal-close-x" onClick={() => setJournalDetail(null)}>{'\u00D7'}</button>
                </div>
                <div className="modal-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    <div><span className="text-muted">Date: </span><strong>{fmtDate(journalDetail.date)}</strong></div>
                    <div><span className="text-muted">Reference: </span><strong>{journalDetail.reference || '-'}</strong></div>
                    <div style={{ gridColumn: '1 / -1' }}><span className="text-muted">Description: </span><strong>{journalDetail.description || '-'}</strong></div>
                  </div>
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead><tr><th>Account Code</th><th>Account Name</th><th className="text-right">Debit (Rs.)</th><th className="text-right">Credit (Rs.)</th></tr></thead>
                    <tbody>
                      {(journalDetail.lines || []).map((line, idx) => {
                        const acc = line.account || {};
                        return (
                          <tr key={idx}>
                            <td>{acc.code || '-'}</td>
                            <td>{acc.name || '-'}</td>
                            <td className="text-right">{line.debit > 0 ? formatNPR(line.debit) : '-'}</td>
                            <td className="text-right">{line.credit > 0 ? formatNPR(line.credit) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan="2" className="text-right"><strong>Total</strong></td>
                        <td className="text-right"><strong>{formatNPR(journalDetail.lines.reduce((s, l) => s + (l.debit || 0), 0))}</strong></td>
                        <td className="text-right"><strong>{formatNPR(journalDetail.lines.reduce((s, l) => s + (l.credit || 0), 0))}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
          </>
        );
      })()}
    </div>
  );
}

function JournalEntryList() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [bankFilter, setBankFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: adToBsStr(new Date()), reference: '', description: '', lines: [{ account: '', debit: 0, credit: 0, subLedger: { customer: '', supplier: '' } }] });
  const [detailsId, setDetailsId] = useState(null);
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = user.role === 'super_admin';

  const printJournal = () => {
    const el = document.getElementById('journal-print-area');
    if (el) printHtmlDocument(el.outerHTML, 'Journal Entries');
    else window.print();
  };

  const load = () => {
    const params = {};
    if (startDate) params.startDate = bsToADStr(startDate);
    if (endDate) params.endDate = bsToADStr(endDate);
    if (bankFilter) params.bankId = bankFilter;
    params.excludeSource = 'MONTH_END';
    api.get('/journal-entries', { params }).then(r => setEntries(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)))).catch(() => {});
    api.get('/accounts').then(r => setAccounts(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get('/customers').then(r => setCustomers(r.data)).catch(() => {});
    api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
    api.get('/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [startDate, endDate, bankFilter]);

  const applyPeriod = (p) => {
    setPeriodFilter(p);
    const now = new Date();
    if (p === 'all') { setStartDate(''); setEndDate(''); }
    else if (p === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(adToBsStr(start)); setEndDate(adToBsStr(now));
    } else if (p === 'quarterly') {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      setStartDate(adToBsStr(start)); setEndDate(adToBsStr(now));
    }
  };

  const onStartChange = (val) => { setStartDate(val); setPeriodFilter('date'); };
  const onEndChange = (val) => { setEndDate(val); setPeriodFilter('date'); };
  const clearFilters = () => { setStartDate(''); setEndDate(''); setBankFilter(''); setPeriodFilter('all'); };

  const periodBtn = (p, label) => (
    <button
      type="button"
      className="btn btn-sm"
      style={periodFilter === p ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } : {}}
      onClick={() => applyPeriod(p)}
    >{label}</button>
  );

  const emptyLine = () => ({ account: '', debit: 0, credit: 0, subLedger: { customer: '', supplier: '' } });
  const resetForm = () => { setSubmitted(false); setForm({ date: adToBsStr(new Date()), reference: '', description: '', lines: [emptyLine()] }); };

  const addLine = () => setForm({ ...form, lines: [...form.lines, emptyLine()] });
  const removeLine = (idx) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  const updateLine = (idx, field, value) => {
    const lines = [...form.lines];
    if (field === 'account') {
      lines[idx].account = value;
      lines[idx].subLedger = { customer: '', supplier: '' };
    } else if (field === 'customer' || field === 'supplier') {
      lines[idx].subLedger = { ...lines[idx].subLedger, [field]: value };
    } else {
      lines[idx][field] = parseFloat(value) || 0;
    }
    setForm({ ...form, lines });
  };

  const totalDebit = form.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = form.lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) <= 0.01 && totalDebit > 0;
  const mitiStr = form.date ? (() => {
    try {
      const parts = form.date.split('-');
      if (parts.length === 3) return `${parts[0]}/${parts[1]}/${parts[2]}`;
      return '';
    } catch { return ''; }
  })() : '';
  const accOf = (id) => accounts.find(a => a._id === id);
  const isControl = (acc) => acc && (acc.code === '10300' || acc.code === '20100');
  const controlMissing = form.lines.some(l => {
    const a = accOf(l.account);
    return isControl(a) && !l.subLedger.customer && !l.subLedger.supplier;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!balanced) { addToast('Debit and credit totals must be equal', 'error'); return; }
    if (controlMissing) { addToast('Sundry Debtors/Creditors lines require a customer/vendor reference', 'error'); return; }
    setPosting(true);
    try {
      const payload = {
        ...form,
        date: bsToADStr(form.date),
        lines: form.lines.map(l => ({
          account: l.account, debit: l.debit, credit: l.credit,
          subLedger: { customer: l.subLedger.customer || null, supplier: l.subLedger.supplier || null },
        })),
      };
      if (editing) {
        await api.put(`/journal-entries/${editing}`, payload);
        addToast('Journal entry updated', 'success');
      } else {
        await api.post('/journal-entries', payload);
        addToast('Journal entry posted', 'success');
      }
      resetForm();
      setEditing(null);
      setShowForm(false);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Error saving journal entry', 'error'); }
    setPosting(false);
  };

  const startEdit = (e) => {
    setForm({
      date: e.date ? adToBsStr(e.date) : adToBsStr(new Date()),
      reference: e.reference || '',
      description: e.description,
      lines: (e.lines || []).map(l => ({
        account: l.account?._id || l.account,
        debit: l.debit,
        credit: l.credit,
        subLedger: {
          customer: l.subLedger?.customer?._id || l.subLedger?.customer || '',
          supplier: l.subLedger?.supplier?._id || l.subLedger?.supplier || '',
        },
      })),
    });
    setEditing(e._id);
    setDetailsId(null);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!(await showConfirm('Delete this journal entry? Its ledger effect will be reversed.', { danger: true }))) return;
    try {
      await api.delete(`/journal-entries/${id}`);
      addToast('Journal entry deleted', 'success');
      setDetailsId(null);
      load();
    } catch (err) { addToast(err.response?.data?.message || 'Error deleting journal entry', 'error'); }
  };

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const displayedEntries = newestFirst
    ? entries.slice().sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))
    : entries.slice().sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

  return (
    <div>
      <div className="page-header">
        <h2>Journal Entries</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {periodBtn('all', 'All')}
            {periodBtn('monthly', 'Monthly')}
            {periodBtn('quarterly', 'Quarterly')}
            {periodBtn('date', 'Date')}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <NepaliDatePicker value={startDate} onChange={onStartChange} placeholder="From" />
            <NepaliDatePicker value={endDate} onChange={onEndChange} placeholder="To" />
          </div>
          <select value={bankFilter} onChange={e => setBankFilter(e.target.value)} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}>
            <option value="">All Banks</option>
            {banks.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          {(startDate || endDate || bankFilter || periodFilter !== 'all') && <button className="btn btn-sm btn-secondary" onClick={clearFilters}>Clear</button>}
          <DownloadBtn endpoint="journal" label="Excel" type="excel" filename="journal_entries" params={{ excludeSource: 'MONTH_END' }} />
          <DownloadBtn endpoint="journal" label="PDF" type="pdf" filename="journal_entries" params={{ excludeSource: 'MONTH_END' }} />
           <button className="btn btn-sm btn-secondary" onClick={printJournal}>Print</button>
           <button className="btn btn-sm btn-secondary" onClick={() => setNewestFirst(s => !s)}>{newestFirst ? 'Show Oldest' : 'Show Latest'}</button>
           <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'New Entry'}</button>
        </div>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card form-card">
          <h3>{editing ? 'Edit Journal Entry' : 'New Journal Entry'}</h3>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-group"><label>Date</label><NepaliDatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} /></div>
            <div className="form-group"><label>Miti (Nepali)</label><div className="miti-display">{mitiStr || '-'}</div></div>
            <div className="form-group"><label>Reference</label><input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
          <table className="table">
            <thead><tr><th>Account</th><th>Sub-Ledger (Debtors/Creditors)</th><th>Debit (Rs.)</th><th>Credit (Rs.)</th><th></th></tr></thead>
            <tbody>
              {form.lines.map((line, i) => {
                const acc = accOf(line.account);
                const control = isControl(acc);
                return (
                  <tr key={i}>
                    <td>
                      <SearchableSelect
                        options={accounts.map(a => ({ value: a._id, label: `${a.code} - ${a.name}` }))}
                        value={line.account}
                        onChange={v => updateLine(i, 'account', v)}
                        required
                        placeholder="Search account..."
                      />
                      {acc && <small className="text-muted">Balance {formatNPR(acc.balance)} ({acc.category})</small>}
                    </td>
                    <td>
                      {control && acc.code === '10300' ? (
                        <SearchableSelect
                          options={customers.map(c => ({ value: c._id, label: c.name }))}
                          value={line.subLedger.customer}
                          onChange={v => updateLine(i, 'customer', v)}
                          placeholder="Select customer..."
                        />
                      ) : control && acc.code === '20100' ? (
                        <SearchableSelect
                          options={suppliers.map(s => ({ value: s._id, label: s.name }))}
                          value={line.subLedger.supplier}
                          onChange={v => updateLine(i, 'supplier', v)}
                          placeholder="Select supplier..."
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td><input type="number" step="0.01" min="0" value={line.debit} onChange={e => updateLine(i, 'debit', e.target.value)} /></td>
                    <td><input type="number" step="0.01" min="0" value={line.credit} onChange={e => updateLine(i, 'credit', e.target.value)} /></td>
                    <td><button type="button" className="btn btn-sm btn-danger" onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td><button type="button" className="btn btn-sm" onClick={addLine}>+ Add Line</button></td>
                <td></td>
                <td><strong>{formatNPR(totalDebit)}</strong></td>
                <td><strong>{formatNPR(totalCredit)}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <button type="submit" className="btn btn-primary" disabled={!balanced || controlMissing || posting}>{posting ? 'Saving...' : (editing ? 'Update Entry' : 'Post Entry')}</button>
        </form>
      )}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th>Accounts</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th>By</th><th></th></tr></thead>
            <tbody>
              {displayedEntries.map(e => {
                const td = e.lines.reduce((s, l) => s + l.debit, 0);
                const tc = e.lines.reduce((s, l) => s + l.credit, 0);
                const accNames = (e.lines || []).map(l => l.account ? `${l.account.code}` : '').filter(Boolean).join(', ');
                return (
                  <tr key={e._id} onClick={() => setDetailsId(e._id)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td>{e.reference || '-'}</td>
                    <td>{e.description}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accNames || '-'}</td>
                    <td className="text-right">{formatNPR(td)}</td>
                    <td className="text-right">{formatNPR(tc)}</td>
                    <td>{e.createdBy?.name || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={(ev) => { ev.stopPropagation(); setDetailsId(e._id); }}>View</button>
                        {isSuperAdmin && <button className="btn btn-sm btn-primary" onClick={(ev) => { ev.stopPropagation(); startEdit(e); }}>Edit</button>}
                        {isSuperAdmin && <button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); handleDelete(e._id); }}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedEntries.length === 0 && <tr><td colSpan="8" className="text-center">No journal entries</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {detailsId && (() => {
        const e = entries.find(x => x._id === detailsId);
        if (!e) return null;
        const lines = e.lines || [];
        return (
          <EntryDetailsModal
            title="Journal Entry Details"
            subtitle={e.description}
            meta={[
              { label: 'Date', value: new Date(e.date).toLocaleDateString('en-IN') },
              { label: 'Miti', value: e.miti || '-' },
              { label: 'Reference', value: e.reference || '-' },
              { label: 'Fiscal Year', value: e.fiscalYear ? `FY ${e.fiscalYear.slice(2, 4)}/${e.fiscalYear.slice(7, 9)}` : '-' },
              { label: 'Posted', value: e.isPosted ? 'Yes' : 'No' },
            ]}
            columns={[
              { key: 'account', label: 'Account', render: (v) => v ? `${v.code} - ${v.name}` : 'Deleted account' },
              { key: 'subLedger', label: 'Sub-Ledger', render: (v) => v?.customer?.name || v?.supplier?.name || '-' },
              { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
              { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? formatNPR(v) : '-' },
            ]}
            rows={lines}
            footer={[
              { label: 'Total Debit', value: formatNPR(lines.reduce((s, l) => s + l.debit, 0)) },
              { label: 'Total Credit', value: formatNPR(lines.reduce((s, l) => s + l.credit, 0)) },
            ]}
            actions={
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => startEdit(e)}>Edit Entry</button>
                <button className="btn btn-danger" onClick={() => handleDelete(e._id)}>Delete</button>
              </div>
            }
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
    </div>
  );
}

function TrialBalance() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);
  const [jeDetail, setJeDetail] = useState(null);
  const addToast = useToast();
  useEffect(() => {
    setLoading(true);
    api.get('/accounts/trial-balance').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const totalDebit = data.reduce((s, a) => s + a.debit, 0);
  const totalCredit = data.reduce((s, a) => s + a.credit, 0);

  const openLedger = async (acc) => {
    try {
      const { data: l } = await api.get(`/accounts/ledger/${acc._id}`);
      setLedger(l);
    } catch (err) {
      addToast('Failed to load ledger', 'error');
    }
  };

  if (loading) return <div className="text-center">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Trial Balance</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <DownloadBtn endpoint="trial-balance" label="Excel" type="excel" filename="trial_balance" />
          <DownloadBtn endpoint="trial-balance" label="PDF" type="pdf" filename="trial_balance" />
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const table = document.querySelector('.trial-balance-table');
            if (table) printHtmlDocument(table.outerHTML, 'Trial Balance');
          }}>Print</button>
        </div>
      </div>
      <div className="card">
        <table className="table trial-balance-table">
          <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit (Rs.)</th><th>Credit (Rs.)</th></tr></thead>
          <tbody>
            {data.filter(a => a.debit > 0 || a.credit > 0).map(a => (
              <tr key={a._id} onClick={() => openLedger(a)} style={{ cursor: 'pointer' }} title="Click to view transactions">
                <td>{a.code}</td><td>{a.name}</td><td>{a.type}</td>
                <td>{a.debit > 0 ? formatNPR(a.debit) : '-'}</td>
                <td>{a.credit > 0 ? formatNPR(a.credit) : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan="3"><strong>Total</strong></td>
              <td><strong>{formatNPR(totalDebit)}</strong></td>
              <td><strong>{formatNPR(totalCredit)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {ledger && (
        <EntryDetailsModal
          title="Account Transactions"
          subtitle={ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : ''}
          meta={[
            { label: 'Account', value: ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : '-' },
            { label: 'Type', value: ledger.account?.type || '-' },
            { label: 'Category', value: ledger.account?.category || '-' },
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
            try {
              const { data } = await api.get(`/journal-entries/${row._id}`);
              setJeDetail(data);
            } catch { addToast('Failed to load entry details', 'error'); }
          }}
          onClose={() => setLedger(null)}
        />
      )}
      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry Details"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: new Date(jeDetail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: jeDetail.reference || '-' },
            { label: 'Fiscal Year', value: jeDetail.fiscalYear || '-' },
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
    </div>
  );
}

function IncomeStatement() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fyName, setFyName] = useState('');
  const [ledger, setLedger] = useState(null);
  const [jeDetail, setJeDetail] = useState(null);
  const [drillItems, setDrillItems] = useState(null);
  const [drillTitle, setDrillTitle] = useState('');
  const addToast = useToast();
  useEffect(() => {
    api.get('/accounts/income-statement').then(r => setData(r.data)).finally(() => setLoading(false));
    api.get('/fiscal-years/active').then(r => { if (r.data) setFyName(r.data.name); }).catch(() => {});
  }, []);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const openLedger = async (accountId) => {
    try {
      const { data: l } = await api.get(`/accounts/ledger/${accountId}`);
      setLedger(l);
    } catch { addToast('Failed to load ledger', 'error'); }
  };

  const openDrill = (title, items) => {
    if (!items || items.length === 0) return;
    setDrillTitle(title);
    setDrillItems(items);
  };

  if (loading) return <div className="text-center">Loading...</div>;
  if (!data) return <div className="text-center">No data available</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Income Statement (Profit & Loss)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="fiscal-year">{fyName ? `F.Y. ${fyName}` : 'All Time'}</span>
          <DownloadBtn endpoint="income-statement" label="Excel" type="excel" filename="income_statement" />
          <DownloadBtn endpoint="income-statement" label="PDF" type="pdf" filename="income_statement" />
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const el = document.querySelector('.income-table');
            if (el) printHtmlDocument(el.outerHTML, 'Income Statement');
          }}>Print</button>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 600 }}>
        <table className="table income-table">
          <tbody>
            <tr className="section-header"><td colSpan="2"><strong>Revenue</strong></td></tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Revenue', data.revenueItems)} title="Click to view details">
              <td className="indent">Sales Revenue</td><td className="text-right">{formatNPR(data.revenue)}</td>
            </tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Sales Return / Discount', data.contraRevenueItems)} title="Click to view details">
              <td className="indent">Less: Sales Return/Discount</td><td className="text-right">({formatNPR(Math.abs(data.contraRevenue))})</td>
            </tr>
            <tr className="total-row"><td><strong>Net Revenue</strong></td><td className="text-right"><strong>{formatNPR(data.netRevenue)}</strong></td></tr>
            <tr className="section-header"><td colSpan="2"><strong>Cost of Goods Sold</strong></td></tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Cost of Goods Sold', data.cogsItems)} title="Click to view details">
              <td className="indent">COGS</td><td className="text-right">({formatNPR(data.cogs)})</td>
            </tr>
            <tr className="total-row"><td><strong>Gross Profit</strong></td><td className="text-right"><strong>{formatNPR(data.grossProfit)}</strong></td></tr>
            <tr className="section-header"><td colSpan="2"><strong>Operating Expenses</strong></td></tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Operating Expenses', data.expenseItems)} title="Click to view details">
              <td className="indent">Total Expenses</td><td className="text-right">({formatNPR(data.expenses)})</td>
            </tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Other Income', data.otherIncomeItems)} title="Click to view details">
              <td className="indent">Other Income</td><td className="text-right">{formatNPR(data.otherIncome)}</td>
            </tr>
            <tr className="total-row net-profit"><td><strong>Net Profit / (Loss)</strong></td><td className="text-right"><strong>{formatNPR(data.netProfit)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      {drillItems && drillItems.length > 0 && (
        <EntryDetailsModal
          title={drillTitle}
          subtitle="Account breakdown"
          meta={[]}
          columns={[
            { key: 'code', label: 'Code', render: (v) => v || '-' },
            { key: 'name', label: 'Account', wide: true },
            { key: 'balance', label: 'Amount', align: 'right', render: (v) => formatNPR(Math.abs(v || 0)) },
          ]}
          rows={drillItems}
          onRowClick={async (row) => {
            if (!row?._id) return;
            setDrillItems(null);
            await openLedger(row._id);
          }}
          onClose={() => setDrillItems(null)}
        />
      )}
      {ledger && (
        <EntryDetailsModal
          title="Account Transactions"
          subtitle={ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : ''}
          meta={[
            { label: 'Account', value: ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : '-' },
            { label: 'Type', value: ledger.account?.type || '-' },
            { label: 'Category', value: ledger.account?.category || '-' },
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
            try {
              const { data } = await api.get(`/journal-entries/${row._id}`);
              setLedger(null);
              setJeDetail(data);
            } catch { addToast('Failed to load entry details', 'error'); }
          }}
          onClose={() => setLedger(null)}
        />
      )}
      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry Details"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: new Date(jeDetail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: jeDetail.reference || '-' },
            { label: 'Fiscal Year', value: jeDetail.fiscalYear || '-' },
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
    </div>
  );
}

function BalanceSheet() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fyName, setFyName] = useState('');
  const [ledger, setLedger] = useState(null);
  const [jeDetail, setJeDetail] = useState(null);
  const [dateFilter, setDateFilter] = useState('');
  const [drillItems, setDrillItems] = useState(null);
  const [drillTitle, setDrillTitle] = useState('');
  const addToast = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFilter) params.asOf = dateFilter;
      const [sheetRes, fyRes] = await Promise.all([
        api.get('/accounts/balance-sheet', { params }),
        api.get('/fiscal-years/active').catch(() => null),
      ]);
      setData(sheetRes.data);
      if (fyRes?.data) setFyName(fyRes.data.name);
    } catch (err) {
      addToast('Failed to load balance sheet', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '-';

  const openLedger = async (accountId) => {
    try {
      const { data: l } = await api.get(`/accounts/ledger/${accountId}`);
      setLedger(l);
    } catch { addToast('Failed to load ledger', 'error'); }
  };

  const openDrill = (title, items) => {
    if (!items || items.length === 0) return;
    const parentPrefixes = { '103': '10300', '201': '20100', '203': '20300' };
    const grouped = new Map();
    const others = [];
    items.forEach(item => {
      if (item.code) {
        const prefix = item.code.slice(0, 3);
        if (parentPrefixes[prefix]) {
          const parentCode = parentPrefixes[prefix];
          if (!grouped.has(parentCode)) {
            grouped.set(parentCode, { code: parentCode, name: '', balance: 0, _id: item._id, children: [] });
          }
          const g = grouped.get(parentCode);
          g.balance += item.balance || 0;
          g.children.push(item);
          if (!g.name) g.name = item.name.replace(/ -.*/, '');
        } else {
          others.push(item);
        }
      } else {
        others.push(item);
      }
    });
    const result = [...others, ...Array.from(grouped.values())].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    setDrillTitle(title);
    setDrillItems(result);
  };

  if (loading) return <div className="page-container"><p>Loading...</p></div>;
  if (!data) return <div className="page-container"><p>Failed to load balance sheet.</p></div>;

  const totalEquityWithIncome = (data.equity || 0) + (data.netIncome || 0);

  return (
    <div>
      <div className="page-header">
        <h2>Balance Sheet</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#64748b' }}>As of:</label>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
            <button className="btn btn-sm btn-secondary" onClick={loadData}>Go</button>
            {dateFilter && <button className="btn btn-sm btn-secondary" onClick={() => { setDateFilter(''); setTimeout(loadData, 0); }}>Clear</button>}
          </div>
          <span className="fiscal-year">{fyName ? `FY: ${fyName}` : ''}</span>
          <DownloadBtn endpoint="balance-sheet" label="Excel" type="excel" filename="balance_sheet" />
          <DownloadBtn endpoint="balance-sheet" label="PDF" type="pdf" filename="balance_sheet" />
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const el = document.querySelector('.income-table');
            if (el) printHtmlDocument(el.outerHTML, 'Balance Sheet');
          }}>Print</button>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 650 }}>
        <table className="table income-table">
          <tbody>
            <tr className="section-header"><td colSpan="2"><strong>Assets</strong></td></tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Current Assets', data.currentAssetsItems)} title="Click to view details">
              <td className="indent">Current Assets</td><td className="text-right">{formatNPR(data.currentAssets)}</td>
            </tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Fixed Assets', data.fixedAssetsItems)} title="Click to view details">
              <td className="indent">Fixed Assets</td><td className="text-right">{formatNPR(data.fixedAssets)}</td>
            </tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Accumulated Depreciation', data.contraAssetsItems)} title="Click to view details">
              <td className="indent">Less: Accumulated Depreciation</td><td className="text-right">({formatNPR(data.contraAssets)})</td>
            </tr>
            <tr className="total-row"><td><strong>Total Assets</strong></td><td className="text-right"><strong>{formatNPR(data.totalAssets)}</strong></td></tr>

            <tr className="section-header"><td colSpan="2"><strong>Liabilities & Equity</strong></td></tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Current Liabilities', data.currentLiabilitiesItems)} title="Click to view details">
              <td className="indent">Current Liabilities</td><td className="text-right">{formatNPR(data.currentLiabilities)}</td>
            </tr>
            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Long-term Liabilities', data.longTermLiabilitiesItems)} title="Click to view details">
              <td className="indent">Long-term Liabilities</td><td className="text-right">{formatNPR(data.longTermLiabilities)}</td>
            </tr>
            <tr className="total-row"><td><strong>Total Liabilities</strong></td><td className="text-right"><strong>{formatNPR(data.totalLiabilities)}</strong></td></tr>

            <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Equity', data.equityItems)} title="Click to view details">
              <td className="indent">Equity</td><td className="text-right">{formatNPR(data.equity)}</td>
            </tr>
            {data.netIncome !== 0 && (
              <tr style={{ cursor: 'pointer' }} onClick={() => openDrill('Net Income', data.netIncomeItems)} title="Click to view details">
                <td className="indent" style={{ color: data.netIncome >= 0 ? '#16a34a' : '#dc2626' }}>Net Income (Current Period)</td>
                <td className="text-right" style={{ color: data.netIncome >= 0 ? '#16a34a' : '#dc2626' }}>{formatNPR(data.netIncome)}</td>
              </tr>
            )}
            <tr className="total-row"><td><strong>Total Equity</strong></td><td className="text-right"><strong>{formatNPR(totalEquityWithIncome)}</strong></td></tr>
            <tr className="total-row"><td><strong>Total Liabilities & Equity</strong></td><td className="text-right"><strong>{formatNPR(data.totalLiabilities + totalEquityWithIncome)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      {drillItems && drillItems.length > 0 && (
        <EntryDetailsModal
          title={drillTitle}
          subtitle="Click an account to view transactions"
          meta={[]}
          columns={[
            { key: 'code', label: 'Code', render: (v) => v || '-' },
            { key: 'name', label: 'Account', wide: true },
            { key: 'balance', label: 'Amount', align: 'right', render: (v) => formatNPR(Math.abs(v || 0)) },
          ]}
          rows={drillItems}
          onRowClick={async (row) => {
            if (!row?._id) return;
            if (row.children && row.children.length > 0) {
              setDrillItems(null);
              setTimeout(() => {
                setDrillTitle(row.name);
                setDrillItems(row.children);
              }, 100);
            } else {
              setDrillItems(null);
              await openLedger(row._id);
            }
          }}
          onClose={() => setDrillItems(null)}
        />
      )}
      {ledger && (
        <EntryDetailsModal
          title="Account Transactions"
          subtitle={ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : ''}
          meta={[
            { label: 'Account', value: ledger.account ? `${ledger.account.code} - ${ledger.account.name}` : '-' },
            { label: 'Type', value: ledger.account?.type || '-' },
            { label: 'Category', value: ledger.account?.category || '-' },
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
            try {
              const { data } = await api.get(`/journal-entries/${row._id}`);
              setLedger(null);
              setJeDetail(data);
            } catch { addToast('Failed to load entry details', 'error'); }
          }}
          onClose={() => setLedger(null)}
        />
      )}
      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry Details"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: new Date(jeDetail.date).toLocaleDateString('en-IN') },
            { label: 'Reference', value: jeDetail.reference || '-' },
            { label: 'Fiscal Year', value: jeDetail.fiscalYear || '-' },
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
    </div>
  );
}

function PurchasesView() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsId, setDetailsId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const addToast = useToast();

  const load = () => {
    const params = {};
    if (startDate) params.startDate = bsToADStr(startDate);
    if (endDate) params.endDate = bsToADStr(endDate);
    setLoading(true);
    api.get('/purchases', { params })
      .then(r => setPurchases(r.data.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))))
      .catch(err => addToast(err.response?.data?.message || 'Failed to load purchases', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [startDate, endDate]);

  const formatNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const statusLabel = { received: 'Received', pending: 'Pending', cancelled: 'Cancelled' };
  const statusBadge = (p) => {
    if (p.status === 'cancelled') return <span className="badge badge-danger">Cancelled</span>;
    if (p.dueAmount > 0 && p.paidAmount > 0) return <span className="badge badge-warning">Partial</span>;
    if (p.dueAmount > 0) return <span className="badge badge-danger">Due</span>;
    return <span className="badge badge-success">Paid</span>;
  };

  const totals = purchases.reduce((s, p) => ({
    grand: s.grand + (p.grandTotal || 0),
    tax: s.tax + (p.tax || 0),
    tds: s.tds + (p.tds || 0),
    paid: s.paid + (p.paidAmount || 0),
    due: s.due + (p.dueAmount || 0),
  }), { grand: 0, tax: 0, tds: 0, paid: 0, due: 0 });

  const hasVat = totals.tax > 0;
  const hasTds = totals.tds > 0;
  const colCount = 6 + (hasVat ? 1 : 0) + (hasTds ? 1 : 0) + 3;

  if (loading) return <div className="text-center">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>Purchases (Accounts)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <NepaliDatePicker value={startDate} onChange={val => setStartDate(val)} placeholder="From" />
            <NepaliDatePicker value={endDate} onChange={val => setEndDate(val)} placeholder="To" />
          </div>
          {(startDate || endDate) && <button className="btn btn-sm btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); }}>Clear</button>}
          <DownloadBtn endpoint="purchases" label="PDF" type="pdf" filename="purchases" />
          <button className="btn btn-sm btn-secondary" onClick={() => {
            const el = document.querySelector('.table-responsive table');
            if (el) printHtmlDocument(el.outerHTML, 'Purchases');
          }}>Print</button>
        </div>
      </div>
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead><tr>
              <th>Date</th><th>Purchase No</th><th>Supplier</th><th>Items</th>
              <th className="text-right">Subtotal</th>
              {hasVat && <th className="text-right">VAT</th>}
              {hasTds && <th className="text-right">TDS</th>}
              <th className="text-right">Grand Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th>
            </tr></thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p._id} onClick={() => setDetailsId(p._id)} style={{ cursor: 'pointer' }}>
                  <td>{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  <td>{p.purchaseNumber}</td>
                  <td>{p.supplier?.name || '-'}</td>
                  <td>{p.items?.length || 0}</td>
                  <td className="text-right">{formatNPR(p.subtotal)}</td>
                  {hasVat && <td className="text-right">{formatNPR(p.tax)}</td>}
                  {hasTds && <td className="text-right">{formatNPR(p.tds)}</td>}
                  <td className="text-right">{formatNPR(p.grandTotal)}</td>
                  <td className="text-right">{formatNPR(p.paidAmount)}</td>
                  <td className="text-right">{formatNPR(p.dueAmount)}</td>
                  <td>{statusBadge(p)}</td>
                </tr>
              ))}
              {purchases.length === 0 && <tr><td colSpan={colCount} className="text-center">No purchases found</td></tr>}
            </tbody>
            {purchases.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="4"><strong>Total</strong></td>
                  <td className="text-right"><strong>{formatNPR(totals.grand)}</strong></td>
                  {hasVat && <td className="text-right"><strong>{formatNPR(totals.tax)}</strong></td>}
                  {hasTds && <td className="text-right"><strong>{formatNPR(totals.tds)}</strong></td>}
                  <td className="text-right"><strong>{formatNPR(totals.grand)}</strong></td>
                  <td className="text-right"><strong>{formatNPR(totals.paid)}</strong></td>
                  <td className="text-right"><strong>{formatNPR(totals.due)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {detailsId && (() => {
        const p = purchases.find(x => x._id === detailsId);
        if (!p) return null;
        return (
          <EntryDetailsModal
            title="Purchase Details"
            subtitle={p.purchaseNumber}
            meta={[
              { label: 'Date', value: new Date(p.date).toLocaleDateString('en-IN') },
              { label: 'Supplier', value: p.supplier?.name || '-' },
              { label: 'Status', value: statusLabel[p.status] || p.status },
              { label: 'Method', value: p.paymentMethod === 'bank' ? 'Bank (Cheque)' : (p.paymentMethod === 'cash' ? 'Cash' : p.paymentMethod || '-') },
            ]}
            columns={[
              { key: 'name', label: 'Item' },
              { key: 'quantity', label: 'Qty', align: 'right' },
              { key: 'costPrice', label: 'Rate', align: 'right', render: (v) => formatNPR(v || 0) },
              { key: 'subtotal', label: 'Amount', align: 'right', render: (v) => formatNPR(v || 0) },
            ]}
            rows={(p.items || []).map(it => ({ name: it.product?.name || '(deleted item)', quantity: it.quantity, costPrice: it.costPrice, subtotal: it.subtotal }))}
            footer={[
              { label: 'Subtotal', value: formatNPR(p.subtotal) },
              ...(hasVat ? [{ label: 'VAT', value: formatNPR(p.tax) }] : []),
              ...(hasTds ? [{ label: 'TDS', value: formatNPR(p.tds) }] : []),
              { label: 'Grand Total', value: formatNPR(p.grandTotal) },
              { label: 'Paid', value: formatNPR(p.paidAmount) },
              { label: 'Due', value: formatNPR(p.dueAmount) },
            ]}
            onClose={() => setDetailsId(null)}
          />
        );
      })()}
    </div>
  );
}

export default function AccountsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { path: '/accounts', label: 'Chart of Accounts' },
    { path: '/accounts/banks', label: 'Banks' },
    { path: '/accounts/journal-entries', label: 'Journal Entries' },
    { path: '/accounts/purchases', label: 'Purchases' },
    { path: '/accounts/trial-balance', label: 'Trial Balance' },
    { path: '/accounts/income-statement', label: 'Income Statement' },
    { path: '/accounts/balance-sheet', label: 'Balance Sheet' },
    { path: '/accounts/daybook', label: 'Daybook' },
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.path} className={`tab ${location.pathname === t.path ? 'active' : ''}`}
            onClick={() => navigate(t.path)}>{t.label}</button>
        ))}
      </div>
      <div style={{ padding: '1rem 0' }}>
        <Routes>
          <Route index element={<ChartOfAccounts />} />
          <Route path="banks" element={<Banks />} />
          <Route path="journal-entries" element={<JournalEntryList />} />
          <Route path="purchases" element={<PurchasesView />} />
          <Route path="trial-balance" element={<TrialBalance />} />
          <Route path="income-statement" element={<IncomeStatement />} />
          <Route path="balance-sheet" element={<BalanceSheet />} />
        </Routes>
      </div>
    </div>
  );
}
