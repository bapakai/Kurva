// lib/geo.js
// Small helpers for round-tripping PostGIS `geography(Point)` values through
// Supabase's PostgREST layer.
//
// READ path: by default PostGIS's geography output function returns
// hex-encoded EWKB (e.g. "0101000020E6100000..."), not GeoJSON, when you
// SELECT a geography column through PostgREST/supabase-js. parseGeographyPoint()
// decodes that. (If this project's Supabase is ever configured to return
// GeoJSON instead, the GeoJSON branch below handles that too — check by
// logging one raw value from kurva_regions.center if this ever returns null
// unexpectedly.)
//
// WRITE path: Postgres/PostGIS registers an implicit cast from `text` to
// `geography`, so inserting `"SRID=4326;POINT(lng lat)"` as a plain string
// value works directly through supabase-js .insert()/.update() — see
// toEwkt() below. This is the standard Supabase + PostGIS pattern.

/**
 * @param {string|object|null} value  raw value of a geography column as
 *   returned by supabase-js (hex EWKB string, or a GeoJSON object/string)
 * @returns {{lat: number, lng: number} | null}
 */
function parseGeographyPoint(value) {
  if (!value) return null;

  // GeoJSON shape: { type: 'Point', coordinates: [lng, lat] }
  if (typeof value === 'object' && value.type === 'Point' && Array.isArray(value.coordinates)) {
    const [lng, lat] = value.coordinates;
    return { lat, lng };
  }

  if (typeof value === 'string') {
    // GeoJSON serialized as a string
    if (value.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
          const [lng, lat] = parsed.coordinates;
          return { lat, lng };
        }
      } catch (_) {
        // fall through to hex EWKB attempt
      }
    }

    // Hex EWKB for a 2D Point with SRID flag set (standard PostGIS geography output):
    // byte0     = endianness (1 byte)
    // bytes1-4  = geometry type incl. SRID flag (4 bytes)
    // bytes5-8  = SRID (4 bytes)
    // bytes9-16 = X / longitude (8-byte double)
    // bytes17-24= Y / latitude (8-byte double)
    if (/^[0-9a-fA-F]{50}$/.test(value)) {
      const buf = Buffer.from(value, 'hex');
      const littleEndian = buf.readUInt8(0) === 1;
      const lng = littleEndian ? buf.readDoubleLE(9) : buf.readDoubleBE(9);
      const lat = littleEndian ? buf.readDoubleLE(17) : buf.readDoubleBE(17);
      return { lat, lng };
    }
  }

  return null;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {string} EWKT string accepted by supabase-js insert/update for a geography column
 */
function toEwkt(lat, lng) {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

module.exports = { parseGeographyPoint, toEwkt };
