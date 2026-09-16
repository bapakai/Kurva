// api/signals.js
// GET /api/signals?lat=-6.271&lng=106.739&radius=3000&region=bintaro&category=berita
//
// Serves kurva_local_signals near a user location. Uses the PostGIS helper
// functions already deployed in Supabase (project: pustakadio):
//   kurva_nearest_active_region(in_lat, in_lng) -> SETOF kurva_regions
//   kurva_signals_within(in_lat, in_lng, in_radius_m, in_region_id) -> TABLE(...)
//
// `region` param is optional — if omitted, we resolve the nearest active
// region from lat/lng (this is what makes KURVA work generically per-user
// rather than hardcoded to Bintaro, per the product decision in memory).

const { supabase } = require('../lib/supabase');

const RADIUS_PRESETS = {
  terdekat: 1000,
  sekitar: 3000,
  kawasan: 7000,
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { lat, lng, region: regionSlug, category, radius: radiusParam, tier } = req.query;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    res.status(400).json({ error: 'lat and lng query params are required and must be numbers' });
    return;
  }

  try {
    // 1. Resolve region: explicit slug wins, otherwise nearest active region.
    let region;
    if (regionSlug) {
      const { data, error } = await supabase
        .from('kurva_regions')
        .select('*')
        .eq('slug', regionSlug)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      region = data;
    } else {
      const { data, error } = await supabase.rpc('kurva_nearest_active_region', {
        in_lat: latNum,
        in_lng: lngNum,
      });
      if (error) throw error;
      region = Array.isArray(data) ? data[0] : data;
    }

    if (!region) {
      res.status(404).json({
        error: 'no_active_region',
        message: 'Belum ada kawasan KURVA aktif di lokasi ini.',
      });
      return;
    }

    // 2. Resolve radius: explicit ?radius=, or ?tier=terdekat|sekitar|kawasan, or region default.
    const radiusMeters =
      Number(radiusParam) ||
      RADIUS_PRESETS[tier] ||
      region.radius_sekitar_m ||
      3000;

    // 3. Fetch signals within radius via PostGIS function.
    const { data: signals, error: signalsError } = await supabase.rpc('kurva_signals_within', {
      in_lat: latNum,
      in_lng: lngNum,
      in_radius_m: radiusMeters,
      in_region_id: region.id,
    });
    if (signalsError) throw signalsError;

    let results = signals || [];
    if (category) {
      results = results.filter((s) => s.category === category);
    }

    res.status(200).json({
      region: {
        slug: region.slug,
        name: region.name,
        city: region.city,
      },
      radius_m: radiusMeters,
      count: results.length,
      signals: results,
    });
  } catch (err) {
    console.error('[api/signals] error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
