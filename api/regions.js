// api/regions.js
// GET /api/regions — lists all kawasan KURVA knows about (active + coming_soon),
// so the frontend region-switcher can render itself from data instead of
// hardcoded chips. This is the piece that makes "Bintaro is just one kawasan,
// more can be added later" actually true in the UI: launching a new region is
// a kurva_regions row (status: 'coming_soon' -> 'active'), not a frontend
// deploy. See README's "Menambah kawasan baru" section.

const { supabase } = require('../lib/supabase');

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

  try {
    const { data, error } = await supabase
      .from('kurva_regions')
      .select('slug, name, city, status')
      .in('status', ['active', 'coming_soon'])
      .order('status', { ascending: true }) // 'active' < 'coming_soon' alphabetically — active first
      .order('name', { ascending: true });
    if (error) throw error;

    res.status(200).json({ regions: data || [] });
  } catch (err) {
    console.error('[api/regions] error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
};
