const mongoose = require('mongoose');

const depreciationEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  fiscalYear: { type: String },
}, { _id: false });

const fixedAssetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  assetCode: { type: String, sparse: true },
  category: { type: String, enum: ['furniture', 'equipment', 'vehicle', 'building', 'land', 'computer', 'other'], default: 'other' },
  description: { type: String },
  purchaseDate: { type: Date, required: true },
  purchaseCost: { type: Number, required: true },
  salvageValue: { type: Number, default: 0 },
  usefulLife: { type: Number, required: true },
  usefulLifeUnit: { type: String, enum: ['years', 'months'], default: 'years' },
  depreciationMethod: { type: String, enum: ['straight_line', 'declining_balance'], default: 'straight_line' },
  depreciationRate: { type: Number, default: 0 },
  accumulatedDepreciation: { type: Number, default: 0 },
  netBookValue: { type: Number, default: 0 },
  assetAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  depreciationAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  accDepreciationAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  sourceProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  stockQuantity: { type: Number, default: 1 },
  location: { type: String },
  serialNumber: { type: String },
  warrantyExpiry: { type: Date },
  status: { type: String, enum: ['active', 'fully_depreciated', 'disposed', 'under_maintenance'], default: 'active' },
  disposedDate: { type: Date },
  disposalAmount: { type: Number, default: 0 },
  depreciationHistory: [depreciationEntrySchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

fixedAssetSchema.plugin(require('./companyPlugin'));
fixedAssetSchema.index({ company: 1, assetCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('FixedAsset', fixedAssetSchema);
