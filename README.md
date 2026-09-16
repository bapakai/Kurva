# KURVA — Local Intelligence Layer

"Lihat Sekitarmu." Bagian dari ekosistem Karya NAP (Nusantara Agung Persada), satu keluarga dengan BapakAI, TOPSID, dan Pustakadio.

Backend + frontend MVP untuk pilot kawasan **Bintaro**. Lihat `brand/04_BRAND_GUIDE/` untuk aturan brand lengkap (locked master assets — jangan redesign wordmark/app icon).

## Struktur folder

```
kurva-project/
├── api/
│   ├── signals.js              GET /api/signals — serve local_signals by lokasi user
│   └── cron/
│       ├── crawl-rss.js        Cron harian: crawl berita (RSS + tag-page scrape) + Haiku enrichment
│       ├── crawl-places.js     Cron harian: crawl tempat (OSM/Google Places) + cleanup chained di akhir
│       └── cleanup-expired.js  Endpoint retention manual/standby (lihat catatan cron di bawah)
├── lib/
│   ├── supabase.js             Service-role client (server-side only)
│   ├── haiku.js                 Enrichment via Claude Haiku
│   ├── geo.js                   Parse/format kolom geography PostGIS
│   ├── dedupe.js                 Fuzzy dedupe (sebelum panggil Haiku, biar hemat)
│   ├── cleanup.js               Logic retention, dipakai cleanup-expired.js & crawl-places.js
│   ├── _news-providers/         rss.js (RSS/Atom standar), tag_page.js (scrape listing page)
│   └── _places-providers/       osm.js (aktif), google.js (dormant — nunggu billing)
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

## Deploy ke Vercel

Project ini didesain untuk tim `bapak-ai` (sama seperti TOPSID/Pustakadio), plan Hobby.

**Env vars yang wajib diisi di Vercel Project Settings → Environment Variables:**
| Key | Dari mana |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → project Pustakadio → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | sama, bagian "service_role" — **rahasia, jangan commit** |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | kosongkan dulu sampai billing Google Cloud aktif |
| `CRON_SECRET` | string acak bebas, buat autentikasi endpoint cron |

**Catatan penting soal cron di plan Hobby**: Vercel Hobby cuma kasih maksimal **2 cron job per project, masing-masing max 1x/hari**. Rekap awal proyek nyebut "RSS tiap jam" — itu gak feasible di Hobby. `vercel.json` di repo ini sudah disesuaikan: 2 cron (crawl-rss jam 23:00 UTC / 06:00 WIB, crawl-places jam 23:30 UTC / 06:30 WIB), dan `cleanup-expired` di-chain otomatis di akhir `crawl-places.js` biar retention tetap jalan harian tanpa butuh slot cron ke-3. Kalau nanti upgrade ke Pro, bisa naikin frekuensi RSS jadi tiap jam dan kasih `cleanup-expired` slot croonnya sendiri.

## GitHub repo

Rekap awal proyek merencanakan repo terpisah `bapakai/kurva`. Sesi ini **tidak punya akses untuk membuat repo GitHub baru** (hanya bisa baca repo yang sudah eksplisit di-attach ke sesi) — jadi repo itu perlu dibuat manual oleh Pak Arba'in, lalu isi folder ini di-push. Kode di folder ini sudah di-`git init` + di-commit lokal (lihat riwayat commit) supaya tinggal `git remote add origin ...` dan `git push`.

## Yang belum dikerjakan / limitasi jujur

- **Kategori Acara**: masih kosong, belum ada sumber terstruktur yang bisa di-crawl otomatis (limitasi yang sudah disadari sejak awal riset).
- **Peta interaktif** di halaman Jelajah masih placeholder visual, belum pakai Leaflet/Google Maps JS.
- **"Ringkasan pagi ini"** di Home masih heuristik sederhana (ambil 1 item paling relevan), belum ada langkah enrichment khusus yang menyintesis beberapa sinyal jadi satu paragraf.
- **Badge "Baru buka"** dihitung dari `dedupe_hash` (external_id provider) yang aktif di tabel — akurat selama tempat itu terus muncul di crawl; kalau expired lalu muncul lagi setelah retention 30 hari, statusnya "baru" lagi karena tidak ada tabel tracking permanen terpisah.
- **Halaman Simpan & Profil** masih halaman placeholder kosong.
- **Google Places** tetap dormant (`is_active=false` di `kurva_source_registry`) sampai billing Google Cloud aktif — jangan aktifkan sebelum `GOOGLE_PLACES_API_KEY` diisi & ditest.
