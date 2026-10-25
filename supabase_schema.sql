-- Run this in your Supabase SQL Editor. It is idempotent: safe to run on a
-- fresh project or on top of the original schema.

-- 1. One row per user holding their synced study data
CREATE TABLE IF NOT EXISTS user_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trivia_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  vocabulary_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  study_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_vocabulary JSONB NOT NULL DEFAULT '{}'::jsonb,
  incorrect_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_science_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Upgrade an existing table created by the original schema
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS user_vocabulary JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS incorrect_counts JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS data_science_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS user_facts JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Deleting a user account should delete their progress instead of being blocked by it
ALTER TABLE user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_fkey;
ALTER TABLE user_progress
  ADD CONSTRAINT user_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Custom vocabulary now lives in user_progress.user_vocabulary (merged
--    per word with delete tombstones). The old user_vocabulary table was never
--    written by the app; drop it if it exists and is empty.
DO $$
BEGIN
  -- Nested so the SELECT is only planned when the table exists
  IF to_regclass('public.user_vocabulary') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_vocabulary) THEN
      DROP TABLE public.user_vocabulary;
    END IF;
  END IF;
END $$;

-- 3. Row Level Security: users can only read and write their own row
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can manage own progress" ON user_progress;

CREATE POLICY "Users can manage own progress" ON user_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
