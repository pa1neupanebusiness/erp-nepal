# Paddle Setup Guide for ERP System

## Step 1: Create Paddle Account

1. Go to https://www.paddle.com
2. Click "Sign Up" → Choose "Seller"
3. Fill in your details:
   - Company Name: DevUp Soft (or your business name)
   - Email: your@email.com
   - Country: Nepal
4. Verify your email

## Step 2: Complete Verification

Paddle requires verification before you can accept payments:

1. **Business Information**
   - Business type: Individual / Sole Proprietor
   - Business name: DevUp Soft
   - Address: Your Nepal address
   - Phone: Your phone number

2. **Bank Account (for payouts)**
   - **Select Skrill** as your payout method
   - Enter your Skrill email address
   - Skrill will receive USD and you can withdraw to Nepal

3. **Identity Verification**
   - Upload passport or citizenship
   - Upload proof of address (bank statement, utility bill)

**Verification takes 1-3 business days**

## Step 3: Create Your Product

1. Login to Paddle Dashboard
2. Go to **Catalog** → **Products**
3. Click **"New Product"**
4. Fill in:
   - Product Name: Multi-Country ERP System
   - Description: Complete business management solution for 14 countries
   - Price: $499 USD
   - Type: Digital Product / Software
5. Click **Save**
6. Copy your **Product ID** (format: `pro_xxxxx`)

## Step 4: Get Your Vendor ID

1. Go to **Settings** → **General**
2. Copy your **Vendor ID** (format: `xxxxx`)

## Step 5: Update Your Code

Open `PaddleCheckout.js` and replace:

```javascript
const PADDLE_VENDOR_ID = 'YOUR_PADDLE_VENDOR_ID';
const PADDLE_PRODUCT_ID = 'YOUR_PADDLE_PRODUCT_ID';
```

With your actual IDs:

```javascript
const PADDLE_VENDOR_ID = '12345';
const PADDLE_PRODUCT_ID = 'pro_abcdef123456';
```

## Step 6: Deploy and Test

1. Commit changes to GitHub
2. Wait for deployment to complete
3. Go to your site: https://erp-nepal.onrender.com
4. Test the checkout flow

## Step 7: Configure Payouts

1. In Paddle Dashboard, go to **Settings** → **Payouts**
2. Select **Skrill** as payout method
3. Enter your Skrill account email
4. Set payout frequency (weekly recommended)

## How It Works

1. Buyer clicks "Buy Now"
2. Paddle checkout popup appears
3. Buyer pays with card, PayPal, or local method
4. Paddle handles taxes automatically
5. Payment confirmed → Paddle sends download link to buyer
6. Paddle pays you via Skrill (minus 5% + $0.50 fee)

## Fees

| Item | Cost |
|------|------|
| Platform fee | 5% + $0.50 per sale |
| On $499 sale | $24.95 + $0.50 = **$25.45** |
| You receive | **$473.55** |
| Payout to Skrill | Free |

## Support

- Paddle Support: https://www.paddle.com/support
- Documentation: https://developer.paddle.com

## Quick Checklist

- [ ] Create Paddle account
- [ ] Complete verification
- [ ] Add Skrill payout method
- [ ] Create product in catalog
- [ ] Copy Vendor ID
- [ ] Copy Product ID
- [ ] Update PaddleCheckout.js
- [ ] Deploy to GitHub
- [ ] Test checkout
- [ ] Verify payout in Skrill
