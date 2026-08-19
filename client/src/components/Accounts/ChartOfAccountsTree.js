import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../api';

const fmtNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROOT_GROUPS = [
  { key: 'asset', label: 'Assets', filter: ['asset', 'contra_asset'] },
  { key: 'liability', label: 'Liabilities', filter: ['liability'] },
  { key: 'equity', label: 'Equity', filter: ['equity'] },
  { key: 'revenue', label: 'Revenue & Income', filter: ['revenue', 'contra_revenue'] },
  { key: 'expense', label: 'Expenses', filter: ['expense'] },
];

const CATEGORY_LABELS = {
  current_asset: 'Current Assets',
  fixed_asset: 'Fixed Assets',
  contra_asset: 'Contra Assets',
  current_liability: 'Current Liabilities',
  long_term_liability: 'Long-term Liabilities',
  equity: 'Equity',
  revenue: 'Sales Revenue',
  other_income: 'Other Income',
  contra_revenue: 'Contra Revenue',
  cogs: 'Cost of Goods Sold',
  operating_expense: 'Operating Expenses',
  other_expense: 'Other Expenses',
};

function buildTree(accounts) {
  const rootMap = {};
  ROOT_GROUPS.forEach(rg => {
    rootMap[rg.key] = { id: rg.key, name: rg.label, type: 'root', level: 1, children: {}, debit: 0, credit: 0, balance: 0 };
  });
  accounts.forEach(acc => {
    let rootKey = ROOT_GROUPS.find(rg => rg.filter.includes(acc.type))?.key;
    if (!rootKey) rootKey = 'expense';
    const root = rootMap[rootKey];
    const catKey = acc.category || 'other_expense';
    const subLabel = CATEGORY_LABELS[catKey] || 'Other';
    if (!root.children[catKey]) {
      root.children[catKey] = { id: rootKey + '-' + catKey, name: subLabel, type: 'subgroup', level: 2, accounts: [], debit: 0, credit: 0, balance: 0 };
    }
    root.children[catKey].accounts.push(acc);
    const bal = acc.balance || 0;
    if (['liability', 'equity', 'revenue', 'contra_asset'].includes(acc.type)) {
      root.children[catKey].credit += Math.abs(bal > 0 ? bal : 0);
      root.children[catKey].debit += Math.abs(bal < 0 ? bal : 0);
    } else {
      root.children[catKey].debit += Math.abs(bal > 0 ? bal : 0);
      root.children[catKey].credit += Math.abs(bal < 0 ? bal : 0);
    }
    root.children[catKey].balance += bal;
  });
  const tree = [];
  ROOT_GROUPS.forEach(rg => {
    const root = rootMap[rg.key];
    const subGroups = Object.values(root.children).filter(sg => sg.accounts.length > 0);
    if (subGroups.length === 0) return;
    root.debit = subGroups.reduce((s, sg) => s + sg.debit, 0);
    root.credit = subGroups.reduce((s, sg) => s + sg.credit, 0);
    root.balance = subGroups.reduce((s, sg) => s + sg.balance, 0);
    root.children = subGroups;
    tree.push(root);
  });
  return tree;
}

export default function ChartOfAccountsTree() {
  const [accounts, setAccounts] = useState([]);
  const [trialData, setTrialData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [drawerAccountId, setDrawerAccountId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, trialRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/accounts/trial-balance').catch(() => ({ data: [] })),
      ]);
      setAccounts(accRes.data || []);
      setTrialData(trialRes.data || []);
    } catch (err) { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const trialMap = useMemo(() => {
    const m = {};
    trialData.forEach(t => { m[t._id] = t; });
    return m;
  }, [trialData]);

  const filteredAccounts = useMemo(() => {
    if (groupFilter === 'all') return accounts;
    const rg = ROOT_GROUPS.find(r => r.key === groupFilter);
    if (!rg) return accounts;
    return accounts.filter(a => rg.filter.includes(a.type));
  }, [accounts, groupFilter]);

  const tree = useMemo(() => buildTree(filteredAccounts), [filteredAccounts]);

  const matchesSearch = useCallback((account) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (account.name || '').toLowerCase().includes(q) || (account.code || '').includes(q);
  }, [search]);

  const parentIdsMatchingSearch = useMemo(() => {
    if (!search) return new Set();
    const ids = new Set();
    tree.forEach(root => {
      root.children.forEach(sub => {
        if (sub.accounts.some(a => matchesSearch(a))) {
          ids.add(root.id);
          ids.add(sub.id);
        }
      });
    });
    return ids;
  }, [tree, search, matchesSearch]);

  useEffect(() => {
    if (search && parentIdsMatchingSearch.size > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        parentIdsMatchingSearch.forEach(id => next.add(id));
        return next;
      });
    }
  }, [search, parentIdsMatchingSearch]);

  const toggle = useCallback((id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    const ids = new Set();
    tree.forEach(root => {
      ids.add(root.id);
      root.children.forEach(sub => ids.add(sub.id));
    });
    setExpanded(ids);
  };

  const collapseAll = () => setExpanded(new Set());

  const visibleAccounts = useMemo(() => {
    const rows = [];
    tree.forEach(root => {
      const rootVisible = root.children.some(sub => sub.accounts.some(a => matchesSearch(a)));
      if (!rootVisible) return;
      rows.push({ ...root, _nodeType: 'root' });
      if (expanded.has(root.id)) {
        root.children.forEach(sub => {
          const subVisible = sub.accounts.some(a => matchesSearch(a));
          if (!subVisible) return;
          rows.push({ ...sub, _nodeType: 'subgroup', _parentId: root.id });
          if (expanded.has(sub.id)) {
            sub.accounts.forEach(acc => {
              const trial = trialMap[acc._id];
              rows.push({ ...acc, _nodeType: 'ledger', _parentId: sub.id, debit: trial?.debit || 0, credit: trial?.credit || 0, balance: acc.balance || 0 });
            });
          }
        });
      }
    });
    return rows;
  }, [tree, expanded, matchesSearch, trialMap]);

  const totalDebit = accounts.reduce((s, a) => s + (trialMap[a._id]?.debit || 0), 0);
  const totalCredit = accounts.reduce((s, a) => s + (trialMap[a._id]?.credit || 0), 0);

  const openDrawer = useCallback((accountId) => setDrawerAccountId(accountId), []);

  if (loading) {
    return (
      <div className="coa-container">
        <div className="coa-loading">
          <div className="coa-loading-spinner" />
          <span>Loading Chart of Accounts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="coa-container">
      <div className="coa-action-bar">
        <input className="coa-search" placeholder="Search account, group, or ledger..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="coa-filter" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
          <option value="all">All Groups</option>
          {ROOT_GROUPS.map(rg => (<option key={rg.key} value={rg.key}>{rg.label}</option>))}
        </select>
        <div className="coa-action-bar-right">
          <button className="btn btn-sm btn-secondary" onClick={expanded.size === 0 ? expandAll : collapseAll}>
            {expanded.size === 0 ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      </div>
      <div className="coa-card">
        <div className="table-responsive">
          <table className="coa-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Account Name / Code</th>
                <th style={{ width: '15%' }}>Account Type</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Debit (Rs.)</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Credit (Rs.)</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Net Balance (Rs.)</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((node, idx) => {
                const level = node._nodeType === 'root' ? 1 : node._nodeType === 'subgroup' ? 2 : 3;
                const isRoot = level === 1;
                const isSubGroup = level === 2;
                const isLedger = level === 3;
                const hasChildren = (isRoot || isSubGroup);
                const isExpanded = expanded.has(node.id);
                const indent = level === 1 ? 0 : level === 2 ? 16 : 32;

                if (isRoot) {
                  return (
                    <tr key={node.id} className={'coa-row coa-row--level-1' + (isExpanded ? ' coa-row--expanded' : '')} onClick={() => toggle(node.id)}>
                      <td style={{ paddingLeft: indent + 12 }}>
                        <span className={'coa-caret' + (isExpanded ? ' coa-caret--open' : '')}>&#9654;</span>
                        <strong>{node.name}</strong>
                      </td>
                      <td><span className="badge badge-info">Group</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{node.debit > 0 ? fmtNPR(node.debit) : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{node.credit > 0 ? fmtNPR(node.credit) : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNPR(node.balance)}</td>
                      <td></td>
                    </tr>
                  );
                }
                if (isSubGroup) {
                  return (
                    <tr key={node.id} className={'coa-row coa-row--level-2' + (isExpanded ? ' coa-row--expanded' : '')} onClick={() => toggle(node.id)}>
                      <td style={{ paddingLeft: indent + 12 }}>
                        <span className={'coa-caret' + (isExpanded ? ' coa-caret--open' : '')}>&#9654;</span>
                        {node.name}
                      </td>
                      <td><span className="badge badge-secondary">Sub-Group</span></td>
                      <td style={{ textAlign: 'right' }}>{node.debit > 0 ? fmtNPR(node.debit) : '-'}</td>
                      <td style={{ textAlign: 'right' }}>{node.credit > 0 ? fmtNPR(node.credit) : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNPR(node.balance)}</td>
                      <td></td>
                    </tr>
                  );
                }
                return (
                  <tr key={node._id || idx} className="coa-row coa-row--level-3" onClick={() => openDrawer(node._id)}>
                    <td style={{ paddingLeft: indent + 12 }}>
                      <span className="coa-ledger-icon">&#128214;</span>
                      <span>{node.name}</span>
                      <span className="coa-account-code">{node.code}</span>
                    </td>
                    <td><span className="badge badge-secondary">{node.type}</span></td>
                    <td style={{ textAlign: 'right' }}>{node.debit > 0 ? fmtNPR(node.debit) : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{node.credit > 0 ? fmtNPR(node.credit) : '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: node.balance >= 0 ? '#059669' : '#dc2626' }}>{fmtNPR(node.balance)}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openDrawer(node._id); }}>View</button>
                    </td>
                  </tr>
                );
              })}
              {visibleAccounts.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No accounts found</td></tr>
              )}
            </tbody>
            {visibleAccounts.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan="2"><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtNPR(totalDebit)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtNPR(totalCredit)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtNPR(totalDebit - totalCredit)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {drawerAccountId && <LedgerDrawer accountId={drawerAccountId} onClose={() => setDrawerAccountId(null)} />}
    </div>
  );
}

function LedgerDrawer({ accountId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    api.get('/accounts/ledger/' + accountId)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load ledger'))
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const totalDebit = (data?.entries || []).reduce((s, r) => s + (r.debit || 0), 0);
  const totalCredit = (data?.entries || []).reduce((s, r) => s + (r.credit || 0), 0);

  return (
    <>
      <div className="coa-drawer-overlay" onClick={onClose} />
      <div className="coa-drawer">
        <div className="coa-drawer-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Ledger Details</h3>
            {data?.account && (
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                {data.account.code} - {data.account.name}
              </div>
            )}
          </div>
          <button className="modal-close-x" onClick={onClose}>&times;</button>
        </div>
        {data?.account && (
          <div className="coa-drawer-meta">
            <div className="coa-drawer-meta-item">
              <span className="coa-drawer-meta-label">Account</span>
              <span className="coa-drawer-meta-value">{data.account.code} - {data.account.name}</span>
            </div>
            <div className="coa-drawer-meta-item">
              <span className="coa-drawer-meta-label">Type</span>
              <span className="coa-drawer-meta-value">{data.account.type || '-'}</span>
            </div>
            <div className="coa-drawer-meta-item">
              <span className="coa-drawer-meta-label">Category</span>
              <span className="coa-drawer-meta-value">{CATEGORY_LABELS[data.account.category] || data.account.category || '-'}</span>
            </div>
            <div className="coa-drawer-meta-item">
              <span className="coa-drawer-meta-label">Opening Balance</span>
              <span className="coa-drawer-meta-value">{fmtNPR(data.openingBalance)}</span>
            </div>
            <div className="coa-drawer-meta-item">
              <span className="coa-drawer-meta-label">Current Balance</span>
              <span className="coa-drawer-meta-value" style={{ color: data.currentBalance >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>{fmtNPR(data.currentBalance)}</span>
            </div>
          </div>
        )}
        <div className="coa-drawer-body">
          {loading && <div className="coa-drawer-loading">Loading ledger entries...</div>}
          {error && <div className="coa-drawer-error">{error}</div>}
          {!loading && !error && data?.entries?.length === 0 && (
            <div className="coa-drawer-empty">No transactions found for this account.</div>
          )}
          {!loading && !error && data?.entries?.length > 0 && (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Debit</th>
                    <th style={{ textAlign: 'right' }}>Credit</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((row, i) => (
                    <tr key={row._id || i} className={row._id === 'opening' ? 'row-muted' : ''}>
                      <td>{row._id === 'opening' ? '-' : new Date(row.date).toLocaleDateString('en-IN')}</td>
                      <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{row.reference || '-'}</td>
                      <td>{row.description || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{row.debit > 0 ? fmtNPR(row.debit) : '-'}</td>
                      <td style={{ textAlign: 'right' }}>{row.credit > 0 ? fmtNPR(row.credit) : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: row.balance >= 0 ? '#059669' : '#dc2626' }}>{fmtNPR(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan="3" style={{ textAlign: 'right' }}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtNPR(totalDebit)}</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtNPR(totalCredit)}</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtNPR(data.currentBalance)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
