import React, { useState } from 'react';
import './BuyNow.css';

export default function BuyNow() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    country: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // In production, this would send email to your server
    alert(`Thank you ${formData.name}! Please complete the bank transfer. Send your payment screenshot to support@devupsoft.com with your order details.`);
    setSubmitted(true);
  };

  const bankDetails = {
    bankName: 'Nabil Bank Limited',
    accountName: 'Pawan Neupane',
    accountNumber: '01234567890123',
    swiftCode: 'NABLNPKA',
    branch: 'Kathmandu, Nepal',
    currency: 'USD',
    iban: 'N/A (SWIFT transfer only)'
  };

  const features = [
    'Multi-Country Support (14 countries)',
    'Chart of Accounts (auto-generated)',
    'Tax Rules (VAT/GST/TDS/PAYE)',
    'POS System',
    'Inventory Management',
    'Financial Reports',
    'User Management',
    'Lifetime Updates',
    'Source Code Included',
    '1 Year Free Support'
  ];

  if (submitted) {
    return (
      <div className="buy-page">
        <div className="success-container">
          <div className="success-icon">✅</div>
          <h1>Thank You for Your Order!</h1>
          <p>Your order has been received. Please complete the bank transfer.</p>
          
          <div className="next-steps">
            <h2>Next Steps:</h2>
            <ol>
              <li>Complete the bank transfer using the details below</li>
              <li>Take a screenshot of your transfer confirmation</li>
              <li>Email it to: <strong>support@devupsoft.com</strong></li>
              <li>Include your name and email in the email</li>
              <li>We'll send you the source code within 24 hours</li>
            </ol>
          </div>

          <div className="bank-details-card">
            <h3>Bank Transfer Details</h3>
            <div className="bank-info">
              <p><strong>Bank:</strong> {bankDetails.bankName}</p>
              <p><strong>Account Name:</strong> {bankDetails.accountName}</p>
              <p><strong>Account Number:</strong> {bankDetails.accountNumber}</p>
              <p><strong>SWIFT Code:</strong> {bankDetails.swiftCode}</p>
              <p><strong>Branch:</strong> {bankDetails.branch}</p>
              <p><strong>Amount:</strong> $499 USD</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="buy-page">
      <div className="buy-header">
        <div className="logo">ERP System</div>
        <h1>Multi-Country ERP System</h1>
        <p>Complete business management solution for 14 countries</p>
      </div>

      <div className="buy-content">
        <div className="product-info">
          <div className="price-card">
            <div className="price-badge">One-Time Payment</div>
            <div className="price">$499</div>
            <div className="price-note">Lifetime license + Source code</div>
          </div>

          <div className="features-list">
            <h2>What's Included</h2>
            <ul>
              {features.map((feature, index) => (
                <li key={index}>✓ {feature}</li>
              ))}
            </ul>
          </div>

          <div className="countries-supported">
            <h2>Supported Countries</h2>
            <div className="country-flags">
              <span>🇳🇵 Nepal</span>
              <span>🇮🇳 India</span>
              <span>🇺🇸 USA</span>
              <span>🇬🇧 UK</span>
              <span>🇦🇺 Australia</span>
              <span>🇨🇦 Canada</span>
              <span>🇩🇪 Germany</span>
              <span>🇫🇷 France</span>
              <span>🇯🇵 Japan</span>
              <span>🇸🇬 Singapore</span>
              <span>🇦🇪 UAE</span>
              <span>🇿🇦 South Africa</span>
              <span>🇳🇿 New Zealand</span>
              <span>🇮🇪 Ireland</span>
            </div>
          </div>

          <div className="demo-link">
            <a href="https://erp-nepal.onrender.com" target="_blank" rel="noopener noreferrer">
              Try Live Demo →
            </a>
          </div>
        </div>

        <div className="order-form">
          <h2>Order Now</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                placeholder="Your full name"
              />
            </div>

            <div className="form-group">
              <label>Email Address *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                placeholder="your@email.com"
              />
            </div>

            <div className="form-group">
              <label>Company Name</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({...formData, company: e.target.value})}
                placeholder="Your company (optional)"
              />
            </div>

            <div className="form-group">
              <label>Country *</label>
              <select
                value={formData.country}
                onChange={(e) => setFormData({...formData, country: e.target.value})}
                required
              >
                <option value="">Select your country</option>
                <option value="nepal">Nepal</option>
                <option value="india">India</option>
                <option value="usa">USA</option>
                <option value="uk">UK</option>
                <option value="australia">Australia</option>
                <option value="canada">Canada</option>
                <option value="germany">Germany</option>
                <option value="france">France</option>
                <option value="japan">Japan</option>
                <option value="singapore">Singapore</option>
                <option value="uae">UAE</option>
                <option value="southafrica">South Africa</option>
                <option value="newzealand">New Zealand</option>
                <option value="ireland">Ireland</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Message (Optional)</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                placeholder="Any special requirements?"
                rows="3"
              />
            </div>

            <button type="submit" className="buy-btn">
              Place Order - $499
            </button>

            <div className="secure-note">
              🔒 Secure bank transfer • No card required
            </div>
          </form>

          <div className="bank-preview">
            <h3>Bank Transfer Details</h3>
            <p>After placing your order, you'll receive these details:</p>
            <ul>
              <li>Bank: Nabil Bank Limited</li>
              <li>SWIFT: NABLNPKA</li>
              <li>Amount: $499 USD</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="trust-section">
        <div className="trust-item">
          <span className="trust-icon">✅</span>
          <span>Lifetime License</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">✅</span>
          <span>Full Source Code</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">✅</span>
          <span>1 Year Support</span>
        </div>
        <div className="trust-item">
          <span className="trust-icon">✅</span>
          <span>Free Updates</span>
        </div>
      </div>
    </div>
  );
}
