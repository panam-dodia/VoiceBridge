import express from 'express';
import historyService from '../services/history.service.js';
import geminiService from '../services/gemini.service.js';

const router = express.Router();

/**
 * GET /api/history/sessions
 * Get all sessions for a user
 */
router.get('/sessions', async (req, res) => {
  try {
    const { userId, type, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    let sessions;
    if (type && (type === 'youtube' || type === 'meeting')) {
      sessions = historyService.getSessionsByType(userId, type, parseInt(limit), parseInt(offset));
    } else {
      sessions = historyService.getUserSessions(userId, parseInt(limit), parseInt(offset));
    }

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

    const session = historyService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get transcripts
    const transcripts = historyService.getSessionTranscripts(sessionId);

    // Get Q&A history
    const qa = historyService.getSessionQA(sessionId);

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
 * Ask question across all history
 */
router.post('/qa', async (req, res) => {
  try {
    const { userId, question, targetLanguage = 'English' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get all user transcripts
    const allTranscripts = historyService.getAllUserTranscripts(userId);

    // Answer with full history context
    const answer = await geminiService.answerWithHistory(question, allTranscripts, targetLanguage);

    // Save Q&A to history (no specific session)
    historyService.saveQA(null, userId, question, answer, 'all_history');

    res.json({
      success: true,
      question,
      answer,
      contextType: 'all_history'
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
