// lib/_places-providers/osm.js
// Provider ACTIVE now for kategori "tempat". Uses OpenStreetMap's Overpass
// API — free, no key needed. Kept deliberately generic-output; the Haiku
// enrichment step is what turns raw OSM tags into something that doesn't
// feel "generic" (see lib/haiku.js and the Nearby-page lesson in memory).
//
// source_registry.config shape for source_type='osm':
//   { "bbox": [minLon, minLat, maxLon, maxLat] }

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// A conservative set of POI tags relevant to "what's around me" — not an
// exhaustive OSM tag dump. Extend this list as the product needs more
// categories; keep it short so Overpass responses stay fast and Haiku
// enrichment cost stays low.
const POI_FILTERS = [
  'node["amenity"~"^(cafe|restaurant|fast_food|pharmacy|hospital|clinic|bank|atm|fuel|marketplace|place_of_worship)$"]',
  'node["shop"~"^(supermarket|convenience|mall|bakery)$"]',
  'node["leisure"~"^(park|fitness_centre|sports_centre)$"]',
];

/**
 * @param {{bbox: [number, number, number, number]}} config
 * @returns {Promise<Array<{external_id: string, title: string, category: 'tempat', lat: number, lng: number, raw_text: string, tags: object}>>}
 */
async function fetchPlaces(config) {
  const [minLon, minLat, maxLon, maxLat] = config.bbox;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;

  const query = `
    [out:json][timeout:25];
    (
      ${POI_FILTERS.map((f) => `${f}(${bbox});`).join('\n      ')}
    );
    out center 200;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: query,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text().catch(() => '')}`);
  }

  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];

  return elements
    .filter((el) => el.tags && el.tags.name)
    .map((el) => {
      const category =
        el.tags.amenity || el.tags.shop || el.tags.leisure || 'tempat';
      return {
        external_id: `osm:${el.type}:${el.id}`,
        title: el.tags.name,
        category: 'tempat',
        lat: el.lat,
        lng: el.lon,
        raw_text: `${el.tags.name} — kategori OSM: ${category}${
          el.tags['addr:street'] ? `, di ${el.tags['addr:street']}` : ''
        }`,
        tags: el.tags,
      };
    });
}

module.exports = { fetchPlaces };
