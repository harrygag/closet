import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_CLIENT_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)



