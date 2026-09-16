// lib/dedupe.js
// Cheap fuzzy dedupe used BEFORE spending a Haiku API call (per the pipeline
// design: "dedup (fuzzy match dulu sebelum kena API, biar hemat)").
//
// Two layers:
//  1. normalizeTitle + sha1 -> exact-match hash, stored as kurva_local_signals.dedupe_hash
//  2. titleSimilarity -> catches near-duplicates with slightly different
//     wording (common when 2 outlets cover the same local story) via word-set
//     Jaccard similarity, cheap enough to run in-memory per crawl batch.

const crypto = require('crypto');

const STOPWORDS = new Set([
  'di', 'ke', 'dari', 'yang', 'dan', 'atau', 'ini', 'itu', 'untuk', 'pada',
  'dengan', 'akan', 'ada', 'juga', 'update', 'breaking', 'viral', 'terkini',
  'terbaru', 'hari', 'ini',
]);

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(' ')
    .trim();
}

function hashTitle(normalizedTitle) {
  return crypto.createHash('sha1').update(normalizedTitle).digest('hex');
}

/**
 * Jaccard similarity on word sets — 0 (nothing in common) to 1 (identical).
 */
function titleSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {string} candidateTitle
 * @param {string[]} existingTitles  titles already seen this crawl run / already active in DB
 * @param {number} threshold  0-1, default 0.6
 * @returns {boolean}
 */
function isFuzzyDuplicate(candidateTitle, existingTitles, threshold = 0.6) {
  return existingTitles.some((t) => titleSimilarity(candidateTitle, t) >= threshold);
}

module.exports = { normalizeTitle, hashTitle, titleSimilarity, isFuzzyDuplicate };
