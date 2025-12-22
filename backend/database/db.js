import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;
const dbPath = join(__dirname, 'talkbridge.db');

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✅ Database loaded successfully');
  } else {
    db = new SQL.Database();
    console.log('✅ Database created successfully');
  }

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  console.log('✅ Schema initialized successfully');

  // Save database periodically
  setInterval(saveDatabase, 5000); // Save every 5 seconds
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

// Helper to run prepared statements
function runStatement(sql, params = []) {
  try {
    db.run(sql, params);
    saveDatabase(); // Save after write operations
    return { success: true };
  } catch (error) {
    console.error('SQL Error:', error);
    throw error;
  }
}

function getStatement(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }

    stmt.free();
    return null;
  } catch (error) {
    console.error('SQL Error:', error);
    throw error;
  }
}

function allStatement(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }

    stmt.free();
    return results;
  } catch (error) {
    console.error('SQL Error:', error);
    throw error;
  }
}

// Wait for database initialization
await initDatabase();

// Prepared statements for common queries
export const statements = {
  // Sessions
  createSession: {
    run: (id, userId, type, metadata, title, language) =>
      runStatement(
        'INSERT INTO sessions (id, user_id, type, metadata, title, language) VALUES (?, ?, ?, ?, ?, ?)',
        [id, userId, type, metadata, title, language]
      )
  },

  getSession: {
    get: (id) =>
      getStatement('SELECT * FROM sessions WHERE id = ?', [id])
  },

  updateSession: {
    run: (endedAt, metadata, id) =>
      runStatement('UPDATE sessions SET ended_at = ?, metadata = ? WHERE id = ?', [endedAt, metadata, id])
  },

  getUserSessions: {
    all: (userId, limit, offset) =>
      allStatement(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      )
  },

  getSessionsByType: {
    all: (userId, type, limit, offset) =>
      allStatement(
        'SELECT * FROM sessions WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, type, limit, offset]
      )
  },

  // Transcripts
  createTranscript: {
    run: (sessionId, originalText, originalLanguage, translatedText, targetLanguage, speakerId, speakerName) =>
      runStatement(
        'INSERT INTO transcripts (session_id, original_text, original_language, translated_text, target_language, speaker_id, speaker_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionId, originalText, originalLanguage, translatedText, targetLanguage, speakerId, speakerName]
      )
  },

  getSessionTranscripts: {
    all: (sessionId) =>
      allStatement('SELECT * FROM transcripts WHERE session_id = ? ORDER BY timestamp ASC', [sessionId])
  },

  getAllUserTranscripts: {
    all: (userId) =>
      allStatement(
        `SELECT t.*, s.type, s.title, s.created_at, s.ended_at, s.language
         FROM transcripts t
         JOIN sessions s ON t.session_id = s.id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC, t.timestamp DESC`,
        [userId]
      )
  },

  // Q&A History
  createQA: {
    run: (sessionId, userId, question, answer, contextType) =>
      runStatement(
        'INSERT INTO qa_history (session_id, user_id, question, answer, context_type) VALUES (?, ?, ?, ?, ?)',
        [sessionId, userId, question, answer, contextType]
      )
  },

  getSessionQA: {
    all: (sessionId) =>
      allStatement('SELECT * FROM qa_history WHERE session_id = ? ORDER BY timestamp DESC', [sessionId])
  },

  getUserQA: {
    all: (userId, limit, offset) =>
      allStatement(
        'SELECT * FROM qa_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      )
  },

  // Search
  searchTranscripts: {
    all: (userId, pattern1, pattern2, limit) =>
      allStatement(
        `SELECT t.*, s.type, s.title, s.created_at as session_date
         FROM transcripts t
         JOIN sessions s ON t.session_id = s.id
         WHERE s.user_id = ?
         AND (t.original_text LIKE ? OR t.translated_text LIKE ?)
         ORDER BY t.timestamp DESC
         LIMIT ?`,
        [userId, pattern1, pattern2, limit]
      )
  },

  // Stats
  getUserStats: {
    get: (userId) =>
      getStatement(
        `SELECT
          COUNT(CASE WHEN type = 'youtube' THEN 1 END) as youtube_count,
          COUNT(CASE WHEN type = 'meeting' THEN 1 END) as meeting_count,
          COUNT(*) as total_sessions
        FROM sessions
        WHERE user_id = ?`,
        [userId]
      )
  }
};

// Export database instance
export default {
  instance: db,
  save: saveDatabase,
  close: () => {
    saveDatabase();
    if (db) {
      db.close();
    }
  }
};
