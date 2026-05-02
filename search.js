// api/search.js — Vercel Serverless Function
// Proxies SerpApi calls from the browser (no CORS, key stays secret)
// Deploy FREE on vercel.com — no credit card, no CLI, just drag & drop

export default async function handler(req, res) {
  // Allow all origins (your frontend can be anywhere)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const SERP_KEY = process.env.SERPAPI_KEY;
  if (!SERP_KEY) {
    return res.status(500).json({
      error: 'SERPAPI_KEY environment variable is not set. Add it in Vercel → Settings → Environment Variables.'
    });
  }

  // Forward all query params from the browser to SerpApi, inject the key
  const params = new URLSearchParams(req.query);
  params.set('api_key', SERP_KEY);

  const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;

  try {
    const upstream = await fetch(serpUrl);
    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: `Upstream fetch failed: ${err.message}` });
  }
}
