import express from 'express';
import youtubeService from '../services/youtube.service.js';
import youtubeInnertubeService from '../services/youtube-innertube.service.js';
import aiService from '../services/ai.service.js';
import ttsService from '../services/tts.service.js';
import historyService from '../services/history.service.js';

const router = express.Router();

/**
 * POST /api/youtube/create-session
 * Create session and fetch transcript using Innertube API
 */
router.post('/create-session', async (req, res) => {
  try {
    const { url, userId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Extract video ID
    const videoId = youtubeService.extractVideoId(url);

    // Fetch transcript using Innertube API (bypasses IP blocking)
    const transcript = await youtubeInnertubeService.getTranscript(videoId);

    // Get video metadata (title, author, etc.)
    const metadata = await youtubeService.getVideoMetadata(videoId);
    console.log(`📺 Video metadata:`, metadata);

    // Create session in database with actual video title
    const title = metadata.title || `YouTube Video: ${videoId}`;
    const sessionId = historyService.createSession(
      userId,
      'youtube',
      { videoId, url, title: metadata.title, author: metadata.author },
      title,
      'English'
    );

    // Save transcript to database
    for (const segment of transcript) {
      historyService.addTranscript(
        sessionId,
        segment.text,
        'English',
        null,
        null,
        null,
        null
      );
    }

    res.json({
      success: true,
      videoId,
      sessionId,
      metadata,
      transcript
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      error: 'Failed to create session',
      message: error.message
    });
  }
});

/**
 * GET /api/youtube/transcript
 * Extract transcript from YouTube video
 */
router.post('/transcript', async (req, res) => {
  try {
    const { url, userId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Extract video ID
    const videoId = youtubeService.extractVideoId(url);

    // Get video metadata (title, author, etc.)
    const metadata = await youtubeService.getVideoMetadata(videoId);
    console.log(`📺 Video metadata:`, metadata);

    // Get transcript
    const transcript = await youtubeService.getTranscript(videoId);

    // Create session in database with actual video title
    const title = metadata.title || `YouTube Video: ${videoId}`;
    const sessionId = historyService.createSession(
      userId,
      'youtube',
      { videoId, url, title: metadata.title, author: metadata.author },
      title,
      'English'
    );

    // Save transcript to database
    for (const segment of transcript) {
      historyService.addTranscript(
        sessionId,
        segment.text,
        'English',
        null, // Not translated yet
        null,
        null,
        null
      );
    }

    res.json({
      success: true,
      videoId,
      sessionId,
      transcript
    });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({
      error: 'Failed to fetch transcript',
      message: error.message
    });
  }
});

/**
 * POST /api/youtube/translate-text
 * Translate a text segment
 */
router.post('/translate-text', async (req, res) => {
  try {
    const { text, targetLanguage, sessionId } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Text and target language are required' });
    }

    // Translate using Gemini
    const translatedText = await aiService.translateText(text, targetLanguage);

    // Update transcript in database if sessionId provided
    if (sessionId) {
      // Note: In a production app, you'd want to update the specific transcript row
      // For now, we'll add it as a new entry
      historyService.addTranscript(
        sessionId,
        text,
        'English',
        translatedText,
        targetLanguage,
        null,
        null
      );
    }

    res.json({
      success: true,
      originalText: text,
      translatedText,
      targetLanguage
    });
  } catch (error) {
    console.error('Error translating text:', error);
    res.status(500).json({
      error: 'Failed to translate text',
      message: error.message
    });
  }
});

/**
 * POST /api/youtube/text-to-speech
 * Convert text to speech
 */
router.post('/text-to-speech', async (req, res) => {
  try {
    const { text, gender = 'male', language = 'English' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Convert to speech with language support
    const audioBuffer = await ttsService.textToSpeech(text, null, gender, language);

    // Set headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('Error converting text to speech:', error);
    res.status(500).json({
      error: 'Failed to convert text to speech',
      message: error.message
    });
  }
});

/**
 * POST /api/youtube/qa
 * Answer question about video
 */
router.post('/qa', async (req, res) => {
  try {
    const { question, sessionId, userId, targetLanguage = 'English' } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Translate question to target language if not English
    let translatedQuestion = question;
    if (targetLanguage !== 'English') {
      translatedQuestion = await aiService.translateText(question, targetLanguage);
    }

    let answer;
    let contextType = 'general';

    if (sessionId) {
      // Get session transcripts
      const transcripts = historyService.getSessionTranscripts(sessionId);

      if (transcripts.length > 0) {
        // Answer based on session context
        answer = await aiService.answerQuestion(translatedQuestion, transcripts, targetLanguage);
        contextType = 'session';
      } else {
        // No transcripts, use all history
        const allTranscripts = historyService.getAllUserTranscripts(userId);
        answer = await aiService.answerWithHistory(translatedQuestion, allTranscripts, targetLanguage);
        contextType = 'all_history';
      }
    } else {
      // No session, search all history
      const allTranscripts = historyService.getAllUserTranscripts(userId);
      answer = await aiService.answerWithHistory(translatedQuestion, allTranscripts, targetLanguage);
      contextType = 'all_history';
    }

    // Save Q&A to history (save the translated question)
    historyService.saveQA(sessionId, userId, translatedQuestion, answer, contextType);

    res.json({
      success: true,
      question: translatedQuestion,
      answer,
      contextType
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      error: 'Failed to answer question',
      message: error.message
    });
  }
});

/**
 * POST /api/youtube/detect-gender
 * Detect speaker gender from transcript
 */
router.post('/detect-gender', async (req, res) => {
  try {
    const { transcriptSample } = req.body;

    if (!transcriptSample) {
      return res.status(400).json({ error: 'Transcript sample is required' });
    }

    const gender = await aiService.detectVoiceGender(transcriptSample);

    res.json({
      success: true,
      gender
    });
  } catch (error) {
    console.error('Error detecting gender:', error);
    res.status(500).json({
      error: 'Failed to detect gender',
      message: error.message
    });
  }
});

export default router;
