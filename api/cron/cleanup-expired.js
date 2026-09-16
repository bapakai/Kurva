// api/cron/cleanup-expired.js
// Standalone retention-cleanup endpoint — NOT wired into vercel.json's cron
// list by default, because Vercel Hobby plan allows only 2 daily cron jobs
// per project and crawl-rss + crawl-places already use both slots.
// crawl-places.js chains cleanupExpiredSignals() at the end of its run
// instead, so retention still happens daily without a 3rd cron slot.
//
// Kept as its own endpoint for two cases: (a) once the project is on Pro
// (more cron slots — add it back to vercel.json), or (b) manual/on-demand
// runs, e.g. `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/cleanup-expired`.

const { cleanupExpiredSignals } = require('../../lib/cleanup');

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const result = await cleanupExpiredSignals();
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cleanup-expired] error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};
