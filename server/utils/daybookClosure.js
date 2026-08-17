const DayBookClosure = require('../models/DayBookClosure');

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function isDayBookClosed(companyId, date) {
  if (!companyId || !date) return false;
  const closedDate = normalizeDate(date);
  const closure = await DayBookClosure.findOne({ company: companyId, closedDate });
  return !!closure;
}

function daybookClosedCheck(dateExtractor) {
  return async (req, res, next) => {
    try {
      const date = dateExtractor(req);
      if (!date) return next();
      const closed = await isDayBookClosed(req.companyId, date);
      if (closed) return res.status(400).json({ message: 'Daybook is closed for this date. Cannot edit or delete.' });
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { isDayBookClosed, daybookClosedCheck, normalizeDate };
