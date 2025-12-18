import { statements } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

class HistoryService {
  /**
   * Create a new session
   */
  createSession(userId, type, metadata = {}, title = '', language = '') {
    const sessionId = uuidv4();

    try {
      statements.createSession.run(
        sessionId,
        userId,
        type,
        JSON.stringify(metadata),
        title,
        language
      );

      console.log(`✓ Created ${type} session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    try {
      const session = statements.getSession.get(sessionId);

      if (session && session.metadata) {
        session.metadata = JSON.parse(session.metadata);
      }

      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  }

  /**
   * Update session (end time, metadata)
   */
  updateSession(sessionId, metadata = null) {
    try {
      const endedAt = new Date().toISOString();
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      statements.updateSession.run(endedAt, metadataJson, sessionId);

      console.log(`✓ Updated session: ${sessionId}`);
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId, limit = 50, offset = 0) {
    try {
      const sessions = statements.getUserSessions.all(userId, limit, offset);

      return sessions.map(session => ({
        ...session,
        metadata: session.metadata ? JSON.parse(session.metadata) : null
      }));
    } catch (error) {
      console.error('Error getting user sessions:', error);
      throw error;
    }
  }

  /**
   * Get sessions by type
   */
  getSessionsByType(userId, type, limit = 50, offset = 0) {
    try {
      const sessions = statements.getSessionsByType.all(userId, type, limit, offset);

      return sessions.map(session => ({
        ...session,
        metadata: session.metadata ? JSON.parse(session.metadata) : null
      }));
    } catch (error) {
      console.error('Error getting sessions by type:', error);
      throw error;
    }
  }

  /**
   * Add transcript to session
   */
  addTranscript(sessionId, originalText, originalLanguage, translatedText, targetLanguage, speakerId = null, speakerName = null) {
    try {
      statements.createTranscript.run(
        sessionId,
        originalText,
        originalLanguage,
        translatedText,
        targetLanguage,
        speakerId,
        speakerName
      );
    } catch (error) {
      console.error('Error adding transcript:', error);
      throw error;
    }
  }

  /**
   * Get transcripts for a session
   */
  getSessionTranscripts(sessionId) {
    try {
      return statements.getSessionTranscripts.all(sessionId);
    } catch (error) {
      console.error('Error getting session transcripts:', error);
      throw error;
    }
  }

  /**
   * Get all transcripts for a user (across all sessions)
   */
  getAllUserTranscripts(userId) {
    try {
      return statements.getAllUserTranscripts.all(userId);
    } catch (error) {
      console.error('Error getting all user transcripts:', error);
      throw error;
    }
  }

  /**
   * Save Q&A to history
   */
  saveQA(sessionId, userId, question, answer, contextType = 'session') {
    try {
      statements.createQA.run(sessionId, userId, question, answer, contextType);

      console.log(`✓ Saved Q&A for session: ${sessionId}`);
    } catch (error) {
      console.error('Error saving Q&A:', error);
      throw error;
    }
  }

  /**
   * Get Q&A history for a session
   */
  getSessionQA(sessionId) {
    try {
      return statements.getSessionQA.all(sessionId);
    } catch (error) {
      console.error('Error getting session Q&A:', error);
      throw error;
    }
  }

  /**
   * Get Q&A history for a user
   */
  getUserQA(userId, limit = 50, offset = 0) {
    try {
      return statements.getUserQA.all(userId, limit, offset);
    } catch (error) {
      console.error('Error getting user Q&A:', error);
      throw error;
    }
  }

  /**
   * Search transcripts
   */
  searchTranscripts(userId, searchTerm, limit = 20) {
    try {
      const searchPattern = `%${searchTerm}%`;
      return statements.searchTranscripts.all(userId, searchPattern, searchPattern, limit);
    } catch (error) {
      console.error('Error searching transcripts:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  getUserStats(userId) {
    try {
      return statements.getUserStats.get(userId);
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }
}

export default new HistoryService();
