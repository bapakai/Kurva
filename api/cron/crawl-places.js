// api/cron/crawl-places.js
// Vercel Cron target for kategori "tempat". Scheduled in vercel.json.
//
// Provider-agnostic dispatch on kurva_source_registry.source_type — switching
// from OSM to Google Places (once billing is on) is a 1-row DB update
// (is_active), not a code change; this file only picks the adapter.
//
// Also implements the "is_new" (badge Baru buka) first-seen logic flagged as
// missing in the project review: a place is is_new=true only the first time
// its dedupe_hash (= provider external_id) appears as an active row. NOTE:
// because kurva_local_signals rows expire (30-day retention for tempat) and
// get deleted by cleanup-expired.js, "first seen" effectively resets if a
// place drops out and reappears after 30+ days — there's no separate
// permanent tracking table in the current schema. Good enough for MVP; flag
// this if "Baru buka" accuracy over long gaps ever matters.

const { supabase } = require('../../lib/supabase');
const { enrichSignal } = require('../../lib/haiku');
const { parseGeographyPoint, toEwkt } = require('../../lib/geo');
const { cleanupExpiredSignals } = require('../../lib/cleanup');
const { mapLimit } = require('../../lib/concurrency');
const osmProvider = require('../../lib/_places-providers/osm');
const googleProvider = require('../../lib/_places-providers/google');

const RETENTION_DAYS = 30;

// See the same constant's comment in crawl-rss.js — bounded concurrency +
// insert-as-you-go so a Vercel function timeout only loses in-flight items.
const ENRICH_CONCURRENCY = 8;

module.exports = async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const summary = { sources_processed: 0, sources_failed: 0, items_fetched: 0, items_inserted: 0, items_refreshed: 0, items_irrelevant: 0, items_skipped_time_budget: 0 };
  // Stay under vercel.json's maxDuration (60s, the Hobby plan max) with a
  // safety margin, so the function returns gracefully with whatever it
  // finished instead of getting hard-killed mid-request. Cleanup (chained
  // after the main loop, see below) gets the remaining ~10s.
  const deadline = Date.now() + 45000;

  try {
    const { data: regions, error: regionsError } = await supabase
      .from('kurva_regions')
      .select('*')
      .eq('status', 'active');
    if (regionsError) throw regionsError;

    for (const region of regions || []) {
      const center = parseGeographyPoint(region.center);

      const { data: sources, error: sourcesError } = await supabase
        .from('kurva_source_registry')
        .select('*')
        .eq('region_id', region.id)
        .eq('category', 'tempat')
        .eq('is_active', true);
      if (sourcesError) throw sourcesError;

      const { data: existingSignals } = await supabase
        .from('kurva_local_signals')
        .select('id, dedupe_hash, expires_at')
        .eq('region_id', region.id)
        .eq('category', 'tempat')
        .eq('status', 'active');
      const existingByHash = new Map((existingSignals || []).map((s) => [s.dedupe_hash, s]));

      for (const source of sources || []) {
        const runStart = new Date().toISOString();
        const { data: runRow } = await supabase
          .from('kurva_crawl_runs')
          .insert({ source_id: source.id, started_at: runStart, status: 'running' })
          .select()
          .single();

        let itemsFetched = 0;
        let itemsInserted = 0;
        let itemsRefreshed = 0;

        try {
          let rawItems;
          if (source.source_type === 'osm') {
            rawItems = await osmProvider.fetchPlaces(source.config);
          } else if (source.source_type === 'google_places') {
            rawItems = await googleProvider.fetchPlaces(source.config, center);
          } else {
            throw new Error(`Unknown places source_type: ${source.source_type}`);
          }

          itemsFetched = rawItems.length;
          summary.items_fetched += itemsFetched;

          const newExpiry = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();
          const refreshIds = [];
          const candidates = [];

          for (const item of rawItems) {
            if (!item.title || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;

            const existing = existingByHash.get(item.external_id);
            if (existing) {
              // Already known & active — just refresh retention, skip Haiku
              // (saves cost; the place hasn't materially changed).
              refreshIds.push(existing.id);
              continue;
            }
            candidates.push(item);
          }

          if (refreshIds.length > 0) {
            const { error: refreshError } = await supabase
              .from('kurva_local_signals')
              .update({ expires_at: newExpiry, is_new: false })
              .in('id', refreshIds);
            if (refreshError) throw refreshError;
            itemsRefreshed = refreshIds.length;
          }

          // Enrich + insert concurrently (bounded) — see ENRICH_CONCURRENCY.
          await mapLimit(candidates, ENRICH_CONCURRENCY, async (item) => {
            if (Date.now() > deadline) {
              summary.items_skipped_time_budget++;
              return;
            }
            let enriched;
            try {
              enriched = await enrichSignal({
                category: 'tempat',
                title: item.title,
                raw_text: item.raw_text,
                region_name: region.name,
              });
            } catch (enrichErr) {
              console.error(`[crawl-places] Haiku enrichment failed for "${item.title}":`, enrichErr.message);
              return;
            }

            if (!enriched.is_relevant) {
              summary.items_irrelevant++;
              return;
            }

            const row = {
              region_id: region.id,
              source_id: source.id,
              category: 'tempat',
              title: item.title,
              summary: enriched.summary,
              raw_content: item.raw_text?.slice(0, 2000) || null,
              location: toEwkt(item.lat, item.lng),
              distance_label: null, // computed at query time by kurva_signals_within
              source_url: null,
              source_name: source.name,
              is_new: true, // first time this dedupe_hash has been seen as an active row
              relevance_score: enriched.relevance_score,
              dedupe_hash: item.external_id,
              published_at: null,
              expires_at: newExpiry,
            };

            const { error: insertError } = await supabase.from('kurva_local_signals').insert(row);
            if (insertError) {
              console.error(`[crawl-places] insert failed for "${item.title}":`, insertError.message);
              return;
            }
            itemsInserted++;
          });

          await supabase
            .from('kurva_source_registry')
            .update({ last_crawled_at: new Date().toISOString() })
            .eq('id', source.id);

          if (runRow) {
            await supabase
              .from('kurva_crawl_runs')
              .update({
                finished_at: new Date().toISOString(),
                items_fetched: itemsFetched,
                items_inserted: itemsInserted,
                items_deduped: itemsRefreshed,
                status: 'success',
              })
              .eq('id', runRow.id);
          }

          summary.sources_processed++;
          summary.items_inserted += itemsInserted;
          summary.items_refreshed += itemsRefreshed;
        } catch (sourceErr) {
          console.error(`[crawl-places] source "${source.name}" failed:`, sourceErr.message);
          summary.sources_failed++;
          if (runRow) {
            await supabase
              .from('kurva_crawl_runs')
              .update({
                finished_at: new Date().toISOString(),
                items_fetched: itemsFetched,
                items_inserted: itemsInserted,
                items_deduped: itemsRefreshed,
                status: 'error',
                error_message: sourceErr.message?.slice(0, 500),
              })
              .eq('id', runRow.id);
          }
        }
      }
    }

    // Chained here (not its own cron slot) — see api/cron/cleanup-expired.js
    // for why: Vercel Hobby plan caps a project at 2 daily cron jobs.
    let cleanup = { deleted: 0 };
    try {
      cleanup = await cleanupExpiredSignals();
    } catch (cleanupErr) {
      console.error('[crawl-places] cleanup step failed:', cleanupErr.message);
    }

    res.status(200).json({ ok: true, ...summary, cleanup });
  } catch (err) {
    console.error('[crawl-places] fatal error:', err);
    res.status(500).json({ ok: false, error: err.message, ...summary });
  }
};
