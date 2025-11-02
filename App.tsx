import React, { useState, useCallback } from 'react';
import StartScreen from './components/StartScreen';
import GameScreen from './components/GameScreen';
import type { GameMode } from './types';

type GameState = 'start' | 'playing';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('start');
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [quarks, setQuarks] = useState<number>(0);

  const startGame = useCallback((mode: GameMode) => {
    setGameMode(mode);
    setQuarks(0);
    setGameState('playing');
  }, []);

  const backToMenu = useCallback(() => {
    setGameState('start');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-7xl">
        {gameState === 'start' ? (
          <StartScreen onStart={startGame} />
        ) : (
          <GameScreen
            gameMode={gameMode}
            quarks={quarks}
            setQuarks={setQuarks}
            onBackToMenu={backToMenu}
          />
        )}
      </div>
    </div>
  );
};

export default App;