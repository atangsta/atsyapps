import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // During build/SSG, env vars might not be available
  // Return a dummy client that will be replaced on the client side
  if (!supabaseUrl || !supabaseAnonKey) {
    // This should only happen during static generation
    // The real client will be created on the browser
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    )
  }
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
