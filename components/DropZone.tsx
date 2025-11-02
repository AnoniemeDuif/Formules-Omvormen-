import React, { useState, useRef } from 'react';
import type { EquationSide, DraggableItem, SqrtNode, FractionNode } from '../types';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';
import { ClearIcon, SqrtIcon } from './Icons';
import { playDrop } from '../services/soundService';

// --- HELPER FUNCTIONS ---

/** A visual indicator showing where a dragged item will be dropped. */
const DropIndicator: React.FC = () => (
    <div className="self-stretch w-1 h-10 bg-cyan-400 rounded-full mx-1 animate-pulse" />
);

/**
 * Safely traverses a nested object using a path array (e.g., ['content', 'items', 0]).
 * @returns The value at the nested path, or undefined if the path is invalid.
 */
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

// --- PROPS INTERFACES ---

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

// --- CORE RECURSIVE COMPONENTS ---
// These two components call each other, forming a recursive structure.
// They are defined as hoisted `function` declarations, so they can be referenced
// by each other regardless of their order in the code. This is crucial to prevent
// "used before defined" errors that can crash the application on startup.

/**
 * Renders a single draggable item within the equation.
 * If the item is a container (like a square root or fraction), it will
 * recursively render a `RecursiveDropZone` for its content.
 */
function EquationItem({ item, onSideChange, rootSide, path }: EquationItemProps) {
  const [isDragging, setIsDragging] = useState(false);

  /** Removes this item from the equation tree. */
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

  /** Handles the start of a drag operation for reordering within the equation. */
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
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`relative group flex items-center justify-center p-1 rounded-md transition-opacity duration-200 cursor-move ${isDragging ? 'opacity-30' : ''} ${item.type === 'symbol' ? 'bg-slate-700 w-16 h-16' : ''}`}
    >
      {renderContent()}
      <button 
        onClick={handleRemove} 
        className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Remove item"
      >
        <ClearIcon />
      </button>
    </div>
  );
};

/**
 * Renders a drop target area that can accept new or existing symbols.
 * It maps over its items and renders an `EquationItem` for each one.
 */
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
        playDrop();
        setDragOver(false);
        setDropIndex(null);

        const targetIndex = dropIndex ?? side.items.length;
        const reorderData = e.dataTransfer.getData('application/json');
        
        if (reorderData) { // --- REORDERING an existing item ---
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

        } else { // --- ADDING a new item from the toolbar ---
            const symbol = e.dataTransfer.getData('text/plain');
            let newItem: DraggableItem | null = null;
            const emptySide: EquationSide = { items: [] };

            if (symbol === '__fraction__') newItem = { id: uuidv4(), type: 'fraction', numerator: { ...emptySide }, denominator: { ...emptySide } };
            else if (symbol === '__sqrt__') newItem = { id: uuidv4(), type: 'sqrt', content: { ...emptySide } };
            else if (symbol) newItem = { id: uuidv4(), type: 'symbol', content: symbol };
            
            if (newItem) {
                const finalNewItem = newItem; // To satisfy TypeScript closure rules
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
        <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); setDropIndex(null); }}
            onDrop={handleDrop}
            className={`flex-grow h-full w-full flex flex-wrap items-center justify-center gap-1 p-2 rounded-lg border-2 transition-colors duration-300 ${dragOver ? 'border-cyan-400 bg-slate-800/50' : 'border-dashed border-slate-600'}`}
        >
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

// --- MAIN EXPORTED COMPONENT ---

interface DropZoneProps {
  side: EquationSide;
  onSideChange: (newSide: EquationSide) => void;
  isClearable: boolean; // Prop is kept for potential future use, though not currently used.
}

/**
 * The main DropZone component. It acts as the entry point for the recursive
 * formula editor, setting up the initial state for the recursive components.
 */
const DropZone: React.FC<DropZoneProps> = ({ side, onSideChange }) => {
  return (
    <div className="flex flex-col items-stretch justify-center h-full w-full bg-slate-900/70 p-2 rounded-xl">
      <RecursiveDropZone 
        side={side}
        onSideChange={onSideChange}
        rootSide={side} // The root of the state tree is the side itself
        path={['items']}   // The initial path points to the items array of the root side
      />
    </div>
  );
};

export default DropZone;