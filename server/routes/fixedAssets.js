const express = require('express');
const FixedAsset = require('../models/FixedAsset');
const Account = require('../models/Account');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const InventoryMovement = require('../models/InventoryMovement');
const { protect, adminOnly } = require('../middleware/auth');
const { postJournalEntryAtomic } = require('../utils/postingEngine');
const { cancelDaybookEntries } = require('../utils/daybookService');
const { adToBikramSambat, getBSFiscalYear } = require('../utils/dateUtils');
const router = express.Router();

function getFiscalYear(date) {
  return getBSFiscalYear(date).label;
}

router.get('/', protect, async (req, res) => {
  const filter = { ...req.companyFilter };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  const assets = await FixedAsset.find(filter)
    .populate('assetAccount', 'code name')
    .populate('depreciationAccount', 'code name')
    .populate('accDepreciationAccount', 'code name')
    .populate('supplier', 'name')
    .populate('sourceProduct', 'name stock')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 });
  res.json(assets);
});

router.get('/summary', protect, async (req, res) => {
  try {
    const assets = await FixedAsset.find({ ...req.companyFilter });
    const totalCost = assets.reduce((s, a) => s + (a.purchaseCost || 0), 0);
    const totalAccDep = assets.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0);
    const active = assets.filter(a => a.status === 'active').length;
    const disposed = assets.filter(a => a.status === 'disposed').length;
    const fullyDep = assets.filter(a => a.status === 'fully_depreciated').length;
    res.json({ totalCost, totalAccDep, netBookValue: totalCost - totalAccDep, active, disposed, fullyDep, total: assets.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load summary' });
  }
});

router.get('/search-products', protect, async (req, res) => {
  try {
    const { q } = req.query;
    const filter = { ...req.companyFilter };
    if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } }];
    const products = await Product.find(filter).select('name sku stock costPrice unit category').sort({ name: 1 }).limit(30);
    res.json(products);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/create-supplier', protect, adminOnly, async (req, res) => {
  try {
    const { name, phone, address, pan } = req.body;
    if (!name) return res.status(400).json({ message: 'Supplier name is required' });
    const supplier = await Supplier.create({ name, phone: phone || '', address: address || '', pan: pan || '', company: req.companyId });
    res.status(201).json(supplier);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  const asset = await FixedAsset.findOne({ _id: req.params.id, ...req.companyFilter })
    .populate('assetAccount', 'code name')
    .populate('depreciationAccount', 'code name')
    .populate('accDepreciationAccount', 'code name')
    .populate('supplier', 'name')
    .populate('sourceProduct', 'name stock');
  if (!asset) return res.status(404).json({ message: 'Asset not found' });
  res.json(asset);
});

router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, assetCode, category, description, purchaseDate, purchaseCost, salvageValue, usefulLife, usefulLifeUnit, depreciationMethod, depreciationRate, supplier, location, serialNumber, warrantyExpiry, sourceProduct, stockQuantity } = req.body;

    if (!name || !purchaseDate || !usefulLife) {
      return res.status(400).json({ message: 'Name, purchase date, and useful life are required' });
    }

    let resolvedCost = parseFloat(purchaseCost);
    let resolvedQty = parseInt(stockQuantity) || 1;
    let productDoc = null;

    if (sourceProduct) {
      productDoc = await Product.findOne({ _id: sourceProduct, ...req.companyFilter });
      if (!productDoc) return res.status(404).json({ message: 'Source product not found' });
      if (productDoc.stock < resolvedQty) {
        return res.status(400).json({ message: `Insufficient stock. Available: ${productDoc.stock}` });
      }
      if (!purchaseCost || isNaN(resolvedCost)) {
        resolvedCost = productDoc.costPrice || 0;
      }
      if (!resolvedCost) {
        return res.status(400).json({ message: 'Purchase cost is required (no costPrice on product)' });
      }
    }

    if (!resolvedCost && resolvedCost !== 0) {
      return res.status(400).json({ message: 'Purchase cost is required' });
    }

    const CATEGORY_ACCOUNT_MAP = {
      furniture: '11100',
      equipment: '11200',
      vehicle: '11300',
      building: '11100',
      land: '11100',
      computer: '11200',
      other: '11200',
    };
    const assetAccountCode = CATEGORY_ACCOUNT_MAP[category] || '11200';
    const assetAccount = await Account.findOne({ code: assetAccountCode, ...req.companyFilter });
    const accDepAccount = await Account.findOne({ code: '11400', ...req.companyFilter });
    const depAccount = await Account.findOne({ code: '60800', ...req.companyFilter });

    const asset = await FixedAsset.create({
      name, assetCode, category, description,
      purchaseDate: new Date(purchaseDate),
      purchaseCost: resolvedCost, salvageValue: salvageValue || 0,
      usefulLife, usefulLifeUnit: usefulLifeUnit || 'years',
      depreciationMethod: depreciationMethod || 'straight_line',
      depreciationRate: depreciationRate || (100 / usefulLife),
      assetAccount: assetAccount?._id,
      depreciationAccount: depAccount?._id,
      accDepreciationAccount: accDepAccount?._id,
      supplier: supplier || productDoc?.supplier || null,
      sourceProduct: sourceProduct || null,
      stockQuantity: resolvedQty,
      location, serialNumber,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      netBookValue: resolvedCost,
      createdBy: req.user._id,
      company: req.companyId,
    });

    if (assetAccount) {
      const ref = `FA-${asset._id.toString().slice(-6).toUpperCase()}`;
      let creditAccount;
      let creditAccountName;

      if (sourceProduct && productDoc) {
        // Deduct stock
        productDoc.stock = Math.round((productDoc.stock - resolvedQty) * 100) / 100;
        await productDoc.save();

        // Inventory movement
        await InventoryMovement.create({
          product: productDoc._id,
          type: 'out',
          quantity: -resolvedQty,
          reference: `Asset Transfer: ${name}`,
          note: `Transferred to fixed asset: ${name}`,
          date: new Date(purchaseDate),
          createdBy: req.user._id,
          company: req.companyId,
        });

        const inventoryAcc = await Account.findOne({ code: '10400', ...req.companyFilter });
        creditAccount = inventoryAcc;
        creditAccountName = 'Inventory';
      } else {
        const bankAcc = await Account.findOne({ code: '10200', ...req.companyFilter });
        creditAccount = bankAcc;
        creditAccountName = 'Bank Account';
      }

      await postJournalEntryAtomic({
        companyId: req.companyId,
        date: new Date(purchaseDate),
        reference: ref,
        description: `Fixed Asset Acquisition: ${name}`,
        lines: [
          { account: assetAccount._id, debit: resolvedCost, credit: 0 },
          { account: creditAccount?._id, debit: 0, credit: resolvedCost },
        ].filter(l => l.account),
        createdBy: req.user._id,
        fiscalYear: getFiscalYear(new Date(purchaseDate)),
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(new Date(purchaseDate)),
        companyFilter: req.companyFilter,
        daybook: {
          date: new Date(purchaseDate),
          sourceModule: 'FIXED_ASSET',
          daybookType: 'GENERAL_JOURNAL',
          documentNumber: ref,
          sourceRef: String(asset._id),
          narration: `Fixed Asset Acquisition: ${name}`,
          lines: [
            { account: assetAccount._id, accountName: assetAccount.name, debit: resolvedCost, credit: 0, partyType: 'none', partyId: null, partyName: '' },
            { account: creditAccount?._id, accountName: creditAccountName, debit: 0, credit: resolvedCost, partyType: 'none', partyId: null, partyName: '' },
          ].filter(l => l.account),
          createdBy: req.user._id,
        },
      });
    }

    res.status(201).json(asset);
  } catch (err) {
    console.error('Fixed asset create error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const asset = await FixedAsset.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const updates = { ...req.body };
    delete updates.purchaseCost;
    delete updates.purchaseDate;
    delete updates.accumulatedDepreciation;
    delete updates.netBookValue;

    const updated = await FixedAsset.findOneAndUpdate(
      { _id: req.params.id, ...req.companyFilter },
      updates,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/depreciate', protect, adminOnly, async (req, res) => {
  try {
    const asset = await FixedAsset.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    if (asset.status !== 'active') return res.status(400).json({ message: 'Asset is not active' });

    const depreciableAmount = asset.purchaseCost - asset.salvageValue;
    const yearlyDep = asset.depreciationMethod === 'straight_line'
      ? depreciableAmount / asset.usefulLife
      : (depreciableAmount - asset.accumulatedDepreciation) * (asset.depreciationRate / 100);

    const depAmount = Math.max(0, Math.round(yearlyDep * 100) / 100);
    if (depAmount <= 0) return res.status(400).json({ message: 'No more depreciation to record' });

    const remaining = depreciableAmount - asset.accumulatedDepreciation;
    const actualDep = Math.min(depAmount, remaining);

    asset.accumulatedDepreciation = Math.round((asset.accumulatedDepreciation + actualDep) * 100) / 100;
    asset.netBookValue = Math.round((asset.purchaseCost - asset.accumulatedDepreciation) * 100) / 100;

    if (asset.netBookValue <= asset.salvageValue || asset.accumulatedDepreciation >= depreciableAmount) {
      asset.status = 'fully_depreciated';
    }

    const depDate = req.body.date ? new Date(req.body.date) : new Date();
    const fiscalYear = getFiscalYear(depDate);

    if (asset.depreciationAccount && asset.accDepreciationAccount) {
      const ref = `DEP-${asset._id.toString().slice(-6).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const je = await postJournalEntryAtomic({
        companyId: req.companyId,
        date: depDate,
        reference: ref,
        description: `Depreciation: ${asset.name}`,
        lines: [
          { account: asset.depreciationAccount._id, debit: actualDep, credit: 0 },
          { account: asset.accDepreciationAccount._id, debit: 0, credit: actualDep },
        ],
        createdBy: req.user._id,
        fiscalYear,
        fiscalYearId: req.fiscalYearId || undefined,
        miti: adToBikramSambat(depDate),
        companyFilter: req.companyFilter,
        daybook: {
          date: depDate,
          sourceModule: 'DEPRECIATION',
          daybookType: 'GENERAL_JOURNAL',
          documentNumber: ref,
          sourceRef: String(asset._id),
          narration: `Depreciation: ${asset.name}`,
          lines: [
            { account: asset.depreciationAccount._id, accountName: 'Depreciation', debit: actualDep, credit: 0, partyType: 'none', partyId: null, partyName: '' },
            { account: asset.accDepreciationAccount._id, accountName: 'Accumulated Depreciation', debit: 0, credit: actualDep, partyType: 'none', partyId: null, partyName: '' },
          ],
          createdBy: req.user._id,
        },
      });

      asset.depreciationHistory.push({ date: depDate, amount: actualDep, journalEntryId: je?._id, fiscalYear });
    }

    await asset.save();
    res.json(asset);
  } catch (err) {
    console.error('Depreciation error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/dispose', protect, adminOnly, async (req, res) => {
  try {
    const asset = await FixedAsset.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const { disposalDate, disposalAmount } = req.body;
    const dispDate = disposalDate ? new Date(disposalDate) : new Date();
    const dispAmount = disposalAmount || 0;

    if (asset.assetAccount) {
      const ref = `DISP-${asset._id.toString().slice(-6).toUpperCase()}`;
      const lines = [];
      if (dispAmount > 0) {
        const bankAcc = await Account.findOne({ code: '10200', ...req.companyFilter });
        if (bankAcc) lines.push({ account: bankAcc._id, debit: dispAmount, credit: 0 });
      }
      if (asset.accDepreciationAccount) {
        lines.push({ account: asset.accDepreciationAccount._id, debit: asset.accumulatedDepreciation, credit: 0 });
      }
      lines.push({ account: asset.assetAccount._id, debit: 0, credit: asset.purchaseCost });

      const gainLoss = dispAmount + asset.accumulatedDepreciation - asset.purchaseCost;
      if (gainLoss !== 0) {
        const gainLossAcc = await Account.findOne({ code: gainLoss > 0 ? '40300' : '61100', ...req.companyFilter });
        if (gainLossAcc) {
          if (gainLoss > 0) lines.push({ account: gainLossAcc._id, debit: 0, credit: gainLoss });
          else lines.push({ account: gainLossAcc._id, debit: Math.abs(gainLoss), credit: 0 });
        }
      }

      if (lines.length >= 2) {
        await postJournalEntryAtomic({
          companyId: req.companyId,
          date: dispDate,
          reference: ref,
          description: `Disposal of ${asset.name}`,
          lines,
          createdBy: req.user._id,
          fiscalYear: getFiscalYear(dispDate),
          fiscalYearId: req.fiscalYearId || undefined,
          miti: adToBikramSambat(dispDate),
          companyFilter: req.companyFilter,
          daybook: {
            date: dispDate,
            sourceModule: 'FIXED_ASSET',
            daybookType: 'GENERAL_JOURNAL',
            documentNumber: ref,
            sourceRef: String(asset._id),
            narration: `Disposal of ${asset.name}`,
            lines: lines.map(l => ({ ...l, accountName: '', partyType: 'none', partyId: null, partyName: '' })),
            createdBy: req.user._id,
          },
        });
      }
    }

    asset.status = 'disposed';
    asset.disposedDate = dispDate;
    asset.disposalAmount = dispAmount;
    await asset.save();

    res.json(asset);
  } catch (err) {
    console.error('Asset disposal error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
