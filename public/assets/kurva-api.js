// kurva-api.js — shared browser-side helper for calling /api/signals and
// /api/regions.
//
// KURVA is kawasan-first, not GPS-first (deliberate product decision,
// 2026-09-28): the app shows "what's happening in kawasan X", the same for
// anyone who opens it, wherever they physically are — not "what's near my
// phone right now". So this file does NOT ask for geolocation permission
// and never reads navigator.geolocation. Which kawasan to show comes from
// (in order): an explicit opts.region, the user's last pick via the region
// switcher (localStorage), or — if neither is set — nothing is sent at all
// and api/signals.js defaults to the active pilot kawasan itself. See
// api/signals.js for why (a GPS-based nearest-region lookup used to 404 for
// anyone outside the pilot kawasan's radius, even with plenty of live data).
//
// /api/regions (below) lists every kawasan (active or coming_soon) so the UI
// can offer more than Bintaro as soon as a region's status flips to
// 'active' in the DB, with no frontend redeploy.

const KURVA_REGION_KEY = 'kurva_region_slug';

/**
 * @param {{tier?: 'terdekat'|'sekitar'|'kawasan', category?: string, region?: string}} opts
 *   opts.region overrides the stored region-switcher pick — used when the
 *   user explicitly selects a kawasan.
 */
async function kurvaFetchSignals(opts = {}) {
  const params = new URLSearchParams();
  if (opts.tier) params.set('tier', opts.tier);
  if (opts.category) params.set('category', opts.category);

  // Explicit opts.region wins; otherwise use whatever the user last picked
  // via the region switcher (persisted across pages this session). If
  // neither is set, we send no `region` at all — the backend defaults to
  // the active pilot kawasan, so the app still shows something meaningful
  // on first load rather than erroring.
  let region = opts.region;
  if (!region) {
    try { region = localStorage.getItem(KURVA_REGION_KEY) || undefined; } catch (_) { /* ignore */ }
  }
  if (region) params.set('region', region);

  const res = await fetch(`/api/signals?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Gagal memuat data (${res.status})`);
  }
  return res.json();
}

/**
 * @returns {Promise<Array<{slug: string, name: string, city: string, status: string}>>}
 */
async function kurvaFetchRegions() {
  const res = await fetch('/api/regions');
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({ regions: [] }));
  return body.regions || [];
}

function kurvaSetRegion(slug) {
  try { localStorage.setItem(KURVA_REGION_KEY, slug); } catch (_) { /* ignore */ }
}
