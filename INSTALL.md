# ERP Multi-Country System - Patch Instructions

## Overview
Convert your ERP Nepal into a multi-country ERP system with automatic chart of accounts, tax rules, and currency based on country selection.

## Features Added
- 14 countries supported (Nepal, India, USA, UK, Australia, Canada, Germany, France, Japan, Singapore, UAE, South Africa, New Zealand, Ireland)
- 3-step setup wizard on first install
- Dynamic chart of accounts per country
- Country-specific tax labels (GST, VAT, USt, TVA, etc.)
- Dynamic currency symbols
- Date format support (BS for Nepal, AD for others)
- Blank database on first install (only super admin)

---

## How to Apply Patches

### Step 1: Backup Your Project
```bash
cp -r erp-nepal erp-nepal-backup
```

### Step 2: Copy Backend Files

Replace these files in your `server/` folder:

```
erp-nepal/server/models/Company.js     → REPLACE with patches version
erp-nepal/server/routes/setup.js       → ADD new file
erp-nepal/server/routes/dateFormat.js  → ADD new file
erp-nepal/server/routes/auth.js        → REPLACE (add country data to login response)
erp-nepal/server/utils/chartOfAccounts.js → ADD new file
erp-nepal/server/seed.js               → REPLACE (clean start)
erp-nepal/server/server.js             → REPLACE (add /api/setup and /api/date-format routes)
```

### Step 3: Copy Frontend Files

Replace/add these files in your `client/src/` folder:

```
erp-nepal/client/src/App.js                            → REPLACE
erp-nepal/client/src/context/DateFormatContext.js       → ADD new file
erp-nepal/client/src/components/Setup/SetupWizard.js   → ADD new file (create Setup/ folder)
erp-nepal/client/src/components/Layout/Layout.js       → REPLACE
erp-nepal/client/src/components/Reports/VATReport.js   → REPLACE
erp-nepal/client/src/components/Reports/TDSReport.js   → REPLACE
erp-nepal/client/src/styles/Setup.css                  → ADD new file
```

### Step 4: Add CSS to App.css

Open `client/src/styles/App.css` and add these lines at the end:

```css
/* ============================================
   COMPANY META STYLES (Multi-Country ERP)
   ============================================ */

.company-meta {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}

.company-country {
  font-size: 0.7rem;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.company-currency {
  font-size: 0.7rem;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

[data-theme="dark"] .company-country {
  background: rgba(56, 189, 248, 0.15);
}

[data-theme="dark"] .company-currency {
  background: rgba(16, 185, 129, 0.15);
}
```

### Step 5: Install Dependencies (if not already installed)
```bash
cd erp-nepal
npm install bikram-sambat-js
```

### Step 6: Reset Database
```bash
# Delete existing database
mongo
> use erp-nepal
> db.dropDatabase()

# Re-seed
node server/seed.js
```

### Step 7: Start the Server
```bash
npm run dev
```

---

## First Login Flow

1. Open browser to `http://localhost:3000`
2. Login with: `admin@erp.com` / `admin123`
3. **Setup Wizard appears:**
   - Step 1: Select your country from grid (14 options)
   - Step 2: Enter company name, address, phone
   - Step 3: Choose date format (BS for Nepal, AD for others)
4. Click "Complete Setup"
5. Dashboard loads with country-specific settings

---

## Country-Specific Features

| Country | Tax Name | Currency | Date Format | Fiscal Year |
|---------|----------|----------|-------------|-------------|
| Nepal | VAT 13% + TDS | NPR (रू) | BS | Jul-Jul |
| India | GST 18% + TDS | INR (₹) | AD | Apr-Mar |
| USA | Sales Tax | USD ($) | AD | Jan-Dec |
| UK | VAT 20% | GBP (£) | AD | Apr-Apr |
| Australia | GST 10% | AUD (A$) | AD | Jul-Jun |
| Canada | GST/HST 5% | CAD (C$) | AD | Jan-Dec |
| Germany | USt 19% | EUR (€) | AD | Jan-Dec |
| France | TVA 20% | EUR (€) | AD | Jan-Dec |
| Japan | 消費税 10% | JPY (¥) | AD | Apr-Mar |
| Singapore | GST 9% | SGD (S$) | AD | Jan-Dec |
| UAE | VAT 5% | AED (د.إ) | AD | Jan-Dec |
| South Africa | VAT 15% | ZAR (R) | AD | Mar-Feb |
| New Zealand | GST 15% | NZD (NZ$) | AD | Apr-Mar |
| Ireland | VAT 23% | EUR (€) | AD | Jan-Dec |

---

## Sidebar Labels Per Country

- **Nepal:** VAT & TDS Reports
- **India:** GST & TDS Reports
- **UK:** VAT & PAYE Reports
- **Australia:** GST & PAYG Reports
- **Germany:** Umsatzsteuer Reports
- **France:** TVA Reports
- **Japan:** Tax Reports (消費税)
- **Singapore:** GST & CPF Reports
- **USA:** Sales Tax Reports
- **UAE:** VAT Reports
- **South Africa:** VAT & PAYE Reports
- **New Zealand:** GST & PAYE Reports
- **Canada:** Tax Reports
- **Ireland:** VAT & PAYE Reports

---

## API Endpoints Added

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/setup/countries` | List all supported countries |
| GET | `/api/setup/rules/:country` | Get tax rules for a country |
| GET | `/api/setup/status` | Check if setup is complete |
| POST | `/api/setup/complete` | Complete setup with company details |
| GET | `/api/date-format` | Get current date format setting |
| PUT | `/api/date-format` | Update date format |

---

## Troubleshooting

**Setup wizard not appearing:**
- Clear localStorage in browser
- Check `/api/date-format` returns `isSetupComplete: false`

**Chart of accounts not loading:**
- Verify `chartOfAccounts.js` is in `server/utils/`
- Check MongoDB connection

**Tax labels not showing:**
- Ensure `Layout.js` is updated with new version
- Clear browser cache

---

## Support

For issues or customization, contact DevUp Soft.
