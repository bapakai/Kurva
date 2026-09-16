// lib/haiku.js
// Thin wrapper around Claude Haiku for the enrichment step of the crawl
// pipeline: classify relevance, summarize into a short card copy, and give a
// dedupe-friendly normalized title. Kept cheap on purpose — Haiku only, no
// long context — because this runs continuously on a cron, not on-demand.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.KURVA_HAIKU_MODEL || 'claude-haiku-4-5';

/**
 * Enrich one raw crawled item (news article or place) into KURVA's
 * local_signals shape.
 *
 * @param {{category: 'berita'|'tempat'|'acara', title: string, raw_text: string, region_name: string}} item
 * @returns {Promise<{is_relevant: boolean, summary: string, relevance_score: number, normalized_title: string}>}
 */
async function enrichSignal(item) {
  if (!ANTHROPIC_API_KEY) {
    // Fail soft: without a key, pass the item through un-enriched rather than
    // crashing the whole crawl run. api/cron/crawl-*.js logs this as a warning.
    return {
      is_relevant: true,
      summary: (item.raw_text || item.title || '').slice(0, 180),
      relevance_score: 0.5,
      normalized_title: item.title,
    };
  }

  const prompt = `Kamu adalah editor lokal untuk KURVA, aplikasi "Local Intelligence Layer" kawasan ${item.region_name}.
Tugas: baca 1 item mentah (kategori: ${item.category}), lalu balas HANYA JSON valid dengan schema:
{"is_relevant": boolean, "summary": string, "relevance_score": number, "normalized_title": string}

Aturan:
- is_relevant: false kalau item ini gak benar-benar spesifik/relevan buat warga kawasan ${item.region_name} (misal berita nasional yang cuma nyebut nama kawasan sekilas).
- summary: satu-dua kalimat pendek gaya "menyimpulkan bukan menunjukkan" — kasih insight, bukan cuma judul ulang. Bahasa Indonesia santai tapi jelas. Maks ~140 karakter.
- relevance_score: 0.0-1.0, seberapa penting/berguna item ini buat warga kawasan hari ini.
- normalized_title: judul singkat dipakai buat dedupe fuzzy-match (buang kata pembuka redaksi, tanggal, dsb).

Item:
Judul: ${item.title}
Isi: ${(item.raw_text || '').slice(0, 1500)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Haiku enrichment failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data?.content?.[0]?.text || '{}';

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      is_relevant: Boolean(parsed.is_relevant),
      summary: String(parsed.summary || '').slice(0, 280),
      relevance_score: Math.max(0, Math.min(1, Number(parsed.relevance_score) || 0.5)),
      normalized_title: String(parsed.normalized_title || item.title).slice(0, 200),
    };
  } catch (err) {
    throw new Error(`Haiku enrichment returned unparseable JSON: ${raw.slice(0, 300)}`);
  }
}

module.exports = { enrichSignal };
