const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ company: req.companyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('createdBy', 'name');
    const unreadCount = await Notification.countDocuments({ company: req.companyId, read: false });
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ company: req.companyId, read: false }, { read: true });
    res.json({ message: 'All marked as read' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/clear', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ company: req.companyId });
    res.json({ message: 'All notifications cleared' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, company: req.companyId });
    res.json({ message: 'Notification deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
