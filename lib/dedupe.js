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
const { haversineMeters } = require('./geo');

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

/**
 * Cross-provider place dedupe for kategori "tempat" — needed once both
 * Google Places and OSM can be active for the same region at once (see
 * api/cron/crawl-places.js provider priority: Google is primary, OSM is
 * backup). The two providers use different external_id formats
 * ("google:<place_id>" vs OSM's own id), so the exact dedupe_hash match used
 * for same-provider re-sightings can't catch "same physical place, two
 * providers". This does a cheap proximity + fuzzy-title check instead.
 *
 * @param {{lat: number, lng: number, title: string}} candidate
 * @param {Array<{lat: number, lng: number, title: string}>} seenPlaces  places
 *   already active in the DB or already inserted/refreshed earlier THIS run
 *   (in provider-priority order, so a higher-priority provider's version wins)
 * @param {{distanceM?: number, titleThreshold?: number}} opts
 * @returns {boolean}
 */
function isDuplicatePlace(candidate, seenPlaces, opts = {}) {
  const distanceM = opts.distanceM ?? 60;
  const titleThreshold = opts.titleThreshold ?? 0.45;
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;

  return seenPlaces.some((seen) => {
    if (!Number.isFinite(seen.lat) || !Number.isFinite(seen.lng)) return false;
    const dist = haversineMeters(candidate.lat, candidate.lng, seen.lat, seen.lng);
    if (dist > distanceM) return false;
    return titleSimilarity(candidate.title, seen.title) >= titleThreshold;
  });
}

module.exports = { normalizeTitle, hashTitle, titleSimilarity, isFuzzyDuplicate, isDuplicatePlace };
