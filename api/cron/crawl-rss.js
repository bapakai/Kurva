// api/cron/crawl-rss.js
// Vercel Cron target for kategori "berita". Scheduled in vercel.json.
//
// Pipeline: ingest (per active source) -> cheap fuzzy dedupe -> Haiku
// enrichment (relevance + summary) -> insert into kurva_local_signals.
//
// Berita items don't carry precise coordinates (an article isn't tied to one
// lat/lng), so we anchor them at the region's centroid — this is what makes
// them show up in kurva_signals_within, which requires `location is not null`.

const { supabase } = require('../../lib/supabase');
const { enrichSignal } = require('../../lib/haiku');
const { parseGeographyPoint, toEwkt } = require('../../lib/geo');
const { normalizeTitle, hashTitle, isFuzzyDuplicate } = require('../../lib/dedupe');
const { mapLimit } = require('../../lib/concurrency');
const rssProvider = require('../../lib/_news-providers/rss');
const tagPageProvider = require('../../lib/_news-providers/tag_page');

const RETENTION_DAYS = 7;

// Haiku enrichment calls run this many at a time. Vercel serverless
// functions have a hard wall-clock limit (see maxDuration in vercel.json —
// 60s, the Hobby plan max); a source with 100+ items run one-at-a-time would
// blow past that easily once Haiku is actually succeeding (each call is a
// real network round trip, not instant). Running several concurrently, and
// inserting each row as soon as it's enriched (rather than batching one big
// insert at the end), means a timeout only loses whatever was still
// in-flight — not the whole run.
const ENRICH_CONCURRENCY = 8;

module.exports = async function handler(req, res) {
  // Vercel Cron sends a GET with a bearer secret when CRON_SECRET is set.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const summary = { sources_processed: 0, sources_failed: 0, items_fetched: 0, items_inserted: 0, items_deduped: 0, items_irrelevant: 0, items_skipped_time_budget: 0 };
  // Stay under vercel.json's maxDuration (60s, the Hobby plan max) with a
  // safety margin, so the function returns gracefully with whatever it
  // finished instead of getting hard-killed mid-request.
  const deadline = Date.now() + 50000;

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
        .eq('category', 'berita')
        .eq('is_active', true);
      if (sourcesError) throw sourcesError;

      // Pull currently-active berita titles once per region, for fuzzy dedupe.
      const { data: existingSignals } = await supabase
        .from('kurva_local_signals')
        .select('id, title, dedupe_hash')
        .eq('region_id', region.id)
        .eq('category', 'berita')
        .eq('status', 'active');
      const existingTitles = (existingSignals || []).map((s) => s.title);
      const existingHashes = new Set((existingSignals || []).map((s) => s.dedupe_hash).filter(Boolean));

      for (const source of sources || []) {
        const runStart = new Date().toISOString();
        const { data: runRow } = await supabase
          .from('kurva_crawl_runs')
          .insert({ source_id: source.id, started_at: runStart, status: 'running' })
          .select()
          .single();

        let itemsFetched = 0;
        let itemsInserted = 0;
        let itemsDeduped = 0;
        let enrichmentFailures = 0;
        let enrichmentFailureSample = null;

        try {
          const provider = source.config?.type === 'tag_page' ? tagPageProvider : rssProvider;
          const rawItems = await provider.fetchNews(source.config);
          itemsFetched = rawItems.length;
          summary.items_fetched += itemsFetched;

          // Cheap dedupe pass first (synchronous, no I/O) — fuzzy-match
          // against existing active titles AND against each other (e.g. same
          // story crawled from 2 sources in the same run), before any Haiku
          // calls happen. Sequential on purpose so it's race-free.
          const candidates = [];
          const acceptedTitles = [];
          for (const item of rawItems) {
            if (!item.title) continue;
            if (isFuzzyDuplicate(item.title, existingTitles) || isFuzzyDuplicate(item.title, acceptedTitles)) {
              itemsDeduped++;
              continue;
            }
            acceptedTitles.push(item.title);
            candidates.push(item);
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
                category: 'berita',
                title: item.title,
                raw_text: item.raw_text,
                region_name: region.name,
              });
            } catch (enrichErr) {
              console.error(`[crawl-rss] Haiku enrichment failed for "${item.title}":`, enrichErr.message);
              enrichmentFailures++;
              if (!enrichmentFailureSample) enrichmentFailureSample = enrichErr.message?.slice(0, 200);
              return;
            }

            if (!enriched.is_relevant) {
              summary.items_irrelevant++;
              return;
            }

            const normalized = normalizeTitle(enriched.normalized_title || item.title);
            const dedupeHash = hashTitle(normalized);
            if (existingHashes.has(dedupeHash)) {
              itemsDeduped++;
              return;
            }
            existingHashes.add(dedupeHash);

            const row = {
              region_id: region.id,
              source_id: source.id,
              category: 'berita',
              title: item.title,
              summary: enriched.summary,
              raw_content: item.raw_text?.slice(0, 2000) || null,
              location: center ? toEwkt(center.lat, center.lng) : null,
              distance_label: 'kawasan',
              source_url: item.source_url,
              source_name: source.name,
              is_new: false,
              relevance_score: enriched.relevance_score,
              dedupe_hash: dedupeHash,
              published_at: item.published_at,
              expires_at: new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString(),
            };

            const { error: insertError } = await supabase.from('kurva_local_signals').insert(row);
            if (insertError) {
              console.error(`[crawl-rss] insert failed for "${item.title}":`, insertError.message);
              return;
            }
            itemsInserted++;
          });

          await supabase
            .from('kurva_source_registry')
            .update({ last_crawled_at: new Date().toISOString() })
            .eq('id', source.id);

          // Status is no longer a blanket 'success' just because the source
          // didn't throw — a run that fetched fine but inserted nothing
          // because every candidate failed enrichment (e.g. Haiku API down /
          // credit balance empty) needs to be visibly distinct from a run
          // that legitimately had nothing new (0 candidates after dedupe).
          // See the KURVA audit: "success" masking 0-insertion enrichment
          // failure was a real observability gap.
          let runStatus = 'success';
          let runErrorMessage = null;
          if (itemsInserted === 0) {
            if (candidates.length === 0) {
              runStatus = 'empty'; // nothing new to enrich — fine, not a failure
            } else if (enrichmentFailures > 0) {
              runStatus = 'degraded';
              runErrorMessage = `${enrichmentFailures}/${candidates.length} kandidat gagal enrichment. Contoh: ${enrichmentFailureSample}`;
            } else {
              runStatus = 'empty'; // enrichment ran fine, everything was irrelevant or deduped post-enrichment
            }
          }

          if (runRow) {
            await supabase
              .from('kurva_crawl_runs')
              .update({
                finished_at: new Date().toISOString(),
                items_fetched: itemsFetched,
                items_inserted: itemsInserted,
                items_deduped: itemsDeduped,
                status: runStatus,
                error_message: runErrorMessage,
              })
              .eq('id', runRow.id);
          }

          summary.sources_processed++;
          summary.items_inserted += itemsInserted;
          summary.items_deduped += itemsDeduped;
        } catch (sourceErr) {
          console.error(`[crawl-rss] source "${source.name}" failed:`, sourceErr.message);
          summary.sources_failed++;
          if (runRow) {
            await supabase
              .from('kurva_crawl_runs')
              .update({
                finished_at: new Date().toISOString(),
                items_fetched: itemsFetched,
                items_inserted: itemsInserted,
                items_deduped: itemsDeduped,
                status: 'error',
                error_message: sourceErr.message?.slice(0, 500),
              })
              .eq('id', runRow.id);
          }
          // Continue to next source — one broken feed (e.g. tag_page selector
          // drift) shouldn't take down the whole crawl run.
        }
      }
    }

    res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('[crawl-rss] fatal error:', err);
    res.status(500).json({ ok: false, error: err.message, ...summary });
  }
};
