import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

class GeminiService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  /**
   * Answer a question based on video content or general knowledge
   */
  async answerQuestion(question, watchedTranscript, targetLanguage = 'English') {
    try {
      // Combine watched transcript into context
      const transcriptText = watchedTranscript
        .map(segment => segment.text || segment.original_text)
        .join(' ');

      const prompt = `You are a helpful AI assistant answering questions about a video.

Video Content (what the user has watched so far):
${transcriptText}

User's Question: ${question}

Instructions:
1. If the question can be answered from the video content above, answer it directly based on that content
2. If the question is about something not mentioned in the video but is a general knowledge question related to the video topic, provide a helpful answer
3. If you cannot answer from the video content and it's not related to the video topic, politely say you can only answer questions about the video or related topics
4. Answer in ${targetLanguage} language
5. Keep your answer concise and clear (2-4 sentences)

Answer:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Gemini API error:', error.message);
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  /**
   * Answer question with context from ALL user history (YouTube + Meetings)
   */
  async answerWithHistory(question, allTranscripts, targetLanguage = 'English') {
    try {
      // Organize transcripts by session
      const contextSections = [];

      // Group by session
      const sessionMap = new Map();
      for (const t of allTranscripts) {
        if (!sessionMap.has(t.session_id)) {
          sessionMap.set(t.session_id, {
            type: t.type,
            title: t.title,
            transcripts: []
          });
        }
        sessionMap.get(t.session_id).transcripts.push(t);
      }

      // Build context from recent sessions (limit to prevent token overflow)
      let contextText = '';
      let sessionCount = 0;
      const maxSessions = 5; // Limit context to 5 most recent sessions

      for (const [sessionId, data] of sessionMap) {
        if (sessionCount >= maxSessions) break;

        const sessionType = data.type === 'youtube' ? 'YouTube Video' : 'Meeting';
        const sessionTitle = data.title || 'Untitled';
        const texts = data.transcripts
          .map(t => t.translated_text || t.original_text)
          .join(' ');

        contextText += `\n\n[${sessionType}: ${sessionTitle}]\n${texts}`;
        sessionCount++;
      }

      const prompt = `You are a helpful AI assistant with access to the user's translation history.

User's Translation History:
${contextText}

User's Question: ${question}

Instructions:
1. If the question can be answered from the translation history above, answer it directly and mention which session(s) it came from
2. If the question is general knowledge, provide a helpful answer
3. Answer in ${targetLanguage} language
4. Keep your answer concise and clear (2-5 sentences)
5. If referencing specific content, mention whether it was from a YouTube video or meeting

Answer:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Gemini API error:', error.message);
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  /**
   * Translate text to target language using Gemini
   */
  async translateText(text, targetLanguage) {
    try {
      const prompt = `Translate the following text to ${targetLanguage}. Only return the translation, no explanations:

${text}`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Translation error:', error.message);
      throw new Error(`Failed to translate: ${error.message}`);
    }
  }

  /**
   * Detect voice gender from transcript sample
   */
  async detectVoiceGender(transcriptSample) {
    try {
      const prompt = `Analyze this video transcript sample and determine if the speaker is most likely male or female.

Transcript sample:
${transcriptSample}

Based on:
1. Language patterns (if any gender-specific references exist)
2. Context clues (topics, self-references, etc.)
3. Any explicit mentions of gender

Respond with ONLY ONE WORD: either "male" or "female"

Answer:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const gender = response.text().trim().toLowerCase();

      if (gender.includes('female')) {
        return 'female';
      } else if (gender.includes('male')) {
        return 'male';
      } else {
        return 'male'; // Default
      }
    } catch (error) {
      console.error('Voice gender detection error:', error.message);
      return 'male'; // Default fallback
    }
  }
}

export default new GeminiService();
