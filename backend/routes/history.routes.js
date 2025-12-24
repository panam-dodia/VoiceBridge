import express from 'express';
import historyService from '../services/history.service.js';
import aiService from '../services/ai.service.js';
import ttsService from '../services/tts.service.js';

const router = express.Router();

/**
 * GET /api/history/sessions
 * Get all sessions for a user
 */
router.get('/sessions', async (req, res) => {
  try {
    const { userId, type, limit = 50, offset = 0 } = req.query;

    console.log('📥 GET /api/history/sessions - userId:', userId, 'type:', type);

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    let sessions;
    if (type && (type === 'youtube' || type === 'meeting')) {
      sessions = historyService.getSessionsByType(userId, type, parseInt(limit), parseInt(offset));
    } else {
      sessions = historyService.getUserSessions(userId, parseInt(limit), parseInt(offset));
    }

    console.log(`✅ Found ${sessions.length} sessions for user ${userId}`);

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message
    });
  }
});

/**
 * GET /api/history/session/:sessionId
 * Get specific session details
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log('📥 GET /api/history/session/:sessionId - sessionId:', sessionId);

    const session = historyService.getSession(sessionId);

    if (!session) {
      console.log(`❌ Session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get transcripts
    const transcripts = historyService.getSessionTranscripts(sessionId);

    // Get Q&A history
    const qa = historyService.getSessionQA(sessionId);

    console.log(`✅ Session found: ${session.title}, ${transcripts.length} transcripts, ${qa.length} Q&As`);

    res.json({
      success: true,
      session,
      transcripts,
      qa
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'Failed to get session',
      message: error.message
    });
  }
});

/**
 * GET /api/history/transcripts
 * Get all transcripts for a user
 */
router.get('/transcripts', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const transcripts = historyService.getAllUserTranscripts(userId);

    res.json({
      success: true,
      transcripts
    });
  } catch (error) {
    console.error('Error getting transcripts:', error);
    res.status(500).json({
      error: 'Failed to get transcripts',
      message: error.message
    });
  }
});

/**
 * GET /api/history/qa
 * Get Q&A history for a user
 */
router.get('/qa', async (req, res) => {
  try {
    const { userId, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const qa = historyService.getUserQA(userId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      qa
    });
  } catch (error) {
    console.error('Error getting Q&A history:', error);
    res.status(500).json({
      error: 'Failed to get Q&A history',
      message: error.message
    });
  }
});

/**
 * GET /api/history/search
 * Search across all transcripts
 */
router.get('/search', async (req, res) => {
  try {
    const { userId, q, limit = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = historyService.searchTranscripts(userId, q, parseInt(limit));

    res.json({
      success: true,
      query: q,
      results
    });
  } catch (error) {
    console.error('Error searching transcripts:', error);
    res.status(500).json({
      error: 'Failed to search transcripts',
      message: error.message
    });
  }
});

/**
 * GET /api/history/stats
 * Get user statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const stats = historyService.getUserStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * POST /api/history/qa
 * Ask question across all history or specific session
 */
router.post('/qa', async (req, res) => {
  try {
    const { userId, question, sessionId, targetLanguage = 'English', includeAudio = false } = req.body;

    console.log('📥 POST /api/history/qa - Received:', { userId, question, sessionId, targetLanguage, includeAudio });

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    let transcripts;
    let contextType;

    // If sessionId is provided, use session-specific transcripts
    if (sessionId) {
      console.log(`🔍 Getting transcripts for session: ${sessionId}`);
      transcripts = historyService.getSessionTranscripts(sessionId);
      contextType = 'session';
      console.log(`✅ Found ${transcripts.length} transcripts for session`);
    } else {
      // Otherwise, get all user transcripts
      console.log(`🔍 Getting all transcripts for user: ${userId}`);
      transcripts = historyService.getAllUserTranscripts(userId);
      contextType = 'all_history';
      console.log(`✅ Found ${transcripts.length} transcripts for user`);
    }

    // Answer with context
    const answer = await aiService.answerWithHistory(question, transcripts, targetLanguage);

    // Save Q&A to history
    historyService.saveQA(sessionId || null, userId, question, answer, contextType);
    console.log(`✅ Saved Q&A for session: ${sessionId || 'null'}`);

    // Generate audio if requested
    let audioBase64 = null;
    if (includeAudio) {
      try {
        const audioBuffer = await ttsService.textToSpeech(answer, null, 'male', targetLanguage);
        audioBase64 = audioBuffer.toString('base64');
        console.log(`✅ Generated TTS audio for answer (${audioBuffer.length} bytes)`);
      } catch (audioError) {
        console.error('❌ TTS generation error:', audioError);
        // Continue without audio if TTS fails
      }
    }

    res.json({
      success: true,
      question,
      answer,
      contextType,
      sessionId: sessionId || null,
      audio: audioBase64
    });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({
      error: 'Failed to answer question',
      message: error.message
    });
  }
});

export default router;
