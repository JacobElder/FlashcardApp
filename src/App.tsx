import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { TabNavigation } from './components/TabNavigation';
import { Auth } from './components/Auth';
import { AccountBar } from './components/AccountBar';
import { ResetPassword } from './components/ResetPassword';
import { getSupabase, missingSupabaseEnv } from './lib/supabase';
import { claimLocalData, flushPush, hasUnsyncedChanges, startSync, stopSync } from './lib/sync';
import { clearAllData, hasStorageWriteFailed, subscribeToStorageErrors } from './lib/storage';
import { startPendingWordResolver } from './lib/pendingWords';
import type { TabType } from './types';
import type { Session } from '@supabase/supabase-js';

// Split per tab so the auth screen and first tab load without the other decks or the charting library
const TriviaStudy = lazy(() => import('./pages/TriviaStudy').then(m => ({ default: m.TriviaStudy })));
const VocabularyStudy = lazy(() => import('./pages/VocabularyStudy').then(m => ({ default: m.VocabularyStudy })));
const DataScienceStudy = lazy(() => import('./pages/DataScienceStudy').then(m => ({ default: m.DataScienceStudy })));
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

// The home-screen "Add word" shortcut opens ?capture, straight to the vocabulary capture box
const openedForCapture = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('capture');
if (openedForCapture) {
  // Drop the flag so a reload or a resumed PWA doesn't jump back to capture
  const url = new URL(window.location.href);
  url.searchParams.delete('capture');
  window.history.replaceState(window.history.state, '', url);
}
const initialTab: TabType = openedForCapture ? 'vocabulary' : 'trivia';

// A password-reset link lands with #...type=recovery. Supabase also fires
// PASSWORD_RECOVERY, but possibly before App subscribes, so check the URL too.
const openedForRecovery = typeof window !== 'undefined'
  && new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

function StorageWarning() {
  const failed = useSyncExternalStore(subscribeToStorageErrors, hasStorageWriteFailed);
  if (!failed) return null;
  return (
    <p role="alert" className="bg-amber-900/60 text-amber-200 text-sm text-center px-4 py-2">
      This device's storage is full, so new progress isn't being saved here. It's kept while this tab
      stays open and still syncs to your account.
    </p>
  );
}

function AuthenticatedApp() {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // Tabs stay mounted after their first visit so switching tabs doesn't end a session
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(() => new Set([initialTab]));
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(openedForRecovery);

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
        setIsRecoveringPassword(false);
      }
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Define captured words in the background while signed in, whatever tab is open
  const isSignedIn = Boolean(session);
  useEffect(() => (isSignedIn ? startPendingWordResolver() : undefined), [isSignedIn]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setVisitedTabs(prev => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  };

  const handleSignOut = async () => {
    let canClear = false;
    try {
      await flushPush();
      // Keep unsynced progress on this device; it's tagged with its owner and
      // cleared automatically if a different account signs in.
      canClear = !hasUnsyncedChanges();
    } catch (error) {
      console.error('Final sync before sign-out failed:', error);
    }
    try {
      await getSupabase().auth.signOut();
    } catch (error) {
      console.error('Sign-out request failed:', error);
    }
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
      <StorageWarning />
      <Suspense fallback={<FullScreenMessage>Loading...</FullScreenMessage>}>
        {visitedTabs.has('trivia') && (
          <div hidden={activeTab !== 'trivia'}>
            <TriviaStudy isActive={activeTab === 'trivia'} />
          </div>
        )}
        {visitedTabs.has('vocabulary') && (
          <div hidden={activeTab !== 'vocabulary'}>
            <VocabularyStudy isActive={activeTab === 'vocabulary'} autoFocusCapture={openedForCapture} />
          </div>
        )}
        {visitedTabs.has('data-science') && (
          <div hidden={activeTab !== 'data-science'}>
            <DataScienceStudy isActive={activeTab === 'data-science'} />
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
