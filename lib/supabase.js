// lib/supabase.js
// Service-role Supabase client — server-side only (API routes / cron jobs).
// NEVER import this from client-side code; it bypasses RLS.
//
// KURVA numpang project Supabase milik Pustakadio (lihat README). Semua tabel
// KURVA pakai prefix `kurva_` biar gak bentrok sama tabel Pustakadio yang lain.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Set them in Vercel project settings (see .env.example).'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

module.exports = { supabase };
