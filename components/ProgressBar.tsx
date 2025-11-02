
import React from 'react';

interface ProgressBarProps {
  currentValue: number;
  maxValue: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentValue, maxValue }) => {
  const percentage = (currentValue / maxValue) * 100;

  return (
    <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden border-2 border-slate-500">
      <div
        className="bg-gradient-to-r from-yellow-400 to-amber-500 h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

export default ProgressBar;
