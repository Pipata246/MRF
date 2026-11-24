/**
 * DEPRECATED — do not use.
 * Secrets stay in server .env only. The browser talks to /api/*, never to Supabase.
 * Kept as a no-op so old `npm run env` habits fail loudly.
 */
console.error('[NOVALIBER] gen-env is removed. Put keys in root .env and run `npm run dev`. Browser must not get Supabase keys.');
process.exit(1);
