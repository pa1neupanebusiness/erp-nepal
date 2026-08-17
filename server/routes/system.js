const express = require('express');
const { adToBikramSambat } = require('../utils/dateUtils');
const router = express.Router();

// GET /api/system/time
// Authoritative system/server timestamp used by report footers.
// Returns ISO, English and Nepali (Bikram Sambat) date/time so every report
// shows a single consistent "Nepali timestamp" sourced from the system clock
// rather than the user's browser clock.
router.get('/time', (req, res) => {
  const d = new Date();
  const bs = adToBikramSambat(d);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  res.json({
    time: d.toISOString(),
    enDate: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    enTime: time,
    bsDate: bs,
    bsTime: time,
  });
});

module.exports = router;
