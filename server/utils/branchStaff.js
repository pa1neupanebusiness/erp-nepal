// Branch staff position -> access group mapping + salary record sync.
// Positions are set via BranchManagement "Add Staff" (or user form) and drive
// the fine-grained `groups` used by Layout.js / App.js route guards.

const { randomBytes } = require('crypto');

const POSITION_GROUPS = {
  Manager: ['pos', 'inventory', 'branch'],
  Supervisor: ['pos', 'inventory', 'branch'],
  Accountant: ['pos', 'inventory', 'accounts', 'branch'],
  Staff: ['branch'],
  Driver: ['driver', 'branch'],
  Helper: [],
};

function groupsForPosition(position) {
  const groups = POSITION_GROUPS[position];
  return Array.isArray(groups) ? [...groups] : ['branch'];
}

async function syncEmployeeForUser(user, position) {
  if (!user || !user.name) return;
  if (!user.company) return;
  const Employee = require('../models/Employee');
  const name = String(user.name).trim().split(/\s+/).filter(Boolean);
  const firstName = name[0] || '';
  const lastName = name.slice(1).join(' ') || '';
  const existing = await Employee.findOne({ userId: user._id, company: user.company });
  const data = {
    company: user.company,
    employeeId: existing && existing.employeeId ? existing.employeeId : `EMP-${Date.now()}-${randomBytes(3).toString('hex')}`,
    userId: user._id,
    firstName,
    lastName,
    email: user.email || '',
    phone: user.phone || '',
    hireDate: user.createdAt || new Date(),
    designation: position || user.branchPosition || '',
    role: position || user.branchPosition || '',
    workLocation: user.branch ? String(user.branch) : '',
    isActive: user.isActive !== false,
  };
  if (existing) {
    await Employee.updateOne({ _id: existing._id }, { $set: data });
    return existing;
  }
  return Employee.create(data);
}

module.exports = { POSITION_GROUPS, groupsForPosition, syncEmployeeForUser };