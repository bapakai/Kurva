// lib/_news-providers/rss.js
// Standard RSS/Atom XML parser using the `rss-parser` package — replaces the
// earlier regex-based XML scraping (flagged as fragile in the project
// review). Handles source_registry.config.type = "google_news_rss" and any
// other well-formed RSS/Atom feed.
//
// config shape: { "url": "https://news.google.com/rss/search?q=...", "type": "google_news_rss" }

const Parser = require('rss-parser');
const parser = new Parser({ timeout: 15000 });

/**
 * @param {{url: string}} config
 * @returns {Promise<Array<{external_id: string, title: string, category: 'berita', raw_text: string, source_url: string, published_at: string|null}>>}
 */
async function fetchNews(config) {
  const feed = await parser.parseURL(config.url);
  const items = Array.isArray(feed.items) ? feed.items : [];

  return items.map((item) => ({
    external_id: item.guid || item.link,
    title: (item.title || '').trim(),
    category: 'berita',
    raw_text: stripHtml(item.contentSnippet || item.content || item.summary || item.title || ''),
    source_url: item.link,
    published_at: item.isoDate || item.pubDate || null,
  }));
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { fetchNews };
