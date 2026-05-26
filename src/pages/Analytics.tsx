import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { getFromStorage } from '../lib/storage';
import type { IRTProfile } from '../types';

export function Analytics() {
  const [activeDeck, setActiveDeck] = useState<'trivia' | 'vocabulary'>('trivia');
  
  const profileKey = activeDeck === 'trivia' ? 'nyc-trivia-progress' : 'nyc-vocabulary-progress';
  const profile = getFromStorage<IRTProfile>(profileKey, { ability: 0, cardHistory: {} });
  
  const chartData = useMemo(() => {
    if (!profile.abilityHistory) return [];
    
    return profile.abilityHistory.map((entry, index) => ({
      step: index + 1,
      ability: Number(entry.ability.toFixed(2)),
      date: new Date(entry.date).toLocaleDateString()
    }));
  }, [profile.abilityHistory]);

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-20 pt-8 px-4">
      <div className="max-w-md mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Quant Analytics</h1>
          <p className="text-slate-400">Monitor your adaptive learning algorithms</p>
        </header>

        <div className="flex bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setActiveDeck('trivia')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeDeck === 'trivia' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trivia Data
          </button>
          <button
            onClick={() => setActiveDeck('vocabulary')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              activeDeck === 'vocabulary' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Vocabulary Data
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">θ (Ability) Trajectory</h2>
          <p className="text-sm text-slate-400 mb-6">
            Tracks the MLE (Maximum Likelihood Estimation) of your latent ability over time.
          </p>
          
          {chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="step" stroke="#94a3b8" tick={{fontSize: 12}} />
                  <YAxis domain={[-4, 4]} stroke="#94a3b8" tick={{fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <ReferenceLine y={0} stroke="#475569" />
                  <Line 
                    type="monotone" 
                    dataKey="ability" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg">
              <p className="text-slate-500 text-center px-4">Not enough data to plot trajectory.<br/>Complete a few study sessions first!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
