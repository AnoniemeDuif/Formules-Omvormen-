import { GoogleGenAI, Type } from "@google/genai";
import type { Problem } from '../types';

// The check for process.env.API_KEY was removed. It caused a crash on deployment
// to environments like Vercel where `process` is not defined in the browser.
// By removing the check, the app can load. The @google/genai SDK will handle
// a missing API key gracefully when an API call is made, allowing the UI to
// show a proper error message instead of a blank screen.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Predefined data for Level 1 ---
const LEVEL_1_FORMULAS = [
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

const LEVEL_1_PRECOMPUTED_ANSWERS: { [key: string]: { [key: string]: string } } = {
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
// --- End of Level 1 data ---

const generateProblemFromGemini = async (level: number): Promise<Problem | null> => {
    const prompt = `
      Genereer een probleem voor het omvormen van een natuurkundige formule voor een leerspel, moeilijkheidsgraad ${level}.
      De formule moet geschikt zijn voor een middelbare scholier.
      Level 1: Simpele lineaire formules (bv. F=ma, v=d/t).
      Level 2: Formules met kwadraten of meerdere termen (bv. E = 1/2 * m * v^2, v = v0 + a*t).
      Level 3: Complexere formules, eventueel met wortels of meerdere stappen (bv. T = 2 * pi * sqrt(L/g)).

      Geef de originele formule, de variabele om naar om te vormen, en een lijst van alle unieke symbolen (variabelen, operatoren, getallen) die in de correct omgevormde formule nodig zijn. Voeg ook de correct omgevormde formule toe.
      Gebruik 'sqrt()' voor wortels en '^2' voor kwadraten. Splits getallen en variabelen. Bv. '1/2' wordt '0.5'. '2*pi' wordt '2', '*', 'pi'.

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
                        originalFormula: { type: Type.STRING },
                        targetVariable: { type: Type.STRING },
                        correctAnswer: { type: Type.STRING },
                        symbols: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ["originalFormula", "targetVariable", "correctAnswer", "symbols"],
                }
            }
        });

        const jsonString = response.text.trim();
        const problemData = JSON.parse(jsonString) as Problem;
        
        const standardSymbols = ['+', '-', '*', '(', ')', '__square__', '__sqrt__', '__fraction__'];
        const geminiSymbols = problemData.symbols.map(s => s === '^2' ? '__square__' : s);
        const combinedSymbols = [...new Set([...geminiSymbols, ...standardSymbols])];
        
        return { ...problemData, symbols: combinedSymbols };
    } catch (error) {
        console.error(`Error fetching level ${level} physics problem from Gemini:`, error);
        return null;
    }
};


export const getPhysicsProblem = async (level: number): Promise<Problem | null> => {
    if (level === 1) {
        try {
            const randomFormulaData = LEVEL_1_FORMULAS[Math.floor(Math.random() * LEVEL_1_FORMULAS.length)];
            const { formula, variables } = randomFormulaData;

            const solvedVariable = formula.split('=')[0].trim();
            const possibleTargets = variables.filter(v => v !== solvedVariable);
            
            if (possibleTargets.length === 0) {
                throw new Error(`No possible rearrangement targets for formula: ${formula}`);
            }
            
            const targetVariable = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
            
            const correctAnswer = LEVEL_1_PRECOMPUTED_ANSWERS[formula]?.[targetVariable];
            if (!correctAnswer) {
                throw new Error(`No precomputed answer for ${formula} -> ${targetVariable}`);
            }

            const standardSymbols = ['+', '-', '*', '(', ')', '__square__', '__sqrt__', '__fraction__'];
            let combinedSymbols = [...new Set([...variables, ...standardSymbols])];

            // If the formula or any possible answer contains a square, ensure the square symbol is available.
            const hasSquare = formula.includes('^2') || Object.values(LEVEL_1_PRECOMPUTED_ANSWERS[formula] || {}).some(ans => ans.includes('^2'));
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
            return Promise.resolve(problem);
        } catch (error) {
            console.error("Error generating level 1 problem locally, falling back to Gemini:", error);
            return generateProblemFromGemini(level); // Fallback to Gemini in case of an unexpected error
        }
    }
    
    // For levels 2 and 3, use Gemini
    return generateProblemFromGemini(level);
};

interface ValidationResponse {
    isCorrect: boolean;
    explanation: string;
}

export const checkAnswer = async (problem: Problem, userAnswer: string): Promise<ValidationResponse> => {
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