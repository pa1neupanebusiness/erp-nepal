import React from 'react';
import { useToast } from './UI/Toast';
import api from '../api';
import { printReportInline } from '../utils/printHelper';

export default function DownloadBtn({ endpoint, label, filename, type = 'excel', params }) {
  const addToast = useToast();
  const handleDownload = async () => {
    try {
      const { data } = await api.get(`/reports/${endpoint}/${type}`, {
        responseType: 'blob',
        params,
      });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${filename || endpoint}.${type === 'pdf' ? 'pdf' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      addToast('Download failed: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  return (
    <button className={`btn btn-sm ${type === 'pdf' ? 'btn-danger' : 'btn-success'}`} onClick={handleDownload}>
      {label || `Download ${type.toUpperCase()}`}
    </button>
  );
}

export function PrintBtn({ label = 'Print', endpoint }) {
  const addToast = useToast();
  const handlePrint = async () => {
    if (endpoint) {
      try {
        await printReportInline(endpoint);
      } catch (err) {
        addToast('Print failed: ' + (err.message || err), 'error');
      }
    } else {
      window.print();
    }
  };
  return (
    <button className="btn btn-sm btn-secondary" onClick={handlePrint}>
      {label}
    </button>
  );
}
