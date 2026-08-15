# ERP Multi-Country Patches - Complete File List

## All Files in This Package

### Backend Files (server/)

| File | Description |
|------|-------------|
| `server/models/Company.js` | Company model with country, currency, vatRate, taxYear, dateFormat fields |
| `server/routes/setup.js` | Setup API: /api/setup/countries, /setup/rules/:country, /setup/status, /setup/complete |
| `server/routes/dateFormat.js` | Date format API: GET/PUT /api/date-format |
| `server/routes/auth.js` | Updated login returning country-specific data |
| `server/utils/chartOfAccounts.js` | 14 countries with localized chart of accounts and tax rules |
| `server/seed.js` | Clean database seed (super admin only) |
| `server/server.js` | Updated server with new routes |

### Frontend Files (client/)

| File | Description |
|------|-------------|
| `client/src/App.js` | Main app with DateFormatProvider and SetupWizard integration |
| `client/src/context/DateFormatContext.js` | Date format context (BS/AD) with formatDate/parseDate |
| `client/src/components/Setup/SetupWizard.js` | 3-step setup wizard (Country → Company → Date Format) |
| `client/src/components/Layout/Layout.js` | Dynamic sidebar with country name and tax-specific labels |
| `client/src/components/Reports/VATReport.js` | Dynamic VAT/GST report with country-specific labels |
| `client/src/components/Reports/TDSReport.js` | Dynamic TDS/PAYE report with country-specific rates |

### CSS Files (client/src/styles/)

| File | Description |
|------|-------------|
| `styles/Setup.css` | Setup wizard and date format toggle styles |
| `styles/App-additions.css` | Company-meta styles to add to your existing App.css |

### Documentation

| File | Description |
|------|-------------|
| `PATCHES.md` | Quick reference of all changes |
| `INSTALL.md` | Complete installation instructions |

---

## Quick Start

1. Copy all files from this package to your ERP Nepal project
2. Add CSS from `App-additions.css` to your `App.css`
3. Run `node server/seed.js` to reset database
4. Start server and login with `admin@erp.com` / `admin123`
5. Complete setup wizard to select your country

---

## Supported Countries (14)

| # | Country | Currency | VAT/GST | Tax Label | Date |
|---|---------|----------|---------|-----------|------|
| 1 | Nepal | NPR (रू) | 13% | VAT | BS |
| 2 | India | INR (₹) | 18% | GST | AD |
| 3 | USA | USD ($) | 7.5% | Sales Tax | AD |
| 4 | UK | GBP (£) | 20% | VAT | AD |
| 5 | Australia | AUD (A$) | 10% | GST | AD |
| 6 | Canada | CAD (C$) | 5% | GST/HST | AD |
| 7 | Germany | EUR (€) | 19% | USt | AD |
| 8 | France | EUR (€) | 20% | TVA | AD |
| 9 | Japan | JPY (¥) | 10% | 消費税 | AD |
| 10 | Singapore | SGD (S$) | 9% | GST | AD |
| 11 | UAE | AED (د.إ) | 5% | VAT | AD |
| 12 | South Africa | ZAR (R) | 15% | VAT | AD |
| 13 | New Zealand | NZD (NZ$) | 15% | GST | AD |
| 14 | Ireland | EUR (€) | 23% | VAT | AD |

---

## What Each Country Gets

When a user selects a country during setup, they automatically get:

1. **Chart of Accounts** - Localized account names (German for Germany, Japanese for Japan, etc.)
2. **Tax Accounts** - Country-specific VAT/GST input/output accounts
3. **Tax Rates** - Correct VAT/GST rates for that country
4. **Fiscal Year** - Country-specific fiscal year start date
5. **Currency** - Symbol and code throughout the app
6. **Date Format** - BS for Nepal, AD for all others
7. **Withholding Tax** - TDS (Nepal/India), PAYE (UK/Aus/NZ), Lohnsteuer (Germany), etc.
8. **Sidebar Labels** - Shows correct tax names (GST for India, VAT for UK, etc.)
