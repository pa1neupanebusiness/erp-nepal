const FiscalYear = require('../models/FiscalYear');

function endOfDay(d) {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Strict rule: data is always shown only within the fiscal year's actual
// period. The active fiscal year does NOT extend past its end date — the admin
// must keep the active FY covering the current period (set via "Make Active").
function effectiveEnd(end) {
  return endOfDay(end);
}

async function fiscalYearFilter(req, res, next) {
  const { fyStart, fyEnd, fiscalYear, fyIsActive } = req.query;

  let start = null;
  let end = null;

  if (fiscalYear) {
    try {
      const query = req.companyId ? { _id: fiscalYear, company: req.companyId } : { _id: fiscalYear };
      const year = await FiscalYear.findOne(query);
      if (year) {
        start = new Date(year.startDate);
        end = effectiveEnd(year.endDate, year.isActive);
        req.fiscalYearId = year._id;
      }
    } catch (err) {
      // Fall back to provided dates if FiscalYear lookup fails
    }
  }

  if (!start && fyStart && fyEnd) {
    const isActiveFy = fyIsActive !== '0';
    start = new Date(fyStart);
    end = effectiveEnd(fyEnd, isActiveFy);
  }

  if (!start) {
    try {
      const query = req.companyId ? { isActive: true, company: req.companyId } : { isActive: true };
      const year = await FiscalYear.findOne(query);
      if (year) {
        start = new Date(year.startDate);
        end = effectiveEnd(year.endDate, true);
        req.fiscalYearId = year._id;
      }
    } catch {
      start = null;
      end = null;
    }
  }

  req.fyFilter = start
    ? (req.fiscalYearId
        ? { $or: [
            { createdAt: { $gte: start, $lte: end } },
            { fiscalYearId: req.fiscalYearId },
          ] }
        : { createdAt: { $gte: start, $lte: end } })
    : {};
  next();
}

module.exports = fiscalYearFilter;
