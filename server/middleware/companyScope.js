const { Types } = require('mongoose');

function resolveCompanyId(req) {
  const headerId = req.headers['x-company-id'];
  const override =
    req.user &&
    req.user.role === 'super_admin' &&
    headerId &&
    Types.ObjectId.isValid(String(headerId))
      ? String(headerId)
      : null;
  return override || (req.user && req.user.company) || null;
}

module.exports = function companyScope(req, res, next) {
  Object.defineProperty(req, 'companyFilter', {
    get: function () {
      const activeCompany = resolveCompanyId(req);
      return activeCompany ? { company: activeCompany } : {};
    },
  });
  Object.defineProperty(req, 'companyId', {
    get: function () {
      return resolveCompanyId(req);
    },
  });
  next();
};
