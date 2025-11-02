import React from 'react';

// Helper to render a basic term with special character styling
const renderStyledTerm = (part: string, key: string | number) => {
  switch (part) {
    case 'α':
    case 'θ':
    case 'ρ':
      return <span key={key} className="font-serif italic">{part}</span>;
    case '^2':
      return <sup key={key} className="text-2xl">2</sup>;
    default:
      // Use a fragment for keys without adding a wrapping element
      return <React.Fragment key={key}>{part}</React.Fragment>;
  }
};

// Main function to render a term, which can handle highlighting
// FIX: Use `React.ReactElement` instead of `JSX.Element` to resolve the "Cannot find namespace 'JSX'" error.
// FIX: Changed the return type of renderTerm from `(React.ReactElement | string)[]` to `React.ReactElement[]`.
// The function implementation never returns strings, only React elements. The incorrect type
// signature was causing a type inference issue with `flatMap` which led to the error on line 25.
const renderTerm = (term: string, highlight?: string): React.ReactElement[] => {
  // If a highlight term is provided and exists in the current segment,
  // split the term by the highlight string and wrap it with special styling.
  if (highlight && term.includes(highlight)) {
    const parts = term.split(new RegExp(`(${highlight})`));
    return parts.flatMap((part, index) => {
      if (part === highlight) {
        return [<span key={`${index}-${part}`} className="text-yellow-400 font-bold">{part}</span>];
      }
      // For parts that aren't the highlight, render them normally.
      // Pass undefined for highlight to prevent infinite recursion.
      return renderTerm(part, undefined);
    });
  }

  // Original logic for non-highlighted segments.
  // Split by known special characters to style them correctly.
  const parts = term.split(/(\^2|α|θ|ρ|ΔT|Δx|Δt|\*|\s|\(|\))/g).filter(p => p);
  return parts.map((part, index) => renderStyledTerm(part, index));
};


const renderSide = (side: string, highlight?: string): React.ReactElement => {
    side = side.trim();
    
    // Handle square roots, e.g., sqrt(...)
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

    // Handle fractions. Find the top-level division operator.
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

      // Remove wrapping parentheses if they exist
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

// Memoize the component to prevent unnecessary re-renders
export const FormulaRenderer = React.memo(FormulaRendererComponent);