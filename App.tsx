import React, { useState } from 'react';
import GameScreen from './components/GameScreen';
import StartScreen from './components/StartScreen';
import type { GameMode } from './types';

const App: React.FC = () => {
  // Fix: Add state to manage game mode and switch between StartScreen and GameScreen.
  const [gameMode, setGameMode] = useState<GameMode | null>(null);

  const handleStartGame = (mode: GameMode) => {
    setGameMode(mode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-7xl">
        {gameMode ? (
          <GameScreen />
        ) : (
          <StartScreen onStart={handleStartGame} />
        )}
      </div>
    </div>
  );
};

export default App;