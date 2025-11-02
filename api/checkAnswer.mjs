// Gebruik dynamische import voor @google/genai omdat we geen package.json hebben.
const genAIModule = await import('https://aistudiocdn.com/@google/genai/dist/index.mjs');
const { GoogleGenAI, Type } = genAIModule;

/**
 * Vercel Serverless Functie om een antwoord voor een natuurkundeformule te controleren met de Gemini API.
 * Deze functie fungeert als een veilige proxy om te voorkomen dat de API-sleutel in de client-side code wordt blootgesteld.
 * @param {import('@vercel/node').VercelRequest} req - Het request-object.
 * @param {import('@vercel/node').VercelResponse} res - Het response-object.
 */
export default async function handler(req, res) {
  // Sta alleen POST-verzoeken toe
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Vercel parseert automatisch JSON-bodies voor POST-verzoeken
    const { problem, userAnswer } = req.body;

    // Basisvalidatie
    if (!problem || !userAnswer || typeof problem.originalFormula !== 'string' || typeof userAnswer !== 'string') {
      return res.status(400).json({ error: 'Ontbrekende of ongeldige `problem` of `userAnswer` in de request body.' });
    }
    
    // Controleer op API-sleutel (geconfigureerd in Vercel projectinstellingen)
    if (!process.env.API_KEY) {
        console.error('API_KEY omgevingsvariabele niet ingesteld op de server.');
        return res.status(500).json({ error: 'Serverconfiguratiefout. API-sleutel ontbreekt.' });
    }

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
    const result = JSON.parse(jsonString);

    // Stel cache-headers in om caching van API-antwoorden te voorkomen
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(result);

  } catch (error) {
    console.error('Fout in Vercel-functie (api/checkAnswer):', error);
    // Geef een generieke foutmelding aan de client
    return res.status(500).json({ error: 'Er is een interne serverfout opgetreden bij het controleren van het antwoord.' });
  }
}
