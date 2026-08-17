const express = require('express');
const Emi = require('../models/Emi');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const InventoryMovement = require('../models/InventoryMovement');
const Purchase = require('../models/Purchase');
const Supplier = require('../models/Supplier');
const Bank = require('../models/Bank');
const Company = require('../models/Company');
const { protect, requirePANForLargeTx, requireEmiModule } = require('../middleware/auth');
const { round100, buildIRDPayload, adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const { postJournalEntryAtomic, postEmiAtomic } = require('../utils/postingEngine');
const { ensureCompanyEmiAccounts } = require('../utils/ensureEmiAccounts');
const { adjustBankBalance } = require('../utils/bankService');
const router = express.Router();

function formatNPRShort(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

function getFiscalYearLabel(date) {
  return getBSFiscalYear(date).label;
}

async function generateEmiNumber(companyId) {
  if (!companyId) throw new Error('No company assigned to this account');
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { emiCounter: 1 } },
      { new: true }
    );
    if (!company) throw new Error('No company assigned to this account');
    const num = String(company.emiCounter).padStart(3, '0');
    const emiNo = `EMI-${num}`;
    const exists = await Emi.exists({ emiNumber: emiNo, company: companyId });
    if (!exists) return emiNo;
  }
  throw new Error('Could not generate a unique EMI number');
}

router.get('/', protect, requireEmiModule, async (req, res) => {
  const filter = { ...req.fyFilter, ...req.companyFilter };
  if (req.query.startDate) filter.createdAt = { $gte: new Date(req.query.startDate) };
  if (req.query.endDate) {
    filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.endDate) };
  }
  const items = await Emi.find(filter)
    .populate('product', 'name sku sellingPrice')
    .populate('customer', 'name phone')
    .populate('createdBy', 'name')
    .populate('exchangeItems.product', 'name sku')
    .populate('paymentSplits.bankId', 'name')
    .sort({ createdAt: -1 });
  res.json(items);
});

router.post('/', protect, requireEmiModule, requirePANForLargeTx, async (req, res) => {
  const {
    product, customer, productTotal, exchangeEnabled, exchangeAmount, exchangeItems,
    exchangeCustomerName, exchangePaidAmount, downPayment, downPaymentPercent, downPaymentMethod, bank,
    downPaymentBank, bankName, invoiceNumber, applyVat, inclusiveVat, vatRate, vatAmount,
    tenure, monthlyEMI, interestRate, startDate, remarks,
  } = req.body;

  const productDoc = await Product.findOne({ _id: product, ...req.companyFilter });
  if (!productDoc) return res.status(400).json({ message: 'Product not found' });
  if (productDoc.stock < 1) return res.status(400).json({ message: `Insufficient stock for ${productDoc.name}` });

  const customerDoc = await Customer.findOne({ _id: customer, ...req.companyFilter });
  if (!customerDoc) return res.status(400).json({ message: 'Customer not found' });

  try {
    await ensureCompanyEmiAccounts(req.companyId);
  } catch (err) {
    console.error('ensureCompanyEmiAccounts failed:', err.message);
  }

  let bankDoc = null;
  if (bank) {
    bankDoc = await Bank.findOne({ _id: bank, ...req.companyFilter });
    if (!bankDoc) return res.status(400).json({ message: 'Bank not found' });
    // A bank used as an EMI / finance institution is a receivable, not our own bank.
    if (!bankDoc.isFinanceBank) { bankDoc.isFinanceBank = true; await bankDoc.save(); }
  }
  if (!bankDoc && (!bankName || !bankName.trim())) return res.status(400).json({ message: 'Bank is required' });
  const method = ['cash', 'qr', 'bank'].includes(downPaymentMethod) ? downPaymentMethod : 'cash';

  let downPaymentBankDoc = null;
  if (method === 'bank' && downPaymentBank) {
    downPaymentBankDoc = await Bank.findOne({ _id: downPaymentBank, ...req.companyFilter });
    if (!downPaymentBankDoc) return res.status(400).json({ message: 'Receiving bank (down payment) not found' });
  }

  const total = Math.round(parseFloat(productTotal || 0) * 100) / 100;
  let exch = 0;
  let exchangeItemsClean = [];
  if (exchangeEnabled) {
    if (Array.isArray(exchangeItems) && exchangeItems.length > 0) {
      for (const it of exchangeItems) {
        const p = await Product.findOne({ _id: it.product, ...req.companyFilter });
        if (!p) return res.status(400).json({ message: 'Exchange product not found' });
        const qty = Math.max(0, parseFloat(it.quantity) || 0);
        const price = Math.round((parseFloat(it.price) || 0) * 100) / 100;
        if (qty <= 0) return res.status(400).json({ message: 'Exchange quantity must be greater than zero' });
        exchangeItemsClean.push({
          product: p._id, quantity: qty, price,
          condition: 'second_hand',
          status: 'accepted',
        });
        exch += price * qty;
      }
      exch = Math.round(exch * 100) / 100;
    } else {
      exch = Math.round(parseFloat(exchangeAmount || 0) * 100) / 100;
    }
  }
  const net = Math.round((total - exch) * 100) / 100;
  const down = Math.round(parseFloat(downPayment || 0) * 100) / 100;
  const exchangePaid = exchangeEnabled ? Math.round(parseFloat(exchangePaidAmount || 0) * 100) / 100 : 0;
  const bankLabel = (bankDoc ? bankDoc.name : (bankName || '')).trim();
  const emiBankAccount = bankLabel ? `EMI-(${bankLabel})` : '';

  if (total <= 0) return res.status(400).json({ message: 'Product total must be greater than zero' });
  if (exch < 0 || exch > total) return res.status(400).json({ message: 'Exchange amount cannot exceed the product total' });
  if (down < 0 || down > net) return res.status(400).json({ message: 'Down payment cannot exceed the net amount' });

  let emiNumber;
  if (invoiceNumber && invoiceNumber.trim()) {
    emiNumber = invoiceNumber.trim();
  } else {
    try {
      emiNumber = await generateEmiNumber(req.companyId);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  const vatPct = parseFloat(vatRate) || 0;
  let grossAmount, salesNet, vatAmt;
  if (vatPct > 0 && inclusiveVat) {
    grossAmount = total;
    salesNet = Math.round((total / (1 + vatPct / 100)) * 100) / 100;
    vatAmt = Math.round((total - salesNet) * 100) / 100;
  } else if (vatPct > 0) {
    salesNet = total;
    vatAmt = Math.round((total * vatPct / 100) * 100) / 100;
    grossAmount = Math.round((total + vatAmt) * 100) / 100;
  } else {
    salesNet = total;
    vatAmt = 0;
    grossAmount = total;
  }

  const paymentSplits = [];
  if (exch > 0) {
    paymentSplits.push({
      type: 'exchange_credit',
      amount: exch,
      date: new Date(),
      reference: `EXC-${emiNumber}`,
      createdBy: req.user._id,
    });
  }
  if (down > 0) {
    const downBankId = method === 'bank' && downPaymentBankDoc ? downPaymentBankDoc._id : (method === 'qr' && bankDoc ? bankDoc._id : undefined);
    const downBankName = method === 'bank' && downPaymentBankDoc ? downPaymentBankDoc.name : bankLabel;
    paymentSplits.push({
      type: method === 'bank' ? 'bank_transfer' : method,
      amount: down,
      bankId: downBankId,
      bankName: downBankName,
      method,
      date: new Date(),
      createdBy: req.user._id,
    });
  }
  const remaining = Math.round((grossAmount - exch - down) * 100) / 100;
  if (remaining > 0) {
    paymentSplits.push({
      type: 'bank_emi',
      amount: remaining,
      bankId: bankDoc ? bankDoc._id : undefined,
      bankName: bankLabel,
      date: new Date(),
      createdBy: req.user._id,
    });
  }

  const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  const bankEmiClearing = await Account.findOne({ code: '10360', ...req.companyFilter });
  const usedGoodsAccount = await Account.findOne({ code: '10450', ...req.companyFilter });
  const salesAccount = await Account.findOne({ code: '40100', ...req.companyFilter });
  const inventoryAccount = await Account.findOne({ code: '10400', ...req.companyFilter });
  const cogsAccount = await Account.findOne({ code: '50100', ...req.companyFilter });
  const outputVatAccount = await Account.findOne({ code: '20200', ...req.companyFilter });

  if (!bankEmiClearing) return res.status(400).json({ message: 'Bank EMI Clearing account (10360) is not configured.' });
  if (!usedGoodsAccount) return res.status(400).json({ message: 'Used / Exchange Goods Stock (10450) is not configured.' });

  const journalSpecs = [];

  // ─── STAGE 1: Single combined journal entry at time of sale ───
  // Dr Cash (down cash) + Dr Company Bank (down bank) + Dr EMI Clearing (financed) → Cr Sales + Cr VAT
  {
    const lines = [];
    const downCash = method === 'cash' ? down : 0;
    const downBank = (method === 'bank' || method === 'qr') ? down : 0;

    if (downCash > 0 && cashAccount) {
      lines.push({ account: cashAccount._id, debit: downCash, credit: 0 });
    }
    if (downBank > 0 && bankAccount) {
      lines.push({ account: bankAccount._id, debit: downBank, credit: 0, bank: downPaymentBankDoc ? downPaymentBankDoc._id : undefined });
    }
    if (remaining > 0) {
      lines.push({ account: bankEmiClearing._id, debit: remaining, credit: 0 });
    }
    if (salesNet > 0 && salesAccount) {
      lines.push({ account: salesAccount._id, debit: 0, credit: salesNet });
    }
    if (vatAmt > 0 && outputVatAccount) {
      lines.push({ account: outputVatAccount._id, debit: 0, credit: vatAmt });
    }

    if (lines.length >= 2) {
      journalSpecs.push({
        reference: emiNumber,
        description: `EMI Sale ${emiNumber} - ${productDoc.name} (Down ${formatNPRShort(down)} / Financed ${formatNPRShort(remaining)})`,
        lines,
      });
    }
  }

  // Exchange trade-in: Dr Used Goods Stock → Cr EMI Clearing (reduces what bank owes)
  if (exch > 0 && usedGoodsAccount) {
    journalSpecs.push({
      reference: `EXC-${emiNumber}`,
      description: `Trade-in received ${emiNumber} - exchange goods`,
      lines: [
        { account: usedGoodsAccount._id, debit: exch, credit: 0 },
        { account: bankEmiClearing._id, debit: 0, credit: exch },
      ],
    });
  }

  // COGS
  if (inventoryAccount && cogsAccount && productDoc.costPrice > 0) {
    journalSpecs.push({
      reference: emiNumber,
      description: `COGS for EMI ${emiNumber} - ${productDoc.name} (Unit Cost ${productDoc.costPrice})`,
      lines: [
        { account: cogsAccount._id, debit: productDoc.costPrice, credit: 0 },
        { account: inventoryAccount._id, debit: 0, credit: productDoc.costPrice },
      ],
    });
  }

  const irdPayload = buildIRDPayload({
    invoiceNumber: emiNumber,
    adDate: new Date(),
    transactionType: 'emi',
    seller: {},
    buyer: { name: customerDoc?.name || '-', pan: customerDoc?.pan || '' },
    items: [{
      sn: 1,
      description: productDoc.name,
      quantity: 1,
      unit: 'pcs',
      rate: salesNet,
      amount: round100(salesNet),
    }],
    totals: {
      totalGrossAmount: round100(grossAmount),
      nonTaxableAmount: round100(exchangePaid > 0 ? exchangePaid : 0),
      taxableAmount: round100(salesNet),
      vatAmount: round100(vatAmt),
      grandTotal: round100(grossAmount),
    },
    printerMeta: { printerName: '', user: req.user?.name || '', software: 'ERP-Nepal v1.0' },
  });

  const exchangeItemsProducts = {};
  for (const it of exchangeItemsClean) {
    exchangeItemsProducts[it.product.toString()] = it;
  }

  try {
    const emiData = {
      emiNumber,
      product: productDoc._id,
      customer: customerDoc._id,
      productTotal: total,
      exchangeEnabled: !!exchangeEnabled,
      exchangeAmount: exch,
      exchangeCustomerName: exchangeEnabled && exchangeCustomerName && exchangeCustomerName.trim() ? exchangeCustomerName.trim() : undefined,
      exchangePaidAmount: exchangePaid,
      exchangeItems: exchangeItemsClean,
      netAmount: net,
      downPayment: down,
      downPaymentPercent: downPaymentPercent ? parseFloat(downPaymentPercent) : undefined,
      downPaymentBank: downPaymentBankDoc ? downPaymentBankDoc._id : undefined,
      remainingAmount: remaining,
      vatAmount: vatAmt,
      grossBill: grossAmount,
      vatRate: vatPct,
      inclusiveVat: !!inclusiveVat,
      bankName: bankDoc ? bankDoc.name : bankName.trim(),
      bank: bankDoc ? bankDoc._id : undefined,
      downPaymentMethod: method,
      paymentSplits,
      tenure: tenure ? parseInt(tenure) : undefined,
      monthlyEMI: monthlyEMI ? Math.round(parseFloat(monthlyEMI) * 100) / 100 : undefined,
      interestRate: interestRate ? parseFloat(interestRate) : 0,
      startDate: startDate ? new Date(startDate) : undefined,
      remarks: remarks ? remarks.trim() : undefined,
      createdBy: req.user._id,
      company: req.companyId,
      fiscalYear: getFiscalYearLabel(new Date()),
      fiscalYearId: req.fiscalYearId || undefined,
    };

    const emi = await postEmiAtomic({
      emiData,
      productDoc,
      exchangeItemsClean,
      exchangeItemsProducts,
      journalSpecs,
      companyId: req.companyId,
      createdBy: req.user._id,
      fiscalYear: getFiscalYear(new Date()),
      fiscalYearId: req.fiscalYearId || undefined,
      miti: adToBikramSambat(new Date()),
      irdPayload,
      companyFilter: req.companyFilter,
    });

    if (method === 'bank' && downPaymentBankDoc) {
      await adjustBankBalance(downPaymentBankDoc._id, down, req.companyFilter).catch(err => console.error('EMI down payment bank balance error:', err.message));
    }

    const populated = await Emi.findOne({ _id: emi._id, ...req.companyFilter })
      .populate('product', 'name sku sellingPrice')
      .populate('customer', 'name phone')
      .populate('createdBy', 'name')
      .populate('paymentSplits.bankId', 'name');
    res.status(201).json(populated);
  } catch (err) {
    console.error('EMI creation error:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to create EMI' });
  }
});

function calculateAmortization(remainingBalance, monthlyPayment, interestRate = 0) {
  const interestComponent = Math.round((remainingBalance * interestRate / 12 / 100) * 100) / 100;
  const principalComponent = Math.max(0, Math.round((monthlyPayment - interestComponent) * 100) / 100);
  return {
    interest: interestComponent,
    principal: principalComponent,
    newBalance: Math.max(0, Math.round((remainingBalance - principalComponent) * 100) / 100),
  };
}

router.post('/:id/pay', protect, requireEmiModule, async (req, res) => {
  const emi = await Emi.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('customer', 'name phone pan');
  if (!emi) return res.status(404).json({ message: 'EMI not found' });

  const { amount, method, interestRate = 0 } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid payment amount' });
  if (!['cash', 'qr', 'bank'].includes(method)) {
    return res.status(400).json({ message: 'Invalid payment method. Must be cash, qr, or bank' });
  }

  const remainingBefore = emi.remainingAmount || 0;
  if (amount > remainingBefore + 0.01) {
    return res.status(400).json({ message: `Payment exceeds remaining balance of ${remainingBefore}` });
  }

  const { interest, principal, newBalance } = calculateAmortization(remainingBefore, amount, interestRate);
  const payment = {
    date: new Date(),
    amount: Math.round(amount * 100) / 100,
    principal,
    interest,
    method,
    reference: `EMI-${emi.emiNumber}-PYMT`,
    createdBy: req.user._id,
  };

  emi.payments = emi.payments || [];
  emi.payments.push(payment);
  emi.totalPaid = Math.round(((emi.totalPaid || 0) + principal) * 100) / 100;
  emi.remainingAmount = newBalance;
  emi.paidStatus = newBalance === 0 ? 'completed' : (emi.totalPaid > 0 ? 'partial' : 'pending');
  await emi.save();

  try {
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const bankEmiReceivable = await Account.findOne({ code: '10360', ...req.companyFilter });
    const interestIncomeAccount = await Account.findOne({ code: '40300', ...req.companyFilter });

    if (!bankEmiReceivable) {
      return res.status(400).json({ message: 'Bank EMI Receivable account (10360) not configured' });
    }

    const lines = [];
    const paymentAccount = method === 'cash' ? cashAccount : bankAccount;

    if (paymentAccount) lines.push({ account: paymentAccount._id, debit: amount, credit: 0 });
    if (principal > 0) lines.push({ account: bankEmiReceivable._id, debit: 0, credit: principal });
    if (interest > 0 && interestIncomeAccount) {
      lines.push({ account: interestIncomeAccount._id, debit: 0, credit: interest });
    }

    // Guarantee the EMI collection journal is always balanced (defensive)
    {
      const tDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
      const tCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
      const adj = Math.round((tDebit - tCredit) * 100) / 100;
      if (Math.abs(adj) > 0.0001 && lines.length) {
        const target = [...lines].reverse().find(l => (l.debit || 0) > 0) || [...lines].reverse().find(l => (l.credit || 0) > 0) || lines[lines.length - 1];
        if ((target.debit || 0) > 0) target.debit = Math.round(((target.debit || 0) - adj) * 100) / 100;
        else target.credit = Math.round(((target.credit || 0) + adj) * 100) / 100;
      }
    }

    const irdPayload = buildIRDPayload({
      invoiceNumber: payment.reference,
      adDate: new Date(),
      transactionType: 'emi_payment',
      seller: {},
      buyer: { name: emi.customer?.name || '-', pan: emi.customer?.pan || '' },
      items: [{
        sn: 1,
        description: `EMI Collection - ${emi.emiNumber}`,
        quantity: 1,
        unit: 'pcs',
        rate: amount,
        amount: round100(amount),
      }],
      totals: {
        totalGrossAmount: round100(amount),
        nonTaxableAmount: 0,
        taxableAmount: round100(principal + interest),
        vatAmount: 0,
        grandTotal: round100(amount),
      },
      printerMeta: { printerName: '', user: req.user?.name || '', software: 'ERP-Nepal v1.0' },
    });

    if (lines.length >= 2) {
      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(),
        reference: payment.reference,
        description: `EMI Collection - ${emi.emiNumber}`,
        fiscalYear: emi.fiscalYear || getFiscalYear(new Date()),
        fiscalYearId: emi.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date()),
        lines,
        createdBy: req.user._id,
        irdPayload,
        companyFilter: req.companyFilter,
      });
    }

    await emi.populate('product', 'name sku');
    await emi.populate('customer', 'name phone');
    res.json(emi);
  } catch (err) {
    console.error('EMI payment journal error:', err.message);
    return res.status(500).json({ message: 'Payment recorded but journal failed', emi });
  }
});

// Stage 2: Bank disburses the financed loan to the company (clears the Bank EMI Clearing A/C)
// Dr Company Bank + Dr Bank Charges → Cr EMI Clearing
router.post('/:id/disburse', protect, requireEmiModule, async (req, res) => {
  const emi = await Emi.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('customer', 'name phone pan');
  if (!emi) return res.status(404).json({ message: 'EMI not found' });
  if (emi.disbursementStatus === 'disbursed') {
    return res.status(400).json({ message: 'Bank disbursement already recorded for this EMI' });
  }

  const { amount, bankCharge = 0, disbursingBank } = req.body;
  const remaining = emi.remainingAmount || 0;
  const netReceived = Math.round(parseFloat(amount) * 100) / 100;
  const charge = Math.round(parseFloat(bankCharge) * 100) / 100;
  if (!(netReceived >= 0) || Math.abs((netReceived + charge) - remaining) > 0.01) {
    return res.status(400).json({ message: `Disbursed amount (${netReceived}) + bank charge (${charge}) must equal the financed remainder (${remaining})` });
  }

  const bankEmiClearing = await Account.findOne({ code: '10360', ...req.companyFilter });
  const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
  const bankChargeAccount = await Account.findOne({ code: '60900', ...req.companyFilter });
  if (!bankEmiClearing) return res.status(400).json({ message: 'Bank EMI Clearing account (10360) not configured' });
  if (!bankAccount) return res.status(400).json({ message: 'Sales Bank Account (10200) not configured' });

  // Stage 2: Dr Company Bank (net payout) + Dr Bank Charges (fee) → Cr EMI Clearing (full financed amount)
  const lines = [];
  if (netReceived > 0) lines.push({ account: bankAccount._id, debit: netReceived, credit: 0, bank: disbursingBank || emi.bank || undefined });
  if (charge > 0 && bankChargeAccount) lines.push({ account: bankChargeAccount._id, debit: charge, credit: 0 });
  if (remaining > 0) lines.push({ account: bankEmiClearing._id, debit: 0, credit: remaining });

  const irdPayload = buildIRDPayload({
    invoiceNumber: `DISB-${emi.emiNumber}`,
    adDate: new Date(),
    transactionType: 'emi_disbursement',
    seller: {},
    buyer: { name: emi.customer?.name || '-', pan: emi.customer?.pan || '' },
    items: [{ sn: 1, description: `Bank disbursement ${emi.emiNumber}`, quantity: 1, unit: 'pcs', rate: netReceived, amount: round100(netReceived) }],
    totals: { totalGrossAmount: round100(netReceived + charge), nonTaxableAmount: 0, taxableAmount: round100(netReceived), vatAmount: 0, grandTotal: round100(netReceived + charge) },
    printerMeta: { printerName: '', user: req.user?.name || '', software: 'ERP-Nepal v1.0' },
  });

  try {
    await postJournalEntryAtomic({
      companyId: req.companyId,
      date: new Date(),
      reference: `DISB-${emi.emiNumber}`,
      description: `Bank EMI disbursement ${emi.emiNumber} - Net ${formatNPRShort(netReceived)}${charge > 0 ? ` (Fee ${formatNPRShort(charge)})` : ''}`,
      fiscalYear: emi.fiscalYear || getFiscalYear(new Date()),
      fiscalYearId: emi.fiscalYearId || undefined,
      miti: adToBikramSambat(new Date()),
      lines,
      createdBy: req.user._id,
      irdPayload,
      companyFilter: req.companyFilter,
    });

    if (disbursingBank) {
      await adjustBankBalance(disbursingBank, netReceived, req.companyFilter).catch(err => console.error('EMI disbursement bank balance error:', err.message));
    }

    emi.disbursedAmount = netReceived;
    emi.bankCharge = charge;
    emi.disbursedAt = new Date();
    emi.disbursementStatus = 'disbursed';
    emi.disbursingBank = disbursingBank || emi.bank || undefined;
    await emi.save();

    const populated = await Emi.findOne({ _id: emi._id, ...req.companyFilter })
      .populate('product', 'name sku')
      .populate('customer', 'name phone')
      .populate('disbursingBank', 'name');
    res.json(populated);
  } catch (err) {
    console.error('EMI disbursement error:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to record disbursement' });
  }
});

module.exports = router;
