# 🌉 TalkBridge - Universal Translation Platform

A unified translation platform that combines YouTube video translation and real-time multilingual meeting capabilities.

## ✨ Features

### 🎥 YouTube Translation
- Real-time video transcript extraction
- Multi-language translation
- Voice-powered Q&A about video content
- Gender-aware text-to-speech
- Picture-in-Picture mode
- Session history tracking

### 🎤 Live Meeting Translation
- Multi-participant real-time translation
- Room-based conversations
- Personal mode (1-on-1 translation)
- Voice recognition and synthesis
- Agent Q&A about meeting context
- Automatic conversation history

### 📚 Unified History
- Search across all sessions (YouTube + Meetings)
- Timeline view of all translation activities
- Q&A history with context
- Session replay capability
- Export functionality

## 🏗️ Architecture

```
TalkBridge-unified/
├── backend/                 # Node.js + Express + WebSocket Server
│   ├── server.js           # Main server with WebSocket support
│   ├── database/           # SQLite database layer
│   ├── services/           # Business logic services
│   │   ├── youtube.service.js
│   │   ├── gemini.service.js
│   │   ├── speech.service.js
│   │   ├── tts.service.js
│   │   └── history.service.js
│   └── routes/             # REST API routes
│       ├── youtube.routes.js
│       └── history.routes.js
│
└── frontend/               # Next.js 15 + React 19 + Tailwind CSS
    ├── app/               # Next.js App Router
    │   ├── page.tsx      # Landing page
    │   ├── youtube/      # YouTube translator UI
    │   ├── meeting/      # Meeting translator UI
    │   └── history/      # History timeline
    ├── components/        # Reusable React components
    └── lib/              # Utilities and API client
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Real-time**: WebSocket (ws)
- **Database**: SQLite (sql.js)
- **APIs**:
  - Google Cloud Speech-to-Text
  - Google Cloud Translation
  - Google Gemini AI (gemini-2.0-flash-exp)
  - ElevenLabs Text-to-Speech
  - YouTube Transcript API

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **HTTP Client**: Axios

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- Node.js 18+ (check with `node --version`)
- npm 9+ (check with `npm --version`)

You'll also need API keys for:
1. **Google Cloud Platform** (for Speech, Translation, and credentials)
2. **Google Gemini AI** (for Q&A and translation)
3. **ElevenLabs** (for Text-to-Speech)

## 🚀 Getting Started

### 1. Clone or Navigate to the Project

```bash
cd TalkBridge-unified
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Edit `.env` with your credentials:
```env
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
ELEVENLABS_API_KEY=your-elevenlabs-api-key
GEMINI_API_KEY=your-gemini-api-key
PORT=8080
FRONTEND_URL=http://localhost:3000
```

Add your GCP credentials JSON file as `backend/gcp-credentials.json`

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local
echo "NEXT_PUBLIC_WS_URL=localhost:8080" >> .env.local
```

### 4. Run the Application

Open two terminals:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- WebSocket: ws://localhost:8080

## 📖 Usage Guide

### YouTube Translation

1. Click "YouTube Translator" on the home page
2. Paste a YouTube video URL
3. Select your target language
4. Watch the video with real-time translation
5. Use voice Q&A to ask questions about the video
6. All sessions are automatically saved to history

### Live Meeting Translation

1. Click "Live Meeting Translation" on the home page
2. **Create Room**: Enter your name and language, click "Create Room"
3. **Join Room**: Enter the room code shared by the creator
4. Click the microphone button to speak
5. Your speech is automatically translated for all participants
6. Use "Ask Agent" to query conversation history
7. Meetings are automatically saved

### History

1. Click "History" in the top navigation
2. View all your YouTube and Meeting sessions
3. Search across all transcripts
4. Filter by session type
5. Click any session to view details
6. Ask questions across all your history

## 🔑 API Keys Setup

### Google Cloud Platform

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - Cloud Speech-to-Text API
   - Cloud Translation API
   - Cloud Text-to-Speech API
4. Create a service account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Grant roles: Speech Admin, Translation Admin
   - Create JSON key → Download as `gcp-credentials.json`

### Google Gemini AI

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key"
3. Create new API key
4. Copy the key to your `.env` file

### ElevenLabs

1. Sign up at [ElevenLabs](https://elevenlabs.io/)
2. Go to Profile → API Key
3. Copy your API key to `.env`

## 🌐 Deployment

### GCP App Engine (Recommended Free Tier)

1. Install Google Cloud SDK
2. Configure app.yaml files for frontend and backend
3. Deploy:
```bash
gcloud app deploy backend/app.yaml
gcloud app deploy frontend/app.yaml
```

### Alternative: Docker

```bash
# Build backend
docker build -t talkbridge-backend ./backend

# Build frontend
docker build -t talkbridge-frontend ./frontend

# Run with docker-compose
docker-compose up
```

## 🗂️ Database Schema

The application uses SQLite with the following tables:

- **sessions**: Stores YouTube and Meeting sessions
- **transcripts**: All translated text from both session types
- **qa_history**: Questions and answers with full context

Database automatically initializes on first run.

## 🎨 UI/UX Features

- Dark mode by default (modern startup aesthetic)
- Smooth animations and transitions
- Glass morphism effects
- Responsive design (mobile + desktop)
- Real-time status updates
- Loading states and error handling

## 🐛 Troubleshooting

### Backend won't start
- Check if port 8080 is available
- Verify all environment variables are set
- Ensure GCP credentials file exists

### Frontend can't connect to backend
- Verify backend is running on port 8080
- Check NEXT_PUBLIC_API_URL in .env.local
- Check browser console for CORS errors

### Speech recognition not working
- Verify GCP credentials are valid
- Check microphone permissions in browser
- Ensure HTTPS is used (required for mic access)

### Database errors
- Delete `backend/database/talkbridge.db` and restart
- Check write permissions in backend/database directory

## 📝 Development

### Backend Development

```bash
cd backend
npm run dev  # Auto-restart on file changes
```

### Frontend Development

```bash
cd frontend
npm run dev  # Hot reload enabled
```

### Build for Production

```bash
# Backend
cd backend
npm start

# Frontend
cd frontend
npm run build
npm start
```

## 🤝 Contributing

This is a hackathon/demo project. Feel free to fork and modify!

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🙏 Acknowledgments

- Google Cloud Platform for Speech and Translation APIs
- Google Gemini AI for intelligent Q&A
- ElevenLabs for high-quality text-to-speech
- Next.js and React teams for excellent frameworks

## 📧 Support

For issues or questions, please check the troubleshooting section above.

---

**Built with ❤️ for breaking language barriers**
