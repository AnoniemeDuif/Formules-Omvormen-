import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';

// --- TYPE DEFINITIONS (from types.ts) ---

type GameMode = 'classic' | 'streak';

interface Problem {
  originalFormula: string;
  targetVariable: string;
  correctAnswer: string;
  symbols: string[];
}

interface DroppedSymbol {
  id: string;
  type: 'symbol';
  content: string;
}

interface SqrtNode {
  id: string;
  type: 'sqrt';
  content: EquationSide;
}

interface FractionNode {
    id: string;
    type: 'fraction';
    numerator: EquationSide;
    denominator: EquationSide;
}

type DraggableItem = DroppedSymbol | SqrtNode | FractionNode;

interface EquationSide {
  items: DraggableItem[];
}


// --- SOUND SERVICE (from services/soundService.ts) ---

let audioContext: AudioContext | null = null;
let isInitialized = false;

const initializeAudio = () => {
    if (isInitialized || typeof window === 'undefined') return;
    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        isInitialized = true;
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
        isInitialized = true;
    }
};

const playTone = (
    type: OscillatorType, 
    frequency: number, 
    duration: number, 
    volume: number = 0.5,
    startTime: number = 0
) => {
    if (!audioContext) return;
    const now = audioContext.currentTime;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now + startTime);

    gainNode.gain.setValueAtTime(volume * 0.5, now + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now + startTime);
    oscillator.stop(now + startTime + duration);
};

const playClick = () => {
    initializeAudio();
    playTone('triangle', 523.25, 0.08, 0.2);
    playTone('triangle', 783.99, 0.08, 0.2);
};

const playDrop = () => {
    initializeAudio();
    playTone('sine', 220, 0.1, 0.4);
};

const playSuccess = () => {
    initializeAudio();
    if (!audioContext) return;
    const baseVolume = 0.3;
    playTone('sine', 261.63, 0.12, baseVolume, 0);
    playTone('sine', 329.63, 0.12, baseVolume, 0.1);
    playTone('sine', 392.00, 0.12, baseVolume, 0.2);
    playTone('sine', 523.25, 0.2, baseVolume, 0.3);
};

const playError = () => {
    initializeAudio();
    playTone('sawtooth', 130.81, 0.25, 0.2);
};

const playReset = () => {
    initializeAudio();
    if (!audioContext) return;
    
    const now = audioContext.currentTime;
    const duration = 0.2;

    const noise = audioContext.createBufferSource();
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;

    const biquadFilter = audioContext.createBiquadFilter();
    biquadFilter.type = 'bandpass';
    biquadFilter.frequency.setValueAtTime(1800, now);
    biquadFilter.frequency.exponentialRampToValueAtTime(100, now + duration);
    biquadFilter.Q.value = 8;

    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + duration);

    noise.connect(biquadFilter);
    biquadFilter.connect(gainNode);
    gainNode.connect(audioContext.destination);
    noise.start(now);
    noise.stop(now + duration);
};


// --- GEMINI SERVICE (from services/geminiService.ts) ---

const PREDEFINED_FORMULAS = [
    { formula: 'θ = s / r', variables: ['θ', 's', 'r'] },
    { formula: 'a = r * α', variables: ['a', 'r', 'α'] },
    { formula: 'Fz = m * g', variables: ['Fz', 'm', 'g'] },
    { formula: 'Epot = m*g*h', variables: ['Epot', 'm', 'g', 'h'] },
    { formula: 'p = F / A', variables: ['p', 'F', 'A'] },
    { formula: 'phydro = ρ*g*h', variables: ['phydro', 'ρ', 'g', 'h'] },
    { formula: 'R = U / I', variables: ['R', 'U', 'I'] },
    { formula: 'Q = m*c*ΔT', variables: ['Q', 'm', 'c', 'ΔT'] },
    { formula: 'E = m * c^2', variables: ['E', 'm', 'c'] },
    { formula: 'v = Δx / Δt', variables: ['v', 'Δx', 'Δt'] },
    { formula: 'ρ = m / v', variables: ['ρ', 'm', 'v'] },
];

const PRECOMPUTED_ANSWERS: { [key: string]: { [key: string]: string } } = {
    'θ = s / r': { s: 's = θ * r', r: 'r = s / θ' },
    'a = r * α': { r: 'r = a / α', α: 'α = a / r' },
    'Fz = m * g': { m: 'm = Fz / g', g: 'g = Fz / m' },
    'Epot = m*g*h': { m: 'm = Epot / (g * h)', g: 'g = Epot / (m * h)', h: 'h = Epot / (m * g)' },
    'p = F / A': { F: 'F = p * A', A: 'A = F / p' },
    'phydro = ρ*g*h': { ρ: 'ρ = phydro / (g * h)', g: 'g = phydro / (ρ * h)', h: 'h = phydro / (ρ * g)' },
    'R = U / I': { U: 'U = R * I', I: 'I = U / R' },
    'Q = m*c*ΔT': { m: 'm = Q / (c * ΔT)', c: 'c = Q / (m * ΔT)', 'ΔT': 'ΔT = Q / (m * c)' },
    'E = m * c^2': { m: 'm = E / c^2', c: 'c = sqrt(E / m)' },
    'v = Δx / Δt': { 'Δx': 'Δx = v * Δt', 'Δt': 'Δt = Δx / v' },
    'ρ = m / v': { m: 'm = ρ * v', v: 'v = m / ρ' },
};

const getPhysicsProblem = (): Problem => {
    try {
        const randomFormulaData = PREDEFINED_FORMULAS[Math.floor(Math.random() * PREDEFINED_FORMULAS.length)];
        const { formula, variables } = randomFormulaData;
        const solvedVariable = formula.split('=')[0].trim();
        const possibleTargets = variables.filter(v => v !== solvedVariable);
        if (possibleTargets.length === 0) {
            throw new Error(`No possible rearrangement targets for formula: ${formula}`);
        }
        const targetVariable = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
        const correctAnswer = PRECOMPUTED_ANSWERS[formula]?.[targetVariable];
        if (!correctAnswer) {
            throw new Error(`No precomputed answer for ${formula} -> ${targetVariable}`);
        }
        const standardSymbols = ['+', '-', '*', '(', ')', '__square__', '__sqrt__', '__fraction__'];
        let combinedSymbols = [...new Set([...variables, ...standardSymbols])];
        const hasSquare = formula.includes('^2') || Object.values(PRECOMPUTED_ANSWERS[formula] || {}).some(ans => ans.includes('^2'));
        if (hasSquare && !combinedSymbols.includes('__square__')) {
            combinedSymbols.push('__square__');
        }
        combinedSymbols = combinedSymbols.filter(s => s !== '^2');
        const problem: Problem = {
            originalFormula: formula,
            targetVariable,
            correctAnswer,
            symbols: combinedSymbols,
        };
        return problem;
    } catch (error) {
        console.error("Error generating problem locally:", error);
        return {
            originalFormula: 'F = m * a',
            targetVariable: 'a',
            correctAnswer: 'a = F / m',
            symbols: ['F', 'm', 'a', '*', '/', '+', '-', '(', ')', '__square__', '__sqrt__', '__fraction__'],
        };
    }
};

interface ValidationResponse {
    isCorrect: boolean;
    explanation: string;
}

const checkAnswer = async (problem: Problem, userAnswer: string): Promise<ValidationResponse> => {
    try {
        const response = await fetch('/api/checkAnswer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ problem, userAnswer }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Fout bij het parsen van de fout-response.' }));
            console.error("API Error Response:", errorData);
            throw new Error(`Serverfout: ${response.status} - ${errorData.error || response.statusText}`);
        }

        const result: ValidationResponse = await response.json();
        
        if (result.isCorrect) {
            playSuccess();
        } else {
            playError();
        }
        
        return result;

    } catch (error) {
        console.error("Fout bij het aanroepen van de checkAnswer API:", error);
        playError();
        return {
            isCorrect: false,
            explanation: "Het is niet gelukt om het antwoord te controleren. Controleer je internetverbinding en probeer het opnieuw."
        };
    }
};


// --- ICONS (from components/Icons.tsx) ---

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const ClearIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const RetryIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
  </svg>
);

const NextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const ResetIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
);

const SqrtIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 14 L8 20 L12 4 H22" />
    </svg>
);


// --- FORMULA RENDERER (from components/FormulaRenderer.tsx) ---

const renderStyledTerm = (part: string, key: string | number) => {
  switch (part) {
    case 'α':
    case 'θ':
    case 'ρ':
      return <span key={key} className="font-serif italic">{part}</span>;
    case '^2':
      return <sup key={key} className="text-2xl">2</sup>;
    default:
      return <React.Fragment key={key}>{part}</React.Fragment>;
  }
};

const renderTerm = (term: string, highlight?: string): React.ReactElement[] => {
  if (highlight && term.includes(highlight)) {
    const parts = term.split(new RegExp(`(${highlight})`));
    return parts.flatMap((part, index) => {
      if (part === highlight) {
        return [<span key={`${index}-${part}`} className="text-yellow-400 font-bold">{part}</span>];
      }
      return renderTerm(part, undefined);
    });
  }
  const parts = term.split(/(\^2|α|θ|ρ|ΔT|Δx|Δt|\*|\s|\(|\))/g).filter(p => p);
  return parts.map((part, index) => renderStyledTerm(part, index));
};

const renderSide = (side: string, highlight?: string): React.ReactElement => {
    if (typeof side !== 'string') {
        return <></>; 
    }
    side = side.trim();
    const sqrtMatch = side.match(/^sqrt\((.*)\)$/);
    if (sqrtMatch) {
      const content = sqrtMatch[1];
      return (
        <div className="flex items-center">
          <span className="text-4xl font-bold text-cyan-400 select-none">√</span>
          <div className="border-t-2 border-cyan-400 pl-2 py-1">
            {renderSide(content, highlight)}
          </div>
        </div>
      );
    }

    let divisionIndex = -1;
    let parenCount = 0;
    for (let i = 0; i < side.length; i++) {
        if (side[i] === '(') parenCount++;
        else if (side[i] === ')') parenCount--;
        else if (side[i] === '/' && parenCount === 0) {
            divisionIndex = i;
            break;
        }
    }

    if (divisionIndex !== -1) {
      let numerator = side.substring(0, divisionIndex).trim();
      let denominator = side.substring(divisionIndex + 1).trim();
      if (numerator.startsWith('(') && numerator.endsWith(')')) {
        numerator = numerator.slice(1, -1).trim();
      }
      if (denominator.startsWith('(') && denominator.endsWith(')')) {
        denominator = denominator.slice(1, -1).trim();
      }
      return (
        <div className="inline-flex flex-col items-center justify-center leading-tight align-middle mx-1">
          <span className="px-2">{renderSide(numerator, highlight)}</span>
          <span className="w-full h-[1.5px] bg-current my-1"></span>
          <span className="px-2">{renderSide(denominator, highlight)}</span>
        </div>
      );
    }
    return <>{renderTerm(side, highlight)}</>;
  };

const FormulaRendererComponent: React.FC<{ formula: string; highlight?: string }> = ({ formula, highlight }) => {
  if (typeof formula !== 'string') {
    return null;
  }
  const parts = formula.split('=');
  const lhs = parts[0].trim();
  const rhs = parts.length > 1 ? parts[1].trim() : '';
  return (
    <div className="flex items-center justify-center">
      {renderSide(lhs, highlight)}
      {rhs && <span className="mx-4">=</span>}
      {rhs && renderSide(rhs, highlight)}
    </div>
  );
};
const FormulaRenderer = React.memo(FormulaRendererComponent);


// --- MODAL (from components/Modal.tsx) ---

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}
const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-2xl border border-slate-700 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
       <style>{`
        @keyframes fade-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
            animation: fade-in 0.3s ease-out forwards;
        }
    `}</style>
    </div>
  );
};


// --- DRAGGABLE SYMBOL (from components/DraggableSymbol.tsx) ---

interface DraggableSymbolProps {
  symbol: string;
}
const DraggableSymbol: React.FC<DraggableSymbolProps> = ({ symbol }) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', symbol);
    e.currentTarget.classList.add('opacity-50', 'scale-125');
  };
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'scale-125');
  };

  if (symbol === '__fraction__') {
    return (
       <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-4xl font-bold" title="Sleep breukstreep">
        /
      </div>
    );
  }
  if (symbol === '__sqrt__') {
    return (
      <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200" title="Sleep vierkantswortel">
        <SqrtIcon className="w-8 h-8" />
      </div>
    );
  }
  if (symbol === '__square__') {
    return (
      <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-2xl font-bold" title="Kwadraat">
        x<sup>2</sup>
      </div>
    );
  }
  return (
    <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-2xl font-bold" title={`Sleep '${symbol}'`}>
      {symbol}
    </div>
  );
};


// --- DROPZONE (from components/DropZone.tsx) ---

const DropIndicator: React.FC = () => (
    <div className="self-stretch w-1 h-10 bg-cyan-400 rounded-full mx-1 animate-pulse" />
);

const getNested = (obj: any, path: (string | number)[]): any | undefined => {
  let current = obj;
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
};

interface RecursiveDropZoneProps {
  side: EquationSide;
  onSideChange: (newSide: EquationSide) => void;
  rootSide: EquationSide;
  path: (string | number)[];
}
interface EquationItemProps {
  item: DraggableItem;
  onSideChange: (newSide: EquationSide) => void;
  rootSide: EquationSide;
  path: (string | number)[];
}

function EquationItem({ item, onSideChange, rootSide, path }: EquationItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newRootSide = produce(rootSide, draft => {
        const containerPath = path.slice(0, -1);
        const container = getNested(draft, containerPath);
        const index = path[path.length - 1] as number;
        if (Array.isArray(container)) {
             container.splice(index, 1);
        }
    });
    onSideChange(newRootSide);
  };
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({ sourcePath: path }));
    e.currentTarget.classList.add('opacity-30');
  };
  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    e.currentTarget.classList.remove('opacity-30');
  };
  const renderContent = () => {
    switch (item.type) {
      case 'symbol':
        return item.content === '__square__' 
          ? <span className="text-2xl font-bold -translate-y-2"><sup>2</sup></span> 
          : <span className="text-2xl font-bold">{item.content}</span>;
      case 'sqrt':
        return (
          <div className="flex items-center">
            <SqrtIcon className="w-8 h-10 text-cyan-400" />
            <div className="border-t-2 border-cyan-400 p-1 min-h-[72px] min-w-[60px]">
              <RecursiveDropZone
                side={(item as SqrtNode).content}
                onSideChange={onSideChange}
                rootSide={rootSide}
                path={[...path, 'content', 'items']}
              />
            </div>
          </div>
        );
      case 'fraction':
        return (
          <div className="flex flex-col items-center justify-center p-1">
            <div className="p-1 min-h-[72px] min-w-[80px]">
              <RecursiveDropZone
                side={(item as FractionNode).numerator}
                onSideChange={onSideChange}
                rootSide={rootSide}
                path={[...path, 'numerator', 'items']}
              />
            </div>
            <div className="w-full h-[2px] bg-slate-400 my-1"></div>
            <div className="p-1 min-h-[72px] min-w-[80px]">
              <RecursiveDropZone
                side={(item as FractionNode).denominator}
                onSideChange={onSideChange}
                rootSide={rootSide}
                path={[...path, 'denominator', 'items']}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={`relative group flex items-center justify-center p-1 rounded-md transition-opacity duration-200 cursor-move ${isDragging ? 'opacity-30' : ''} ${item.type === 'symbol' ? 'bg-slate-700 w-16 h-16' : ''}`}>
      {renderContent()}
      <button onClick={handleRemove} className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" aria-label="Remove item">
        <ClearIcon />
      </button>
    </div>
  );
};

function RecursiveDropZone({ side, onSideChange, rootSide, path }: RecursiveDropZoneProps) {
    const [dragOver, setDragOver] = useState(false);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dropZoneRef.current) return;
        const draggableChildren = Array.from(dropZoneRef.current.children)
            .filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('draggable'));
        const { clientX } = e;
        let newIndex = draggableChildren.length;
        for (let i = 0; i < draggableChildren.length; i++) {
            const rect = draggableChildren[i].getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) {
                newIndex = i;
                break;
            }
        }
        setDropIndex(newIndex);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        setDropIndex(null);
        playDrop();
        const targetIndex = dropIndex ?? side.items.length;
        const reorderData = e.dataTransfer.getData('application/json');
        
        if (reorderData) {
            const { sourcePath } = JSON.parse(reorderData);
            const newRootSide = produce(rootSide, draft => {
                const sourceContainer = getNested(draft, sourcePath.slice(0, -1));
                if (!Array.isArray(sourceContainer)) return;
                const [removedItem] = sourceContainer.splice(sourcePath[sourcePath.length - 1], 1);
                if (!removedItem) return;
                const targetContainer = getNested(draft, path);
                if (!Array.isArray(targetContainer)) return;
                targetContainer.splice(targetIndex, 0, removedItem);
            });
            onSideChange(newRootSide);
        } else {
            const symbol = e.dataTransfer.getData('text/plain');
            let newItem: DraggableItem | null = null;
            const emptySide: EquationSide = { items: [] };
            if (symbol === '__fraction__') newItem = { id: uuidv4(), type: 'fraction', numerator: { ...emptySide }, denominator: { ...emptySide } };
            else if (symbol === '__sqrt__') newItem = { id: uuidv4(), type: 'sqrt', content: { ...emptySide } };
            else if (symbol) newItem = { id: uuidv4(), type: 'symbol', content: symbol };
            if (newItem) {
                const finalNewItem = newItem;
                const newRootSide = produce(rootSide, draft => {
                    const targetContainer = getNested(draft, path);
                    if (Array.isArray(targetContainer)) {
                        targetContainer.splice(targetIndex, 0, finalNewItem);
                    }
                });
                onSideChange(newRootSide);
            }
        }
    };
    
    return (
        <div ref={dropZoneRef} onDragOver={handleDragOver} onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }} onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); setDropIndex(null); }} onDrop={handleDrop} className={`flex-grow h-full w-full flex flex-wrap items-center justify-center gap-1 p-2 rounded-lg border-2 transition-colors duration-300 ${dragOver ? 'border-cyan-400 bg-slate-800/50' : 'border-dashed border-slate-600'}`}>
            {side.items.length === 0 && !dragOver && <span className="text-slate-500 pointer-events-none">Sleep hier</span>}
            {side.items.map((item, index) => (
                <React.Fragment key={item.id}>
                    {dropIndex === index && <DropIndicator />}
                    <EquationItem
                        item={item}
                        onSideChange={onSideChange}
                        rootSide={rootSide}
                        path={[...path, index]}
                    />
                </React.Fragment>
            ))}
            {dropIndex === side.items.length && <DropIndicator />}
        </div>
    );
};

interface DropZoneProps {
  side: EquationSide;
  onSideChange: (newSide: EquationSide) => void;
  isClearable: boolean;
}
const DropZone: React.FC<DropZoneProps> = ({ side, onSideChange }) => {
  return (
    <div className="flex flex-col items-stretch justify-center h-full w-full bg-slate-900/70 p-2 rounded-xl">
      <RecursiveDropZone 
        side={side}
        onSideChange={onSideChange}
        rootSide={side}
        path={['items']}
      />
    </div>
  );
};


// --- GAME SCREEN (from components/GameScreen.tsx) ---

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

  const handleLeftSideChange = (newSide: EquationSide) => setLeftSide(newSide);
  const handleRightSideChange = (newSide: EquationSide) => setRightSide(newSide);
  const handleReset = useCallback(() => {
    playReset();
    setLeftSide(emptySide);
    setRightSide(emptySide);
  }, [emptySide]);

  const serializeSide = (side: EquationSide): string => {
    const serializeItems = (items: DraggableItem[]): string => {
        return items.map(item => {
            if (item.type === 'symbol') return item.content === '__square__' ? '^2' : item.content;
            if (item.type === 'sqrt') return `sqrt(${serializeSide(item.content) || ' '})`;
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
    if (side.items.length === 0) return false;
    const checkItems = (items: DraggableItem[]): boolean => {
        for (const item of items) {
            if (item.type === 'sqrt' && (item.content.items.length === 0 || !isSideSubmittable(item.content))) return false;
            if (item.type === 'fraction') {
                if (item.numerator.items.length === 0 || item.denominator.items.length === 0) return false;
                if (!isSideSubmittable(item.numerator) || !isSideSubmittable(item.denominator)) return false;
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
    setModalState({ isOpen: true, isCorrect: result.isCorrect, explanation: result.explanation });
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

  const isEquationEmpty = leftSide.items.length === 0 && rightSide.items.length === 0;
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
                <button onClick={handleReset} disabled={isEquationEmpty} className="px-6 py-3 w-full md:w-auto bg-red-600 text-slate-100 font-bold rounded-lg text-lg hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2">
                  <ResetIcon /> Reset
                </button>
                <button onClick={handleSubmit} disabled={isChecking || !canSubmit} className="px-8 py-3 w-full md:w-auto bg-green-500 text-slate-900 font-bold rounded-lg text-xl hover:bg-green-400 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2">
                  {isChecking ? <LoadingSpinner /> : 'Controleer Antwoord'}
                </button>
            </div>
            <button onClick={handleLogState} className="absolute bottom-4 right-4 px-3 py-1 bg-slate-700 text-slate-300 font-mono text-xs rounded-md hover:bg-slate-600 transition-colors" title="Log de huidige status naar de console voor debuggen">
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


// --- START SCREEN (from components/StartScreen.tsx) ---

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
            <button onClick={() => handleModeSelect('classic')} className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-cyan-600 hover:border-cyan-400 transition-all duration-300 text-left">
              <h3 className="text-xl font-bold font-orbitron text-yellow-300">Classic Mode</h3>
              <p className="text-slate-300 mt-2">Verzamel 50 quarks door opgaven op te lossen. De moeilijkheid stijgt per level.</p>
            </button>
            <button onClick={() => handleModeSelect('streak')} className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-orange-600 hover:border-orange-400 transition-all duration-300 text-left">
              <h3 className="text-xl font-bold font-orbitron text-orange-400">Streak Mode</h3>
              <p className="text-slate-300 mt-2">Bouw de langste reeks correcte antwoorden op. Eén fout en je streak is voorbij!</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- APP COMPONENT (from App.tsx) ---

const App: React.FC = () => {
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


// --- ERROR BOUNDARY & ROOT RENDER (Original index.tsx) ---

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in React component tree:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-lg shadow-lg border border-red-500 text-center max-w-lg">
                <h1 className="text-2xl font-bold text-red-400 mb-4 font-orbitron">Er is een fout opgetreden</h1>
                <p className="text-slate-300 mb-4">De applicatie kon niet correct worden geladen. Controleer de console van de browser voor technische details (F12 of rechtermuisknop -> Inspecteren).</p>
                <details className="mt-4 text-left">
                    <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">Technische Details</summary>
                    <pre className="text-left bg-slate-900 p-4 rounded-md text-red-300 overflow-auto text-sm mt-2">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </details>
            </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);