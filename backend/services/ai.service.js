/**
 * AI Service Wrapper
 * Switches between Vertex AI (Google Cloud) and direct Gemini API
 * based on USE_VERTEX_AI environment variable
 */

import dotenv from 'dotenv';
import vertexAIService from './vertexai.service.js';
import geminiService from './gemini.service.js';

dotenv.config();

class AIService {
  constructor() {
    const useVertexAI = process.env.USE_VERTEX_AI === 'true';

    if (useVertexAI) {
      console.log('🚀 Using Vertex AI (Google Cloud) for AI operations');
      this.service = vertexAIService;
    } else {
      console.log('📡 Using direct Gemini API for AI operations');
      this.service = geminiService;
    }
  }

  // Proxy all methods to the selected service
  async answerQuestion(question, watchedTranscript, targetLanguage = 'English') {
    return this.service.answerQuestion(question, watchedTranscript, targetLanguage);
  }

  async answerWithHistory(question, allTranscripts, targetLanguage = 'English') {
    return this.service.answerWithHistory(question, allTranscripts, targetLanguage);
  }

  async translateText(text, targetLanguage) {
    return this.service.translateText(text, targetLanguage);
  }

  async detectVoiceGender(transcriptSample) {
    return this.service.detectVoiceGender(transcriptSample);
  }

  // Expose the underlying model for direct access if needed
  get model() {
    return this.service.model;
  }
}

export default new AIService();
