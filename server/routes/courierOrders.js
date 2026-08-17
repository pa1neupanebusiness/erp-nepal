const express = require('express');
const CourierOrder = require('../models/CourierOrder');
const OrderTracking = require('../models/OrderTracking');
const Company = require('../models/Company');
const Sale = require('../models/Sale');
const Account = require('../models/Account');
const Bank = require('../models/Bank');
const Customer = require('../models/Customer');
const { protect, adminOnly, requireTrackingModule } = require('../middleware/auth');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { adjustBankBalance } = require('../utils/bankService');
const { getBSFiscalYear, adToBikramSambat } = require('../utils/dateUtils');
const { createNotification } = require('../utils/notifyService');
const router = express.Router();

router.use(protect, requireTrackingModule);

async function generateInvoice(companyId) {
  const fy = getBSFiscalYear().label;
  for (let i = 0; i < 10; i++) {
    const company = await Company.findOneAndUpdate({ _id: companyId }, { $inc: { invoiceCounter: 1 } }, { new: true });
    if (!company) throw new Error('No company');
    const num = String(company.invoiceCounter).padStart(4, '0');
    const invNo = `${fy}-${num}`;
    const exists = await Sale.exists({ invoiceNumber: invNo, company: companyId });
    if (!exists) return invNo;
  }
  throw new Error('Could not generate unique invoice number');
}

async function generateTrackingNumber(companyId) {
  const company = await Company.findOneAndUpdate({ _id: companyId }, { $inc: { trackingCounter: 1 } }, { new: true });
  const seq = String(company.trackingCounter).padStart(5, '0');
  return `TRK-${seq}`;
}

router.get('/companies/:id/banks', protect, async (req, res) => {
  const banks = await Bank.find({ company: req.params.id }).sort({ name: 1 });
  res.json(banks);
});

router.get('/', async (req, res) => {
  const items = await CourierOrder.find({ ...req.companyFilter })
    .populate('sale', 'invoiceNumber grandTotal amountPaid paymentMethod')
    .populate('bank', 'name accountNumber')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(items);
});

router.get('/by-tracking/:trackingNumber', async (req, res) => {
  const item = await CourierOrder.findOne({ trackingNumber: req.params.trackingNumber, ...req.companyFilter })
    .populate('sale', 'invoiceNumber grandTotal amountPaid paymentMethod')
    .populate('bank', 'name accountNumber')
    .populate('tracking', 'trackingNumber status currentLocation events');
  if (!item) return res.status(404).json({ message: 'Courier order not found' });
  res.json(item);
});

router.get('/:id', async (req, res) => {
  const item = await CourierOrder.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('sale')
    .populate('tracking')
    .populate('bank', 'name accountNumber');
  if (!item) return res.status(404).json({ message: 'Courier order not found' });
  res.json(item);
});

router.post('/', adminOnly, async (req, res) => {
  const {
    senderName, senderAddress, senderPhone,
    receiverName, receiverAddress, receiverPhone,
    instructions, deliveryLocation, deliveryType, destinationBranch,
    estimatedDelivery, price, weight, unit, quantity, ratePerUnit,
    vatRate, inclusiveVat,
    paymentMethod, bankId, remarks,
  } = req.body;

  if (!senderName) return res.status(400).json({ message: 'Sender name is required' });
  if (!receiverName) return res.status(400).json({ message: 'Receiver name is required' });

  const qty = Number(quantity) || 1;
  const wt = Number(weight) || 0;
  const rate = Number(ratePerUnit) || 0;
  const calculatedPrice = (wt > 0 && rate > 0) ? Math.round(qty * wt * rate * 100) / 100 : (Number(price) || 0);
  if (!calculatedPrice || calculatedPrice <= 0) return res.status(400).json({ message: 'Price is required' });

  const companyDoc = await Company.findById(req.companyId);
  if (!companyDoc) return res.status(404).json({ message: 'Company not found' });

  const effectiveVatRate = vatRate || companyDoc.vatRate || 13;
  let vatAmount = 0;
  let salePrice = calculatedPrice;
  if (inclusiveVat) {
    salePrice = Math.round(calculatedPrice / (1 + effectiveVatRate / 100) * 100) / 100;
    vatAmount = Math.round((calculatedPrice - salePrice) * 100) / 100;
  } else {
    vatAmount = Math.round(calculatedPrice * effectiveVatRate / 100 * 100) / 100;
  }
  const grandTotal = inclusiveVat ? calculatedPrice : Math.round((salePrice + vatAmount) * 100) / 100;

  const invoiceNumber = await generateInvoice(req.companyId);
  const trackingNumber = await generateTrackingNumber(req.companyId);

  let customerDoc = null;
  if (receiverPhone) {
    customerDoc = await Customer.findOne({ phone: receiverPhone, ...req.companyFilter });
    if (!customerDoc) {
      customerDoc = await Customer.create({
        name: receiverName, phone: receiverPhone, address: receiverAddress || '',
        company: req.companyId,
      });
    }
  }

  const saleDoc = new Sale({
    invoiceNumber,
    items: [{ quantity: weight || 1, price: salePrice, costPrice: 0, tax: vatAmount, subtotal: salePrice }],
    subtotal: salePrice,
    taxTotal: vatAmount,
    discount: 0,
    grandTotal,
    amountPaid: grandTotal,
    dueAmount: 0,
    paymentStatus: 'paid',
    paymentMethod: paymentMethod || 'cash',
    bank: paymentMethod === 'qr' ? bankId : undefined,
    customer: customerDoc?._id,
    cashier: req.user._id,
    status: 'completed',
    notes: `Courier delivery: ${trackingNumber}`,
    fiscalYear: getBSFiscalYear().label,
    inclusiveVat: !!inclusiveVat,
    company: req.companyId,
  });
  await saleDoc.save({ validateBeforeSave: false });
  const sale = saleDoc;

  const tracking = await OrderTracking.create({
    orderId: sale._id,
    orderNumber: invoiceNumber,
    customer: customerDoc?._id,
    customerName: receiverName,
    status: 'pending',
    carrier: 'custom',
    trackingNumber,
    estimatedDelivery: estimatedDelivery || undefined,
    company: req.companyId,
    events: [{ status: 'pending', note: 'Courier order created', updatedBy: req.user._id, updatedByRole: req.user.role }],
  });

  const courierOrder = await CourierOrder.create({
    trackingNumber,
    sale: sale._id,
    tracking: tracking._id,
    sender: { name: senderName, address: senderAddress || '', phone: senderPhone || '' },
    receiver: { name: receiverName, address: receiverAddress || '', phone: receiverPhone || '' },
    instructions: instructions || '',
    deliveryLocation: deliveryLocation || '',
    deliveryType: deliveryType || 'national',
    destinationBranch: destinationBranch || null,
    estimatedDelivery: estimatedDelivery || undefined,
    weight: wt,
    unit: unit || 'pcs',
    quantity: qty,
    ratePerUnit: rate,
    price: calculatedPrice,
    vatRate: effectiveVatRate,
    vatAmount,
    inclusiveVat: !!inclusiveVat,
    paymentMethod: paymentMethod || 'cash',
    bank: paymentMethod === 'qr' ? bankId : undefined,
    remarks: remarks || '',
    company: req.companyId,
  });

  try {
    const cashAccount = await Account.findOne({ code: '10100', ...req.companyFilter });
    const bankAccount = await Account.findOne({ code: '10200', ...req.companyFilter });
    const salesAccount = await Account.findOne({ code: '40100', ...req.companyFilter });
    const vatAccount = await Account.findOne({ code: '20200', ...req.companyFilter });

    if (salesAccount) {
      const jeDate = new Date();
      const fiscalYr = getBSFiscalYear(jeDate).label;
      const miti = adToBikramSambat(jeDate);

      const salesLines = [
        { account: cashAccount?._id, debit: grandTotal, credit: 0 },
        { account: salesAccount._id, debit: 0, credit: salePrice },
      ];
      if (vatAmount > 0 && vatAccount) salesLines.push({ account: vatAccount._id, debit: 0, credit: vatAmount });

      if (paymentMethod === 'qr' && bankAccount) {
        salesLines[0] = { account: bankAccount._id, debit: grandTotal, credit: 0, bank: bankId || null };
      }

      const partyLine = { partyType: 'customer', partyId: customerDoc?._id || null, partyName: customerDoc?.name || 'Walk-in' };
      await postJournalEntryAtomic({
        companyId: req.companyId, date: jeDate, reference: invoiceNumber,
        description: `Courier Sale ${invoiceNumber}`,
        lines: salesLines.filter(l => l.account), createdBy: req.user._id, fiscalYear: fiscalYr,
        miti, companyFilter: req.companyFilter,
        daybook: { date: jeDate, sourceModule: 'SALES_INVOICE', daybookType: 'SALES_BOOK', documentNumber: invoiceNumber, sourceRef: String(sale._id), createdBy: req.user._id, narration: `Courier sale ${invoiceNumber}`, lines: salesLines.filter(l => l.account).map(l => ({ ...l, accountName: '', ...partyLine })) },
      });

      if (paymentMethod === 'qr' && bankId) {
        await adjustBankBalance(bankId, grandTotal, req.companyFilter).catch(e => console.error('Courier bank adjust error:', e.message));
      }
    }
  } catch (jeErr) {
    console.error('Courier JE posting failed:', jeErr.message);
  }

  const populated = await CourierOrder.findById(courierOrder._id)
    .populate('sale', 'invoiceNumber grandTotal amountPaid paymentMethod')
    .populate('bank', 'name accountNumber');

  res.status(201).json(populated);
});

router.put('/:id', adminOnly, async (req, res) => {
  const item = await CourierOrder.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!item) return res.status(404).json({ message: 'Courier order not found' });
  const allowed = ['sender', 'receiver', 'instructions', 'deliveryLocation', 'deliveryType', 'estimatedDelivery', 'remarks'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'sender' || key === 'receiver') {
        item[key] = { ...item[key].toObject(), ...req.body[key] };
      } else {
        item[key] = req.body[key];
      }
    }
  }
  await item.save();
  res.json(item);
});

module.exports = router;
