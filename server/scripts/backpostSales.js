/* eslint-disable no-console */
// Back-posts the sale + COGS journal entries (and refund reversals) for sales
// that were created before the `customerDoc` bug fix, so the ledger, trial
// balance and balance sheet reflect the correct Cash / Bank / Debtors position.
//
// Idempotent: skips any sale that already has a matching sales journal entry.
//
// Usage:
//   node scripts/backpostSales.js            # uses MONGO_URI from .env
//   set MONGO_URI=... && node scripts/backpostSales.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set. Aborting.');
  process.exit(1);
}

function fyLabel(date) {
  const d = date ? new Date(date) : new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const day = d.getDate();
  const start = (m > 7 || (m === 7 && day >= 16)) ? y : y - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

async function applyLines(lines) {
  for (const line of lines) {
    if (!line.account) continue;
    await Account.updateOne(
      { _id: line.account },
      { $inc: { balance: Math.round((line.debit - line.credit) * 100) / 100 } }
    );
  }
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB');

  const vatEnabled = process.env.VAT_ENABLED !== 'false';
  const companies = await Sale.distinct('company');
  let fixedSales = 0;
  let skipped = 0;

  for (const companyId of companies) {
    const sales = await Sale.find({ company: companyId }).sort({ createdAt: 1 });
    for (const sale of sales) {
      const existing = await JournalEntry.findOne({
        company: companyId,
        reference: sale.invoiceNumber,
        description: { $in: [`POS Sale ${sale.invoiceNumber}`, `Sales Invoice ${sale.invoiceNumber}`] },
      });
      if (existing) { skipped++; continue; }

      const cashAccount = await Account.findOne({ code: '10100', company: companyId });
      const bankAccount = await Account.findOne({ code: '10200', company: companyId });
      const receivableAccount = await Account.findOne({ code: '10300', company: companyId });
      const salesAccount = await Account.findOne({ code: '40100', company: companyId });
      const vatAccount = await Account.findOne({ code: '20200', company: companyId });
      const discountAccount = await Account.findOne({ code: '40200', company: companyId });
      const inventoryAccount = await Account.findOne({ code: '10400', company: companyId });
      const cogsAccount = await Account.findOne({ code: '50100', company: companyId });

      const tax = vatEnabled ? (sale.taxTotal || 0) : 0;
      const pm = sale.paymentMethod;
      const debitAccount = pm === 'credit' ? receivableAccount
        : (pm === 'qr' || pm === 'bank') ? bankAccount
          : cashAccount;

      const lines = [];
      if (debitAccount && salesAccount) {
        lines.push({ account: debitAccount._id, debit: sale.grandTotal, credit: 0 });
        lines.push({ account: salesAccount._id, debit: 0, credit: sale.grandTotal + (sale.discount || 0) - tax });
        if (tax > 0 && vatAccount) lines.push({ account: vatAccount._id, debit: 0, credit: tax });
        if ((sale.discount || 0) > 0 && discountAccount) lines.push({ account: discountAccount._id, debit: sale.discount, credit: 0 });
      }

      let totalCost = 0;
      for (const item of sale.items) totalCost += (item.costPrice || 0) * item.quantity;

      const cogsLines = [];
      if (totalCost > 0 && inventoryAccount && cogsAccount) {
        cogsLines.push({ account: cogsAccount._id, debit: totalCost, credit: 0 });
        cogsLines.push({ account: inventoryAccount._id, debit: 0, credit: totalCost });
      }

      // Refunded sales also need the reversal entries.
      const refundLines = [];
      const refundCogsLines = [];
      if (sale.status === 'refunded') {
        if (debitAccount && salesAccount) {
          refundLines.push({ account: salesAccount._id, debit: sale.grandTotal + (sale.discount || 0) - tax, credit: 0 });
          refundLines.push({ account: debitAccount._id, debit: 0, credit: sale.grandTotal });
          if (tax > 0 && vatAccount) refundLines.push({ account: vatAccount._id, debit: tax, credit: 0 });
          if ((sale.discount || 0) > 0 && discountAccount) refundLines.push({ account: discountAccount._id, debit: 0, credit: sale.discount });
        }
        if (totalCost > 0 && inventoryAccount && cogsAccount) {
          refundCogsLines.push({ account: inventoryAccount._id, debit: totalCost, credit: 0 });
          refundCogsLines.push({ account: cogsAccount._id, debit: 0, credit: totalCost });
        }
      }

      const entryDate = sale.invoiceDate || sale.createdAt || new Date();
      const fy = sale.fiscalYear || fyLabel(entryDate);

      if (lines.length > 1) {
        await JournalEntry.create({
          date: entryDate, reference: sale.invoiceNumber,
          description: `${sale.source === 'invoice' ? 'Sales Invoice' : 'POS Sale'} ${sale.invoiceNumber}`,
          lines, fiscalYear: fy, company: companyId,
        });
        await applyLines(lines);
      }
      if (cogsLines.length > 0) {
        await JournalEntry.create({
          date: entryDate, reference: sale.invoiceNumber,
          description: `COGS for ${sale.invoiceNumber}`,
          lines: cogsLines, fiscalYear: fy, company: companyId,
        });
        await applyLines(cogsLines);
      }
      if (refundLines.length > 1) {
        await JournalEntry.create({
          date: entryDate, reference: `RFND-${sale.invoiceNumber}`,
          description: `Refund ${sale.invoiceNumber}: back-post`,
          lines: refundLines, fiscalYear: fy, company: companyId,
        });
        await applyLines(refundLines);
      }
      if (refundCogsLines.length > 0) {
        await JournalEntry.create({
          date: entryDate, reference: `RFND-${sale.invoiceNumber}`,
          description: `COGS reversal for refund ${sale.invoiceNumber}`,
          lines: refundCogsLines, fiscalYear: fy, company: companyId,
        });
        await applyLines(refundCogsLines);
      }

      if (lines.length > 1 || refundLines.length > 1) fixedSales++;
    }
  }

  console.log(`Done. Back-posted ${fixedSales} sales, skipped ${skipped} already-posted.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Back-post failed:', err.message);
  process.exit(1);
});
