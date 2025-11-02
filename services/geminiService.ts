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

export const checkAnswer = async (problem: Problem, userAnswer: string): Promise<ValidationResponse> => {
    try {
        const response = await fetch('/api/checkAnswer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ problem, userAnswer }),
        });

        if (!response.ok) {
            // Probeer een foutmelding van de backend te parsen, anders gebruik een generiek bericht
            let errorMessage = `Serverfout: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Negeer als het antwoord geen JSON is
            }
            throw new Error(errorMessage);
        }

        return await response.json() as ValidationResponse;

    } catch (error) {
        console.error("Error checking answer via API:", error);
        
        let displayMessage = "Er is een fout opgetreden bij het controleren van je antwoord. Controleer je internetverbinding en probeer het opnieuw.";
        if (error instanceof Error && error.message.startsWith('Serverfout:')) {
            displayMessage = `Kon de server niet bereiken om het antwoord te controleren. (${error.message})`;
        } else if (error instanceof Error) {
            // Voorkom het tonen van te technische meldingen zoals 'Failed to fetch'
            displayMessage = "Communicatiefout met de server. Probeer het later opnieuw.";
        }
        
        return {
            isCorrect: false,
            explanation: displayMessage
        };
    }
};
