import { createClient } from '@supabase/supabase-js'

// Supabase configuration
// You'll need to replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://your-project.supabase.co' // Replace with your URL
const SUPABASE_ANON_KEY = 'your-anon-key-here' // Replace with your anon key

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // For this app, we'll use anonymous access initially
    // Can add proper auth later if needed
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})