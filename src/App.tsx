import { useState } from 'react';
import { TabNavigation } from './components/TabNavigation';
import { TriviaStudy } from './pages/TriviaStudy';
import { VocabularyStudy } from './pages/VocabularyStudy';
import type { TabType } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('trivia');

  return (
    <div className="min-h-screen bg-slate-900">
      {activeTab === 'trivia' ? <TriviaStudy /> : <VocabularyStudy />}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default App;
