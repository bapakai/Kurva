// lib/cleanup.js
// Shared retention-cleanup logic, extracted so it can run either as its own
// cron endpoint (api/cron/cleanup-expired.js — useful once the project is on
// a plan that allows more than 2 cron jobs) or chained at the end of another
// cron run (api/cron/crawl-places.js does this by default — see the Vercel
// Hobby plan note in vercel.json / README: Hobby allows only 2 daily cron
// jobs per project, so cleanup rides along with the places crawl instead of
// getting its own schedule slot).

const { supabase } = require('./supabase');

async function cleanupExpiredSignals() {
  const nowIso = new Date().toISOString();

  const { data: expiredRows, error: selectError } = await supabase
    .from('kurva_local_signals')
    .select('id')
    .lt('expires_at', nowIso);
  if (selectError) throw selectError;

  const idsToDelete = (expiredRows || []).map((r) => r.id);

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('kurva_local_signals')
      .delete()
      .in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await supabase.from('kurva_crawl_runs').delete().lt('started_at', cutoff);

  return { deleted: idsToDelete.length };
}

module.exports = { cleanupExpiredSignals };
