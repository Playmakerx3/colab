import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xcejyvnxjqbwaceqlcyy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZWp5dm54anFid2FjZXFsY3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MTM1MTcsImV4cCI6MjA4OTk4OTUxN30.zTWPGdUzVjAm-26ipTjbQE-9XOGW4FVJNrZhwZUQWTs'

export const supabase = createClient(supabaseUrl, supabaseKey)
