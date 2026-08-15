const Notification = require('../models/Notification');

async function createNotification({ type, title, message, reference, amount, companyId, userId }) {
  try {
    await Notification.create({
      type, title, message, reference: reference || '',
      amount: amount || 0, company: companyId, createdBy: userId,
    });
  } catch (err) { console.error('Notification create error:', err.message); }
}

module.exports = { createNotification };
