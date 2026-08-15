const AccountGroup = require('../models/AccountGroup');
const Account = require('../models/Account');

const TALLY_GROUPS = [
  // ─── Assets ───
  { name: 'Current Assets', root_type: 'Assets', is_predefined: true },
  { name: 'Fixed Assets', root_type: 'Assets', is_predefined: true },
  { name: 'Investments', root_type: 'Assets', is_predefined: true },

  // ─── Liabilities ───
  { name: 'Capital Account', root_type: 'Liabilities', is_predefined: true },
  { name: 'Current Liabilities', root_type: 'Liabilities', is_predefined: true },
  { name: 'Loans (Liability)', root_type: 'Liabilities', is_predefined: true },

  // ─── Income ───
  { name: 'Sales Accounts', root_type: 'Income', is_predefined: true },
  { name: 'Direct Incomes', root_type: 'Income', is_predefined: true },
  { name: 'Indirect Incomes', root_type: 'Income', is_predefined: true },

  // ─── Expense ───
  { name: 'Purchase Accounts', root_type: 'Expense', is_predefined: true },
  { name: 'Direct Expenses', root_type: 'Expense', is_predefined: true },
  { name: 'Indirect Expenses', root_type: 'Expense', is_predefined: true },
];

const TALLY_SUBGROUPS = [
  // Under Current Assets
  { name: 'Sundry Debtors', parent: 'Current Assets', root_type: 'Assets' },
  { name: 'Bank Accounts', parent: 'Current Assets', root_type: 'Assets' },
  { name: 'Cash-in-Hand', parent: 'Current Assets', root_type: 'Assets' },
  { name: 'Inventory', parent: 'Current Assets', root_type: 'Assets' },
  { name: 'Duties & Taxes (Asset)', parent: 'Current Assets', root_type: 'Assets' },

  // Under Current Liabilities
  { name: 'Sundry Creditors', parent: 'Current Liabilities', root_type: 'Liabilities' },
  { name: 'Duties & Taxes', parent: 'Current Liabilities', root_type: 'Liabilities' },

  // Under Fixed Assets
  { name: 'Furniture & Fixtures', parent: 'Fixed Assets', root_type: 'Assets' },
  { name: 'Office Equipment', parent: 'Fixed Assets', root_type: 'Assets' },
  { name: 'Vehicles', parent: 'Fixed Assets', root_type: 'Assets' },
  { name: 'Accumulated Depreciation', parent: 'Fixed Assets', root_type: 'Assets' },
];

const ACCOUNT_TO_GROUP_MAP = {
  '10100': 'Cash-in-Hand',
  '10200': 'Bank Accounts',
  '10300': 'Sundry Debtors',
  '10350': 'Sundry Debtors',
  '10400': 'Inventory',
  '10501': 'Duties & Taxes (Asset)',
  '10600': 'Current Assets',
  '11100': 'Furniture & Fixtures',
  '11200': 'Office Equipment',
  '11300': 'Vehicles',
  '11400': 'Accumulated Depreciation',
  '20100': 'Sundry Creditors',
  '20200': 'Duties & Taxes',
  '20300': 'Duties & Taxes',
  '20400': 'Current Liabilities',
  '20500': 'Loans (Liability)',
  '21100': 'Loans (Liability)',
  '30100': 'Capital Account',
  '30200': 'Capital Account',
  '30300': 'Capital Account',
  '30400': 'Capital Account',
  '40100': 'Sales Accounts',
  '40200': 'Sales Accounts',
  '40300': 'Indirect Incomes',
  '50100': 'Purchase Accounts',
  '50101': 'Purchase Accounts',
  '50102': 'Purchase Accounts',
  '50103': 'Direct Expenses',
  '60100': 'Indirect Expenses',
  '60200': 'Indirect Expenses',
  '60300': 'Indirect Expenses',
  '60400': 'Indirect Expenses',
  '60500': 'Indirect Expenses',
  '60600': 'Indirect Expenses',
  '60700': 'Indirect Expenses',
  '60800': 'Indirect Expenses',
  '60900': 'Indirect Expenses',
  '61000': 'Indirect Expenses',
  '61100': 'Indirect Expenses',
};

async function seedTallyTree(companyId, companyFilter) {
  const groups = [];
  const groupNameToId = new Map();

  for (const g of TALLY_GROUPS) {
    let doc = await AccountGroup.findOne({ name: g.name, ...companyFilter });
    if (!doc) {
      doc = await AccountGroup.create({ ...g, company: companyId });
    }
    groups.push(doc);
    groupNameToId.set(g.name, doc._id);
  }

  for (const sg of TALLY_SUBGROUPS) {
    const parentId = groupNameToId.get(sg.parent);
    let doc = await AccountGroup.findOne({ name: sg.name, ...companyFilter });
    if (!doc) {
      doc = await AccountGroup.create({
        name: sg.name,
        parent_group_id: parentId,
        root_type: sg.root_type,
        is_predefined: true,
        company: companyId,
      });
    }
    groupNameToId.set(sg.name, doc._id);
  }

  const accounts = await Account.find({ ...companyFilter });
  let linked = 0;
  for (const acc of accounts) {
    const groupName = ACCOUNT_TO_GROUP_MAP[acc.code];
    if (groupName && groupNameToId.has(groupName) && !acc.group) {
      await Account.findOneAndUpdate(
        { _id: acc._id },
        { group: groupNameToId.get(groupName) }
      );
      linked++;
    }
  }

  return { groupsCreated: groups.length + TALLY_SUBGROUPS.length, accountsLinked: linked };
}

module.exports = { seedTallyTree, ACCOUNT_TO_GROUP_MAP };
