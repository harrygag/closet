-- Create table for storing encrypted marketplace credentials
-- This allows users to save login credentials for automated scraping

CREATE TABLE IF NOT EXISTS user_marketplace_credentials (
  user_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('ebay', 'poshmark', 'depop', 'vendoo')),
  email TEXT,
  cookies_encrypted TEXT, -- Encrypted JSON array of cookies from browser export
  password_encrypted TEXT, -- [DEPRECATED] Use cookies instead
  session_cookie TEXT, -- [DEPRECATED] Use cookies_encrypted instead
  last_validated_at TIMESTAMPTZ, -- When cookies were last verified as working
  expires_at TIMESTAMPTZ, -- When cookies are expected to expire
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_uuid, marketplace)
);

-- Enable RLS for security
ALTER TABLE user_marketplace_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own credentials
CREATE POLICY "Users can view their own marketplace credentials" 
  ON user_marketplace_credentials FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_uuid);

CREATE POLICY "Users can insert their own marketplace credentials" 
  ON user_marketplace_credentials FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can update their own marketplace credentials" 
  ON user_marketplace_credentials FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_uuid)
  WITH CHECK (auth.uid() = user_uuid);

CREATE POLICY "Users can delete their own marketplace credentials" 
  ON user_marketplace_credentials FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_uuid);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_credentials_user 
  ON user_marketplace_credentials(user_uuid, marketplace);

-- Add comment for documentation
COMMENT ON TABLE user_marketplace_credentials IS 'Stores encrypted credentials for marketplace integrations';

