import { GoogleGenAI, Type } from "@google/genai";
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
    // Initialiseer de Gemini client hier om opstartproblemen in de browser te voorkomen.
    // Dit zorgt ervoor dat de API key pas wordt gelezen op het moment van de API-call.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
      Je bent een natuurkundeleraar. Evalueer de poging van een student om een formule om te vormen.

      Originele Formule: ${problem.originalFormula}
      Doelvariabele: ${problem.targetVariable}
      Correct Antwoord: ${problem.correctAnswer}
      Antwoord van student: ${userAnswer}

      Is het antwoord van de student wiskundig equivalent aan het correcte antwoord? Houd rekening met commutativiteit (a*b = b*a) en de inhoud van wortels (sqrt).
      
      Als het antwoord fout is, geef dan een **zeer korte, algemene hint** van één zin die de leerling helpt de volgende stap te zetten, gebaseerd op de theorie.
      Focus op de algemene regel, niet op de specifieke getallen of variabelen.
      Bijvoorbeeld: "Denk eraan om eerst de termen zonder de doelvariabele weg te werken." of "Hoe werk je een deling weg om de variabele te isoleren?".
      Geef GEEN stappenplan en GEEN specifieke oplossing in de uitleg. De uitleg (explanation) is alleen deze hint.

      Geef de output als een JSON-object.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isCorrect: { type: Type.BOOLEAN },
                        explanation: { type: Type.STRING },
                    },
                    required: ["isCorrect", "explanation"],
                }
            }
        });
        
        const jsonString = response.text.trim();
        return JSON.parse(jsonString) as ValidationResponse;
    } catch (error) {
        console.error("Error checking answer with Gemini:", error);
        return {
            isCorrect: false,
            explanation: "Er is een fout opgetreden bij het controleren van je antwoord. Probeer het opnieuw."
        };
    }
};