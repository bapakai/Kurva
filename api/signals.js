// api/signals.js
// GET /api/signals?region=bintaro&category=berita&tier=sekitar
//
// Serves kurva_local_signals for a kawasan (region). Uses the PostGIS helper
// function already deployed in Supabase (project: pustakadio):
//   kurva_signals_within(in_lat, in_lng, in_radius_m, in_region_id) -> TABLE(...)
//
// DELIBERATE PRODUCT DECISION (2026-09-28): KURVA is kawasan-first, not
// GPS-first. The app shows "what's happening in kawasan X", not "what's
// near my phone right now" — so anyone opening the app sees the same content
// for a given kawasan regardless of where they physically are. This file
// used to resolve the region via kurva_nearest_active_region(lat, lng) from
// the user's real GPS, with a hard ST_DWithin(radius_kawasan_m) cutoff — that
// silently 404'd for anyone testing/using the app from outside that radius
// (e.g. Mampang, ~10km from Bintaro's center, outside its 7km kawasan
// radius), even though Bintaro had plenty of live data. Region is now
// resolved purely from `?region=<slug>` (explicit pick, e.g. via the region
// switcher) or defaults to the active pilot kawasan — never from the
// client's location. `kurva_nearest_active_region` is left in the DB
// unused; harmless, and available again if a genuine "near me" opt-in
// feature is ever added deliberately (that would need to be a separate,
// explicit toggle — not the default path).
//
// "tempat" (places) proximity tiers (terdekat/sekitar/kawasan) are now
// measured from the KAWASAN's own center point (kurva_regions.center), not
// the user's GPS — i.e. "places within 1km of central Bintaro", a curation
// radius, not a literal "near me" radius. "berita"/"acara" ignore distance
// entirely regardless (see kurva_signals_within — kawasan-wide by design).

const { supabase } = require('../lib/supabase');
const { parseGeographyPoint } = require('../lib/geo');

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

  const { region: regionSlug, category, radius: radiusParam, tier } = req.query;

  try {
    // 1. Resolve region: explicit slug wins, otherwise the active pilot
    // kawasan (oldest active row — today that's Bintaro, the only one).
    // No GPS involved — see file header.
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
      const { data, error } = await supabase
        .from('kurva_regions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      region = data;
    }

    if (!region) {
      res.status(404).json({
        error: 'no_active_region',
        message: regionSlug
          ? `Kawasan "${regionSlug}" belum aktif atau tidak ditemukan.`
          : 'Belum ada kawasan KURVA yang aktif.',
      });
      return;
    }

    const center = parseGeographyPoint(region.center);
    if (!center) {
      throw new Error(`Kawasan "${region.slug}" tidak punya titik pusat (center) yang valid.`);
    }

    // 2. Resolve radius: explicit ?radius=, or ?tier=terdekat|sekitar|kawasan, or region default.
    // Anchored at the kawasan's own center — see file header.
    const radiusMeters =
      Number(radiusParam) ||
      RADIUS_PRESETS[tier] ||
      region.radius_sekitar_m ||
      3000;

    // 3. Fetch signals within radius via PostGIS function.
    const { data: signals, error: signalsError } = await supabase.rpc('kurva_signals_within', {
      in_lat: center.lat,
      in_lng: center.lng,
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
