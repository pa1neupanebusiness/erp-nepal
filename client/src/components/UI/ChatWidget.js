import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ResultCard({ data }) {
  if (!data) return null;

  if (data.items) {
    return (
      <div className="assistant-card">
        <div className="assistant-card-title">{data.title}</div>
        {data.items.map((item, i) => (
          <div key={i} className="assistant-row">
            <span className="assistant-icon">{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    );
  }

  if (data.title?.includes('Trial Balance')) {
    return (
      <div className="assistant-card">
        <div className="assistant-card-title">{data.title}</div>
        <div className="assistant-kv"><span>Total Debit</span><span className="assistant-num">Rs. {fmt(data.totalDr)}</span></div>
        <div className="assistant-kv"><span>Total Credit</span><span className="assistant-num">Rs. {fmt(data.totalCr)}</span></div>
        <div className="assistant-kv" style={{ fontWeight: 700 }}>
          <span>Status</span>
          <span style={{ color: data.balanced ? '#16a34a' : '#dc2626' }}>{data.balanced ? 'Balanced' : 'UNBALANCED'}</span>
        </div>
        {data.rows?.slice(0, 8).map((r, i) => (
          <div key={i} className="assistant-row" style={{ fontSize: '0.78rem' }}>
            <span style={{ color: '#64748b', minWidth: 40 }}>{r.code}</span>
            <span style={{ flex: 1 }}>{r.name}</span>
            <span className="assistant-num">{r.debit > 0 ? `Dr ${fmt(r.debit)}` : r.credit > 0 ? `Cr ${fmt(r.credit)}` : ''}</span>
          </div>
        ))}
        {data.rows?.length > 8 && <div className="assistant-row" style={{ color: '#94a3b8', fontSize: '0.75rem' }}>...and {data.rows.length - 8} more accounts</div>}
      </div>
    );
  }

  if (data.title?.includes('Profit') || data.title?.includes('P&L')) {
    return (
      <div className="assistant-card">
        <div className="assistant-card-title">{data.title}</div>
        <div className="assistant-kv"><span>Revenue</span><span className="assistant-num">Rs. {fmt(data.revenue)}</span></div>
        <div className="assistant-kv"><span>COGS</span><span className="assistant-num" style={{ color: '#dc2626' }}>Rs. {fmt(data.cogs)}</span></div>
        <div className="assistant-kv" style={{ fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 4 }}><span>Gross Profit</span><span className="assistant-num">Rs. {fmt(data.grossProfit)}</span></div>
        <div className="assistant-kv"><span>Operating Expenses</span><span className="assistant-num">Rs. {fmt(data.expenses)}</span></div>
        {data.otherIncome > 0 && <div className="assistant-kv"><span>Other Income</span><span className="assistant-num" style={{ color: '#16a34a' }}>Rs. {fmt(data.otherIncome)}</span></div>}
        <div className="assistant-kv" style={{ fontWeight: 800, fontSize: '0.95rem', borderTop: '2px solid #000', paddingTop: 6, marginTop: 4 }}>
          <span>{data.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
          <span className="assistant-num" style={{ color: data.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>Rs. {fmt(Math.abs(data.netProfit))}</span>
        </div>
      </div>
    );
  }

  if (data.rows?.length && typeof data.rows[0] === 'object' && !data.rows[0].code) {
    return (
      <div className="assistant-card">
        <div className="assistant-card-title">{data.title}</div>
        {data.rows.map((r, i) => (
          <div key={i} className="assistant-row" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
            {Object.entries(r).map(([k, v]) => (
              <span key={k} style={{ flex: 1 }}>{typeof v === 'number' ? fmt(v) : v}</span>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const MONEY_KEYS = /value|amount|receivable|payable|remaining|revenue|profit|expense|income|vat|tax|cogs|price|total(?!Product)|avg|cash|bank|liquid|net/i;
  const kvPairs = Object.entries(data).filter(([k, v]) => k !== 'title' && k !== 'lowStockItems' && typeof v === 'number');
  const stringPairs = Object.entries(data).filter(([k, v]) => k !== 'title' && typeof v === 'string');
  return (
    <div className="assistant-card">
      <div className="assistant-card-title">{data.title}</div>
      {stringPairs.map(([key, val]) => (
        <div key={key} className="assistant-kv">
          <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
          <span>{val}</span>
        </div>
      ))}
      {kvPairs.map(([key, val]) => (
        <div key={key} className="assistant-kv">
          <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
          <span className="assistant-num">{MONEY_KEYS.test(key) ? `Rs. ${fmt(val)}` : Number(val).toLocaleString('en-IN')}</span>
        </div>
      ))}
      {Array.isArray(data.lowStockItems) && data.lowStockItems.length > 0 && (
        <div style={{ marginTop: '0.3rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Low Stock Items</div>
          {data.lowStockItems.map((item, i) => (
            <div key={i} className="assistant-row" style={{ fontSize: '0.82rem' }}>
              <span className="assistant-icon" style={{ color: '#f59e0b' }}>!</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (textOverride) => {
    const text = (textOverride || input).trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const { data } = await api.post('/assistant', { message: text, context: location.pathname });
      setMessages(prev => [...prev, { role: 'assistant', data: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', data: { title: 'Error', items: [{ icon: '!', text: 'Could not process your request.' }] } }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const quickActions = [
    { label: "Today's Summary", query: 'today summary' },
    { label: 'Sales This Month', query: 'sales this month' },
    { label: 'Trial Balance', query: 'trial balance' },
    { label: 'P&L', query: 'profit and loss' },
    { label: 'Inventory', query: 'inventory stock' },
    { label: 'Products', query: 'show products' },
    { label: 'Customers', query: 'show customers' },
    { label: 'Suppliers', query: 'show suppliers' },
    { label: 'EMI', query: 'emi summary' },
    { label: 'Check Errors', query: 'check errors' },
    { label: 'VAT', query: 'vat summary' },
  ];

  return (
    <>
      <button className="assistant-fab" onClick={() => { setOpen(!open); setMessages([]); }} title="ERP Assistant">
        {open ? '×' : '🤖'}
      </button>

      {open && (
        <div className="assistant-panel">
          <div className="assistant-header">
            <div>
              <div className="assistant-header-title">ERP Assistant</div>
              <div className="assistant-header-sub">Ask anything about your data</div>
            </div>
            <button className="assistant-close" onClick={() => { setOpen(false); setMessages([]); setInput(''); }}>×</button>
          </div>

          <div className="assistant-body">
            {messages.length === 0 && (
              <div className="assistant-welcome">
                <div className="assistant-welcome-icon">🤖</div>
                <div className="assistant-welcome-text">Hi! Ask me anything about your ERP.</div>
                <div className="assistant-quick-grid">
                  {quickActions.map((qa) => (
                    <button key={qa.query} className="assistant-quick-btn" onClick={() => send(qa.query)}>
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`assistant-msg ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="assistant-bubble user">{msg.text}</div>
                ) : (
                  <ResultCard data={msg.data} />
                )}
              </div>
            ))}

            {loading && (
              <div className="assistant-msg assistant">
                <div className="assistant-bubble loading">
                  <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="assistant-input-bar">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about sales, stock, VAT..."
              disabled={loading}
            />
            <button onClick={send} disabled={loading || !input.trim()} className="assistant-send">
              {loading ? '...' : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
