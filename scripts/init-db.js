/**
 * DB Init Script
 * Run with: node scripts/init-db.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env from root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env');
  console.error('Ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SQL = `
-- Create credentials table
create table if not exists public.user_marketplace_credentials (
  id uuid default gen_random_uuid() primary key,
  user_uuid uuid references auth.users(id) on delete cascade not null,
  marketplace text not null,
  email text,
  cookies_encrypted text,
  last_validated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_uuid, marketplace)
);

-- Enable RLS
alter table public.user_marketplace_credentials enable row level security;

-- Create RLS policies (idempotent-ish via DO block or just ignore error if exists)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own credentials') then
    create policy "Users can view own credentials" 
      on public.user_marketplace_credentials for select 
      using (auth.uid() = user_uuid);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Users can insert/update own credentials') then
    create policy "Users can insert/update own credentials" 
      on public.user_marketplace_credentials for all 
      using (auth.uid() = user_uuid);
  end if;
  
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own credentials') then
    create policy "Users can delete own credentials" 
      on public.user_marketplace_credentials for delete 
      using (auth.uid() = user_uuid);
  end if;
end
$$;

-- Create marketplace_listing_drafts table
create table if not exists public.marketplace_listing_drafts (
  id uuid default gen_random_uuid() primary key,
  user_uuid uuid references auth.users(id) on delete cascade not null,
  marketplace text not null,
  marketplace_listing_id text not null,
  title text,
  status text,
  price_cents integer,
  sku text,
  url text,
  image_urls text[],
  raw_payload jsonb,
  closet_item_id uuid references public."Item"(id) on delete set null,
  ready_for_crosspost boolean default false,
  crosspost_targets text[],
  imported_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(marketplace, marketplace_listing_id, user_uuid)
);

-- Enable RLS for drafts
alter table public.marketplace_listing_drafts enable row level security;

-- Policies for drafts
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'marketplace_listing_drafts' and policyname = 'Users can manage own drafts') then
    create policy "Users can manage own drafts" 
      on public.marketplace_listing_drafts for all 
      using (auth.uid() = user_uuid);
  end if;
end
$$;
`;

async function runMigration() {
  console.log('🔌 Connecting to Supabase...');
  
  // We can't run raw SQL via JS client easily without a specific postgres function or extension.
  // BUT, we can try to use the rpc() if a raw_sql function exists, OR just use standard table creation via REST if supported (it's not for DDL).
  // 
  // Actually, standard Supabase JS client DOES NOT support DDL (Create Table).
  // We need to use the 'postgres' library or similar if we have the connection string.
  //
  // If we only have the REST URL/Key, we are stuck unless the user runs it in Dashboard.
  //
  // HOWEVER: `scripts/run-migration.ts` was calling a LOCAL API endpoint `http://local/api/admin/migrate-items`.
  // If that API has db access, we can piggyback.
  //
  // Looking at `server/api.js`, it uses `createClient`.
  // `server/api.js` DOES NOT have a `query` or `rpc` endpoint for arbitrary SQL.
  
  // CHANGE OF PLAN:
  // The user mentioned "youre not going to be able to test yourself".
  // I will output the SQL to a file and tell them to copy-paste it into the SQL Editor.
  // Trying to hack a DDL execution through the JS client without a known `exec_sql` function is prone to failure.
  
  console.log('\n⚠️  AUTOMATED MIGRATION VIA JS CLIENT IS RESTRICTED ⚠️');
  console.log('Supabase security prevents creating tables via the API client by default.');
  console.log('\nPlease run the SQL below in your Supabase Dashboard -> SQL Editor:\n');
  console.log(SQL);
}

runMigration().catch(console.error);

