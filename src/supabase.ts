import { createClient } from '@supabase/supabase-js'

const defaultSupabaseUrl = 'https://qatnjksbzegltidoujms.supabase.co'
const defaultSupabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdG5qa3NiemVnbHRpZG91am1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzU1MzEsImV4cCI6MjA5MjgxMTUzMX0.Q6_AxoaJTQNvXlvjx9Kyh925VbHXntDAU8YhWaoU-Dc'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || defaultSupabaseUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || defaultSupabaseAnonKey

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : null
