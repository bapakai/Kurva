// lib/concurrency.js
// Small bounded-concurrency mapper. Used by the cron crawlers to run Haiku
// enrichment calls (and their immediate DB insert) several-at-a-time instead
// of one-by-one — see the comment in crawl-rss.js / crawl-places.js for why
// this matters on Vercel's serverless function time limit.

/**
 * @param {T[]} items
 * @param {number} limit  max concurrent in-flight calls to fn
 * @param {(item: T, index: number) => Promise<any>} fn
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

module.exports = { mapLimit };
