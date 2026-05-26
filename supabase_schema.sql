-- Run this in your Supabase SQL Editor!

-- 1. Create a table to store user's IRT Profiles and Study Progress
CREATE TABLE IF NOT EXISTS user_progress (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  trivia_profile JSONB DEFAULT '{}'::jsonb,
  vocabulary_profile JSONB DEFAULT '{}'::jsonb,
  study_stats JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create a table to store User's custom vocabulary
CREATE TABLE IF NOT EXISTS user_vocabulary (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  part_of_speech TEXT,
  example TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Set up Row Level Security (RLS) so users can only access their own data
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress" ON user_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON user_progress FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vocabulary" ON user_vocabulary FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own vocabulary" ON user_vocabulary FOR ALL USING (auth.uid() = user_id);
