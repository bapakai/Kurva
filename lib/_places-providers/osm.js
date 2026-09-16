// lib/_places-providers/osm.js
// Provider ACTIVE now for kategori "tempat". Uses OpenStreetMap's Overpass
// API — free, no key needed. Kept deliberately generic-output; the Haiku
// enrichment step is what turns raw OSM tags into something that doesn't
// feel "generic" (see lib/haiku.js and the Nearby-page lesson in memory).
//
// source_registry.config shape for source_type='osm':
//   { "bbox": [minLon, minLat, maxLon, maxLat] }

// Primary + fallback mirrors. The public overpass-api.de instance is prone
// to transient 504s under load (confirmed live: 406 fixed by the User-Agent
// header below, then hit a 504 on the very next run) — trying a mirror
// before giving up the whole source keeps one slow instance from failing
// the entire daily crawl.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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

  // Overpass's usage policy asks clients to identify themselves with a
  // descriptive User-Agent; without one, requests from datacenter/serverless
  // IPs (like Vercel's) can get rejected outright with a bare "406 Not
  // Acceptable" from the Apache front-end — confirmed on the first live run.
  const headers = {
    'content-type': 'text/plain',
    accept: 'application/json',
    'user-agent': 'KURVAbot/1.0 (+https://kurva-livid.vercel.app; kontak: akubapakai@gmail.com)',
  };

  let data;
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: query });
      if (!res.ok) {
        throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
      }
      data = await res.json();
      lastError = null;
      break; // success — stop trying mirrors
    } catch (err) {
      lastError = err;
      // try the next mirror
    }
  }

  if (lastError) {
    throw new Error(`Overpass API error (tried ${OVERPASS_URLS.length} endpoint(s)): ${lastError.message}`);
  }

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
