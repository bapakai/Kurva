// kurva-api.js — shared browser-side helper for calling /api/signals.
// Falls back to the Bintaro region center when geolocation is denied/unavailable,
// so the app still shows something meaningful on first load (per pilot decision:
// MVP is scoped to Bintaro; nearest-active-region resolution is what makes the
// backend itself location-generic once more kawasan go live).

const KURVA_BINTARO_FALLBACK = { lat: -6.271, lng: 106.739 };

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
 */
async function kurvaFetchSignals(opts = {}) {
  const { lat, lng } = await kurvaGetLocation();
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.tier) params.set('tier', opts.tier);
  if (opts.category) params.set('category', opts.category);
  if (opts.region) params.set('region', opts.region);

  const res = await fetch(`/api/signals?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Gagal memuat data (${res.status})`);
  }
  return res.json();
}
