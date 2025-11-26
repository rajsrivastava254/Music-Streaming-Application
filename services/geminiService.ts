import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini
// Note: In a production app, never expose API keys on the client side.
// This is for demonstration as requested.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getAIRecommendations = async (mood: string): Promise<string[]> => {
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
