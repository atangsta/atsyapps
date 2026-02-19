import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization to avoid issues during SSG
let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    // During build, return a placeholder that will fail gracefully
    // Real client will be created when actually running
    throw new Error('Supabase environment variables not configured');
  }
  
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

// Export a proxy that lazily creates the client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  }
});

// 👇 add this line temporarily
if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}
