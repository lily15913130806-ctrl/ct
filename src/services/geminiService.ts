/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult, SimilarQuestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function identifyWrongQuestion(base64Image: string): Promise<OCRResult> {
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(",")[1] || base64Image,
          },
        },
        {
          text: `你是一个专业的全科题目识别专家。请识别图片中的错题，并提取以下信息：
          1. 题目文本 (problem)
          2. 选项 (options，如果有)
          3. 用户回答 (userAnswer，如果有)
          4. 标准答案 (standardAnswer，如果有)
          5. 核心知识点 (knowledgePoint，例如“一元二次方程根的判别式”)
          
          请以 JSON 格式返回。`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          problem: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          userAnswer: { type: Type.STRING },
          standardAnswer: { type: Type.STRING },
          knowledgePoint: { type: Type.STRING },
        },
        required: ["problem", "knowledgePoint"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as OCRResult;
}

export async function generateSimilarQuestions(
  problem: string,
  knowledgePoint: string
): Promise<SimilarQuestion[]> {
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: `你是一个资深的教育专家。针对以下错题及其知识点，生成 3 道“举一反三”的变式题。
    
    原题：${problem}
    知识点：${knowledgePoint}
    
    要求：
    1. 题目覆盖同一知识点的不同角度或变换式。
    2. 难度与原题相当或略有提升。
    3. 每道题必须附带正确答案。
    4. 每道题必须附带“易错点分析”（例如：“本题常见错误是忘记讨论二次项系数为0的情况”）。
    
    请以 JSON 数组格式返回，每个对象包含 id (uuid), problem, answer, analysis。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            problem: { type: Type.STRING },
            answer: { type: Type.STRING },
            analysis: { type: Type.STRING },
          },
          required: ["id", "problem", "answer", "analysis"],
        },
      },
    },
  });

  return JSON.parse(response.text || "[]") as SimilarQuestion[];
}
