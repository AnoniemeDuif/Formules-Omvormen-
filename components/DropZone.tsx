
import React, { useState, useRef } from 'react';
import type { EquationSide, DraggableItem, SqrtNode, FractionNode, DroppedSymbol } from '../types';
import { produce } from 'https://esm.sh/immer@10.1.1';
import { v4 as uuidv4 } from 'https://esm.sh/uuid@9.0.1';
import { ClearIcon, SqrtIcon } from './Icons';
import { playDrop } from '../services/soundService';

// A visual indicator for the drop position
const DropIndicator: React.FC = () => (
    <div className="self-stretch w-1 h-10 bg-cyan-400 rounded-full mx-1 animate-pulse" />
);

// Helper function to get a nested property from an object using a path array
const getNested = (obj: any, path: (string|number)[]) => {
    return path.reduce((acc, part) => acc && acc[part], obj);
};

// Forward declaration for recursive use
let RecursiveDropZone: React.FC<RecursiveDropZoneProps>;

// --- EquationItem Component ---
// Renders a single draggable item (symbol, sqrt, fraction) within a drop zone.
const EquationItem: React.FC<{
  item: DraggableItem;
  onSideChange: (newSide: EquationSide) => void;
  parentSide: EquationSide; // The root EquationSide object
  path: (string | number)[]; // Path to this item from the root
}> = ({ item, onSideChange, parentSide, path }) => {
  const [isDragging, setIsDragging] = useState(false);
  const emptySide: EquationSide = { items: [] };

  // Removes the item from the formula
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newRootSide = produce(parentSide, draft => {
        const containerPath = path.slice(0, -1);
        const container = getNested(draft, containerPath);
        const index = path[path.length - 1] as number;
        if (Array.isArray(container)) {
             container.splice(index, 1);
        }
    });
    onSideChange(newRootSide);
  };

  // Handles the start of a drag operation for reordering
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.setData('application/json', JSON.stringify({
      sourcePath: path,
    }));
    e.currentTarget.classList.add('opacity-30');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    e.currentTarget.classList.remove('opacity-30');
  };
  
  // Renders the specific content based on item type
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
                side={(item as SqrtNode).content || emptySide}
                onSideChange={onSideChange}
                parentSide={parentSide}
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
                side={(item as FractionNode).numerator || emptySide}
                onSideChange={onSideChange}
                parentSide={parentSide}
                path={[...path, 'numerator', 'items']}
              />
            </div>
            <div className="w-full h-[2px] bg-slate-400 my-1"></div>
            <div className="p-1 min-h-[72px] min-w-[80px]">
              <RecursiveDropZone
                side={(item as FractionNode).denominator || emptySide}
                onSideChange={onSideChange}
                parentSide={parentSide}
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

// --- RecursiveDropZone Component ---
// The core drop zone logic, capable of rendering nested drop zones.
interface RecursiveDropZoneProps {
  side: EquationSide;
  onSideChange: (newSide: EquationSide) => void;
  parentSide: EquationSide;
  path: (string | number)[];
}

RecursiveDropZone = ({ side, onSideChange, parentSide, path }: RecursiveDropZoneProps) => {
    const [dragOver, setDragOver] = useState(false);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (!dropZoneRef.current) return;
        const dropZone = dropZoneRef.current;
        const children = Array.from(dropZone.children);
        // Filter only for draggable elements to determine insertion index
        const draggableChildren = children.filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('draggable')
        );
        const { clientX } = e;

        let newIndex = draggableChildren.length;

        for (let i = 0; i < draggableChildren.length; i++) {
            const child = draggableChildren[i];
            const rect = child.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            if (clientX < midX) {
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

        const newIndex = dropIndex ?? side.items.length;
        
        const reorderData = e.dataTransfer.getData('application/json');
        
        if (reorderData) { // --- Reordering an existing item ---
            const { sourcePath } = JSON.parse(reorderData);
            const newRootSide = produce(parentSide, draft => {
                // 1. Get and remove item from its original source
                const sourceContainerPath = sourcePath.slice(0, -1);
                const sourceContainer = getNested(draft, sourceContainerPath);
                const sourceIndex = sourcePath[sourcePath.length - 1] as number;
                
                if (!Array.isArray(sourceContainer)) return;
                const [removedItem] = sourceContainer.splice(sourceIndex, 1);
                if (!removedItem) return;

                // 2. Add the removed item to the new target location
                const targetContainer = getNested(draft, path);
                if (!Array.isArray(targetContainer)) return;
                targetContainer.splice(newIndex, 0, removedItem);
            });
            onSideChange(newRootSide);

        } else { // --- Adding a new item from the toolbar ---
            const symbol = e.dataTransfer.getData('text/plain');
            let newItem: DraggableItem | null = null;
            const emptySide = { items: [] };

            if (symbol === '__fraction__') {
                newItem = { id: uuidv4(), type: 'fraction', numerator: emptySide, denominator: emptySide };
            } else if (symbol === '__sqrt__') {
                newItem = { id: uuidv4(), type: 'sqrt', content: emptySide };
            } else if (symbol) {
                newItem = { id: uuidv4(), type: 'symbol', content: symbol };
            }
            
            if (newItem) {
                const finalNewItem = newItem;
                const newRootSide = produce(parentSide, draft => {
                    const targetContainer = getNested(draft, path);
                    if (Array.isArray(targetContainer)) {
                        targetContainer.splice(newIndex, 0, finalNewItem);
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
            {side.items.length === 0 && !dragOver && (
                <span className="text-slate-500 pointer-events-none">Sleep hier</span>
            )}
            {side.items.map((item, index) => (
                <React.Fragment key={item.id}>
                    {dropIndex === index && <DropIndicator />}
                    <EquationItem
                        item={item}
                        onSideChange={onSideChange}
                        parentSide={parentSide}
                        path={[...path, index]}
                    />
                </React.Fragment>
            ))}
            {dropIndex === side.items.length && <DropIndicator />}
        </div>
    );
};


// --- DropZone Component ---
// The main component wrapper exposed to the rest of the app.
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
        parentSide={side}
        path={['items']}
      />
    </div>
  );
};

export default DropZone;