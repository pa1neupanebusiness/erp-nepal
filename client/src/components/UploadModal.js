import React, { useState, useRef } from 'react';
import { useToast } from './UI/Toast';
import * as XLSX from 'xlsx';
import api from '../api';

export default function UploadModal({ endpoint, label, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef();
  const addToast = useToast();

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/upload/${endpoint}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      if (data.created > 0) {
        setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
      }
    } catch (err) {
      setResult({ created: 0, errors: [{ error: err.response?.data?.message || 'Upload failed' }] });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = {
      products: ['name', 'sku', 'barcode', 'category', 'supplier', 'cost_price', 'selling_price', 'stock', 'min_stock', 'unit', 'tax_rate'],
      customers: ['name', 'email', 'phone', 'address', 'loyalty_points'],
      suppliers: ['name', 'contact_person', 'email', 'phone', 'address'],
      accounts: ['code', 'name', 'type', 'category', 'description'],
    }[endpoint] || ['name'];

    if (!XLSX) {
      addToast('XLSX library not loaded. Use the sample format shown on screen.', 'error');
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, headers.map(() => '')]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `template_${endpoint}.xlsx`);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Upload {label} via Excel</h3>
          <button className="btn btn-sm modal-close-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p>Upload an Excel file (.xlsx or .xls) with the following columns:</p>
          <div className="upload-hint">
            <code>
              {endpoint === 'products' && 'name, sku, barcode, category, supplier, cost_price, selling_price, stock, min_stock, unit, tax_rate'}
              {endpoint === 'customers' && 'name, email, phone, address, loyalty_points'}
              {endpoint === 'suppliers' && 'name, contact_person, email, phone, address'}
              {endpoint === 'accounts' && 'code, name, type, category, description'}
            </code>
          </div>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <input type="file" ref={inputRef} accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files[0])} />
          </div>
          {result && (
            <div className={`alert ${result.created > 0 ? 'alert-success' : 'alert-error'}`}>
              Created: {result.created} records
              {result.errors?.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  Errors: {result.errors.map((e, i) => <div key={i}>{e.row}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={!file || loading}>
            {loading ? 'Uploading...' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
