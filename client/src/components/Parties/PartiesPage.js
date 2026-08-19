import React, { useState, useEffect, useMemo } from 'react';
import ConfirmModal from '../UI/ConfirmModal';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import SaleDetailModal from '../UI/SaleDetailModal';
import PurchaseDetailModal from '../UI/PurchaseDetailModal';
import api from '../../api';
import { printEntry } from '../UI/printEntry';

const fmtNPR = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => { const t = new Date(d); return isNaN(t.getTime()) ? '-' : t.toLocaleDateString('en-IN'); };

const EMPTY_CUSTOMER = { name: '', email: '', phone: '', address: '', pan: '' };
const EMPTY_SUPPLIER = { name: '', contactPerson: '', email: '', phone: '', address: '', pan: '' };

export default function PartiesPage() {
  const [tab, setTab] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formType, setFormType] = useState('customer');
  const [form, setForm] = useState({ ...EMPTY_CUSTOMER });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [detailsType, setDetailsType] = useState(null);
  const [txData, setTxData] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [txDetail, setTxDetail] = useState(null);
  const [txDetailType, setTxDetailType] = useState(null);
  const [viewSaleId, setViewSaleId] = useState(null);
  const [viewPurchaseId, setViewPurchaseId] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [cRes, sRes] = await Promise.all([api.get('/customers'), api.get('/suppliers')]);
      setCustomers(cRes.data.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setSuppliers(sRes.data.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (err) { /* ignore */ }
  };

  const allParties = useMemo(() => {
    const list = [];
    if (tab === 'all' || tab === 'customers') {
      customers.forEach(c => list.push({ ...c, _partyType: 'customer', _typeLabel: 'Customer', _due: c.totalDue || 0, _salesCount: c.salesCount || 0, _emiCount: c.emiCount || 0 }));
    }
    if (tab === 'all' || tab === 'suppliers') {
      suppliers.forEach(s => list.push({ ...s, _partyType: 'supplier', _typeLabel: 'Supplier', _due: 0, _salesCount: 0, _emiCount: 0 }));
    }
    if (search) {
      const q = search.toLowerCase();
      return list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q) || (p.pan || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q));
    }
    return list;
  }, [tab, customers, suppliers, search]);

  const totalDue = allParties.reduce((s, p) => s + (p._due || 0), 0);
  const customerCount = (tab === 'all' ? customers : tab === 'customers' ? customers : []).length;
  const supplierCount = (tab === 'all' ? suppliers : tab === 'suppliers' ? suppliers : []).length;
  const dueParties = allParties.filter(p => (p._due || 0) > 0).length;

  const openAdd = (type) => {
    setFormType(type);
    setForm(type === 'customer' ? { ...EMPTY_CUSTOMER } : { ...EMPTY_SUPPLIER });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (party) => {
    setFormType(party._partyType);
    setForm({ ...party });
    setEditing(party);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = formType === 'customer' ? '/customers' : '/suppliers';
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing._id}`, form);
      } else {
        await api.post(endpoint, form);
      }
      setShowForm(false);
      setEditing(null);
      setForm(formType === 'customer' ? { ...EMPTY_CUSTOMER } : { ...EMPTY_SUPPLIER });
      loadAll();
    } catch (err) { /* ignore */ }
  };

  const handleDelete = (party) => {
    setConfirmDelete({ id: party._id, type: party._partyType, message: `Delete ${party._typeLabel} "${party.name}"?` });
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const endpoint = confirmDelete.type === 'customer' ? '/customers' : '/suppliers';
    await api.delete(`${endpoint}/${confirmDelete.id}`);
    setConfirmDelete(null);
    loadAll();
  };

  const openDetails = async (party) => {
    setDetailsId(party._id);
    setDetailsType(party._partyType);
    setTxData(null);
    setDetailData(null);
    setTxDetail(null);
    try {
      if (party._partyType === 'customer') {
        const { data } = await api.get(`/customers/${party._id}/transactions`);
        setTxData({
          rawSales: data.sales || [],
          rawEmis: data.emis || [],
          sales: (data.sales || []).map(s => ({
            type: 'Sale',
            date: s.invoiceDate || s.date || s.createdAt,
            ref: s.invoiceNumber || '-',
            amount: Number(s.grandTotal) || 0,
            balance: Number(s.dueAmount) || 0,
            _id: s._id,
          })),
          emis: (data.emis || []).map(e => ({
            type: 'EMI',
            date: e.createdAt || e.date,
            ref: e.emiNumber || '-',
            amount: Number(e.netAmount || e.totalPrice) || 0,
            balance: Number(e.remainingAmount) || 0,
            _id: e._id,
          })),
          totalDue: Number(data.totalDue) || 0,
        });
      } else {
        const { data } = await api.get(`/suppliers/${party._id}/outstanding`);
        setDetailData({
          rawPurchases: data.purchases || [],
          purchases: (data.purchases || []).map(p => ({
            type: 'Purchase',
            date: p.date,
            ref: p.purchaseNumber || '-',
            total: Number(p.grandTotal) || 0,
            paid: Number(p.paidAmount) || 0,
            due: Number(p.dueAmount) || 0,
            _id: p._id,
          })),
          totalDue: Number(data.totalDue) || 0,
          balance: Number(data.balance) || 0,
        });
      }
    } catch (err) { /* ignore */ }
  };

  const openTxDetail = async (row) => {
    if (row.type === 'Sale' && row._id) {
      setViewSaleId(row._id);
    } else if (row.type === 'Purchase' && row._id) {
      setViewPurchaseId(row._id);
    } else if (row.type === 'EMI' && row._id) {
      const raw = (txData?.rawEmis || []).find(e => e._id === row._id);
      if (raw) {
        setTxDetail(raw);
        setTxDetailType('emi');
      }
    }
  };

  const handlePrint = () => {
    if (allParties.length === 0) return;
    const rows = allParties.map(p => ({
      Name: p.name,
      Type: p._typeLabel,
      Phone: p.phone || '-',
      Email: p.email || '-',
      PAN: p.pan || '-',
      Address: p.address || '-',
      Due: fmtNPR(p._due || 0),
    }));
    printEntry({
      title: `Parties List (${tab === 'all' ? 'All' : tab === 'customers' ? 'Customers' : 'Suppliers'})`,
      columns: Object.keys(rows[0]).map(k => ({ key: k, label: k })),
      rows,
      footer: [
        { label: 'Total Parties', value: String(allParties.length) },
        { label: 'Total Due', value: fmtNPR(totalDue) },
      ],
    });
  };

  const summaryCards = [
    { label: 'Total Customers', value: customerCount, color: '#3b82f6', icon: '👤' },
    { label: 'Total Suppliers', value: supplierCount, color: '#10b981', icon: '🏢' },
    { label: 'Total Due', value: fmtNPR(totalDue), color: totalDue > 0 ? '#ef4444' : '#10b981', icon: '💰' },
    { label: 'Parties with Dues', value: dueParties, color: dueParties > 0 ? '#f59e0b' : '#10b981', icon: '📊' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Parties</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="search-input" placeholder="Search by name, phone, PAN, email..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
          <button className="btn btn-primary" onClick={() => openAdd('customer')}>+ Customer</button>
          <button className="btn btn-primary" onClick={() => openAdd('supplier')}>+ Supplier</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {summaryCards.map((card, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: '10px', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${card.color}`, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>{card.icon}</span>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{card.label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0' }}>
        {[
          { key: 'all', label: `All (${customers.length + suppliers.length})` },
          { key: 'customers', label: `Customers (${customers.length})` },
          { key: 'suppliers', label: `Suppliers (${suppliers.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? '#3b82f6' : '#64748b', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #3b82f6' : '2px solid transparent', marginBottom: '-2px', cursor: 'pointer', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>{editing ? `Edit ${formType === 'customer' ? 'Customer' : 'Supplier'}` : `New ${formType === 'customer' ? 'Customer' : 'Supplier'}`}</h3>
              <button className="modal-close-x" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {!editing && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Type</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input type="radio" name="formType" checked={formType === 'customer'} onChange={() => { setFormType('customer'); setForm({ ...EMPTY_CUSTOMER }); }} />
                        Customer
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input type="radio" name="formType" checked={formType === 'supplier'} onChange={() => { setFormType('supplier'); setForm({ ...EMPTY_SUPPLIER }); }} />
                        Supplier
                      </label>
                    </div>
                  </div>
                )}
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  {formType === 'supplier' && <div className="form-group"><label>Contact Person</label><input value={form.contactPerson || ''} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>}
                  <div className="form-group"><label>Email</label><input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="form-group"><label>Phone</label><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label>Address</label><input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                  <div className="form-group"><label>PAN No.</label><input value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value })} placeholder="Optional" /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}>#</th>
                <th>Name</th>
                <th>Type</th>
                <th>Phone</th>
                <th>Email</th>
                <th>PAN</th>
                <th>Address</th>
                <th style={{ textAlign: 'right' }}>Due</th>
                <th style={{ width: '130px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allParties.map((p, i) => (
                <tr key={p._id} onClick={() => openDetails(p)} style={{ cursor: 'pointer' }}>
                  <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{i + 1}</td>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, background: p._partyType === 'customer' ? '#eff6ff' : '#f0fdf4', color: p._partyType === 'customer' ? '#2563eb' : '#16a34a' }}>
                      {p._typeLabel}
                    </span>
                  </td>
                  <td>{p.phone || '-'}</td>
                  <td>{p.email || '-'}</td>
                  <td>{p.pan || '-'}</td>
                  <td>{p.address || '-'}</td>
                  <td style={{ textAlign: 'right', color: (p._due || 0) > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                    {(p._due || 0) > 0 ? fmtNPR(p._due) : '-'}
                  </td>
                  <td className="action-cell" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => openDetails(p)}>View</button>
                    <button className="btn btn-sm" style={{ marginLeft: '0.25rem' }} onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.25rem' }} onClick={() => handleDelete(p)}>Del</button>
                  </td>
                </tr>
              ))}
              {allParties.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                  {search ? 'No parties match your search' : 'No parties found. Add a customer or supplier to get started.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailsId && detailsType === 'customer' && (() => {
        const c = customers.find(x => x._id === detailsId);
        if (!c) return null;
        const allTx = [
          ...(txData?.sales || []),
          ...(txData?.emis || []),
        ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return (
          <EntryDetailsModal
            title={c.name}
            subtitle="Customer Details & Transactions"
            meta={[
              { label: 'Type', value: 'Customer' },
              { label: 'Phone', value: c.phone || '-' },
              { label: 'Email', value: c.email || '-' },
              { label: 'PAN', value: c.pan || '-' },
              { label: 'Address', value: c.address || '-' },
              { label: 'Total Due', value: fmtNPR(txData?.totalDue || 0) },
            ]}
            columns={[
              { key: 'type', label: 'Type' },
              { key: 'date', label: 'Date', render: (d) => fmtDate(d) },
              { key: 'ref', label: 'Reference' },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'balance', label: 'Balance', align: 'right', render: (v) => fmtNPR(v) },
            ]}
            rows={allTx}
            footer={[
              { label: 'Total Amount', value: fmtNPR(allTx.reduce((s, t) => s + (t.amount || 0), 0)) },
              { label: 'Total Balance', value: fmtNPR(allTx.reduce((s, t) => s + (t.balance || 0), 0)) },
            ]}
            actions={
              <button className="btn btn-sm" style={{ marginLeft: '0.25rem' }} onClick={() => { setDetailsId(null); openEdit(c); }}>Edit</button>
            }
            onRowClick={(row) => openTxDetail(row)}
            onClose={() => { setDetailsId(null); setTxData(null); setViewSaleId(null); setViewPurchaseId(null); setTxDetail(null); setTxDetailType(null); }}
          />
        );
      })()}

      {detailsId && detailsType === 'supplier' && detailData && (() => {
        const s = suppliers.find(x => x._id === detailsId);
        if (!s) return null;
        return (
          <EntryDetailsModal
            title={s.name}
            subtitle="Supplier Details & Outstanding Purchases"
            meta={[
              { label: 'Type', value: 'Supplier' },
              { label: 'Contact', value: s.contactPerson || '-' },
              { label: 'Phone', value: s.phone || '-' },
              { label: 'Email', value: s.email || '-' },
              { label: 'PAN', value: s.pan || '-' },
              { label: 'Address', value: s.address || '-' },
              { label: 'Total Due', value: fmtNPR(detailData.totalDue) },
            ]}
            columns={[
              { key: 'ref', label: 'Purchase No' },
              { key: 'date', label: 'Date', render: (v) => fmtDate(v) },
              { key: 'total', label: 'Total', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'paid', label: 'Paid', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'due', label: 'Due', align: 'right', render: (v) => fmtNPR(v) },
            ]}
            rows={detailData.purchases}
            footer={[
              { label: 'Total Due', value: fmtNPR(detailData.totalDue) },
            ]}
            actions={
              <button className="btn btn-sm" style={{ marginLeft: '0.25rem' }} onClick={() => { setDetailsId(null); openEdit(s); }}>Edit</button>
            }
            onRowClick={(row) => openTxDetail(row)}
            onClose={() => { setDetailsId(null); setDetailData(null); setViewSaleId(null); setViewPurchaseId(null); setTxDetail(null); setTxDetailType(null); }}
          />
        );
      })()}

      {viewSaleId && <SaleDetailModal saleId={viewSaleId} onClose={() => setViewSaleId(null)} />}
      {viewPurchaseId && <PurchaseDetailModal purchaseId={viewPurchaseId} onClose={() => setViewPurchaseId(null)} />}

      {txDetail && txDetailType === 'emi' && (() => {
        const e = txDetail;
        const product = e.product;
        return (
          <EntryDetailsModal
            title={`EMI ${e.emiNumber || ''}`}
            subtitle={`${fmtDate(e.createdAt)} | ${e.customer?.name || '-'} | ${e.bankName || '-'}`}
            meta={[
              { label: 'Product', value: product?.name || product || '-' },
              { label: 'Serial No', value: e.serialNumber || '-' },
              { label: 'Status', value: e.paidStatus || '-' },
              { label: 'Product Total', value: fmtNPR(e.productTotal) },
              { label: 'Down Payment', value: fmtNPR(e.downPayment) },
              { label: 'Net Amount', value: fmtNPR(e.netAmount) },
              { label: 'Remaining', value: fmtNPR(e.remainingAmount) },
              { label: 'Total Paid', value: fmtNPR(e.totalPaid) },
              { label: 'Tenure', value: e.tenure ? `${e.tenure} months` : '-' },
              { label: 'Monthly EMI', value: e.monthlyEMI ? fmtNPR(e.monthlyEMI) : '-' },
              { label: 'Interest Rate', value: e.interestRate ? `${e.interestRate}%` : '0%' },
              { label: 'Bank', value: e.bankName || '-' },
              ...(e.remarks ? [{ label: 'Remarks', value: e.remarks }] : []),
            ]}
            columns={[
              { key: 'date', label: 'Date', render: (v) => fmtDate(v) },
              { key: 'amount', label: 'Amount', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'principal', label: 'Principal', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'interest', label: 'Interest', align: 'right', render: (v) => fmtNPR(v) },
              { key: 'method', label: 'Method' },
            ]}
            rows={(e.payments || []).map((p, i) => ({
              date: p.date,
              amount: p.amount,
              principal: p.principal,
              interest: p.interest,
              method: p.method || '-',
            }))}
            footer={[
              { label: 'Total Paid', value: fmtNPR(e.totalPaid || 0) },
              { label: 'Remaining', value: fmtNPR(e.remainingAmount || 0) },
            ]}
            onClose={() => { setTxDetail(null); setTxDetailType(null); }}
          />
        );
      })()}

      <ConfirmModal
        open={!!confirmDelete}
        title="Confirm Delete"
        message={confirmDelete?.message}
        onConfirm={confirmDeleteAction}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
