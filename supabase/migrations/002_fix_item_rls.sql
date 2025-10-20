-- Fix RLS policies for Item table
-- Issue 1: Policies were set for "public" role but authenticated users use "authenticated" role
-- Issue 2: authenticated role didn't have schema-level permissions
-- This migration grants schema access and creates proper RLS policies

-- Grant schema access to authenticated role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own items" ON "Item";
DROP POLICY IF EXISTS "Users can insert their own items" ON "Item";
DROP POLICY IF EXISTS "Users can update their own items" ON "Item";
DROP POLICY IF EXISTS "Users can delete their own items" ON "Item";

-- Create correct policies for authenticated role
CREATE POLICY "Users can view their own items" 
  ON "Item" FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can insert their own items" 
  ON "Item" FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can update their own items" 
  ON "Item" FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_uuid)
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can delete their own items" 
  ON "Item" FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_uuid);

