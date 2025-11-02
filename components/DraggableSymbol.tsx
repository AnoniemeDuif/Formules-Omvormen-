import React from 'react';
import { SqrtIcon } from './Icons';
import { playClick } from '../services/soundService';

interface DraggableSymbolProps {
  symbol: string;
}

const DraggableSymbol: React.FC<DraggableSymbolProps> = ({ symbol }) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    playClick();
    e.dataTransfer.setData('text/plain', symbol);
    e.currentTarget.classList.add('opacity-50', 'scale-125');
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'scale-125');
  };

  if (symbol === '__fraction__') {
    return (
       <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-4xl font-bold"
        title="Sleep breukstreep"
      >
        /
      </div>
    );
  }
  
  if (symbol === '__sqrt__') {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200"
        title="Sleep vierkantswortel"
      >
        <SqrtIcon className="w-8 h-8" />
      </div>
    );
  }

  if (symbol === '__square__') {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-2xl font-bold"
        title="Kwadraat"
      >
        x<sup>2</sup>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="flex items-center justify-center p-3 h-16 bg-slate-700 border-b-4 border-slate-900 rounded-lg cursor-grab active:cursor-grabbing hover:bg-cyan-600 hover:border-cyan-800 transition-all duration-200 text-2xl font-bold"
      title={`Sleep '${symbol}'`}
    >
      {symbol}
    </div>
  );
};

export default DraggableSymbol;