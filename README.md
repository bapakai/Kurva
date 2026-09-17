# KURVA — Local Intelligence Layer

"Lihat Sekitarmu." Bagian dari ekosistem Karya NAP (Nusantara Agung Persada), satu keluarga dengan BapakAI, TOPSID, dan Pustakadio.

Backend + frontend MVP, pilot pertama di kawasan **Bintaro** — tapi arsitekturnya multi-kawasan dari awal, bukan hardcoded ke satu kota. Lihat `brand/04_BRAND_GUIDE/` untuk aturan brand lengkap (locked master assets — jangan redesign wordmark/app icon).

## Arsitektur multi-kawasan

Bintaro diperlakukan sebagai **satu baris data**, bukan satu-satunya kawasan yang dikenal kode:

- **Backend** sudah region-generic sejak awal: setiap tabel inti (`kurva_source_registry`, `kurva_local_signals`, `kurva_crawl_runs` lewat `kurva_source_registry`) di-scope oleh `region_id`, dan `api/signals.js` resolve kawasan lewat `kurva_nearest_active_region(lat,lng)` atau `?region=<slug>` eksplisit — tidak ada satupun query yang hardcode "Bintaro".
- **`GET /api/regions`** (baru) — endpoint yang list semua kawasan (`active` + `coming_soon`) dari tabel `kurva_regions`. Ini yang dipakai frontend buat render region-switcher, jadi switcher-nya **data-driven**, bukan 3 chip hardcoded seperti sebelumnya.
- **Frontend** (`home.html`) fetch `/api/regions` dan render chip per kawasan: `active` → bisa diklik buat pindah kawasan (nyimpen pilihan di `localStorage`, dipakai ulang lewat `kurva-api.js`); `coming_soon` → tampil disabled + label "SEGERA". String "Bintaro" yang tadinya hardcoded di judul/CTA/meta description sudah diganti jadi teks generik ("sekitarmu"/"kawasan ini") yang diisi dari respons API.

**Menambah kawasan baru** (misal BSD atau Kemang, yang datanya sudah ada di `kurva_regions` dengan status `coming_soon`):
1. `UPDATE kurva_regions SET status='active' WHERE slug='bsd';`
2. Isi baris `kurva_source_registry` buat kawasan itu (OSM `bbox`, RSS/tag-page berita lokal, dst — sama polanya kayak baris Bintaro yang sudah ada).
3. Selesai — tidak ada redeploy frontend yang dibutuhkan; region switcher, hero copy, dan resolusi `/api/signals` otomatis ikut kawasan baru begitu status-nya `active`.

## Struktur folder

```
kurva-project/
├── api/
│   ├── signals.js              GET /api/signals — serve local_signals by lokasi user
│   ├── regions.js               GET /api/regions — list kawasan (active + coming_soon), buat region switcher
│   └── cron/
│       ├── crawl-rss.js        Cron harian: crawl berita (RSS + tag-page scrape) + Haiku enrichment
│       ├── crawl-places.js     Cron harian: crawl tempat (OSM/Google Places) + cleanup chained di akhir
│       └── cleanup-expired.js  Endpoint retention manual/standby (lihat catatan cron di bawah)
├── lib/
│   ├── supabase.js             Service-role client (server-side only)
│   ├── haiku.js                 Enrichment via Claude Haiku
│   ├── geo.js                   Parse/format kolom geography PostGIS
│   ├── dedupe.js                 Fuzzy dedupe (sebelum panggil Haiku, biar hemat) + isDuplicatePlace (dedupe lintas-provider tempat)
│   ├── cleanup.js               Logic retention, dipakai cleanup-expired.js & crawl-places.js
│   ├── _news-providers/         rss.js (RSS/Atom standar), tag_page.js (scrape listing page)
│   └── _places-providers/       osm.js (aktif — primary saat ini), google.js (siap kode, dormant nunggu billing Google Cloud — lihat "Engine tempat" di bawah)
├── public/                      Frontend statis (di-serve Vercel langsung dari folder ini)
│   ├── onboarding.html, home.html, jelajah-detail.html, simpan.html, profil.html
│   ├── manifest.json            PWA manifest
│   └── assets/
│       ├── kurva.css, kurva-api.js   Shared styles & fetch helper
│       ├── logo/                Wordmark asli (locked)
│       └── icons/                App icon berbagai ukuran + favicon/apple-touch-icon
├── brand/                        Full brand kit asli (referensi, bukan buat di-deploy)
├── vercel.json                   Cron schedule
├── package.json
└── .env.example
```

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`, isi semua key (lihat komentar di masing-masing baris)
3. `npx vercel dev` untuk coba lokal, atau langsung deploy (lihat bawah)

## Database (Supabase — numpang project Pustakadio)

Sudah live, sudah ditest sebelumnya:
- Tabel: `kurva_regions`, `kurva_source_registry`, `kurva_local_signals`, `kurva_crawl_runs`
- Fungsi PostGIS: `kurva_nearest_active_region(lat, lng)`, `kurva_signals_within(lat, lng, radius_m, region_id)`
- Seed: kawasan Bintaro (active), BSD & Kemang (coming_soon); source registry Bintaro terisi 4 baris

Kode di repo ini menyesuaikan skema yang sudah ada — **tidak perlu migration baru** untuk menjalankan MVP ini.

## Engine tempat: Google Places (utama) + OSM (backup)

Sesuai arahan terbaru: Google Places dimaksudkan jadi **engine utama** buat kategori "tempat" (metadata lebih lengkap, coverage lebih baik), dan OSM/Overpass jadi **backup** — bukan diganti, tetap jalan terus (gratis, gak butuh billing).

Yang sudah dikerjakan di `api/cron/crawl-places.js`:
- **Urutan prioritas provider**: source di-sort sebelum diproses — `google_places` duluan, `osm` belakangan. Jadi kalau dua-duanya aktif buat satu kawasan, versi Google-lah yang lebih dulu masuk DB.
- **Dedupe lintas-provider** (`lib/dedupe.js` `isDuplicatePlace`, `lib/geo.js` `haversineMeters`): sebelum tempat baru dari OSM di-enrich, dicek dulu apa sudah ada tempat lain (dari Google atau dari run sebelumnya) dalam radius ~60m dengan judul mirip. Kalau iya, di-skip — supaya tempat fisik yang sama gak muncul dobel di app cuma karena kedeteksi dua provider dengan format ID beda (`google:<place_id>` vs OSM node/way id).
- **Isolasi kegagalan tetap seperti sebelumnya**: tiap source diproses independen (try/catch per source) — kalau Google gagal (misal API key belum ada), itu gak menjatuhkan run OSM di kawasan yang sama. Ini otomatis memberi efek "OSM sebagai backup" tanpa logic fallback eksplisit tambahan.

**Yang BELUM bisa dijalankan** (di luar kendali kode, sama kayak Anthropic): `lib/_places-providers/google.js` sudah lengkap kodenya (bukan stub) tapi source `Google Places API (Bintaro)` di `kurva_source_registry` sengaja dibiarkan `is_active=false` sampai `GOOGLE_PLACES_API_KEY` diisi & billing Google Cloud aktif — persis pola yang sama dengan pertimbangan billing Anthropic: begitu itu siap, tinggal `UPDATE kurva_source_registry SET is_active=true WHERE source_type='google_places'` dan runtime langsung jalan maksimal tanpa perlu code deploy lagi.

## Deploy ke Vercel

Project ini didesain untuk tim `bapak-ai` (sama seperti TOPSID/Pustakadio), plan Hobby.

**Env vars yang wajib diisi di Vercel Project Settings → Environment Variables:**
| Key | Dari mana |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → project Pustakadio → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | sama, bagian "service_role" — **rahasia, jangan commit** |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | kosongkan dulu sampai billing Google Cloud aktif — lihat "Engine tempat" di atas |
| `CRON_SECRET` | **wajib diisi sekarang** (sebelumnya kosong = endpoint cron bisa dipanggil siapa saja tanpa autentikasi). Value siap pakai sudah di-generate, lihat pesan chat — jangan commit value-nya ke repo manapun. |

**Catatan penting soal cron di plan Hobby**: Vercel Hobby cuma kasih maksimal **2 cron job per project, masing-masing max 1x/hari**. Rekap awal proyek nyebut "RSS tiap jam" — itu gak feasible di Hobby. `vercel.json` di repo ini sudah disesuaikan: 2 cron (crawl-rss jam 23:00 UTC / 06:00 WIB, crawl-places jam 23:30 UTC / 06:30 WIB), dan `cleanup-expired` di-chain otomatis di akhir `crawl-places.js` biar retention tetap jalan harian tanpa butuh slot cron ke-3. Kalau nanti upgrade ke Pro, bisa naikin frekuensi RSS jadi tiap jam dan kasih `cleanup-expired` slot croonnya sendiri.

## GitHub repo

Rekap awal proyek merencanakan repo terpisah `bapakai/kurva`. Sesi ini **tidak punya akses untuk membuat repo GitHub baru** (hanya bisa baca repo yang sudah eksplisit di-attach ke sesi) — jadi repo itu perlu dibuat manual oleh Pak Arba'in, lalu isi folder ini di-push. Kode di folder ini sudah di-`git init` + di-commit lokal (lihat riwayat commit) supaya tinggal `git remote add origin ...` dan `git push`.

## Status crawl run: success / degraded / empty / error

`kurva_crawl_runs.status` sebelumnya cuma `running` / `success` / `error` — dan run yang fetch-nya sukses tapi enrichment-nya gagal total tetap ditandai `success`, padahal 0 data masuk. Sudah diperbaiki (constraint DB di-migrate, kode di kedua cron handler disesuaikan):

- `success` — ada item yang berhasil di-insert.
- `empty` — run sehat, cuma memang tidak ada yang baru (0 kandidat setelah dedupe/refresh — bukan kegagalan).
- `degraded` — fetch sukses, tapi ada kandidat yang gagal di tahap enrichment (mis. Haiku API error/credit habis) sehingga 0 ter-insert. `error_message` di baris ini otomatis diisi ringkasan (`N/M kandidat gagal, contoh: ...`).
- `error` — source gagal total (exception), sama seperti sebelumnya.

Cek cepat status run terbaru: `select source_id, status, items_fetched, items_inserted, error_message from kurva_crawl_runs order by started_at desc limit 10;`

## Yang belum dikerjakan / limitasi jujur

- **Kategori Acara**: masih kosong, belum ada sumber terstruktur yang bisa di-crawl otomatis (limitasi yang sudah disadari sejak awal riset).
- **Peta interaktif** di halaman Jelajah masih placeholder visual, belum pakai Leaflet/Google Maps JS. Teksnya sekarang sudah dinamis (ikut nama kawasan aktif), tapi belum jadi peta beneran.
- **"Ringkasan pagi ini"** di Home masih heuristik sederhana (ambil 1 item paling relevan), belum ada langkah enrichment khusus yang menyintesis beberapa sinyal jadi satu paragraf.
- **Badge "Baru buka"** dihitung dari `dedupe_hash` (external_id provider) yang aktif di tabel — akurat selama tempat itu terus muncul di crawl; kalau expired lalu muncul lagi setelah retention 30 hari, statusnya "baru" lagi karena tidak ada tabel tracking permanen terpisah.
- **Halaman Simpan & Profil** masih halaman placeholder kosong — belum disentuh di update ini.
- **Google Places** tetap dormant (`is_active=false` di `kurva_source_registry`) sampai billing Google Cloud aktif — kodenya sudah siap jadi engine utama (lihat "Engine tempat" di atas), tinggal 1-row update begitu API key & billing siap.
- **Frontend `public/*.html`** masih HTML statis + vanilla JS yang fetch data client-side saat halaman dibuka (bukan server-rendered/templated per request, tidak pakai framework). Ini cukup buat MVP dan bukan bug — tapi kalau ke depan butuh, misalnya, SEO per-kawasan (URL unik per kota dengan konten ter-render di server) atau personalisasi berat, itu langkah upgrade terpisah (Next.js/SSR), bukan sekadar nambah JS. Yang SUDAH dibikin dinamis di update ini: region switcher, hero copy, region pill, dan teks placeholder peta — semua sekarang ambil dari `/api/regions` & `/api/signals`, bukan teks hardcoded lagi.
