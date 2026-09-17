// kurva-api.js — shared browser-side helper for calling /api/signals and
// /api/regions.
//
// Falls back to the Bintaro region center when geolocation is denied/
// unavailable, so the app still shows something meaningful on first load.
// This fallback point is just a default, not a hard scope limit — the
// backend resolves whichever kawasan is nearest+active via
// kurva_nearest_active_region, and /api/regions (below) lists every kawasan
// (active or coming_soon) so the UI can offer more than Bintaro as soon as
// a region's status flips to 'active' in the DB, with no frontend redeploy.

const KURVA_BINTARO_FALLBACK = { lat: -6.271, lng: 106.739 };
const KURVA_REGION_KEY = 'kurva_region_slug';

function kurvaGetLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(KURVA_BINTARO_FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(KURVA_BINTARO_FALLBACK),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

/**
 * @param {{tier?: 'terdekat'|'sekitar'|'kawasan', category?: string, region?: string}} opts
 *   opts.region overrides geolocation-based resolution — used when the user
 *   explicitly picks a kawasan from the region switcher.
 */
async function kurvaFetchSignals(opts = {}) {
  const { lat, lng } = await kurvaGetLocation();
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.tier) params.set('tier', opts.tier);
  if (opts.category) params.set('category', opts.category);

  // Explicit opts.region wins; otherwise use whatever the user last picked
  // via the region switcher (persisted across pages this session).
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
