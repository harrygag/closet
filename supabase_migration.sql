-- Run this in Supabase Dashboard > SQL Editor

-- 1. Create credentials table
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

-- 2. Enable RLS
alter table public.user_marketplace_credentials enable row level security;

-- 3. Create RLS policies
create policy "Users can view own credentials" 
  on public.user_marketplace_credentials for select 
  using (auth.uid() = user_uuid);

create policy "Users can insert/update own credentials" 
  on public.user_marketplace_credentials for all 
  using (auth.uid() = user_uuid);

create policy "Users can delete own credentials" 
  on public.user_marketplace_credentials for delete 
  using (auth.uid() = user_uuid);

-- 4. Create marketplace drafts table
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

-- 5. Enable RLS for drafts
alter table public.marketplace_listing_drafts enable row level security;

-- 6. Policies for drafts
create policy "Users can manage own drafts" 
  on public.marketplace_listing_drafts for all 
  using (auth.uid() = user_uuid);

