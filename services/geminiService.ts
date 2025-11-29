
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini
// We use a safe check here. In a real build, we'd use import.meta.env.VITE_API_KEY
// DO NOT use process.env here as it crashes the Android app.
const API_KEY = ""; // Keep empty or add a hardcoded key if strictly necessary for testing

let ai: GoogleGenAI | null = null;
try {
    if (API_KEY) {
        ai = new GoogleGenAI({ apiKey: API_KEY });
    }
} catch (e) {
    console.warn("AI service not initialized");
}

export const getAIRecommendations = async (mood: string): Promise<string[]> => {
  if (!ai) {
      console.warn("AI Key missing");
      return ["Happy Vibes", "Relaxing Rain", "Power Workout", "Focus Flow", "Late Night Jazz"];
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `I am feeling "${mood}". Suggest 5 song titles that fit this mood. Only return the song titles as a JSON array of strings. Do not include artist names, just titles that sound plausible or are real hits.`;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return [];
  } catch (error) {
    console.error("AI Recommendation failed", error);
    return ["Happy Vibes", "Relaxing Rain", "Power Workout", "Focus Flow", "Late Night Jazz"];
  }
};
