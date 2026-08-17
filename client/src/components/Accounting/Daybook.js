import React, { useState, useEffect } from 'react';
import api from '../../api';
import { escapeHtml } from '../UI/printEntry';
import { printHtmlDocument } from '../UI/printCommon';
import { useToast } from '../UI/Toast';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import EntryDetailsModal from '../UI/EntryDetailsModal';

const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const MODULE_LABELS = {
  SALES_INVOICE: 'Sales Invoice', PURCHASE_INVOICE: 'Purchase Invoice', PAYMENT_IN: 'Payment In', PAYMENT_OUT: 'Payment Out', SALES_RETURN: 'Sales Return', DEBIT_NOTE: 'Debit Note', CREDIT_NOTE: 'Credit Note', FIXED_ASSET: 'Fixed Asset', DEPRECIATION: 'Depreciation',
};

const MODULE_COLORS = {
  SALES_INVOICE: '#2563eb', PURCHASE_INVOICE: '#059669', PAYMENT_IN: '#0d9488', PAYMENT_OUT: '#d97706', SALES_RETURN: '#db2777', DEBIT_NOTE: '#dc2626', CREDIT_NOTE: '#7c3aed', FIXED_ASSET: '#6366f1', DEPRECIATION: '#8b5cf6',
};

const DAYBOOK_TABS = [
  { key: 'ALL', label: 'All Entries', icon: '📚' },
  { key: 'CASH_BOOK', label: 'Cash Book', icon: '💵' },
  { key: 'SALES_BOOK', label: 'Sales Book', icon: '🧾' },
  { key: 'PURCHASES_BOOK', label: 'Purchases Book', icon: '📦' },
  { key: 'SALES_RETURNS', label: 'Sales Returns', icon: '↩️' },
  { key: 'PURCHASE_RETURNS', label: 'Purchase Returns', icon: '🔄' },
  { key: 'GENERAL_JOURNAL', label: 'General Journal', icon: '📝' },
];

export default function Daybook() {
  const today = adToBsStr(new Date());
  const [mode, setMode] = useState('date');
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [tabData, setTabData] = useState({});
  const [activeTab, setActiveTab] = useState('ALL');
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [isDayBookClosed, setIsDayBookClosed] = useState(false);
  const [closedDates, setClosedDates] = useState([]);
  const addToast = useToast();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const company = user?.company || {};
  const currencySymbol = company.currencySymbol || 'Rs. ';

  const buildParams = (daybookType) => {
    const p = {};
    if (daybookType && daybookType !== 'ALL') p.daybookType = daybookType;
    if (mode === 'date' && date) p.date = bsToADStr(date);
    else if (mode === 'range') { if (from) p.from = bsToADStr(from); if (to) p.to = bsToADStr(to); }
    return p;
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const allRes = await api.get('/daybook', { params: buildParams() });
      setReport(allRes.data);

      const tabs = {};
      for (const tab of DAYBOOK_TABS) {
        if (tab.key === 'ALL') { tabs['ALL'] = allRes.data; continue; }
        try {
          const res = await api.get('/daybook', { params: buildParams(tab.key) });
          tabs[tab.key] = res.data;
        } catch { tabs[tab.key] = { entries: [], summary: { totalDebit: 0, totalCredit: 0, cancelled: 0 } }; }
      }
      setTabData(tabs);

      try {
        const closuresRes = await api.get('/daybook-closures');
        const closures = closuresRes.data || [];
        setClosedDates(closures);
        const selectedAD = bsToADStr(date);
        setIsDayBookClosed(closures.some(c => {
          const cd = new Date(c.closedDate);
          const ds = new Date(selectedAD);
          return cd.getFullYear() === ds.getFullYear() && cd.getMonth() === ds.getMonth() && cd.getDate() === ds.getDate();
        }));
      } catch {}
    } catch (err) { addToast(err.response?.data?.message || 'Failed to load daybook', 'error'); }
    setLoading(false);
  };

  const loadAudit = async () => {
    try {
      const p = {};
      if (mode === 'date' && date) { p.from = bsToADStr(date); p.to = bsToADStr(date); }
      else if (mode === 'range') { if (from) p.from = bsToADStr(from); if (to) p.to = bsToADStr(to); }
      const { data } = await api.get('/audit', { params: p });
      setAudit(data || []);
    } catch {}
  };

  useEffect(() => { loadAll(); loadAudit(); }, []);

  const handleDateChange = () => { loadAll(); loadAudit(); };

  const toggleDayBookClose = async () => {
    const selectedAD = bsToADStr(date);
    try {
      if (isDayBookClosed) {
        await api.delete('/daybook-closures/' + selectedAD);
        addToast('Daybook reopened for ' + date, 'success');
      } else {
        await api.post('/daybook-closures', { date: selectedAD });
        addToast('Daybook closed for ' + date, 'success');
      }
      loadAll();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update daybook status', 'error');
    }
  };

  const verifyChain = async () => {
    try {
      const { data } = await api.get('/audit/verify');
      setVerifyResult(data);
      addToast(data.valid ? 'Audit chain intact' : `Chain broken at ${data.broken.length} record(s)`, data.valid ? 'success' : 'error');
    } catch { addToast('Chain verification failed', 'error'); }
  };

  const currentData = tabData[activeTab] || report || {};
  const entries = currentData.entries || [];
  const summary = currentData.summary || {};

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Day Book</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0' }}>Chronological ledger with tamper-evident IRD audit trail</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => {
            const el = document.querySelector('.table-responsive table');
            if (el) printHtmlDocument(el.outerHTML, 'Day Book');
          }}>Print</button>
          <button className="btn btn-secondary" onClick={verifyChain}>Verify Chain</button>
          {isDayBookClosed ? <button className="btn btn-secondary" onClick={toggleDayBookClose}>Reopen Day Book</button> : <button className="btn btn-danger" onClick={toggleDayBookClose}>Close Day Book</button>}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', marginBottom: '1rem', padding: '0.9rem 1rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>View</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="date">Single Date</option>
            <option value="range">Date Range</option>
          </select>
        </div>
        {mode === 'date' ? (
          <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>Date</label><NepaliDatePicker value={date} onChange={setDate} /></div>
        ) : (
          <>
            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>From</label><NepaliDatePicker value={from} onChange={setFrom} /></div>
            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>To</label><NepaliDatePicker value={to} onChange={setTo} /></div>
          </>
        )}
        <button className="btn btn-primary" onClick={handleDateChange} disabled={loading}>{loading ? 'Loading...' : 'Load'}</button>
        <button className="btn btn-secondary" onClick={() => { setDate(''); setFrom(''); setTo(''); handleDateChange(); }}>All</button>
      </div>

      {verifyResult && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderLeft: verifyResult.valid ? '4px solid #16a34a' : '4px solid #dc2626' }}>
          <strong style={{ color: verifyResult.valid ? '#166534' : '#991b1b' }}>{verifyResult.valid ? 'Audit chain verified' : `Chain broken at ${verifyResult.broken.length} record(s)`}</strong>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: '1rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        {DAYBOOK_TABS.map(tab => {
          const count = (tabData[tab.key]?.entries || []).length;
          return (
            <button key={tab.key} className={`tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>{tab.icon}</span> {tab.label}
              {count > 0 && <span style={{ fontSize: '0.7rem', background: activeTab === tab.key ? '#fff' : '#e2e8f0', borderRadius: 999, padding: '0.1rem 0.4rem' }}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="report-summary" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="summary-card" style={{ borderTop: '3px solid #0f172a' }}><div className="summary-label">Entries</div><div className="summary-value">{entries.length}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #2563eb' }}><div className="summary-label">Total Debit</div><div className="summary-value">{currencySymbol}{fmt(summary.totalDebit)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #7c3aed' }}><div className="summary-label">Total Credit</div><div className="summary-value">{currencySymbol}{fmt(summary.totalCredit)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid ' + ((summary.netFlow || 0) >= 0 ? '#059669' : '#dc2626') }}><div className="summary-label">Net Flow</div><div className="summary-value">{currencySymbol}{fmt(summary.netFlow || 0)}</div></div>
        <div className="summary-card" style={{ borderTop: '3px solid #d97706' }}><div className="summary-label">Cancelled</div><div className="summary-value">{summary.cancelled || 0}</div></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <strong>{DAYBOOK_TABS.find(t => t.key === activeTab)?.label || 'All Entries'}</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries(summary.modules || {}).filter(([, amt]) => Math.abs(amt) > 0.001).map(([mod, amt]) => (
              <span key={mod} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 600, color: MODULE_COLORS[mod] || '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '0.25rem 0.6rem' }}>
                {MODULE_LABELS[mod] || mod} · {currencySymbol}{fmt(Math.abs(amt))}
              </span>
            ))}
          </div>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Entry No</th><th>Date (AD / BS)</th><th>Voucher No</th><th>Particulars</th><th>Module</th>
                <th className="text-right">Debit</th><th className="text-right">Credit</th><th>Type</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="9">Loading...</td></tr>
                : entries.length === 0 ? <tr><td colSpan="9" className="text-center">No daybook entries for this period</td></tr>
                : entries.map(e => (
                  <tr key={e._id} className={e.status === 'CANCELLED' ? 'row-muted' : ''} style={{ cursor: isDayBookClosed && e.status === 'CLOSED' ? 'default' : 'pointer' }} onClick={async () => {
                    if (!e.journalEntryId) return;
                    if (isDayBookClosed && e.status === 'CLOSED') {
                      addToast('Day Book is closed for this date. New entries will be auto-registered for the next day.', 'warning');
                      setDate(adToBsStr(new Date(new Date().setDate(new Date().getDate() + 1))));
                      return;
                    }
                    try { const { data } = await api.get('/journal-entries/' + e.journalEntryId); setDetailEntry(data); } catch { setDetailEntry(null); }
                  }}>
                    <td style={{ fontWeight: 600 }}>{e.entryNumber}</td>
                    <td>{e.dateAD} <small className="text-muted">{e.miti}</small></td>
                    <td>{e.documentNumber}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      <div>{e.accountName || '-'}{e.partyName ? ` (${e.partyName})` : ''}</div>
                      <small className="text-muted">{e.narration}</small>
                    </td>
                    <td><span className="badge badge-info">{MODULE_LABELS[e.sourceModule] || e.sourceModule}</span></td>
                    <td className="text-right">{e.debit ? currencySymbol + fmt(e.debit) : ''}</td>
                    <td className="text-right">{e.credit ? currencySymbol + fmt(e.credit) : ''}</td>
                    <td>{e.entryType === 'REVERSAL' ? <span className="badge badge-warning">REVERSAL</span> : <span className="badge badge-success">ORIGINAL</span>}</td>
                    <td>{e.status === 'CANCELLED' ? <span className="badge badge-danger">CANCELLED</span> : <span className="badge badge-success">POSTED</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.6rem' }}>
          <strong>IRD Activity Audit Log</strong>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{audit.length} event(s)</span>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead><tr><th>Time</th><th>Action</th><th>Module</th><th>Document</th><th>User</th><th>Hash</th></tr></thead>
            <tbody>
              {audit.length === 0 ? <tr><td colSpan="6" className="text-center text-muted">No audit events yet.</td></tr>
                : audit.map((a) => (
                  <tr key={a._id}>
                    <td>{new Date(a.actionTimestamp).toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${a.actionType === 'INSERT' ? 'badge-success' : a.actionType === 'CANCEL' ? 'badge-danger' : a.actionType === 'PRINT' ? 'badge-info' : 'badge-warning'}`}>{a.actionType}</span></td>
                    <td>{a.moduleName}</td>
                    <td>{a.documentNumber}</td>
                    <td>{a.userName || a.userId?.name || '-'}</td>
                    <td style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.currentHash}>{a.currentHash ? a.currentHash.slice(0, 24) + '...' : '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailEntry && (
        <EntryDetailsModal
          title="Journal Entry"
          subtitle={detailEntry.reference || ''}
          meta={[
            { label: 'Date', value: detailEntry.date ? new Date(detailEntry.date).toLocaleDateString('en-IN') : '-' },
            { label: 'Reference', value: detailEntry.reference || '-' },
            { label: 'Description', value: detailEntry.description || '-' },
          ]}
          columns={[
            { key: 'account', label: 'Account', render: (v) => v ? `${v.code || ''} - ${v.name || ''}` : '-' },
            { key: 'debit', label: 'Debit', align: 'right', render: (v) => v > 0 ? currencySymbol + fmt(v) : '-' },
            { key: 'credit', label: 'Credit', align: 'right', render: (v) => v > 0 ? currencySymbol + fmt(v) : '-' },
          ]}
          rows={detailEntry.lines || []}
          footer={[
            { label: 'Total Debit', value: currencySymbol + fmt(detailEntry.lines?.reduce((s, l) => s + (l.debit || 0), 0)) },
            { label: 'Total Credit', value: currencySymbol + fmt(detailEntry.lines?.reduce((s, l) => s + (l.credit || 0), 0)) },
          ]}
          onClose={() => setDetailEntry(null)}
        />
      )}
    </div>
  );
}
