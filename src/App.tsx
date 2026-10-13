import { lazy, Suspense, useEffect, useState } from 'react';
import { TabNavigation } from './components/TabNavigation';
import { Auth } from './components/Auth';
import { AccountBar } from './components/AccountBar';
import { ResetPassword } from './components/ResetPassword';
import { getSupabase, missingSupabaseEnv } from './lib/supabase';
import { claimLocalData, flushPush, hasUnsyncedChanges, startSync, stopSync } from './lib/sync';
import { clearAllData } from './lib/storage';
import type { TabType } from './types';
import type { Session } from '@supabase/supabase-js';

// Split per tab so the auth screen and first tab load without the other decks or the charting library
const TriviaStudy = lazy(() => import('./pages/TriviaStudy').then(m => ({ default: m.TriviaStudy })));
const VocabularyStudy = lazy(() => import('./pages/VocabularyStudy').then(m => ({ default: m.VocabularyStudy })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center text-white">
      <div>{children}</div>
    </div>
  );
}

function App() {
  if (missingSupabaseEnv.length > 0) {
    return (
      <FullScreenMessage>
        <h1 className="text-xl font-bold mb-2">App not configured</h1>
        <p className="text-slate-400">
          This build is missing {missingSupabaseEnv.join(' and ')}. Set them in <code>.env.local</code> or
          as repository secrets for the deploy workflow.
        </p>
      </FullScreenMessage>
    );
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState<TabType>('trivia');
  // Tabs stay mounted after their first visit so switching tabs doesn't end a session
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(() => new Set(['trivia']));
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);

  useEffect(() => {
    // Fires INITIAL_SESSION on subscribe, so no separate getSession() call is needed
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecoveringPassword(true);
      if (session) {
        claimLocalData(session.user.id);
        // Supabase calls made inside this callback can deadlock the auth lock; defer them
        setTimeout(() => void startSync(session.user.id), 0);
      } else {
        stopSync();
      }
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setVisitedTabs(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  };

  const handleSignOut = async () => {
    await flushPush();
    // Keep unsynced progress on this device; it's tagged with its owner and
    // cleared automatically if a different account signs in.
    const canClear = !hasUnsyncedChanges();
    await getSupabase().auth.signOut();
    stopSync();
    if (canClear) clearAllData();
  };

  if (isLoading) {
    return <FullScreenMessage>Loading...</FullScreenMessage>;
  }

  if (isRecoveringPassword && session) {
    return <ResetPassword onDone={() => setIsRecoveringPassword(false)} />;
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <AccountBar email={session.user.email} onSignOut={() => void handleSignOut()} />
      <Suspense fallback={<FullScreenMessage>Loading...</FullScreenMessage>}>
        {visitedTabs.has('trivia') && (
          <div hidden={activeTab !== 'trivia'}>
            <TriviaStudy isActive={activeTab === 'trivia'} />
          </div>
        )}
        {visitedTabs.has('vocabulary') && (
          <div hidden={activeTab !== 'vocabulary'}>
            <VocabularyStudy isActive={activeTab === 'vocabulary'} />
          </div>
        )}
        {visitedTabs.has('analytics') && (
          <div hidden={activeTab !== 'analytics'}>
            <Analytics />
          </div>
        )}
      </Suspense>
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
