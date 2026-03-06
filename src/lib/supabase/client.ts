import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    // Use fallback empty strings so Next.js build doesn't crash when
    // NEXT_PUBLIC env vars aren't available at build time (e.g. Railway CI)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
    return createBrowserClient(url, key);
}
