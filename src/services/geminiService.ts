import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function classifyImage(base64Data: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `사진을 분석해서 가족, 음식, 풍경, 여행, 추억 중 하나로 분류하세요. 설명은 필요 없습니다.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING,
              enum: ["가족", "음식", "풍경", "여행", "추억"],
              description: "5가지 카테고리 중 하나"
            },
          },
          required: ["category"],
        },
      },
    });

    const text = response.text || "{}";
    const parsed = JSON.parse(text);
    
    // Ensure category is cleaned of any extra whitespace
    if (parsed.category) {
      parsed.category = parsed.category.trim();
    }
    
    return parsed;
  } catch (error) {
    console.error("Gemini classification failed:", error);
    return { category: "추억" };
  }
}
