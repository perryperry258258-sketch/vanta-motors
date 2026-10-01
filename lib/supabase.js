import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const BUCKET = 'car-photos';

let browserClient = null;

export function getSupabase() {
  if (typeof window === 'undefined') {
    return createClient(url, key, { auth: { persistSession: false } });
  }
  if (!browserClient) browserClient = createClient(url, key);
  return browserClient;
}

export function photoUrl(path) {
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}
