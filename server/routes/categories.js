const express = require('express');
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');
const router = express.Router();

function validateParent(parent, companyId) {
  if (!parent) return Promise.resolve();
  return Category.findOne({ _id: parent, ...{ company: companyId } }).then(p => {
    if (!p) {
      const err = new Error('Parent category not found');
      err.status = 400;
      throw err;
    }
  });
}

function buildChildMap(cats) {
  const map = {};
  cats.forEach(c => {
    const key = c.parent ? String(c.parent) : 'root';
    (map[key] = map[key] || []).push(String(c._id));
  });
  return map;
}

function descendantsOf(id, childMap, acc = new Set()) {
  (childMap[id] || []).forEach(ch => {
    acc.add(ch);
    descendantsOf(ch, childMap, acc);
  });
  return acc;
}

router.get('/', protect, async (req, res) => {
  const items = await Category.find({ ...req.companyFilter }).sort({ order: 1, name: 1 });
  res.json(items);
});

router.post('/', protect, async (req, res) => {
  const { name, description, parent } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Category name is required' });
  const cleanName = name.trim();
  await validateParent(parent, req.companyId);
  const regex = new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const existing = await Category.findOne({ name: regex, ...req.companyFilter });
  if (existing) return res.json(existing);
  const order = await Category.countDocuments({ parent: parent || null, ...req.companyFilter });
  let item;
  try {
    item = await Category.create({ name: cleanName, description, parent: parent || null, order, company: req.companyId });
  } catch (err) {
    if (err.code === 11000) {
      item = await Category.findOne({ name: regex, ...req.companyFilter });
      if (!item) throw err;
    } else {
      throw err;
    }
  }
  res.status(201).json(item);
});

// Batch reorder / reparent (used by drag & drop). Must be registered before '/:id'.
router.put('/sort', protect, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items array is required' });
  }
  const ids = items.map(it => String(it.id));
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'Duplicate category in sort payload' });
  }
  const cats = await Category.find({ _id: { $in: ids }, ...req.companyFilter }).lean();
  if (cats.length !== ids.length) {
    return res.status(400).json({ message: 'One or more categories not found' });
  }
  const parentOf = {};
  items.forEach(it => { parentOf[String(it.id)] = it.parent ? String(it.parent) : null; });
  for (const id of ids) {
    let cur = id;
    const visited = new Set();
    while (cur) {
      if (visited.has(cur)) return res.status(400).json({ message: 'Invalid hierarchy (cycle detected)' });
      visited.add(cur);
      cur = parentOf[cur];
    }
  }
  const ops = items.map((it, i) => ({
    updateOne: {
      filter: { _id: it.id, ...req.companyFilter },
      update: { $set: { parent: it.parent || null, order: i } },
    },
  }));
  await Category.bulkWrite(ops);
  res.json({ message: 'Reordered' });
});

router.put('/:id', protect, async (req, res) => {
  const { name, description, parent } = req.body;
  if (parent && String(parent) === req.params.id) {
    return res.status(400).json({ message: 'Category cannot be its own parent' });
  }
  if (name !== undefined && (!name || !name.trim())) {
    return res.status(400).json({ message: 'Category name is required' });
  }
  const existing = await Category.findOne({ _id: req.params.id, ...req.companyFilter });
  if (!existing) return res.status(404).json({ message: 'Category not found' });
  if (parent) {
    await validateParent(parent, req.companyId);
    const all = await Category.find({ company: req.companyId }).lean();
    if (descendantsOf(String(existing._id), buildChildMap(all)).has(String(parent))) {
      return res.status(400).json({ message: 'Category cannot be moved under its own sub-category' });
    }
  }
  const cleanName = name !== undefined ? name.trim() : existing.name;
  const regex = new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const dup = await Category.findOne({ name: regex, _id: { $ne: existing._id }, ...req.companyFilter });
  if (dup) return res.status(400).json({ message: 'Category name already exists' });
  const update = { name: cleanName };
  if (description !== undefined) update.description = description;
  if (parent !== undefined) {
    const newParent = parent || null;
    update.parent = newParent;
    if (String(existing.parent || '') !== String(newParent || '')) {
      update.order = await Category.countDocuments({ parent: newParent || null, ...req.companyFilter });
    }
  }
  const item = await Category.findOneAndUpdate({ _id: req.params.id, ...req.companyFilter }, update, { new: true });
  res.json(item);
});

router.delete('/:id', protect, async (req, res) => {
  const hasChildren = await Category.countDocuments({ parent: req.params.id, ...req.companyFilter });
  if (hasChildren > 0) {
    return res.status(400).json({ message: 'Cannot delete a category that has sub-categories. Move or delete sub-categories first.' });
  }
  await Category.findOneAndDelete({ _id: req.params.id, ...req.companyFilter });
  res.json({ message: 'Deleted' });
});

module.exports = router;
