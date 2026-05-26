import { supabase } from './supabase';
import { getFromStorage, setToStorage } from './storage';

export async function syncToCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const triviaProgress = getFromStorage('nyc-trivia-progress', {});
  const vocabProgress = getFromStorage('nyc-vocabulary-progress', {});
  const studyStats = getFromStorage('nyc-study-stats', {});

  await supabase.from('user_progress').upsert({
    user_id: user.id,
    trivia_profile: triviaProgress,
    vocabulary_profile: vocabProgress,
    study_stats: studyStats,
    updated_at: new Date().toISOString()
  });
}

export async function syncFromCloud() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return;

  // We only overwrite if there is actual data in the cloud to prevent wiping local
  if (Object.keys(data.trivia_profile || {}).length > 0) {
    setToStorage('nyc-trivia-progress', data.trivia_profile);
  }
  if (Object.keys(data.vocabulary_profile || {}).length > 0) {
    setToStorage('nyc-vocabulary-progress', data.vocabulary_profile);
  }
  if (Object.keys(data.study_stats || {}).length > 0) {
    setToStorage('nyc-study-stats', data.study_stats);
  }
}
