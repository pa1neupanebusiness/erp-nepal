import React, { useState, useEffect } from 'react';
import api from '../../api';
import EntryDetailsModal from '../UI/EntryDetailsModal';
import NepaliDatePicker, { adToBsStr, bsToADStr } from '../UI/NepaliDatePicker';

export default function AttendancePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(adToBsStr(new Date()));
  const [detail, setDetail] = useState(null);

  useEffect(() => { fetchAttendance(); }, []);

  const fetchAttendance = async () => {
    try {
      const res = await api.get('/hr/attendance', { params: { startDate: bsToADStr(date), endDate: bsToADStr(date) } });
      setRecords(res.data);
    } catch (err) {
      console.error('Failed to fetch attendance', err);
    }
    setLoading(false);
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/hr/attendance/${id}`, { status });
      fetchAttendance();
    } catch (err) {
      console.error('Failed to update attendance', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Attendance</h1>
        <NepaliDatePicker value={date} onChange={v => { setDate(v); setLoading(true); fetchAttendance(); }} />
      </div>
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Hours</th>
              <th>OT Hours</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r._id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                <td>{r.employee?.firstName} {r.employee?.lastName}</td>
                <td>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                <td>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-'}</td>
                <td>{r.totalHours || 0}</td>
                <td>{r.overtimeHours || 0}</td>
                <td>
                  <select value={r.status} onClick={e => e.stopPropagation()} onChange={e => handleStatusChange(r._id, e.target.value)}>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="half-day">Half Day</option>
                    <option value="late">Late</option>
                    <option value="on-leave">On Leave</option>
                  </select>
                </td>
                <td>
                  <span className={`badge ${r.status === 'present' ? 'badge-success' : r.status === 'absent' ? 'badge-danger' : 'badge-warning'}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <EntryDetailsModal
          title={`${detail.employee?.firstName} ${detail.employee?.lastName}`}
          subtitle="Click row to view attendance details"
          meta={[
            { label: 'Date', value: new Date(detail.checkIn || detail.date || Date.now()).toLocaleDateString() },
            { label: 'Status', value: detail.status },
            { label: 'Check In', value: detail.checkIn ? new Date(detail.checkIn).toLocaleTimeString() : '-' },
            { label: 'Check Out', value: detail.checkOut ? new Date(detail.checkOut).toLocaleTimeString() : '-' },
            { label: 'Total Hours', value: `${detail.totalHours || 0}h` },
            { label: 'OT Hours', value: `${detail.overtimeHours || 0}h` },
          ]}
          columns={[
            { label: 'Particular', key: 'label' },
            { label: 'Detail', key: 'value' },
          ]}
          rows={[
            { label: 'Employee', value: detail.employee?.employeeId || '-' },
            { label: 'Department', value: detail.employee?.department || '-' },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
