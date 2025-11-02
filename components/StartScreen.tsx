import React from 'react';
import type { GameMode } from '../types';
import { playClick } from '../services/soundService';

interface StartScreenProps {
  onStart: (mode: GameMode) => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {

  const handleModeSelect = (mode: GameMode) => {
    playClick();
    onStart(mode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md p-8 bg-slate-800/50 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
        <h1 className="text-4xl sm:text-5xl font-bold text-center text-cyan-400 mb-2 font-orbitron">Fysica Formule Flipper</h1>
        <p className="text-center text-slate-300 mb-8">Test je kennis en vorm formules om als een pro!</p>

        <div className="text-center">
          <h2 className="text-2xl text-slate-200 mb-6">Kies een modus:</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => handleModeSelect('classic')}
              className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-cyan-600 hover:border-cyan-400 transition-all duration-300 text-left"
            >
              <h3 className="text-xl font-bold font-orbitron text-yellow-300">Classic Mode</h3>
              <p className="text-slate-300 mt-2">Verzamel 50 quarks door opgaven op te lossen. De moeilijkheid stijgt per level.</p>
            </button>
            <button
              onClick={() => handleModeSelect('streak')}
              className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-orange-600 hover:border-orange-400 transition-all duration-300 text-left"
            >
              <h3 className="text-xl font-bold font-orbitron text-orange-400">Streak Mode</h3>
              <p className="text-slate-300 mt-2">Bouw de langste reeks correcte antwoorden op. Eén fout en je streak is voorbij!</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;