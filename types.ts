// This file defines the core data structures used throughout the application.

// Fix: Export the GameMode type to be used in StartScreen.tsx
export type GameMode = 'classic' | 'streak';

// Represents a single physics problem for the student to solve.
export interface Problem {
  originalFormula: string; // e.g., "F = m * a"
  targetVariable: string;  // e.g., "a"
  correctAnswer: string;   // e.g., "a = F / m"
  symbols: string[];       // All available symbols for the legend, e.g., ["F", "m", "a", "*", "/"]
}

// A simple symbol like a variable, number, or operator.
export interface DroppedSymbol {
  id: string;
  type: 'symbol';
  content: string;
}

// Represents a square root, which contains a nested equation structure.
export interface SqrtNode {
  id:string;
  type: 'sqrt';
  content: EquationSide;
}

// Represents a fraction, containing a numerator and denominator.
export interface FractionNode {
    id: string;
    type: 'fraction';
    numerator: EquationSide;
    denominator: EquationSide;
}

// A union type for any item that can be placed in the equation.
export type DraggableItem = DroppedSymbol | SqrtNode | FractionNode;

// Represents one side of the equation (left or right).
// It's a container for draggable items.
export interface EquationSide {
  items: DraggableItem[];
}