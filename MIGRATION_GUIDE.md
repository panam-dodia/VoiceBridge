# 📦 Migration from Original Projects

## Overview

This document explains how the original two projects were combined into TalkBridge-unified.

## Original Projects

### 1. YouTube video translator
- **Backend**: Python (FastAPI)
- **Frontend**: Next.js 16
- **Features**: YouTube translation, Q&A
- **Database**: None (stateless)

### 2. polyglot-gcp
- **Backend**: Node.js (Express)
- **Frontend**: React (Create React App)
- **Features**: Multi-person meetings, real-time translation
- **Database**: In-memory only

## What Changed

### Backend Consolidation

#### YouTube Translator → Node.js
```
OLD (Python):
- backend/services/youtube_service.py
- backend/services/gemini_service.py
- backend/services/elevenlabs_service.py

NEW (Node.js):
- backend/services/youtube.service.js
- backend/services/gemini.service.js
- backend/services/tts.service.js
```

**Why**: Single runtime (Node.js) for easier deployment and real-time capabilities

#### Polyglot Meeting → Enhanced
```
OLD:
- server.js (all logic in one file)
- In-memory room storage

NEW:
- server.js (clean separation)
- services/ directory (modular services)
- Database persistence
```

**Why**: Better code organization, persistent history

### Frontend Modernization

#### From Two Apps → One Unified App
```
OLD:
- YouTube: Next.js 16 at port 3000
- Meeting: React CRA at port 3001

NEW:
- TalkBridge: Next.js 15 at port 3000
  - / (landing page)
  - /youtube (YouTube translator)
  - /meeting (meeting translator)
  - /history (unified history)
```

**Why**: Single deployment, shared components, unified UX

### Database Addition

#### From Stateless → Persistent
```
OLD:
- YouTube: No database
- Meeting: RAM only (lost on restart)

NEW:
- SQLite database
- Persistent sessions
- Full history tracking
- Cross-session Q&A
```

**Why**: User requested unified history across all usage

## Feature Comparison

### YouTube Translation

| Feature | Old | New |
|---------|-----|-----|
| Transcript extraction | ✅ | ✅ |
| Translation | ✅ | ✅ |
| Text-to-speech | ✅ | ✅ |
| Q&A about video | ✅ | ✅ |
| History tracking | ❌ | ✅ |
| Cross-video Q&A | ❌ | ✅ |
| Gender detection | ✅ | ✅ |

### Meeting Translation

| Feature | Old | New |
|---------|-----|-----|
| Room creation | ✅ | ✅ |
| Multi-participant | ✅ | ✅ |
| Real-time translation | ✅ | ✅ |
| Agent Q&A | ✅ | ✅ |
| Personal mode | ✅ | ✅ |
| History tracking | ❌ | ✅ |
| Cross-meeting Q&A | ❌ | ✅ |

### New Features (Unified)

| Feature | Description |
|---------|-------------|
| Unified History | All YouTube and Meeting sessions in one place |
| Cross-History Q&A | Ask questions across all your usage |
| Timeline View | See all activities chronologically |
| Search | Find content across all sessions |
| Statistics | Usage stats for both modes |
| Session Replay | Review past sessions |

## API Mapping

### YouTube Endpoints

```
OLD (Python/FastAPI):
POST http://localhost:8000/api/transcript
POST http://localhost:8000/api/translate-text
POST http://localhost:8000/api/text-to-speech
POST http://localhost:8000/api/qa

NEW (Node.js/Express):
POST http://localhost:8080/api/youtube/transcript
POST http://localhost:8080/api/youtube/translate-text
POST http://localhost:8080/api/youtube/text-to-speech
POST http://localhost:8080/api/youtube/qa
```

### Meeting WebSocket

```
OLD:
ws://localhost:8080
- create_room
- join_room
- start_speaking
- agent_query_start

NEW:
ws://localhost:8080
- create_room (same)
- join_room (same)
- start_speaking (same)
- agent_query_start (same + saves to DB)
```

### New History Endpoints

```
GET  /api/history/sessions
GET  /api/history/session/:id
GET  /api/history/transcripts
GET  /api/history/qa
GET  /api/history/search
GET  /api/history/stats
POST /api/history/qa
```

## Environment Variables

### Old Setup

```env
# YouTube project
GOOGLE_APPLICATION_CREDENTIALS=./gcloud-credentials.json
GOOGLE_CLOUD_PROJECT=shaped-strata-481022-s5
ELEVENLABS_API_KEY=sk_4fd0eb...
GEMINI_API_KEY=AIzaSyA...
PORT=8000

# Meeting project
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
GOOGLE_CLOUD_PROJECT=polyglot-hackathon-480620
ELEVENLABS_API_KEY=sk_4b4dd...
GEMINI_API_KEY=AIzaSyA...
PORT=8080
```

### New Setup

```env
# Single unified .env
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
GOOGLE_CLOUD_PROJECT=polyglot-hackathon-480620
ELEVENLABS_API_KEY=sk_4b4dd...
GEMINI_API_KEY=AIzaSyA...
PORT=8080
FRONTEND_URL=http://localhost:3000
```

## Code Migration Examples

### Example 1: YouTube Service

**Old (Python)**:
```python
class YouTubeService:
    def get_transcript(self, video_id: str) -> List[Dict]:
        transcript = self.api.fetch(video_id, languages=['en'])
        return self._combine_into_sentences(transcript)
```

**New (Node.js)**:
```javascript
class YouTubeService {
  async getTranscript(videoId) {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return this._combineIntoSentences(transcript);
  }
}
```

### Example 2: Gemini Q&A

**Old (Python)**:
```python
def answer_question(self, question, transcript, language):
    prompt = f"Answer based on: {transcript}\nQuestion: {question}"
    response = self.model.generate_content(prompt)
    return response.text
```

**New (Node.js + History)**:
```javascript
async answerWithHistory(question, allTranscripts, language) {
  // Can now query across ALL user history, not just one video
  const context = this.buildContextFromAllSessions(allTranscripts);
  const prompt = `Answer based on: ${context}\nQuestion: ${question}`;
  const result = await this.model.generateContent(prompt);
  return result.response.text();
}
```

## Data Models

### Sessions Table (New)
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('youtube', 'meeting')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    metadata TEXT,  -- JSON: video_id, room_code, etc.
    title TEXT,
    language TEXT
);
```

### Transcripts Table (New)
```sql
CREATE TABLE transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    original_text TEXT NOT NULL,
    original_language TEXT,
    translated_text TEXT,
    target_language TEXT,
    speaker_id TEXT,
    speaker_name TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### Q&A History Table (New)
```sql
CREATE TABLE qa_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    context_type TEXT,  -- 'session', 'all_history', 'general'
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

## User ID Management

### Old
```
No user tracking
```

### New
```javascript
// Browser-based UUID in localStorage
export function getUserId(): string {
  let userId = localStorage.getItem('talkbridge_user_id');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('talkbridge_user_id', userId);
  }
  return userId;
}
```

## Deployment Changes

### Old
```
# Two separate deployments
YouTube: Vercel (frontend) + Python server
Meeting: Vercel (frontend) + Node server
```

### New
```
# Single unified deployment
Option 1: GCP App Engine (both frontend + backend)
Option 2: Vercel (frontend) + Railway (backend)
Option 3: Docker Compose (both)
```

## Benefits of Migration

### 1. User Experience
- ✅ Single app instead of two
- ✅ Unified history
- ✅ Consistent UI/UX
- ✅ Easier to remember and use

### 2. Development
- ✅ Single codebase
- ✅ Shared components
- ✅ One runtime (Node.js)
- ✅ Better code organization

### 3. Features
- ✅ Cross-feature Q&A
- ✅ Complete activity history
- ✅ Search across everything
- ✅ Usage statistics

### 4. Deployment
- ✅ One deployment
- ✅ Easier to maintain
- ✅ Lower costs
- ✅ Simpler CI/CD

## What Stayed the Same

- ✅ All original features preserved
- ✅ Same API keys and services
- ✅ Same translation quality
- ✅ Same voice models
- ✅ Same languages supported

## What Was Improved

- ✅ Better code organization
- ✅ TypeScript for type safety
- ✅ Modern React patterns
- ✅ Persistent data storage
- ✅ Better error handling
- ✅ Cleaner separation of concerns

## Backwards Compatibility

The new TalkBridge maintains all functionality from both original projects. No features were removed, only enhanced and unified.

## Migration Checklist

If you want to move data from old projects:

- [ ] Export any important session data (if applicable)
- [ ] Copy GCP credentials to new project
- [ ] Copy API keys to new .env
- [ ] Test YouTube translation
- [ ] Test meeting translation
- [ ] Verify history tracking works

---

**Result**: Two separate apps → One powerful unified platform with shared history and cross-feature intelligence!
