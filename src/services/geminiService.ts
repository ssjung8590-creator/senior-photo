import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function classifyImage(base64Data: string, mimeType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: `이 사진을 분석해서 가장 잘 어울리는 하나의 카테고리로 분류하고, 어르신이 읽기 편하도록 따뜻하고 친절한 어투로 짧은 설명을 한국어로 작성해주세요.
              
카테고리는 반드시 다음 중 하나여야 합니다:
- '가족': 사람, 손주, 자식 등 가족과 관련된 사진
- '음식': 요리, 식사, 과일, 간식 등 먹을 것과 관련된 사진
- '풍경': 산, 바다, 하늘, 꽃, 나무 등 자연 경관 사진
- '여행': 관광지, 비행기, 숙소 등 여행 중에 찍은 사진
- '추억': 친구, 옛 물건, 취미 활동 등 소중한 기억이 담긴 사진

JSON 형식으로만 답해주세요: { "category": "가족/음식/풍경/여행/추억", "description": "설명" }`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING,
              description: "가족, 음식, 풍경, 여행, 추억 중 하나"
            },
            description: { 
              type: Type.STRING,
              description: "따뜻한 설명 (2~3문장)"
            },
          },
          required: ["category", "description"],
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini classification failed:", error);
    return { category: "기타", description: "사진을 분석할 수 없습니다." };
  }
}
