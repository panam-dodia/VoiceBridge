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
      // Organize transcripts by session with metadata
      const sessionMap = new Map();
      for (const t of allTranscripts) {
        if (!sessionMap.has(t.session_id)) {
          sessionMap.set(t.session_id, {
            type: t.type,
            title: t.title,
            created_at: t.created_at,
            ended_at: t.ended_at,
            language: t.language,
            transcripts: []
          });
        }
        sessionMap.get(t.session_id).transcripts.push(t);
      }

      // Sort sessions by creation date (most recent first)
      const sortedSessions = Array.from(sessionMap.entries())
        .sort((a, b) => new Date(b[1].created_at) - new Date(a[1].created_at));

      // Build session metadata summary with ALL sessions
      let sessionListText = '\n\nComplete Session List (Most Recent First):\n';
      sortedSessions.forEach(([sessionId, data], index) => {
        const sessionType = data.type === 'youtube' ? 'YouTube Video' : 'Meeting';
        const sessionTitle = data.title || 'Untitled';

        // Extract room code from title if it's a meeting (e.g., "Meeting: 2EDUVT")
        const roomCodeMatch = sessionTitle.match(/Meeting:\s*([A-Z0-9]+)/i);
        const roomCode = roomCodeMatch ? roomCodeMatch[1] : null;

        const createdDate = new Date(data.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const roomInfo = roomCode ? ` (Room Code: ${roomCode})` : '';
        sessionListText += `${index + 1}. [${sessionType}] "${sessionTitle}"${roomInfo} - ${createdDate}\n`;
      });

      // Build context from recent sessions (limit to prevent token overflow)
      let contextText = '';
      let sessionCount = 0;
      const maxSessions = 5; // Limit context to 5 most recent sessions

      for (const [sessionId, data] of sortedSessions) {
        if (sessionCount >= maxSessions) break;

        const sessionType = data.type === 'youtube' ? 'YouTube Video' : 'Meeting';
        const sessionTitle = data.title || 'Untitled';
        const createdDate = new Date(data.created_at).toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const texts = data.transcripts
          .map(t => {
            const speaker = t.speaker_name ? `${t.speaker_name}: ` : '';
            return speaker + (t.translated_text || t.original_text);
          })
          .join('\n');

        contextText += `\n\n[${sessionType}: "${sessionTitle}" - ${createdDate}]\n${texts}`;
        sessionCount++;
      }

      const prompt = `You are a helpful AI assistant with access to the user's translation history.
${sessionListText}

Recent Session Content (${sessionCount} most recent):
${contextText}

User's Question: ${question}

Instructions:
1. **CRITICAL**: For "when was my last meeting/video" questions, THE ANSWER IS ALWAYS #1 IN THE LIST ABOVE (the first item). It's already sorted by most recent first. State the date and title from item #1.
2. For questions searching by room code (like "2EDUVT", "O4U558"), search the session list above for that exact code in the "(Room Code: XXX)" field
3. For questions about specific session names or topics, search both the session list and content
4. For questions about content, answer from the transcripts and cite which session it came from
5. For general knowledge questions, provide a helpful answer but mention it's not from the history
6. Answer in ${targetLanguage} language
7. Keep your answer concise and clear (2-5 sentences)
8. When mentioning dates, use the EXACT dates from the session list above

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
   * Note: This is a best-effort detection based on text content only.
   * It looks for explicit gender references or pronouns.
   * Default is 'male' when uncertain.
   */
  async detectVoiceGender(transcriptSample) {
    try {
      const prompt = `Analyze this video transcript and determine the speaker's gender ONLY if there are EXPLICIT indicators.

Transcript sample:
${transcriptSample}

Look for EXPLICIT indicators ONLY:
1. Direct self-references: "I am a man/woman", "as a male/female", etc.
2. Clear pronoun usage: "he/him" or "she/her" when referring to the speaker
3. Gendered titles: Mr., Mrs., Ms., Sir, Madam, etc.

IMPORTANT:
- If there are NO explicit gender indicators, respond with "male" (default)
- Do NOT guess based on topic, interests, or speech patterns
- Do NOT infer from ambiguous content
- ONLY detect gender if it's explicitly stated

Respond with ONLY ONE WORD: either "male" or "female"

Answer:`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const gender = response.candidates[0].content.parts[0].text.trim().toLowerCase();

      console.log(`🔍 Gender detection AI response: "${gender}"`);

      if (gender.includes('female')) {
        console.log('✓ Detected as FEMALE (explicit indicators found)');
        return 'female';
      } else {
        console.log('✓ Defaulting to MALE (no explicit female indicators)');
        return 'male';
      }
    } catch (error) {
      console.error('Voice gender detection error:', error.message);
      console.log('⚠️ Error in detection, defaulting to MALE');
      return 'male'; // Default fallback
    }
  }
}

export default new VertexAIService();
