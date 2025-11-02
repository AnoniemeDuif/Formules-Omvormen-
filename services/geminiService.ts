import type { Problem } from '../types';

// --- Predefined data for Problems ---
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
// --- End of Predefined data ---

export const getPhysicsProblem = (): Problem => {
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
        // Provide a fallback problem to prevent the app from crashing
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

// --- New Local Answer Checking Logic ---

/**
 * Normalizes one side of a formula string to a canonical form.
 * - Removes whitespace.
 * - Recursively normalizes expressions within parentheses and square roots.
 * - Sorts terms in commutative operations (multiplication) alphabetically.
 * @param side The string representing one side of the equation.
 * @returns A normalized string.
 */
const normalizeSide = (side: string): string => {
    let normalized = side.replace(/\s+/g, '');

    // Recursively normalize content within parentheses
    normalized = normalized.replace(/\(([^()]+)\)/g, (_match, group) => `(${normalizeSide(group)})`);

    // Handle sqrt
    if (normalized.startsWith('sqrt(') && normalized.endsWith(')')) {
        const content = normalized.substring(5, normalized.length - 1);
        return `sqrt(${normalizeSide(content)})`;
    }
    
    // Handle fractions by finding the top-level division operator
    let parenCount = 0;
    let divisionIndex = -1;
    for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] === '(') parenCount++;
        else if (normalized[i] === ')') parenCount--;
        else if (normalized[i] === '/' && parenCount === 0) {
            divisionIndex = i;
            break;
        }
    }
    
    if (divisionIndex !== -1) {
        const numerator = normalizeSide(normalized.substring(0, divisionIndex));
        const denominator = normalizeSide(normalized.substring(divisionIndex + 1));
        return `${numerator}/${denominator}`;
    }
    
    // Normalize commutative multiplication (sort terms)
    if (normalized.includes('*')) {
        return normalized.split('*').sort().join('*');
    }

    return normalized;
};

/**
 * Normalizes a full formula string (e.g., "a = F / m") to a canonical form.
 * @param formula The formula string.
 * @returns A normalized formula string.
 */
const normalizeFormula = (formula: string): string => {
    const parts = formula.split('=');
    if (parts.length !== 2) return formula.replace(/\s+/g, ''); // Fallback for invalid format

    const lhs = parts[0].trim();
    const rhs = normalizeSide(parts[1].trim());
    
    return `${lhs}=${rhs}`;
};

/**
 * Checks the user's answer against the correct answer locally, without an API call.
 * It normalizes both formulas to account for different but mathematically equivalent arrangements.
 * @param problem The physics problem object.
 * @param userAnswer The user's submitted formula string.
 * @returns A promise resolving to a validation response.
 */
export const checkAnswer = async (problem: Problem, userAnswer: string): Promise<ValidationResponse> => {
    try {
        const normalizedUserAnswer = normalizeFormula(userAnswer);
        const normalizedCorrectAnswer = normalizeFormula(problem.correctAnswer);

        const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

        if (isCorrect) {
            return {
                isCorrect: true,
                explanation: 'Goed gedaan! De formule is correct omgevormd.'
            };
        } else {
            // Log for debugging purposes if the answer is incorrect
            console.warn("Answer check failed:", {
                userAnswer: { raw: userAnswer, normalized: normalizedUserAnswer },
                correctAnswer: { raw: problem.correctAnswer, normalized: normalizedCorrectAnswer }
            });

            return {
                isCorrect: false,
                explanation: 'Dat is niet helemaal juist. Controleer de algebraïsche stappen nog eens. Let goed op de volgorde van de bewerkingen en of alle variabelen aan de juiste kant staan.'
            };
        }
    } catch (error) {
        console.error("Error during local answer validation:", error);
        return {
            isCorrect: false,
            explanation: "Er is een onverwachte fout opgetreden bij het controleren van je antwoord. Probeer het opnieuw."
        };
    }
};
