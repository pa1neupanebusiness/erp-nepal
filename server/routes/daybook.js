const express = require('express');
const { getDaybookReport } = require('../utils/daybookService');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const { date, from, to, daybookType } = req.query;
    const report = await getDaybookReport({
      companyId: req.companyId,
      date: date || null,
      from: from || null,
      to: to || null,
      daybookType: daybookType || null,
      fiscalRange: req.fyFilter?.createdAt || null,
    });
    res.json(report);
  } catch (err) {
    console.error('Daybook report error:', err.message);
    res.status(500).json({ message: 'Failed to generate daybook report', error: err.message });
  }
});

module.exports = router;
