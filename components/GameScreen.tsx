import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPhysicsProblem, checkAnswer } from '../services/geminiService';
import type { Problem, EquationSide, DraggableItem } from '../types';
import DraggableSymbol from './DraggableSymbol';
import DropZone from './DropZone';
import Modal from './Modal';
import { LoadingSpinner, BackIcon, RetryIcon, NextIcon, ResetIcon } from './Icons';
import { FormulaRenderer } from './FormulaRenderer';

const GameScreen: React.FC = () => {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  
  const emptySide: EquationSide = useMemo(() => ({ items: [] }), []);
  
  const [leftSide, setLeftSide] = useState<EquationSide>(emptySide);
  const [rightSide, setRightSide] = useState<EquationSide>(emptySide);
  
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    isCorrect: boolean | null;
    explanation: string;
  }>({ isOpen: false, isCorrect: null, explanation: '' });

  
  const { quantities, operators } = useMemo(() => {
    if (!problem) return { quantities: [], operators: [] };

    const OPERATOR_ORDER = ['(', ')', '+', '-', '*', '__fraction__', '__square__', '__sqrt__'];
    const allOperators = new Set(OPERATOR_ORDER);

    const quantities: string[] = [];
    const operators: string[] = [];
    
    const uniqueSymbols = [...new Set(problem.symbols)].filter((s): s is string => typeof s === 'string');

    uniqueSymbols.forEach(symbol => {
      if (allOperators.has(symbol)) {
        operators.push(symbol);
      } else {
        quantities.push(symbol);
      }
    });

    quantities.sort((a, b) => a.localeCompare(b));
    operators.sort((a, b) => OPERATOR_ORDER.indexOf(a) - OPERATOR_ORDER.indexOf(b));

    return { quantities, operators };
  }, [problem]);

  const fetchNewProblem = useCallback(() => {
    setIsLoading(true);
    const newProblem = getPhysicsProblem();
    setProblem(newProblem);
    setLeftSide(emptySide);
    setRightSide(emptySide);
    setIsLoading(false);
  }, [emptySide]);

  useEffect(() => {
    fetchNewProblem();
  }, [fetchNewProblem]);

  const handleLeftSideChange = (newSide: EquationSide) => {
    setLeftSide(newSide);
  };

  const handleRightSideChange = (newSide: EquationSide) => {
    setRightSide(newSide);
  };
  
  const handleReset = useCallback(() => {
    setLeftSide(emptySide);
    setRightSide(emptySide);
  }, [emptySide]);

  const serializeSide = (side: EquationSide): string => {
    const serializeItems = (items: DraggableItem[]): string => {
        return items.map(item => {
            if (item.type === 'symbol') {
                if (item.content === '__square__') {
                    return '^2';
                }
                return item.content;
            }
            if (item.type === 'sqrt') {
                const content = serializeSide(item.content);
                return `sqrt(${content || ' '})`;
            }
            if (item.type === 'fraction') {
                const numeratorPart = serializeSide(item.numerator);
                const denominatorPart = serializeSide(item.denominator);
                const num = item.numerator.items.length > 1 ? `( ${numeratorPart} )` : numeratorPart || ' ';
                const den = item.denominator.items.length > 1 ? `( ${denominatorPart} )` : denominatorPart || ' ';
                return `${num} / ${den}`;
            }
            return '';
        }).join(' ');
    };
    return serializeItems(side.items).trim();
  };
  
  const isSideSubmittable = (side: EquationSide): boolean => {
    if (side.items.length === 0) {
        return false;
    }

    const checkItems = (items: DraggableItem[]): boolean => {
        for (const item of items) {
            if (item.type === 'sqrt') {
                if (item.content.items.length === 0 || !isSideSubmittable(item.content)) {
                    return false;
                }
            }
            if (item.type === 'fraction') {
                const numEmpty = item.numerator.items.length === 0;
                const denEmpty = item.denominator.items.length === 0;

                if (numEmpty || denEmpty) return false;
                if (!isSideSubmittable(item.numerator)) return false;
                if (!isSideSubmittable(item.denominator)) return false;
            }
        }
        return true;
    };

    return checkItems(side.items);
  };
  
  const handleSubmit = async () => {
    if (!problem) return;
    setIsChecking(true);
    const userAnswer = `${serializeSide(leftSide)} = ${serializeSide(rightSide)}`;
    const result = await checkAnswer(problem, userAnswer);

    setModalState({
      isOpen: true,
      isCorrect: result.isCorrect,
      explanation: result.explanation,
    });
    setIsChecking(false);
  };
  
  const handleProceedToNextProblem = () => {
    setModalState({ isOpen: false, isCorrect: null, explanation: '' });
    fetchNewProblem();
  };
  
  const handleRetry = () => {
    setModalState({ isOpen: false, isCorrect: null, explanation: '' });
    handleReset();
  };

  const handleLogState = useCallback(() => {
    console.log("--- Huidige Staat Formule ---");
    console.log("Linkerkant:", JSON.stringify(leftSide, null, 2));
    console.log("Rechterkant:", JSON.stringify(rightSide, null, 2));
    alert("De huidige status van de formule is naar de console gelogd.");
    console.log("-----------------------------");
  }, [leftSide, rightSide]);

  const isSideEmpty = (side: EquationSide) => {
    return side.items.length === 0;
  };

  const isEquationEmpty = isSideEmpty(leftSide) && isSideEmpty(rightSide);
  const canSubmit = isSideSubmittable(leftSide) && isSideSubmittable(rightSide);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <LoadingSpinner />
        <p className="mt-4 text-xl font-orbitron text-cyan-300">Nieuwe opgave laden...</p>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center h-[80vh] flex flex-col justify-center items-center">
        <h2 className="text-2xl text-red-400">Fout bij laden van opgave</h2>
        <button onClick={fetchNewProblem} className="mt-4 px-6 py-2 bg-cyan-500 text-slate-900 font-bold rounded-lg hover:bg-cyan-400 transition-colors">
          Probeer opnieuw
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="flex justify-center items-center gap-4 mb-4">
        <h2 className="text-3xl font-bold font-orbitron text-cyan-400">Fysica Formule Flipper</h2>
      </header>

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-6 p-6 bg-slate-800/50 rounded-2xl border border-slate-700 relative">
            <div className="text-center p-4 bg-slate-900 rounded-lg border-2 border-cyan-500">
                <p className="text-slate-300 text-lg mb-2">Vorm de formule om voor de gemarkeerde grootheid:</p>
                <div className="text-3xl font-bold text-cyan-400 font-orbitron mt-2 flex items-center justify-center gap-2 flex-wrap">
                    {problem && typeof problem.originalFormula === 'string' && (
                      <FormulaRenderer formula={problem.originalFormula} highlight={problem.targetVariable} />
                    )}
                </div>
            </div>
            <div className="flex-grow flex flex-col md:flex-row items-center justify-center gap-4">
                <div className="w-full md:w-1/3 lg:w-1/4 h-full">
                    <DropZone side={leftSide} onSideChange={handleLeftSideChange} isClearable={false} />
                </div>
                <div className="text-5xl font-bold text-slate-400 mx-2">=</div>
                <div className="w-full md:w-2/3 lg:w-3/4 h-full">
                    <DropZone side={rightSide} onSideChange={handleRightSideChange} isClearable={false} />
                </div>
            </div>
             <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-auto pt-4">
                <button 
                  onClick={handleReset} 
                  disabled={isEquationEmpty}
                  className="px-6 py-3 w-full md:w-auto bg-red-600 text-slate-100 font-bold rounded-lg text-lg hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <ResetIcon /> Reset
                </button>
                <button 
                  onClick={handleSubmit} 
                  disabled={isChecking || !canSubmit}
                  className="px-8 py-3 w-full md:w-auto bg-green-500 text-slate-900 font-bold rounded-lg text-xl hover:bg-green-400 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  {isChecking ? <LoadingSpinner /> : 'Controleer Antwoord'}
                </button>
            </div>
            <button
              onClick={handleLogState}
              className="absolute bottom-4 right-4 px-3 py-1 bg-slate-700 text-slate-300 font-mono text-xs rounded-md hover:bg-slate-600 transition-colors"
              title="Log de huidige status naar de console voor debuggen"
            >
              Log State
            </button>
        </div>

        <div className="lg:col-span-1 p-4 bg-slate-800/50 rounded-2xl border border-slate-700 flex flex-col gap-6">
          <div>
            <h3 className="text-xl font-bold mb-4 text-center font-orbitron text-cyan-400">Grootheden</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
              {quantities.map(s => <DraggableSymbol key={s} symbol={s} />)}
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-4 text-center font-orbitron text-cyan-400">Tekens</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
              {operators.map(s => <DraggableSymbol key={s} symbol={s} />)}
            </div>
          </div>
        </div>
      </main>

       <Modal isOpen={modalState.isOpen} onClose={handleProceedToNextProblem}>
            {modalState.isCorrect ? (
                 <div className="text-center">
                    <h2 className="text-4xl font-bold font-orbitron mb-4 text-green-400">Correct!</h2>
                    <p>Goed gedaan! De formule is correct omgevormd.</p>
                    <div className="mt-6 flex justify-center gap-4">
                        <button onClick={handleProceedToNextProblem} className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-slate-900 font-bold rounded-lg hover:bg-cyan-400 transition-colors"><NextIcon /> Volgende Opgave</button>
                    </div>
                 </div>
            ) : (
                <div className="text-center">
                    <h2 className="text-4xl font-bold font-orbitron mb-4 text-red-400">Helaas...</h2>
                    <div className="prose prose-invert max-w-none text-left bg-slate-900/50 p-4 rounded-lg space-y-4">
                        <div>
                           <h3 className="font-bold text-cyan-400">Hint:</h3>
                           <p>{modalState.explanation}</p>
                        </div>
                         <div>
                           <h3 className="font-bold text-cyan-400">Correcte oplossing:</h3>
                           <div className="text-xl text-center flex justify-center items-center">
                               {problem && typeof problem.correctAnswer === 'string' && <FormulaRenderer formula={problem.correctAnswer} />}
                           </div>
                       </div>
                    </div>
                    <div className="mt-6 flex justify-center gap-4">
                         <button onClick={handleRetry} className="flex items-center gap-2 px-6 py-2 bg-yellow-500 text-slate-900 font-bold rounded-lg hover:bg-yellow-400 transition-colors"><RetryIcon/> Probeer opnieuw</button>
                         <button onClick={handleProceedToNextProblem} className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-slate-900 font-bold rounded-lg hover:bg-cyan-400 transition-colors"><NextIcon /> Volgende Opgave</button>
                    </div>
                </div>
            )}
        </Modal>
    </div>
  );
};

export default GameScreen;