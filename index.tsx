import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPE DEFINITIONS ---

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
  id:string;
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

// --- SOUND SERVICE ---

let audioContext: AudioContext | null = null;
const initializeAudio = () => {
    if (audioContext || typeof window === 'undefined') return;
    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
    }
};

const playTone = (type: OscillatorType, frequency: number, duration: number, volume = 0.5, startTime = 0) => {
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

const playClick = () => { initializeAudio(); playTone('triangle', 523.25, 0.08, 0.2); playTone('triangle', 783.99, 0.08, 0.2); };
const playDrop = () => { initializeAudio(); playTone('sine', 220, 0.1, 0.4); };
const playSuccess = () => { initializeAudio(); if (!audioContext) return; playTone('sine', 261.63, 0.12, 0.3, 0); playTone('sine', 329.63, 0.12, 0.3, 0.1); playTone('sine', 392.00, 0.12, 0.3, 0.2); playTone('sine', 523.25, 0.2, 0.3, 0.3); };
const playError = () => { initializeAudio(); playTone('sawtooth', 130.81, 0.25, 0.2); };
const playReset = () => {
    initializeAudio(); if (!audioContext) return;
    const now = audioContext.currentTime, duration = 0.2, bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource(); noise.buffer = buffer;
    const filter = audioContext.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(1800, now); filter.frequency.exponentialRampToValueAtTime(100, now + duration); filter.Q.value = 8;
    const gain = audioContext.createGain(); gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(audioContext.destination);
    noise.start(now); noise.stop(now + duration);
};

// --- CORE GAME LOGIC & AI SERVICE ---

const PREDEFINED_FORMULAS = [
    { formula: 'θ = s / r', variables: ['θ', 's', 'r'] }, { formula: 'a = r * α', variables: ['a', 'r', 'α'] },
    { formula: 'Fz = m * g', variables: ['Fz', 'm', 'g'] }, { formula: 'Epot = m*g*h', variables: ['Epot', 'm', 'g', 'h'] },
    { formula: 'p = F / A', variables: ['p', 'F', 'A'] }, { formula: 'phydro = ρ*g*h', variables: ['phydro', 'ρ', 'g', 'h'] },
    { formula: 'R = U / I', variables: ['R', 'U', 'I'] }, { formula: 'Q = m*c*ΔT', variables: ['Q', 'm', 'c', 'ΔT'] },
    { formula: 'E = m * c^2', variables: ['E', 'm', 'c'] }, { formula: 'v = Δx / Δt', variables: ['v', 'Δx', 'Δt'] },
    { formula: 'ρ = m / v', variables: ['ρ', 'm', 'v'] },
];

const PRECOMPUTED_ANSWERS: { [key: string]: { [key: string]: string } } = {
    'θ = s / r': { s: 's = θ * r', r: 'r = s / θ' }, 'a = r * α': { r: 'r = a / α', α: 'α = a / r' },
    'Fz = m * g': { m: 'm = Fz / g', g: 'g = Fz / m' },
    'Epot = m*g*h': { m: 'm = Epot / (g * h)', g: 'g = Epot / (m * h)', h: 'h = Epot / (m * g)' },
    'p = F / A': { F: 'F = p * A', A: 'A = F / p' },
    'phydro = ρ*g*h': { ρ: 'ρ = phydro / (g * h)', g: 'g = phydro / (ρ * h)', h: 'h = phydro / (ρ * g)' },
    'R = U / I': { U: 'U = R * I', I: 'I = U / R' },
    'Q = m*c*ΔT': { m: 'm = Q / (c * ΔT)', c: 'c = Q / (m * ΔT)', 'ΔT': 'ΔT = Q / (m * c)' },
    'E = m * c^2': { m: 'm = E / c^2', c: 'c = sqrt(E / m)' }, 'v = Δx / Δt': { 'Δx': 'Δx = v * Δt', 'Δt': 'Δt = Δx / v' },
    'ρ = m / v': { m: 'm = ρ * v', v: 'v = m / ρ' },
};

const getPhysicsProblem = (): Problem => {
    const randomFormulaData = PREDEFINED_FORMULAS[Math.floor(Math.random() * PREDEFINED_FORMULAS.length)];
    const { formula, variables } = randomFormulaData;
    const solvedVariable = formula.split('=')[0].trim();
    const possibleTargets = variables.filter(v => v !== solvedVariable);
    const targetVariable = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    const correctAnswer = PRECOMPUTED_ANSWERS[formula]?.[targetVariable];
    const standardSymbols = ['+', '-', '*', '(', ')', '__square__', '__sqrt__', '__fraction__'];
    const combinedSymbols = [...new Set([...variables, ...standardSymbols])];
    return { originalFormula: formula, targetVariable, correctAnswer: correctAnswer || '', symbols: combinedSymbols };
};

interface ValidationResponse {
    isCorrect: boolean;
    explanation: string;
}

const validateAnswerWithAI = async (problem: Problem, userAnswer: string): Promise<ValidationResponse> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `
        Je bent een expert in de fysica en wiskunde. Je taak is om te controleren of een leerling een natuurkundige formule correct heeft omgevormd.
        
        Originele formule: "${problem.originalFormula}"
        De leerling moest deze formule omvormen om de volgende variabele te vinden: "${problem.targetVariable}"
        Het antwoord van de leerling is: "${userAnswer}"
        
        Analyseer het antwoord van de leerling. Is het algebraïsch equivalent aan de correcte omvorming van de originele formule?
        Let op: de volgorde van termen in een vermenigvuldiging of optelling maakt niet uit (bv. m * g is hetzelfde als g * m). 
        
        Geef je antwoord ALLEEN als een JSON-object.
        Als het antwoord FOUT is, geef een korte, duidelijke en bemoedigende hint in het Nederlands die de leerling helpt de fout te vinden, zonder het antwoord direct te verklappen.
        Als het antwoord CORRECT is, geef een kort compliment.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isCorrect: { type: Type.BOOLEAN, description: "Is het antwoord van de leerling correct?" },
                        explanation: { type: Type.STRING, description: "De hint of het compliment in het Nederlands." }
                    },
                    required: ['isCorrect', 'explanation']
                }
            }
        });

        const result: ValidationResponse = JSON.parse(response.text);
        result.isCorrect ? playSuccess() : playError();
        return result;

    } catch (error) {
        console.error("Fout bij het aanroepen van de Gemini API:", error);
        playError();
        return {
            isCorrect: false,
            explanation: "Het is niet gelukt om het antwoord te controleren met de AI-assistent. Controleer of de API-sleutel correct is ingesteld en probeer het opnieuw."
        };
    }
};

// --- UI ICONS ---

const LoadingSpinner: React.FC = () => (<svg className="animate-spin h-8 w-8 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>);
const ClearIcon: React.FC = () => (<svg xmlns="http://www.w.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const RetryIcon: React.FC = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>);
const NextIcon: React.FC = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const ResetIcon: React.FC = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>);
const SqrtIcon: React.FC<{className?: string}> = ({ className }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 14 L8 20 L12 4 H22" /></svg>);

// --- UI COMPONENTS ---

const FormulaRendererComponent: React.FC<{ formula: string; highlight?: string }> = ({ formula, highlight }) => {
    const renderTerm = (term: string) => {
        const parts = term.split(/(\^2|α|θ|ρ|ΔT|Δx|Δt|\*|\s|\(|\))/g).filter(p => p);
        return parts.map((part, index) => {
            const isHighlighted = highlight && (part === highlight || (highlight.startsWith('Δ') && part.startsWith('Δ') && part.includes(highlight.substring(1))));
            const className = isHighlighted ? "text-yellow-400 font-bold" : "";
            switch (part) {
                case 'α': case 'θ': case 'ρ': return <span key={index} className={`font-serif italic ${className}`}>{part}</span>;
                case '^2': return <sup key={index} className="text-2xl">2</sup>;
                default: return <span key={index} className={className}>{part}</span>;
            }
        });
    };
    const renderSide = (side: string): React.ReactElement => {
        side = side.trim();
        const sqrtMatch = side.match(/^sqrt\((.*)\)$/);
        if (sqrtMatch) {
            const content = sqrtMatch[1];
            return (<div className="flex items-center"><span className="text-4xl font-bold text-cyan-400 select-none">√</span><div className="border-t-2 border-cyan-400 pl-2 py-1">{renderSide(content)}</div></div>);
        }
        let divisionIndex = -1, parenCount = 0;
        for (let i = 0; i < side.length; i++) {
            if (side[i] === '(') parenCount++; else if (side[i] === ')') parenCount--;
            else if (side[i] === '/' && parenCount === 0) { divisionIndex = i; break; }
        }
        if (divisionIndex !== -1) {
            let num = side.substring(0, divisionIndex).trim();
            let den = side.substring(divisionIndex + 1).trim();
            if (num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1).trim();
            if (den.startsWith('(') && den.endsWith(')')) den = den.slice(1, -1).trim();
            return (<div className="inline-flex flex-col items-center justify-center leading-tight align-middle mx-1"><span className="px-2">{renderSide(num)}</span><span className="w-full h-[1.5px] bg-current my-1"></span><span className="px-2">{renderSide(den)}</span></div>);
        }
        return <>{renderTerm(side)}</>;
    };
    if (typeof formula !== 'string') return null;
    const parts = formula.split('=');
    return (<div className="flex items-center justify-center">{renderSide(parts[0])}{parts.length > 1 && <><span className="mx-4">=</span>{renderSide(parts[1])}</>}</div>);
};
const FormulaRenderer = React.memo(FormulaRendererComponent);

const Modal: React.FC<{isOpen: boolean; onClose: () => void; children: React.ReactNode}> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-2xl border border-slate-700 animate-fade-in" onClick={(e) => e.stopPropagation()}>{children}</div>
        <style>{`@keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } } .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }`}</style>
      </div>
    );
};

const DraggableSymbol: React.FC<{symbol: string}> = ({ symbol }) => {
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => { e.dataTransfer.setData('text/plain', symbol); e.currentTarget.classList.add('opacity-50', 'scale-125'); };
    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => { e.currentTarget.classList.remove('opacity-50', 'scale-125'); };
    const baseClasses = "flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200";
    if (symbol === '__fraction__') return (<div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={`${baseClasses} text-4xl font-bold`} title="Sleep breukstreep">/</div>);
    if (symbol === '__sqrt__') return (<div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={baseClasses} title="Sleep vierkantswortel"><SqrtIcon className="w-8 h-8" /></div>);
    if (symbol === '__square__') return (<div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={`${baseClasses} text-2xl font-bold`} title="Kwadraat">x<sup>2</sup></div>);
    return (<div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={`${baseClasses} text-2xl font-bold`} title={`Sleep '${symbol}'`}>{symbol}</div>);
};

const DropIndicator: React.FC = () => <div className="self-stretch w-1 h-10 bg-cyan-400 rounded-full mx-1 animate-pulse" />;
const getNested = (obj: any, path: (string | number)[]): any => path.reduce((acc, key) => (acc && acc[key] !== 'undefined') ? acc[key] : undefined, obj);

interface RecursiveDropZoneProps { side: EquationSide; onSideChange: (newSide: EquationSide) => void; rootSide: EquationSide; path: (string | number)[]; }
interface EquationItemProps { item: DraggableItem; onSideChange: (newSide: EquationSide) => void; rootSide: EquationSide; path: (string | number)[]; }

function EquationItem({ item, onSideChange, rootSide, path }: EquationItemProps) {
    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSideChange(produce(rootSide, draft => {
            const container = getNested(draft, path.slice(0, -1));
            if (Array.isArray(container)) container.splice(path[path.length - 1] as number, 1);
        }));
    };
    const handleDragStart = (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.setData('application/json', JSON.stringify({ sourcePath: path })); e.currentTarget.classList.add('opacity-30'); };
    const handleDragEnd = (e: React.DragEvent) => { e.stopPropagation(); e.currentTarget.classList.remove('opacity-30'); };
    const renderContent = () => {
        switch (item.type) {
            case 'symbol': return item.content === '__square__' ? <span className="text-2xl font-bold -translate-y-2"><sup>2</sup></span> : <span className="text-2xl font-bold">{item.content}</span>;
            case 'sqrt': return (<div className="flex items-center"><SqrtIcon className="w-8 h-10 text-cyan-400" /><div className="border-t-2 border-cyan-400 p-1 min-h-[72px] min-w-[60px]"><RecursiveDropZone side={(item as SqrtNode).content} onSideChange={onSideChange} rootSide={rootSide} path={[...path, 'content', 'items']} /></div></div>);
            case 'fraction': return (<div className="flex flex-col items-center justify-center p-1"><div className="p-1 min-h-[72px] min-w-[80px]"><RecursiveDropZone side={(item as FractionNode).numerator} onSideChange={onSideChange} rootSide={rootSide} path={[...path, 'numerator', 'items']} /></div><div className="w-full h-[2px] bg-slate-400 my-1"></div><div className="p-1 min-h-[72px] min-w-[80px]"><RecursiveDropZone side={(item as FractionNode).denominator} onSideChange={onSideChange} rootSide={rootSide} path={[...path, 'denominator', 'items']} /></div></div>);
        }
    };
    return (<div draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} className={`relative group flex items-center justify-center p-1 rounded-md transition-opacity duration-200 cursor-move ${item.type === 'symbol' ? 'bg-slate-700 w-16 h-16' : ''}`}><button onClick={handleRemove} className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" aria-label="Remove item"><ClearIcon /></button>{renderContent()}</div>);
};

function RecursiveDropZone({ side, onSideChange, rootSide, path }: RecursiveDropZoneProps) {
    const [dragOver, setDragOver] = useState(false);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation(); if (!dropZoneRef.current) return;
        const draggableChildren = Array.from(dropZoneRef.current.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('draggable'));
        let newIndex = draggableChildren.length;
        for (let i = 0; i < draggableChildren.length; i++) {
            const rect = draggableChildren[i].getBoundingClientRect();
            if (e.clientX < rect.left + rect.width / 2) { newIndex = i; break; }
        }
        setDropIndex(newIndex);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        setDragOver(false); setDropIndex(null); playDrop();
        const targetIndex = dropIndex ?? side.items.length;
        const reorderData = e.dataTransfer.getData('application/json');
        
        if (reorderData) {
            const { sourcePath } = JSON.parse(reorderData);
            onSideChange(produce(rootSide, draft => {
                const sourceContainer = getNested(draft, sourcePath.slice(0, -1));
                if (!Array.isArray(sourceContainer)) return;
                const [removedItem] = sourceContainer.splice(sourcePath[sourcePath.length - 1], 1);
                if (!removedItem) return;
                const targetContainer = getNested(draft, path);
                if (Array.isArray(targetContainer)) targetContainer.splice(targetIndex, 0, removedItem);
            }));
        } else {
            const symbol = e.dataTransfer.getData('text/plain');
            const emptySide: EquationSide = { items: [] };
            let newItem: DraggableItem | null = null;
            if (symbol === '__fraction__') newItem = { id: uuidv4(), type: 'fraction', numerator: emptySide, denominator: emptySide };
            else if (symbol === '__sqrt__') newItem = { id: uuidv4(), type: 'sqrt', content: emptySide };
            else if (symbol) newItem = { id: uuidv4(), type: 'symbol', content: symbol };
            
            if (newItem) {
                const finalNewItem = newItem;
                onSideChange(produce(rootSide, draft => {
                    const targetContainer = getNested(draft, path);
                    if (Array.isArray(targetContainer)) targetContainer.splice(targetIndex, 0, finalNewItem);
                }));
            }
        }
    };
    
    return (
        <div ref={dropZoneRef} onDragOver={handleDragOver} onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }} onDragLeave={() => { setDragOver(false); setDropIndex(null); }} onDrop={handleDrop} className={`flex-grow h-full w-full flex flex-wrap items-center justify-center gap-1 p-2 rounded-lg border-2 transition-colors duration-300 ${dragOver ? 'border-cyan-400 bg-slate-800/50' : 'border-dashed border-slate-600'}`}>
            {side.items.length === 0 && !dragOver && <span className="text-slate-500 pointer-events-none">Sleep hier</span>}
            {side.items.map((item, index) => (
                <React.Fragment key={item.id}>
                    {dropIndex === index && <DropIndicator />}
                    <EquationItem item={item} onSideChange={onSideChange} rootSide={rootSide} path={[...path, index]} />
                </React.Fragment>
            ))}
            {dropIndex === side.items.length && <DropIndicator />}
        </div>
    );
};

const DropZone: React.FC<{side: EquationSide; onSideChange: (newSide: EquationSide) => void;}> = ({ side, onSideChange }) => (
    <div className="flex flex-col items-stretch justify-center h-full w-full bg-slate-900/70 p-2 rounded-xl">
        <RecursiveDropZone side={side} onSideChange={onSideChange} rootSide={side} path={['items']} />
    </div>
);

// --- SCREENS ---

const GameScreen: React.FC = () => {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const emptySide: EquationSide = useMemo(() => ({ items: [] }), []);
  const [leftSide, setLeftSide] = useState<EquationSide>(emptySide);
  const [rightSide, setRightSide] = useState<EquationSide>(emptySide);
  const [modalState, setModalState] = useState({ isOpen: false, isCorrect: false, explanation: '' });

  const { quantities, operators } = useMemo(() => {
    if (!problem) return { quantities: [], operators: [] };
    const OPERATOR_ORDER = ['(', ')', '+', '-', '*', '__fraction__', '__square__', '__sqrt__'];
    const quantities = problem.symbols.filter(s => !OPERATOR_ORDER.includes(s)).sort();
    const operators = OPERATOR_ORDER.filter(s => problem.symbols.includes(s));
    return { quantities, operators };
  }, [problem]);

  const fetchNewProblem = useCallback(() => {
    setIsLoading(true); setProblem(getPhysicsProblem());
    setLeftSide(emptySide); setRightSide(emptySide);
    setIsLoading(false);
  }, [emptySide]);

  useEffect(() => { fetchNewProblem(); }, [fetchNewProblem]);

  const handleReset = useCallback(() => { playReset(); setLeftSide(emptySide); setRightSide(emptySide); }, [emptySide]);

  const serializeSide = (side: EquationSide): string => {
    const serializeItems = (items: DraggableItem[]): string => items.map(item => {
        if (item.type === 'symbol') return item.content === '__square__' ? '^2' : item.content;
        if (item.type === 'sqrt') return `sqrt(${serializeSide(item.content) || ' '})`;
        if (item.type === 'fraction') {
            const num = serializeSide(item.numerator), den = serializeSide(item.denominator);
            return `${item.numerator.items.length > 1 ? `(${num})` : num || ' '}/${item.denominator.items.length > 1 ? `(${den})` : den || ' '}`;
        } return '';
    }).join(' ');
    return serializeItems(side.items).replace(/\s+/g, ' ').trim();
  };
  
  const isSideSubmittable = (side: EquationSide): boolean => {
    if (side.items.length === 0) return false;
    return side.items.every(item => {
        if (item.type === 'sqrt') return isSideSubmittable(item.content);
        if (item.type === 'fraction') return isSideSubmittable(item.numerator) && isSideSubmittable(item.denominator);
        return true;
    });
  };
  
  const handleSubmit = async () => {
    if (!problem) return;
    setIsChecking(true);
    const userAnswer = `${serializeSide(leftSide)} = ${serializeSide(rightSide)}`;
    const result = await validateAnswerWithAI(problem, userAnswer);
    setModalState({ isOpen: true, ...result });
    setIsChecking(false);
  };
  
  const handleProceedToNext = () => { setModalState(s => ({ ...s, isOpen: false })); fetchNewProblem(); };
  const handleRetry = () => { setModalState(s => ({ ...s, isOpen: false })); };

  if (isLoading || !problem) return (<div className="flex flex-col items-center justify-center h-[80vh]"><LoadingSpinner /><p className="mt-4 text-xl font-orbitron text-cyan-300">Nieuwe opgave laden...</p></div>);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="text-center mb-4"><h2 className="text-3xl font-bold font-orbitron text-cyan-400">Fysica Formule Flipper</h2></header>
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-6 p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
            <div className="text-center p-4 bg-slate-900 rounded-lg border-2 border-cyan-500">
                <p className="text-slate-300 text-lg mb-2">Vorm de formule om voor de gemarkeerde grootheid:</p>
                <div className="text-3xl font-bold text-cyan-400 font-orbitron mt-2"><FormulaRenderer formula={problem.originalFormula} highlight={problem.targetVariable} /></div>
            </div>
            <div className="flex-grow flex items-center justify-center gap-4 flex-col md:flex-row">
                <div className="w-full md:w-2/5 h-full"><DropZone side={leftSide} onSideChange={setLeftSide} /></div>
                <div className="text-5xl font-bold text-slate-400">=</div>
                <div className="w-full md:w-3/5 h-full"><DropZone side={rightSide} onSideChange={setRightSide} /></div>
            </div>
             <div className="flex flex-col md:flex-row items-center justify-center gap-4 mt-auto pt-4">
                <button onClick={handleReset} disabled={leftSide.items.length === 0 && rightSide.items.length === 0} className="px-6 py-3 w-full md:w-auto bg-red-600 text-slate-100 font-bold rounded-lg text-lg hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2"><ResetIcon /> Reset</button>
                <button onClick={handleSubmit} disabled={isChecking || !isSideSubmittable(leftSide) || !isSideSubmittable(rightSide)} className="px-8 py-3 w-full md:w-auto bg-green-500 text-slate-900 font-bold rounded-lg text-xl hover:bg-green-400 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 flex items-center justify-center gap-2">{isChecking ? <><LoadingSpinner /> AI controleert...</> : 'Controleer Antwoord'}</button>
            </div>
        </div>
        <div className="lg:col-span-1 p-4 bg-slate-800/50 rounded-2xl border border-slate-700 flex flex-col gap-6">
          {['Grootheden', 'Tekens'].map(title => (
            <div key={title}>
              <h3 className="text-xl font-bold mb-4 text-center font-orbitron text-cyan-400">{title}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                {(title === 'Grootheden' ? quantities : operators).map(s => <DraggableSymbol key={s} symbol={s} />)}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Modal isOpen={modalState.isOpen} onClose={modalState.isCorrect ? handleProceedToNext : handleRetry}>
        {modalState.isCorrect ? (
          <div className="text-center"><h2 className="text-4xl font-bold font-orbitron mb-4 text-green-400">Correct!</h2><p>{modalState.explanation}</p><div className="mt-6 flex justify-center"><button onClick={handleProceedToNext} className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-slate-900 font-bold rounded-lg hover:bg-cyan-400 transition-colors"><NextIcon /> Volgende Opgave</button></div></div>
        ) : (
          <div className="text-center"><h2 className="text-4xl font-bold font-orbitron mb-4 text-red-400">Helaas...</h2><div className="prose prose-invert max-w-none text-left bg-slate-900/50 p-4 rounded-lg space-y-4"><div><h3 className="font-bold text-cyan-400">Hint van de AI:</h3><p>{modalState.explanation}</p></div><div><h3 className="font-bold text-cyan-400">Correcte oplossing:</h3><div className="text-xl text-center flex justify-center items-center"><FormulaRenderer formula={problem.correctAnswer} /></div></div></div><div className="mt-6 flex justify-center gap-4"><button onClick={handleRetry} className="flex items-center gap-2 px-6 py-2 bg-yellow-500 text-slate-900 font-bold rounded-lg hover:bg-yellow-400 transition-colors"><RetryIcon/> Probeer opnieuw</button><button onClick={handleProceedToNext} className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-slate-900 font-bold rounded-lg hover:bg-cyan-400 transition-colors"><NextIcon /> Volgende Opgave</button></div></div>
        )}
      </Modal>
    </div>
  );
};

const StartScreen: React.FC<{onStart: (mode: GameMode) => void}> = ({ onStart }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <div className="w-full max-w-md p-8 bg-slate-800/50 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-sm">
                <h1 className="text-4xl sm:text-5xl font-bold text-center text-cyan-400 mb-2 font-orbitron">Fysica Formule Flipper</h1>
                <p className="text-center text-slate-300 mb-8">Test je kennis en vorm formules om als een pro!</p>
                <div className="text-center">
                    <h2 className="text-2xl text-slate-200 mb-6">Kies een modus:</h2>
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* The onClick handlers are simplified for this single-mode version. You can expand this. */}
                        <button onClick={() => { playClick(); onStart('classic'); }} className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-cyan-600 hover:border-cyan-400 transition-all duration-300 text-left">
                            <h3 className="text-xl font-bold font-orbitron text-yellow-300">Classic Mode</h3>
                            <p className="text-slate-300 mt-2">Oefen met het omvormen van formules in je eigen tempo.</p>
                        </button>
                        <button onClick={() => { playClick(); onStart('streak'); }} className="flex-1 p-6 bg-slate-700 rounded-lg border-2 border-slate-600 hover:bg-orange-600 hover:border-orange-400 transition-all duration-300 text-left opacity-50 cursor-not-allowed">
                            <h3 className="text-xl font-bold font-orbitron text-orange-400">Streak Mode</h3>
                            <p className="text-slate-300 mt-2">(Binnenkort beschikbaar)</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP & ERROR BOUNDARY ---

const App: React.FC = () => {
  const [gameStarted, setGameStarted] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-7xl">
        {gameStarted ? <GameScreen /> : <StartScreen onStart={() => setGameStarted(true)} />}
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props); this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-lg shadow-lg border border-red-500 text-center max-w-lg">
                <h1 className="text-2xl font-bold text-red-400 mb-4 font-orbitron">Er is een fout opgetreden</h1>
                <p className="text-slate-300 mb-4">De applicatie kon niet correct worden geladen. Controleer de console van de browser voor technische details (F12).</p>
                <details className="mt-4 text-left"><summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">Technische Details</summary><pre className="text-left bg-slate-900 p-4 rounded-md text-red-300 overflow-auto text-sm mt-2">{this.state.error?.toString()}</pre></details>
            </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
