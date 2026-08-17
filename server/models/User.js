const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super_admin', 'admin', 'hr', 'user'], default: 'user' },
  groups: [{ type: String, enum: ['pos', 'inventory', 'accounts', 'hr', 'driver', 'branch'] }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  branchPosition: { type: String, default: '' },
  isCompanySuperAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
