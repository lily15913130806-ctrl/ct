/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Question {
  id: string;
  problem: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
  similarQuestions: SimilarQuestion[];
  createdAt: number;
}

export interface SimilarQuestion {
  id: string;
  problem: string;
  answer: string;
  analysis: string; // 易错点分析
}

export interface OCRResult {
  problem: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
}
