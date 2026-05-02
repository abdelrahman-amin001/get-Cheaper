// SmartPrice Egypt — Proxy Server
// Keeps SerpApi key secret on the server, relays requests to browser
// Deploy FREE on Render.com

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;
const SERP_KEY = process.env.SERPAPI_KEY || '';

// ── CORS headers — allow any origin (your HTML file) ──
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Proxy a request to SerpApi ──
function proxySerpApi(params, res) {
  if (!SERP_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SERPAPI_KEY environment variable not set on server.' }));
    return;
  }

  params.set('api_key', SERP_KEY);
  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  https.get(serpUrl, (serpRes) => {
    let data = '';
    serpRes.on('data', chunk => data += chunk);
    serpRes.on('end', () => {
      res.writeHead(serpRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  }).on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Upstream error: ${err.message}` }));
  });
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  setCORS(res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  // Health check
  if (path === '/' || path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'SmartPrice Egypt proxy is running.' }));
    return;
  }

  // /search?engine=google_shopping&q=milk&gl=eg&hl=ar
  if (path === '/search') {
    const params = new URLSearchParams(parsed.query);
    proxySerpApi(params, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use /search?engine=google_shopping&q=YOUR_QUERY' }));
});

server.listen(PORT, () => {
  console.log(`✅ SmartPrice Egypt proxy running on port ${PORT}`);
  if (!SERP_KEY) {
    console.warn('⚠️  WARNING: SERPAPI_KEY env variable is not set!');
  }
});
