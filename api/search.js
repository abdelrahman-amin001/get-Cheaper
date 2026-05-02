// api/search.js — Vercel Serverless Function
// Fixes:
//  1. SerpApi free tier only allows gl=us — we force egypt results by appending
//     "egypt EGP" to the query so Google returns Egyptian listings & EGP prices
//  2. All 3 external APIs (SerpApi, Open Food Facts, UPC) called server-side
//     so the browser never gets a CORS error
//  3. Graceful fallback — if one source fails others still return

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { source, q, engine, hl, num } = req.query;

  // ── HEALTH CHECK ──────────────────────────────────────────────────────────
  if (!source) {
    return res.status(200).json({ status: 'ok', message: 'SmartPrice Egypt proxy running.' });
  }

  // ── SOURCE: SerpApi ───────────────────────────────────────────────────────
  if (source === 'serp') {
    const KEY = process.env.SERPAPI_KEY;
    if (!KEY) {
      return res.status(500).json({
        error: 'SERPAPI_KEY not set. Go to Vercel → your project → Settings → Environment Variables → add SERPAPI_KEY.'
      });
    }

    const isArabic = /[\u0600-\u06FF]/.test(q || '');
    const country  = req.query.country || 'eg';

    // Country keyword map — appended to query so Google finds local results
    const countryKeywords = {
      eg:     isArabic ? 'مصر جنيه'        : 'egypt EGP price',
      sa:     isArabic ? 'السعودية ريال'    : 'saudi arabia SAR price',
      ae:     isArabic ? 'الإمارات درهم'    : 'UAE AED price',
      uk:     'UK GBP price',
      us:     'USA USD price',
      global: 'price buy online',
    };

    const keyword     = countryKeywords[country] || countryKeywords.eg;
    const enrichedQ   = `${q} ${keyword}`;
    const engineType  = engine || 'google_shopping';

    // For organic (social media) search — target Egyptian platforms directly
    const organicQ = engine === 'google'
      ? `${q} ${keyword} site:facebook.com OR site:olx.com.eg OR site:instagram.com OR site:noon.com OR site:jumia.com.eg OR site:carrefouregypt.com OR site:amazon.eg`
      : enrichedQ;

    const params = new URLSearchParams({
      api_key: KEY,
      engine:  engineType,
      q:       engineType === 'google' ? organicQ : enrichedQ,
      gl:      'us',   // free tier restriction — country forced via query keyword above
      hl:      isArabic ? 'ar' : (hl || 'en'),
      num:     num || '20',
    });

    try {
      const r    = await fetch(`https://serpapi.com/search.json?${params}`, {
        signal: AbortSignal.timeout(13000)
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: `SerpApi error: ${err.message}` });
    }
  }

  // ── SOURCE: Open Food Facts ───────────────────────────────────────────────
  if (source === 'food') {
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q || '')}&json=1&page_size=8&fields=product_name,brands,stores,image_url,quantity`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!r.ok) return res.status(200).json({ products: [] });
      const data = await r.json();
      return res.status(200).json(data);
    } catch {
      return res.status(200).json({ products: [] }); // never block UI
    }
  }

  // ── SOURCE: UPC Item DB ───────────────────────────────────────────────────
  if (source === 'upc') {
    try {
      const r = await fetch(
        `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(q || '')}&type=product`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (!r.ok) return res.status(200).json({ items: [] });
      const data = await r.json();
      return res.status(200).json(data);
    } catch {
      return res.status(200).json({ items: [] }); // never block UI
    }
  }

  return res.status(400).json({ error: `Unknown source: "${source}". Use: serp, food, upc` });
}
