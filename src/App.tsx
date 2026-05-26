import { useState } from 'react';
import { TabNavigation } from './components/TabNavigation';
import { TriviaStudy } from './pages/TriviaStudy';
import { VocabularyStudy } from './pages/VocabularyStudy';
import { Analytics } from './pages/Analytics';
import { Auth } from './components/Auth';
import { supabase } from './lib/supabase';
import { syncFromCloud } from './lib/sync';
import type { TabType } from './types';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('trivia');
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        syncFromCloud().finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) syncFromCloud();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={() => supabase.auth.signOut()}
          className="bg-slate-800 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md border border-slate-700"
        >
          Sign Out
        </button>
      </div>
      {activeTab === 'trivia' && <TriviaStudy />}
      {activeTab === 'vocabulary' && <VocabularyStudy />}
      {activeTab === 'analytics' && <Analytics />}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
