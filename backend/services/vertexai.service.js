import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

class VertexAIService {
  constructor() {
    // Initialize Vertex AI with your Google Cloud project
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-project-id';
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    if (!projectId || projectId === 'your-project-id') {
      console.warn('⚠️ GOOGLE_CLOUD_PROJECT_ID not configured. Falling back to direct Gemini API.');
      this.useDirectAPI = true;
      return;
    }

    console.log(`🔧 Initializing Vertex AI: Project=${projectId}, Location=${location}`);

    this.vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    // Initialize Gemini model via Vertex AI
    // Using gemini-2.5-flash for best balance of quality and speed
    this.model = this.vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    this.useDirectAPI = false;
    console.log('✅ Vertex AI initialized successfully');
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
      const response = result.response;
      return response.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Vertex AI error:', error.message);
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  /**
   * Answer question with context from ALL user history (YouTube + Meetings)
   */
  async answerWithHistory(question, allTranscripts, targetLanguage = 'English') {
    try {
      // Organize transcripts by session
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
      const response = result.response;
      return response.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Vertex AI error:', error.message);
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  /**
   * Translate text to target language using Gemini via Vertex AI
   */
  async translateText(text, targetLanguage) {
    try {
      const prompt = `Translate the following text to ${targetLanguage}. Only return the translation, no explanations:

${text}`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      return response.candidates[0].content.parts[0].text.trim();
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
      const response = result.response;
      const gender = response.candidates[0].content.parts[0].text.trim().toLowerCase();

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

export default new VertexAIService();
