const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'erp_jwt_secret_key');
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin' || req.user.role === 'hr')) {
    next();
  } else {
    res.status(403).json({ message: 'Admin access required' });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Super admin access required' });
  }
};

const hrOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin' || req.user.role === 'hr')) {
    next();
  } else {
    res.status(403).json({ message: 'HR access required' });
  }
};

const validatePAN = (pan) => {
  if (!pan) return false;
  const panStr = String(pan).replace(/[-\s]/g, '');
  return /^\d{9}$/.test(panStr);
};

const requirePANForLargeTx = (req, res, next) => {
  const { customerPan, billingAmount, amount } = req.body;
  const total = parseFloat(billingAmount || amount || 0);
  if (total > 5000) {
    if (!customerPan || !validatePAN(customerPan)) {
      return res.status(400).json({ message: 'PAN (9 digits) is mandatory for transactions over NPR 5,000' });
    }
  }
  next();
};

const hrAccess = (req, res, next) => {
  if (hasHrAccess(req.user)) {
    next();
  } else {
    res.status(403).json({ message: 'HR access required' });
  }
};

const hasHrAccess = (user) => {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'hr') return true;
  return Array.isArray(user.groups) && user.groups.includes('hr');
};

const requireEmiModule = async (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') return next();
  try {
    const Company = require('../models/Company');
    const company = await Company.findById(req.companyId).select('enabledModules');
    if (company && Array.isArray(company.enabledModules) && company.enabledModules.includes('emi')) return next();
  } catch (_) { /* fall through */ }
  return res.status(403).json({ message: 'EMI module is not enabled for this company' });
};

module.exports = {
  protect,
  adminOnly,
  superAdminOnly,
  hrOnly,
  hrAccess,
  validatePAN,
  requirePANForLargeTx,
  hasHrAccess,
  requireEmiModule,
};
