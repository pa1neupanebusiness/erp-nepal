import React, { useState, useEffect } from 'react';
import { useToast } from '../UI/Toast';
import SearchableSelect from '../UI/SearchableSelect';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import api from '../../api';
import { useFiscalYear } from '../../context/FiscalYearContext';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';
import { printLedger } from '../UI/printLedger';

function formatNPR(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN');
}

function LedgerHeader({ accountName, startDate, endDate, fiscalYear }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const companyName = user.company?.name || '';
  return (
    <div className="report-header" style={{ textAlign: 'center', marginBottom: '1rem', display: 'none' }}>
      <h2 style={{ margin: 0 }}>{companyName}</h2>
      <p style={{ margin: '0.25rem 0' }}>Detailed Ledger - {accountName}</p>
      <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
        {startDate && endDate
          ? `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`
          : 'Period: All Time'}
        {fiscalYear ? ` | F.Y. ${fiscalYear}` : ''}
      </p>
    </div>
  );
}

export default function LedgerView() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { selectedYear, fiscalYears } = useFiscalYear();
  const [selectedFy, setSelectedFy] = useState(selectedYear?._id || '');
  const [viewMode, setViewMode] = useState('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const [jeDetail, setJeDetail] = useState(null);
  const [jeLoading, setJeLoading] = useState(false);
  const addToast = useToast();

  const handleRowClick = async (entry) => {
    if (!entry._id || entry._id === 'opening') return;
    setJeLoading(true);
    try {
      const { data } = await api.get(`/journal-entries/${entry._id}`);
      setJeDetail(data);
    } catch { addToast('Failed to load entry details', 'error'); }
    setJeLoading(false);
  };

  useEffect(() => { api.get('/accounts').then(r => setAccounts(r.data)); }, []);

  const loadLedger = async (accountId) => {
    if (!accountId) { setLedger(null); return; }
    setLoading(true);
    try {
      const params = {};
      if (selectedFy) {
        params.fiscalYearId = selectedFy;
      } else {
        if (startDate) params.startDate = bsToADStr(startDate);
        if (endDate) params.endDate = bsToADStr(endDate);
      }
      const { data } = await api.get(`/accounts/ledger/${accountId}`, { params });
      setLedger(data);
    } catch (err) { addToast('Error loading ledger', 'error'); }
    setLoading(false);
  };

  useEffect(() => {
    loadLedger(selectedAccount);
  }, [selectedAccount, selectedFy, startDate, endDate, selectedYear?._id]);

  // Group ledger rows for Monthly / Quarterly views. Each entry already carries a
  // running `balance`, so a group's closing balance is the last row's balance.
  const getGroups = () => {
    const all = ledger?.entries || [];
    if (viewMode === 'all') {
      return [{
        label: null,
        rows: all,
        dr: all.reduce((s, e) => s + (e.debit || 0), 0),
        cr: all.reduce((s, e) => s + (e.credit || 0), 0),
        opening: all.find(e => e._id === 'opening')?.balance || 0,
        closing: all.length ? all[all.length - 1].balance : 0,
      }];
    }
    const openingEntry = all.find(e => e._id === 'opening' || e.date === 'Opening');
    const entries = all.filter(e => !(e._id === 'opening' || e.date === 'Opening'));
    const fy = fiscalYears.find(y => y._id === selectedFy);
    const fyStart = fy ? new Date(fy.startDate) : null;
    const map = new Map();
    const order = [];
    entries.forEach(e => {
      const d = new Date(e.date);
      if (isNaN(d)) return;
      let key, label;
      if (viewMode === 'monthly') {
        key = `${d.getFullYear()}-${d.getMonth()}`;
        label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      } else {
        const base = fyStart || new Date(d.getFullYear(), 3, 1);
        const months = (d.getFullYear() - base.getFullYear()) * 12 + (d.getMonth() - base.getMonth());
        const q = Math.max(1, Math.floor(months / 3) + 1);
        key = q;
        label = `Quarter ${q}`;
      }
      if (!map.has(key)) { map.set(key, { label, rows: [], dr: 0, cr: 0, opening: 0, closing: 0 }); order.push(key); }
      map.get(key).rows.push(e);
    });
    let prevClosing = openingEntry ? openingEntry.balance : 0;
    const groups = order.map(k => {
      const g = map.get(k);
      g.dr = g.rows.reduce((s, e) => s + (e.debit || 0), 0);
      g.cr = g.rows.reduce((s, e) => s + (e.credit || 0), 0);
      g.opening = prevClosing;
      g.closing = g.rows.length ? g.rows[g.rows.length - 1].balance : prevClosing;
      prevClosing = g.closing;
      return g;
    });
    return groups;
  };

  const displayGroups = getGroups().map(g => ({ ...g, rows: newestFirst ? g.rows.slice().reverse() : g.rows }));
  if (newestFirst) displayGroups.reverse();

  const reportParamsObj = () => {
    if (selectedFy) return { fiscalYearId: selectedFy };
    const p = {};
    if (startDate) p.startDate = bsToADStr(startDate);
    if (endDate) p.endDate = bsToADStr(endDate);
    return p;
  };
  const reportParams = () => {
    const o = reportParamsObj();
    return Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  };

  const handlePrint = () => {
    if (!ledger) return;
    const company = JSON.parse(localStorage.getItem('user') || '{}').company || {};
    const periodLabel = selectedFy
      ? (fiscalYears.find(y => y._id === selectedFy)?.name || 'Selected FY')
      : (startDate && endDate ? `${startDate} to ${endDate}` : 'All Time');
    printLedger(ledger, company, { periodLabel });
  };

  const accountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  return (
    <div>
      <div className="page-header">
        <h1>Detailed Ledger (Khata)</h1>
        {ledger && !loading && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-secondary" onClick={handlePrint}>Print</button>
            <a className="btn btn-sm btn-success" download={`ledger_${ledger.account?.code}.xlsx`}
              href={`/api/reports/ledger/${selectedAccount}/excel?${reportParams()}`}
              onClick={e => { e.preventDefault(); api.get(`/reports/ledger/${selectedAccount}/excel`, { params: reportParamsObj(), responseType: 'blob' }).then(r => { const url = window.URL.createObjectURL(new Blob([r.data])); const a = document.createElement('a'); a.href = url; a.download = `ledger_${ledger.account?.code}.xlsx`; a.click(); }); }}
            >Excel</a>
            <a className="btn btn-sm btn-danger" href="#"
              onClick={e => { e.preventDefault(); api.get(`/reports/ledger/${selectedAccount}/pdf`, { params: reportParamsObj(), responseType: 'blob' }).then(r => { const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })); window.open(url, '_blank'); }).catch(() => addToast('Error generating PDF', 'error')); }}
            >PDF</a>
            <button className="btn btn-sm btn-secondary" onClick={() => setNewestFirst(s => !s)}>{newestFirst ? 'Show Oldest' : 'Show Latest'}</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-grid" style={{ gridTemplateColumns: '2fr 1.4fr 1fr' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Select Account</label>
            <SearchableSelect
              options={accountTypes
                .map(type => accounts.filter(a => a.type === type && a.isActive).map(a => ({ value: a._id, label: `${a.code} - ${a.name}` })))
                .flat()}
              value={selectedAccount}
              onChange={setSelectedAccount}
              placeholder="Search account..."
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fiscal Year</label>
            <select className="form-control" value={selectedFy} onChange={e => { setSelectedFy(e.target.value); if (e.target.value) { setStartDate(''); setEndDate(''); } }}>
              <option value="">All Time (custom range)</option>
              {fiscalYears.map(y => (
                <option key={y._id} value={y._id}>{y.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>View</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
                {['all', 'monthly', 'quarterly'].map(m => (
                  <button key={m} type="button" onClick={() => { setViewMode(m); setStartDate(''); setEndDate(''); }}
                  style={{ flex: 1, padding: '0.45rem 0.25rem', fontSize: '0.8rem', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (viewMode === m ? '#2563eb' : '#cbd5e1'), background: viewMode === m ? '#2563eb' : '#fff', color: viewMode === m ? '#fff' : '#334155' }}>
                  {m === 'all' ? 'All' : m === 'monthly' ? 'Monthly' : 'Quarterly'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!selectedFy && (
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr auto', marginTop: '0.75rem', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>From Date</label>
              <NepaliDatePicker value={startDate} onChange={val => setStartDate(val)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>To Date</label>
              <NepaliDatePicker value={endDate} onChange={val => setEndDate(val)} />
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => { setStartDate(''); setEndDate(''); }}>All</button>
          </div>
        )}
      </div>

      {loading && <div className="text-center">Loading...</div>}

      {ledger && !loading && (
        <>
          <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1rem' }}>
            <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="card-label">Account</div>
              <div className="card-value" style={{ fontSize: '1.2rem' }}>{ledger.account?.code} - {ledger.account?.name}</div>
              <div className="card-label">Type: {ledger.account?.type} | Category: {ledger.account?.category || '-'}</div>
            </div>
            <div className="card" style={{
              borderLeft: '4px solid ' + (['asset', 'expense', 'contra_revenue'].includes(ledger.account?.type) ? '#059669' : '#dc2626')
            }}>
              <div className="card-label">Current Balance</div>
              <div className="card-value">{formatNPR(ledger.currentBalance)}</div>
              <div className="card-label">{['asset', 'expense', 'contra_revenue'].includes(ledger.account?.type) ? 'Debit balance' : 'Credit balance'}</div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit (Rs.)</th><th>Credit (Rs.)</th><th>Balance (Rs.)</th></tr>
                </thead>
                <tbody>
                  {displayGroups.map((g, gi) => (
                    <React.Fragment key={g.label || 'all-' + gi}>
                      {viewMode !== 'all' && (
                        <tr style={{ background: '#f1f5f9' }}>
                          <td colSpan="6" style={{ fontWeight: 600 }}>{g.label}</td>
                        </tr>
                      )}
                      {g.rows.map(e => (
                        <tr key={e._id} onClick={() => handleRowClick(e)} style={{ cursor: e._id !== 'opening' ? 'pointer' : 'default' }}>
                          <td>{formatDate(e.date)}</td>
                          <td>{e.reference || '-'}</td>
                          <td>{e.description}</td>
                          <td className={e.debit > 0 ? 'text-danger' : ''}>{e.debit > 0 ? formatNPR(e.debit) : '-'}</td>
                          <td className={e.credit > 0 ? 'text-success' : ''}>{e.credit > 0 ? formatNPR(e.credit) : '-'}</td>
                          <td><strong>{formatNPR(e.balance)}</strong></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {displayGroups.length === 0 && (
                    <tr><td colSpan="6" className="text-center">No entries for this account</td></tr>
                  )}
                  {viewMode === 'all' && displayGroups[0] && (
                    <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                      <td colSpan="3">Total</td>
                      <td>{formatNPR(displayGroups[0].dr)}</td>
                      <td>{formatNPR(displayGroups[0].cr)}</td>
                      <td>{formatNPR(displayGroups[0].closing)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {jeDetail && (
        <EntryDetailsModal
          title="Journal Entry Details"
          subtitle={jeDetail.description}
          meta={[
            { label: 'Date', value: formatDate(jeDetail.date) },
            { label: 'Reference', value: jeDetail.reference || '-' },
            { label: 'Account', value: ledger?.account ? `${ledger.account.code} - ${ledger.account.name}` : '-' },
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