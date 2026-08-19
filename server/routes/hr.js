const express = require('express');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Salary = require('../models/Salary');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { protect, hrAccess, hasHrAccess, requireHrModule } = require('../middleware/auth');
const router = express.Router();
router.use(protect, requireHrModule);

router.get('/employees', protect, hrAccess, async (req, res) => {
  try {
    const employees = await Employee.find({ company: req.companyId }).populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/employees/:id', protect, hrAccess, async (req, res) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, company: req.companyId }).populate('userId', 'name email');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/employees', protect, hrAccess, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, dateOfBirth, gender, nationality, address, city, nationalId, taxId, bankName, bankAccountNumber, bankBranch, hireDate, department, designation, role, employmentType, workLocation, shift, workingHoursPerWeek, manager, probationStartDate, probationEndDate } = req.body;
    const emp = await Employee.create({
      company: req.companyId,
      employeeId: `EMP-${Date.now()}`,
      userId: req.user._id,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      nationality,
      address,
      city,
      country: req.body.country || 'nepal',
      nationalId,
      taxId,
      bankName,
      bankAccountNumber,
      bankBranch,
      hireDate,
      department,
      designation,
      role,
      employmentType,
      workLocation,
      shift,
      workingHoursPerWeek,
      manager,
      probationStartDate,
      probationEndDate,
      isProbation: probationStartDate && probationEndDate,
      createdBy: req.user._id,
    });
    res.status(201).json(emp);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/employees/:id', protect, hrAccess, async (req, res) => {
  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/employees/:id', protect, hrAccess, async (req, res) => {
  try {
    const employee = await Employee.findOneAndDelete({ _id: req.params.id, company: req.companyId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/attendance', protect, hrAccess, async (req, res) => {
  try {
    const { employee, startDate, endDate, status } = req.query;
    const filter = { company: req.companyId };
    if (employee) filter.employee = employee;
    if (startDate) filter.date = { $gte: new Date(startDate) };
    if (endDate) filter.date = { ...filter.date, $lte: new Date(endDate) };
    if (status) filter.status = status;
    const records = await Attendance.find(filter).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/attendance', protect, hrAccess, async (req, res) => {
  try {
    const { employee, date, checkIn, checkOut, totalHours, overtimeHours, status, leaveType, notes } = req.body;
    const record = await Attendance.create({
      company: req.companyId,
      employee,
      date,
      checkIn,
      checkOut,
      totalHours,
      overtimeHours,
      status,
      leaveType,
      notes,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/attendance/:id', protect, hrAccess, async (req, res) => {
  try {
    const record = await Attendance.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      req.body,
      { new: true }
    );
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/salary', protect, hrAccess, async (req, res) => {
  try {
    const { employee, startDate, endDate, status } = req.query;
    const filter = { company: req.companyId };
    if (employee) filter.employee = employee;
    if (startDate) filter.payDate = { $gte: new Date(startDate) };
    if (endDate) filter.payDate = { ...filter.payDate, $lte: new Date(endDate) };
    if (status) filter.status = status;
    const salaries = await Salary.find(filter).populate('employee', 'firstName lastName employeeId').sort({ payDate: -1 });
    res.json(salaries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/salary', protect, hrAccess, async (req, res) => {
  try {
    const salary = await Salary.create({ ...req.body, company: req.companyId });
    res.status(201).json(salary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/salary/:id', protect, hrAccess, async (req, res) => {
  try {
    const salary = await Salary.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      req.body,
      { new: true }
    );
    if (!salary) return res.status(404).json({ message: 'Salary record not found' });
    res.json(salary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/leave', protect, hrAccess, async (req, res) => {
  try {
    const { employee, leaveType, status, startDate, endDate } = req.query;
    const filter = { company: req.companyId };
    if (employee) filter.employee = employee;
    if (leaveType) filter.leaveType = leaveType;
    if (status) filter.status = status;
    if (startDate) filter.startDate = { $gte: new Date(startDate) };
    if (endDate) filter.endDate = { ...filter.endDate, $lte: new Date(endDate) };
    const leaves = await Leave.find(filter).populate('employee', 'firstName lastName employeeId').sort({ startDate: -1 });
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/leave', protect, hrAccess, async (req, res) => {
  try {
    const { employee, leaveType, startDate, endDate, totalDays, halfDayStart, halfDayEnd, reason, documents } = req.body;
    const leave = await Leave.create({
      company: req.companyId,
      employee,
      leaveType,
      startDate,
      endDate,
      totalDays,
      halfDayStart,
      halfDayEnd,
      reason,
      documents,
    });
    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/leave/:id', protect, hrAccess, async (req, res) => {
  try {
    const leave = await Leave.findOne({ _id: req.params.id, company: req.companyId });
    if (!leave) return res.status(404).json({ message: 'Leave record not found' });
    if (hasHrAccess(req.user)) {
      Object.assign(leave, req.body);
      await leave.save();
    } else {
      return res.status(403).json({ message: 'Only admin can update leave records' });
    }
    res.json(leave);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
