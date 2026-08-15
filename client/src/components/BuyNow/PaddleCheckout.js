import React, { useEffect, useState } from 'react';

const PADDLE_VENDOR_ID = 'YOUR_PADDLE_VENDOR_ID'; // Replace with your Paddle vendor ID
const PADDLE_PRODUCT_ID = 'YOUR_PADDLE_PRODUCT_ID'; // Replace with your Paddle product ID

export default function PaddleCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Load Paddle.js script
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/paddle.js';
    script.async = true;
    script.onload = () => {
      if (window.Paddle) {
        window.Paddle.Setup({
          vendor: PADDLE_VENDOR_ID,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!window.Paddle) {
        throw new Error('Paddle not loaded. Please refresh and try again.');
      }

      window.Paddle.Checkout.open({
        product: PADDLE_PRODUCT_ID,
        title: 'Multi-Country ERP System',
        description: 'Complete business management solution for 14 countries',
        price: '499',
        currency: 'USD',
        quantity: 1,
        // Custom data to identify the buyer
        passthrough: JSON.stringify({
          product_name: 'ERP Multi-Country System',
          customer_email: 'buyer@example.com', // You can collect this dynamically
        }),
        // Callback when payment succeeds
        success: (data) => {
          console.log('Payment successful:', data);
          alert('Payment successful! You will receive the download link via email.');
          setLoading(false);
        },
        // Callback when payment is closed
        close: () => {
          setLoading(false);
        },
      });
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="paddle-checkout">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="paddle-buy-btn"
      >
        {loading ? 'Processing...' : 'Buy Now - $499'}
      </button>
      {error && <p className="paddle-error">{error}</p>}
    </div>
  );
}
