import React, { useState } from 'react';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { useToast } from '../UI/Toast';
import api from '../../api';
import NepaliDatePicker, { getBSTodayStr, bsToADStr } from '../UI/NepaliDatePicker';

export default function FiscalYearSelector() {
  const { fiscalYears, selectedYear, viewingId, isViewingSelected, switchYear, viewYear, exitView, refresh } = useFiscalYear();
  const [showModal, setShowModal] = useState(false);
  const today = getBSTodayStr();
  const [form, setForm] = useState({ name: '', startDate: today, endDate: '' });
  const addToast = useToast();

  const handleChange = (e) => {
    const year = fiscalYears.find(y => y._id === e.target.value);
    if (year) switchYear(year);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.name.trim()) {
      addToast('Fiscal year name is required', 'error');
      return;
    }
    if (!form.startDate) {
      addToast('Start date is required', 'error');
      return;
    }
    if (!form.endDate) {
      addToast('End date is required', 'error');
      return;
    }
    const startAD = bsToADStr(form.startDate);
    const endAD = bsToADStr(form.endDate);
    if (!startAD || !endAD) {
      addToast('Invalid date selected. Please try again.', 'error');
      return;
    }
    if (new Date(startAD) >= new Date(endAD)) {
      addToast('End date must be after start date', 'error');
      return;
    }
    try {
      await api.post('/fiscal-years', { name: form.name.trim(), startDate: startAD, endDate: endAD });
      setShowModal(false);
      setForm({ name: '', startDate: today, endDate: '' });
      addToast('Fiscal year created', 'success');
      refresh();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create fiscal year', 'error');
    }
  };

  const openModal = () => {
    const now = getBSTodayStr();
    setForm({ name: '', startDate: now, endDate: '' });
    setShowModal(true);
  };

  const selectedInactive = selectedYear && !selectedYear.isActive;

  return (
    <>
      <div className="fy-select-wrap">
        <label className="fy-label">Fiscal Year</label>
        <div className="fy-controls">
          <select className="fy-select" value={selectedYear?._id || ''} onChange={handleChange}>
            {fiscalYears.map(y => (
              <option key={y._id} value={y._id}>
                {y.name}{y.isActive ? ' (Active)' : ''}
              </option>
            ))}
          </select>
          <button onClick={openModal} className="fy-add-btn" title="Add Fiscal Year">+</button>
        </div>
      </div>
      {selectedInactive && (
        <div className="fy-view-bar">
          {isViewingSelected ? (
            <div className="fy-view-bar-inner">
              <span className="fy-view-note">Viewing {selectedYear.name}</span>
              <button className="fy-view-btn" onClick={exitView}>Exit</button>
            </div>
          ) : (
            <button className="fy-view-btn" onClick={() => viewYear(selectedYear)}>View {selectedYear.name}</button>
          )}
        </div>
      )}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Fiscal Year</h3><button className="btn btn-sm modal-close-x" onClick={() => setShowModal(false)}>x</button></div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
              Use this to enter previous-year data. Records created while viewing this fiscal year will be stored and shown under it.
            </p>
            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label>Name (e.g., 2082/83)</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2082/83" autoFocus />
              </div>
              <div className="form-group">
                <label>Start Date (BS)</label>
                <NepaliDatePicker value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} />
              </div>
              <div className="form-group">
                <label>End Date (BS)</label>
                <NepaliDatePicker value={form.endDate} onChange={v => setForm({ ...form, endDate: v })} />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
