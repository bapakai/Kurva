// lib/_news-providers/tag_page.js
// For news sources that publish a tag/category LISTING PAGE instead of a
// proper RSS feed (e.g. Antara Megapolitan's Pemkot Tangsel tag page).
// Uses `cheerio` to parse the HTML and pull out article links — this is a
// best-effort scraper, not a guaranteed-stable API, so it's isolated behind
// its own adapter and wrapped in try/catch by the caller (see
// api/cron/crawl-rss.js) so one broken selector doesn't kill the whole run.
//
// config shape: { "url": "https://megapolitan.antaranews.com/tag/...", "type": "tag_page" }
//
// NOTE: Antara's markup can change. If this stops returning items, check
// the selector below against the live page before assuming the crawler is
// broken elsewhere.

const cheerio = require('cheerio');

async function fetchNews(config) {
  const res = await fetch(config.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; KURVAbot/1.0; +https://kurva.id)' },
  });

  if (!res.ok) {
    throw new Error(`tag_page fetch failed: ${res.status} for ${config.url}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];

  // Antara article listing cards: article links carry the headline text.
  // Selector kept loose (any <a> whose href matches the article URL pattern)
  // to survive minor markup shuffles.
  $('a[href*="megapolitan.antaranews.com/berita/"]').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim();
    if (href && title && title.length > 10) {
      items.push({ href, title });
    }
  });

  // Dedupe by href (same article often linked twice: thumbnail + headline).
  const seen = new Set();
  const unique = items.filter((it) => {
    if (seen.has(it.href)) return false;
    seen.add(it.href);
    return true;
  });

  return unique.slice(0, 30).map((it) => ({
    external_id: it.href,
    title: it.title,
    category: 'berita',
    raw_text: it.title, // listing page has no snippet; Haiku enriches from title alone
    source_url: it.href,
    published_at: null, // not available on listing page
  }));
}

module.exports = { fetchNews };
