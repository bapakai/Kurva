// lib/_places-providers/google.js
// Provider DORMANT — kept behind is_active=false in kurva_source_registry
// until Google Cloud billing is turned on (see README / project recap).
// Switching providers is a 1-row DB update (`is_active`), no code change,
// because api/cron/crawl-places.js dispatches purely on source_type.
//
// source_registry.config shape for source_type='google_places':
//   { "radius_m": 3000, "query_bias": "Bintaro, Tangerang Selatan" }

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Same category intent as osm.js's POI_FILTERS, expressed as Places "included
// types" so results stay comparable across providers when we cut over.
const INCLUDED_TYPES = [
  'cafe',
  'restaurant',
  'pharmacy',
  'hospital',
  'bank',
  'supermarket',
  'convenience_store',
  'park',
  'gym',
];

/**
 * @param {{radius_m: number, query_bias: string}} config
 * @param {{lat: number, lng: number}} center  region center (kurva_regions.center)
 * @returns {Promise<Array<{external_id: string, title: string, category: 'tempat', lat: number, lng: number, raw_text: string, tags: object}>>}
 */
async function fetchPlaces(config, center) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY not set — this source should stay is_active=false in kurva_source_registry until Google Cloud billing is on.'
    );
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.types,places.location,places.formattedAddress,places.businessStatus',
    },
    body: JSON.stringify({
      includedTypes: INCLUDED_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: config.radius_m || 3000,
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Places API error: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const data = await res.json();
  const places = Array.isArray(data.places) ? data.places : [];

  return places
    .filter((p) => p.businessStatus !== 'CLOSED_PERMANENTLY')
    .map((p) => ({
      external_id: `google:${p.id}`,
      title: p.displayName?.text || 'Tanpa nama',
      category: 'tempat',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      raw_text: `${p.displayName?.text} — ${p.types?.[0] || 'tempat'}${
        p.formattedAddress ? `, ${p.formattedAddress}` : ''
      }`,
      tags: { types: p.types, businessStatus: p.businessStatus },
    }));
}

module.exports = { fetchPlaces };
