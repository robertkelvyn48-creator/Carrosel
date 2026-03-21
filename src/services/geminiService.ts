import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TextData {
  text: string;
}

export const extractTextFromImage = async (base64Image: string): Promise<TextData> => {
  const promptString = `Você é um assistente de OCR especializado em carrosséis de redes sociais.
Sua tarefa é extrair APENAS o texto principal (o corpo da mensagem, que geralmente é grande e em destaque).

REGRAS IMPORTANTES:
1. IGNORE marcas d'água ou nomes de páginas (ex: "Mental Firme", "@usuario").
2. IGNORE textos de rodapé (ex: "ARRASTE PRO LADO", "CURTA E COMPARTILHE").
3. Retorne apenas o conteúdo da mensagem principal.
4. Se o texto estiver em outro idioma (como inglês, espanhol, etc.), TRADUZA-O para o PORTUGUÊS DO BRASIL.
5. Se não houver texto principal, retorne uma string vazia.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Image,
          },
        },
        {
          text: promptString,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 4000,
      temperature: 0.1,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { 
            type: Type.STRING,
            description: "O texto principal extraído da imagem, sem marcas d'água ou rodapés." 
          }
        },
        required: ["text"],
      },
    },
  });

  const rawText = response.text || "{}";
  const cleanedText = rawText.replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("JSON parsing error:", cleanedText);
    return { text: "" };
  }
};
